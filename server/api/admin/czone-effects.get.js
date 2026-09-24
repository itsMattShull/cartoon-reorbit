// server/api/admin/czone-effects.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const effects = await db.cZoneEffect.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        // All four counted here, not just the affinity-level ones — DELETE /czone-effects/:id
        // blocks on ALL of them (grants are permanent and can never be reassigned away, unlike a
        // level's assignment), so this list has to agree with that endpoint or the delete button
        // looks enabled right up until it 409s.
        select: {
          affinityLevelsAsBorder: true, affinityLevelsAsGlow: true,
          grantedBorders: true, grantedGlows: true,
        },
      },
    },
  })

  return {
    effects: effects.map(e => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      color: e.color,
      thickness: e.thickness,
      glowRadius: e.glowRadius,
      opacity: e.opacity,
      speed: e.speed,
      assignedCount: (e._count?.affinityLevelsAsBorder ?? 0) + (e._count?.affinityLevelsAsGlow ?? 0),
      grantedCount: (e._count?.grantedBorders ?? 0) + (e._count?.grantedGlows ?? 0),
    })),
  }
})
