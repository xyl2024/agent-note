import 'dotenv/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { indexBlockTokens, indexPageTokens } from './fts'
import { extractTextFromNode } from '@/lib/tiptap/extract-text'

// -----------------------------------------------------------------------------
// 一次性脚本：把现有 pages / blocks 的内容全量灌进 FTS5
// 用途：Session 2.4 之前写的笔记不会被自动索引；跑这个脚本补一遍
// -----------------------------------------------------------------------------
const dbPath = process.env.DATABASE_URL ?? './data/notes.db'
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

async function main() {
  const allPages = await db.select().from(schema.pages)
  let pageCount = 0
  for (const p of allPages) {
    const row = sqlite
      .prepare('SELECT rowid FROM pages WHERE id = ?')
      .get(p.id) as { rowid: number } | undefined
    if (row) {
      indexPageTokens(row.rowid, p.title)
      pageCount++
    }
  }
  console.log(`Indexed ${pageCount} pages`)

  const allBlocks = await db.select().from(schema.blocks)
  let blockCount = 0
  for (const b of allBlocks) {
    const row = sqlite
      .prepare('SELECT rowid FROM blocks WHERE id = ?')
      .get(b.id) as { rowid: number } | undefined
    if (row) {
      const text = extractTextFromNode(b.content)
      indexBlockTokens(row.rowid, text)
      blockCount++
    }
  }
  console.log(`Indexed ${blockCount} blocks`)

  sqlite.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})