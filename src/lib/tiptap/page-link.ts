import { Mark, mergeAttributes } from '@tiptap/core'

// -----------------------------------------------------------------------------
// PageLink Mark：双向链接到另一个 page 的 mark
//
// - attrs.pageId: 目标页面的 UUID；如果为 null 表示页面尚未创建（点击会弹「创建」对话框）
// - attrs.pageTitle: 标题（冗余存，避免外部渲染拿不到 title 时显示空白）
// - 渲染：<a class="page-link" data-page-id="..." data-page-title="...">text</a>
// - 点击：Editor 的 handleClickOn 拦截后调用 AppShell 的 onPageLinkClickAction
// -----------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLink: {
      /**
       * 设置 pageLink mark 到选区（或在空选区时光标位置插入）。
       * 通常通过 insertPageLink 命令更顺手。
       */
      setPageLink: (attrs: { pageId: string | null; pageTitle: string }) => ReturnType
      /**
       * 取消选区的 pageLink mark
       */
      unsetPageLink: () => ReturnType
    }
  }
}

export const PageLink = Mark.create({
  name: 'pageLink',

  // 允许和其他 mark 共存（bold/italic/code 可叠在链接上）
  excludes: '',
  spanning: true,
  inclusive: false,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page-id'),
        renderHTML: (attrs) => {
          if (!attrs.pageId) return {}
          return { 'data-page-id': attrs.pageId }
        },
      },
      pageTitle: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-page-title') ?? '',
        renderHTML: (attrs) => ({
          'data-page-title': attrs.pageTitle ?? '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a.page-link' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: 'page-link',
        href: '#', // 占位；点击会被 handleClickOn 拦截，不会真正跳转
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setPageLink:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs)
        },
      unsetPageLink:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})
