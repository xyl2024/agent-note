'use client'

import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'

type UseEditorScrollFollowOpts = {
  scrollMargin?: number
  onUpdateBehavior?: ScrollBehavior
  onSelectionBehavior?: ScrollBehavior
}

export function useEditorScrollFollow(
  editor: Editor | null,
  opts: UseEditorScrollFollowOpts = {},
): void {
  const {
    scrollMargin = 50,
    onUpdateBehavior = 'smooth',
    onSelectionBehavior = 'auto',
  } = opts

  const containerRef = useRef<HTMLElement | null>(null)
  const userScrolledAwayRef = useRef(false)
  const selfScrollGuardRef = useRef(false)

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const view = editor.view
    const container = view.dom.closest<HTMLElement>(
      '[data-editor-scroll-container]',
    )
    if (!container) return
    containerRef.current = container

    const handleScroll = () => {
      if (selfScrollGuardRef.current) return
      userScrolledAwayRef.current = true
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const view = editor.view
    const container = containerRef.current
    if (!container) return

    const ensureCaretVisible = (behavior: ScrollBehavior) => {
      if (userScrolledAwayRef.current) return
      if (!view.hasFocus()) return
      const caret = view.coordsAtPos(view.state.selection.from)
      const cRect = container.getBoundingClientRect()
      const margin = view.someProp('scrollMargin', scrollMargin) ?? scrollMargin
      const bottomLimit = cRect.bottom - margin
      if (caret.bottom <= bottomLimit && caret.top >= cRect.top) return
      const overflow = caret.bottom - bottomLimit
      const desiredScrollTop = container.scrollTop + overflow
      selfScrollGuardRef.current = true
      container.scrollTo({ top: desiredScrollTop, behavior })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          selfScrollGuardRef.current = false
        })
      })
    }

    const onUpdate = () => {
      userScrolledAwayRef.current = false
      ensureCaretVisible(onUpdateBehavior)
    }
    const onSelectionUpdate = () => {
      ensureCaretVisible(onSelectionBehavior)
    }

    editor.on('update', onUpdate)
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      editor.off('update', onUpdate)
      editor.off('selectionUpdate', onSelectionUpdate)
    }
  }, [editor, scrollMargin, onUpdateBehavior, onSelectionBehavior])
}