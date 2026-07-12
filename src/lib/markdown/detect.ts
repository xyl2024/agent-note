// -----------------------------------------------------------------------------
// Markdown 检测
// 用于粘贴时判断剪贴板里的纯文本是不是 Markdown 语法
// -----------------------------------------------------------------------------

/** 宽松检测：任一 markdown 特征命中即视为 markdown */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false
  // 块级特征
  // GFM table 特征要求至少 3 个 `|`（header row 通常首尾 + 中间分隔各一个），
  // 避免普通段落里偶然出现 `|` 字符就被误判。
  const blockRe = /(^|\n)(#{1,6} |\*{3,}|-{3,}|`{3,}|>\s|[-*+]\s+\[[ xX]\]|[-*+]\s|\d+\.\s|\|[^\n]*\|[^\n]*\|)/
  if (blockRe.test(text)) return true
  // 行内 mark 特征（image 语法 `![alt](url)` 与 link 同形，加在前面更早命中）
  const inlineRe = /(!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|~~[^~\n]+~~|\[[^\]]+\]\([^)\s]+\)|\[\[[^\]\n]+\]\])/
  if (inlineRe.test(text)) return true
  return false
}