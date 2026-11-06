// GET /api/admin/cmoon-dispersal-offers/eligible-packs — packs eligible to be offered as a
// dispersal option. Unlike eligible-ctoons.get.js's unlimited-quantity-only filter, every pack is
// eligible here — Pack has no supply-cap concept analogous to Ctoon.quantity (see the admin
// dispersal-offers.post.js's own comment on why that filter is cToon-specific), so there's nothing
// to exclude.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const packs = await db.pack.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, imagePath: true },
  })

  return { packs }
})
