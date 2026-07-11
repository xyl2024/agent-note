'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileText, MoreHorizontal, Plus, Star, StarOff, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Page } from '@/db/schema'
import { resolveIcon } from '@/lib/icon-resolver'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import type { PageNode } from './sidebar'

// -----------------------------------------------------------------------------
// PageTreeItem：递归渲染单个页面节点 + 右键菜单 + 内联重命名 + 删除确认
// -----------------------------------------------------------------------------
type Props = {
  node: PageNode
  depth: number
  currentPageId: string | null
  // Next.js 16：函数 prop 必须以 Action 结尾
  onSelectAction: (id: string) => void
  onPagesChangedAction: () => Promise<void>
  onToggleFavoriteAction: (pageId: string) => Promise<void>
}

// 缩进：每一层加 12px（用 paddingLeft 比 pl-N 更安全）
const DEPTH_PX = 12

export function PageTreeItem({
  node,
  depth,
  currentPageId,
  onSelectAction,
  onPagesChangedAction,
  onToggleFavoriteAction,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(node.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const isActive = node.id === currentPageId
  const hasChildren = node.children.length > 0

  // 进入编辑态时 focus 并选中
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // node.title 变化时同步 draftTitle（外部刷新后保持一致）
  useEffect(() => {
    setDraftTitle(node.title)
  }, [node.title])

  // 重命名保存
  const commitRename = async () => {
    const next = draftTitle.trim() || 'Untitled'
    setEditing(false)
    if (next === node.title) return
    await fetch(`/api/pages/${node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next }),
    })
    await onPagesChangedAction()
  }

  // 新建子页面
  const handleCreateChildAction = async () => {
    const res = await fetch('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', parentId: node.id }),
    })
    if (!res.ok) return
    const { page } = (await res.json()) as { page: Page }
    await onPagesChangedAction()
    onSelectAction(page.id)
    setExpanded(true)
  }

  // 删除
  const handleDeleteAction = async () => {
    setConfirmDelete(false)
    await fetch(`/api/pages/${node.id}`, { method: 'DELETE' })
    await onPagesChangedAction()
    // 如果删的是当前页，AppShell 会自动 fallback 到第一个
  }

  return (
    <li>
      <div
        className={cn(
          'group/page-item flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-sidebar-accent',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )}
        style={{ paddingLeft: depth * DEPTH_PX + 4 }}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="grid h-4 w-4 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted"
            aria-label={expanded ? '折叠' : '展开'}
          >
            <ChevronRight
              className={cn(
                'h-3 w-3 transition-transform',
                expanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}

        {/* 页面图标：emoji 16px，lucide icon 14px，无 icon 时 fallback 到 FileText */}
        <span className="grid h-4 w-4 shrink-0 place-items-center text-base leading-none mr-1">
          {resolveIcon(node.iconType, node.iconValue) ?? (
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>

        {/* 标题 / 编辑 input */}
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setDraftTitle(node.title)
                setEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded-sm bg-background px-1 text-sm outline-none ring-1 ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelectAction(node.id)}
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left"
          >
            {node.title}
          </button>
        )}

        {/* ★ 角标：仅在已收藏时显示（muted-foreground 色调） */}
        {node.isFavorite && (
          <Star
            className="h-3.5 w-3.5 shrink-0 fill-current text-muted-foreground"
            aria-label="已收藏"
          />
        )}

        {/* 右键菜单触发器（hover 显示） */}
        <DropdownMenu>
          <DropdownMenuTrigger
            openOnHover
            delay={200}
            closeDelay={150}
            render={
              <button
                type="button"
                aria-label="更多操作"
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-muted group-hover/page-item:opacity-100 data-[popup-open]:opacity-100"
              />
            }
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={2}>
            <DropdownMenuItem
              onClick={() => onToggleFavoriteAction(node.id)}
            >
              {node.isFavorite ? <StarOff /> : <Star />}
              {node.isFavorite ? '从收藏中移除' : '加入收藏'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCreateChildAction}>
              <Plus />
              新建子页面
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditing(true)}>
              重命名
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 子节点递归 */}
      {hasChildren && expanded && (
        <ul className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <PageTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              currentPageId={currentPageId}
              onSelectAction={onSelectAction}
              onPagesChangedAction={onPagesChangedAction}
              onToggleFavoriteAction={onToggleFavoriteAction}
            />
          ))}
        </ul>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除页面？</DialogTitle>
            <DialogDescription>
              将删除《{node.title}》及其所有子页面、块、内容。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              取消
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteAction}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}