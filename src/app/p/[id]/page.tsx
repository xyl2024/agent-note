import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { AppShell } from '@/components/app-shell'
import { db } from '@/db/client'
import { pages } from '@/db/schema'

// -----------------------------------------------------------------------------
// /p/[id] — 单页面路由（SSR）
// - 校验页面存在，不存在 → notFound()（Next.js 自动 404 页面）
// - 拉全部页面给 Sidebar 建树
// - 交给 AppShell，由客户端的 useParams / useRouter 接管后续导航
// -----------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const target = await db
    .select({ title: pages.title })
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1)
  const page = target[0]
  return {
    title: page?.title ? `${page.title} · Agent Note` : 'Agent Note',
    icons: {
      icon: [`/api/favicon/${id}`],
    },
  }
}

export default async function PageById({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const target = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1)
  if (target.length === 0) notFound()

  const allPages = await db.select().from(pages)

  return <AppShell initialPages={allPages} initialPageId={id} />
}
