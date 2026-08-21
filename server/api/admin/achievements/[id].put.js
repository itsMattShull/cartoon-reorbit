// server/api/admin/achievements/[id].put.js
import { defineEventHandler, getRequestHeader, readMultipartFormData, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseRewardBundle, validateRewardBundleRefs } from '@/server/utils/achievementRewardBundle'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/gif']
const MAX_CLAIM_OPTIONS = 4

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
  const ach = await db.achievement.findUnique({ where: { id } })
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
    discordRoleName = ach.discordRoleName,
    isClaimable = ach.isClaimable,
    cMoonRankId: rawCMoonRankId = ach.cMoonRankId,
    criteria = {},
    rewards = {},
    claimOptions = []
  } = payload || {}

  const cMoonPointsGte = criteria?.cMoonPointsGte != null && criteria.cMoonPointsGte !== ''
    ? Math.max(0, Number(criteria.cMoonPointsGte)) : null
  const cMoonRankId = typeof rawCMoonRankId === 'string' && rawCMoonRankId ? rawCMoonRankId : null

  if ((cMoonPointsGte != null) !== (cMoonRankId != null)) {
    throw createError({ statusCode: 400, statusMessage: 'A cMoon rank achievement needs both a points threshold and a rank selected' })
  }
  if (cMoonRankId && isClaimable) {
    throw createError({ statusCode: 400, statusMessage: 'A cMoon-rank achievement cannot also be claimable' })
  }
  if (cMoonRankId) {
    const rankExists = await db.cMoonRank.count({ where: { id: cMoonRankId } })
    if (!rankExists) throw createError({ statusCode: 400, statusMessage: 'Selected cMoon rank does not exist' })
  }

  const rewardBundle = parseRewardBundle(rewards)
  const claimOptionRows = (Array.isArray(claimOptions) ? claimOptions : [])
    .slice(0, MAX_CLAIM_OPTIONS)
    .filter(o => o && String(o.label || '').trim())
    .map((o, i) => ({ label: String(o.label).trim(), sortOrder: i, ...parseRewardBundle(o) }))

  await validateRewardBundleRefs(db, isClaimable ? claimOptionRows : [rewardBundle])

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

  const roleName = typeof discordRoleName === 'string' ? discordRoleName.trim() : ''

  await db.$transaction(async (tx) => {
    await tx.achievement.update({
      where: { id },
      data: {
        title: String(title),
        description: description ? String(description) : null,
        imagePath,
        isActive: !!isActive,
        notifyDiscord: !!notifyDiscord,
        discordRoleName: roleName || null,
        isClaimable: !!isClaimable,
        cMoonPointsGte,
        cMoonRankId,
        pointsGte:       criteria?.pointsGte       ?? null,
        totalCtoonsGte:  criteria?.totalCtoonsGte  ?? null,
        uniqueCtoonsGte: criteria?.uniqueCtoonsGte ?? null,
        auctionsWonGte:  criteria?.auctionsWonGte  ?? null,
        auctionsCreatedGte: criteria?.auctionsCreatedGte ?? null,
        tradesAcceptedGte: criteria?.tradesAcceptedGte ?? null,
        ctoonSuggestionsAcceptedGte: criteria?.ctoonSuggestionsAcceptedGte ?? null,
        cumulativeActiveDaysGte: criteria?.cumulativeActiveDaysGte ?? null,
        tkoWinsGte: criteria?.tkoWinsGte ?? null,
        wordleWinsGte: criteria?.wordleWinsGte ?? null,
        wordleCurrentStreakGte: criteria?.wordleCurrentStreakGte ?? null,
        flappyBestScoreGte: criteria?.flappyBestScoreGte ?? null,
        setsRequired: Array.isArray(criteria?.setsRequired) ? criteria.setsRequired.filter(Boolean) : [],
        userCreatedBefore: criteria?.userCreatedBefore ? new Date(criteria.userCreatedBefore) : null,
      }
    })

    // Required cToons: replace
    await tx.achievementRequiredCtoon.deleteMany({ where: { achievementId: id } })
    const reqCtoonCreates = (Array.isArray(criteria?.ctoonsRequired) ? criteria.ctoonsRequired : [])
      .filter(r => r?.ctoonId)
      .map(r => ({ achievementId: id, ctoonId: String(r.ctoonId) }))
    if (reqCtoonCreates.length) await tx.achievementRequiredCtoon.createMany({ data: reqCtoonCreates, skipDuplicates: true })

    // Claim options: never delete an option a user has already claimed against
    // (AchievementClaim.optionId is onDelete: Restrict) — that option and its dedicated
    // reward row are left exactly as they were, so past claims stay auditable. Only
    // never-claimed options (and, once they're gone, their now-orphaned reward rows) are
    // cleared before inserting the new set.
    const claimedOptionIds = new Set(
      (await tx.achievementClaim.findMany({ where: { achievementId: id }, select: { optionId: true } })).map(c => c.optionId)
    )
    const existingOptions = await tx.achievementClaimOption.findMany({ where: { achievementId: id }, select: { id: true, rewardId: true } })
    const deletable = existingOptions.filter(o => !claimedOptionIds.has(o.id))
    if (deletable.length) {
      await tx.achievementClaimOption.deleteMany({ where: { id: { in: deletable.map(o => o.id) } } })
      await tx.achievementReward.deleteMany({ where: { id: { in: deletable.map(o => o.rewardId) } } })
    }

    if (isClaimable) {
      // Drop any leftover non-claim-option "own" reward row from when this achievement
      // wasn't claimable — dead weight once isClaimable is true (awardAchievementToUser
      // never reads it for a claimable achievement).
      const ownReward = await tx.achievementReward.findFirst({ where: { achievementId: id, claimOption: null } })
      if (ownReward) await tx.achievementReward.delete({ where: { id: ownReward.id } })

      for (const opt of claimOptionRows) {
        const reward = await tx.achievementReward.create({
          data: {
            achievementId: id,
            points: opt.points,
            ctoons: { create: opt.ctoons },
            backgrounds: { create: opt.backgrounds },
          }
        })
        await tx.achievementClaimOption.create({ data: { achievementId: id, label: opt.label, sortOrder: opt.sortOrder, rewardId: reward.id } })
      }
    } else {
      // Rewards: ensure a single non-claim-option reward row exists
      let reward = await tx.achievementReward.findFirst({ where: { achievementId: id, claimOption: null } })
      if (!reward) {
        reward = await tx.achievementReward.create({ data: { achievementId: id, points: rewardBundle.points } })
      } else {
        await tx.achievementReward.update({ where: { id: reward.id }, data: { points: rewardBundle.points } })
      }

      await tx.achievementRewardCtoon.deleteMany({ where: { rewardId: reward.id } })
      await tx.achievementRewardBackground.deleteMany({ where: { rewardId: reward.id } })
      if (rewardBundle.ctoons.length) {
        await tx.achievementRewardCtoon.createMany({ data: rewardBundle.ctoons.map(c => ({ rewardId: reward.id, ...c })), skipDuplicates: true })
      }
      if (rewardBundle.backgrounds.length) {
        await tx.achievementRewardBackground.createMany({ data: rewardBundle.backgrounds.map(b => ({ rewardId: reward.id, ...b })), skipDuplicates: true })
      }
    }
  })

  await logAdminChange(db, { userId: me.id, area: 'Achievements', key: `update:${ach.slug}`, prevValue: { id: ach.id }, newValue: { id } })

  return { ok: true }
})
