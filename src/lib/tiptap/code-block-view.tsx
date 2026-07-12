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
import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const HIGHLIGHT_SIZE_LIMIT = 20 * 1024

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
// null 表示「纯文本」，对应 codeBlock.attrs.language = null。
type LanguageOption = { value: string | null; label: string }
const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: null, label: '纯文本' },
  { value: 'bash', label: 'Bash' },
  { value: 'css', label: 'CSS' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
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

  if (!normalizedLanguage || code.length > HIGHLIGHT_SIZE_LIMIT || !lowlight.registered(normalizedLanguage)) {
    return null
  }

  try {
    return lowlight.highlight(normalizedLanguage, code).children
  } catch {
    return null
  }
}

export function CodeBlockView(props: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const lang = (props.node.attrs as { language?: string | null }).language ?? ''
  const code = props.node.textContent
  const highlightedNodes = useMemo(() => getHighlightedNodes(code, lang), [code, lang])

  const displayLang = lang || '纯文本'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <NodeViewWrapper as="pre" className="code-block-wrapper">
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
    </NodeViewWrapper>
  )
}
