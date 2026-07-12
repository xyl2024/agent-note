'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/theme/theme-context'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // 避免 hydration 不匹配：先挂载一个 placeholder，mounted 后再渲染真实图标
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setMounted(true), [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="切换主题">
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="切换主题"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}