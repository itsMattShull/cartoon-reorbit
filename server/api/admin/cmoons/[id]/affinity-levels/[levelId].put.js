// server/api/admin/cmoons/[id]/affinity-levels/[levelId].put.js — edit one affinity level.
// Mirrors ranks/[rankId].put.js.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const MAX_THRESHOLD = 5_000_000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  const levelId = event.context.params?.levelId
  const level = await db.cMoonAffinityLevel.findUnique({ where: { id: levelId } })
  if (!level || level.cMoonId !== cMoonId) throw createError({ statusCode: 404, statusMessage: 'Affinity level not found' })

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : level.name
  const threshold = body?.threshold === undefined ? level.threshold : Number(body.threshold)
  const sortOrder = body?.sortOrder === undefined ? level.sortOrder : (Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : level.sortOrder)
  const grantsBorder = body?.grantsBorder === undefined ? level.grantsBorder : !!body.grantsBorder
  const grantsGlow = body?.grantsGlow === undefined ? level.grantsGlow : !!body.grantsGlow
  const rewardBackgroundId = body?.rewardBackgroundId === undefined
    ? level.rewardBackgroundId
    : (typeof body.rewardBackgroundId === 'string' && body.rewardBackgroundId ? body.rewardBackgroundId : null)
  // undefined => leave the existing reward-avatar set untouched; an array (even empty) replaces
  // it entirely, same "provided vs omitted" convention as every other field on this route.
  const rewardAvatarIdsProvided = body?.rewardAvatarIds !== undefined
  const rewardAvatarIds = rewardAvatarIdsProvided
    ? (Array.isArray(body.rewardAvatarIds) ? [...new Set(body.rewardAvatarIds.filter(v => typeof v === 'string' && v))] : [])
    : []

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!Number.isInteger(threshold) || threshold <= 0 || threshold > MAX_THRESHOLD) {
    throw createError({ statusCode: 400, statusMessage: 'Threshold must be a positive whole number of points' })
  }

  if (rewardBackgroundId) {
    const bg = await db.background.count({ where: { id: rewardBackgroundId } })
    if (!bg) throw createError({ statusCode: 400, statusMessage: 'Reward background not found' })
  }
  if (rewardAvatarIdsProvided && rewardAvatarIds.length) {
    const avCount = await db.avatar.count({ where: { id: { in: rewardAvatarIds } } })
    if (avCount !== rewardAvatarIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more reward avatars not found' })
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.cMoonAffinityLevel.update({
        where: { id: levelId },
        data: { name, threshold, sortOrder, grantsBorder, grantsGlow, rewardBackgroundId },
      })
      if (rewardAvatarIdsProvided) {
        await tx.cMoonAffinityLevelRewardAvatar.deleteMany({ where: { levelId } })
        if (rewardAvatarIds.length) {
          await tx.cMoonAffinityLevelRewardAvatar.createMany({
            data: rewardAvatarIds.map(avatarId => ({ levelId, avatarId })),
          })
        }
      }
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another level in this cMoon already uses that threshold or order' })
    }
    throw err
  }

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonAffinityLevel',
    key: `update:${levelId}`,
    prevValue: { name: level.name, threshold: level.threshold, sortOrder: level.sortOrder },
    newValue: { name, threshold, sortOrder },
  })

  return { ok: true }
})
