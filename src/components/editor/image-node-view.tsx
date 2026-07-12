'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Globe } from 'lucide-react'
import { useRef } from 'react'
import { useImageAction, type ImagePreviewItem } from './image-action-context'

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

export function ImageNodeView({ node, selected, updateAttributes, getPos, editor }: NodeViewProps) {
  const attrs = node.attrs as ImageAttrs
  const { src, alt, title, kind, width, height } = attrs
  const imgRef = useRef<HTMLImageElement>(null)
  // 通过 Context 拿到「打开 lightbox」的回调；脱离 Provider 时（极端情况）静默 no-op
  const action = useImageAction()

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
        // 点击图片 → 打开 lightbox 预览
        //   - 不调 e.stopPropagation()：让 ProseMirror 自然 NodeSelection 选中图片，
        //     关闭 lightbox 后用户可直接用 BubbleMenu（改 alt / 删图）
        //   - 只处理左键：避免中键 / 右键误触发
        //   - 挂 img 而不是 wrapper：resize handle 是 img 的兄弟节点，
        //     且 external-badge 已加 pointer-events: none（见 editor.css），不会挡 click
        //   - onClick 时 walk 整个 doc 收所有 image 节点 + 用 getPos() 找当前 index，
        //     一起塞进 payload。这样 lightbox 可以 prev/next 切换，
        //     不用每次切图都重新 walk doc
        onClick={(e) => {
          if (e.button !== 0) return
          if (!action) return
          const pos = safeGetPos(getPos)
          if (pos == null) return
          const images: ImagePreviewItem[] = []
          let index = 0
          editor.state.doc.descendants((n, p) => {
            if (n.type.name === 'image') {
              if (p === pos) index = images.length
              images.push({
                src: n.attrs.src ?? '',
                alt: n.attrs.alt ?? null,
                title: n.attrs.title ?? null,
              })
            }
          })
          if (images.length === 0) return
          action.onPreviewAction({ images, index })
        }}
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

// 安全的 getPos()：Tiptap NodeView 的 getPos 在 SSR / 节点已删除时会抛错或返回 undefined，
// 这里参考 src/lib/tiptap/code-block-view.tsx:419-427 的写法包一层 try/catch。
function safeGetPos(getPos: NodeViewProps['getPos']): number | null {
  try {
    if (typeof getPos !== 'function') return null
    const p = getPos()
    return typeof p === 'number' ? p : null
  } catch {
    return null
  }
}