'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isHttpUrl } from '@/lib/markdown/image-url'

// -----------------------------------------------------------------------------
// ExternalImageDialog：插入外链图片的模态对话框
//
// 父组件应该用 `key` prop 触发重挂（每次打开/切换 initial 时重新挂载），
// 这样内部 state 自动用 initial 初始化，不需要 useEffect 同步。
//
// Props:
//   open: 受控开关
//   onOpenChangeAction(open): 关闭/取消时回调
//   onConfirmAction({url, alt, title}): 提交时回调（URL 已校验通过）
//   initial?: 编辑模式下的初始值（改 alt / 改 src 时复用,见 image-bubble-menu）
//   mode?: 'insert' | 'edit-alt' | 'edit-src' — 仅影响标题/按钮文案
// -----------------------------------------------------------------------------

export type ExternalImageDialogPayload = {
  url: string
  alt: string | null
  title: string | null
}

type Mode = 'insert' | 'edit-alt' | 'edit-src'

type Props = {
  open: boolean
  onOpenChangeAction: (open: boolean) => void
  onConfirmAction: (payload: ExternalImageDialogPayload) => void
  initial?: { url?: string; alt?: string; title?: string }
  mode?: Mode
}

const TITLE_BY_MODE: Record<Mode, { title: string; description: string; cta: string }> = {
  insert: {
    title: '插入外链图片',
    description: '填入一个 https:// 开头的图片 URL，编辑器会直接引用该 URL（不下载到本地）。',
    cta: '插入',
  },
  'edit-alt': {
    title: '修改图片描述',
    description: '修改 alt 文本，URL 保持不变。',
    cta: '保存',
  },
  'edit-src': {
    title: '修改图片源',
    description: '换一个图片 URL，alt 和 title 保持不变。',
    cta: '保存',
  },
}

export function ExternalImageDialog({
  open,
  onOpenChangeAction,
  onConfirmAction,
  initial,
  mode = 'insert',
}: Props) {
  // 父组件用 key prop 触发重挂，所以这里直接读 initial 作为初值，不需要 useEffect
  const [url, setUrl] = useState(initial?.url ?? '')
  const [alt, setAlt] = useState(initial?.alt ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')

  const urlValid = isHttpUrl(url.trim())
  const canSubmit =
    mode === 'edit-alt' ? true : url.trim().length > 0 && urlValid

  const heading = TITLE_BY_MODE[mode]

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onOpenChangeAction(false)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading.title}</DialogTitle>
          <DialogDescription>{heading.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {mode !== 'edit-alt' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ext-img-url" className="text-xs text-muted-foreground">
                图片 URL
              </label>
              <Input
                id="ext-img-url"
                type="url"
                placeholder="https://example.com/image.png"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
              {url.trim().length > 0 && !urlValid && (
                <p className="text-xs text-destructive">
                  只支持 http:// 或 https:// 协议的 URL
                </p>
              )}
            </div>
          )}

          {mode !== 'edit-src' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ext-img-alt" className="text-xs text-muted-foreground">
                描述 (alt，可选)
              </label>
              <Input
                id="ext-img-alt"
                type="text"
                placeholder="例：项目结构图"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            </div>
          )}

          {mode === 'insert' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ext-img-title" className="text-xs text-muted-foreground">
                标题 (title，可选)
              </label>
              <Input
                id="ext-img-title"
                type="text"
                placeholder="鼠标 hover 时显示"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            取消
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onConfirmAction({
                url: url.trim(),
                alt: alt.trim() || null,
                title: title.trim() || null,
              })
              onOpenChangeAction(false)
            }}
          >
            {heading.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}