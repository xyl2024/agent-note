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
import { Check, Copy } from 'lucide-react'
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

  const displayLang = lang || 'text'

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
        <span className="lang">{displayLang}</span>
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
