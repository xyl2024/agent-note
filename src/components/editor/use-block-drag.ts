'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'

// -----------------------------------------------------------------------------
// useBlockDrag
//
// 同页顶层 block 拖动重排的引擎。挂到编辑器外层容器（与 EditorContent 同级）
// 和每个 block 的 grip 按钮上。
//
// 数据流：
//   mousedown grip → dragstart → dataTransfer 写入 { pageId, fromPos, nodeSize }
//     → dragover 容器 → 计算 hoverInfo（哪一块的上半 / 下半区）
//     → drop 容器 → tr.delete(fromPos, fromPos+nodeSize) + tr.insert(target, node)
//     → dragend grip → 若 dropEffect === 'none'（drop 没成功）则回滚状态
//
// 关键设计：
//   - 零新依赖：纯 HTML5 DnD + Tiptap 命令
//   - 不动 schema / 不动 NodeView：position 计算走 view.nodeDOM(pos)
//   - 不动现有 onUpdate 保存：onUpdate 会自动响应我们的 transaction 并触发
//     debounced PUT；order 字段由 tiptapDocToSaveBlocks 用 idx 重写（接受）
// -----------------------------------------------------------------------------

const DRAG_MIME = 'application/x-block-move'
const SCROLL_EDGE_THRESHOLD = 40 // px：距视口边多远开始自动滚
const SCROLL_SPEED = 8 // px / frame

export type GripPosition = {
  /** PM doc 中该顶层节点的起始位置 */
  blockPos: number
  /** 节点总尺寸（含开闭标签） */
  nodeSize: number
  /** 相对容器 scrollTop 的 top 坐标（用于 absolute 定位 grip） */
  top: number
  /** block 渲染高度 */
  height: number
  /** 相对容器的 midY，用于判断 above / below */
  midY: number
}

export type DropTarget = {
  blockIndex: number
  position: 'above' | 'below'
}

export type BlockDragState = {
  draggingIndex: number | null
  hoverInfo: DropTarget | null
}

export type UseBlockDragResult = {
  positions: GripPosition[]
  dragState: BlockDragState
  /** 当前 hover 的 block index（null = 无）；用于单 block 维度 grip 显形 */
  hoveredIndex: number | null
  onGripDragStart: (blockIndex: number, e: React.DragEvent) => void
  onGripDragEnd: (e: React.DragEvent) => void
  onContainerDragOver: (e: React.DragEvent) => void
  onContainerDrop: (e: React.DragEvent) => void
}

export function useBlockDrag(
  editor: Editor | null,
  pageId: string,
  containerRef: React.RefObject<HTMLElement | null>,
): UseBlockDragResult {
  const [positions, setPositions] = useState<GripPosition[]>([])
  const [dragState, setDragState] = useState<BlockDragState>({
    draggingIndex: null,
    hoverInfo: null,
  })
  // 当前 hover 的 block index（null = 无）；驱动 grip 单 block 维度显形
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // 用 ref 让 listener 内读到最新值，避免每次重绑
  const positionsRef = useRef<GripPosition[]>([])
  const dragStateRef = useRef<BlockDragState>(dragState)
  const editorRef = useRef<Editor | null>(editor)
  const pageIdRef = useRef<string>(pageId)
  const rafRef = useRef<number | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  // 把外部传入的 containerRef.current 锁到本地 ref（每次 render 后同步），
  // 这样回调内部直接读稳定 ref，避开 react-hooks 对 prop ref 的误判
  // 注意：useRef 初值不能直接读 containerRef.current（render 阶段禁止访问 ref）
  const containerElRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    containerElRef.current = containerRef.current
  })

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])
  useEffect(() => {
    dragStateRef.current = dragState
  }, [dragState])
  useEffect(() => {
    editorRef.current = editor
  }, [editor])
  useEffect(() => {
    pageIdRef.current = pageId
  }, [pageId])

  // ---------------------------------------------------------------------------
  // 位置计算
  // 每次 editor transaction / scroll / resize 都重算 grip 的 y 坐标
  // ---------------------------------------------------------------------------
  const computePositions = useCallback(() => {
    const ed = editorRef.current
    const container = containerElRef.current
    if (!ed || ed.isDestroyed || !container) return
    const containerRect = container.getBoundingClientRect()
    const scrollTop = container.scrollTop
    const next: GripPosition[] = []
    let pos = 0
    ed.state.doc.forEach((node) => {
      const dom = ed.view.nodeDOM(pos) as HTMLElement | null
      const rect = dom?.getBoundingClientRect()
      if (rect) {
        // 把视口坐标转成容器内容坐标（加回 scrollTop），让 grip 跟着滚
        const top = rect.top - containerRect.top + scrollTop
        next.push({
          blockPos: pos,
          nodeSize: node.nodeSize,
          top,
          height: rect.height,
          midY: top + rect.height / 2,
        })
      }
      pos += node.nodeSize
    })
    setPositions(next)
  }, [])

  // ---------------------------------------------------------------------------
  // 订阅 editor + scroll + resize
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const ed = editor

    // 首次计算（onCreate 后 view 已挂载，但 DOM 测量需要等下一帧）
    const initialTimer = window.setTimeout(computePositions, 0)

    const onChange = () => computePositions()
    ed.on('update', onChange)
    ed.on('selectionUpdate', onChange)

    const container = containerElRef.current
    let resizeObserver: ResizeObserver | null = null
    if (container) {
      container.addEventListener('scroll', onChange, { passive: true })
      // 监听 EditorContent 整体尺寸变化（图片加载 / 代码块换行都会触发）
      resizeObserver = new ResizeObserver(onChange)
      resizeObserver.observe(ed.view.dom)
    }

    return () => {
      window.clearTimeout(initialTimer)
      ed.off('update', onChange)
      ed.off('selectionUpdate', onChange)
      if (container) container.removeEventListener('scroll', onChange)
      resizeObserver?.disconnect()
    }
  }, [editor, computePositions])

  // ---------------------------------------------------------------------------
  // 单 block 维度 hover 跟踪：监听 .tiptap 上的 mousemove，根据 clientY 用
  // gripPositions.midY 二分定位当前在哪个 block 范围内，驱动单个 grip 显形
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const ed = editor
    const viewDom = ed.view.dom

    const resolveIndex = (clientY: number): number | null => {
      const container = containerElRef.current
      const list = positionsRef.current
      if (!container || list.length === 0) return null
      const rect = container.getBoundingClientRect()
      const y = clientY - rect.top + container.scrollTop
      for (let i = 0; i < list.length; i++) {
        if (y < list[i].midY) return i
      }
      return list.length - 1
    }

    const handleMove = (e: MouseEvent) => {
      const idx = resolveIndex(e.clientY)
      // 用 ref 比较避免 setState 同值
      // 这里读 hoveredIndex 当前值通过 state setter 的 functional form
      setHoveredIndex((prev) => (prev === idx ? prev : idx))
    }

    const onMove = (e: MouseEvent) => {
      if (hoverRafRef.current != null) return
      hoverRafRef.current = requestAnimationFrame(() => {
        handleMove(e)
        hoverRafRef.current = null
      })
    }

    const onLeave = () => {
      if (hoverRafRef.current != null) {
        cancelAnimationFrame(hoverRafRef.current)
        hoverRafRef.current = null
      }
      setHoveredIndex(null)
    }

    viewDom.addEventListener('mousemove', onMove)
    viewDom.addEventListener('mouseleave', onLeave)
    return () => {
      viewDom.removeEventListener('mousemove', onMove)
      viewDom.removeEventListener('mouseleave', onLeave)
      if (hoverRafRef.current != null) {
        cancelAnimationFrame(hoverRafRef.current)
        hoverRafRef.current = null
      }
    }
  }, [editor])

  // ---------------------------------------------------------------------------
  // 拖动结束时统一清理：恢复 editable、清空 state、移除 .dragging-source
  // ---------------------------------------------------------------------------
  const cleanupDrag = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const ed = editorRef.current
    if (ed && !ed.isDestroyed) {
      ed.setEditable(true)
    }
    setDragState({ draggingIndex: null, hoverInfo: null })
    document
      .querySelectorAll('.dragging-source')
      .forEach((el) => el.classList.remove('dragging-source'))
  }, [])

  // 组件卸载时兜底
  useEffect(() => cleanupDrag, [cleanupDrag])

  // ---------------------------------------------------------------------------
  // 边缘自动滚动：拖到容器顶部 / 底部 40px 内时每帧 scroll 8px
  // ---------------------------------------------------------------------------
  const ensureAutoScroll = useCallback(
    (clientY: number) => {
      const container = containerElRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const fromTop = clientY - rect.top
      const fromBottom = rect.bottom - clientY
      let dy = 0
      if (fromTop < SCROLL_EDGE_THRESHOLD) {
        dy = -SCROLL_SPEED * (1 - Math.max(0, fromTop) / SCROLL_EDGE_THRESHOLD)
      } else if (fromBottom < SCROLL_EDGE_THRESHOLD) {
        dy = SCROLL_SPEED * (1 - Math.max(0, fromBottom) / SCROLL_EDGE_THRESHOLD)
      }
      if (dy !== 0 && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          container.scrollBy({ top: dy, behavior: 'auto' })
          rafRef.current = null
        })
      }
    },
    [],
  )

  // ---------------------------------------------------------------------------
  // Grip dragstart：写 dataTransfer + 进入拖动态
  // ---------------------------------------------------------------------------
  const onGripDragStart = useCallback(
    (blockIndex: number, e: React.DragEvent) => {
      const ed = editorRef.current
      if (!ed || ed.isDestroyed) return
      const pos = positionsRef.current[blockIndex]
      if (!pos) {
        e.preventDefault()
        return
      }
      const dt = e.dataTransfer
      if (!dt) return
      dt.setData(
        DRAG_MIME,
        JSON.stringify({
          pageId: pageIdRef.current,
          fromPos: pos.blockPos,
          nodeSize: pos.nodeSize,
        }),
      )
      dt.effectAllowed = 'move'
      setDragState({ draggingIndex: blockIndex, hoverInfo: null })
      // 拖动期间禁用编辑（防误触文本修改）
      ed.setEditable(false)
      // 源块半透明
      const srcDom = ed.view.nodeDOM(pos.blockPos) as HTMLElement | null
      if (srcDom) srcDom.classList.add('dragging-source')
    },
    [],
  )

  // ---------------------------------------------------------------------------
  // Grip dragend：dropEffect === 'none' 表示 drop 没成功 → 回滚
  // ---------------------------------------------------------------------------
  const onGripDragEnd = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer?.dropEffect === 'none') {
        cleanupDrag()
      }
    },
    [cleanupDrag],
  )

  // ---------------------------------------------------------------------------
  // 容器 dragover：根据鼠标 y 找最近 block + above/below
  // ---------------------------------------------------------------------------
  const onContainerDragOver = useCallback(
    (e: React.DragEvent) => {
      const ed = editorRef.current
      if (!ed || ed.isDestroyed) return
      const types = e.dataTransfer?.types
      if (!types || !Array.from(types).includes(DRAG_MIME)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

      const container = containerElRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const y = e.clientY - rect.top + container.scrollTop
      const list = positionsRef.current

      let hoverInfo: DropTarget | null = null
      for (let i = 0; i < list.length; i++) {
        if (y < list[i].midY) {
          hoverInfo = { blockIndex: i, position: 'above' }
          break
        }
      }
      if (!hoverInfo && list.length > 0) {
        hoverInfo = { blockIndex: list.length - 1, position: 'below' }
      }

      setDragState((s) => {
        if (s.draggingIndex == null) return s
        const cur = s.hoverInfo
        if (
          cur &&
          cur.blockIndex === hoverInfo?.blockIndex &&
          cur.position === hoverInfo?.position
        ) {
          return s
        }
        return { ...s, hoverInfo }
      })

      ensureAutoScroll(e.clientY)
    },
    [ensureAutoScroll],
  )

  // ---------------------------------------------------------------------------
  // 容器 drop：tr.delete + tr.insert
  // ---------------------------------------------------------------------------
  const onContainerDrop = useCallback(
    (e: React.DragEvent) => {
      const ed = editorRef.current
      if (!ed || ed.isDestroyed) return
      const raw = e.dataTransfer?.getData(DRAG_MIME)
      if (!raw) return
      e.preventDefault()

      let payload: { pageId: string; fromPos: number; nodeSize: number }
      try {
        payload = JSON.parse(raw)
      } catch {
        cleanupDrag()
        return
      }
      // 跨页（理论上不该发生；防御性）
      if (payload.pageId !== pageIdRef.current) {
        cleanupDrag()
        return
      }
      const { fromPos, nodeSize } = payload
      const hoverInfo = dragStateRef.current.hoverInfo
      if (!hoverInfo) {
        cleanupDrag()
        return
      }
      const list = positionsRef.current
      const target = list[hoverInfo.blockIndex]
      if (!target) {
        cleanupDrag()
        return
      }
      let insertPos =
        hoverInfo.position === 'above'
          ? target.blockPos
          : target.blockPos + target.nodeSize

      // no-op：drop 落点等于源位置（drop 在自己头上）
      if (insertPos === fromPos || insertPos === fromPos + nodeSize) {
        cleanupDrag()
        return
      }

      const tr = ed.state.tr
      const node = tr.doc.nodeAt(fromPos)
      if (!node) {
        cleanupDrag()
        return
      }
      tr.delete(fromPos, fromPos + nodeSize)
      // 删除在 insertPos 之前会让目标位置前移 nodeSize
      if (fromPos < insertPos) insertPos -= nodeSize
      tr.insert(insertPos, node)
      // 光标落到被移块开头
      const selPos = insertPos + 1
      if (selPos <= tr.doc.content.size) {
        tr.setSelection(TextSelection.create(tr.doc, selPos))
      }
      ed.view.dispatch(tr)
      cleanupDrag()
    },
    [cleanupDrag],
  )

  return {
    positions,
    dragState,
    hoveredIndex,
    onGripDragStart,
    onGripDragEnd,
    onContainerDragOver,
    onContainerDrop,
  }
}