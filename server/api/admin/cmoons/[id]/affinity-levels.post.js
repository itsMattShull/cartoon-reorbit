// server/api/admin/cmoons/[id]/affinity-levels.post.js — create a new affinity level in one
// cMoon's ladder. Mirrors ranks.post.js.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

const MAX_THRESHOLD = 5_000_000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const threshold = Number(body?.threshold)
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0
  const borderEffectId = typeof body?.borderEffectId === 'string' && body.borderEffectId ? body.borderEffectId : null
  const glowEffectId = typeof body?.glowEffectId === 'string' && body.glowEffectId ? body.glowEffectId : null
  const rewardBackgroundId = typeof body?.rewardBackgroundId === 'string' && body.rewardBackgroundId ? body.rewardBackgroundId : null
  const rewardAvatarIds = Array.isArray(body?.rewardAvatarIds)
    ? [...new Set(body.rewardAvatarIds.filter(v => typeof v === 'string' && v))]
    : []

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!Number.isInteger(threshold) || threshold <= 0 || threshold > MAX_THRESHOLD) {
    throw createError({ statusCode: 400, statusMessage: 'Threshold must be a positive whole number of points' })
  }

  if (borderEffectId) {
    const fx = await db.cZoneEffect.findUnique({ where: { id: borderEffectId }, select: { kind: true } })
    if (!fx || fx.kind !== 'BORDER') throw createError({ statusCode: 400, statusMessage: 'Border effect not found or is not a BORDER-kind effect' })
  }
  if (glowEffectId) {
    const fx = await db.cZoneEffect.findUnique({ where: { id: glowEffectId }, select: { kind: true } })
    if (!fx || fx.kind !== 'GLOW') throw createError({ statusCode: 400, statusMessage: 'Glow effect not found or is not a GLOW-kind effect' })
  }
  if (rewardBackgroundId) {
    const bg = await db.background.count({ where: { id: rewardBackgroundId } })
    if (!bg) throw createError({ statusCode: 400, statusMessage: 'Reward background not found' })
  }
  if (rewardAvatarIds.length) {
    const avCount = await db.avatar.count({ where: { id: { in: rewardAvatarIds } } })
    if (avCount !== rewardAvatarIds.length) throw createError({ statusCode: 400, statusMessage: 'One or more reward avatars not found' })
  }

  let created
  try {
    created = await db.$transaction(async (tx) => {
      const lvl = await tx.cMoonAffinityLevel.create({
        data: { cMoonId, name, threshold, sortOrder, borderEffectId, glowEffectId, rewardBackgroundId },
      })
      if (rewardAvatarIds.length) {
        await tx.cMoonAffinityLevelRewardAvatar.createMany({
          data: rewardAvatarIds.map(avatarId => ({ levelId: lvl.id, avatarId })),
        })
      }
      return lvl
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another level in this cMoon already uses that threshold or order' })
    }
    // Effect existed at the check above but was deleted by another admin request before this
    // write landed (only possible while it wasn't yet in use — see CZoneEffect's onDelete:
    // Restrict, which blocks deleting one already in use).
    if (err?.code === 'P2003') {
      throw createError({ statusCode: 400, statusMessage: 'Border or glow effect was deleted by another request — pick again' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonAffinityLevel', key: `create:${created.id}`, prevValue: null, newValue: { cMoonId, name, threshold, sortOrder, borderEffectId, glowEffectId } })

  return { id: created.id }
})
