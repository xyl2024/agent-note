import 'server-only'
import { sqlite } from '@/db/client'

// -----------------------------------------------------------------------------
// FTS5 索引写入辅助
// 触发器在 blocks/pages 增删改时已经在 fts 表里留了一行空记录（rowid 对应），
// 这里只负责把 tokens 列填上内容。
// -----------------------------------------------------------------------------

/** 写入（或覆盖）一个块的 FTS5 tokens。触发器保证 rowid 已存在。 */
export function indexBlockTokens(blockRowid: number, text: string): void {
  sqlite
    .prepare('UPDATE blocks_fts SET tokens = ? WHERE rowid = ?')
    .run(text, blockRowid)
}

/** 写入（或覆盖）一个页面的 FTS5 tokens（用页面 title 索引）。 */
export function indexPageTokens(pageRowid: number, text: string): void {
  sqlite
    .prepare('UPDATE pages_fts SET tokens = ? WHERE rowid = ?')
    .run(text, pageRowid)
}

/** 查一个 block 的 rowid（FTS5 表用 block 的 rowid 当主键）。 */
export function getBlockRowid(blockId: string): number | null {
  const row = sqlite
    .prepare('SELECT rowid FROM blocks WHERE id = ?')
    .get(blockId) as { rowid: number } | undefined
  return row?.rowid ?? null
}

/** 查一个 page 的 rowid（FTS5 表用 page 的 rowid 当主键）。 */
export function getPageRowid(pageId: string): number | null {
  const row = sqlite
    .prepare('SELECT rowid FROM pages WHERE id = ?')
    .get(pageId) as { rowid: number } | undefined
  return row?.rowid ?? null
}

// -----------------------------------------------------------------------------
// FTS5 查询辅助
// 用 better-sqlite3 直接跑 prepare（比 Drizzle 简单：MATCH 是 FTS5 专属语法）
// -----------------------------------------------------------------------------

export type BlockHit = {
  blockId: string
  pageId: string
  snippet: string
  rank: number
}

export type PageHit = {
  pageId: string
  title: string
  rank: number
}

/** 搜索 blocks_fts：返回 block id + page id + 简短上下文（snippet 函数自带 <mark> 标签）。 */
export function searchBlocks(query: string, limit = 30): BlockHit[] {
  // FTS5 MATCH 必须用双引号包 query 防止 tokenizer 解析关键字
  const stmt = sqlite.prepare(`
    SELECT
      fts.block_id AS blockId,
      fts.page_id  AS pageId,
      snippet(blocks_fts, 0, '<mark>', '</mark>', '…', 16) AS snippet,
      bm25(blocks_fts) AS rank
    FROM blocks_fts fts
    WHERE blocks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `)
  const rows = stmt.all(query, limit) as Array<{
    blockId: string
    pageId: string
    snippet: string
    rank: number
  }>
  return rows
}

/** 搜索 pages_fts：返回 page id + title。 */
export function searchPages(query: string, limit = 20): PageHit[] {
  const stmt = sqlite.prepare(`
    SELECT
      fts.page_id AS pageId,
      pages.title  AS title,
      bm25(pages_fts) AS rank
    FROM pages_fts fts
    JOIN pages ON pages.id = fts.page_id
    WHERE pages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `)
  const rows = stmt.all(query, limit) as Array<{
    pageId: string
    title: string
    rank: number
  }>
  return rows
}