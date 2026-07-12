'use client'

import { useState } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Bold, Italic, Strikethrough, Code, ChevronDown } from 'lucide-react'

// -----------------------------------------------------------------------------
// TextBubbleMenu：选中文字时浮出的行内格式化气泡工具条（Notion 风格）
//
// 显示条件（shouldShow）：
//   - 选区非空（真选中文字，非光标）
//   - 代码块内不出（加粗/斜体无意义 + 与 CodeBlockView 冲突）
//   - 图片选中不出（让位 ImageBubbleMenu）
//   - 表格内不出（让位 TableBubbleMenu）
//
// 内容：块类型下拉（正文/H1-3/列表/待办/引用，不含代码块）+ 加粗/斜体/删除线/行内 code
//
// 实现要点：
//   - 所有交互用 onMouseDown + preventDefault，避免编辑器失焦、选区丢失导致气泡消失
//   - 块类型下拉自绘（不用 base-ui DropdownMenu），避免浮层套浮层的焦点/定位坑
//   - mark 按钮用原生 title 提示名称 + 快捷键（不抢焦点、零依赖）
// -----------------------------------------------------------------------------

type Props = {
  editor: Editor
}

// 块类型定义：label 用于下拉项 + 当前态显示；isActive 判定高亮；apply 执行转换
type BlockTypeItem = {
  key: string
  label: string
  isActive: (e: Editor) => boolean
  apply: (e: Editor) => void
}

const BLOCK_TYPES: BlockTypeItem[] = [
  {
    key: 'paragraph',
    label: '正文',
    isActive: (e) =>
      e.isActive('paragraph') &&
      !e.isActive('bulletList') &&
      !e.isActive('orderedList') &&
      !e.isActive('taskList') &&
      !e.isActive('blockquote'),
    apply: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    key: 'h1',
    label: '标题 1',
    isActive: (e) => e.isActive('heading', { level: 1 }),
    apply: (e) => e.chain().focus().setNode('heading', { level: 1 }).run(),
  },
  {
    key: 'h2',
    label: '标题 2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    apply: (e) => e.chain().focus().setNode('heading', { level: 2 }).run(),
  },
  {
    key: 'h3',
    label: '标题 3',
    isActive: (e) => e.isActive('heading', { level: 3 }),
    apply: (e) => e.chain().focus().setNode('heading', { level: 3 }).run(),
  },
  {
    key: 'bulletList',
    label: '无序列表',
    isActive: (e) => e.isActive('bulletList'),
    apply: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    label: '有序列表',
    isActive: (e) => e.isActive('orderedList'),
    apply: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'taskList',
    label: '待办列表',
    isActive: (e) => e.isActive('taskList'),
    apply: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    key: 'blockquote',
    label: '引用',
    isActive: (e) => e.isActive('blockquote'),
    apply: (e) => e.chain().focus().toggleBlockquote().run(),
  },
]

// mark 按钮定义
type MarkItem = {
  key: string
  title: string
  Icon: typeof Bold
  isActive: (e: Editor) => boolean
  toggle: (e: Editor) => void
}

const MARKS: MarkItem[] = [
  {
    key: 'bold',
    title: '加粗 Ctrl+B',
    Icon: Bold,
    isActive: (e) => e.isActive('bold'),
    toggle: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    title: '斜体 Ctrl+I',
    Icon: Italic,
    isActive: (e) => e.isActive('italic'),
    toggle: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: 'strike',
    title: '删除线 Ctrl+Shift+S',
    Icon: Strikethrough,
    isActive: (e) => e.isActive('strike'),
    toggle: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    key: 'code',
    title: '行内代码 Ctrl+E',
    Icon: Code,
    isActive: (e) => e.isActive('code'),
    toggle: (e) => e.chain().focus().toggleCode().run(),
  },
]

export function TextBubbleMenu({ editor }: Props) {
  const [typeOpen, setTypeOpen] = useState(false)

  const current = BLOCK_TYPES.find((t) => t.isActive(editor)) ?? BLOCK_TYPES[0]

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor, state }) => {
        if (state.selection.empty) return false
        if (editor.isActive('codeBlock')) return false
        if (editor.isActive('image')) return false
        if (editor.isActive('table')) return false
        return true
      }}
      options={{ placement: 'top' }}
    >
      <div className="text-bubble-menu flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md">
        {/* 块类型下拉（自绘） */}
        <div className="relative">
          <button
            type="button"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
            onMouseDown={(e) => {
              e.preventDefault()
              setTypeOpen((v) => !v)
            }}
          >
            {current.label}
            <ChevronDown className="size-3 opacity-60" />
          </button>
          {typeOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-32 rounded-md border bg-popover p-1 shadow-md">
              {BLOCK_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={
                    'block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent' +
                    (t.isActive(editor)
                      ? ' bg-accent text-accent-foreground'
                      : '')
                  }
                  onMouseDown={(e) => {
                    e.preventDefault()
                    t.apply(editor)
                    setTypeOpen(false)
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 分隔线 */}
        <div className="mx-0.5 h-4 w-px bg-border" />

        {/* mark 按钮 */}
        {MARKS.map(({ key, title, Icon, isActive, toggle }) => (
          <button
            key={key}
            type="button"
            title={title}
            className={
              'rounded p-1.5 hover:bg-accent' +
              (isActive(editor) ? ' bg-accent text-accent-foreground' : '')
            }
            onMouseDown={(e) => {
              e.preventDefault()
              toggle(editor)
            }}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    </BubbleMenu>
  )
}
