import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance } from 'tippy.js'
import {
  SLASH_ITEMS,
  SlashMenuList,
  type SlashMenuRef,
  type SlashItem,
} from '@/components/editor/slash-menu'

// -----------------------------------------------------------------------------
// SlashCommand 扩展：监听 "/" 字符，弹出块类型菜单
// 使用 Tippy.js + React Renderer 在光标位置浮动显示
// -----------------------------------------------------------------------------
type SuggestionProps = {
  editor: import('@tiptap/core').Editor
  range: { from: number; to: number }
  query: string
  text: string
  items: SlashItem[]
  command: (item: SlashItem) => void
  decorationNode: Element | null
  clientRect: (() => DOMRect | null) | null
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: import('@tiptap/core').Editor
          range: { from: number; to: number }
          props: SlashItem
        }) => {
          props.command({ editor, range })
        },
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return SLASH_ITEMS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.keywords.some((k) => k.toLowerCase().includes(q)),
          ).slice(0, 10)
        },
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let popup: Instance[] | null = null

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(SlashMenuList, {
                props: { items: props.items, command: props.command },
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
                command: props.command,
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
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        // 必填：与 PageLinkSuggestion 区分，否则 PM 报 "Adding different instances of a keyed plugin (suggestion$)"
        pluginKey: new PluginKey('agentNoteSlashCommandSuggestion'),
        ...this.options.suggestion,
      }),
    ]
  },
})