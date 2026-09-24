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
        select: { affinityLevelsAsBorder: true, affinityLevelsAsGlow: true },
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
      usageCount: (e._count?.affinityLevelsAsBorder ?? 0) + (e._count?.affinityLevelsAsGlow ?? 0),
    })),
  }
})
