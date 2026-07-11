import { NextResponse, type NextRequest } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { assets } from '@/db/schema'

// -----------------------------------------------------------------------------
// GET /api/files/[id] — 读取上传的图片/文件
//
// 返回二进制流 + mime + cache 头（ETag + 1 year immutable）。
// 404：id 不存在 或 文件丢失
// -----------------------------------------------------------------------------

const UPLOAD_ROOT = join(process.cwd(), 'data')

// 防止 path traversal：assets.path 是我们自己写的，不会包含 ..
function safeJoin(relPath: string): string | null {
  const abs = join(UPLOAD_ROOT, relPath)
  const norm = normalize(abs)
  if (!norm.startsWith(UPLOAD_ROOT)) return null
  return norm
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  const rows = await db
    .select({
      id: assets.id,
      path: assets.path,
      mime: assets.mime,
      size: assets.size,
    })
    .from(assets)
    .where(eq(assets.id, id))
    .limit(1)

  const asset = rows[0]
  if (!asset) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const abs = safeJoin(asset.path)
  if (!abs) {
    return NextResponse.json({ error: 'invalid path' }, { status: 500 })
  }

  try {
    await stat(abs)
  } catch {
    return NextResponse.json({ error: 'file missing on disk' }, { status: 404 })
  }

  const buf = await readFile(abs)

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': asset.mime,
      'Content-Length': String(asset.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${asset.id}"`,
    },
  })
}
