// -----------------------------------------------------------------------------
// image-url.ts: 图片 URL 协议分类与 kind 推断工具
// -----------------------------------------------------------------------------
// 用法：
//   - inferImageKind(src) → 根据协议推断 kind ('local' | 'external')
//   - isRenderableImageSrc(src) → 协议白名单判定(markdown 解析严格模式用)
// -----------------------------------------------------------------------------

export type ImageKind = 'local' | 'external'

export const HTTP_RE = /^https?:\/\//i
export const LOCAL_API_PREFIX = '/api/files/'

export function isHttpUrl(url: string): boolean {
  return HTTP_RE.test(url)
}

export function isLocalApiUrl(url: string): boolean {
  return url.startsWith(LOCAL_API_PREFIX)
}

export function inferImageKind(src: string): ImageKind {
  return isHttpUrl(src) ? 'external' : 'local'
}

// markdown 解析时的严格白名单:仅 http/https 与本地 /api/files/ 视为可渲染图片
export function isRenderableImageSrc(src: string): boolean {
  return isHttpUrl(src) || isLocalApiUrl(src)
}