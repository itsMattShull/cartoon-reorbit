// server/api/admin/cmoon-prestige-rank-tiers/[id].delete.js — remove a prestige-exclusive rank
// rung. Blocked while any player currently holds a rank mirrored from it — see tierHolderCount's
// own comment in server/utils/cmoonPrestigeRankTiers.js.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { tierHolderCount, deleteTierAndProvisionedRows } from '@/server/utils/cmoonPrestigeRankTiers'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const tier = await db.cMoonPrestigeRankTier.findUnique({ where: { id } })
  if (!tier) throw createError({ statusCode: 404, statusMessage: 'Prestige rank tier not found' })

  const holders = await tierHolderCount(id)
  if (holders > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${holders} player${holders === 1 ? '' : 's'} currently hold${holders === 1 ? 's' : ''} this rank — it can't be deleted while anyone has earned it`,
    })
  }

  await deleteTierAndProvisionedRows(id)
  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPrestigeRankTier', key: `delete:${id}`,
    prevValue: { name: tier.name, sortOrder: tier.sortOrder, pointThreshold: tier.pointThreshold }, newValue: null,
  })

  return { ok: true }
})
