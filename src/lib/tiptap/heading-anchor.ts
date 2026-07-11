import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// -----------------------------------------------------------------------------
// HeadingAnchor
// 给每个 heading 节点：
//   1) 在其对应的 DOM 元素上写 id（slug 形如 1-foo），便于外部 anchor 跳转 +
//      IntersectionObserver 做 scroll spy。
//   2) 末尾注入一个 # 链接 widget，hover 时显示，点击复制 URL hash 到剪贴板。
//
// 设计要点：
// - 只在 editor DOM 层面操作（不写 schema、不进 PMDoc），不破坏文档结构。
// - widget contentEditable=false，避免编辑时选中。
// - 用 nodeView 提供的副作用同样可以实现；这里走 ProseMirror Plugin.decoration
//   是因为它能同时给 widget 和 node attrs 一致的访问点。
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
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  id,
                  'data-anchor-id': id,
                }),
              )

              // 空 heading 不挂 # widget：
              // widget 是 contentEditable=false 的 <a>，作为 h1 子元素
              // 会把 IME 的临时拼音文本挡在节点外侧，导致第一个字符
              // 无法正常上屏。空 heading 本身没有锚点语义，跳过即可。
              if (node.content.size === 0) return

              // heading 节点结构: open token + content + close token
              // innerEnd = pos + nodeSize - 1 = 最后一个 content 位置之后
              // side: 1 让 widget 插在 content 末尾（仍在 heading 内）
              const innerEnd = pos + node.nodeSize - 1
              decorations.push(
                Decoration.widget(
                  innerEnd,
                  () => {
                    const a = document.createElement('a')
                    a.className = 'heading-anchor'
                    a.textContent = '#'
                    a.contentEditable = 'false'
                    a.setAttribute('data-anchor-id', id)
                    a.setAttribute('aria-label', `复制链接到 ${node.textContent}`)
                    a.addEventListener('mousedown', (e) => {
                      e.preventDefault()
                    })
                    a.addEventListener('click', (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const url = `${window.location.origin}${window.location.pathname}#${id}`
                      try {
                        history.replaceState(null, '', '#' + id)
                      } catch {
                        // 忽略 history API 错误
                      }
                      navigator.clipboard?.writeText(url).catch(() => {
                        // 剪贴板权限被拒 → 仅更新 URL hash，不报错
                      })
                    })
                    return a
                  },
                  {
                    side: 1,
                    ignoreSelection: true,
                    key: `anchor-${pos}-${id}`,
                  },
                ),
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