'use client'

import { FileText, MoreHorizontal, StarOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Page } from '@/db/schema'
import { resolveIcon } from '@/lib/icon-resolver'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// -----------------------------------------------------------------------------
// FavoriteItem：收藏区里的单行（简化版 PageTreeItem）
// - 不嵌套（已确认收藏区平铺）：无缩进 / 无展开箭头 / 无子页面逻辑
// - 行首 ★ 实心徽章 + page icon + title
// - hover 显示 "...菜单"，只有"从收藏中移除"一个动作
// -----------------------------------------------------------------------------
type Props = {
  page: Page
  currentPageId: string | null
  // Next.js 16：函数 prop 必须以 Action 结尾
  onSelectAction: (id: string) => void
  onToggleFavoriteAction: (pageId: string) => Promise<void>
}

export function FavoriteItem({
  page,
  currentPageId,
  onSelectAction,
  onToggleFavoriteAction,
}: Props) {
  const isActive = page.id === currentPageId

  return (
    <li>
      <div
        className={cn(
          'group/fav-item flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-sidebar-accent',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )}
      >
        {/* 页面图标 */}
        <span className="grid h-4 w-4 shrink-0 place-items-center text-base leading-none mr-1">
          {resolveIcon(page.iconType, page.iconValue) ?? (
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>

        {/* 标题（点击跳转） */}
        <button
          type="button"
          onClick={() => onSelectAction(page.id)}
          className="min-w-0 flex-1 truncate text-left"
        >
          {page.title}
        </button>

        {/* "..."菜单：hover 显示，目前只有"从收藏中移除" */}
        <DropdownMenu>
          <DropdownMenuTrigger
            openOnHover
            delay={200}
            closeDelay={150}
            render={
              <button
                type="button"
                aria-label="更多操作"
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:bg-muted group-hover/fav-item:opacity-100 data-[popup-open]:opacity-100"
              />
            }
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={2}>
            <DropdownMenuItem onClick={() => onToggleFavoriteAction(page.id)}>
              <StarOff />
              从收藏中移除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}