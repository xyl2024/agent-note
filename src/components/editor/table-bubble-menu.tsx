'use client'

import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'

// -----------------------------------------------------------------------------
// TableBubbleMenu：光标在表格内时浮出 7 个操作按钮
//   - 行：插入上方 / 插入下方 / 删除当前行
//   - 列：插入左侧 / 插入右侧 / 删除当前列
//   - 表头：切换首行 header 状态
//
// 仿照 image-bubble-menu.tsx 的写法：onMouseDown 全部 preventDefault 避免失焦。
// 列宽拖拽由 @tiptap/extension-table 的 resizable: true 提供，无需在此暴露按钮。
// -----------------------------------------------------------------------------

type Props = {
  editor: Editor
}

export function TableBubbleMenu({ editor }: Props) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor }) => editor.isActive('table')}
      options={{ placement: 'top' }}
    >
      <div className="table-bubble-menu flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md">
        {/* 行操作分组 */}
        <button
          type="button"
          title="在上方插入行"
          className="rounded px-2 py-1 text-xs hover:bg-accent"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().addRowBefore().run()
          }}
        >
          ⬆行
        </button>
        <button
          type="button"
          title="在下方插入行"
          className="rounded px-2 py-1 text-xs hover:bg-accent"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().addRowAfter().run()
          }}
        >
          ⬇行
        </button>
        <button
          type="button"
          title="删除当前行"
          className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().deleteRow().run()
          }}
        >
          ✕行
        </button>

        <span className="mx-1 h-4 w-px bg-border" />

        {/* 列操作分组 */}
        <button
          type="button"
          title="在左侧插入列"
          className="rounded px-2 py-1 text-xs hover:bg-accent"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().addColumnBefore().run()
          }}
        >
          ⬅列
        </button>
        <button
          type="button"
          title="在右侧插入列"
          className="rounded px-2 py-1 text-xs hover:bg-accent"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().addColumnAfter().run()
          }}
        >
          ➡列
        </button>
        <button
          type="button"
          title="删除当前列"
          className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().deleteColumn().run()
          }}
        >
          ✕列
        </button>

        <span className="mx-1 h-4 w-px bg-border" />

        {/* 表头切换 */}
        <button
          type="button"
          title="切换首行为表头"
          className="rounded px-2 py-1 text-xs hover:bg-accent"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().toggleHeaderRow().run()
          }}
        >
          表头
        </button>
      </div>
    </BubbleMenu>
  )
}