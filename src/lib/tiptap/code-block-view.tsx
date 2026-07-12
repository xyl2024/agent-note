'use client'

import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { createLowlight } from 'lowlight'
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode, Ref } from 'react'
import {
  MAX_MERMAID_SOURCE_LENGTH,
  renderMermaidSvg,
  subscribeMermaidThemeVersion,
} from './mermaid-renderer'

const HIGHLIGHT_SIZE_LIMIT = 20 * 1024

// Mermaid 渲染防抖：编辑中停止输入 500ms 后重画一次。blur 时调用方走 imperative
// rerender() 跳过 debounce，强制一次。
const MERMAID_RENDER_DEBOUNCE_MS = 500

const lowlight = createLowlight({
  bash,
  css,
  javascript,
  json,
  markdown,
  python,
  shell,
  sql,
  typescript,
  xml,
  yaml,
})

lowlight.registerAlias({
  bash: ['sh', 'zsh'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  json: ['jsonc'],
  markdown: ['md', 'mdx'],
  typescript: ['ts', 'tsx'],
  xml: ['html', 'svg'],
  yaml: ['yml'],
})

// UI 层暴露的语言选项 —— 键名必须与上面 createLowlight({...}) 入参对齐；
// alias（sh/zsh/js/ts/html/svg/yml 等）由 lowlight.registerAlias 兜底，这里只列规范名。
// 'mermaid' 是特殊项：不是 highlight.js 的语言，而是「触发下方预览」。走和 lowlight
// 不同的渲染分支，但 UI 仍跟其他语言一致出现在下拉里。
type LanguageOption = { value: string | null; label: string }
const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: null, label: '纯文本' },
  { value: 'bash', label: 'Bash' },
  { value: 'css', label: 'CSS' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'python', label: 'Python' },
  { value: 'shell', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'xml', label: 'XML / HTML' },
  { value: 'yaml', label: 'YAML' },
]

type HighlightNode = ReturnType<typeof lowlight.highlight>['children'][number]

function normalizeLanguage(language: string) {
  return language.trim().toLowerCase().split(/\s+/)[0] ?? ''
}

function toClassName(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').join(' ')
  }

  return typeof value === 'string' ? value : undefined
}

function renderHighlightNode(node: HighlightNode, key: string): ReactNode {
  if (node.type === 'text') {
    return <Fragment key={key}>{node.value}</Fragment>
  }

  if (node.type === 'element') {
    return (
      <span key={key} className={toClassName(node.properties.className)}>
        {node.children.map((child, index) => renderHighlightNode(child, `${key}-${index}`))}
      </span>
    )
  }

  return null
}

function getHighlightedNodes(code: string, language: string) {
  const normalizedLanguage = normalizeLanguage(language)

  if (
    !normalizedLanguage ||
    normalizedLanguage === 'mermaid' ||
    code.length > HIGHLIGHT_SIZE_LIMIT ||
    !lowlight.registered(normalizedLanguage)
  ) {
    return null
  }

  try {
    return lowlight.highlight(normalizedLanguage, code).children
  } catch {
    return null
  }
}

type MermaidPreviewHandle = {
  /** 强制立即重画一次（跳过 debounce），用于 blur 时。 */
  rerender: () => void
}

type MermaidPreviewProps = {
  source: string
  /** 节点在文档里的稳定位置（getPos 失败时取 -1），用作 ID 后缀防 React 重 mount 撞 mermaid id */
  nodePos: number
}

// -----------------------------------------------------------------------------
// MermaidPreview：lang === 'mermaid' 时挂在 code-body 之后的预览子组件
// - 500ms debounce 重画
// - 主题切换（<html class> 变化）通过全局 MutationObserver 推动重画
// - 长度 > 50KB 显示「过长不渲染」一行
// - 解析错误：警告行 + <details> 折叠错误细节
// -----------------------------------------------------------------------------
const MermaidPreview = forwardRef<MermaidPreviewHandle, MermaidPreviewProps>(function MermaidPreview(
  { source, nodePos },
  ref,
) {
  const reactId = useId()
  const [mermaidId] = useState(
    () =>
      // mermaid 内部用做 SVG element id。React useId + 节点位置 + 随机 salt 三层防护，
      // 确保多个实例并存或 React 重 mount 时不撞 id。
      `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${nodePos}-${Math.random().toString(36).slice(2, 8)}`,
  )
  const [svgResult, setSvgResult] = useState<{ svg: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [themeVersion, setThemeVersion] = useState(0)
  const renderTokenRef = useRef(0) // 防过期 render 写入
  const debounceTimerRef = useRef<number | null>(null)

  // 主题变化订阅
  useEffect(() => {
    return subscribeMermaidThemeVersion(() => {
      setThemeVersion((v) => v + 1)
    })
  }, [])

  const doRender = useCallback(
    async (code: string) => {
      const token = ++renderTokenRef.current
      setIsRendering(true)
      const result = await renderMermaidSvg(mermaidId, code)
      if (token !== renderTokenRef.current) return // 期间又有新 render，丢弃这次
      if (result.ok) {
        setSvgResult({ svg: result.svg })
        setErrorMsg(null)
      } else {
        setSvgResult(null)
        setErrorMsg(result.error)
      }
      setIsRendering(false)
    },
    [mermaidId],
  )

  // 立即强制重画：跳 debounce
  const rerenderNow = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    if (source.length > MAX_MERMAID_SOURCE_LENGTH) {
      setErrorMsg('too-long')
      setSvgResult(null)
      return
    }
    void doRender(source)
  }, [doRender, source])

  useImperativeHandle(
    ref,
    () => ({
      rerender: rerenderNow,
    }),
    [rerenderNow],
  )

  // 主题变化 → 重画（合法 effect-driven 模式：从外部系统同步进 React state）
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 主题变化驱动 React 重渲 source（合法 effect-driven 同步）*/
    if (themeVersion === 0) return
    rerenderNow()
  }, [themeVersion, rerenderNow])

  // 源码变化 + 首次挂载 → debounce 重画；长度门限直接走派生分支，不进 state
  const isTooLong = source.length > MAX_MERMAID_SOURCE_LENGTH
  useEffect(() => {
    if (isTooLong) return
    const timer = window.setTimeout(() => {
      void doRender(source)
    }, MERMAID_RENDER_DEBOUNCE_MS)
    debounceTimerRef.current = timer
    return () => {
      window.clearTimeout(timer)
    }
  }, [source, doRender, isTooLong])

  // unmount 时让任何挂起 render 失效
  useEffect(() => {
    const tokenRef = renderTokenRef
    return () => {
      tokenRef.current++
    }
  }, [])

  if (isTooLong) {
    return (
      <div className="mermaid-preview mermaid-preview--warn" contentEditable={false}>
        <span>源码过长（&gt; {Math.round(MAX_MERMAID_SOURCE_LENGTH / 1024)} KB），不渲染</span>
      </div>
    )
  }

  if (errorMsg === 'too-long') {
    // doRender 设了 too-long 时也会走这里，但前面的 isTooLong 已经覆盖首次；这是 doRender 主动设的情况
    return (
      <div className="mermaid-preview mermaid-preview--warn" contentEditable={false}>
        <span>源码过长（&gt; {Math.round(MAX_MERMAID_SOURCE_LENGTH / 1024)} KB），不渲染</span>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="mermaid-preview mermaid-preview--error" contentEditable={false}>
        <div className="mermaid-preview-error-head">Mermaid 语法错误</div>
        <details open>
          <summary className="mermaid-preview-error-summary">错误详情（点击折叠）</summary>
          <pre className="mermaid-preview-error-detail">{errorMsg}</pre>
        </details>
      </div>
    )
  }

  if (isRendering && !svgResult) {
    return (
      <div className="mermaid-preview" contentEditable={false} aria-busy="true">
        <div className="mermaid-preview-status">渲染中…</div>
      </div>
    )
  }

  if (!svgResult) {
    return <div className="mermaid-preview" contentEditable={false} />
  }

  // 关键：用 React 的 dangerouslySetInnerHTML 接管整个 DOM 生命周期，
  // 不在 useEffect 里手 target.innerHTML（那样会让 React 失配 reconciliation，导致
  // "Failed to execute 'removeChild'" 错误）
  return (
    <div
      className="mermaid-preview"
      contentEditable={false}
      dangerouslySetInnerHTML={{ __html: svgResult.svg }}
    />
  )
})

export function CodeBlockView(props: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const lang = (props.node.attrs as { language?: string | null }).language ?? ''
  const code = props.node.textContent
  const isMermaid = lang === 'mermaid'
  const highlightedNodes = useMemo(() => getHighlightedNodes(code, lang), [code, lang])
  const mermaidPreviewRef = useRef<MermaidPreviewHandle>(null)

  const displayLang = lang || '纯文本'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // 退出代码块（编辑器外的 blur）→ 强制 mermaid 重画一次，确保切走时看到最新结果。
  const handleBlurCapture = useCallback(
    (e: React.FocusEvent) => {
      if (!isMermaid) return
      const next = e.relatedTarget as Node | null
      if (next && (e.currentTarget as Node).contains(next)) return // 还在代码块内，不触发
      mermaidPreviewRef.current?.rerender()
    },
    [isMermaid],
  )

  // 给 mermaid ID 一个稳定后缀：getPos() 失败时（SSR / 节点已被删除）走 -1
  const nodePos = useMemo(() => {
    try {
      const pos = typeof props.getPos === 'function' ? props.getPos() : null
      return typeof pos === 'number' ? pos : -1
    } catch {
      return -1
    }
  }, [props])

  return (
    <NodeViewWrapper
      as="pre"
      className={`code-block-wrapper${isMermaid ? ' code-block-wrapper--mermaid' : ''}`}
      onBlurCapture={handleBlurCapture}
    >
      <div className="code-header" contentEditable={false}>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="lang lang-trigger"
            // 阻止按钮 mousedown 时获得焦点 —— ProseMirror 会把 blur 当成 selectionChange，
            // 不拦截会引起编辑器选区闪烁。镜像 image-bubble-menu.tsx:35-38 的处理。
            onMouseDown={(event) => event.preventDefault()}
            aria-label="切换代码块语言"
          >
            <ChevronDown className="size-3 opacity-60" />
            <span>{displayLang}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="bottom" sideOffset={4}>
            <DropdownMenuRadioGroup
              // RadioGroup 不直接支持 null，用空串当"纯文本"哨兵，onValueChange 里再转回 null。
              value={lang ?? ''}
              onValueChange={(next) => {
                const newLang = next === '' ? null : next
                props.updateAttributes({ language: newLang })
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value ?? 'plain'} value={option.value ?? ''}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className="copy-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleCopy}
          aria-label={copied ? '已复制' : '复制代码'}
        >
          {copied ? <Check /> : <Copy />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <div className="code-body">
        <code className="code-highlight" contentEditable={false} aria-hidden="true">
          {highlightedNodes ? highlightedNodes.map((child, index) => renderHighlightNode(child, String(index))) : code}
        </code>
        <NodeViewContent<'code'> as="code" className="code-input" />
      </div>
      {isMermaid ? (
        // mermaidPreviewRef 走 forwardRef + useImperativeHandle 暴露 rerender()。
        // 强转吃 TS：JSX 上 forwardRef 组件的可空 ref 类型推断偶尔会卡。
        <MermaidPreview ref={mermaidPreviewRef as unknown as Ref<MermaidPreviewHandle>} source={code} nodePos={nodePos} />
      ) : null}
    </NodeViewWrapper>
  )
}
