// server/api/admin/ai-monsters.post.js
import { defineEventHandler, readMultipartFormData, getRequestHeader, createError } from 'h3'
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

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const baseDir = process.env.NODE_ENV === 'production'
    ? join(__dirname, '..', '..', '..')
    : process.cwd()

  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'multipart/form-data expected' })

  const fields = {}
  const files = {}
  for (const p of parts) {
    if (p.filename) files[p.name] = p
    else fields[p.name] = Buffer.isBuffer(p.data) ? p.data.toString('utf-8') : String(p.data ?? '')
  }

  const name = String(fields?.name || '').trim()
  const type = String(fields?.type || '').trim()
  const rarity = String(fields?.rarity || '').toUpperCase()
  const baseHp  = Number(fields?.baseHp)
  const baseAtk = Number(fields?.baseAtk)
  const baseDef = Number(fields?.baseDef)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!type) throw createError({ statusCode: 400, statusMessage: 'Type is required' })
  if (!MONSTER_RARITIES.has(rarity)) throw createError({ statusCode: 400, statusMessage: 'Invalid rarity' })
  if (![baseHp, baseAtk, baseDef].every(v => Number.isInteger(v) && v >= 1)) {
    throw createError({ statusCode: 400, statusMessage: 'Base stats must be integers >= 1' })
  }

  const walking = files['walking']
  const standing = files['standingstill'] || files['standing']
  const jumping = files['jumping']
  if (!walking || !standing || !jumping) {
    throw createError({ statusCode: 400, statusMessage: 'Walking, Standing Still, and Jumping images are required' })
  }
  const ALLOWED = new Set(['image/png','image/jpeg','image/jpg','image/gif'])
  for (const [key, file] of Object.entries({ walking, standing, jumping })) {
    if (!ALLOWED.has(file.type)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid file type for ${key}` })
    }
  }

  const safeName = name.replace(/[^A-Za-z0-9._ -]/g, '').trim() || 'ai-monster'
  const uploadDir = process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'ai-monsters', safeName)
    : join(baseDir, 'public', 'ai-monsters', safeName)
  await mkdir(uploadDir, { recursive: true })

  async function saveOne(label, part) {
    const filename = part.filename || `${label}-${Date.now()}`
    await writeFile(join(uploadDir, filename), part.data)
    return process.env.NODE_ENV === 'production'
      ? `/images/ai-monsters/${safeName}/${filename}`
      : `/ai-monsters/${safeName}/${filename}`
  }

  const walkingPath = await saveOne('walking', walking)
  const standingPath = await saveOne('standingstill', standing)
  const jumpingPath = await saveOne('jumping', jumping)

  const created = await db.aiMonster.create({
    data: {
      name,
      type,
      rarity,
      baseHp,
      baseAtk,
      baseDef,
      walkingImagePath: walkingPath,
      standingStillImagePath: standingPath,
      jumpingImagePath: jumpingPath
    }
  })

  await logAdminChange(db, { userId: me.id, area: 'AiMonster', key: 'create', prevValue: null, newValue: created })

  return { monster: created }
})
