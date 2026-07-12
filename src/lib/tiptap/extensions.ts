import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { Extensions } from '@tiptap/react'
import { CodeBlockView } from './code-block-view'
import { HeadingAnchor } from './heading-anchor'
import { IndentShortcuts } from './indent-shortcuts'
import { ImageNodeView } from '@/components/editor/image-node-view'

// Tiptap 扩展集合
// - StarterKit 提供：paragraph, heading, list, codeBlock, blockquote, bold, italic 等
//   - codeBlock：StarterKit 默认禁用，自定义 addNodeView 用 CodeBlockView 渲染（顶部 header + 复制按钮）
// - TaskList/Item：待办列表（不在 StarterKit 默认里）
// - ImageWithAttrs：自定义 Image（kind/width/height attrs + 防盗链/懒加载属性，详见下方）
// - Table 4 件套：表格（resizable: true 启用列宽拖拽；单元格仅允许 inline）
// - HeadingAnchor：注入 # 链接到 heading 末尾，hover 时显示，点击复制 URL hash
export function buildExtensions(placeholder: string): Extensions {
  // 自定义 CodeBlock：保留 schema，渲染走 CodeBlockView（顶部 header + 复制按钮）
  // - 打开 enableTabIndentation：让 CodeBlock 内置的 Tab/Shift+Tab 处理（按 tabSize
  //   插入/删除空格）。不打开的话，Tiptap 让浏览器默认 Tab 走移焦，焦点会跳出编辑器。
  const CodeBlockWithView = CodeBlock.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView)
    },
  }).configure({
    enableTabIndentation: true,
    tabSize: 4,
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
    // Table 4 件套：启用内置列宽拖拽；不写自定义 NodeView，靠 editor.css 调样式
    Table.configure({
      resizable: true,
      // 允许点击单元格内部空白处仍视为进入单元格（默认行为），不开启 allowTableNodeSelection
      // 因为我们用自定义 BubbleMenu 控制行/列操作，不需要"选中整个 table"的 node selection
    }),
    TableRow,
    TableHeader,
    TableCell,
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
    // 放最后：低优先级。listItem/taskItem/codeBlock 内的 Tab 会先被 ListKeymap /
    // CodeBlock 自带的 enableTabIndentation 处理，本扩展只在普通段落 / heading /
    // blockquote 等没专属缩进语义的节点上生效。
    IndentShortcuts,
  ]
}