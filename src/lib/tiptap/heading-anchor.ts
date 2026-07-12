import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// -----------------------------------------------------------------------------
// HeadingAnchor
// 给每个 heading 节点在其对应的 DOM 元素上写 id（slug 形如 1-foo），
// 便于外部 anchor 跳转 + Outline 大纲的 scroll spy 定位。
//
// 设计要点：
// - 只在 editor DOM 层面操作（不写 schema、不进 PMDoc），不破坏文档结构。
// - 用 ProseMirror Plugin.decoration 写 node attrs，比 nodeView 更轻量。
// -----------------------------------------------------------------------------

/** slugify 中文 + 英文混合的 heading 文本 */
function slugify(text: string): string {
  const trimmed = text.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed
    .replace(/\s+/g, '-')
    .replace(/[^\w一-龥-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export type HeadingItem = {
  level: number
  text: string
  id: string
  pos: number
}

export const HeadingAnchor = Extension.create({
  name: 'headingAnchor',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('headingAnchor'),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = []
            const seen = new Set<string>()

            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'heading') return
              const level = node.attrs.level as number
              const base = slugify(node.textContent) || 'heading'
              let id = `${level}-${base}`
              let n = 2
              while (seen.has(id)) {
                id = `${level}-${base}-${n++}`
              }
              seen.add(id)

              // 给 heading DOM 节点加 id（用 Decoration.node 改 attrs）
              // Outline 大纲的 scroll spy 依赖 querySelector(`#${id}`) 定位
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  id,
                  'data-anchor-id': id,
                }),
              )
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

// -----------------------------------------------------------------------------
// 抽 headings：与上面 decorations 同步的 slug 规则（必须保持一致！）
// 供 Editor 在 onUpdate 时调用，把结果上抛给 Outline。
// -----------------------------------------------------------------------------
export function extractHeadings(doc: import('@tiptap/pm/model').Node): HeadingItem[] {
  const out: HeadingItem[] = []
  const seen = new Set<string>()
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const level = node.attrs.level as number
    const text = node.textContent
    const base = slugify(text) || 'heading'
    let id = `${level}-${base}`
    let n = 2
    while (seen.has(id)) id = `${level}-${base}-${n++}`
    seen.add(id)
    out.push({ level, text, id, pos })
  })
  return out
}