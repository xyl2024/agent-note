'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'

// -----------------------------------------------------------------------------
// ImageBubbleMenu：选中 image 节点时浮出 3 个操作按钮
//   - 改 alt → 由父组件打开 ExternalImageDialog(mode='edit-alt')
//   - 改 src → 由父组件打开 ExternalImageDialog(mode='edit-src')
//   - 删除 → editor.chain().focus().deleteSelection().run()
//
// 父组件需提供：
//   - editor: Tiptap Editor 实例
//   - onRequestEditAction: (mode) => void,打开 dialog(mode='edit-alt' | 'edit-src')
// -----------------------------------------------------------------------------

type EditMode = 'edit-alt' | 'edit-src'

type Props = {
  editor: Editor
  onRequestEditAction: (mode: EditMode) => void
}

export function ImageBubbleMenu({ editor, onRequestEditAction }: Props) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor }) => editor.isActive('image')}
      options={{ placement: 'top' }}
    >
      <div className="image-bubble-menu flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md">
        <button
          type="button"
          className="rounded px-2 py-1 text-xs hover:bg-accent"
          onMouseDown={(e) => {
            e.preventDefault()
            onRequestEditAction('edit-alt')
          }}
        >
          改 alt
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs hover:bg-accent"
          onMouseDown={(e) => {
            e.preventDefault()
            onRequestEditAction('edit-src')
          }}
        >
          改 src
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().deleteSelection().run()
          }}
        >
          删除
        </button>
      </div>
    </BubbleMenu>
  )
}