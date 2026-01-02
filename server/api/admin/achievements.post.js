// server/api/admin/achievements.post.js
import { defineEventHandler, getRequestHeader, readMultipartFormData, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']

function sanitize(name = '') { return name.replace(/[^A-Za-z0-9._-]/g, '') }
function slugify(s = '') { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'achievement' }

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const parts = await readMultipartFormData(event)
  if (!parts) throw createError({ statusCode: 400, statusMessage: 'multipart/form-data expected' })

  let filePart = null
  let payload = {}
  for (const part of parts) {
    if (part.filename) filePart = part
    else if (part.name === 'payload') {
      try { payload = JSON.parse(Buffer.isBuffer(part.data) ? part.data.toString('utf-8') : String(part.data)) } catch {}
    }
  }

  const {
    title = '',
    slug: desiredSlug,
    description = null,
    isActive = true,
    notifyDiscord = false,
    criteria = {},
    rewards = {}
  } = payload || {}

  if (!String(title).trim()) throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  let slug = slugify(desiredSlug || title)

  // ensure unique slug
  let suffix = 1
  while (await db.achievement.findUnique({ where: { slug } })) {
    slug = `${slugify(title)}-${suffix++}`
  }

  // Optional image
  let imagePath = null
  if (filePart) {
    if (!ALLOWED_MIMES.includes(filePart.type)) throw createError({ statusCode: 400, statusMessage: 'Only PNG/GIF/JPEG allowed' })

    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'achievements')
      : join(baseDir, 'public', 'achievements')
    await mkdir(uploadDir, { recursive: true })
    const filename = `${Date.now()}_${sanitize(filePart.filename)}`
    await writeFile(join(uploadDir, filename), filePart.data)
    imagePath = process.env.NODE_ENV === 'production' ? `/images/achievements/${filename}` : `/achievements/${filename}`
  }

  // Create core
  const created = await db.achievement.create({
    data: {
      slug,
      title: String(title),
      description: description ? String(description) : null,
      imagePath,
      isActive: !!isActive,
      notifyDiscord: !!notifyDiscord,
      pointsGte:       criteria?.pointsGte       ?? null,
      totalCtoonsGte:  criteria?.totalCtoonsGte  ?? null,
      uniqueCtoonsGte: criteria?.uniqueCtoonsGte ?? null,
      auctionsWonGte:  criteria?.auctionsWonGte  ?? null,
      auctionsCreatedGte: criteria?.auctionsCreatedGte ?? null,
      tradesAcceptedGte: criteria?.tradesAcceptedGte ?? null,
      consecutiveActiveDaysGte: criteria?.consecutiveActiveDaysGte ?? null,
      setsRequired: Array.isArray(criteria?.setsRequired) ? criteria.setsRequired.filter(Boolean) : [],
      userCreatedBefore: criteria?.userCreatedBefore ? new Date(criteria.userCreatedBefore) : null,
      rewards: {
        create: {
          points: Number(rewards?.points || 0) || 0,
          ctoons: {
            create: (Array.isArray(rewards?.ctoons) ? rewards.ctoons : [])
              .filter(r => r?.ctoonId)
              .map(r => ({ ctoonId: String(r.ctoonId), quantity: Math.max(1, Number(r.quantity || 1)) }))
          },
          backgrounds: {
            create: (Array.isArray(rewards?.backgrounds) ? rewards.backgrounds : [])
              .filter(r => r?.backgroundId)
              .map(r => ({ backgroundId: String(r.backgroundId) }))
          }
        }
      }
    }
  })

  await logAdminChange(db, { userId: me.id, area: 'Achievements', key: `create:${slug}`, prevValue: null, newValue: { id: created.id, slug } })

  return { id: created.id }
})
