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
// 收藏：isFavorite + favoritedAt 字段，未收藏时 favoritedAt 为 null
//   - 取消收藏：isFavorite=false, favoritedAt=null
//   - 加入收藏：isFavorite=true, favoritedAt=now（后端维护，客户端不用传时间）
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
    isFavorite: integer('is_favorite', { mode: 'boolean' })
      .notNull()
      .default(false),
    favoritedAt: integer('favorited_at', { mode: 'timestamp_ms' }),
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
    // 收藏区查询："WHERE is_favorite=1 ORDER BY favorited_at DESC" 走这个复合索引
    index('pages_favorite_idx').on(t.isFavorite, t.favoritedAt),
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

// Type exports
export type Page = typeof pages.$inferSelect
export type NewPage = typeof pages.$inferInsert
export type Block = typeof blocks.$inferSelect
export type NewBlock = typeof blocks.$inferInsert