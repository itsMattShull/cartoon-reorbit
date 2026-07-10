// POST /api/admin/sales
// Creates a Sale, optionally saves a promo image to /public/sales/, and
// records the selected cToons with their sale price + per-day limit.
// Accepts multipart/form-data with:
//   • field "meta"  – JSON string { name, startAtLocal, endAtLocal, items: [{ctoonId,price,perDayLimit}] }
//   • field "image" – optional PNG/JPEG/GIF/WEBP file

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

  let imagePath = null
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

  const sale = await db.$transaction(async (tx) => {
    await assertNoSaleOverlap(tx, { ctoonIds, startAt, endAt })

    const created = await tx.sale.create({
      data: {
        name: meta.name.trim(),
        imagePath,
        startAt,
        endAt,
        createdById: me.id
      }
    })

    await tx.saleCtoon.createMany({
      data: meta.items.map(i => ({
        saleId: created.id,
        ctoonId: i.ctoonId,
        price: Number(i.price),
        perDayLimit: Number(i.perDayLimit)
      }))
    })

    await logAdminChange(tx, {
      userId: me.id,
      area: `Sale:${created.id}`,
      key: 'create',
      prevValue: null,
      newValue: {
        name: created.name,
        startAt: created.startAt,
        endAt: created.endAt,
        items: meta.items
      }
    })

    return created
  })

  clearActiveSaleCache()

  return { id: sale.id }
})
