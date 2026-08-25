// GET /api/admin/cmoon-dispersal-offers/eligible-ctoons — cToons eligible to be offered as a
// dispersal option. Restricted to unlimited-quantity cToons (Ctoon.quantity === null, "NULL
// means unlimited" per the schema) — a dispersal offer stays open to an unknown, open-ended
// number of future claimants, so offering a cToon with a fixed quantity cap would let it
// silently sell out mid-offer with no way to know in advance how many claims it can support.
// This is a separate, filtered list from /api/admin/list-ctoons (used unfiltered elsewhere, e.g.
// the Prize cToons picker) rather than a shared/modified endpoint, so this restriction only
// applies here.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const ctoons = await db.ctoon.findMany({
    where: { quantity: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, assetPath: true },
  })

  return { ctoons }
})
