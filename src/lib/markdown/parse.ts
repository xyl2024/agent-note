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

/** 解析不含 link 的 inline 文本 → text 节点序列（可能带 mark）
 *
 * 行内 code 严格按 CommonMark §6.1 处理：
 *  - 围栏长度 N（≥1）= 开头/结尾连续反引号个数
 *  - 内容里允许最多 N-1 个连续反引号
 *  - 内容首尾若都是空格（且 trim 非空）→ 剥离首尾各 1 空格
 *  - 找不到合法闭合 → 当前反引号当字面字符
 *
 * bold/strike/italic 内部递归调本函数，让 code 段能正确嵌套在粗体里。
 * 外层正则禁止裸的反引号和非自身字符（如 italic 拒绝裸 `*`），再让
 * 内层 inline code 正则负责把反引号段完整吃掉。 */
function tokenizeNonLink(text: string): PMNode[] {
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
    const ch = text[i]

    // --- inline code ---
    if (ch === '`') {
      const openLen = countBackticks(text, i)
      const closeStart = findCodeSpanEnd(text, i + openLen, openLen)
      if (closeStart !== -1) {
        const raw = text.slice(i + openLen, closeStart)
        const stripped =
          raw.length >= 2 && raw.startsWith(' ') && raw.endsWith(' ') && raw.trim().length > 0
            ? raw.slice(1, -1)
            : raw
        flushText()
        out.push({
          type: 'text',
          text: stripped,
          marks: [{ type: 'code' }],
        })
        i = closeStart + openLen
        continue
      }
      // 找不到合法闭合 → 当前 ` 当字面字符
      buf += ch
      i++
      continue
    }

    const rest = text.slice(i)

    // **bold**：内部不允许裸 * 和 `（` 让 code 段整体吃掉）
    const boldMatch = rest.match(/^\*\*((?:[^*`]|`(?:[^`\n]|``[^`\n]+``)*`)+)\*\*/)
    if (boldMatch) {
      flushText()
      pushWithMark(out, tokenizeNonLink(boldMatch[1]), { type: 'bold' })
      i += boldMatch[0].length
      continue
    }

    // ~~strike~~
    const strikeMatch = rest.match(/^~~((?:[^~`]|`(?:[^`\n]|``[^`\n]+``)*`)+)~~/)
    if (strikeMatch) {
      flushText()
      pushWithMark(out, tokenizeNonLink(strikeMatch[1]), { type: 'strike' })
      i += strikeMatch[0].length
      continue
    }

    // *italic*（单星不双星）
    const italicMatch = rest.match(/^\*((?:[^*`]|`(?:[^`\n]|``[^`\n]+``)*`)+)\*/)
    if (italicMatch) {
      flushText()
      pushWithMark(out, tokenizeNonLink(italicMatch[1]), { type: 'italic' })
      i += italicMatch[0].length
      continue
    }

    buf += ch
    i++
  }
  flushText()
  return out
}

/** 从 pos 开始数连续反引号长度（至少 1） */
function countBackticks(text: string, pos: number): number {
  let n = 0
  while (pos + n < text.length && text[pos + n] === '`') n++
  return n
}

/** 从 startPos 起寻找连续 openLen 个反引号作为 code span 的闭合位置。
 *  CommonMark §6.1：code span 内容里允许最多 openLen-1 个连续反引号。
 *  - 不能跨行
 *  - 遇到反引号时数连续长度 runLen：若 runLen !== openLen（不论太长还是太短），
 *    整段都不是合法闭合，整段跳过继续；
 *    若 runLen === openLen，作为合法闭合返回。
 *  返回：闭合起点；找不到 → -1 */
function findCodeSpanEnd(text: string, startPos: number, openLen: number): number {
  let i = startPos
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\n') return -1
    if (ch === '`') {
      const runLen = countBackticks(text, i)
      if (runLen === openLen) return i
      i += runLen
      continue
    }
    i++
  }
  return -1
}

/** 把 inline 节点序列统一追加一个 mark（保留已有 marks） */
function pushWithMark(nodes: PMNode[], inner: PMNode[], mark: MarkSpec): void {
  for (const n of inner) {
    n.marks = [...(n.marks ?? []), mark]
  }
  nodes.push(...inner)
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
// GFM Table
//
// 识别：当前行含 `|`，且下一行是 alignment row（`:---` / `:---:` / `---:`）
// 收集：alignment row 之后所有含 `|` 的连续行作为 data rows
// 结构：table → tableRow[ tableHeader(tableHeader) | tableCell ]
//       cell 内的 inline 内容走 tokenizeInline；空 cell 走空 paragraph
//
// 不支持：嵌套表格（GFM 也不允许）；data row 列数与 header 不一致时容错补空
// -----------------------------------------------------------------------------

/** 把一行表格按 `|` 切分（处理首尾 `|` 和 `\|` 转义） */
function splitTableRow(line: string): string[] {
  let s = line.trim()
  // GFM 允许 `| a | b |` 或 `a | b` 两种首尾风格，统一去掉首尾的 |
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|'
      i++
    } else if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

/** 解析 alignment row 每列的对齐（'left' | 'center' | 'right' | null） */
function parseAlignments(line: string): (string | null)[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((part) => {
    const t = part.trim()
    const isLeft = t.startsWith(':')
    const isRight = t.endsWith(':')
    if (isLeft && isRight) return 'center'
    if (isRight) return 'right'
    if (isLeft) return 'left'
    return null // 默认 left，Tiptap 不写 attrs 即可
  })
}

/** 识别 alignment row（整行由 `|` 分隔的 `:?-+:?` 单元组成）
 *  用 `*` 重复：允许 1 列表格（单列也是合法 GFM） */
const RE_TABLE_ALIGN_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

function parseTable(
  lines: string[],
  startIdx: number,
): { node: PMNode; consumed: number } | null {
  const headerLine = lines[startIdx]
  if (!headerLine.includes('|')) return null
  if (startIdx + 1 >= lines.length) return null
  const alignLine = lines[startIdx + 1]
  if (!RE_TABLE_ALIGN_ROW.test(alignLine)) return null

  const alignments = parseAlignments(alignLine)
  const colCount = alignments.length

  const headerCells = splitTableRow(headerLine)
  // 列数不匹配 → 不是合法 GFM table（交回 paragraph 处理）
  if (headerCells.length !== colCount) return null

  // 收集 data rows
  const dataRows: string[][] = []
  let i = startIdx + 2
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '' || !line.includes('|')) break
    const cells = splitTableRow(line)
    while (cells.length < colCount) cells.push('')
    cells.length = colCount
    dataRows.push(cells)
    i++
  }

  const buildCell = (
    cellText: string,
    align: string | null,
    header: boolean,
  ): PMNode => {
    // align 为 null（默认左对齐）时不写 attrs，避免脏数据
    // 用 spread 让 key 顺序固定为 type → attrs → content（与测试 fixture / 序列化输出一致）
    return {
      type: header ? 'tableHeader' : 'tableCell',
      ...(align ? { attrs: { textAlign: align } } : {}),
      content: [{ type: 'paragraph', content: tokenizeInline(cellText) }],
    }
  }

  const headerRow: PMNode = {
    type: 'tableRow',
    content: headerCells.map((text, idx) =>
      buildCell(text, alignments[idx], true),
    ),
  }

  const dataRowNodes: PMNode[] = dataRows.map((row) => ({
    type: 'tableRow',
    content: row.map((text, idx) => buildCell(text, alignments[idx], false)),
  }))

  return {
    node: { type: 'table', content: [headerRow, ...dataRowNodes] },
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

    // GFM table：当前行含 `|` 且下一行是 alignment row
    // 必须放在 blockquote 之前，但 RE_HR / RE_HEADING 已经在前面过滤掉（header 行
    // 通常不会恰好匹配 `---` 或 `#`）
    if (line.includes('|')) {
      const tableResult = parseTable(lines, i)
      if (tableResult) {
        blocks.push(tableResult.node)
        i += tableResult.consumed
        continue
      }
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
        // alignment row（独立成行的 `| --- | --- |`）也要停，否则会被吞进 paragraph
        RE_TABLE_ALIGN_ROW.test(lines[i]) ||
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