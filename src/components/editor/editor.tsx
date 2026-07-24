'use client'

import { useEditor, EditorContent, type Editor as TiptapEditor } from '@tiptap/react'
import { Fragment, Slice } from '@tiptap/pm/model'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Save, Plus } from 'lucide-react'
import { buildExtensions } from '@/lib/tiptap/extensions'
import { SlashCommand } from '@/lib/tiptap/slash-command'
import { extractHeadings, type HeadingItem } from '@/lib/tiptap/heading-anchor'
import { blocksToTiptapDoc, tiptapDocToSaveBlocks } from '@/lib/tiptap/doc-blocks'
import {
  docToMarkdown,
  markdownToDoc,
  looksLikeMarkdown,
} from '@/lib/markdown'
import type { PMDoc, Block, IconType } from '@/db/schema'
import { debounce } from '@/lib/debounce'
import { resolveIcon } from '@/lib/icon-resolver'
import { IconPicker } from '@/components/icon-picker'
import { TableBubbleMenu } from './table-bubble-menu'
import { TextBubbleMenu } from './text-bubble-menu'
import { cn } from '@/lib/utils'
import { useEditorScrollFollow } from './use-editor-scroll-follow'
import { useBlockDrag } from './use-block-drag'
import { BlockGutter } from './block-gutter'
import './editor.css'

// block-move 自定义 MIME：与 use-block-drag.ts 里的 DRAG_MIME 必须一致
const BLOCK_MOVE_MIME = 'application/x-block-move'

// -----------------------------------------------------------------------------
// Editor 主组件
// -----------------------------------------------------------------------------
type Props = {
  pageId: string
  title: string
  iconType: IconType | null
  iconValue: string | null
  // Next.js 16 要求 Client Component props 中的函数以 Action 结尾或为 Server Action
  onTitleChangeAction?: (newTitle: string) => void
  onHeadingsChangeAction?: (headings: HeadingItem[]) => void
  onIconChangeAction?: (iconType: IconType | null, iconValue: string | null) => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function Editor({
  pageId,
  title,
  iconType,
  iconValue,
  onTitleChangeAction,
  onHeadingsChangeAction,
  onIconChangeAction,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const existingIdsRef = useRef<string[]>([])
  // 用 ref 持有 editor 引用：useEffect 依赖只有 [pageId]，闭包里捕获的
  // editor 在首次渲染时仍是 null（immediatelyRender:false），靠 ref 才能拿到
  // 异步创建好的实例去 setContent。
  const editorRef = useRef<TiptapEditor | null>(null)
  // 编辑器容器的 ref：包住 <EditorContent> 和 <BlockGutter>，
  // 供 useBlockDrag 内部做视口坐标计算 + 自动滚动。
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
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
  // Tiptap 实例
  // ---------------------------------------------------------------------------
  const editor = useEditor({
    extensions: [
      ...buildExtensions('输入 / 唤出菜单，或直接开始书写…'),
      SlashCommand.configure({}),
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
        const text = event.clipboardData?.getData('text/plain')
        if (!text || !looksLikeMarkdown(text)) return false
        const parsed = markdownToDoc(text)
        const nodes = parsed.content ?? []
        if (nodes.length === 0) return false
        const fragment = Fragment.fromJSON(view.state.schema, nodes)
        const slice = new Slice(fragment, 0, 0)
        const tr = view.state.tr.replaceSelection(slice)
        view.dispatch(tr)
        return true
      },
      // 拖入：仅识别 block-move（同级块拖拽），其他交给 PM 默认行为
      handleDrop: (_view, event, _slice, _moved) => {
        const types = event.dataTransfer?.types
        if (types && Array.from(types).includes(BLOCK_MOVE_MIME)) {
          event.preventDefault()
          return true
        }
        return false
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

  // block 拖动 hook：位置计算 + dragover/drop 处理
  const {
    positions: gripPositions,
    dragState,
    hoveredIndex,
    onGripDragStart,
    onGripDragEnd,
    onContainerDragOver,
    onContainerDrop,
  } = useBlockDrag(editor, pageId, editorContainerRef)

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

        {/* 编辑器 + 左侧拖动覆盖层 */}
        <div
          ref={editorContainerRef}
          className="editor-block-container relative"
          onDragOver={onContainerDragOver}
          onDrop={onContainerDrop}
        >
          <EditorContent editor={editor} />
          {editor && (
            <BlockGutter
              positions={gripPositions}
              dragState={dragState}
              hoveredIndex={hoveredIndex}
              onGripDragStart={onGripDragStart}
              onGripDragEnd={onGripDragEnd}
            />
          )}
        </div>
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

      {/* 选中文字时浮出 BubbleMenu（块类型转换 + 加粗/斜体/删除线/行内 code） */}
      {editor && <TextBubbleMenu editor={editor} />}

      {/* 光标在表格内时浮出 BubbleMenu（行/列插入删除 + 表头切换） */}
      {editor && <TableBubbleMenu editor={editor} />}
    </>
  )
}
