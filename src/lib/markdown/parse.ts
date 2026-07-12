import type { PMDoc, PMNode } from '@/db/schema'
import { inferImageKind, isRenderableImageSrc } from './image-url'

// -----------------------------------------------------------------------------
// Markdown 字符串 → Tiptap PMDoc
//
// 支持的块：heading(1-3), paragraph, bulletList (含嵌套), orderedList (含嵌套),
//          taskList, codeBlock (fenced), blockquote, horizontalRule, image(inline)
// 支持的 mark：bold, italic, strike, code, link
// image 行内：`![alt](url)` 或 `![alt](url "title")`，协议白名单 http/https + /api/files/
//   非白名单 URL 降级为段落文字（保留原文），不生成 image 节点
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Inline：把含 mark 的字符串切成 PMNode 数组
// -----------------------------------------------------------------------------

type MarkSpec = { type: string; attrs?: Record<string, unknown> }

function tokenizeInline(text: string): PMNode[] {
  // 先提取三种特殊形式：image ![alt](url)、pageLink [[Title]] 和 link [text](href)
  // 顺序：image(以 ! 起手最具体) → pageLink → link
  const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
  const pageLinkRegex = /\[\[([^\[\]\n]+)\]\]/g
  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)\)/g
  const out: PMNode[] = []
  let cursor = 0

  // 第一遍：image（必须在最前，因以 ! 起手）
  let m: RegExpExecArray | null
  const imageMatches: {
    start: number
    end: number
    raw: string
    src: string
    alt: string
    title: string | null
    renderable: boolean
  }[] = []
  while ((m = imageRegex.exec(text)) !== null) {
    const src = m[2]
    imageMatches.push({
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      src,
      alt: m[1],
      title: m[3] ?? null,
      // 严格白名单：非 http/https 且非 /api/files/ 的 URL 降级为原文文字
      renderable: isRenderableImageSrc(src),
    })
  }

  const isInsideImage = (pos: number) =>
    imageMatches.some((im) => pos >= im.start && pos < im.end)

  // 第二遍：pageLink，跳过 image 范围
  const pageLinkMatches: { start: number; end: number; title: string }[] = []
  pageLinkRegex.lastIndex = 0
  while ((m = pageLinkRegex.exec(text)) !== null) {
    if (isInsideImage(m.index)) continue
    pageLinkMatches.push({ start: m.index, end: m.index + m[0].length, title: m[1] })
  }

  const isInsidePageLink = (pos: number) =>
    pageLinkMatches.some((pm) => pos >= pm.start && pos < pm.end)

  // 第三遍：link，跳过 image / pageLink 范围
  const linkMatches: { start: number; end: number; text: string; href: string }[] = []
  while ((m = linkRegex.exec(text)) !== null) {
    if (isInsideImage(m.index)) continue
    if (isInsidePageLink(m.index)) continue
    linkMatches.push({ start: m.index, end: m.index + m[0].length, text: m[1], href: m[2] })
  }

  // 合并 spans 并按位置排序
  type Span =
    | {
        kind: 'image'
        start: number
        end: number
        raw: string
        src: string
        alt: string
        title: string | null
        renderable: boolean
      }
    | { kind: 'pageLink'; start: number; end: number; title: string }
    | { kind: 'link'; start: number; end: number; text: string; href: string }

  const spans: Span[] = [
    ...imageMatches.map((im) => ({ kind: 'image' as const, ...im })),
    ...pageLinkMatches.map((pm) => ({ kind: 'pageLink' as const, ...pm })),
    ...linkMatches.map((lm) => ({ kind: 'link' as const, ...lm })),
  ].sort((a, b) => a.start - b.start)

  for (const span of spans) {
    if (span.start < cursor) continue // 嵌套保护
    if (span.start > cursor) {
      out.push(...tokenizeNonLink(text.slice(cursor, span.start)))
    }
    if (span.kind === 'pageLink') {
      // pageLink 的 pageId 为 null：异步 resolver 会补
      out.push({
        type: 'text',
        text: span.title,
        marks: [
          {
            type: 'pageLink',
            attrs: { pageId: null, pageTitle: span.title },
          },
        ],
      })
    } else if (span.kind === 'link') {
      const inner = tokenizeNonLink(span.text)
      const linkMark: MarkSpec = { type: 'link', attrs: { href: span.href } }
      for (const n of inner) {
        n.marks = [...(n.marks ?? []), linkMark]
      }
      out.push(...inner)
    } else {
      // image
      if (span.renderable) {
        out.push({
          type: 'image',
          attrs: {
            src: span.src,
            alt: span.alt || null,
            title: span.title,
            kind: inferImageKind(span.src),
            width: null,
            height: null,
          },
        })
      } else {
        // 严格白名单拒绝：降级为原文 text(保留可读性)
        out.push({ type: 'text', text: span.raw })
      }
    }
    cursor = span.end
  }
  if (cursor < text.length) {
    out.push(...tokenizeNonLink(text.slice(cursor)))
  }
  return out
}

/** 解析不含 link 的 inline 文本 → text 节点序列（可能带 mark） */

/** 解析不含 link 的 inline 文本 → text 节点序列（可能带 mark） */
function tokenizeNonLink(text: string): PMNode[] {
  // 顺序很重要：bold/strike/code 先匹配（` 长度固定 1），italic 单独匹配（` *`）
  // 不能用单个正则同时识别多种 mark，因为会嵌套 / 顺序冲突
  // 用扫描式：依次尝试匹配最长的 mark
  const out: PMNode[] = []
  let buf = ''
  let i = 0

  const flushText = () => {
    if (buf) {
      out.push({ type: 'text', text: buf })
      buf = ''
    }
  }

  while (i < text.length) {
    const rest = text.slice(i)

    // `code`：行内 code
    const codeMatch = rest.match(/^`([^`\n]+)`/)
    if (codeMatch) {
      flushText()
      out.push({
        type: 'text',
        text: codeMatch[1],
        marks: [{ type: 'code' }],
      })
      i += codeMatch[0].length
      continue
    }

    // **bold**
    const boldMatch = rest.match(/^\*\*([^*\n]+)\*\*/)
    if (boldMatch) {
      flushText()
      out.push({
        type: 'text',
        text: boldMatch[1],
        marks: [{ type: 'bold' }],
      })
      i += boldMatch[0].length
      continue
    }

    // ~~strike~~
    const strikeMatch = rest.match(/^~~([^~\n]+)~~/)
    if (strikeMatch) {
      flushText()
      out.push({
        type: 'text',
        text: strikeMatch[1],
        marks: [{ type: 'strike' }],
      })
      i += strikeMatch[0].length
      continue
    }

    // *italic* （单星不双星）
    const italicMatch = rest.match(/^\*([^*\n]+)\*/)
    if (italicMatch) {
      flushText()
      out.push({
        type: 'text',
        text: italicMatch[1],
        marks: [{ type: 'italic' }],
      })
      i += italicMatch[0].length
      continue
    }

    buf += text[i]
    i++
  }
  flushText()
  return out
}

// -----------------------------------------------------------------------------
// Block 解析辅助
// -----------------------------------------------------------------------------

function getIndent(line: string): number {
  let n = 0
  while (n < line.length && line[n] === ' ') n++
  return n
}

/** 列表项 marker 匹配 */
const RE_HEADING = /^(#{1,3})\s+(.*)$/
const RE_HR = /^---+\s*$/
const RE_FENCE = /^```(\w*)\s*$/

// -----------------------------------------------------------------------------
// 列表族（bullet / ordered / task）通用递归解析
// -----------------------------------------------------------------------------

type ListKind = 'bulletList' | 'orderedList' | 'taskList'

/** 在 startIdx 开始解析一列连续列表项，baseIndent 是列表项起始缩进。
 *  对每项，遇到更深缩进的内容就当作嵌套列表挂到该项下。 */
function parseList(
  lines: string[],
  startIdx: number,
  baseIndent: number,
  kind: ListKind,
): { node: PMNode; consumed: number } {
  const items: PMNode[] = []
  let i = startIdx
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') break

    const indent = getIndent(line)
    if (indent !== baseIndent) break

    const tail = line.slice(baseIndent)

    let itemText: string | null = null
    let checked: boolean | undefined

    if (kind === 'taskList') {
      const m = tail.match(/^[-*+]\s+\[( |x|X)\]\s+(.*)$/)
      if (!m) break
      itemText = m[2]
      checked = m[1] !== ' '
    } else if (kind === 'bulletList') {
      const m = tail.match(/^[-*+]\s+(.*)$/)
      if (!m) break
      itemText = m[1]
    } else {
      const m = tail.match(/^\d+\.\s+(.*)$/)
      if (!m) break
      itemText = m[1]
    }

    i++

    // 嵌套：下一个非空行的缩进 > baseIndent
    let nested: PMNode[] = []
    while (i < lines.length) {
      const next = lines[i]
      if (next.trim() === '') {
        // 空行可能结束列表（除非下一行又是更深的列表项）
        // 简单策略：看到空行就 break 出 while
        break
      }
      const nextIndent = getIndent(next)
      if (nextIndent <= baseIndent) break

      // 解析嵌套列表（递归）
      const nestedTail = next.slice(nextIndent)
      const nestedKind = detectListKind(nestedTail)
      if (!nestedKind) {
        // 嵌套内容不是列表项 → 把它当作 paragraph 附在前一项（罕见情况）
        // 这里简单处理：作为 paragraph 加到 nested
        const paraText = next.slice(nextIndent)
        nested.push({
          type: 'paragraph',
          content: tokenizeInline(paraText),
        })
        i++
        continue
      }
      const sub = parseList(lines, i, nextIndent, nestedKind)
      nested.push(sub.node)
      i += sub.consumed
    }

    const itemContent: PMNode[] = [
      { type: 'paragraph', content: tokenizeInline(itemText) },
      ...nested,
    ]

    if (kind === 'taskList') {
      items.push({
        type: 'taskItem',
        attrs: { checked },
        // taskItem 的 schema 要求 paragraph+（或 nested 时 paragraph block*）
        // 所以始终用 paragraph 包装
        content: itemContent,
      })
    } else {
      items.push({
        type: 'listItem',
        content: itemContent,
      })
    }
  }

  return {
    node: { type: kind, content: items },
    consumed: i - startIdx,
  }
}

function detectListKind(tail: string): ListKind | null {
  if (/^[-*+]\s+\[[ xX]\]\s+/.test(tail)) return 'taskList'
  if (/^[-*+]\s+/.test(tail)) return 'bulletList'
  if (/^\d+\.\s+/.test(tail)) return 'orderedList'
  return null
}

// -----------------------------------------------------------------------------
// 块引用
// -----------------------------------------------------------------------------

function parseBlockquote(lines: string[], startIdx: number): { node: PMNode; consumed: number } {
  // CommonMark：连续的 > 行属于同一 blockquote，空行后若仍是 > 也属于同一
  // 我们用 innerLines 收集（保留空行让下游 paragraph 解析正常分段）
  const inner: string[] = []
  let i = startIdx
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(/^>\s?(.*)$/)
    if (!m) {
      // 空白行 + 下一行也是 > ？属于同一 blockquote 中的段落分隔
      if (line.trim() === '' && i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) {
        inner.push('')
        i++
        continue
      }
      break
    }
    inner.push(m[1])
    i++
  }
  // 块引用里再 parse（递归）
  const innerDoc = parseMarkdown(inner.join('\n').split('\n'), 0)
  return {
    node: {
      type: 'blockquote',
      content: innerDoc.content ?? [],
    },
    consumed: i - startIdx,
  }
}

// -----------------------------------------------------------------------------
// 入口
// -----------------------------------------------------------------------------

export function markdownToDoc(md: string): PMDoc {
  // 统一换行
  const normalized = md.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const doc = parseMarkdown(lines, 0)
  return liftImagesOutOfParagraphs(doc)
}

// -----------------------------------------------------------------------------
// 后处理：把含 image 子节点的 paragraph 拆开
//
// 为什么需要：tokenizeInline 在 inline 上下文里产出 image 节点，然后被
// 包进 paragraph。但当前 schema 里 image 是 inline: false（block 节点），
// 直接放在 paragraph 里是非法结构，会让 doc 处于 invalid 状态：
//   doc(paragraph(image), ...)
// Tiptap 加载时虽然会尝试提升（lift）image 出来，但 saved-back doc 仍可能
// 残留脏数据，按 Enter / 输入时抛 "Called contentMatchAt on a node with
// invalid content"。
//
// 正确拆分规则（贴合标准 markdown 渲染）：image 单独占一行，前后若有 inline
// 文本则拆成独立的 paragraph。例如：
//   "hello ![alt](u) world"
// →
//   paragraph("hello ")
//   image({ src: u, ... })
//   paragraph(" world")
// -----------------------------------------------------------------------------
function liftImagesOutOfParagraphs(doc: PMDoc): PMDoc {
  const blocks = doc.content
  if (!blocks) return doc
  const out: PMNode[] = []
  for (const block of blocks) {
    if (
      block.type === 'paragraph' &&
      Array.isArray(block.content) &&
      block.content.some((c) => c.type === 'image')
    ) {
      // 把 image 拆出来，inline 内容按 image 前后切到独立 paragraph
      const before: PMNode[] = []
      const after: PMNode[] = []
      let passedImage = false
      for (const child of block.content) {
        if (child.type === 'image') {
          if (before.length > 0) {
            out.push({ type: 'paragraph', content: before.splice(0) })
          }
          out.push(child)
          passedImage = true
        } else if (passedImage) {
          after.push(child)
        } else {
          before.push(child)
        }
      }
      if (after.length > 0) {
        out.push({ type: 'paragraph', content: after })
      }
      // 若只有 image 没有前后文本，nothing to push；image 已加进 out
    } else {
      out.push(block)
    }
  }
  return { type: 'doc', content: out }
}

function parseMarkdown(lines: string[], fromIdx: number): PMDoc {
  const blocks: PMNode[] = []
  let i = fromIdx

  while (i < lines.length) {
    const line = lines[i]

    // 空行：跳过
    if (line.trim() === '') {
      i++
      continue
    }

    // horizontal rule
    if (RE_HR.test(line)) {
      blocks.push({ type: 'horizontalRule' })
      i++
      continue
    }

    // heading
    const hMatch = line.match(RE_HEADING)
    if (hMatch) {
      const level = hMatch[1].length
      blocks.push({
        type: 'heading',
        attrs: { level },
        content: tokenizeInline(hMatch[2]),
      })
      i++
      continue
    }

    // fenced code block
    const fenceMatch = line.match(RE_FENCE)
    if (fenceMatch) {
      const lang = fenceMatch[1]
      i++
      const codeLines: string[] = []
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i++
      }
      i++ // 跳过收尾 ```
      blocks.push({
        type: 'codeBlock',
        attrs: { language: lang || null },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      })
      continue
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const { node, consumed } = parseBlockquote(lines, i)
      blocks.push(node)
      i += consumed
      continue
    }

    // 列表族
    const kind = detectListKind(line)
    if (kind) {
      const indent = getIndent(line)
      const { node, consumed } = parseList(lines, i, indent, kind)
      blocks.push(node)
      i += consumed
      continue
    }

    // paragraph：连续非空行
    const paraLines: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() !== '') {
      // 如果是块起始，就停
      if (
        RE_HR.test(lines[i]) ||
        RE_HEADING.test(lines[i]) ||
        RE_FENCE.test(lines[i]) ||
        /^>\s?/.test(lines[i]) ||
        detectListKind(lines[i].slice(getIndent(lines[i])))
      ) {
        break
      }
      paraLines.push(lines[i])
      i++
    }
    blocks.push({
      type: 'paragraph',
      content: tokenizeInline(paraLines.join('\n')),
    })
  }

  return { type: 'doc', content: blocks }
}