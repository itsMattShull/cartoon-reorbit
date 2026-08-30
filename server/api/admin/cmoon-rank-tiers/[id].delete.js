// server/api/admin/cmoon-rank-tiers/[id].delete.js — delete a universal rank tier. Blocked once
// any player has actually earned one of its per-cMoon achievements — see
// server/utils/cmoonRankTiers.js's tierEarnedCount/deleteTierAndProvisionedRows.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { tierEarnedCount, deleteTierAndProvisionedRows } from '@/server/utils/cmoonRankTiers'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tier = await db.cMoonRankTier.findUnique({ where: { id } })
  if (!tier) throw createError({ statusCode: 404, statusMessage: 'Rank tier not found' })

  const earnedCount = await tierEarnedCount(id)
  if (earnedCount > 0) {
    throw createError({ statusCode: 409, statusMessage: `Cannot delete — ${earnedCount} member(s) have already earned this rank.` })
  }

  await deleteTierAndProvisionedRows(id)
  await logAdminChange(db, { userId: me.id, area: 'CMoonRankTier', key: `delete:${id}`, prevValue: { name: tier.name }, newValue: null })

  return { ok: true }
})
