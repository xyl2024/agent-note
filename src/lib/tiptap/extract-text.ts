import type { PMNode } from '@/db/schema'

// -----------------------------------------------------------------------------
// 从 PMDoc / PMNode JSON 提取纯文本（用于 FTS5 索引和搜索摘要）
// 设计目标：
// - 递归走所有节点
// - text 节点取 .text
// - 块之间用空格分隔，避免词粘连
// -----------------------------------------------------------------------------

export function extractTextFromNode(node: PMNode): string {
  // text 节点
  if (node.type === 'text') {
    return node.text ?? ''
  }
  // 非 text 节点：递归取所有后代 text
  if (node.content) {
    return node.content.map(extractTextFromNode).join(' ')
  }
  return ''
}

export function extractTextFromNodes(nodes: PMNode[]): string {
  return nodes.map(extractTextFromNode).filter(Boolean).join('\n')
}