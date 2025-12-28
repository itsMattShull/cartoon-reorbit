// server/api/admin/barcode-species/[speciesIndex].put.js
import { defineEventHandler, readBody, readMultipartFormData, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MONSTER_RARITIES = new Set(['COMMON','UNCOMMON','RARE','VERY_RARE','CRAZY_RARE'])

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const cfg = await db.barcodeGameConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } })
  if (!cfg) throw createError({ statusCode: 500, statusMessage: 'Active config not found' })

  const speciesIndex = Number(event.context.params?.speciesIndex)
  if (!Number.isInteger(speciesIndex) || speciesIndex < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid speciesIndex' })
  }

  const before = await db.speciesBaseStats.findUnique({ where: { configId_speciesIndex: { configId: cfg.id, speciesIndex } } })
  if (!before) throw createError({ statusCode: 404, statusMessage: 'Species not found' })

  // Accept multipart or JSON
  const parts = await readMultipartFormData(event)
  let fields = {}
  let files = {}
  if (parts && parts.length) {
    for (const p of parts) {
      if (p.filename) files[p.name] = p
      else fields[p.name] = Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data ?? '')
    }
  } else {
    fields = await readBody(event)
    files = {}
  }

  const data = {}
  if (fields?.name != null) {
    const name = String(fields.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })
    data.name = name
  }
  if (fields?.type != null) {
    const type = String(fields.type).trim()
    if (!type) throw createError({ statusCode: 400, statusMessage: 'Type cannot be empty' })
    data.type = type
  }
  if (fields?.rarity != null) {
    const rarity = String(fields.rarity).toUpperCase()
    if (!MONSTER_RARITIES.has(rarity)) throw createError({ statusCode: 400, statusMessage: 'Invalid rarity' })
    data.rarity = rarity
  }
  for (const key of ['baseHp','baseAtk','baseDef']) {
    if (fields?.[key] != null) {
      const v = Number(fields[key])
      if (!Number.isInteger(v) || v < 1) throw createError({ statusCode: 400, statusMessage: `${key} must be integer >= 1` })
      data[key] = v
    }
  }

  // Optional image replacements
  const walking = files['walking']
  const standing = files['standingstill'] || files['standing']
  const jumping = files['jumping']
  if (walking || standing || jumping) {
    const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/gif'])
    for (const f of [walking, standing, jumping].filter(Boolean)) {
      if (!ALLOWED.has(f.type)) throw createError({ statusCode: 400, statusMessage: 'Invalid file type' })
    }
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const baseDir = process.env.NODE_ENV === 'production' ? join(__dirname, '..', '..', '..', '..') : process.cwd()
    const safeName = String(fields?.name || before.name || 'monster').replace(/[^A-Za-z0-9._ -]/g, '').trim() || 'monster'
    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'monsters', safeName)
      : join(baseDir, 'public', 'monsters', safeName)
    await mkdir(uploadDir, { recursive: true })
    async function saveOne(label, part) {
      if (!part) return null
      const filename = part.filename || `${label}-${Date.now()}`
      await writeFile(join(uploadDir, filename), part.data)
      return process.env.NODE_ENV === 'production' ? `/images/monsters/${safeName}/${filename}` : `/monsters/${safeName}/${filename}`
    }
    const wp = await saveOne('walking', walking)
    const sp = await saveOne('standingstill', standing)
    const jp = await saveOne('jumping', jumping)
    if (wp) data.walkingImagePath = wp
    if (sp) data.standingStillImagePath = sp
    if (jp) data.jumpingImagePath = jp
  }

  const updated = await db.speciesBaseStats.update({ where: { configId_speciesIndex: { configId: cfg.id, speciesIndex } }, data })

  await logAdminChange(db, { userId: me.id, area: 'SpeciesBaseStats', key: `update:${speciesIndex}`, prevValue: before, newValue: updated })

  return { species: updated }
})
