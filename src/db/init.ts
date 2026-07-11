import 'server-only'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

// -----------------------------------------------------------------------------
// bootstrap(dbPath)
//   1) 确保 SQLite 文件的父目录存在（better-sqlite3 不会自动建目录）
//   2) 打开连接 + 启用 WAL / 外键
//   3) 核心表不存在则跑 Drizzle 迁移 + 建 FTS5 虚表 / 触发器
//
// 设计动机：让 `pnpm dev` 和生产容器启动都"零配置可用"，
//   - 不再要求新克隆仓库的人先手动 `pnpm db:migrate`
//   - Docker 第一次启动 / volume 为空时也能自愈
//   - 老库已经初始化过则什么都不做（幂等）
// -----------------------------------------------------------------------------
const MIGRATIONS_FOLDER = './src/db/migrations'

const FTS_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
    tokens,
    page_id UNINDEXED,
    block_id UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
  );

  CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN
    INSERT INTO blocks_fts(rowid, tokens, page_id, block_id)
    VALUES (new.rowid, '', new.page_id, new.id);
  END;

  CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN
    DELETE FROM blocks_fts WHERE rowid = old.rowid;
  END;

  CREATE TRIGGER IF NOT EXISTS blocks_au AFTER UPDATE ON blocks BEGIN
    DELETE FROM blocks_fts WHERE rowid = old.rowid;
    INSERT INTO blocks_fts(rowid, tokens, page_id, block_id)
    VALUES (new.rowid, '', new.page_id, new.id);
  END;

  CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    tokens,
    page_id UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
  );

  CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
    INSERT INTO pages_fts(rowid, tokens, page_id)
    VALUES (new.rowid, '', new.id);
  END;

  CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
    DELETE FROM pages_fts WHERE rowid = old.rowid;
  END;

  CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
    DELETE FROM pages_fts WHERE rowid = old.rowid;
    INSERT INTO pages_fts(rowid, tokens, page_id)
    VALUES (new.rowid, '', new.id);
  END;
`

/** 核心表是否存在，用来判断是否需要初始化 */
function needsInit(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(
      "SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='pages' LIMIT 1",
    )
    .get() as { x: number } | undefined
  return !row
}

/** 确保 dbPath 的父目录存在；absolute / relative 都安全 */
function ensureParentDir(dbPath: string): void {
  const abs = isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), dbPath)
  const dir = dirname(abs)
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function bootstrap(dbPath: string): Database.Database {
  ensureParentDir(dbPath)

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  if (needsInit(sqlite)) {
    const db = drizzle(sqlite)
    console.log(`[db] initializing ${dbPath} ...`)
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    sqlite.exec(FTS_SQL)
    console.log('[db] schema + FTS5 ready.')
  }

  return sqlite
}