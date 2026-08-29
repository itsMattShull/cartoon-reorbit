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
  const grantsGlow = !!body?.grantsGlow
  const rewardBackgroundId = typeof body?.rewardBackgroundId === 'string' && body.rewardBackgroundId ? body.rewardBackgroundId : null
  const rewardAvatarId = typeof body?.rewardAvatarId === 'string' && body.rewardAvatarId ? body.rewardAvatarId : null

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!Number.isInteger(threshold) || threshold <= 0 || threshold > MAX_THRESHOLD) {
    throw createError({ statusCode: 400, statusMessage: 'Threshold must be a positive whole number of points' })
  }

  if (rewardBackgroundId) {
    const bg = await db.background.count({ where: { id: rewardBackgroundId } })
    if (!bg) throw createError({ statusCode: 400, statusMessage: 'Reward background not found' })
  }
  if (rewardAvatarId) {
    const av = await db.avatar.count({ where: { id: rewardAvatarId } })
    if (!av) throw createError({ statusCode: 400, statusMessage: 'Reward avatar not found' })
  }

  let created
  try {
    created = await db.cMoonAffinityLevel.create({
      data: { cMoonId, name, threshold, sortOrder, grantsGlow, rewardBackgroundId, rewardAvatarId },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another level in this cMoon already uses that threshold or order' })
    }
    throw err
  }

  await logAdminChange(db, { userId: me.id, area: 'CMoonAffinityLevel', key: `create:${created.id}`, prevValue: null, newValue: { cMoonId, name, threshold, sortOrder, grantsGlow } })

  return { id: created.id }
})
