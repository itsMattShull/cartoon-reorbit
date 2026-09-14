// server/api/admin/cmoon-join-effects.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const effects = await db.cMoonJoinEffect.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { cmoons: true } } },
  })

  return {
    effects: effects.map(e => ({
      id: e.id,
      name: e.name,
      backgroundColor: e.backgroundColor,
      vignette: e.vignette,
      imagePath: e.imagePath,
      text: e.text,
      textColor: e.textColor,
      textPosition: e.textPosition,
      usageCount: e._count?.cmoons ?? 0,
    })),
  }
})
