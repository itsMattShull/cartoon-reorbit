// server/api/admin/cmoon-rank-tiers.post.js — create a new universal rank tier and provision it
// (a CMoonRank + a claimable Achievement) for every existing cMoon. See
// server/utils/cmoonRankTiers.js for the provisioning mechanics.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { syncTierAcrossCMoons, MAX_TIER_REWARD_CTOONS } from '@/server/utils/cmoonRankTiers'

const MAX_THRESHOLD = 5_000_000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0
  const pointThreshold = Number.isFinite(Number(body?.pointThreshold)) ? Math.trunc(Number(body.pointThreshold)) : NaN
  const rewardCtoonIds = [...new Set(
    Array.isArray(body?.rewardCtoonIds) ? body.rewardCtoonIds.filter(x => typeof x === 'string') : []
  )].slice(0, MAX_TIER_REWARD_CTOONS)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!Number.isInteger(pointThreshold) || pointThreshold < 0 || pointThreshold > MAX_THRESHOLD) {
    throw createError({ statusCode: 400, statusMessage: 'Point threshold must be a non-negative whole number' })
  }
  if (rewardCtoonIds.length) {
    const validCount = await db.ctoon.count({ where: { id: { in: rewardCtoonIds } } })
    if (validCount !== rewardCtoonIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'One or more reward cToons do not exist' })
    }
  }

  let created
  try {
    created = await db.cMoonRankTier.create({
      data: {
        name,
        sortOrder,
        pointThreshold,
        rewardCtoons: { create: rewardCtoonIds.map((ctoonId, i) => ({ ctoonId, sortOrder: i })) },
      },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another rank tier already uses that name or order' })
    }
    throw err
  }

  await syncTierAcrossCMoons(created.id)
  await logAdminChange(db, { userId: me.id, area: 'CMoonRankTier', key: `create:${created.id}`, prevValue: null, newValue: { name, sortOrder, pointThreshold } })

  return { id: created.id }
})
