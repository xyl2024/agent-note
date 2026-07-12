import type { PMDoc, PMNode } from '@/db/schema'
import type { Block } from '@/db/schema'

// -----------------------------------------------------------------------------
// 数据库块数组 ↔ Tiptap Doc 转换
// 顶层块（parent_block_id = null）映射为 Tiptap doc 的顶层节点
// -----------------------------------------------------------------------------

/**
 * 数据库顶层块数组 → Tiptap doc JSON
 *
 * 兜底修复脏数据：早期 markdown 解析器会把 image（block 节点）嵌进 paragraph，
 * 导致 doc 里出现 `paragraph(image)` 这种非法结构。
 * Tiptap 加载时虽然会尝试 lift，但 saved doc 残留脏数据会让按 Enter / 输入
 * 触发 "Called contentMatchAt on a node with invalid content"。
 * 这里在送进 setContent 前主动 lift 出 image，让 doc 合法。
 */
export function blocksToTiptapDoc(blocks: Block[]): PMDoc {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)
  const content = sorted.flatMap((b) => liftImagesOutOfBlock(b.content))
  return { type: 'doc', content }
}

/**
 * 把 block.content 里含 image 的 paragraph 拆成 [paragraph(before), image, paragraph(after)]
 * 顶层就是 image（没有 paragraph 包裹）时原样返回。
 */
function liftImagesOutOfBlock(node: PMNode): PMNode[] {
  if (
    node.type === 'paragraph' &&
    Array.isArray(node.content) &&
    node.content.some((c) => c.type === 'image')
  ) {
    const before: PMNode[] = []
    const after: PMNode[] = []
    let passedImage = false
    const out: PMNode[] = []
    for (const child of node.content) {
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
    return out
  }
  return [node]
}

export type SaveBlockInput = {
  type: string
  content: PMNode
  order: number
  id?: string
}

/** Tiptap doc → 待保存的块数组（顶层） */
export function tiptapDocToSaveBlocks(
  doc: PMDoc,
  existingIds: string[] = [],
): SaveBlockInput[] {
  if (!doc.content) return []
  return doc.content.map((node, idx) => ({
    type: node.type,
    content: node,
    order: idx,
    id: existingIds[idx], // 尽量复用已有 id，减少新建
  }))
}

// 注：pageId 通过 API URL 隐式提供，不在块 payload 里
export type SaveBlockWithPage = SaveBlockInput & { pageId: string }