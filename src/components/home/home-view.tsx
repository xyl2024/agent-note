'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react'
import type { Page } from '@/db/schema'
import { resolveIcon } from '@/lib/icon-resolver'
import { cn } from '@/lib/utils'
import { PageTreeRow } from './page-tree-row'

// -----------------------------------------------------------------------------
// HomeView：首页（Notion / Linear 风格）
// 不接管路由 / 不持有编辑器；纯展示 + 触发回调
//
// 数据策略：
// - SSR 阶段把 pages 列表和初始 stats 一起注入（首屏立即可见）
// - 客户端 mount 后每 30s 重新拉一次 stats，让「最近编辑」保持新鲜
//   （用户在新页面写完跳回首页时也能看到）
//
// 布局：
//   ┌────────────────────────────────────────────────┐
//   │  [Hero：欢迎语 + 日期]                          │
//   │  [Quick Actions：搜索 / 新建]                   │
//   │  [Stats：3 张统计卡片]                          │
//   │  [Recent：最近编辑列表]                         │
//   │  [All Pages：树形概览]                          │
//   └────────────────────────────────────────────────┘
// -----------------------------------------------------------------------------

export type HomeViewStats = {
  totalPages: number
  totalBlocks: number
  weekNewPages: number
  recentPages: Array<{
    id: string
    title: string
    iconType: string | null
    iconValue: string | null
    parentId: string | null
    updatedAt: Date | string
    createdAt: Date | string
    blockCount: number
  }>
}

type Props = {
  initialPages: Page[]
  initialStats: HomeViewStats
  onSelectAction: (id: string) => void
  onOpenSearchAction: () => void
  createPageAction: (title: string) => Promise<Page>
  onPagesChangedAction: () => Promise<void>
}

const REFRESH_INTERVAL_MS = 30_000

function formatGreeting(date: Date): string {
  const h = date.getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function formatLongDate(date: Date): string {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekdays[date.getDay()]}`
}

function formatRelativeTime(input: Date | string): string {
  const t = new Date(input).getTime()
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 天前`
  const wk = Math.floor(day / 7)
  if (wk < 4) return `${wk} 周前`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo} 个月前`
  return `${Math.floor(day / 365)} 年前`
}

// 树形结构（与 sidebar 共享同一份算法）
export type HomePageNode = Page & {
  children: HomePageNode[]
  blockCount: number
}

function buildHomeTree(pages: Page[], recent: HomeViewStats['recentPages']): HomePageNode[] {
  const blockCountMap = new Map<string, number>()
  recent.forEach((r) => blockCountMap.set(r.id, r.blockCount))

  const byId = new Map<string, HomePageNode>()
  pages.forEach((p) => byId.set(p.id, { ...p, children: [], blockCount: blockCountMap.get(p.id) ?? 0 }))
  const roots: HomePageNode[] = []
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortByUpdated = (a: HomePageNode, b: HomePageNode) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  roots.sort(sortByUpdated)
  byId.forEach((n) => n.children.sort(sortByUpdated))
  return roots
}

export function HomeView({
  initialPages,
  initialStats,
  onSelectAction,
  onOpenSearchAction,
  createPageAction,
  onPagesChangedAction,
}: Props) {
  const [stats, setStats] = useState<HomeViewStats>(initialStats)
  const [pages, setPages] = useState<Page[]>(initialPages)
  const [creating, setCreating] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  // mount 后才计算「now」，避免 hydration mismatch（SSR / 客户端时区/时间不同）
  useEffect(() => {
    setNow(new Date())
  }, [])

  // 周期性刷新 stats（让「最近编辑」保持新鲜，但不要太频繁）
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const [statsRes, pagesRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/pages'),
        ])
        if (statsRes.ok) {
          const data = (await statsRes.json()) as HomeViewStats
          setStats(data)
        }
        if (pagesRes.ok) {
          const data = (await pagesRes.json()) as { pages: Page[] }
          setPages(data.pages)
        }
      } catch {
        // ignore
      }
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  const tree = useMemo(() => buildHomeTree(pages, stats.recentPages), [pages, stats.recentPages])

  const handleCreateAction = async () => {
    if (creating) return
    setCreating(true)
    try {
      const page = await createPageAction('Untitled')
      await onPagesChangedAction()
      onSelectAction(page.id)
    } finally {
      setCreating(false)
    }
  }

  const greeting = now ? formatGreeting(now) : '你好'
  const longDate = now ? formatLongDate(now) : ''

  return (
    <div className="home-root mx-auto w-full max-w-4xl px-8 py-10 sm:px-12 sm:py-14">
      {/* ───────────── Hero ───────────── */}
      <section className="home-hero mb-10 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span>Agent Note</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {longDate || '准备好开始记录今天的想法了吗？'}
          </p>
        </div>
      </section>

      {/* ───────────── Quick Actions ───────────── */}
      <section className="home-quick mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onOpenSearchAction}
          className="home-card group flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-all hover:border-foreground/20 hover:shadow-sm"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Search className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">搜索</span>
            <span className="block text-xs text-muted-foreground">
              查找页面与内容
            </span>
          </span>
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={handleCreateAction}
          disabled={creating}
          className="home-card group flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-all hover:border-foreground/20 hover:shadow-sm disabled:opacity-50"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Plus className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">新建页面</span>
            <span className="block text-xs text-muted-foreground">
              从空白开始书写
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>

        <div className="home-card flex items-center gap-3 rounded-xl border bg-card px-4 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">今日记录</span>
            <span className="block text-xs text-muted-foreground">
              {stats.weekNewPages > 0
                ? `近 7 天新增 ${stats.weekNewPages} 篇`
                : '近 7 天暂无新增'}
            </span>
          </span>
        </div>
      </section>

      {/* ───────────── Stats ───────────── */}
      <section className="home-stats mb-10 grid grid-cols-3 gap-3">
        <StatCard
          label="全部页面"
          value={stats.totalPages}
          accent="from-blue-500/8 to-blue-500/0"
        />
        <StatCard
          label="全部内容块"
          value={stats.totalBlocks}
          accent="from-violet-500/8 to-violet-500/0"
        />
        <StatCard
          label="近 7 天新增"
          value={stats.weekNewPages}
          accent="from-emerald-500/8 to-emerald-500/0"
        />
      </section>

      {/* ───────────── Recent ───────────── */}
      <section className="home-section mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">最近编辑</h2>
          <span className="text-xs text-muted-foreground">
            按更新时间倒序 · 前 {stats.recentPages.length} 条
          </span>
        </div>
        {stats.recentPages.length === 0 ? (
          <div className="home-empty rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              还没有任何页面。点击上方「新建页面」开始书写。
            </p>
          </div>
        ) : (
          <ul className="home-list overflow-hidden rounded-xl border bg-card">
            {stats.recentPages.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelectAction(p.id)}
                  className={cn(
                    'group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                    i !== 0 && 'border-t',
                  )}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/60 text-base">
                    {resolveIcon(
                      p.iconType as never,
                      p.iconValue,
                    ) ?? <FileText className="h-4 w-4 text-muted-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {p.title || 'Untitled'}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatRelativeTime(p.updatedAt)}</span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                      <span>{p.blockCount} 个内容块</span>
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ───────────── All Pages (tree) ───────────── */}
      <section className="home-section">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">全部页面</h2>
          <span className="text-xs text-muted-foreground">共 {tree.length} 个根页面</span>
        </div>
        {tree.length === 0 ? (
          <div className="home-empty rounded-xl border border-dashed bg-card/50 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">还没有任何页面。</p>
          </div>
        ) : (
          <div className="home-list overflow-hidden rounded-xl border bg-card">
            {tree.map((node, i) => (
              <div
                key={node.id}
                className={cn(i !== 0 && 'border-t')}
              >
                <PageTreeRow
                  node={node}
                  depth={0}
                  onSelectAction={onSelectAction}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// StatCard：单张统计卡（hero 风格：数字超大、底部 label）
// -----------------------------------------------------------------------------
function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="home-stat relative overflow-hidden rounded-xl border bg-card p-4">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br',
          accent,
        )}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1.5 text-3xl font-bold tracking-tight tabular-nums">
          {value}
        </div>
      </div>
    </div>
  )
}