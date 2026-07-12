import { Extension } from '@tiptap/core'

// 与 codeBlock 的 tabSize 对齐，保证列表外 / 代码块内视觉一致
const TAB_SIZE = 4

// -----------------------------------------------------------------------------
// IndentShortcuts
//
// 解决「段落 / heading / blockquote 内按 Tab 无反应」的体验问题：
// - 列表项（listItem / taskItem）的 Tab/Shift+Tab 由 ListKeymap 自带的
//   sinkListItem / liftListItem 处理，本扩展不抢。
// - 代码块（codeBlock）的 Tab/Shift+Tab 在 extensions.ts 里打开了
//   enableTabIndentation: true，自带逻辑会接管。
// - 其它普通文本节点：Tab 在选区起始位置插入 4 个空格；多选区时按
//   "    " + 行内容 缩进每一行。Shift+Tab 删除光标前最多 4 个连续空格。
//
// 设计：addKeyboardShortcuts 返回的 handler 必须显式 `return false` 才让
// ProseMirror 继续试下一个 plugin。这里用「当前父节点是 listItem/taskItem/
// codeBlock 就 return false」把控制权交还给已有 keymap。
// -----------------------------------------------------------------------------
export const IndentShortcuts = Extension.create({
  name: 'indentShortcuts',

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const { $from, empty } = selection
        const parentType = $from.parent.type.name

        if (
          parentType === 'listItem' ||
          parentType === 'taskItem' ||
          parentType === 'codeBlock'
        ) {
          return false
        }

        const indent = ' '.repeat(TAB_SIZE)

        if (!empty) {
          // 多选区：按行缩进（与 codeBlock 内置 Tab 行为对齐）
          return editor.commands.command(({ tr }) => {
            const { from, to } = selection
            const text = state.doc.textBetween(from, to, '\n', '\n')
            const lines = text.split('\n')
            const indented = lines.map((line) => indent + line).join('\n')
            tr.replaceWith(from, to, state.schema.text(indented))
            return true
          })
        }

        // 空选区：原地插 4 空格
        return editor.commands.insertContent(indent)
      },

      'Shift-Tab': ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const { $from, empty } = selection
        const parentType = $from.parent.type.name

        if (
          parentType === 'listItem' ||
          parentType === 'taskItem' ||
          parentType === 'codeBlock'
        ) {
          return false
        }

        if (!empty) return false

        // 在当前 textblock 中查找光标前连续空格前缀，最多删 TAB_SIZE 个。
        // 用 textBetween 而非手动走 Node，因为代码块等节点走不到这里。
        const parentStart = $from.start()
        const before = state.doc.textBetween(parentStart, $from.pos, '\n', '\n')
        const match = before.match(new RegExp(` {1,${TAB_SIZE}}$`))
        if (!match) return false

        const removeCount = match[0].length
        return editor.commands.deleteRange({
          from: $from.pos - removeCount,
          to: $from.pos,
        })
      },
    }
  },
})