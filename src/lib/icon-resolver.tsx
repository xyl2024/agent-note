import * as React from 'react'
import type { IconType } from '@/db/schema'
import { ICON_COMPONENTS } from '@/lib/lucide-icons'

// -----------------------------------------------------------------------------
// 统一的 icon 渲染器
// 输入：iconType + iconValue，输出：React 节点
// - iconType=null 或 iconValue 为空 → 返回 null（调用方负责 fallback 占位）
// - iconType='emoji' → 把 value 当 unicode 字符渲染
// - iconType='lucide' → 在 ICON_COMPONENTS 查组件，找不到返回 null
// -----------------------------------------------------------------------------
export function resolveIcon(
  iconType: IconType | null | undefined,
  iconValue: string | null | undefined,
): React.ReactNode {
  if (!iconType || !iconValue) return null
  if (iconType === 'emoji') {
    return <span aria-hidden="true">{iconValue}</span>
  }
  if (iconType === 'lucide') {
    const Icon = ICON_COMPONENTS[iconValue]
    if (!Icon) return null
    return <Icon className="h-full w-full" />
  }
  return null
}
