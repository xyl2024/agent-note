#!/bin/bash
# Session 2.4 搜索端到端测试
set -e
BASE=http://localhost:3000
echo "================================"
echo "Session 2.4 搜索测试"
echo "================================"

# 准备：建一个页面 + 几个块
echo ""
echo "0) 准备：建一个测试页面"
PAGE=$(curl -s -X POST $BASE/api/pages \
  -H 'Content-Type: application/json' \
  -d '{"title":"搜索测试页面"}')
PAGE_ID=$(echo "$PAGE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "→ page id: $PAGE_ID"

curl -s -X PUT $BASE/api/pages/$PAGE_ID/blocks \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
    {"type":"heading","content":{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Hello World 搜索测试"}]}},
    {"type":"paragraph","content":{"type":"paragraph","content":[{"type":"text","text":"这是一段中文测试文本，包含关键词 FooBar 和中文关键词 苹果。"}]}},
    {"type":"paragraph","content":{"type":"paragraph","content":[{"type":"text","text":"另一段提到 FTS5 索引的文字。"}]}}
  ]}' > /dev/null
echo "→ 3 个块已写入"

# 等防抖/写库（PUT 是同步的，这里 sleep 一下保证 FTS5 写入完成）
sleep 0.3

echo ""
echo "1) GET /api/search?q=苹果 → 应命中段落（含 <mark>）"
curl -s "$BASE/api/search?q=%E8%8B%B9%E6%9E%9C" | head -c 800
echo ""

echo ""
echo "2) GET /api/search?q=Hello → 应命中 heading"
curl -s "$BASE/api/search?q=Hello" | head -c 800
echo ""

echo ""
echo "3) GET /api/search?q=FTS5 → 应命中段落"
curl -s "$BASE/api/search?q=FTS5" | head -c 800
echo ""

echo ""
echo "4) GET /api/search?q=搜索测试页面 → 应同时命中 pages 和 blocks"
curl -s "$BASE/api/search?q=%E6%90%9C%E7%B4%A2%E6%B5%8B%E8%AF%95%E9%A1%B5%E9%9D%A2" | head -c 800
echo ""

echo ""
echo "5) GET /api/search?q= (空 query) → 返回空"
curl -s "$BASE/api/search?q="
echo ""

echo ""
echo "6) GET /api/search?q=nonexistent_xyz_zzz → 返回空"
curl -s "$BASE/api/search?q=nonexistent_xyz_zzz"
echo ""

# 清理
echo ""
echo "7) DELETE 清理测试页面"
curl -s -X DELETE $BASE/api/pages/$PAGE_ID | head -c 200
echo ""

echo ""
echo "================================"
echo "✅ 搜索测试完成"
echo "================================"