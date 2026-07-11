'use client'

import { useState, type ReactNode } from 'react'
import { ChevronRight, FileText } from 'lucide-react'
import type { HomePageNode } from './home-view'
import { resolveIcon } from '@/lib/icon-resolver'
import { cn } from '@/lib/utils'

// -----------------------------------------------------------------------------
// PageTreeRow：首页树形概览的单行
// - 可展开 / 收起（默认全部展开）
// - 点击整行触发跳转；点 chevron 仅切换展开状态
// - 子页面递归渲染，缩进 24px / depth
// -----------------------------------------------------------------------------

type Props = {
  node: HomePageNode
  depth: number
  onSelectAction: (id: string) => void
}

export function PageTreeRow({ node, depth, onSelectAction }: Props): ReactNode {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-muted/60',
        )}
        style={{ paddingLeft: `${16 + depth * 24}px` }}
      >
        {/* 展开 / 收起按钮（无子节点时渲染占位符维持对齐） */}
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? '收起' : '展开'}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-150',
                expanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="block h-5 w-5 shrink-0" aria-hidden="true" />
        )}

        {/* 整行点击跳转（不含 chevron） */}
        <button
          type="button"
          onClick={() => onSelectAction(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded text-sm">
            {resolveIcon(
              node.iconType as never,
              node.iconValue,
            ) ?? <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {node.title || 'Untitled'}
          </span>
          {hasChildren && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {node.children.length}
            </span>
          )}
        </button>
      </div>

      {/* 子节点 */}
      {hasChildren && expanded && (
        <>
          {node.children.map((child) => (
            <PageTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelectAction={onSelectAction}
            />
          ))}
        </>
      )}
    </>
  )
}