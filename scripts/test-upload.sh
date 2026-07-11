#!/usr/bin/env bash
# 测试图片上传 / 读取的端到端流程
# 跑法：bash scripts/test-upload.sh

set -e
BASE=${BASE:-http://localhost:3000}

echo "=== 0. 准备：建一个 PNG 测试图片 + 拿一个 pageId ==="
# 1x1 透明 PNG (base64)
PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
PNG_FILE=$(mktemp --suffix=.png)
echo "$PNG_B64" | base64 -d > "$PNG_FILE"
echo "  测试 PNG: $PNG_FILE ($(wc -c < "$PNG_FILE") bytes)"

PAGE_ID=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"title":"upload test page"}' "$BASE/api/pages" \
  | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
if [ -z "$PAGE_ID" ]; then
  echo "FAIL: 没拿到 pageId"
  exit 1
fi
echo "  PAGE_ID: $PAGE_ID"

echo ""
echo "=== 1. POST /api/upload ==="
RESP=$(curl -s -X POST -F "file=@$PNG_FILE" -F "pageId=$PAGE_ID" "$BASE/api/upload")
echo "  响应: $RESP"
ASSET_ID=$(echo "$RESP" | grep -oE '"assetId":"[^"]+"' | cut -d'"' -f4)
URL=$(echo "$RESP" | grep -oE '"url":"[^"]+"' | cut -d'"' -f4)
MIME=$(echo "$RESP" | grep -oE '"mime":"[^"]+"' | cut -d'"' -f4)
SIZE=$(echo "$RESP" | grep -oE '"size":[0-9]+' | cut -d':' -f2)
echo "  assetId=$ASSET_ID"
echo "  url=$URL"
echo "  mime=$MIME size=$SIZE"

if [ -z "$ASSET_ID" ] || [ "$MIME" != "image/png" ]; then
  echo "FAIL: 上传响应缺字段"
  rm -f "$PNG_FILE"
  exit 1
fi

echo ""
echo "=== 2. GET /api/files/\$ASSET_ID ==="
DOWNLOADED=$(mktemp)
HTTP_CODE=$(curl -s -o "$DOWNLOADED" -w "%{http_code}" "$BASE$URL")
DOWNLOADED_SIZE=$(wc -c < "$DOWNLOADED")
ORIGINAL_SIZE=$(wc -c < "$PNG_FILE")
echo "  HTTP $HTTP_CODE, $DOWNLOADED_SIZE bytes (原始 $ORIGINAL_SIZE bytes)"

if [ "$HTTP_CODE" != "200" ] || [ "$DOWNLOADED_SIZE" != "$ORIGINAL_SIZE" ]; then
  echo "FAIL: 下载内容不一致"
  rm -f "$PNG_FILE" "$DOWNLOADED"
  exit 1
fi

echo ""
echo "=== 3. 错误路径：非 image 类型 → 400 ==="
TEXT_FILE=$(mktemp)
echo "hello" > "$TEXT_FILE"
ERR=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -F "file=@$TEXT_FILE;type=text/plain" -F "pageId=$PAGE_ID" "$BASE/api/upload")
echo "  HTTP $ERR (期望 400)"
if [ "$ERR" != "400" ]; then
  echo "FAIL: 非 image 类型应该返回 400"
  rm -f "$PNG_FILE" "$DOWNLOADED" "$TEXT_FILE"
  exit 1
fi

echo ""
echo "=== 4. 错误路径：不存在的 asset id → 404 ==="
ERR=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/files/00000000-0000-0000-0000-000000000000")
echo "  HTTP $ERR (期望 404)"
if [ "$ERR" != "404" ]; then
  echo "FAIL: 不存在的 asset id 应该返回 404"
  rm -f "$PNG_FILE" "$DOWNLOADED" "$TEXT_FILE"
  exit 1
fi

echo ""
echo "=== 5. 错误路径：缺 pageId → 400 ==="
ERR=$(curl -s -o /dev/null -w "%{http_code}" -X POST -F "file=@$PNG_FILE" "$BASE/api/upload")
echo "  HTTP $ERR (期望 400)"
if [ "$ERR" != "400" ]; then
  echo "FAIL: 缺 pageId 应该返回 400"
  rm -f "$PNG_FILE" "$DOWNLOADED" "$TEXT_FILE"
  exit 1
fi

echo ""
echo "=== 清理 ==="
# 删测试页（级联删 assets + blocks）
curl -s -X DELETE "$BASE/api/pages/$PAGE_ID" > /dev/null
rm -f "$PNG_FILE" "$DOWNLOADED" "$TEXT_FILE"

echo ""
echo "✅ 全部测试通过"
