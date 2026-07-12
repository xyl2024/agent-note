'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ImagePreviewItem, ImagePreviewPayload } from './image-action-context'

// -----------------------------------------------------------------------------
// ImageLightbox：全屏图片预览 + 完整 image gallery 控件
//
//   - 缩放 / 适应 / 100% / 上下张 / 拖动平移
//   - 键盘快捷键：← → 上下张、+/- 缩放、0 适应、1 100%、ESC 关闭
//   - 鼠标滚轮缩放（向上 = 放大，向下 = 缩小）
//   - 双击切换 fit ↔ 100%
//   - 图片计数 "3 / 7"（仅多张图时显示）
//
// 布局：
//   - Backdrop：全屏 dark，点击关闭
//   - Popup：只包图片本体（content-sized 居中）
//   - 控件们：Popup 的兄弟节点放在 Portal 内，容器 pointer-events: none，
//     按钮 pointer-events: auto — 这样控件空白区域不会拦掉 Backdrop click
//
// 复用 base-ui Dialog primitives（与 src/components/ui/dialog 同源）：
//   ESC / portal / focus trap / body 滚动锁全部内置
// -----------------------------------------------------------------------------

const MIN_SCALE = 0.1
const MAX_SCALE = 10
const ZOOM_STEP = 1.25 // 步进 25%
const WHEEL_SENSITIVITY = 0.0015 // 滚轮灵敏度

// 视口预留空间：顶/底栏约 60px 一栏，cap 区域约 80px，左右各 32px 边距
const VIEWPORT_PADDING = { x: 32, top: 80, bottom: 160 }

type Props = {
  payload: ImagePreviewPayload | null
  onCloseAction: () => void
  onIndexChangeAction: (index: number) => void
}

export function ImageLightbox({ payload, onCloseAction, onIndexChangeAction }: Props) {
  const open = payload !== null
  const current: ImagePreviewItem | null =
    payload !== null ? payload.images[payload.index] : null
  const total = payload?.images.length ?? 0
  const hasMultiple = total > 1

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  // fitScale 用 state 而非 ref：render 时 cursor 类需要读它来跟 scale 比较
  // （React 规则禁止 render 期间读 ref.current）
  const [fitScale, setFitScale] = useState(1)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  // ---------------------------------------------------------------------------
  // 计算「适应视口」的缩放比例
  // 规则：图比视口大就缩小（图占满 viewport 减去 padding），
  //      图比视口小就不放大（封顶 1）
  // ---------------------------------------------------------------------------
  const calcFitScale = useCallback((naturalW: number, naturalH: number): number => {
    if (naturalW <= 0 || naturalH <= 0) return 1
    const availW = Math.max(0, window.innerWidth - VIEWPORT_PADDING.x * 2)
    const availH = Math.max(
      0,
      window.innerHeight - VIEWPORT_PADDING.top - VIEWPORT_PADDING.bottom,
    )
    const scaleW = availW / naturalW
    const scaleH = availH / naturalH
    return Math.min(scaleW, scaleH, 1)
  }, [])

  // ---------------------------------------------------------------------------
  // 当前图片变化时 → 等图加载完成 → 重置到 fit
  // (prev/next 切换、首打开、外部换图都走这条)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!current) return
    let cancelled = false
    // 用 new Image() 探测 natural 尺寸（不依赖 DOM 节点存在，避免 race）
    const probe = new Image()
    probe.onload = () => {
      if (cancelled) return
      const f = calcFitScale(probe.naturalWidth, probe.naturalHeight)
      setFitScale(f)
      setScale(f)
      setTranslate({ x: 0, y: 0 })
    }
    probe.onerror = () => {
      if (cancelled) return
      setFitScale(1)
      setScale(1)
      setTranslate({ x: 0, y: 0 })
    }
    probe.src = current.src
    return () => {
      cancelled = true
    }
  }, [current, calcFitScale])

  // ---------------------------------------------------------------------------
  // 拖拽：isDragging=true 时挂 window mousemove / mouseup，更新 translate
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const start = dragStartRef.current
      if (!start) return
      setTranslate({
        x: start.tx + (e.clientX - start.x),
        y: start.ty + (e.clientY - start.y),
      })
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  // ---------------------------------------------------------------------------
  // 缩放动作
  // ---------------------------------------------------------------------------
  const clampScale = useCallback((s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)), [])

  const zoomIn = useCallback(() => {
    setScale((s) => clampScale(s * ZOOM_STEP))
  }, [clampScale])

  const zoomOut = useCallback(() => {
    setScale((s) => clampScale(s / ZOOM_STEP))
  }, [clampScale])

  const setFit = useCallback(() => {
    setScale(fitScale)
    setTranslate({ x: 0, y: 0 })
  }, [fitScale])

  const setActual = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  // ---------------------------------------------------------------------------
  // 上下张
  // ---------------------------------------------------------------------------
  const goPrev = useCallback(() => {
    if (!payload) return
    onIndexChangeAction((payload.index - 1 + payload.images.length) % payload.images.length)
  }, [payload, onIndexChangeAction])

  const goNext = useCallback(() => {
    if (!payload) return
    onIndexChangeAction((payload.index + 1) % payload.images.length)
  }, [payload, onIndexChangeAction])

  // ---------------------------------------------------------------------------
  // 键盘快捷键：lightbox 打开时挂 window keydown
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!payload) return
    const handler = (e: KeyboardEvent) => {
      // 跳过输入框（lightbox 里没有这些，但保险起见写上）
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      switch (e.key) {
        case 'Escape':
          // base-ui Dialog 已处理 ESC，但显式监听确保行为稳定
          e.preventDefault()
          onCloseAction()
          break
        case 'ArrowLeft':
          if (hasMultiple) {
            e.preventDefault()
            goPrev()
          }
          break
        case 'ArrowRight':
          if (hasMultiple) {
            e.preventDefault()
            goNext()
          }
          break
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
        case '_':
          e.preventDefault()
          zoomOut()
          break
        case '0':
          e.preventDefault()
          setFit()
          break
        case '1':
          e.preventDefault()
          setActual()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [payload, hasMultiple, goPrev, goNext, zoomIn, zoomOut, setFit, setActual, onCloseAction])

  // ---------------------------------------------------------------------------
  // 图片本体的交互
  // ---------------------------------------------------------------------------
  const handleImageMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    // 只有放大到超过 fit 才能拖动（缩小到 1x 以下时拖动没意义）
    if (scale <= fitScale + 0.01) return
    e.preventDefault()
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: translate.x,
      ty: translate.y,
    }
    setIsDragging(true)
  }

  const handleImageWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    // 仅在图片上滚轮才拦截，避免 lightbox 内其他元素滚动异常
    e.preventDefault()
    const factor = Math.exp(-e.deltaY * WHEEL_SENSITIVITY)
    setScale((s) => clampScale(s * factor))
  }

  const handleImageDoubleClick = (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault()
    // 已放大（超过 fit 5% 容忍度）→ 回到 fit；否则 → 100%
    if (scale > fitScale * 1.05) {
      setFit()
    } else {
      setActual()
    }
  }

  // cursor 提示：放大后 grab，没放大 zoom-in（暗示可双击放大）
  const isZoomed = scale > fitScale + 0.01
  const cursorClass = isDragging
    ? 'cursor-grabbing'
    : isZoomed
      ? 'cursor-grab'
      : 'cursor-zoom-in'

  const scalePercent = Math.round(scale * 100)
  const counterText = hasMultiple ? `${payload!.index + 1} / ${total}` : ''

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onCloseAction()
      }}
    >
      <DialogPrimitive.Portal>
        {/* Backdrop：full viewport dark，点击关闭 */}
        <DialogPrimitive.Backdrop
          className={cn(
            'fixed inset-0 isolate z-40 bg-black/85 backdrop-blur-sm',
            'data-open:animate-in data-open:fade-in-0',
            'data-closed:animate-out data-closed:fade-out-0',
          )}
        />

        {/* Popup：只包图片本体，content-sized 居中 */}
        <DialogPrimitive.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none',
            'flex max-h-[calc(100vh-10rem)] max-w-[calc(100vw-4rem)] flex-col items-center',
            'data-open:animate-in data-open:zoom-in-95 data-open:fade-in-0',
            'data-closed:animate-out data-closed:zoom-out-95 data-closed:fade-out-0',
          )}
        >
          {current && (
            <>
              <img
                ref={imgRef}
                src={current.src}
                alt={current.alt ?? ''}
                title={current.title ?? undefined}
                referrerPolicy="no-referrer"
                draggable={false}
                style={{
                  transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.18s ease-out',
                  maxWidth: '100%',
                  maxHeight: 'calc(100vh - 14rem)',
                  userSelect: 'none',
                }}
                className={cursorClass}
                onMouseDown={handleImageMouseDown}
                onWheel={handleImageWheel}
                onDoubleClick={handleImageDoubleClick}
              />
              {current.alt && (
                <p className="mt-4 max-w-2xl text-center text-sm text-white/80">
                  {current.alt}
                </p>
              )}
            </>
          )}
        </DialogPrimitive.Popup>

        {/* 控件们：Popup 的兄弟节点。容器 pointer-events: none，按钮 auto
            —— 这样控件之间的空白区域仍能让 Backdrop 收到 click → 关闭 */}
        {/* 顶栏：左 counter + 右关闭 */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex items-start justify-between p-4">
          <span className="rounded-md bg-black/40 px-2.5 py-1 text-sm tabular-nums text-white/80">
            {counterText}
          </span>
          <DialogPrimitive.Close
            aria-label="关闭预览"
            className={cn(
              'pointer-events-auto grid h-10 w-10 place-items-center rounded-full',
              'bg-white/10 text-white transition-colors hover:bg-white/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            )}
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </div>

        {/* 左右箭头：仅多张图时显示 */}
        {hasMultiple && (
          <>
            <button
              type="button"
              aria-label="上一张"
              onClick={goPrev}
              className={cn(
                'pointer-events-auto fixed left-4 top-1/2 z-[60] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full',
                'bg-white/10 text-white transition-colors hover:bg-white/20',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              )}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              onClick={goNext}
              className={cn(
                'pointer-events-auto fixed right-4 top-1/2 z-[60] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full',
                'bg-white/10 text-white transition-colors hover:bg-white/20',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              )}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* 底栏：缩放控件 + 百分比 */}
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-1 p-4">
          <button
            type="button"
            aria-label="缩小"
            onClick={zoomOut}
            className={cn(
              'pointer-events-auto grid h-9 w-9 place-items-center rounded-md',
              'bg-white/10 text-white transition-colors hover:bg-white/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            )}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="实际大小"
            onClick={setActual}
            className={cn(
              'pointer-events-auto rounded-md px-3 py-1.5 text-sm text-white transition-colors',
              'bg-white/10 hover:bg-white/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            )}
          >
            100%
          </button>
          <button
            type="button"
            aria-label="适应"
            onClick={setFit}
            className={cn(
              'pointer-events-auto rounded-md px-3 py-1.5 text-sm text-white transition-colors',
              'bg-white/10 hover:bg-white/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            )}
          >
            适应
          </button>
          <button
            type="button"
            aria-label="放大"
            onClick={zoomIn}
            className={cn(
              'pointer-events-auto grid h-9 w-9 place-items-center rounded-md',
              'bg-white/10 text-white transition-colors hover:bg-white/20',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="ml-3 min-w-[3.5rem] text-right text-sm tabular-nums text-white/80">
            {scalePercent}%
          </span>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}