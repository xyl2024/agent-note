# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

`agent-note` 是一个**单用户自用**的类 Notion 笔记应用（目前处于 MVP 打磨阶段）。

**要求**：
- **只用中文与用户交流**（这是硬规则，重复三遍）。
- **不要自己跑浏览器测试**，任何 UI 验证都让用户来做。
- **MVP 阶段不考虑数据兼容性 / 数据库迁移**：schema 变了允许直接删表重来，`data/` 是测试数据不入 git。

## 常用命令

| 场景 | 命令 |
|---|---|
| 启动开发服务器 | `pnpm dev`（首启自动建库，无需手动 `db:migrate`） |
| 生产构建 | `pnpm build`（`next.config.ts` 启用了 `output: 'standalone'`） |
| 生产运行 | `pnpm start` |
| Lint | `pnpm lint`（`eslint-config-next` core-web-vitals + typescript） |
| 生成迁移 | `pnpm db:generate` |
| 应用迁移 | `pnpm db:migrate`（首次 clone 后手动跑一次也行，靠 `bootstrap()` 也能自愈） |
| Drizzle Studio | `pnpm db:studio` |
| FTS5 全量回填 | `pnpm fts:backfill` |
| 抽取 lucide 图标路径 | `pnpm lucide:extract`（生成 `src/lib/lucide-paths.json`） |
| API 端到端测试 | `bash scripts/test-api.sh`（需 `pnpm dev` 在跑） |
| 编辑器保存往返测试 | `bash scripts/test-editor-save.sh` |
| 搜索功能测试 | `bash scripts/test-search.sh` |
| 上传功能测试 | `bash scripts/test-upload.sh` |
| Markdown 解析/序列化 | `node --import tsx scripts/test-markdown.mjs` |

测试脚本都是 bash + curl（除 markdown 是 Node），要求 dev server 已在 `localhost:3000` 跑起来。

## 高层架构

```
src/
├── app/                       # Next.js App Router
│   ├── page.tsx               # /         → Notion 风格首页 HomeView
│   ├── p/[id]/page.tsx        # /p/[id]   → 编辑器页（SSR 校验存在 → AppShell）
│   ├── api/...                # Route Handlers（纯 Node runtime）
│   ├── layout.tsx             # ThemeProvider + Geist 字体
│   └── globals.css            # Tailwind 4 入口
├── components/
│   ├── app-shell.tsx          # 顶层布局：Sidebar + 主区 + SearchDialog
│   ├── sidebar/               # 页面树 + Cmd+K 触发 + IconPicker
│   ├── editor/editor.tsx      # Tiptap 主编辑器（forwardRef 暴露命令）
│   ├── home/                  # 首页 HomeView + page-tree-row
│   ├── search/search-dialog.tsx
│   ├── icon-picker/           # emoji + lucide 选图标
│   └── ui/                    # shadcn (base-nova)
├── lib/
│   ├── tiptap/                # Tiptap 扩展集 + 自定义节点/Mark + Markdown 互转
│   │   ├── extensions.ts      # buildExtensions() — 编辑器装配入口
│   │   ├── code-block-view.tsx
│   │   ├── heading-anchor.ts
│   │   ├── page-link.ts       # 自定义 Mark
│   │   ├── page-link-suggestion.ts  # [[ 触发联想
│   │   ├── slash-command.ts   # / 触发节点类型
│   │   ├── doc-blocks.ts      # Tiptap doc ↔ DB block 数组互转
│   │   └── extract-text.ts    # FTS5 tokens 提取
│   ├── markdown/              # PMDoc ↔ Markdown（自写，不支持 HTML）
│   ├── icon-resolver.tsx + lucide-icons.tsx  # icon 渲染
│   ├── debounce.ts
│   └── utils.ts               # cn() 等
└── db/
    ├── client.ts              # better-sqlite3 + drizzle 单例，bootstrap 自愈
    ├── schema.ts              # 4 张表（pages/blocks/assets + 关系）
    ├── init.ts                # bootstrap() — 建表 + FTS5 虚表 + 触发器
    ├── fts.ts                 # FTS5 索引读写 + MATCH 查询辅助
    ├── backfill-fts.ts
    └── migrate.ts             # `pnpm db:migrate` 入口
data/                          # 运行时数据（不入 git）
├── notes.db + .db-shm + .db-wal
└── uploads/YYYY-MM/<uuid>.<ext>   # 图片 / 附件
```

### 数据模型（`src/db/schema.ts`）

| 表 | 关键字段 | 备注 |
|---|---|---|
| `pages` | id, parentId(自引用), title, slug, iconType('emoji'/'lucide'), iconValue, createdAt, updatedAt | 树形结构，索引 `parentId` + `updatedAt` |
| `blocks` | id, pageId, parentBlockId, order(**REAL**), type, content(JSON, ProseMirror Node), createdAt, updatedAt | 一篇笔记的块；`order` 用 REAL 以便拖到中间；级联删 page |
| `assets` | id, pageId, path, mime, size, createdAt | `path = "uploads/YYYY-MM/<id>.<ext>"`；级联删 page |

**FTS5 虚表**（在 `init.ts` 用 `sqlite.exec()` 手动建，Drizzle 不支持）：
- `blocks_fts(tokens, page_id, block_id)` + INSERT/DELETE/UPDATE 触发器（触发器只建空行，tokens 由应用层写）
- `pages_fts(tokens, page_id)` — 用页面 title 做索引

### 路由 & API

页面：`/`（首页 HomeView）· `/p/[id]`（编辑器，404 → notFound）。

API（都在 `src/app/api/`，Node runtime）：

| Method | Path | 用途 |
|---|---|---|
| `GET/POST` | `/api/pages` | 列表 / 新建（含 `parentId`、`icon`、`title`） |
| `GET/PATCH/DELETE` | `/api/pages/[id]` | 读 / 改标题和图标 / 级联删除 |
| `GET/PUT` | `/api/pages/[id]/blocks` | 读所有块 / 全量替换（用于保存整个 doc） |
| `PATCH/DELETE` | `/api/blocks/[id]` | 单块更新（order/type/content） / 删除 |
| `POST` | `/api/upload` | 图片/文件 → `data/uploads/YYYY-MM/` + assets 表 |
| `GET` | `/api/files/[id]` | 读 asset 字节流 |
| `GET` | `/api/search` | FTS5 全站搜索（页面 + 块） |
| `GET` | `/api/stats` | 首页统计 |
| `GET` | `/api/favicon/[id]` | 页面图标作为 favicon |

### 编辑器（`src/components/editor/editor.tsx`）

- Tiptap 3 + React。`useEditor` 时必须 `immediatelyRender: false`（SSR 必需）。
- `<Editor key={pageId} ... />` —— 切换笔记时强制重挂。
- 改 props 中的函数必须以 `Action` 结尾（Next.js 16 Client Component 硬要求）：`onTitleChangeAction` / `onPageLinkClickAction` / `createPageAction` ...
- 自己写的 Mark / Extension：`PageLink`（双链）、`SlashCommand`（/ 菜单）、`HeadingAnchor`（标题 # 链接）。
- Markdown 粘贴：`looksLikeMarkdown()` 判定 → `markdownToDoc()` 转 ProseMirror JSON。
- 图片粘贴/拖拽走 `POST /api/upload`，回填 URL。
- 保存防抖：`debounce()` → `PUT /api/pages/[id]/blocks` 全量提交块数组。
