import type { Metadata } from 'next'
import { sql, desc } from 'drizzle-orm'
import { AppShell } from '@/components/app-shell'
import type { HomeViewStats } from '@/components/home/home-view'
import { db } from '@/db/client'
import { pages, blocks } from '@/db/schema'
import type { Page } from '@/db/schema'

export const metadata: Metadata = {
  title: 'Agent Note',
}

// 首页数据加载放在组件外的普通函数里：
// - 组件体内直接调 Date.now() 会被 React Compiler 规则判为「不纯」
// - 抽出来后既符合规则，也顺便把 5 个查询并发起
async function loadHomeData(): Promise<{
  allPages: Page[]
  initialStats: HomeViewStats
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [allPages, [totalPagesRow], [totalBlocksRow], [weekNewRow], recentPages] =
    await Promise.all([
      db.select().from(pages),
      db.select({ n: sql<number>`count(*)` }).from(pages),
      db.select({ n: sql<number>`count(*)` }).from(blocks),
      db
        .select({ n: sql<number>`count(*)` })
        .from(pages)
        .where(
          sql`${pages.parentId} IS NULL AND ${pages.createdAt} >= ${sevenDaysAgo.getTime()}`,
        ),
      db
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
        .limit(8),
    ])

  return {
    allPages,
    initialStats: {
      totalPages: totalPagesRow?.n ?? 0,
      totalBlocks: totalBlocksRow?.n ?? 0,
      weekNewPages: weekNewRow?.n ?? 0,
      recentPages,
    },
  }
}

// 主页（/）：渲染 Notion 风格首页（HomeView），不再自动跳转到第一篇文章。
// - 不再自动创建欢迎页；已存在的欢迎页仍可通过 sidebar 访问
// - initialPageId 传 null，由 AppShell 渲染 HomeView
// - 服务端一次算出首页 stats 注入，避免首屏 loading 闪烁
export default async function Home() {
  const { allPages, initialStats } = await loadHomeData()

  return (
    <AppShell
      initialPages={allPages}
      initialPageId={null}
      initialStats={initialStats}
    />
  )
}
