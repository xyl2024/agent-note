import { Type } from 'lucide-react'

// Session 1.2 占位：mock 文档内容
// Session 1.3 会替换为真正的 Tiptap 编辑器
const PLACEHOLDER_DOC = {
  icon: '👋',
  title: '欢迎使用 Agent Note',
  blocks: [
    { type: 'heading', level: 1, text: '这是一个 Notion 风格的笔记应用' },
    {
      type: 'paragraph',
      text: '你现在看到的是 Session 1.2 完成的三栏布局骨架。左侧是页面树，中间是编辑器占位，右侧暂时留空。',
    },
    { type: 'paragraph', text: '' },
    { type: 'heading', level: 2, text: '接下来的里程碑' },
    { type: 'todo', checked: true, text: 'Session 1.0 项目初始化' },
    { type: 'todo', checked: true, text: 'Session 1.1 数据模型 + 后端 API' },
    { type: 'todo', checked: true, text: 'Session 1.2 三栏布局 + 主题' },
    { type: 'todo', checked: false, text: 'Session 1.3 Tiptap 编辑器核心' },
    { type: 'paragraph', text: '' },
    { type: 'heading', level: 2, text: '技术栈' },
    { type: 'paragraph', text: 'Next.js 16 · Tiptap · SQLite · Tailwind 4 · shadcn/ui' },
    { type: 'codeBlock', language: 'ts', text: 'const stack = ["Next.js 16", "Tiptap", "SQLite"]\nconsole.log(stack)' },
  ],
}

export function EditorPlaceholder() {
  return (
    <div className="mx-auto w-full max-w-3xl px-12 py-16">
      {/* Icon + Title */}
      <div className="mb-8">
        <div className="mb-2 text-7xl">{PLACEHOLDER_DOC.icon}</div>
        <h1 className="text-4xl font-bold tracking-tight">
          {PLACEHOLDER_DOC.title}
        </h1>
      </div>

      {/* Blocks */}
      <div className="flex flex-col gap-2 text-base leading-7">
        {PLACEHOLDER_DOC.blocks.map((b, i) => {
          if (b.type === 'heading') {
            const Tag = (`h${b.level ?? 1}` as 'h1' | 'h2' | 'h3')
            const cls =
              b.level === 1
                ? 'mt-6 text-2xl font-semibold'
                : b.level === 2
                  ? 'mt-4 text-xl font-semibold'
                  : 'mt-2 text-lg font-semibold'
            return (
              <Tag key={i} className={cls}>
                {b.text}
              </Tag>
            )
          }
          if (b.type === 'todo') {
            return (
              <label
                key={i}
                className="flex items-start gap-2 text-foreground/90"
              >
                <input
                  type="checkbox"
                  defaultChecked={b.checked}
                  className="mt-2 h-4 w-4 rounded border-border accent-primary"
                  readOnly
                />
                <span className={b.checked ? 'text-muted-foreground line-through' : ''}>
                  {b.text}
                </span>
              </label>
            )
          }
          if (b.type === 'codeBlock') {
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-md bg-muted p-4 font-mono text-sm"
              >
                <code>{b.text}</code>
              </pre>
            )
          }
          return (
            <p key={i} className="text-foreground/90">
              {b.text || <Type className="h-4 w-4 text-muted-foreground/40" />}
            </p>
          )
        })}
      </div>

      {/* Empty trailing line, like Notion */}
      <div className="mt-2 text-muted-foreground/50">|</div>
    </div>
  )
}