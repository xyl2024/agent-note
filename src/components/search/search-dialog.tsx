'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'

// -----------------------------------------------------------------------------
// 搜索弹窗（Cmd+K / Ctrl+K 触发）
//
// UI：shadcn Command + CommandDialog（cmdk 内置 fuzzy filter + keyboard nav）
// 数据：GET /api/search?q=<query> → { pages: [...], blocks: [...] }
//
// 设计要点：
// - 两个分组：「页面标题」+「内容片段」
// - 点击任何一项 → 跳转到对应 pageId + 关弹窗
// - Esc 关闭，Cmd+K / Ctrl+K 切换开关
// - 空 query 时显示「开始输入搜索…」（不主动拉 API）
// - 防抖 150ms，避免每个 keystroke 都打 API
// -----------------------------------------------------------------------------

type PageHit = { pageId: string; title: string }
type BlockHit = { blockId: string; pageId: string; snippet: string }

type Props = {
  open: boolean
  onOpenChangeAction: (open: boolean) => void
  onSelectPageAction: (pageId: string) => void
}

export function SearchDialog({ open, onOpenChangeAction, onSelectPageAction }: Props) {
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState<PageHit[]>([])
  const [blocks, setBlocks] = useState<BlockHit[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // query 变化时拉搜索结果（防抖 150ms）
  useEffect(() => {
    if (!open) return
    if (!query.trim()) {
      setPages([])
      setBlocks([])
      setLoading(false)
      return
    }

    setLoading(true)
    const t = setTimeout(() => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ pages: PageHit[]; blocks: BlockHit[] }>)
        .then((data) => {
          setPages(data.pages ?? [])
          setBlocks(data.blocks ?? [])
          setLoading(false)
        })
        .catch((e) => {
          if (e?.name !== 'AbortError') {
            console.error('search failed', e)
            setLoading(false)
          }
        })
    }, 150)

    return () => clearTimeout(t)
  }, [query, open])

  // 打开时清空上次结果（避免旧结果显示在搜索框空态）
  useEffect(() => {
    if (open) {
      setQuery('')
      setPages([])
      setBlocks([])
    }
  }, [open])

  const total = pages.length + blocks.length
  const showEmpty = !loading && query.trim().length > 0 && total === 0

  return (
    <CommandDialog open={open} onOpenChange={onOpenChangeAction} title="搜索" description="搜索笔记">
      <CommandInput
        placeholder="搜索页面或内容…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {showEmpty && <CommandEmpty>没有匹配项</CommandEmpty>}
        {loading && !showEmpty && (
          <div className="py-6 text-center text-xs text-muted-foreground">搜索中…</div>
        )}
        {!loading && pages.length > 0 && (
          <CommandGroup heading="页面">
            {pages.map((p) => (
              <CommandItem
                key={`p-${p.pageId}`}
                value={`page:${p.title}:${p.pageId}`}
                onSelect={() => {
                  onSelectPageAction(p.pageId)
                  onOpenChangeAction(false)
                }}
              >
                <FileText className="text-muted-foreground" />
                <span className="truncate">{p.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!loading && blocks.length > 0 && (
          <CommandGroup heading="内容">
            {blocks.map((b) => (
              <CommandItem
                key={`b-${b.blockId}`}
                value={`block:${b.snippet}:${b.blockId}`}
                onSelect={() => {
                  onSelectPageAction(b.pageId)
                  onOpenChangeAction(false)
                }}
              >
                <Search className="text-muted-foreground" />
                <span
                  className="truncate"
                  // FTS5 snippet 已含 <mark>...</mark>，用 dangerouslySetInnerHTML 渲染高亮
                  dangerouslySetInnerHTML={{ __html: b.snippet }}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!query.trim() && !loading && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            输入关键词搜索…
            <div className="mt-2 flex items-center justify-center gap-1">
              <CommandShortcut>↑↓ 选择</CommandShortcut>
              <CommandShortcut>↵ 跳转</CommandShortcut>
              <CommandShortcut>Esc 关闭</CommandShortcut>
            </div>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  )
}