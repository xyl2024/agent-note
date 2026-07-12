'use client'

import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  BlockDragState,
  GripPosition,
  UseBlockDragResult,
} from './use-block-drag'

// -----------------------------------------------------------------------------
// BlockGutter
//
// 编辑器左侧的拖动覆盖层。渲染 N 个 grip（每个顶层 block 一个）+ 拖动期间的
// 蓝色 drop indicator 细线。事件回调全部来自 useBlockDrag，本组件纯展示。
//
// 定位策略：gutter 容器本身 absolute 铺满父容器（高度 100%），内部按钮 / 细线
// 用 transform: translateY(...) 相对容器顶部偏移。gutter 容器的 top = 0，
// scrollTop 由 hook 的 position.top 已加回，所以按钮会跟着内容一起滚。
// -----------------------------------------------------------------------------

type Props = {
  positions: GripPosition[]
  dragState: BlockDragState
  hoveredIndex: number | null
  onGripDragStart: UseBlockDragResult['onGripDragStart']
  onGripDragEnd: UseBlockDragResult['onGripDragEnd']
}

export function BlockGutter({
  positions,
  dragState,
  hoveredIndex,
  onGripDragStart,
  onGripDragEnd,
}: Props) {
  const isDragging = dragState.draggingIndex != null
  return (
    <div
      className={cn(
        'editor-block-gutter',
        isDragging && 'editor-block-gutter--active',
      )}
      aria-hidden
    >
      {positions.map((p, i) => (
        <button
          key={p.blockPos}
          type="button"
          draggable
          tabIndex={-1}
          aria-label="拖动此块"
          className={cn(
            'editor-block-gutter__grip',
            // 拖动期间强制全亮（--active 控制）
            // 单 block 维度：仅 hoveredIndex === i 时显形
            !isDragging &&
              hoveredIndex === i &&
              'editor-block-gutter__grip--hover',
            dragState.draggingIndex === i &&
              'editor-block-gutter__grip--dragging',
          )}
          style={{
            // 用 transform 避免 layout reflow；top 已经包含 scrollTop
            transform: `translateY(${p.top}px)`,
          }}
          onDragStart={(e) => onGripDragStart(i, e)}
          onDragEnd={onGripDragEnd}
        >
          <GripVertical size={14} />
        </button>
      ))}

      {dragState.hoverInfo &&
        (() => {
          const { blockIndex, position } = dragState.hoverInfo
          const target = positions[blockIndex]
          if (!target) return null
          // 落点 y：above = 块顶；below = 块底
          const y =
            position === 'above' ? target.top : target.top + target.height
          return (
            <div
              className="editor-block-gutter__drop-line"
              style={{ transform: `translateY(${y}px)` }}
            />
          )
        })()}
    </div>
  )
}