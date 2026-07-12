'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

// -----------------------------------------------------------------------------
// 自写 ThemeProvider：替代 next-themes 0.4.6 (其在 React 19 / Next.js 16
// Turbopack 下会因渲染 <script> 而报警告)
//
// 用法：
//   <ThemeProvider>{children}</ThemeProvider>          // 在 layout.tsx
//   const { theme, setTheme, resolvedTheme } = useTheme()  // 在 theme-toggle.tsx
//
// 防闪烁策略：在 layout.tsx 的 <head> 里放一段 inline blocking script 同步设置
// <html class>，本组件只负责 mount 后接管状态。
// -----------------------------------------------------------------------------

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export const THEME_STORAGE_KEY = 'theme'

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyResolvedTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {}
  return 'system'
}

type Props = {
  children: React.ReactNode
}

export function ThemeProvider({ children }: Props) {
  // 默认值与 blocking script 的判断结果一致(都是 'system'),
  // 避免 hydration mismatch 时闪一下
  const [theme, setThemeState] = useState<Theme>('system')
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('light')

  // mount 后读 localStorage + 真实 system 偏好
  // 同步外部存储(localStorage / matchMedia)到 React state 是合理用法,
  // 这里没有更合适的 API(useSyncExternalStore 对一次性 mount-after-read 过重)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setThemeState(readStoredTheme())
    setSystemTheme(getSystemTheme())
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // 监听 system 偏好变化
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? systemTheme : theme

  // 把 resolved 同步到 <html class>
  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t)
    } catch {}
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}