import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { blocks } from '@/db/schema'

// -----------------------------------------------------------------------------
// PATCH /api/blocks/[id] — 更新单个块（content / type / order / parentBlockId）
// -----------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as {
    type?: string
    content?: unknown
    order?: number
    parentBlockId?: string | null
  }

  const updates: Partial<typeof blocks.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (body.type !== undefined) updates.type = body.type
  if (body.content !== undefined) updates.content = body.content as never
  if (body.order !== undefined) updates.order = body.order
  if (body.parentBlockId !== undefined) updates.parentBlockId = body.parentBlockId

  const result = await db
    .update(blocks)
    .set(updates)
    .where(eq(blocks.id, id))
    .returning()

  if (result.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ block: result[0] })
}

// -----------------------------------------------------------------------------
// DELETE /api/blocks/[id] — 删除单个块
// -----------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const result = await db.delete(blocks).where(eq(blocks.id, id)).returning()
  if (result.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ deleted: result[0] })
}