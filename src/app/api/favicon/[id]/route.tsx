import type { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { createElement } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { pages } from '@/db/schema'
import lucidePaths from '@/lib/lucide-paths.json'

const SIZE = { width: 32, height: 32 }
const BRAND_COLOR = '#4787FF'

// lucide icon path 节点类型：[tag, props][]
type IconNode = [string, Record<string, string>]
const LUCIDE_PATHS = lucidePaths as unknown as Record<string, IconNode[]>

// 把 lucide icon 渲染成 SVG JSX
// 注意：lucide-react@1.x 是 'use client'，不能从 server 直接调用 <Icon />。
// 我们用 scripts/extract-lucide-paths.mjs 预先把每个 icon 的 __iconNode 抽到
// lucide-paths.json，然后通过 createElement 重建 SVG（createElement 是 react
// 核心 API，不依赖 react-dom/server）。
function LucideIconSvg({
  name,
  color = BRAND_COLOR,
  size = 26,
}: {
  name: string
  color?: string
  size?: number
}) {
  const node = LUCIDE_PATHS[name]
  if (!node) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {node.map(([tag, props], i) =>
        createElement(tag, { ...props, key: i }),
      )}
    </svg>
  )
}

// 品牌图标（与 src/app/icon.svg、src/components/brand-icon.tsx 保持一致）
function BrandIcon() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1024 1024"
        style={{ display: 'block' }}
      >
        <path
          d="M677.333333 810.666667h-341.333333a42.666667 42.666667 0 0 1-42.666667-42.666667V373.333333a21.333333 21.333333 0 0 1 42.666667 0V768h341.333333a42.666667 42.666667 0 0 0 42.666667-42.666667V298.666667a42.666667 42.666667 0 0 0-42.666667-42.666667h-341.333333v21.333333a21.333333 21.333333 0 0 1-42.666667 0v-21.333333a42.666667 42.666667 0 0 1 42.666667-42.666667h341.333333a85.333333 85.333333 0 0 1 85.333334 85.333334v426.666666a85.333333 85.333333 0 0 1-85.333334 85.333334z"
          fill="#4787FF"
        />
        <path
          d="M592 394.666667h-128a21.333333 21.333333 0 0 1 0-42.666667h128a21.333333 21.333333 0 0 1 0 42.666667zM592 480h-128a21.333333 21.333333 0 0 1 0-42.666667h128a21.333333 21.333333 0 0 1 0 42.666667zM549.333333 704h-42.666666a21.333333 21.333333 0 0 1 0-42.666667h42.666666a21.333333 21.333333 0 0 1 0 42.666667z"
          fill="#4787FF"
        />
        <path
          d="M346.666667 394.666667h-64a21.333333 21.333333 0 0 1 0-42.666667h64a21.333333 21.333333 0 0 1 0 42.666667zM346.666667 533.333333h-64a21.333333 21.333333 0 0 1 0-42.666666h64a21.333333 21.333333 0 0 1 0 42.666666zM346.666667 672h-64a21.333333 21.333333 0 0 1 0-42.666667h64a21.333333 21.333333 0 0 1 0 42.666667z"
          fill="#FF5964"
        />
      </svg>
    </div>
  )
}

// -----------------------------------------------------------------------------
// GET /api/favicon/[id]
// 返回 PNG favicon：
//   - id === 'default' 或页面不存在/无 icon → 品牌默认
//   - iconType === 'emoji' → 文本渲染 emoji
//   - iconType === 'lucide' → 通过预提取的 path data + createElement 渲染 SVG
// 缓存策略：no-store，确保用户编辑 icon 后能立即看到新 favicon
// -----------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id || id === 'default') {
    return new ImageResponse(<BrandIcon />, SIZE)
  }

  const target = await db
    .select({ iconType: pages.iconType, iconValue: pages.iconValue })
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1)
  const page = target[0]

  if (!page?.iconType || !page.iconValue) {
    return new ImageResponse(<BrandIcon />, SIZE)
  }

  if (page.iconType === 'emoji') {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            lineHeight: 1,
          }}
        >
          {page.iconValue}
        </div>
      ),
      SIZE,
    )
  }

  if (page.iconType === 'lucide') {
    if (LUCIDE_PATHS[page.iconValue]) {
      return new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIconSvg name={page.iconValue} />
          </div>
        ),
        SIZE,
      )
    }
  }

  return new ImageResponse(<BrandIcon />, SIZE)
}