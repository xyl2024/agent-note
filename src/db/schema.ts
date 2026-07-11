import {
  sqliteTable,
  text,
  real,
  integer,
  index,
} from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// 类型：ProseMirror 节点内容（存进 SQLite 的 JSON 字段）
// -----------------------------------------------------------------------------
export type PMMark = {
  type: string
  attrs?: Record<string, unknown>
}

export type PMNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: PMMark[]
  text?: string
}

export type PMDoc = {
  type: 'doc'
  content?: PMNode[]
}

// -----------------------------------------------------------------------------
// 页面 icon 类型：emoji（unicode 字符） 或 lucide（lucide-react icon name）
// null 表示未设置 icon（fallback 到默认占位符）
// -----------------------------------------------------------------------------
export const ICON_TYPES = ['emoji', 'lucide'] as const
export type IconType = (typeof ICON_TYPES)[number]

// -----------------------------------------------------------------------------
// pages：页面元数据（树形）
// -----------------------------------------------------------------------------
export const pages = sqliteTable(
  'pages',
  {
    id: text('id').primaryKey(),
    parentId: text('parent_id'),
    title: text('title').notNull().default('Untitled'),
    slug: text('slug').notNull(),
    iconType: text('icon_type', { enum: ICON_TYPES }),
    iconValue: text('icon_value'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('pages_parent_idx').on(t.parentId),
    index('pages_updated_idx').on(t.updatedAt),
  ],
)

// -----------------------------------------------------------------------------
// blocks：块（树形，order 是 REAL 用于拖拽插入中间）
// -----------------------------------------------------------------------------
export const blocks = sqliteTable(
  'blocks',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    parentBlockId: text('parent_block_id'),
    order: real('order').notNull(),
    type: text('type').notNull(),
    content: text('content', { mode: 'json' }).notNull().$type<PMNode>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('blocks_page_idx').on(t.pageId, t.order),
    index('blocks_parent_idx').on(t.parentBlockId, t.order),
  ],
)

// -----------------------------------------------------------------------------
// assets：图片/附件
// -----------------------------------------------------------------------------
export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    pageId: text('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('assets_page_idx').on(t.pageId)],
)

// -----------------------------------------------------------------------------
// relations：Drizzle 的关系查询支持
// 树形结构不需要 relationName（那只是用来区分多个相同表之间的关系）
// -----------------------------------------------------------------------------
export const pagesRelations = relations(pages, ({ one, many }) => ({
  parent: one(pages, {
    fields: [pages.parentId],
    references: [pages.id],
  }),
  children: many(pages),
  blocks: many(blocks),
  assets: many(assets),
}))

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  page: one(pages, {
    fields: [blocks.pageId],
    references: [pages.id],
  }),
  parent: one(blocks, {
    fields: [blocks.parentBlockId],
    references: [blocks.id],
  }),
  children: many(blocks),
}))

export const assetsRelations = relations(assets, ({ one }) => ({
  page: one(pages, {
    fields: [assets.pageId],
    references: [pages.id],
  }),
}))

// Type exports
export type Page = typeof pages.$inferSelect
export type NewPage = typeof pages.$inferInsert
export type Block = typeof blocks.$inferSelect
export type NewBlock = typeof blocks.$inferInsert
export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert