'use client'

// ThemeProvider re-export：保持 `import { ThemeProvider } from '@/components/theme-provider'`
// 这条导入路径稳定不变，layout.tsx 与历史代码无需改动。
export { ThemeProvider } from './theme/theme-context'