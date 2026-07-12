'use client'

import { createContext, useContext } from 'react'

// -----------------------------------------------------------------------------
// ImageActionContext：让 ImageNodeView（被 ReactNodeViewRenderer 渲染到
// ProseMirror DOM 里，脱离 editor.tsx 的 props 链）能反向通知父组件打开
// lightbox。
//
// 这是项目里第一处用 React Context 跨 NodeView 边界的通信 —— 比
// editor.storage 语义更对（storage 是 per-extension 配置/缓存单例，不是
// 事件总线），比 addCommands + tr.setMeta hack 更轻。
//
// 使用约定：父组件（Editor）用 Provider 包住 <EditorContent>；NodeView
// 通过 useImageAction() 拿回调；ctx === null 时（极端：脱离 Provider 渲染）
// 静默 no-op。
// -----------------------------------------------------------------------------

export type ImagePreviewItem = {
  src: string
  alt: string | null
  title: string | null
}

// Lightbox 的打开状态：当前文档里所有图片（按 doc 顺序）+ 当前显示的 index。
// 一次点击带全集合，省得每次翻页都重新 walk doc。
export type ImagePreviewPayload = {
  images: ImagePreviewItem[]
  index: number
}

export const ImageActionContext = createContext<{
  onPreviewAction: (payload: ImagePreviewPayload) => void
} | null>(null)

export function useImageAction() {
  return useContext(ImageActionContext)
}