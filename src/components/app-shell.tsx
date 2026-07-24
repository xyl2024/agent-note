'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Page, IconType } from '@/db/schema'
import { Sidebar } from '@/components/sidebar/sidebar'
import { Editor } from '@/components/editor/editor'
import { MiniMap } from '@/components/outline/minimap'
import { SearchDialog } from '@/components/search/search-dialog'
import { HomeView, type HomeViewStats } from '@/components/home/home-view'
import type { HeadingItem } from '@/lib/tiptap/heading-anchor'

// -----------------------------------------------------------------------------
// AppShell: 三栏布局的客户端容器
// - currentPageId 完全由 URL 驱动 (/p/[id], 没有则 fallback 到 initialPageId)
//   因此刷新 / 前进后退 / 分享链接 / 浏览器历史 都能正确工作
// - 内部不再持有 currentPageId 状态, 所有变更通过 router.push / router.replace
// - 当 currentPageId 为 null（访问 /）时，中间区域渲染 HomeView（首页）
// - 当前页被删除 -> 自动 redirect 到 /
// -----------------------------------------------------------------------------
type Props = {
  initialPages: Page[]
  // null 表示「首页」(/)，由 AppShell 渲染 HomeView
  initialPageId: string | null
  initialStats?: HomeViewStats
}

// initialStats 缺省占位（/p/[id] 路由下不传 stats，用它兜底，避免首页外渲染真实数据）
const defaultStats: HomeViewStats = {
  totalPages: 0,
  totalBlocks: 0,
  weekNewPages: 0,
  recentPages: [],
}

export function AppShell({ initialPages, initialPageId, initialStats }: Props) {
  const router = useRouter()
  const params = useParams<{ id?: string }>()
  // URL 即真相: /p/[id] -> params.id; / -> null (首页)
  // 注意：initialPageId 仅作为 SSR fallback，客户端 navigation 后完全由 URL 驱动
  const currentPageId =
    (params?.id as string | undefined) ?? initialPageId ?? null

  const [pages, setPages] = useState<Page[]>(initialPages)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  // 侧栏折叠状态：SSR / 首次渲染固定展开，避免 hydration mismatch；
  // mounted 后再从 localStorage 恢复用户偏好（与 theme-toggle 的 mounted 模式一致）
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 同 theme-toggle.tsx:SSR 兼容必须延后到 mounted 后读 localStorage
      setSidebarCollapsed(true)
    }
  }, [])
  const setSidebarCollapsedAction = useCallback((v: boolean) => {
    setSidebarCollapsed(v)
    localStorage.setItem('sidebar-collapsed', String(v))
  }, [])
  const editorScrollRef = useRef<HTMLElement | null>(null)

  // 重新拉取页面列表(任何 mutation 后调用)
  const refreshPages = useCallback(async () => {
    const res = await fetch('/api/pages')
    if (!res.ok) return
    const data = (await res.json()) as { pages: Page[] }
    setPages(data.pages)
  }, [])

  // 全局 Cmd+K / Ctrl+K 快捷键：切换搜索弹窗（首页 / 编辑页统一在此监听）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 选中页面: 直接 push 新 URL
  const handleSelectAction = useCallback(
    (id: string) => {
      router.push(`/p/${id}`)
    },
    [router],
  )

  // 标题变化: PATCH + 刷新(让 Sidebar 同步显示新标题)
  const handleTitleChangeAction = useCallback(
    async (newTitle: string) => {
      const trimmed = newTitle.trim() || 'Untitled'
      await fetch(`/api/pages/${currentPageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      })
      await refreshPages()
    },
    [currentPageId, refreshPages],
  )

  // icon 变化: 乐观更新 + PATCH（让 Sidebar 同步显示新 icon）
  const handleIconChangeAction = useCallback(
    async (iconType: IconType | null, iconValue: string | null) => {
      // 乐观更新本地 state（让 Sidebar 立刻反映新 icon）
      setPages((prev) =>
        prev.map((p) =>
          p.id === currentPageId ? { ...p, iconType, iconValue } : p,
        ),
      )
      try {
        const res = await fetch(`/api/pages/${currentPageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iconType, iconValue }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (e) {
        console.error('icon change failed', e)
        // 失败：重新拉取，恢复真实状态
        await refreshPages()
      }
    },
    [currentPageId, refreshPages],
  )

  // 收藏 toggle: 乐观更新 + PATCH（与 icon 同模式）
  // 按 pageId 操作（不依赖 currentPageId，因为侧栏任何行都能触发）
  const toggleFavoriteAction = useCallback(
    async (pageId: string) => {
      const current = pages.find((p) => p.id === pageId)
      if (!current) return
      const nextFavorite = !current.isFavorite
      // 乐观更新：立刻在 Sidebar 反映新的 ★ 状态
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? {
                ...p,
                isFavorite: nextFavorite,
                favoritedAt: nextFavorite ? new Date() : null,
              }
            : p,
        ),
      )
      try {
        const res = await fetch(`/api/pages/${pageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isFavorite: nextFavorite }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } catch (e) {
        console.error('toggle favorite failed', e)
        // 失败：重新拉取，恢复真实状态
        await refreshPages()
      }
    },
    [pages, refreshPages],
  )

  // 创建页面(Sidebar / HomeView / 外部触发都会用)
  const createPageAction = useCallback(
    async (title: string): Promise<Page> => {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error('创建页面失败')
      const { page } = (await res.json()) as { page: Page }
      await refreshPages()
      return page
    },
    [refreshPages],
  )

  // 当前页面被删除 / 不在 DB 中 -> 回到根
  // (SSR 兜底在 /p/[id] 已 404; 这里处理客户端 navigation 过程中
  //  当前 id 消失的情况, 例如用户在 A 页时把 A 删了 / 列表刷新后丢失)
  // 首页(currentPageId === null)不需要 fallback，直接跳过
  useEffect(() => {
    if (currentPageId === null) return
    if (pages.length === 0) return
    const exists = pages.some((p) => p.id === currentPageId)
    if (!exists) {
      router.replace('/')
    }
  }, [pages, currentPageId, router])

  // 当前页面：首页时为 null；否则按 id 查找（找不到则为 undefined，走过渡态兜底）
  const currentPage = currentPageId
    ? pages.find((p) => p.id === currentPageId)
    : null

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        pages={pages}
        currentPageId={currentPageId}
        onSelectAction={handleSelectAction}
        onPagesChangedAction={refreshPages}
        onToggleFavoriteAction={toggleFavoriteAction}
        onOpenSearchAction={() => setSearchOpen(true)}
        collapsed={sidebarCollapsed}
        onCollapsedChangeAction={setSidebarCollapsedAction}
      />
      <main
        ref={editorScrollRef}
        data-editor-scroll-container
        className="flex-1 overflow-y-auto"
      >
        {currentPageId === null ? (
          <HomeView
            initialPages={pages}
            initialStats={initialStats ?? defaultStats}
            onSelectAction={handleSelectAction}
            onOpenSearchAction={() => setSearchOpen(true)}
            createPageAction={createPageAction}
            onPagesChangedAction={refreshPages}
          />
        ) : currentPage ? (
          <Editor
            key={currentPage.id}
            pageId={currentPage.id}
            title={currentPage.title}
            iconType={currentPage.iconType ?? null}
            iconValue={currentPage.iconValue ?? null}
            onTitleChangeAction={handleTitleChangeAction}
            onIconChangeAction={handleIconChangeAction}
            onHeadingsChangeAction={setHeadings}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            没有页面。在左侧新建一个吧。
          </div>
        )}
      </main>
      {/* 首页没有 headings，不渲染 MiniMap */}
      {currentPageId !== null && (
        <MiniMap headings={headings} scrollContainerRef={editorScrollRef} />
      )}

      {/* 搜索弹窗（首页 / sidebar / Cmd+K 统一在此渲染） */}
      <SearchDialog
        open={searchOpen}
        onOpenChangeAction={setSearchOpen}
        onSelectPageAction={handleSelectAction}
      />
    </div>
  )
}
