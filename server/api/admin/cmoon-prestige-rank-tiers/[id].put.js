// server/api/admin/cmoon-prestige-rank-tiers/[id].put.js — edit a prestige-exclusive rank rung.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parsePrestigeRankTierBody, provisionTierAcrossPrestigeCMoons } from '@/server/utils/cmoonPrestigeRankTiers'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tier = await db.cMoonPrestigeRankTier.findUnique({ where: { id } })
  if (!tier) throw createError({ statusCode: 404, statusMessage: 'Prestige rank tier not found' })

  const body = await readBody(event)
  const parsed = parsePrestigeRankTierBody(body, tier)
  if (parsed.error) throw createError({ statusCode: 400, statusMessage: parsed.error })
  const { name, sortOrder, pointThreshold, rewardType, ctoonId, avatarId, backgroundId, packId, quantity } = parsed

  if (ctoonId) {
    const exists = await db.ctoon.count({ where: { id: ctoonId } })
    if (!exists) throw createError({ statusCode: 400, statusMessage: 'Reward cToon not found' })
  }
  if (avatarId) {
    const exists = await db.avatar.count({ where: { id: avatarId } })
    if (!exists) throw createError({ statusCode: 400, statusMessage: 'Reward avatar not found' })
  }
  if (backgroundId) {
    const exists = await db.background.count({ where: { id: backgroundId } })
    if (!exists) throw createError({ statusCode: 400, statusMessage: 'Reward background not found' })
  }
  if (packId) {
    const exists = await db.pack.count({ where: { id: packId } })
    if (!exists) throw createError({ statusCode: 400, statusMessage: 'Reward pack not found' })
  }

  try {
    await db.cMoonPrestigeRankTier.update({
      where: { id },
      data: { name, sortOrder, pointThreshold, rewardType, ctoonId, avatarId, backgroundId, packId, quantity },
    })
  } catch (err) {
    if (err?.code === 'P2002') throw createError({ statusCode: 409, statusMessage: 'Another prestige rank tier already uses that name or order' })
    throw err
  }

  // Re-provision in case sortOrder/name changed — the mirror rows themselves carry no
  // denormalized copy of either (see provisionTierForOneCMoon's own comment), so there's nothing
  // to actually update on them, but this still catches the case where this tier is brand new to
  // some prestige cMoon created after it (the upsert's create branch fills that gap).
  await provisionTierAcrossPrestigeCMoons(id)

  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPrestigeRankTier', key: `update:${id}`,
    prevValue: { name: tier.name, sortOrder: tier.sortOrder, pointThreshold: tier.pointThreshold, rewardType: tier.rewardType },
    newValue: { name, sortOrder, pointThreshold, rewardType, quantity },
  })

  return { ok: true }
})
