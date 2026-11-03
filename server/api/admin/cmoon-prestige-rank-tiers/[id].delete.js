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

  const conflictMessage = (holders) =>
    `${holders} player${holders === 1 ? '' : 's'} currently hold${holders === 1 ? 's' : ''} this rank — it can't be deleted while anyone has earned it`

  const holders = await tierHolderCount(id)
  if (holders > 0) throw createError({ statusCode: 409, statusMessage: conflictMessage(holders) })

  // deleteTierAndProvisionedRows re-checks holder count inside the SAME transaction as the
  // delete — closing the gap since the check above, during which a player could have just been
  // granted this exact rank (see that function's own comment). A second rejection here is rare
  // but real, not merely defensive.
  const result = await deleteTierAndProvisionedRows(id)
  if (!result.ok) throw createError({ statusCode: 409, statusMessage: conflictMessage(result.holders) })
  await logAdminChange(db, {
    userId: me.id, area: 'CMoonPrestigeRankTier', key: `delete:${id}`,
    prevValue: { name: tier.name, sortOrder: tier.sortOrder, pointThreshold: tier.pointThreshold }, newValue: null,
  })

  return { ok: true }
})
