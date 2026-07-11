'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronsLeft, ChevronsRight, Plus, Search, Settings } from 'lucide-react'
import type { Page } from '@/db/schema'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { PageTreeItem } from './page-tree-item'
import { BrandIcon } from '@/components/brand-icon'

// -----------------------------------------------------------------------------
// Sidebar：页面树 + 顶部操作
// 搜索弹窗状态由 AppShell 统一持有（首页 / sidebar 都要触发），这里只负责触发。
// -----------------------------------------------------------------------------
type Props = {
  pages: Page[]
  // null 表示当前在首页（无高亮项）
  currentPageId: string | null
  // Next.js 16：传给 Client Component 的函数必须以 Action 结尾
  onSelectAction: (id: string) => void
  onPagesChangedAction: () => Promise<void>
  onOpenSearchAction: () => void
  // 侧栏折叠状态（true = 折叠成图标条）
  collapsed: boolean
  onCollapsedChangeAction: (collapsed: boolean) => void
}

// 树形节点
export type PageNode = Page & { children: PageNode[] }

// 从扁平 pages 构造树形（parentId 指向已删页面或 null = 顶层）
function buildTree(pages: Page[]): PageNode[] {
  const byId = new Map<string, PageNode>()
  pages.forEach((p) => byId.set(p.id, { ...p, children: [] }))
  const roots: PageNode[] = []
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  // 子节点按 createdAt 升序（先建先排前）
  const sortByCreated = (a: PageNode, b: PageNode) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  roots.sort(sortByCreated)
  byId.forEach((n) => n.children.sort(sortByCreated))
  return roots
}

export function Sidebar({
  pages,
  currentPageId,
  onSelectAction,
  onPagesChangedAction,
  onOpenSearchAction,
  collapsed,
  onCollapsedChangeAction,
}: Props) {
  const tree = useMemo(() => buildTree(pages), [pages])

  // 顶层"新建页面"按钮：创建根页面
  const handleCreateRootAction = async () => {
    const res = await fetch('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled' }),
    })
    if (!res.ok) return
    const { page } = (await res.json()) as { page: Page }
    await onPagesChangedAction()
    onSelectAction(page.id)
  }

  // 折叠状态：只剩图标条（顶部的 Brand + 展开按钮），其余内容隐藏
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col items-center gap-1 py-3">
          <Link href="/" aria-label="返回首页">
            <BrandIcon className="h-6 w-6" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="展开侧栏"
            onClick={() => onCollapsedChangeAction(false)}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Workspace header */}
      <div className="flex items-center justify-between gap-1 px-3 py-3">
        <Link href="/" className="flex items-center gap-2">
          <BrandIcon className="h-6 w-6" />
          <span className="text-sm font-semibold">Agent Note</span>
        </Link>
        <div className="flex items-center">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="折叠侧栏"
            onClick={() => onCollapsedChangeAction(true)}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Action buttons */}
      <div className="flex flex-col gap-0.5 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2"
          onClick={onOpenSearchAction}
        >
          <Search className="h-4 w-4" />
          <span className="text-xs">搜索</span>
          <kbd className="ml-auto rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
            ⌘K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2"
          onClick={handleCreateRootAction}
        >
          <Plus className="h-4 w-4" />
          <span className="text-xs">新建页面</span>
        </Button>
      </div>

      <Separator />

      {/* Page tree */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">
          页面
        </div>
        {tree.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            还没有页面，点上面「新建页面」开始。
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {tree.map((node) => (
              <PageTreeItem
                key={node.id}
                node={node}
                depth={0}
                currentPageId={currentPageId}
                onSelectAction={onSelectAction}
                onPagesChangedAction={onPagesChangedAction}
              />
            ))}
          </ul>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          disabled
          title="Session 3+ 实现"
        >
          <Settings className="h-4 w-4" />
          <span className="text-xs">设置</span>
        </Button>
      </div>
    </aside>
  )
}