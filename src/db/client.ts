import 'server-only'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { bootstrap } from './init'

// 单例：开发环境热重载时复用同一个 SQLite 连接，避免打开过多句柄
declare global {
  var __sqliteClient: Database.Database | undefined
}

function getSqlite(): Database.Database {
  if (!global.__sqliteClient) {
    const dbPath = process.env.DATABASE_URL ?? './data/notes.db'
    global.__sqliteClient = bootstrap(dbPath)
  }
  return global.__sqliteClient
}

export const sqlite = getSqlite()
export const db = drizzle(sqlite, { schema })
export type DB = typeof db