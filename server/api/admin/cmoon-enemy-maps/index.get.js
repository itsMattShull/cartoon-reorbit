// server/api/admin/cmoon-enemy-maps/index.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const maps = await db.cMoonEnemyMap.findMany({
    orderBy: [{ isBaseMap: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { defaultForFactions: true, overrideForMembers: true } } },
  })

  return {
    maps: maps.map(m => ({
      id: m.id,
      name: m.name,
      active: m.active,
      isBaseMap: m.isBaseMap,
      backgroundAnimation: m.backgroundAnimation,
      backgroundColor: m.backgroundColor,
      occurrenceWeight: m.occurrenceWeight,
      assignedEnemiesOnly: m.assignedEnemiesOnly,
      specialThresholdReduction: m.specialThresholdReduction,
      poisonAmount: m.poisonAmount,
      poisonIntervalRounds: m.poisonIntervalRounds,
      poisonAffectsPlayers: m.poisonAffectsPlayers,
      poisonAffectsEnemies: m.poisonAffectsEnemies,
      healAmount: m.healAmount,
      healIntervalRounds: m.healIntervalRounds,
      healAffectsPlayers: m.healAffectsPlayers,
      healAffectsEnemies: m.healAffectsEnemies,
      fogOfWarEnabled: m.fogOfWarEnabled,
      factionUsageCount: m._count?.defaultForFactions ?? 0,
      memberUsageCount: m._count?.overrideForMembers ?? 0,
    })),
  }
})
