'use client'

import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react'
import { Fragment, Slice } from '@tiptap/pm/model'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Loader2, Save, Plus } from 'lucide-react'
import { buildExtensions } from '@/lib/tiptap/extensions'
import { PageLink } from '@/lib/tiptap/page-link'
import { PageLinkSuggestion } from '@/lib/tiptap/page-link-suggestion'
import { SlashCommand } from '@/lib/tiptap/slash-command'
import { extractHeadings, type HeadingItem } from '@/lib/tiptap/heading-anchor'
import { blocksToTiptapDoc, tiptapDocToSaveBlocks } from '@/lib/tiptap/doc-blocks'
import {
  docToMarkdown,
  markdownToDoc,
  looksLikeMarkdown,
} from '@/lib/markdown'
import type { PMDoc, Block, Page, IconType } from '@/db/schema'
import { debounce } from '@/lib/debounce'
import { resolveIcon } from '@/lib/icon-resolver'
import { IconPicker } from '@/components/icon-picker'
import { ExternalImageDialog } from './external-image-dialog'
import { ImageBubbleMenu } from './image-bubble-menu'
import { inferImageKind } from '@/lib/markdown/image-url'
import { cn } from '@/lib/utils'
import { useEditorScrollFollow } from './use-editor-scroll-follow'
import './editor.css'

// -----------------------------------------------------------------------------
// Editor 主组件
// 通过 forwardRef 暴露 updatePageLinkByTitle 供 AppShell 在创建页面后回填
// -----------------------------------------------------------------------------
type Props = {
  pageId: string
  title: string
  iconType: IconType | null
  iconValue: string | null
  // Next.js 16 要求 Client Component props 中的函数以 Action 结尾或为 Server Action
  onTitleChangeAction?: (newTitle: string) => void
  onPageLinkClickAction?: (pageId: string | null, pageTitle: string) => void
  onHeadingsChangeAction?: (headings: HeadingItem[]) => void
  onIconChangeAction?: (iconType: IconType | null, iconValue: string | null) => void
  createPageAction?: (title: string) => Promise<Page>
}

export type EditorHandle = {
  /**
   * 把 doc 里所有 pageLink{pageTitle === oldTitle, pageId === null}
   * 的 mark 改成 pageId = newId。给 AppShell 在 Dialog 创建完页面后回填用。
   */
  updatePageLinkByTitleAction: (oldTitle: string, newId: string) => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  {
    pageId,
    title,
    iconType,
    iconValue,
    onTitleChangeAction,
    onPageLinkClickAction,
    onHeadingsChangeAction,
    onIconChangeAction,
    createPageAction,
  },
  ref,
) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  // 外链图片 dialog：支持 insert / edit-alt / edit-src 三种模式
  const [extImgDialog, setExtImgDialog] = useState<{
    open: boolean
    mode: 'insert' | 'edit-alt' | 'edit-src'
    initial?: { url?: string; alt?: string }
  }>({ open: false, mode: 'insert' })
  const existingIdsRef = useRef<string[]>([])
  // 用 ref 持有 editor 引用：useEffect 依赖只有 [pageId]，闭包里捕获的
  // editor 在首次渲染时仍是 null（immediatelyRender:false），靠 ref 才能拿到
  // 异步创建好的实例去 setContent。
  const editorRef = useRef<TiptapEditor | null>(null)
  // pendingDocRef 用于解决 onCreate 和 fetch 时序不定的问题：
  // 谁后到谁消费，保证 setContent 在任意顺序下都能发生。
  const pendingDocRef = useRef<PMDoc | null>(null)
  // 标题本地草稿：避免每个按键都打 PATCH 引起的「打一个字被旧值覆盖」现象
  // 服务端的 "Untitled" 是空字符串的占位符（DB schema 限制 NOT NULL），
  // 在 Editor 这一层将其映射成空串，这样清空标题后服务端回填的占位符
  // 不会让输入框被回弹成 "Untitled"。标题用 contentEditable div，textContent
  // 由 DOM 自己管，不再需要 React state 缓存。
  const fromStoredTitle = (t: string) => (t === 'Untitled' ? '' : t)
  // 记录我们最后一次发出保存请求时用的值，用来区分「自己的回声」与「外部重命名」
  const lastSentTitleRef = useRef<string>(fromStoredTitle(title))
  // 标题 DOM 引用 + IME 状态：标题用 contentEditable 而非 input，
  // 避免 input box 把 descender（g/j/p/q/y 的下行）裁掉。
  const titleRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  // onTitleChangeAction 是父组件 props（可能因 render 换引用），用 ref 锁住最新
  const onTitleChangeActionRef = useRef(onTitleChangeAction)
  useEffect(() => {
    onTitleChangeActionRef.current = onTitleChangeAction
  }, [onTitleChangeAction])

  const applyPendingDocAction = (ed: TiptapEditor): boolean => {
    const doc = pendingDocRef.current
    if (!doc) return false
    if (ed.isDestroyed) return false
    ed.commands.setContent(doc, { emitUpdate: false })
    const headings = extractHeadings(ed.state.doc)
    onHeadingsChangeAction?.(headings)
    pendingDocRef.current = null
    return true
  }

  // ---------------------------------------------------------------------------
  // 加载页面块
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    // 切换页面时立即清空大纲，避免显示上一个页面的标题
    onHeadingsChangeAction?.([])

    fetch(`/api/pages/${pageId}/blocks`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ blocks: Block[] }>
      })
      .then((data) => {
        if (cancelled) return
        existingIdsRef.current = data.blocks.map((b) => b.id)
        const doc = blocksToTiptapDoc(data.blocks)
        pendingDocRef.current = doc
        const ed = editorRef.current
        if (ed) applyPendingDocAction(ed)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  // ---------------------------------------------------------------------------
  // 标题保存（防抖 400ms）
  // ---------------------------------------------------------------------------
  const commitTitleAction = useRef(
    debounce((next: string) => {
      lastSentTitleRef.current = next
      onTitleChangeActionRef.current?.(next)
    }, 400),
  ).current

  // ---------------------------------------------------------------------------
  // 自动保存（防抖 500ms）
  // ---------------------------------------------------------------------------
  const saveBlocks = useRef(
    debounce(async (doc: PMDoc, ids: string[]) => {
      setSaveState('saving')
      try {
        const blocks = tiptapDocToSaveBlocks(doc, ids).map((b) => ({
          type: b.type,
          content: b.content,
          order: b.order,
          ...(b.id ? { id: b.id } : {}),
        }))
        const res = await fetch(`/api/pages/${pageId}/blocks`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { blocks: Block[] }
        existingIdsRef.current = data.blocks.map((b) => b.id)
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1500)
      } catch (e) {
        console.error('save error', e)
        setSaveState('error')
      }
    }, 500),
  ).current

  // ---------------------------------------------------------------------------
  // 搜索页面（pageLink suggestion 用）
  // ---------------------------------------------------------------------------
  const searchPagesAction = async (query: string, signal: AbortSignal) => {
    if (!query) {
      // 空 query：返回最近更新的页面作为推荐
      const res = await fetch('/api/pages', { signal })
      if (!res.ok) return []
      const data = (await res.json()) as { pages: Page[] }
      return data.pages.slice(0, 10).map((p) => ({
        pageId: p.id,
        pageTitle: p.title,
      }))
    }
    const url = `/api/pages?title=${encodeURIComponent(query)}`
    const res = await fetch(url, { signal })
    if (!res.ok) return []
    const data = (await res.json()) as { pages: Page[] }
    return data.pages.map((p) => ({ pageId: p.id, pageTitle: p.title }))
  }

  const createPageFromSuggestionAction = async (title: string) => {
    const page = await createPageAction?.(title)
    return {
      pageId: page?.id ?? null,
      pageTitle: page?.title ?? title,
    }
  }

  // ---------------------------------------------------------------------------
  // Tiptap 实例
  // ---------------------------------------------------------------------------
  // 外链图片 dialog 触发器：slash menu "图片(外链 URL)" 选中时调用
  const openExternalImageDialogAction = () =>
    setExtImgDialog({ open: true, mode: 'insert' })

  // BubbleMenu 「改 alt / 改 src」 触发：读当前 image 节点的 attrs 作 initial
  const openImageEditDialogAction = (
    mode: 'edit-alt' | 'edit-src',
  ) => {
    if (!editor || editor.isDestroyed) return
    const attrs = editor.getAttributes('image') as {
      src?: string | null
      alt?: string | null
    }
    setExtImgDialog({
      open: true,
      mode,
      initial: {
        url: attrs.src ?? undefined,
        alt: attrs.alt ?? undefined,
      },
    })
  }

  const editor = useEditor({
    extensions: [
      ...buildExtensions('输入 / 唤出菜单，输入 [[ 链接页面，或直接开始书写…'),
      PageLink,
      PageLinkSuggestion.configure({
        searchAction: searchPagesAction,
        createAction: createPageFromSuggestionAction,
      }),
      SlashCommand.configure({
        onSelectExternalImageAction: openExternalImageDialogAction,
      }),
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    onCreate: ({ editor }) => {
      editorRef.current = editor
      applyPendingDocAction(editor)
    },
    onDestroy: () => {
      editorRef.current = null
    },
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none',
      },
      // 复制时把选中内容序列化为 Markdown 文本
      clipboardTextSerializer: (slice) => {
        const json = slice.content.toJSON() as PMDoc['content']
        return docToMarkdown({ type: 'doc', content: json })
      },
      // 粘贴时智能检测 Markdown → 解析为块；否则走 Tiptap 默认行为
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (items) {
          // 优先处理剪贴板里的图片（粘贴截图等）
          for (let i = 0; i < items.length; i++) {
            const it = items[i]
            if (it.kind === 'file' && it.type.startsWith('image/')) {
              const file = it.getAsFile()
              if (file) {
                event.preventDefault()
                void uploadAndInsertImage(view, file, pageId)
                return true
              }
            }
          }
        }
        const text = event.clipboardData?.getData('text/plain')
        if (!text || !looksLikeMarkdown(text)) return false
        const parsed = markdownToDoc(text)
        const nodes = parsed.content ?? []
        if (nodes.length === 0) return false
        const fragment = Fragment.fromJSON(view.state.schema, nodes)
        const slice = new Slice(fragment, 0, 0)
        const tr = view.state.tr.replaceSelection(slice)
        view.dispatch(tr)
        // 异步解析 wikilink（粘贴后给 pageLink mark 补 pageId）
        resolveWikilinkInDoc(view, nodes)
        return true
      },
      // 拖入文件：仅接 image/*
      handleDrop: (view, event, _slice, _moved) => {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        const file = files[0]
        if (!file.type.startsWith('image/')) return false
        event.preventDefault()
        void uploadAndInsertImage(view, file, pageId)
        return true
      },
      // 点击拦截：点 pageLink 时不让浏览器跳转，转交 AppShell
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== 'text') return false
        const link = node.marks.find((m) => m.type.name === 'pageLink')
        if (!link) return false
        const target = event.target as HTMLElement
        if (!target.closest('a.page-link')) return false
        event.preventDefault()
        const pageId = (link.attrs as { pageId?: string | null }).pageId ?? null
        const pageTitle =
          (link.attrs as { pageTitle?: string }).pageTitle ?? node.text ?? ''
        onPageLinkClickAction?.(pageId, pageTitle)
        return true
      },
    },
    immediatelyRender: false, // SSR 安全
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON() as PMDoc
      saveBlocks(doc, existingIdsRef.current)
      const headings = extractHeadings(editor.state.doc)
      onHeadingsChangeAction?.(headings)
    },
  })

  useEditorScrollFollow(editor)

  // ---------------------------------------------------------------------------
  // 同步外部 title 变更（如侧栏重命名同步过来）
  // 仅当 prop ≠ 我们最后发出的值时，才覆盖本地草稿；
  // 否则保留用户当前正在输入的内容，避免自己的 PATCH 回声打断打字。
  // 比较前先把服务端的 "Untitled" 占位映射成空串，保证用户清空标题后
  // 服务端归一化成 "Untitled" 时不会触发回弹。
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const stored = fromStoredTitle(title)
    if (stored === lastSentTitleRef.current) return
    lastSentTitleRef.current = stored
    // 同步到 contentEditable div（如果当前焦点不在标题上，否则会打断光标）
    const el = titleRef.current
    if (el && document.activeElement !== el && el.textContent !== stored) {
      el.textContent = stored
    }
  }, [title])

  // ---------------------------------------------------------------------------
  // 初始化标题 div 内容：把 loading 也放进 deps，因为组件首次 mount 时
  // loading=true 会先 return spinner，标题 div 还没挂载到 DOM；等 fetch
  // 完成 setLoading(false) 后 div 才出现，必须再触发一次才能写入 textContent。
  // 仅当 el 存在时写入，所以不会覆盖用户正在输入的内容（loading 后续不变）。
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = titleRef.current
    if (el) el.textContent = fromStoredTitle(title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ---------------------------------------------------------------------------
  // 暴露给父组件的命令式方法：创建完页面后回填 pageLink mark
  // ---------------------------------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      updatePageLinkByTitleAction: (oldTitle: string, newId: string) => {
        if (!editor || editor.isDestroyed) return
        updatePageLinkByTitle(editor.view, oldTitle, newId)
      },
    }),
    [editor],
  )

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        加载失败：{error}
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-12 py-16">
      {/* 页面 icon + 标题（横向布局：图标在标题左侧）
          标题用 contentEditable 而非 input：input 自身的 box 会把 descender 字符
          （g/j/p/q/y）的下行部分裁掉，并在 box 内部出现滚动条。contentEditable
          没有这个限制。 */}
      <div className="mb-8 flex items-center gap-4">
        <IconPicker
          value={{ iconType: iconType ?? null, iconValue: iconValue ?? null }}
          open={iconPickerOpen}
          onOpenChangeAction={setIconPickerOpen}
          onChangeAction={(next) => {
            onIconChangeAction?.(next.iconType, next.iconValue)
          }}
          trigger={
            <button
              type="button"
              aria-label={iconValue ? '更换图标' : '添加图标'}
              className={cn(
                'group/icon grid h-[78px] w-[78px] shrink-0 place-items-center overflow-hidden rounded-lg transition-colors',
                'hover:bg-muted/60',
                !iconValue &&
                  'border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:border-muted-foreground/60 hover:text-muted-foreground',
              )}
            >
              {iconValue ? (
                <span className="flex h-full w-full items-center justify-center">
                  <span
                    className={cn(
                      'flex items-center justify-center',
                      iconType === 'lucide' ? 'h-14 w-14 pb-1' : 'pb-1 text-[52px] leading-none',
                    )}
                  >
                    {resolveIcon(iconType, iconValue)}
                  </span>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs opacity-0 transition-opacity group-hover/icon:opacity-100">
                  <Plus className="h-4 w-4" />
                  <span>添加图标</span>
                </span>
              )}
            </button>
          }
        />

        {/* 标题（H1，不进 Tiptap doc，独立保存） */}
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="页面标题"
          onCompositionStart={() => {
            isComposingRef.current = true
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false
            const text = e.currentTarget.textContent ?? ''
            commitTitleAction(text)
          }}
          onInput={(e) => {
            if (isComposingRef.current) return
            const text = (e.currentTarget as HTMLDivElement).textContent ?? ''
            commitTitleAction(text)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              editor?.commands.focus('start')
            }
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            // 用 execCommand 插入纯文本：会触发 input 事件让 onInput 同步状态。
            document.execCommand('insertText', false, text)
          }}
          data-placeholder="无标题"
          className="flex-1 cursor-text bg-transparent text-4xl font-bold tracking-tight outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 empty:before:pointer-events-none"
        />
      </div>

      {/* 编辑器 */}
      <EditorContent editor={editor} />
    </div>

    {/* 保存状态指示 — 浮动在视口右下角，滚动到文档中段也可见 */}
    <div
        className={cn(
          'fixed bottom-6 right-6 z-40',
          'flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3.5 py-1.5',
          'text-xs text-muted-foreground shadow-sm backdrop-blur-sm',
          'transition-opacity duration-200',
          saveState === 'idle' && 'pointer-events-none opacity-0',
        )}
      >
        {saveState === 'saving' && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>保存中…</span>
          </>
        )}
        {saveState === 'saved' && (
          <>
            <Save className="h-3 w-3" />
            <span>已保存</span>
          </>
        )}
        {saveState === 'error' && (
          <span className="text-destructive">保存失败</span>
        )}
      </div>

      {/* 选中 image 时浮出 BubbleMenu（改 alt / 改 src / 删除） */}
      {editor && (
        <ImageBubbleMenu
          editor={editor}
          onRequestEditAction={openImageEditDialogAction}
        />
      )}

      {/* 外链图片 dialog（slash menu 插入 / BubbleMenu 改 alt/改 src 复用） */}
      <ExternalImageDialog
        key={
          extImgDialog.open
            ? `open-${extImgDialog.mode}-${extImgDialog.initial?.url ?? ''}-${extImgDialog.initial?.alt ?? ''}`
            : 'closed'
        }
        open={extImgDialog.open}
        onOpenChangeAction={(open) =>
          setExtImgDialog((s) => ({ ...s, open }))
        }
        initial={extImgDialog.initial}
        mode={extImgDialog.mode}
        onConfirmAction={({ url, alt }) => {
          if (!editor || editor.isDestroyed) return
          if (extImgDialog.mode === 'insert') {
            editor
              .chain()
              .focus()
              .setImage({
                src: url,
                alt: alt ?? undefined,
                width: undefined,
                height: undefined,
              })
              .updateAttributes('image', { kind: inferImageKind(url) })
              .run()
          } else if (extImgDialog.mode === 'edit-src') {
            editor
              .chain()
              .focus()
              .updateAttributes('image', {
                src: url,
                kind: inferImageKind(url),
              })
              .run()
          } else {
            // edit-alt
            editor
              .chain()
              .focus()
              .updateAttributes('image', { alt: alt ?? null })
              .run()
          }
        }}
      />
    </>
  )
})

// -----------------------------------------------------------------------------
// 把图片上传到 /api/upload，拿到 URL 后插入 Image 节点
// -----------------------------------------------------------------------------
async function uploadAndInsertImage(
  view: import('@tiptap/pm/view').EditorView,
  file: File,
  pageId: string,
) {
  const form = new FormData()
  form.append('file', file)
  form.append('pageId', pageId)
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      console.error('upload failed', data.error ?? res.status)
      return
    }
    const data = (await res.json()) as { url: string; assetId: string; mime: string }
    // 用 transaction 在光标处插入 image node
    const { state, dispatch } = view
    const imageType = state.schema.nodes.image
    if (!imageType) {
      console.error('image node not in schema')
      return
    }
    const node = imageType.create({
      src: data.url,
      alt: file.name,
      kind: 'local',
      width: null,
      height: null,
    })
    const tr = state.tr.replaceSelectionWith(node)
    // 在图片后插入一个空 paragraph，让光标能继续输入
    const paraType = state.schema.nodes.paragraph
    if (paraType) tr.insert(tr.selection.from, paraType.create())
    dispatch(tr)
  } catch (e) {
    console.error('upload error', e)
  }
}

// -----------------------------------------------------------------------------
// 异步把 doc 里所有 pageLink mark（pageId 为 null）解析成真实 pageId
// -----------------------------------------------------------------------------
async function resolveWikilinkInDoc(
  view: import('@tiptap/pm/view').EditorView,
  nodes: import('@/db/schema').PMNode[],
) {
  // 收集所有 pageId=null 且 pageTitle 非空的 pageLink
  const targets = collectUnresolvedLinks(nodes)
  if (targets.size === 0) return

  // 对每个 title 查一次
  for (const title of targets) {
    try {
      const res = await fetch(`/api/pages?title=${encodeURIComponent(title)}`)
      if (!res.ok) continue
      const data = (await res.json()) as { pages: Page[] }
      // 不区分大小写精确匹配
      const hit = data.pages.find(
        (p) => p.title.toLowerCase() === title.toLowerCase(),
      )
      if (!hit) continue
      // 在 doc 里把所有 pageTitle=title 的 pageLink mark 改成 pageId=hit.id
      updatePageLinkByTitle(view, title, hit.id)
    } catch {
      // 网络错误 → 跳过
    }
  }
}

function collectUnresolvedLinks(nodes: import('@/db/schema').PMNode[]): Set<string> {
  const out = new Set<string>()
  const walk = (ns: import('@/db/schema').PMNode[]) => {
    for (const n of ns) {
      if (n.marks) {
        for (const m of n.marks) {
          if (
            m.type === 'pageLink' &&
            (m.attrs?.pageId == null || m.attrs.pageId === '') &&
            typeof m.attrs?.pageTitle === 'string' &&
            m.attrs.pageTitle.length > 0
          ) {
            out.add(m.attrs.pageTitle)
          }
        }
      }
      if (n.content) walk(n.content)
    }
  }
  walk(nodes)
  return out
}

function updatePageLinkByTitle(
  view: import('@tiptap/pm/view').EditorView,
  oldTitle: string,
  newId: string,
) {
  const { state, dispatch } = view
  const tr = state.tr
  const markType = state.schema.marks.pageLink
  if (!markType) return
  let changed = false
  state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const link = node.marks.find((m) => m.type === markType)
    if (!link) return
    if ((link.attrs.pageTitle ?? '') !== oldTitle) return
    if (link.attrs.pageId) return
    tr.removeMark(pos, pos + node.nodeSize, markType)
    tr.addMark(
      pos,
      pos + node.nodeSize,
      markType.create({ pageId: newId, pageTitle: oldTitle }),
    )
    changed = true
  })
  if (changed) dispatch(tr)
}
