#!/bin/bash
# Editor 保存往返测试：模拟"粘贴 → 保存 → 刷新 → 内容保留"的 API 层
# 这是 HANDOFF-editor-bugfix 的回归测试
set -e
BASE=${BASE:-http://localhost:3000}

PASS=0
FAIL=0
ok() { echo "  PASS  $1"; PASS=$((PASS+1)); }
ng() { echo "  FAIL  $1"; echo "        $2"; FAIL=$((FAIL+1)); }

extract_field() {
  echo "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | cut -d'"' -f4
}

echo "================================"
echo "Editor save→restore 回归测试"
echo "================================"

echo ""
echo "[1] POST /api/pages (新建测试页)"
RESP=$(curl -s -X POST $BASE/api/pages \
  -H 'Content-Type: application/json' \
  -d '{"title":"editor-bugfix-regression"}')
PAGE_ID=$(extract_field "$RESP" id)
[ -n "$PAGE_ID" ] && ok "create page" || ng "create page" "$RESP"
echo "    pageId=$PAGE_ID"

echo ""
echo "[2] 初次 GET blocks (应为空数组)"
GET1=$(curl -s $BASE/api/pages/$PAGE_ID/blocks)
COUNT1=$(echo "$GET1" | grep -o '"id":"[a-f0-9-]\{36\}"' | wc -l)
[ "$COUNT1" = "0" ] && ok "empty initial GET (count=$COUNT1)" \
  || ng "empty initial GET" "got $COUNT1 blocks"

echo ""
echo "[3] PUT 3 个块（模拟粘贴 Markdown 后的内容）"
PUT_RESP=$(curl -s -X PUT $BASE/api/pages/$PAGE_ID/blocks \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
    {"type":"heading","order":0,"content":{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"复制的标题"}]}},
    {"type":"paragraph","order":1,"content":{"type":"paragraph","content":[{"type":"text","text":"这是粘贴的第一段。"}]}},
    {"type":"paragraph","order":2,"content":{"type":"paragraph","content":[{"type":"text","text":"这是粘贴的第二段。"}]}}
  ]}')
echo "$PUT_RESP" | head -c 400; echo
PUT_COUNT=$(echo "$PUT_RESP" | grep -o '"id":"[a-f0-9-]\{36\}"' | wc -l)
[ "$PUT_COUNT" = "3" ] && ok "PUT returned 3 blocks" \
  || ng "PUT returned 3 blocks" "got $PUT_COUNT ids"

echo ""
echo "[4] GET blocks (模拟刷新页面后拉取)"
GET2=$(curl -s $BASE/api/pages/$PAGE_ID/blocks)
GET2_COUNT=$(echo "$GET2" | grep -o '"id":"[a-f0-9-]\{36\}"' | wc -l)
[ "$GET2_COUNT" = "3" ] && ok "GET round-trip count=3" \
  || ng "GET round-trip count=3" "got $GET2_COUNT"

echo ""
echo "[5] 内容验证：标题和段落文字应一致"
echo "$GET2" | grep -q '复制的标题' && ok "heading text preserved" \
  || ng "heading text preserved" "missing 复制的标题"
echo "$GET2" | grep -q '这是粘贴的第一段' && ok "paragraph 1 text preserved" \
  || ng "paragraph 1 text preserved" "missing 第一段"
echo "$GET2" | grep -q '这是粘贴的第二段' && ok "paragraph 2 text preserved" \
  || ng "paragraph 2 text preserved" "missing 第二段"

echo ""
echo "[6] 顺序验证：复制的标题应排在最前"
FIRST_TEXT=$(echo "$GET2" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for b in data['blocks']:
    if b['type'] == 'heading':
        text = ''.join(c.get('text','') for c in b['content'].get('content',[]))
        print(text)
        break
")
[ "$FIRST_TEXT" = "复制的标题" ] && ok "order preserved (heading first)" \
  || ng "order preserved" "first heading was: $FIRST_TEXT"

echo ""
echo "[7] 再次 PUT（覆盖为不同内容，模拟再次输入）"
PUT2_RESP=$(curl -s -X PUT $BASE/api/pages/$PAGE_ID/blocks \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
    {"type":"paragraph","order":0,"content":{"type":"paragraph","content":[{"type":"text","text":"覆盖后的内容"}]}}
  ]}')
PUT2_COUNT=$(echo "$PUT2_RESP" | grep -o '"id":"[a-f0-9-]\{36\}"' | wc -l)
[ "$PUT2_COUNT" = "1" ] && ok "second PUT replaced to 1 block" \
  || ng "second PUT replaced to 1 block" "got $PUT2_COUNT"

GET3=$(curl -s $BASE/api/pages/$PAGE_ID/blocks)
GET3_COUNT=$(echo "$GET3" | grep -o '"id":"[a-f0-9-]\{36\}"' | wc -l)
[ "$GET3_COUNT" = "1" ] && ok "after re-PUT, GET=1 block" \
  || ng "after re-PUT, GET=1 block" "got $GET3_COUNT"
echo "$GET3" | grep -q '覆盖后的内容' && ok "new content visible after re-PUT" \
  || ng "new content visible after re-PUT" "missing 覆盖后的内容"

echo ""
echo "[8] 清理：DELETE 测试页"
DEL_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/pages/$PAGE_ID)
[ "$DEL_STATUS" = "200" ] && ok "cleanup delete" \
  || ng "cleanup delete" "status=$DEL_STATUS"

echo ""
echo "================================"
echo "PASS: $PASS  FAIL: $FAIL"
echo "================================"
[ "$FAIL" = "0" ]