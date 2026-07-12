import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { desc, eq, like } from 'drizzle-orm'
import { db } from '@/db/client'
import { pages, ICON_TYPES, type NewPage, type IconType } from '@/db/schema'
import { getPageRowid, indexPageTokens } from '@/db/fts'

// -----------------------------------------------------------------------------
// GET /api/pages — 列出所有页面（按更新时间倒序，附带 parentId 用于构建树）
// 可选 query 参数：
//   - title=<keyword> 模糊匹配（双向链接 suggestion 用）
// -----------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get('title')?.trim() ?? ''

  // 模糊搜索：有 title 参数就过滤；空字符串视为列出全部
  // 注：返回全字段（不带白名单），与 SSR 的 db.select().from(pages) 一致，
  // 避免客户端 refreshPages() 后丢失 isFavorite/favoritedAt 等字段。
  // 搜索分支只需要 title/icon 等展示字段，但全字段代价可忽略，统一更安全。
  if (title) {
  const rows = await db
    .select()
    .from(pages)
    .where(like(pages.title, `%${title}%`))
    .orderBy(desc(pages.updatedAt))
    .limit(20)
  return NextResponse.json({ pages: rows })
}

const rows = await db
    .select()
    .from(pages)
    .orderBy(desc(pages.updatedAt))

  return NextResponse.json({ pages: rows })
}

// -----------------------------------------------------------------------------
// POST /api/pages — 创建页面
// Body: { title?, parentId?, icon?, slug? }
// 同时把 title 写入 FTS5（用于搜索命中标题）
// -----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string
    parentId?: string | null
    iconType?: IconType | null
    iconValue?: string | null
    slug?: string
  }

  // 校验 parentId（如果给的话）
  if (body.parentId) {
    const parent = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.id, body.parentId))
      .limit(1)
    if (parent.length === 0) {
      return NextResponse.json({ error: 'parent not found' }, { status: 400 })
    }
  }

  // 校验 iconType
  if (body.iconType != null && !ICON_TYPES.includes(body.iconType)) {
    return NextResponse.json({ error: 'invalid iconType' }, { status: 400 })
  }

  const id = randomUUID()
  const now = new Date()
  const title = body.title?.trim() || 'Untitled'
  const newPage: NewPage = {
    id,
    parentId: body.parentId ?? null,
    title,
    slug: body.slug?.trim() || id,
    iconType: body.iconType ?? 'lucide',
    iconValue: body.iconValue ?? 'FileText',
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(pages).values(newPage)

  // 写 FTS5（trigger 已建空行）
  const rowid = getPageRowid(id)
  if (rowid != null) indexPageTokens(rowid, title)

  return NextResponse.json({ page: newPage }, { status: 201 })
}