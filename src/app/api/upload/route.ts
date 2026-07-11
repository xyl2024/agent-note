import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { assets, pages, type NewAsset } from '@/db/schema'

// -----------------------------------------------------------------------------
// POST /api/upload — 上传图片
//
// Body: multipart/form-data
//   - file:    File 对象（必填）
//   - pageId:  关联页面（可选，记录用）
//
// 仅接受 image/* 类型，限 10MB。
// 存到 data/uploads/YYYY-MM/<uuid>.<ext>，并写一行 assets 表。
// 返回 { assetId, url, mime, size }
// -----------------------------------------------------------------------------

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const UPLOAD_ROOT = join(process.cwd(), 'data', 'uploads')

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  }
  return map[mime] ?? (mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin')
}

export async function POST(request: NextRequest) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const mime = file.type
  if (!mime.startsWith('image/')) {
    return NextResponse.json(
      { error: `unsupported type: ${mime}（仅接受 image/*）` },
      { status: 400 },
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `file too large: ${file.size} > ${MAX_SIZE}` },
      { status: 413 },
    )
  }

  const rawPageId = form.get('pageId')
  const pageId = typeof rawPageId === 'string' ? rawPageId : ''

  if (!pageId) {
    return NextResponse.json({ error: 'pageId is required' }, { status: 400 })
  }

  const found = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1)
  if (found.length === 0) {
    return NextResponse.json({ error: 'page not found' }, { status: 400 })
  }

  // 写文件
  const id = randomUUID()
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dir = join(UPLOAD_ROOT, `${yyyy}-${mm}`)
  await mkdir(dir, { recursive: true })

  const ext = extFromMime(mime)
  const filename = `${id}.${ext}`
  const absPath = join(dir, filename)
  // 相对路径用于读回（data/uploads/YYYY-MM/uuid.ext）
  const relPath = join('uploads', `${yyyy}-${mm}`, filename)

  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(absPath, buf)

  // 写 DB
  const newAsset: NewAsset = {
    id,
    pageId,
    path: relPath,
    mime,
    size: file.size,
    createdAt: now,
  }
  await db.insert(assets).values(newAsset)

  return NextResponse.json({
    assetId: id,
    url: `/api/files/${id}`,
    mime,
    size: file.size,
  })
}

// Next.js 16 配置：上传可能较大，给更长时间
export const maxDuration = 30
