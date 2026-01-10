// server/api/admin/barcode-items/[id].put.js
import { defineEventHandler, readMultipartFormData, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ITEM_RARITIES = new Set(['COMMON','RARE','CRAZY_RARE'])
const ITEM_EFFECTS = new Set(['HEAL'])

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const before = await db.itemDefinition.findUnique({ where: { id } })
  if (!before) throw createError({ statusCode: 404, statusMessage: 'Item not found' })

  // Parse multipart (fields + optional images)
  const parts = await readMultipartFormData(event)
  let fields = {}
  let files = {}
  if (parts && parts.length) {
    for (const p of parts) {
      if (p.filename) files[p.name] = p
      else fields[p.name] = Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data ?? '')
  }
  } else {
    // Support legacy JSON
    fields = await readBody(event)
    files = {}
  }

  const data = {}
  if (fields?.name != null) {
    const name = String(fields.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })
    data.name = name
  }
  if (fields?.rarity != null) {
    const r = String(fields.rarity).toUpperCase()
    if (!ITEM_RARITIES.has(r)) throw createError({ statusCode: 400, statusMessage: 'Invalid rarity' })
    data.rarity = r
  }
  if (fields?.power != null) {
    const p = Number(fields.power)
    if (!Number.isInteger(p) || p < 0) throw createError({ statusCode: 400, statusMessage: 'Power must be a non-negative integer' })
    data.power = p
  }
  if (fields?.effect != null) {
    const e = String(fields.effect).toUpperCase()
    if (!ITEM_EFFECTS.has(e)) throw createError({ statusCode: 400, statusMessage: 'Invalid effect' })
    data.effect = e
  }
  if (fields?.code != null) {
    const c = Number(fields.code)
    if (!Number.isInteger(c) || c < 1) throw createError({ statusCode: 400, statusMessage: 'Code must be a positive integer' })
    data.code = c
  }

  // Handle optional image replacements
  const img0 = files['image0'] || files['img0']
  const img1 = files['image1'] || files['img1']
  const img2 = files['image2'] || files['img2']
  const anyImage = !!(img0 || img1 || img2)
  const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/gif'])
  if (anyImage) {
    for (const f of [img0,img1,img2].filter(Boolean)) {
      if (!ALLOWED.has(f.type)) throw createError({ statusCode: 400, statusMessage: 'Invalid image type' })
    }
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const baseDir = process.env.NODE_ENV === 'production' ? join(__dirname, '..', '..', '..', '..') : process.cwd()
    const slug = (s) => (s || '').toString().toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'item'
    const folder = `${before.id}-${slug(data.name ?? before.name)}`
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
    if (p0) data.itemImage0Path = p0
    if (p1) data.itemImage1Path = p1
    if (p2) data.itemImage2Path = p2
  }

  const updated = await db.itemDefinition.update({ where: { id }, data }).catch((e) => {
    if (String(e?.message || '').includes('Unique constraint') || String(e?.code) === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Duplicate code in this config' })
    }
    throw e
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'ItemDefinition',
    key: `update:${id}`,
    prevValue: { id: before.id, code: before.code, name: before.name, rarity: before.rarity, power: before.power, effect: before.effect, img0: before.itemImage0Path, img1: before.itemImage1Path, img2: before.itemImage2Path },
    newValue: { id: updated.id, code: updated.code, name: updated.name, rarity: updated.rarity, power: updated.power, effect: updated.effect, img0: updated.itemImage0Path, img1: updated.itemImage1Path, img2: updated.itemImage2Path }
  })

  return { item: updated }
})
