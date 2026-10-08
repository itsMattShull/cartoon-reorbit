// server/api/admin/cmoon-special-attacks.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const attacks = await db.cMoonSpecialAttack.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { cmoons: true, enemyFactions: true } } },
  })

  return {
    attacks: attacks.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      effectType: a.effectType,
      amount: a.amount,
      soundPath: a.soundPath,
      cmoonUsageCount: a._count?.cmoons ?? 0,
      enemyFactionUsageCount: a._count?.enemyFactions ?? 0,
    })),
  }
})
