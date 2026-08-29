// server/api/admin/cmoon-rank-tiers/[id].put.js — edit a universal rank tier and resync its
// provisioned CMoonRank + Achievement rows across every cMoon.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { syncTierAcrossCMoons, MAX_TIER_REWARD_CTOONS } from '@/server/utils/cmoonRankTiers'

const MAX_THRESHOLD = 5_000_000

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tier = await db.cMoonRankTier.findUnique({ where: { id } })
  if (!tier) throw createError({ statusCode: 404, statusMessage: 'Rank tier not found' })

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : tier.name
  const sortOrder = body?.sortOrder === undefined ? tier.sortOrder : Math.trunc(Number(body.sortOrder))
  const pointThreshold = body?.pointThreshold === undefined ? tier.pointThreshold : Math.trunc(Number(body.pointThreshold))
  const rewardCtoonIds = body?.rewardCtoonIds === undefined
    ? null
    : [...new Set(Array.isArray(body.rewardCtoonIds) ? body.rewardCtoonIds.filter(x => typeof x === 'string') : [])].slice(0, MAX_TIER_REWARD_CTOONS)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!Number.isInteger(pointThreshold) || pointThreshold < 0 || pointThreshold > MAX_THRESHOLD) {
    throw createError({ statusCode: 400, statusMessage: 'Point threshold must be a non-negative whole number' })
  }
  if (rewardCtoonIds && rewardCtoonIds.length) {
    const validCount = await db.ctoon.count({ where: { id: { in: rewardCtoonIds } } })
    if (validCount !== rewardCtoonIds.length) {
      throw createError({ statusCode: 400, statusMessage: 'One or more reward cToons do not exist' })
    }
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.cMoonRankTier.update({ where: { id }, data: { name, sortOrder, pointThreshold } })
      if (rewardCtoonIds !== null) {
        await tx.cMoonRankTierRewardCtoon.deleteMany({ where: { tierId: id } })
        if (rewardCtoonIds.length) {
          await tx.cMoonRankTierRewardCtoon.createMany({
            data: rewardCtoonIds.map((ctoonId, i) => ({ tierId: id, ctoonId, sortOrder: i })),
          })
        }
      }
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another rank tier already uses that name or order' })
    }
    throw err
  }

  await syncTierAcrossCMoons(id)
  await logAdminChange(db, { userId: me.id, area: 'CMoonRankTier', key: `update:${id}`, prevValue: { name: tier.name, sortOrder: tier.sortOrder, pointThreshold: tier.pointThreshold }, newValue: { name, sortOrder, pointThreshold } })

  return { ok: true }
})
