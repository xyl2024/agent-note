'use client'

import {
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
  useRef,
} from 'react'
import { Plus, FileText } from 'lucide-react'

// -----------------------------------------------------------------------------
// PageLinkMenuList：「[[」触发的页面搜索菜单
// 模式参考 SlashMenuList：键盘上下/回车选择；onKeyDown 通过 ref 暴露给父级
// -----------------------------------------------------------------------------
export type PageLinkItem = {
  pageId: string | null
  pageTitle: string
}

export type PageLinkMenuRef = {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

type Props = {
  items: PageLinkItem[]
  query: string
  command: (item: PageLinkItem) => void
  createAction: (title: string) => Promise<PageLinkItem>
}

// 「创建新页面」虚拟项的 key
const CREATE_KEY = '__create__'

export const PageLinkMenuList = forwardRef<PageLinkMenuRef, Props>(
  function PageLinkMenuList({ items, query, command, createAction }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [creating, setCreating] = useState(false)
    const wasEmptyRef = useRef(items.length === 0)
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

    // 用 query + 创建项组合作为列表。query 非空 + 无完全匹配 → 末尾加「创建」
    const list: (PageLinkItem & { __create?: boolean })[] = [...items]
    const showCreate =
      query.trim().length > 0 &&
      !items.some(
        (i) => i.pageTitle.toLowerCase() === query.trim().toLowerCase(),
      )
    if (showCreate) {
      list.push({ pageId: null, pageTitle: query.trim(), __create: true })
    }

    // 列表长度变化（异步数据回来了）→ 重置选中到 0
    useEffect(() => {
      const isEmpty = list.length === 0
      if (wasEmptyRef.current && !isEmpty) {
        setSelectedIndex(0)
      } else if (!wasEmptyRef.current && isEmpty) {
        setSelectedIndex(0)
      } else if (
        wasEmptyRef.current === isEmpty &&
        selectedIndex >= list.length
      ) {
        setSelectedIndex(0)
      }
      wasEmptyRef.current = isEmpty
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.length])

    // 选中项变化时滚进视口（max-h-80 容器溢出场景下避免键盘选到看不到的项）
    useEffect(() => {
      const el = buttonRefs.current[selectedIndex]
      el?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    // 键盘处理
    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (creating) return false
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + list.length - 1) % Math.max(1, list.length))
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % Math.max(1, list.length))
          return true
        }
        if (event.key === 'Enter') {
          if (list.length === 0) return false
          void handleSelect(list[selectedIndex] ?? list[0])
          return true
        }
        return false
      },
    }))

    // 选中/创建
    const handleSelect = async (item: (typeof list)[number]) => {
      if (item.__create) {
        setCreating(true)
        try {
          const created = await createAction(item.pageTitle)
          command(created)
        } finally {
          setCreating(false)
        }
      } else {
        command(item)
      }
    }

    if (list.length === 0) {
      return (
        <div className="rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
          正在搜索…
        </div>
      )
    }

    return (
      <div className="z-50 max-h-80 w-80 overflow-y-auto rounded-md border bg-popover p-1 shadow-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((item, idx) => {
          const selected = idx === selectedIndex
          if (item.__create) {
            return (
              <button
                key={CREATE_KEY}
                ref={(el) => {
                  buttonRefs.current[idx] = el
                }}
                type="button"
                disabled={creating}
                onMouseDown={(e) => {
                  e.preventDefault()
                  void handleSelect(item)
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                  selected
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }`}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  创建新页面「<span className="font-medium">{item.pageTitle}</span>」
                </span>
              </button>
            )
          }
          return (
            <button
              key={item.pageId ?? item.pageTitle}
              ref={(el) => {
                buttonRefs.current[idx] = el
              }}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                command(item)
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                selected
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              }`}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.pageTitle}</span>
            </button>
          )
        })}
      </div>
    )
  },
)
