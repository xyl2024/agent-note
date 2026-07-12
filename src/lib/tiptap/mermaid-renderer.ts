'use client'

// -----------------------------------------------------------------------------
// Mermaid 渲染模块（仅 client side）：
// 1. 动态 import('mermaid')，避免 600KB 进首屏
// 2. 主题切换（项目用 .dark class）→ 重画
// 3. 长度门限 50KB：超过就直接显示「过长不渲染」（P3 决策，挡住怪图 / 死循环）
//
// 主题实现策略（重要）：
// - mermaid 11 用 khroma 解析颜色，**只支持 hex / rgb / hsl / named**，
//   不支持 oklch / lab / lch / oklab（实测 + 源码确认）
// - 因此不能用项目 CSS 变量（oklch）作为 mermaid themeVariables；改用 hard-coded hex
//   两套（明/暗），跟项目视觉靠近就行
//
// 设计原则：
// - 关键决策：mermaid.render() 返回 SVG 字符串，由调用方用 dangerouslySetInnerHTML
//   插入 DOM；**模块完全不写用户 DOM**——避免 React reconciliation 与 mermaid 内部
//   临时 DOM 操作冲突（"Failed to execute removeChild"）
// - 不调用 mermaid 的 bindFunctions（它会按 id 注册 SVG 事件到 stale 节点，多实例下
//   失稳）。SVG 静态预览不需交互。
// - 主题切换时调 useMermaidThemeVersion() 让 React rerender + doRender 走一遍
// -----------------------------------------------------------------------------

import type MermaidDefault from 'mermaid'

export type Mermaid = typeof MermaidDefault
export type MermaidSvgResult = { ok: true; svg: string }
export type MermaidSvgError = { ok: false; error: string }
export type MermaidSvgResponse = MermaidSvgResult | MermaidSvgError

/** 长度门限：50KB 源码直接跳过 render（防超大图 / 死循环） */
export const MAX_MERMAID_SOURCE_LENGTH = 50 * 1024

// -----------------------------------------------------------------------------
// 主题色板：hex 字符串，khroma 100% 接受。明/暗各一套，跟项目视觉靠近但不完美匹配。
// -----------------------------------------------------------------------------
const LIGHT_THEME: Record<string, string> = {
  background: '#FCFBF8',
  primaryColor: '#FFFFFF',
  primaryTextColor: '#252525',
  primaryBorderColor: '#EBE9E3',
  lineColor: '#252525',
  secondaryColor: '#F7F6F3',
  tertiaryColor: '#F7F6F3',
}
const DARK_THEME: Record<string, string> = {
  background: '#252422',
  primaryColor: '#34302F',
  primaryTextColor: '#F8F7F4',
  primaryBorderColor: 'rgba(255, 255, 255, 8%)',
  lineColor: '#F8F7F4',
  secondaryColor: '#3A3633',
  tertiaryColor: '#3A3633',
}
// 字体：项目 Geist Mono（如果有）
const FONT_FAMILY = 'var(--font-geist-mono), ui-monospace, monospace'

let mermaidInstance: Mermaid | null = null
let mermaidLoadingPromise: Promise<Mermaid> | null = null
let lastAppliedPalette: 'light' | 'dark' | null = null
let versionCounter = 0
const subscribers = new Set<() => void>()
let themeObserverStarted = false

/** 动态 import 'mermaid'，返回 Promise<Mermaid>，缓存单例 */
export async function getMermaid(): Promise<Mermaid> {
  if (mermaidInstance) return mermaidInstance
  if (mermaidLoadingPromise) return mermaidLoadingPromise
  mermaidLoadingPromise = import('mermaid').then((mod) => {
    mermaidInstance = (mod as { default: Mermaid }).default
    return mermaidInstance
  })
  return mermaidLoadingPromise
}

function detectCurrentPalette(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * 启动一次性的 <html class> 观察者：dark 切换时让所有 mermaid 重画。
 * 幂等，重复调用安全。
 */
function startThemeObserver() {
  if (themeObserverStarted || typeof document === 'undefined') return
  themeObserverStarted = true
  const target = document.documentElement
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName === 'class') {
        versionCounter++
        lastAppliedPalette = null
        subscribers.forEach((cb) => cb())
      }
    }
  })
  observer.observe(target, { attributes: true, attributeFilter: ['class'] })
}

/** 给订阅者用：当主题版本变化时调用 cb */
export function subscribeMermaidThemeVersion(cb: () => void): () => void {
  startThemeObserver()
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

/** 当前主题版本号（仅当变化时 +1） */
export function getMermaidThemeVersion(): number {
  startThemeObserver()
  return versionCounter
}

/**
 * 用当前 palette 调 mermaid.initialize（只在 palette 变化时重新调）。
 */
async function ensureInitialized(): Promise<Mermaid> {
  const m = await getMermaid()
  const palette = detectCurrentPalette()
  if (lastAppliedPalette !== palette) {
    const themeVariables = palette === 'dark' ? DARK_THEME : LIGHT_THEME
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: FONT_FAMILY,
      themeVariables,
    })
    lastAppliedPalette = palette
  }
  return m
}

/**
 * 纯函数式 render：返回 SVG 字符串，**完全不写用户 DOM**。
 * - 源码过长返回 { ok: false, error: 'too-long' }
 * - parse / render 抛错返回 { ok: false, error: ... }
 * - 成功返回 { ok: true, svg }
 *
 * 调用方拿到 svg 后用 React 的 dangerouslySetInnerHTML 接管 DOM。
 */
export async function renderMermaidSvg(id: string, code: string): Promise<MermaidSvgResponse> {
  if (code.length > MAX_MERMAID_SOURCE_LENGTH) {
    return { ok: false, error: 'too-long' }
  }
  let m: Mermaid
  try {
    m = await ensureInitialized()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  try {
    const { svg } = await m.render(id, code)
    return { ok: true, svg }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
