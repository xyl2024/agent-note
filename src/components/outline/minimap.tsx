'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { HeadingItem } from '@/lib/tiptap/heading-anchor'

// -----------------------------------------------------------------------------
// MiniMap：Notion 风格的悬浮大纲
// - 默认：右侧细条，按 heading 数量显示横线（H1 最宽，H3 最窄）
// - hover：弹出完整大纲面板，最多 max-h-80，超出滚动；active 标题显示为蓝色
// - 点击横线 / 点击列表项：scrollIntoView + 同步 URL hash
// - active 判定：scroll + rAF + getBoundingClientRect，自己算「激活区」
//   （视口上 40%）内 pos 最小的 heading。
//   不用 IntersectionObserver 是因为 Tiptap 的 HeadingAnchor 装饰会反复
//   替换 heading 节点（同一个 id、不同 DOM 实例），IO 一旦失去旧节点
//   引用就再也不会 fire，导致滚动时 active 永远停在第一个标题。
// -----------------------------------------------------------------------------
type Props = {
  headings: HeadingItem[]
  scrollContainerRef: React.RefObject<HTMLElement | null>
}

// 固定宽度：H1 最宽，依次递减
const BAR_WIDTH: Record<number, string> = {
  1: 'w-6',
  2: 'w-4.5',
  3: 'w-3',
}

const INDENT: Record<number, string> = {
  1: 'pl-0',
  2: 'pl-3',
  3: 'pl-6',
}

export function MiniMap({ headings, scrollContainerRef }: Props) {
  const [ioActiveId, setIoActiveId] = useState<string | null>(null)
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const initialHashAppliedRef = useRef(false)
  const [popupScrollKey, setPopupScrollKey] = useState(0) // hover 切换时把滚动重置

  // 派生 effectiveActiveId：直接用 scroll spy 的结果，没有「锁定」逻辑。
  // 点击标题只是触发滚动，active 始终跟随当前 scroll position。
  const effectiveActiveId = useMemo<string | null>(() => {
    if (headings.length === 0) return null
    if (ioActiveId && headings.some((h) => h.id === ioActiveId)) return ioActiveId
    return headings[0].id
  }, [headings, ioActiveId])

  // ---------------------------------------------------------------------------
  // Scroll spy
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || headings.length === 0) return

    // 用 rAF 节流的「主动测量」代替 IntersectionObserver：
    // Tiptap 的 HeadingAnchor 装饰会反复替换 heading 节点（同一个 id，
    // 不同的 DOM 实例），IO 会失去对旧节点的引用、从此停火，
    // 导致滚动时 active 状态不再更新。下面用 scroll + rAF + getBoundingClientRect
    // 自己算 activeId，更可靠。
    let rafId: number | null = null
    const compute = () => {
      rafId = null
      const containerRect = container.getBoundingClientRect()
      // 取视口上 40% 作为「激活区」（与原 IO 行为对齐）
      const activeTop = containerRect.top
      const activeBottom = containerRect.top + containerRect.height * 0.4
      let bestId: string | null = null
      let bestPos = Infinity
      for (const h of headings) {
        const el = container.querySelector(`#${CSS.escape(h.id)}`)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        // heading 必须在激活区里：rect.bottom > activeTop 且 rect.top < activeBottom
        if (rect.bottom <= activeTop || rect.top >= activeBottom) continue
        // 取「最早进入激活区」的 heading（pos 最小 = 文档顺序最靠前）
        if (h.pos < bestPos) {
          bestPos = h.pos
          bestId = h.id
        }
      }
      if (bestId) setIoActiveId(bestId)
    }
    const schedule = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(compute)
    }
    container.addEventListener('scroll', schedule, { passive: true })
    // resize 也会改变布局
    window.addEventListener('resize', schedule)
    // 首屏先算一次（等一帧，DOM 已经 layout）
    rafId = requestAnimationFrame(compute)
    return () => {
      container.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [headings, scrollContainerRef])

  // ---------------------------------------------------------------------------
  // 首次加载：如果 URL hash 匹配某个 heading id，自动滚到那里
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (initialHashAppliedRef.current) return
    if (headings.length === 0) return
    const container = scrollContainerRef.current
    if (!container) return
    const hash =
      typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    initialHashAppliedRef.current = true
    if (!hash) return
    const hit = headings.find((h) => h.id === hash)
    if (!hit) return
    const el = container.querySelector(`#${CSS.escape(hit.id)}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'auto', block: 'start' })
  }, [headings, scrollContainerRef])

  // ---------------------------------------------------------------------------
  // 共享跳转逻辑：scrollIntoView + URL hash + 写 override
  // ---------------------------------------------------------------------------
  const jumpAction = (id: string) => {
    const container = scrollContainerRef.current
    if (!container) return
    const el = container.querySelector(`#${CSS.escape(id)}`)
    if (!el) return
    // 立即给一个 instant feedback（万一 scroll 还没开始），随后 scroll spy
    // 会自然把 activeId 切到 scroll 位置对应的 heading 上。
    setIoActiveId(id)
    try {
      history.replaceState(null, '', '#' + id)
    } catch {
      // ignore
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // active 项进入视口时滚动 popup 列表自身
  useEffect(() => {
    if (!effectiveActiveId) return
    const el = itemRefs.current.get(effectiveActiveId)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [effectiveActiveId])

  if (headings.length === 0) return null

  return (
    <div
      className="group/minimap fixed top-1/2 right-6 z-30 -translate-y-1/2"
      // hover 进入区域（含 popup + strip 整体）
      onMouseLeave={() => setPopupScrollKey((k) => k + 1)}
    >
      <div className="relative flex items-center">
        {/* 弹出面板：绝对定位，紧贴 strip 左侧，无 gap */}
        <div
          key={popupScrollKey}
          className={cn(
            'absolute top-1/2 right-full -translate-y-1/2',
            'w-60 max-h-[28rem]',
            'rounded-lg border bg-popover p-1 shadow-lg',
            'opacity-0 translate-x-1 pointer-events-none',
            'transition-all duration-150',
            'group-hover/minimap:opacity-100 group-hover/minimap:translate-x-0 group-hover/minimap:pointer-events-auto',
          )}
        >
          <div className="max-h-[28rem] overflow-y-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">
              大纲 · {headings.length}
            </div>
            <ul className="flex flex-col gap-0.5">
              {headings.map((h) => {
                const isActive = h.id === effectiveActiveId
                return (
                  <li key={h.id}>
                    <button
                      ref={(el) => {
                        if (el) itemRefs.current.set(h.id, el)
                        else itemRefs.current.delete(h.id)
                      }}
                      type="button"
                      onClick={() => jumpAction(h.id)}
                      className={cn(
                        'flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs transition-colors',
                        INDENT[h.level] ?? 'pl-0',
                        isActive
                          ? 'text-accent-foreground font-medium'
                          : 'text-popover-foreground hover:bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'block flex-1 truncate leading-snug',
                          h.level === 1 ? 'font-medium' : '',
                        )}
                      >
                        {h.text || '（无标题）'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Strip：始终可见的 mini-map 横线 */}
        <div
          className={cn(
            'flex flex-col items-end gap-1.5 py-2 pr-1 pl-3',
            // 半透明背景，让 hover 区域更明显但不抢眼
            'rounded-full',
            'transition-colors duration-150',
            'group-hover/minimap:bg-popover/40',
          )}
          aria-label="页面大纲"
        >
          {headings.map((h) => {
            const isActive = h.id === effectiveActiveId
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => jumpAction(h.id)}
                aria-label={h.text}
                title={h.text}
                className={cn(
                  'h-[3px] rounded-full transition-all duration-150',
                  BAR_WIDTH[h.level] ?? 'w-3',
                  isActive
                    ? 'bg-foreground/70 group-hover/minimap:bg-foreground/80'
                    : 'bg-muted-foreground/30 group-hover/minimap:bg-muted-foreground/60',
                )}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}