'use client'

import { useEffect, useImperativeHandle, useState, forwardRef } from 'react'
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

/** "图片(外链 URL)" 项的 title，用于 SlashMenuList 拦截走外部 dialog 流程 */
export const EXTERNAL_IMAGE_ITEM_TITLE = '图片(外链 URL)'

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: '图片(外链 URL)',
    description: '插入一张外部图片（https://…）',
    keywords: ['外链', '图片', 'image', 'url'],
    // command 内部 deleteRange 把 "/图片(外链 URL)" 清掉；SlashMenuList 选中该项时
    // 会同时调 onSelectExternalImageAction 打开外链图片 dialog
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run()
    },
  },
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
    title: '分隔线',
    description: '—————',
    keywords: ['divider', 'hr', '分隔', '分割'],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

export type SlashMenuRef = {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

type Props = {
  items: SlashItem[]
  command: (item: SlashItem) => void
  /** 选中 "图片(外链 URL)" 项时调用（由父组件打开外链图片 dialog） */
  onSelectExternalImageAction?: () => void
}

export const SlashMenuList = forwardRef<SlashMenuRef, Props>(function SlashMenuList(
  { items, command, onSelectExternalImageAction },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // items 变化时重置选中
  useEffect(() => setSelectedIndex(0), [items])

  // 选中某项的统一处理：先跑 SLASH_ITEMS 自己的 command（清掉斜杠文本 + 节点操作），
  // 如果是外链图片项，再通知父组件打开 dialog
  const selectItem = (item: SlashItem) => {
    command(item)
    if (item.title === EXTERNAL_IMAGE_ITEM_TITLE) {
      onSelectExternalImageAction?.()
    }
  }

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
          selectItem(items[selectedIndex])
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
    <div className="z-50 max-h-80 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
      {items.map((item, idx) => (
        <button
          key={item.title}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            selectItem(item)
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