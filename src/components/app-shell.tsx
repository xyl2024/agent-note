'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Page, IconType } from '@/db/schema'
import { Sidebar } from '@/components/sidebar/sidebar'
import { Editor, type EditorHandle } from '@/components/editor/editor'
import { MiniMap } from '@/components/outline/minimap'
import type { HeadingItem } from '@/lib/tiptap/heading-anchor'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// -----------------------------------------------------------------------------
// AppShell: 三栏布局的客户端容器
// - currentPageId 完全由 URL 驱动 (/p/[id], 没有则 fallback 到 initialPageId)
//   因此刷新 / 前进后退 / 分享链接 / 浏览器历史 都能正确工作
// - 内部不再持有 currentPageId 状态, 所有变更通过 router.push / router.replace
// - 当前页被删除 -> 自动 redirect 到 /
// -----------------------------------------------------------------------------
type Props = {
  initialPages: Page[]
  initialPageId: string
}

type CreateDialogState =
  | null
  | { pageTitle: string; resolve: (page: Page | null) => void }

export function AppShell({ initialPages, initialPageId }: Props) {
  const router = useRouter()
  const params = useParams<{ id?: string }>()
  // URL 即真相: /p/[id] -> params.id; / -> initialPageId(首个根页面)
  const currentPageId = (params?.id as string | undefined) ?? initialPageId

  const [pages, setPages] = useState<Page[]>(initialPages)
  const [createDialog, setCreateDialog] = useState<CreateDialogState>(null)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const editorScrollRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<EditorHandle | null>(null)

  // 重新拉取页面列表(任何 mutation 后调用)
  const refreshPages = useCallback(async () => {
    const res = await fetch('/api/pages')
    if (!res.ok) return
    const data = (await res.json()) as { pages: Page[] }
    setPages(data.pages)
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

  // 创建页面(Dialog 和 suggestion 都会用)
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

  // 点击 pageLink: 存在 -> 跳转; 不存在 -> 弹 Dialog 让用户创建
  const handlePageLinkClickAction = useCallback(
    (pageId: string | null, pageTitle: string) => {
      if (pageId) {
        // 再次校验页面是否还存在(防止悬挂引用)
        const exists = pages.find((p) => p.id === pageId)
        if (exists) {
          // 推到独立 URL, 让浏览器历史可记录
          handleSelectAction(pageId)
          return
        }
        // 页面已被删除 -> 走创建流程
      }
      setCreateDialog({
        pageTitle,
        resolve: () => {
          /* 由 Dialog 内的按钮调用 confirmAction 触发 */
        },
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages],
  )

  // 确认创建(Dialog 内)
  const handleCreateDialogConfirm = async () => {
    if (!createDialog) return
    const pageTitle = createDialog.pageTitle
    setCreateDialog(null)
    try {
      const page = await createPageAction(pageTitle)
      // 回填: 当前编辑器里所有 pageTitle === title 的未解析 pageLink 补 pageId
      editorRef.current?.updatePageLinkByTitleAction(pageTitle, page.id)
      // 创建后自动跳转过去(推到独立 URL, 浏览器历史可记录)
      router.push(`/p/${page.id}`)
    } catch (e) {
      console.error('create page failed', e)
    }
  }

  // 当前页面被删除 / 不在 DB 中 -> 回到根
  // (SSR 兜底在 /p/[id] 已 404; 这里处理客户端 navigation 过程中
  //  当前 id 消失的情况, 例如用户在 A 页时把 A 删了 / 列表刷新后丢失)
  useEffect(() => {
    if (pages.length === 0) return
    const exists = pages.some((p) => p.id === currentPageId)
    if (!exists) {
      router.replace('/')
    }
  }, [pages, currentPageId, router])

  // 当前页面: 找不到 fallback 到第一个(页面被删 / URL 非法的过渡态)
  const currentPage =
    pages.find((p) => p.id === currentPageId) ?? pages[0]

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        pages={pages}
        currentPageId={currentPage?.id ?? ''}
        onSelectAction={handleSelectAction}
        onPagesChangedAction={refreshPages}
      />
      <main
        ref={editorScrollRef}
        data-editor-scroll-container
        className="flex-1 overflow-y-auto"
      >
        {currentPage ? (
          <Editor
            ref={editorRef}
            key={currentPage.id}
            pageId={currentPage.id}
            title={currentPage.title}
            iconType={currentPage.iconType ?? null}
            iconValue={currentPage.iconValue ?? null}
            onTitleChangeAction={handleTitleChangeAction}
            onIconChangeAction={handleIconChangeAction}
            onPageLinkClickAction={handlePageLinkClickAction}
            onHeadingsChangeAction={setHeadings}
            createPageAction={createPageAction}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            没有页面。在左侧新建一个吧。
          </div>
        )}
      </main>
      <MiniMap headings={headings} scrollContainerRef={editorScrollRef} />

      {/* 点击不存在 pageLink 时的「创建新页面」对话框 */}
      <Dialog
        open={createDialog !== null}
        onOpenChange={(open) => {
          if (!open) setCreateDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>页面不存在</DialogTitle>
            <DialogDescription>
              《{createDialog?.pageTitle ?? ''}》尚未创建。是否现在创建？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={handleCreateDialogConfirm}>创建并跳转</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
