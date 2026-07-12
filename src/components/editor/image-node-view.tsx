'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Globe } from 'lucide-react'
import { useRef } from 'react'

// -----------------------------------------------------------------------------
// ImageNodeView: image 节点的自定义渲染
//
//   - kind='external' 时显示「外部」徽标（hover 期间常驻；平时隐藏）
//   - 选中时显示右下角拖拽手柄，等比改写 width/height attrs
//   - 拖拽过程中直接改 DOM style，mouseup 时一次性 updateAttributes（避免拖拽
//     过程中频繁写 doc）
//
// 与 image-bubble-menu.tsx 配合：选中时同时显示 BubbleMenu 三个按钮（改 alt / 改 src / 删除）
// -----------------------------------------------------------------------------

type ImageAttrs = {
  src?: string | null
  alt?: string | null
  title?: string | null
  kind?: 'local' | 'external'
  width?: number | string | null
  height?: number | string | null
}

const MIN_WIDTH = 50

export function ImageNodeView({ node, selected, updateAttributes }: NodeViewProps) {
  const attrs = node.attrs as ImageAttrs
  const { src, alt, title, kind, width, height } = attrs
  const imgRef = useRef<HTMLImageElement>(null)

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const img = imgRef.current
    if (!img) return
    const startX = e.clientX
    const startW = img.offsetWidth
    const startH = img.offsetHeight
    if (startW <= 0 || startH <= 0) return
    const aspect = startH / startW

    let finalW = startW
    let finalH = startH

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      finalW = Math.max(MIN_WIDTH, startW + dx)
      finalH = Math.round(finalW * aspect)
      img.style.width = `${finalW}px`
      img.style.height = `${finalH}px`
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      updateAttributes({ width: finalW, height: finalH })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper
      as="div"
      className="image-node-container"
      data-image-kind={kind ?? 'local'}
    >
      {kind === 'external' && (
        <span className="external-badge" contentEditable={false}>
          <Globe className="h-3 w-3" />
          <span>外部</span>
        </span>
      )}
      <img
        ref={imgRef}
        src={src ?? ''}
        alt={alt ?? ''}
        title={title ?? undefined}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        width={width != null ? Number(width) : undefined}
        height={height != null ? Number(height) : undefined}
        draggable={false}
      />
      {selected && (
        <span
          className="image-resize-handle"
          contentEditable={false}
          onMouseDown={handleResizeStart}
          aria-label="拖拽缩放"
        />
      )}
    </NodeViewWrapper>
  )
}