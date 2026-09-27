// server/api/admin/cmoon-enemy-factions.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const factions = await db.cMoonEnemyFaction.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { members: true } } },
  })

  return {
    factions: factions.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      bannerImagePath: f.bannerImagePath,
      active: f.active,
      sortOrder: f.sortOrder,
      // DELETE /cmoon-enemy-factions/:id blocks on any member at all, so the admin list can
      // disable its delete button off this same number rather than waiting for the 409.
      memberCount: f._count?.members ?? 0,
    })),
  }
})
