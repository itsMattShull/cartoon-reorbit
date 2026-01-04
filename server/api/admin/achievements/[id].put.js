// server/api/admin/achievements/[id].put.js
import { defineEventHandler, getRequestHeader, readMultipartFormData, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']

function sanitize(name = '') { return name.replace(/[^A-Za-z0-9._-]/g, '') }

function fsPathFromImagePath(imagePath) {
  if (!imagePath) return null
  const filename = String(imagePath).split('/').pop()
  if (!filename) return null
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'achievements', filename)
    : join(baseDir, 'public', 'achievements', filename)
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = event.context.params?.id
  const ach = await db.achievement.findUnique({ where: { id }, include: { rewards: { include: { ctoons: true, backgrounds: true } } } })
  if (!ach) throw createError({ statusCode: 404, statusMessage: 'Achievement not found' })

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
    title = ach.title,
    description = ach.description,
    isActive = ach.isActive,
    notifyDiscord = ach.notifyDiscord,
    criteria = {},
    rewards = {}
  } = payload || {}

  // Optional image replacement
  let imagePath = ach.imagePath
  if (filePart) {
    if (!ALLOWED_MIMES.includes(filePart.type)) throw createError({ statusCode: 400, statusMessage: 'Only PNG/GIF/JPEG allowed' })

    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'achievements')
      : join(baseDir, 'public', 'achievements')
    await mkdir(uploadDir, { recursive: true })
    const filename = `${Date.now()}_${sanitize(filePart.filename)}`
    await writeFile(join(uploadDir, filename), filePart.data)
    const newPath = process.env.NODE_ENV === 'production' ? `/images/achievements/${filename}` : `/achievements/${filename}`

    // remove old file
    const oldFsPath = fsPathFromImagePath(ach.imagePath)
    if (oldFsPath) { try { await unlink(oldFsPath) } catch {} }

    imagePath = newPath
  }

  // Update core fields
  const updated = await db.achievement.update({
    where: { id },
    data: {
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
      cumulativeActiveDaysGte: criteria?.cumulativeActiveDaysGte ?? null,
      setsRequired: Array.isArray(criteria?.setsRequired) ? criteria.setsRequired.filter(Boolean) : [],
      userCreatedBefore: criteria?.userCreatedBefore ? new Date(criteria.userCreatedBefore) : null,
    }
  })

  // Rewards: ensure single reward row exists
  let reward = await db.achievementReward.findFirst({ where: { achievementId: id } })
  if (!reward) {
    reward = await db.achievementReward.create({ data: { achievementId: id, points: Number(rewards?.points || 0) || 0 } })
  } else {
    await db.achievementReward.update({ where: { id: reward.id }, data: { points: Number(rewards?.points || 0) || 0 } })
  }

  // Replace ctoons/backgrounds children
  await db.achievementRewardCtoon.deleteMany({ where: { rewardId: reward.id } })
  await db.achievementRewardBackground.deleteMany({ where: { rewardId: reward.id } })
  const ctoonCreates = (Array.isArray(rewards?.ctoons) ? rewards.ctoons : [])
    .filter(r => r?.ctoonId)
    .map(r => ({ rewardId: reward.id, ctoonId: String(r.ctoonId), quantity: Math.max(1, Number(r.quantity || 1)) }))
  const bgCreates = (Array.isArray(rewards?.backgrounds) ? rewards.backgrounds : [])
    .filter(r => r?.backgroundId)
    .map(r => ({ rewardId: reward.id, backgroundId: String(r.backgroundId) }))
  if (ctoonCreates.length) await db.achievementRewardCtoon.createMany({ data: ctoonCreates, skipDuplicates: true })
  if (bgCreates.length)     await db.achievementRewardBackground.createMany({ data: bgCreates, skipDuplicates: true })

  await logAdminChange(db, { userId: me.id, area: 'Achievements', key: `update:${ach.slug}`, prevValue: { id: ach.id }, newValue: { id: updated.id } })

  return { ok: true }
})
