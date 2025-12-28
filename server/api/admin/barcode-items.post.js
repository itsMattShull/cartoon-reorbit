// server/api/admin/barcode-items.post.js
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITEM_RARITIES = new Set(['COMMON','RARE','CRAZY_RARE'])
const ITEM_EFFECTS = new Set(['HEAL'])

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const cfg = await db.barcodeGameConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
  if (!cfg) throw createError({ statusCode: 500, statusMessage: 'Active config not found' })

  // Parse multipart
  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'multipart/form-data expected' })

  const fields = {}
  const files = {}
  for (const p of parts) {
    if (p.filename) files[p.name] = p
    else fields[p.name] = Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data ?? '')
  }

  const code  = Number(fields?.code)
  const name  = String(fields?.name || '').trim()
  const rarity = String(fields?.rarity || '').toUpperCase()
  const power = Number(fields?.power)
  const effect = String(fields?.effect || 'HEAL').toUpperCase()

  if (!Number.isInteger(code) || code < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Code must be a positive integer' })
  }
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!ITEM_RARITIES.has(rarity)) throw createError({ statusCode: 400, statusMessage: 'Invalid rarity' })
  if (!Number.isInteger(power) || power < 0) throw createError({ statusCode: 400, statusMessage: 'Power must be a non-negative integer' })
  if (!ITEM_EFFECTS.has(effect)) throw createError({ statusCode: 400, statusMessage: 'Invalid effect' })

  // At least one image required
  const img0 = files['image0'] || files['img0']
  const img1 = files['image1'] || files['img1']
  const img2 = files['image2'] || files['img2']
  if (!img0 && !img1 && !img2) {
    throw createError({ statusCode: 400, statusMessage: 'At least one image is required' })
  }
  const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/gif'])
  for (const f of [img0,img1,img2].filter(Boolean)) {
    if (!ALLOWED.has(f.type)) throw createError({ statusCode: 400, statusMessage: 'Invalid image type' })
  }

  // Create item first to get a stable id for folder naming
  const created = await db.itemDefinition.create({
    data: { configId: cfg.id, code, name, rarity, power, effect }
  }).catch((e) => {
    if (String(e?.message || '').includes('Unique constraint') || String(e?.code) === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Duplicate code in this config' })
    }
    throw e
  })

  // Save images under items/{id}-{nameSlug}/
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const baseDir = process.env.NODE_ENV === 'production' ? join(__dirname, '..', '..', '..') : process.cwd()
  const slug = (s) => (s || '').toString().toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'item'
  const folder = `${created.id}-${slug(created.name)}`
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'items', folder)
    : join(baseDir, 'public', 'items', folder)
  await mkdir(uploadDir, { recursive: true })
  async function saveOne(label, part) {
    if (!part) return null
    const filename = part.filename || `${label}-${Date.now()}`
    await writeFile(join(uploadDir, filename), part.data)
    return process.env.NODE_ENV === 'production' ? `/images/items/${folder}/${filename}` : `/items/${folder}/${filename}`
  }
  const p0 = await saveOne('image0', img0)
  const p1 = await saveOne('image1', img1)
  const p2 = await saveOne('image2', img2)

  // Update item with image paths
  const updated = await db.itemDefinition.update({
    where: { id: created.id },
    data: { itemImage0Path: p0, itemImage1Path: p1, itemImage2Path: p2 }
  })

  await logAdminChange(db, { userId: me.id, area: 'ItemDefinition', key: 'create', prevValue: null, newValue: { id: created.id, code } })

  return { item: updated }
})
