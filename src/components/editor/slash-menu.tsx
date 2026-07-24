'use client'

import { useEffect, useImperativeHandle, useState, forwardRef, useRef } from 'react'
import type { Editor } from '@tiptap/react'

// -----------------------------------------------------------------------------
// SlashCommandList：斜杠菜单的内容列表（被父组件通过 ref 调用）
// -----------------------------------------------------------------------------
export type SlashItem = {
  title: string
  description: string
  keywords: string[]
  command: (props: { editor: Editor; range: { from: number; to: number } }) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: '正文',
    description: '普通段落',
    keywords: ['paragraph', 'text', 'p', '正文'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('paragraph').run()
    },
  },
  {
    title: '一级标题',
    description: '大标题',
    keywords: ['h1', 'heading', '标题'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: '二级标题',
    description: '中标题',
    keywords: ['h2', 'heading'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: '三级标题',
    description: '小标题',
    keywords: ['h3', 'heading'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: '四级标题',
    description: '次标题',
    keywords: ['h4', 'heading'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 4 }).run()
    },
  },
  {
    title: '五级标题',
    description: '小节标题',
    keywords: ['h5', 'heading'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 5 }).run()
    },
  },
  {
    title: '六级标题',
    description: '细分标题',
    keywords: ['h6', 'heading'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 6 }).run()
    },
  },
  {
    title: '无序列表',
    description: '• 列表项',
    keywords: ['bullet', 'list', 'ul', '无序'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: '有序列表',
    description: '1. 列表项',
    keywords: ['ordered', 'list', 'ol', '有序'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: '待办',
    description: '☐ 待办事项',
    keywords: ['todo', 'task', '待办', 'checkbox'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: '引用',
    description: '" 引言"',
    keywords: ['quote', 'blockquote', '引用'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: '代码块',
    description: '```代码```',
    keywords: ['code', 'codeblock', '代码'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCodeBlock().run()
    },
  },
  {
    title: 'Mermaid 图',
    description: '用 Mermaid 语法画流程图/时序图',
    keywords: ['mermaid', 'flowchart', 'sequence', 'graph', '图', '流程'],
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        // 先插入默认 java 的 codeBlock，再改 language= mermaid
        .setCodeBlock()
        .updateAttributes('codeBlock', { language: 'mermaid' })
        .run()
    },
  },
  {
    title: '分隔线',
    description: '—————',
    keywords: ['divider', 'hr', '分隔', '分割'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: '表格',
    description: '▦ 3×3 对比表',
    keywords: ['table', '表格', '对比', 'grid'],
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
]

export type SlashMenuRef = {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

type Props = {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

export const SlashMenuList = forwardRef<SlashMenuRef, Props>(function SlashMenuList(
  { items, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // items 变化时重置选中
  useEffect(() => setSelectedIndex(0), [items])

  // 选中项变化时滚进视口（max-h-80 容器溢出场景下避免键盘选到看不到的项）
  useEffect(() => {
    const el = buttonRefs.current[selectedIndex]
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // 键盘上下/回车事件
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        if (items[selectedIndex]) {
          command(items[selectedIndex])
        }
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div className="rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
        没有匹配的块类型
      </div>
    )
  }

  return (
    <div className="z-50 max-h-80 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item, idx) => (
        <button
          key={item.title}
          ref={(el) => {
            buttonRefs.current[idx] = el
          }}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            command(item)
          }}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={`flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-sm ${
            idx === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50'
          }`}
        >
          <span className="font-medium">{item.title}</span>
          <span className="text-xs text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  )
})