// server/api/admin/cmoon-enemy-factions.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const factions = await db.cMoonEnemyFaction.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { members: true } },
      appearEffect: { select: { id: true, name: true } },
      specialAttack: { select: { id: true, name: true } },
    },
  })

  return {
    factions: factions.map(f => ({
      id: f.id,
      name: f.name,
      description: f.description,
      bannerImagePath: f.bannerImagePath,
      battleMusicPath: f.battleMusicPath,
      defaultAppearSoundPath: f.defaultAppearSoundPath,
      defaultDamageTakenSoundPath: f.defaultDamageTakenSoundPath,
      defaultDamageAvoidedSoundPath: f.defaultDamageAvoidedSoundPath,
      defaultAttackingSoundPath: f.defaultAttackingSoundPath,
      defaultVictorySoundPath: f.defaultVictorySoundPath,
      defaultDefeatSoundPath: f.defaultDefeatSoundPath,
      active: f.active,
      sortOrder: f.sortOrder,
      appearEffectId: f.appearEffectId,
      appearEffect: f.appearEffect,
      specialAttackId: f.specialAttackId,
      specialAttack: f.specialAttack,
      // DELETE /cmoon-enemy-factions/:id blocks on any member at all, so the admin list can
      // disable its delete button off this same number rather than waiting for the 409.
      memberCount: f._count?.members ?? 0,
    })),
  }
})
