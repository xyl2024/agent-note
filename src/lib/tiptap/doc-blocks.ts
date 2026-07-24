import type { PMDoc, PMNode } from '@/db/schema'
import type { Block } from '@/db/schema'

// -----------------------------------------------------------------------------
// 数据库块数组 ↔ Tiptap Doc 转换
// 顶层块（parent_block_id = null）映射为 Tiptap doc 的顶层节点
// -----------------------------------------------------------------------------

/**
 * 数据库顶层块数组 → Tiptap doc JSON
 */
export function blocksToTiptapDoc(blocks: Block[]): PMDoc {
  const sorted = [...blocks].sort((a, b) => a.order - b.order)
  const content = sorted.map((b) => b.content)
  return { type: 'doc', content }
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