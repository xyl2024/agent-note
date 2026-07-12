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

# ---------------------------------------------------------------------------
# Session: 表格块保存 / 读回
# ---------------------------------------------------------------------------
echo ""
echo "================================"
echo "Session: 表格块 (type='table')"
echo "================================"

echo ""
echo "11) POST /api/pages (为表格测试建一个新页面)"
PAGE_TABLE=$(curl -s -X POST $BASE/api/pages \
  -H 'Content-Type: application/json' \
  -d '{"title":"表格测试页"}')
PAGE_TABLE_ID=$(echo "$PAGE_TABLE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "→ PAGE_TABLE_ID: $PAGE_TABLE_ID"

echo ""
echo "12) PUT /api/pages/$PAGE_TABLE_ID/blocks (保存一个 2×2 表格块)"
TABLE_PUT_RESP=$(curl -s -X PUT $BASE/api/pages/$PAGE_TABLE_ID/blocks \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
    {"type":"table","content":{"type":"table","content":[
      {"type":"tableRow","content":[
        {"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"h1"}]}]},
        {"type":"tableHeader","content":[{"type":"paragraph","content":[{"type":"text","text":"h2"}]}]}
      ]},
      {"type":"tableRow","content":[
        {"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]}]},
        {"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"b"}]}]}
      ]}
    ]}}
  ]}')
echo "$TABLE_PUT_RESP" | head -c 800
echo ""

echo ""
echo "13) GET /api/pages/$PAGE_TABLE_ID/blocks (读回表格块，校验 type='table')"
TABLE_GET_RESP=$(curl -s $BASE/api/pages/$PAGE_TABLE_ID/blocks)
echo "$TABLE_GET_RESP" | head -c 800
echo ""

# 简单 grep 校验：返回里必须含 type:"table" 和 tableHeader / tableCell
if echo "$TABLE_GET_RESP" | grep -q '"type":"table"'; then
  echo "✅ 读回校验: 存在 type=\"table\" 块"
else
  echo "❌ 读回校验失败: 未找到 type=\"table\""
  exit 1
fi
if echo "$TABLE_GET_RESP" | grep -q '"type":"tableHeader"'; then
  echo "✅ 读回校验: 存在 tableHeader 节点"
else
  echo "❌ 读回校验失败: 未找到 tableHeader"
  exit 1
fi
if echo "$TABLE_GET_RESP" | grep -q '"type":"tableCell"'; then
  echo "✅ 读回校验: 存在 tableCell 节点"
else
  echo "❌ 读回校验失败: 未找到 tableCell"
  exit 1
fi

echo ""
echo "14) DELETE /api/pages/$PAGE_TABLE_ID (清理表格测试页)"
curl -s -X DELETE $BASE/api/pages/$PAGE_TABLE_ID | head -c 300
echo ""

echo ""
echo "================================"
echo "✅ 全部测试完成"
echo "================================"