// server/api/admin/cmoon-rank-tiers.post.js — create a new universal rank tier and provision it
// (a CMoonRank + a claimable Achievement) for every existing cMoon. See
// server/utils/cmoonRankTiers.js for the provisioning mechanics.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import {
  syncTierAcrossCMoons, MIN_TIER_REWARD_CHOICES, MAX_TIER_REWARD_CTOONS,
  DEFAULT_TIER_REWARD_CHOICES, isValidMaxRewardChoices,
} from '@/server/utils/cmoonRankTiers'

const MAX_THRESHOLD = 5_000_000
// Admins only ever GIVE a rank MORE HP (see the schema comment on CMoonRankTier's own
// cMoonEnemyBattleHpBonus) — negative values aren't offered, keeping "rank up" from ever reading
// as a penalty. 50 mirrors the ceiling GlobalGameConfig.cMoonEnemyBattleDefaultHp itself is
// capped at (see cmoon-settings.post.js): each round deals at most one hit, so stacking much
// higher makes a PER_PLAYER enemy effectively unwinnable for the admin's own side of the fight.
const MIN_HP_BONUS = 0
const MAX_HP_BONUS = 50

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0
  const pointThreshold = Number.isFinite(Number(body?.pointThreshold)) ? Math.trunc(Number(body.pointThreshold)) : NaN
  const maxRewardChoices = body?.maxRewardChoices === undefined
    ? DEFAULT_TIER_REWARD_CHOICES
    : Math.trunc(Number(body.maxRewardChoices))
  const cMoonEnemyBattleHpBonus = body?.cMoonEnemyBattleHpBonus === undefined
    ? 0
    : Math.trunc(Number(body.cMoonEnemyBattleHpBonus))
  const rewardCtoonIds = [...new Set(
    Array.isArray(body?.rewardCtoonIds) ? body.rewardCtoonIds.filter(x => typeof x === 'string') : []
  )].slice(0, maxRewardChoices)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!Number.isInteger(pointThreshold) || pointThreshold < 0 || pointThreshold > MAX_THRESHOLD) {
    throw createError({ statusCode: 400, statusMessage: 'Point threshold must be a non-negative whole number' })
  }
  if (!isValidMaxRewardChoices(maxRewardChoices)) {
    throw createError({ statusCode: 400, statusMessage: `Reward choices must be between ${MIN_TIER_REWARD_CHOICES} and ${MAX_TIER_REWARD_CTOONS}` })
  }
  if (!Number.isInteger(cMoonEnemyBattleHpBonus) || cMoonEnemyBattleHpBonus < MIN_HP_BONUS || cMoonEnemyBattleHpBonus > MAX_HP_BONUS) {
    throw createError({ statusCode: 400, statusMessage: `cMoon Enemy Battles HP bonus must be between ${MIN_HP_BONUS} and ${MAX_HP_BONUS}` })
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
        maxRewardChoices,
        cMoonEnemyBattleHpBonus,
        rewardCtoons: { create: rewardCtoonIds.map((ctoonId, i) => ({ ctoonId, sortOrder: i })) },
      },
    })
  } catch (err) {
    if (err?.code === 'P2002') {
      throw createError({ statusCode: 409, statusMessage: 'Another rank tier already uses that name or order' })
    }
    throw err
  }

  try {
    await syncTierAcrossCMoons(created.id)
  } catch (err) {
    // Provisioning failed (e.g. a name/order collision with an existing custom rank in some
    // cMoon) — the tier row itself was created in a separate transaction from the sync, so
    // clean it up rather than leaving a rank tier that isn't actually wired up anywhere.
    await db.cMoonRankTier.delete({ where: { id: created.id } }).catch(() => {})
    throw createError({ statusCode: 409, statusMessage: err?.message || 'Failed to provision this rank across cMoons' })
  }
  await logAdminChange(db, { userId: me.id, area: 'CMoonRankTier', key: `create:${created.id}`, prevValue: null, newValue: { name, sortOrder, pointThreshold, cMoonEnemyBattleHpBonus } })

  return { id: created.id }
})
