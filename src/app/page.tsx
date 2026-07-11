import { randomUUID } from 'node:crypto'
import { asc, eq, isNull } from 'drizzle-orm'
import { AppShell } from '@/components/app-shell'
import { db } from '@/db/client'
import { pages } from '@/db/schema'

// 主页：服务器端确保至少有一个根页面（首次启动自动建欢迎页），
// 然后把页面列表交给 AppShell 客户端组件管状态。
// favicon 使用 layout.tsx 的默认（未选中具体笔记）
export default async function Home() {
  // 先找最早创建的根页面作为默认
  let rootPages = await db
    .select()
    .from(pages)
    .where(isNull(pages.parentId))
    .orderBy(asc(pages.createdAt))
    .limit(1)

  // 没有任何根页面 → 建一个欢迎页
  if (rootPages.length === 0) {
    const id = randomUUID()
    const now = new Date()
    await db.insert(pages).values({
      id,
      parentId: null,
      title: '欢迎使用 Agent Note',
      slug: id,
      iconType: 'emoji',
      iconValue: '👋',
      createdAt: now,
      updatedAt: now,
    })
    rootPages = await db.select().from(pages).where(eq(pages.id, id)).limit(1)
  }

  const allPages = await db.select().from(pages)

  return (
    <AppShell initialPages={allPages} initialPageId={rootPages[0].id} />
  )
}