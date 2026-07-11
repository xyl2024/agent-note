import { NextResponse } from 'next/server'
import { sql, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { pages, blocks } from '@/db/schema'

// -----------------------------------------------------------------------------
// GET /api/stats — 首页统计数据
// - totalPages / totalBlocks：用 COUNT(*) 一次拿
// - weekNewPages：近 7 天新增的根页面数（parentId IS NULL）
// - recentPages：按 updatedAt 倒序的前 N 条，用于「最近编辑」卡片
//   同时附 blockCount：在 SELECT 里用子查询一次拿，避免 N+1
// -----------------------------------------------------------------------------
export async function GET() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [totalPagesRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pages)

  const [totalBlocksRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(blocks)

  const [weekNewRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pages)
    .where(sql`${pages.parentId} IS NULL AND ${pages.createdAt} >= ${sevenDaysAgo.getTime()}`)

  const recentPages = await db
    .select({
      id: pages.id,
      title: pages.title,
      iconType: pages.iconType,
      iconValue: pages.iconValue,
      parentId: pages.parentId,
      updatedAt: pages.updatedAt,
      createdAt: pages.createdAt,
      blockCount: sql<number>`(SELECT COUNT(*) FROM blocks WHERE blocks.page_id = pages.id)`,
    })
    .from(pages)
    .orderBy(desc(pages.updatedAt))
    .limit(8)

  return NextResponse.json({
    totalPages: totalPagesRow?.n ?? 0,
    totalBlocks: totalBlocksRow?.n ?? 0,
    weekNewPages: weekNewRow?.n ?? 0,
    recentPages,
  })
}