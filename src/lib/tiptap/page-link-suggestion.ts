import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance } from 'tippy.js'
import {
  PageLinkMenuList,
  type PageLinkItem,
  type PageLinkMenuRef,
} from '@/components/editor/page-link-menu'

// -----------------------------------------------------------------------------
// PageLinkSuggestion 扩展：监听 "[[" 字符，弹出页面搜索浮窗
// 与 SlashCommand 同一套 Tippy + ReactRenderer 模式
//
// 设计：
// - findSuggestionMatch 自定义（默认只接受单 char），要求 [[ 开头
// - items 是 async，框架自带 debounce 防止每个 keystroke 都打 API
// - 用户选中页面 → 删除 [[xxx + 插入带 pageLink mark 的文本 + 末尾加空格（避免 mark 继承）
// - 用户选「创建新页面」→ 同样的插入流程，但 pageId = null
// -----------------------------------------------------------------------------

type Options = {
  /** 异步搜索页面（query = "[[" 之后的字符串） */
  searchAction: (query: string, signal: AbortSignal) => Promise<PageLinkItem[]>
  /** 用户点击「创建新页面」时调用，返回新页面的 PageLinkItem */
  createAction: (title: string) => Promise<PageLinkItem>
}

export const PageLinkSuggestion = Extension.create<Options>({
  name: 'pageLinkSuggestion',

  addOptions() {
    return {
      searchAction: async () => [],
      createAction: async (title) => ({ pageId: null, pageTitle: title }),
    }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    return [
      Suggestion<PageLinkItem>({
        editor: this.editor,
        // 必填：与 SlashCommand 区分，否则 PM 报 "Adding different instances of a keyed plugin (suggestion$)"
        pluginKey: new PluginKey('agentNotePageLinkSuggestion'),
        findSuggestionMatch: ({ $position }) => {
          // 从当前块起点到 cursor 的纯文本
          const text = $position.parent.textBetween(
            0,
            $position.parentOffset,
            '\n',
            '\0',
          )
          // 匹配 [[ 开头 + 不含 [ ] 换行 的 query，停在末尾
          const match = text.match(/\[\[([^\[\]\n]*)$/)
          if (!match) return null
          const from = $position.pos - match[0].length
          const to = $position.pos
          return {
            range: { from, to },
            query: match[1],
            text: match[0],
          }
        },
        allowSpaces: true, // 页面标题可以有空格
        allowToIncludeChar: false,
        startOfLine: false,
        debounce: 150, // 框架内置防抖
        items: ({ query, signal }) => opts.searchAction(query.trim(), signal),
        command: ({ editor, range, props }) => {
          const item = props
          // 删除 [[xxx 输入
          editor.chain().focus().deleteRange(range).run()
          // 插入带 pageLink mark 的文本
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'text',
              text: item.pageTitle,
              marks: [
                {
                  type: 'pageLink',
                  attrs: {
                    pageId: item.pageId,
                    pageTitle: item.pageTitle,
                  },
                },
              ],
            })
            // 末尾空格：避免下一个字符继承 mark
            .insertContent(' ')
            .run()
        },
        render: () => {
          let component: ReactRenderer<PageLinkMenuRef> | null = null
          let popup: Instance[] | null = null

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(PageLinkMenuList, {
                props: {
                  items: props.items,
                  query: props.query,
                  command: props.command,
                  createAction: opts.createAction,
                },
                editor: props.editor,
              })
              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                arrow: false,
                offset: [0, 8],
                maxWidth: 'none',
              })
            },
            onUpdate: (props: SuggestionProps) => {
              component?.updateProps({
                items: props.items,
                query: props.query,
                command: props.command,
                createAction: opts.createAction,
              })
              if (!props.clientRect || !popup) return
              popup[0].setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              })
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide()
                return true
              }
              return component?.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              popup?.[0]?.destroy()
              component?.destroy()
              popup = null
              component = null
            },
          }
        },
      }),
    ]
  },
})
