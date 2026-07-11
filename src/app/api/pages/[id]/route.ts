import { NextResponse, type NextRequest } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { pages, ICON_TYPES, type IconType } from '@/db/schema'
import { getPageRowid, indexPageTokens } from '@/db/fts'

// -----------------------------------------------------------------------------
// GET /api/pages/[id] — 单个页面
// -----------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const row = await db.select().from(pages).where(eq(pages.id, id)).limit(1)
  if (row.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ page: row[0] })
}

// -----------------------------------------------------------------------------
// PATCH /api/pages/[id] — 更新页面（title/icon/parentId/slug）
// 附加：防止把页面 parentId 改到自己的后代上（避免循环引用）
// -----------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as {
    title?: string
    iconType?: IconType | null
    iconValue?: string | null
    parentId?: string | null
    slug?: string
  }

  const updates: Partial<typeof pages.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (body.title !== undefined) updates.title = body.title.trim() || 'Untitled'
  if (body.iconType !== undefined) {
    if (body.iconType !== null && !ICON_TYPES.includes(body.iconType)) {
      return NextResponse.json({ error: 'invalid iconType' }, { status: 400 })
    }
    updates.iconType = body.iconType
  }
  if (body.iconValue !== undefined) {
    // 限制长度防止异常输入撑爆数据库
    if (body.iconValue !== null && body.iconValue.length > 64) {
      return NextResponse.json({ error: 'iconValue too long' }, { status: 400 })
    }
    updates.iconValue = body.iconValue
  }
  if (body.parentId !== undefined) {
    if (body.parentId === id) {
      return NextResponse.json(
        { error: 'page cannot be its own parent' },
        { status: 400 },
      )
    }
    if (body.parentId) {
      // 防循环：检查目标 parentId 是否是当前页面的后代
      // 即：id 下面能不能找到 body.parentId
      const isDescendant = await isPageDescendant(id, body.parentId)
      if (isDescendant) {
        return NextResponse.json(
          { error: 'cannot move page under its own descendant' },
          { status: 400 },
        )
      }
      const parent = await db
        .select({ id: pages.id })
        .from(pages)
        .where(eq(pages.id, body.parentId))
        .limit(1)
      if (parent.length === 0) {
        return NextResponse.json({ error: 'parent not found' }, { status: 400 })
      }
    }
    updates.parentId = body.parentId
  }
  if (body.slug !== undefined) updates.slug = body.slug.trim()

  const result = await db
    .update(pages)
    .set(updates)
    .where(eq(pages.id, id))
    .returning()

  if (result.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // 同步刷新 FTS5 标题索引
  if (body.title !== undefined) {
    const rowid = getPageRowid(id)
    if (rowid != null) indexPageTokens(rowid, result[0].title)
  }

  return NextResponse.json({ page: result[0] })
}

// -----------------------------------------------------------------------------
// DELETE /api/pages/[id] — 删除页面（含所有后代）
// 用 BFS 收集整棵子树，事务内一次性删除
// -----------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  // 收集要删的 id：当前 + 所有后代
  const allIds = new Set<string>([id])
  let frontier = [id]
  while (frontier.length > 0) {
    const children = await db
      .select({ id: pages.id })
      .from(pages)
      .where(inArray(pages.parentId, frontier))
    const childIds = children.map((c) => c.id).filter((cid) => !allIds.has(cid))
    childIds.forEach((cid) => allIds.add(cid))
    frontier = childIds
  }

  const result = await db
    .delete(pages)
    .where(inArray(pages.id, Array.from(allIds)))
    .returning()

  if (result.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ deleted: result })
}

// -----------------------------------------------------------------------------
// 内部工具：检查 targetId 是否是 rootId 的后代（防循环引用）
// 从 rootId 向下 BFS，看能否到达 targetId
// -----------------------------------------------------------------------------
async function isPageDescendant(
  rootId: string,
  targetId: string,
): Promise<boolean> {
  let frontier = [rootId]
  const seen = new Set<string>([rootId])
  while (frontier.length > 0) {
    const rows = await db
      .select({ id: pages.id })
      .from(pages)
      .where(inArray(pages.parentId, frontier))
    const childIds = rows.map((r) => r.id).filter((c) => !seen.has(c))
    if (childIds.includes(targetId)) return true
    childIds.forEach((c) => seen.add(c))
    frontier = childIds
  }
  return false
}