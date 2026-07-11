import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { asc, eq, isNull, and } from 'drizzle-orm'
import { db } from '@/db/client'
import { blocks, type NewBlock } from '@/db/schema'
import { getBlockRowid, indexBlockTokens } from '@/db/fts'
import { extractTextFromNode } from '@/lib/tiptap/extract-text'

// -----------------------------------------------------------------------------
// GET /api/pages/[id]/blocks — 获取页面所有顶层块（按 order 升序）
// -----------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const rows = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.pageId, id), isNull(blocks.parentBlockId)))
    .orderBy(asc(blocks.order))

  return NextResponse.json({ blocks: rows })
}

// -----------------------------------------------------------------------------
// PUT /api/pages/[id]/blocks — 替换页面所有顶层块
// Body: { blocks: Array<{ id?, type, content, parentBlockId?, order? }> }
// 适用于 Tiptap 自动保存：客户端每次发整个文档的顶层块过来
//
// 同时同步刷新 FTS5 tokens（triggers 已建空行，这里只填内容）
// -----------------------------------------------------------------------------
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: pageId } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as {
    blocks?: Array<{
      id?: string
      type: string
      content: NewBlock['content']
      parentBlockId?: string | null
      order?: number
    }>
  }

  if (!Array.isArray(body.blocks)) {
    return NextResponse.json({ error: 'blocks must be an array' }, { status: 400 })
  }

  const now = new Date()

  // 事务：先删除所有旧块，再插入新块（保持顺序和内容一致）
  // SQLite better-sqlite3 用 db.transaction 包装
  const result = db.transaction((tx) => {
    tx.delete(blocks).where(
      and(eq(blocks.pageId, pageId), isNull(blocks.parentBlockId)),
    ).run()

    if (body.blocks!.length === 0) return []

    const inserts: NewBlock[] = body.blocks!.map((b, idx) => ({
      id: b.id ?? randomUUID(),
      pageId,
      parentBlockId: b.parentBlockId ?? null,
      order: b.order ?? idx,
      type: b.type,
      content: b.content,
      createdAt: now,
      updatedAt: now,
    }))
    return tx.insert(blocks).values(inserts).returning().all()
  })

  // 同步索引 FTS5：每个新块用 rowid 反查（trigger 已建空行），写 tokens
  // 事务外执行：indexBlockTokens 走的是 sqlite 直接连接，避免和 Drizzle 事务嵌套
  for (const b of result) {
    const rowid = getBlockRowid(b.id)
    if (rowid == null) continue
    const text = extractTextFromNode(b.content)
    indexBlockTokens(rowid, text)
  }

  return NextResponse.json({ blocks: result })
}