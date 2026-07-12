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
import { ImageNodeView } from '@/components/editor/image-node-view'

// Tiptap 扩展集合
// - StarterKit 提供：paragraph, heading, list, codeBlock, blockquote, bold, italic 等
//   - codeBlock：StarterKit 默认禁用，自定义 addNodeView 用 CodeBlockView 渲染（顶部 header + 复制按钮）
// - TaskList/Item：待办列表（不在 StarterKit 默认里）
// - ImageWithAttrs：自定义 Image（kind/width/height attrs + 防盗链/懒加载属性，详见下方）
// - HeadingAnchor：注入 # 链接到 heading 末尾，hover 时显示，点击复制 URL hash
export function buildExtensions(placeholder: string): Extensions {
  // 自定义 CodeBlock：保留 schema，渲染走 CodeBlockView（顶部 header + 复制按钮）
  const CodeBlockWithView = CodeBlock.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView)
    },
  })

  // 自定义 Image：
  // - 扩展 attrs：kind('local' | 'external'，默认 'local') / width / height
  // - renderHTML 排除 kind（避免 React unknown DOM property warning）
  // - 固定输出 loading="lazy" decoding="async" referrerpolicy="no-referrer"
  const ImageWithAttrs = Image.extend({
    addAttributes() {
      return {
        src: { default: null },
        alt: { default: null },
        title: { default: null },
        kind: { default: 'local' as const },
        width: { default: null },
        height: { default: null },
      }
    },
    addNodeView() {
      return ReactNodeViewRenderer(ImageNodeView)
    },
    renderHTML({ HTMLAttributes }) {
      const { kind: _kind, width, height, ...rest } = HTMLAttributes as Record<
        string,
        unknown
      >
      void _kind // kind 不输出到 DOM（内部字段）
      return [
        'img',
        {
          ...rest,
          loading: 'lazy',
          decoding: 'async',
          referrerpolicy: 'no-referrer',
          ...(width != null ? { width } : {}),
          ...(height != null ? { height } : {}),
        },
      ]
    },
  }).configure({
    inline: false,
    allowBase64: false,
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
    ImageWithAttrs,
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