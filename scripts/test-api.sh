#!/bin/bash
# Session 1.1 API 端到端测试
set -e
BASE=http://localhost:3000
echo "================================"
echo "Session 1.1 API 测试"
echo "================================"

echo ""
echo "1) POST /api/pages (创建根页面)"
PAGE1=$(curl -s -X POST $BASE/api/pages \
  -H 'Content-Type: application/json' \
  -d '{"title":"我的第一篇笔记","icon":"📝"}')
echo "$PAGE1" | head -c 500
echo ""
PAGE1_ID=$(echo "$PAGE1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "→ ID: $PAGE1_ID"

echo ""
echo "2) POST /api/pages (创建子页面)"
PAGE2=$(curl -s -X POST $BASE/api/pages \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"子页面\",\"parentId\":\"$PAGE1_ID\"}")
echo "$PAGE2" | head -c 500
echo ""
PAGE2_ID=$(echo "$PAGE2" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "→ ID: $PAGE2_ID"

echo ""
echo "3) GET /api/pages (列出所有页面)"
curl -s $BASE/api/pages | head -c 600
echo ""

echo ""
echo "4) PUT /api/pages/$PAGE1_ID/blocks (保存 4 个块)"
curl -s -X PUT $BASE/api/pages/$PAGE1_ID/blocks \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
    {"type":"heading","content":{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"标题"}]}},
    {"type":"paragraph","content":{"type":"paragraph","content":[{"type":"text","text":"这是第一段。"}]}},
    {"type":"todo","content":{"type":"todo","attrs":{"checked":false},"content":[{"type":"text","text":"待办 1"}]}},
    {"type":"codeBlock","content":{"type":"codeBlock","attrs":{"language":"js"},"content":[{"type":"text","text":"console.log(1)"}]}}
  ]}' | head -c 600
echo ""

echo ""
echo "5) GET /api/pages/$PAGE1_ID/blocks (读回)"
curl -s $BASE/api/pages/$PAGE1_ID/blocks | head -c 800
echo ""

echo ""
echo "6) PATCH /api/pages/$PAGE1_ID (改标题)"
curl -s -X PATCH $BASE/api/pages/$PAGE1_ID \
  -H 'Content-Type: application/json' \
  -d '{"title":"重命名后的标题"}' | head -c 400
echo ""

echo ""
echo "7) PATCH /api/blocks/[id] (把第一个块改成 H2)"
FIRST_BLOCK_ID=$(curl -s $BASE/api/pages/$PAGE1_ID/blocks | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "→ First block ID: $FIRST_BLOCK_ID"
curl -s -X PATCH $BASE/api/blocks/$FIRST_BLOCK_ID \
  -H 'Content-Type: application/json' \
  -d '{"type":"heading","content":{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"改成 H2"}]}}' | head -c 400
echo ""

echo ""
echo "8) DELETE /api/blocks/$FIRST_BLOCK_ID"
curl -s -X DELETE $BASE/api/blocks/$FIRST_BLOCK_ID | head -c 300
echo ""

echo ""
echo "9) DELETE /api/pages/$PAGE1_ID (级联删除)"
curl -s -X DELETE $BASE/api/pages/$PAGE1_ID | head -c 300
echo ""

echo ""
echo "10) GET /api/pages (清理后应只剩子页面，孤儿)"
curl -s $BASE/api/pages | head -c 600
echo ""

echo ""
echo "================================"
echo "✅ 全部测试完成"
echo "================================"