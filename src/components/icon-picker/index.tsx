'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Smile, Shapes, X, Dices, Search as SearchIcon } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ICON_CATEGORIES, ICON_COMPONENTS, searchIcons } from '@/lib/lucide-icons'
import type { IconType } from '@/db/schema'

// -----------------------------------------------------------------------------
// IconPicker：给页面设置 emoji / lucide icon 的选择器
// - Popover 容器
// - Tab 切换：Emoji / Icon
// - Emoji tab 用 @emoji-mart/react 的 Picker（自带搜索 + 类别 + 最近使用）
// - Icon tab 用 lucide 静态分类 + 名字搜索
// - 顶部「随机 emoji」+ 底部「移除 icon」辅助操作
//
// props:
//   value: { iconType, iconValue }
//   onChange(next): 用户选了新 icon 后触发（外部负责持久化）
//   open / onOpenChange: 受控开关
// -----------------------------------------------------------------------------

const EmojiPicker = dynamic(
  () => import('@emoji-mart/react').then((m) => m.default),
  { ssr: false, loading: () => <div className="h-80 w-full animate-pulse rounded bg-muted" /> },
)

type Value = { iconType: IconType | null; iconValue: string | null }

type Props = {
  value: Value
  onChangeAction: (next: Value) => void
  open: boolean
  onOpenChangeAction: (open: boolean) => void
  trigger: React.ReactElement
}

// 200+ 个常用 emoji，用于「随机」按钮
const RANDOM_EMOJI_POOL = [
  '📚', '📝', '💡', '🎯', '🚀', '✨', '🔥', '⭐', '🌟', '💎',
  '🎨', '🎭', '🎪', '🎬', '🎵', '🎸', '🎲', '🎮', '🎯', '🏆',
  '🌍', '🌱', '🌿', '🌵', '🌸', '🌺', '🌻', '🌷', '🌹', '🍀',
  '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🥑', '🥐',
  '☕', '🍵', '🍺', '🍷', '🥂', '🍰', '🍪', '🍫', '🍩', '🍦',
  '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁',
  '🐸', '🐵', '🐔', '🦄', '🐝', '🦋', '🐌', '🐞', '🐢', '🐙',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖',
  '⚡', '☀️', '🌙', '☁️', '❄️', '🔥', '💧', '🌊', '🌈', '⭐',
  '📌', '📍', '📎', '🔗', '🔒', '🔑', '🗝️', '🔨', '⚙️', '🧩',
  '📷', '📹', '🎙️', '🎧', '📺', '📱', '💻', '⌨️', '🖥️', '🖱️',
  '✏️', '🖊️', '🖌️', '🧮', '📐', '📏', '🧰', '🔍', '🔎', '💼',
]

function pickRandomEmoji(): string {
  return RANDOM_EMOJI_POOL[Math.floor(Math.random() * RANDOM_EMOJI_POOL.length)]!
}

export function IconPicker({
  value,
  onChangeAction,
  open,
  onOpenChangeAction,
  trigger,
}: Props) {
  const [tab, setTab] = useState<'emoji' | 'icon'>(
    value.iconType === 'lucide' ? 'icon' : 'emoji',
  )
  const [iconSearch, setIconSearch] = useState('')

  const isEmoji = value.iconType === 'emoji' && value.iconValue
  const isLucide = value.iconType === 'lucide' && value.iconValue

  return (
    <Popover open={open} onOpenChange={onOpenChangeAction}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="start"
        sideOffset={8}
        className="flex w-[298px] flex-col gap-0 p-0"
      >
        {/* Header: 随机按钮 + 移除按钮 */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onChangeAction({ iconType: 'emoji', iconValue: pickRandomEmoji() })}
          >
            <Dices className="h-3.5 w-3.5" />
            随机
          </Button>
          <div className="flex items-center gap-1">
            {(isEmoji || isLucide) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => onChangeAction({ iconType: null, iconValue: null })}
              >
                <X className="h-3.5 w-3.5" />
                移除
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b px-1.5 py-1.5">
          <button
            type="button"
            onClick={() => setTab('emoji')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === 'emoji'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <Smile className="h-3.5 w-3.5" />
            Emoji
          </button>
          <button
            type="button"
            onClick={() => setTab('icon')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === 'icon'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <Shapes className="h-3.5 w-3.5" />
            图标
          </button>
        </div>

        {/* Content */}
        {tab === 'emoji' ? (
          <EmojiPickerContent
            onSelectAction={(native) =>
              onChangeAction({ iconType: 'emoji', iconValue: native })
            }
          />
        ) : (
          <IconTab
            currentValue={isLucide ? value.iconValue : null}
            search={iconSearch}
            onSearchChangeAction={setIconSearch}
            onSelectAction={(name) =>
              onChangeAction({ iconType: 'lucide', iconValue: name })
            }
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

// -----------------------------------------------------------------------------
// Emoji tab：包一层 emoji-mart 的 Picker
// -----------------------------------------------------------------------------
function EmojiPickerContent({
  onSelectAction,
}: {
  onSelectAction: (native: string) => void
}) {
  return (
    <div className="px-1 pb-1 [&_em-emoji-picker]:!w-full [&_em-emoji-picker]:!rounded-md [&_em-emoji-picker]:!border-0 [&_em-emoji-picker]:!shadow-none">
      <EmojiPicker
        data={async () => (await import('@emoji-mart/data')).default}
        onEmojiSelect={(e: { native: string }) => onSelectAction(e.native)}
        theme="light"
        previewPosition="none"
        skinTonePosition="search"
        searchPosition="sticky"
        maxFrequentRows={2}
        perLine={9}
        emojiSize={22}
        emojiButtonSize={28}
        navPosition="bottom"
        categoryFirstCap="all"
      />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Icon tab：lucide 分类网格 + 名字搜索
// -----------------------------------------------------------------------------
function IconTab({
  currentValue,
  search,
  onSearchChangeAction,
  onSelectAction,
}: {
  currentValue: string | null
  search: string
  onSearchChangeAction: (s: string) => void
  onSelectAction: (name: string) => void
}) {
  const isSearching = search.trim().length > 0
  const searchResults = isSearching ? searchIcons(search) : []

  return (
    <div className="flex max-h-80 flex-col gap-1 p-1.5">
      {/* 搜索框 */}
      <div className="relative px-1 pb-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChangeAction(e.target.value)}
          placeholder="按名字搜索图标…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto pr-1">
        {isSearching ? (
          searchResults.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              没有匹配的图标
            </div>
          ) : (
            <IconGrid
              iconNames={searchResults}
              currentValue={currentValue}
              onSelectAction={onSelectAction}
            />
          )
        ) : (
          <div className="flex flex-col gap-3">
            {ICON_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {cat.label}
                </div>
                <IconGrid
                  iconNames={cat.icons}
                  currentValue={currentValue}
                  onSelectAction={onSelectAction}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function IconGrid({
  iconNames,
  currentValue,
  onSelectAction,
}: {
  iconNames: string[]
  currentValue: string | null
  onSelectAction: (name: string) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5 px-1">
      {iconNames.map((name) => {
        const Icon = ICON_COMPONENTS[name]
        if (!Icon) return null
        const isActive = name === currentValue
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelectAction(name)}
            title={name}
            className={cn(
              'grid h-7 w-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              isActive && 'bg-primary/10 text-primary hover:bg-primary/15',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
