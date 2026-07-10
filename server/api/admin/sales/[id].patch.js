// PATCH /api/admin/sales/:id
// Same payload shape as POST /api/admin/sales; image is optional (omit to
// keep the existing one). Item rows are replaced wholesale (delete+recreate)
// since diffing a composite list isn't worth the complexity here.

import {
  defineEventHandler,
  readMultipartFormData,
  getRequestHeader,
  createError
} from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { validateSaleMeta, parseSaleWindow } from '@/server/utils/saleValidation'
import { assertNoSaleOverlap } from '@/server/utils/saleOverlap'
import { MAX_IMAGE_BYTES, sniffImageType, sanitizeFilename } from '@/server/utils/imageUploadValidation'
import { clearActiveSaleCache } from '@/server/utils/activeSaleCache'

// Matches the same relative-depth convention used by
// server/api/admin/packs/[id].patch.js (a file at the identical nesting
// depth) so production path resolution stays consistent across the admin API.
const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

async function assertAdmin(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (!me.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  return me
}

export default defineEventHandler(async (event) => {
  const me = await assertAdmin(event)
  const id = event.context.params.id

  const existing = await db.sale.findUnique({
    where: { id },
    include: { items: true }
  })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Sale not found' })

  const parts = await readMultipartFormData(event)
  let imagePart = null, metaPart = null
  for (const p of parts) {
    if (p.filename) imagePart = p
    else if (p.name === 'meta') metaPart = p
  }
  if (!metaPart) throw createError({ statusCode: 400, statusMessage: 'Missing meta field' })

  let meta
  try { meta = JSON.parse(metaPart.data.toString()) }
  catch { throw createError({ statusCode: 400, statusMessage: 'meta must be valid JSON' }) }

  validateSaleMeta(meta)
  const { startAt, endAt } = parseSaleWindow(meta)

  let imagePath = existing.imagePath
  if (imagePart) {
    if (imagePart.data.length > MAX_IMAGE_BYTES) {
      throw createError({ statusCode: 400, statusMessage: 'Image must be 5MB or smaller.' })
    }
    if (!ALLOWED_IMAGE_TYPES.includes(imagePart.type)) {
      throw createError({ statusCode: 400, statusMessage: 'Only PNG, JPEG, GIF, or WEBP images allowed.' })
    }
    if (!sniffImageType(imagePart.data)) {
      throw createError({ statusCode: 400, statusMessage: 'File does not look like a valid image.' })
    }

    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'sales')
      : join(baseDir, 'public', 'sales')
    await mkdir(uploadDir, { recursive: true })
    const filename = `${Date.now()}_${sanitizeFilename(imagePart.filename)}`
    await writeFile(join(uploadDir, filename), imagePart.data)
    imagePath = process.env.NODE_ENV === 'production'
      ? `/images/sales/${filename}`
      : `/sales/${filename}`
  }

  const ctoonIds = meta.items.map(i => i.ctoonId)

  const result = await db.$transaction(async (tx) => {
    await assertNoSaleOverlap(tx, { ctoonIds, startAt, endAt, excludeSaleId: id })

    await tx.sale.update({
      where: { id },
      data: {
        name: meta.name.trim(),
        imagePath,
        startAt,
        endAt
      }
    })

    await tx.saleCtoon.deleteMany({ where: { saleId: id } })
    await tx.saleCtoon.createMany({
      data: meta.items.map(i => ({
        saleId: id,
        ctoonId: i.ctoonId,
        price: Number(i.price),
        perDayLimit: Number(i.perDayLimit)
      }))
    })

    const changes = [
      ['name', existing.name, meta.name.trim()],
      ['startAt', existing.startAt.toISOString(), startAt.toISOString()],
      ['endAt', existing.endAt.toISOString(), endAt.toISOString()],
      ['imagePath', existing.imagePath, imagePath],
      ['items', existing.items.map(i => ({ ctoonId: i.ctoonId, price: i.price, perDayLimit: i.perDayLimit })), meta.items]
    ]
    for (const [key, prev, next] of changes) {
      const prevStr = JSON.stringify(prev)
      const nextStr = JSON.stringify(next)
      if (prevStr !== nextStr) {
        await logAdminChange(tx, { userId: me.id, area: `Sale:${id}`, key, prevValue: prev, newValue: next })
      }
    }

    return { id }
  })

  clearActiveSaleCache()

  return { id: result.id, imagePath }
})
