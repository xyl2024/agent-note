import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { Extensions } from '@tiptap/react'
import { CodeBlockView } from './code-block-view'
import { HeadingAnchor } from './heading-anchor'

// Tiptap 扩展集合
// - StarterKit 提供：paragraph, heading, list, codeBlock, blockquote, bold, italic 等
//   - codeBlock：StarterKit 默认禁用，自定义 addNodeView 用 CodeBlockView 渲染（顶部 header + 复制按钮）
// - TaskList/Item：待办列表（不在 StarterKit 默认里）
// - Placeholder：空块提示
// - Image：图片节点（不允许 base64，仅支持 URL；由 Editor.handlePaste/handleDrop 上传后插入）
// - HeadingAnchor：注入 # 链接到 heading 末尾，hover 时显示，点击复制 URL hash
export function buildExtensions(placeholder: string): Extensions {
  // 自定义 CodeBlock：保留 schema，渲染走 CodeBlockView（顶部 header + 复制按钮）
  const CodeBlockWithView = CodeBlock.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView)
    },
  })

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // 关闭 StarterKit 自带的 codeBlock，由下面的 CodeBlockWithView 替代
      codeBlock: false,
    }),
    CodeBlockWithView,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({
      inline: false,
      allowBase64: false,
    }),
    Placeholder.configure({
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
          const level = node.attrs.level as number
          return `标题 ${'一二三四五六'[level - 1] ?? level}`
        }
        return placeholder
      },
      includeChildren: true,
    }),
    HeadingAnchor,
  ]
}