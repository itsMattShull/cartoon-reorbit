// server/api/admin/cmoon-prestige-rank-tiers.post.js — add a rung to the prestige-exclusive rank
// ladder and mirror it onto every cMoon currently flagged isPrestigeCMoon. See
// server/utils/cmoonPrestigeRankTiers.js for the provisioning mechanics.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { parsePrestigeRankTierBody, provisionTierAcrossPrestigeCMoons } from '@/server/utils/cmoonPrestigeRankTiers'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const parsed = parsePrestigeRankTierBody(body)
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

  let created
  try {
    created = await db.cMoonPrestigeRankTier.create({
      data: { name, sortOrder, pointThreshold, rewardType, ctoonId, avatarId, backgroundId, packId, quantity },
    })
  } catch (err) {
    if (err?.code === 'P2002') throw createError({ statusCode: 409, statusMessage: 'Another prestige rank tier already uses that name or order' })
    throw err
  }

  await provisionTierAcrossPrestigeCMoons(created.id)
  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPrestigeRankTier', key: `create:${created.id}`,
    prevValue: null, newValue: { name, sortOrder, pointThreshold, rewardType, quantity },
  })

  return { id: created.id }
})
