import type { PMDoc, PMMark, PMNode } from '@/db/schema'

// -----------------------------------------------------------------------------
// Tiptap PMDoc → Markdown 字符串
//
// 支持的块：heading(1-3), paragraph, bulletList, orderedList, taskList,
//          codeBlock, blockquote, horizontalRule
// 支持的 mark：bold, italic, strike, code, link
//
// 嵌套列表用 2 空格缩进（CommonMark 风格）
// -----------------------------------------------------------------------------

const BLOCK_SEP = '\n\n'

/** 把一个 text 节点的 marks 应用为 inline markdown */
function renderText(node: PMNode): string {
  if (!node.text) return ''
  // pageLink 单独处理：输出 [[Title]]（最外层），不参与 bold/italic 等嵌套
  const pageLink = node.marks?.find((m) => m.type === 'pageLink')
  if (pageLink) {
    const title = String(
      (pageLink.attrs as { pageTitle?: string } | undefined)?.pageTitle ?? node.text,
    )
    return `[[${title}]]`
  }
  // 把 link mark 单独拿出来，bold/italic/strike/code 嵌套处理
  const link = node.marks?.find((m) => m.type === 'link')
  let out = escapeText(node.text)
  for (const mark of node.marks ?? []) {
    out = applyMark(out, mark)
  }
  if (link) {
    const href = String((link.attrs as { href?: string } | undefined)?.href ?? '')
    out = `[${out}](${href})`
  }
  return out
}

function applyMark(text: string, mark: PMMark): string {
  switch (mark.type) {
    case 'bold':
      return `**${text}**`
    case 'italic':
      return `*${text}*`
    case 'strike':
      return `~~${text}~~`
    case 'code':
      // code mark 内的内容不进 link 包裹（上面已处理），但 inline ` 内部不能有 `
      return text.includes('`') ? `\`${text.replace(/`/g, ' ')}\`` : `\`${text}\``
    case 'link':
      // link 由 renderText 单独处理，这里 no-op
      return text
    case 'pageLink':
      // pageLink 由 renderText 单独处理，这里 no-op
      return text
    default:
      return text
  }
}

/** 把行内内容（含 marks 的 text 节点序列）渲染成 markdown。
 *  对 block 包装（如 listItem 里的 paragraph、taskItem 直接 text 子节点）会递归提取 text。 */
function renderInline(content: PMNode[] | undefined): string {
  if (!content) return ''
  return content
    .map((n) => {
      if (n.type === 'text') return renderText(n)
      if (n.type === 'image') return renderImage(n)
      // paragraph / 其他 block-like 容器：递归它的 inline content
      return renderInline(n.content)
    })
    .join('')
}

/** image 节点 → ![alt](url "title") 形态 */
function renderImage(node: PMNode): string {
  const attrs = (node.attrs ?? {}) as {
    src?: string | null
    alt?: string | null
    title?: string | null
  }
  const src = attrs.src ?? ''
  const alt = attrs.alt ?? ''
  const title = attrs.title
  if (title) {
    const escaped = title.replace(/"/g, '\\"')
    return `![${alt}](${src} "${escaped}")`
  }
  return `![${alt}](${src})`
}

/** 转义 markdown 里有特殊意义的字符（仅在 paragraph 内的纯文本里需要） */
function escapeText(text: string): string {
  return text
}

// -----------------------------------------------------------------------------
// 块渲染
// -----------------------------------------------------------------------------

function renderBlock(node: PMNode, depth = 0): string {
  const indent = '  '.repeat(depth)
  switch (node.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `${indent}${'#'.repeat(level)} ${renderInline(node.content)}`
    }
    case 'paragraph':
      return `${indent}${renderInline(node.content)}`
    case 'blockquote': {
      const inner = (node.content ?? [])
        .map((c) => renderBlock(c, depth))
        .join('\n')
      // 整段加 > 前缀（包括多行）
      return inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
    }
    case 'bulletList':
    case 'orderedList': {
      const ordered = node.type === 'orderedList'
      const items = node.content ?? []
      return items
        .map((item, i) => {
          const marker = ordered ? `${i + 1}.` : '-'
          const inner = renderListItem(item, depth, ordered, i + 1)
          return `${indent}${marker} ${inner}`.replace(/\s+$/, '')
        })
        .join('\n')
    }
    case 'taskList': {
      const items = node.content ?? []
      return items
        .map((item) => {
          const checked = Boolean(
            (item.attrs as { checked?: boolean } | undefined)?.checked,
          )
          const marker = checked ? '- [x]' : '- [ ]'
          const inner = renderInline(item.content)
          return `${indent}${marker} ${inner}`.replace(/\s+$/, '')
        })
        .join('\n')
    }
    case 'codeBlock': {
      const lang = String((node.attrs as { language?: string } | undefined)?.language ?? '')
      const text = (node.content ?? []).map((c) => c.text ?? '').join('')
      return `${indent}\`\`\`${lang}\n${text}\n${indent}\`\`\``
    }
    case 'horizontalRule':
      return `${indent}---`
    case 'image':
      return `${indent}${renderImage(node)}`
    default:
      // 未知块降级为段落
      return `${indent}${renderInline(node.content)}`
  }
}

/** listItem 内部可能有 paragraph + 嵌套 list。我们需要把 paragraph 提到 marker 同行的尾部，
 *  嵌套 list 缩进跟随。 */
function renderListItem(item: PMNode, depth: number, _ordered: boolean, _n: number): string {
  const children = item.content ?? []
  const parts: string[] = []
  let nested: PMNode[] = []
  for (const child of children) {
    if (child.type === 'paragraph') {
      parts.push(renderInline(child.content))
    } else if (
      child.type === 'bulletList' ||
      child.type === 'orderedList' ||
      child.type === 'taskList' ||
      child.type === 'blockquote'
    ) {
      nested.push(child)
    } else {
      parts.push(renderInline(child.content))
    }
  }
  // 头行 = parts 拼起来；嵌套列表换行后渲染（depth+1）
  const head = parts.join(' ').trimEnd()
  const nestedMd = nested
    .map((n) => renderBlock(n, depth + 1))
    .join('\n\n')
  return nestedMd ? `${head}\n${nestedMd}` : head
}

// -----------------------------------------------------------------------------
// 入口
// -----------------------------------------------------------------------------

export function docToMarkdown(doc: PMDoc): string {
  if (!doc.content) return ''
  return doc.content.map((b) => renderBlock(b)).join(BLOCK_SEP)
}