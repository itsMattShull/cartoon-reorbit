// Admin listing of the Pokemon: Fire, Water, Grass! trainer roster.
//
// Separate from the public roster in the config endpoint: this one includes inactive trainers
// so they can be re-enabled, which players must never see.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return db.pokemonBattleTrainer.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select: {
      id: true, name: true, imagePath: true, thumbPath: true,
      width: true, height: true, sortOrder: true, active: true
    }
  })
})
