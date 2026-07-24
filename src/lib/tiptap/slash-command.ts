import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
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
//
// 选项：
//   - onSelectExternalImageAction?: () => void
//       选中"图片(外链 URL)"项时回调（用于父组件打开外链图片 dialog）
// -----------------------------------------------------------------------------

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      // 父组件传入：选中"图片(外链 URL)"项时回调（用于打开外链图片 dialog）
      onSelectExternalImageAction: undefined as (() => void) | undefined,
    }
  },

  addProseMirrorPlugins() {
    // 此处 this 是 Extension 实例，能访问 this.options.onSelectExternalImageAction
    const onSelectExternalImageAction = this.options.onSelectExternalImageAction
    return [
      Suggestion({
        editor: this.editor,
        // 必填：自定义 pluginKey 避免 PM 报 "Adding different instances of a keyed plugin (suggestion$)"
        pluginKey: new PluginKey('agentNoteSlashCommandSuggestion'),
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
          ).slice(0, 20)
        },
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let popup: Instance[] | null = null

          return {
            onStart: (props: SuggestionProps) => {
              component = new ReactRenderer(SlashMenuList, {
                props: {
                  items: props.items,
                  command: props.command,
                  onSelectExternalImageAction,
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
                command: props.command,
                onSelectExternalImageAction,
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