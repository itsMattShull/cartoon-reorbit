// server/api/admin/cmoon-pvp-settings.get.js — read-only companion to the POST endpoint, so the
// admin UI can load current values without a write (the POST's own `data = {}` empty-body upsert
// would work too, but costs a needless write on every page load).
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const config = await db.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: {
      cMoonPvpEnabled: true, cMoonPvpMaxTeamSize: true, cMoonPvpTeammatesOnlyEnabled: true,
      cMoonPvpEqualizeHpEnabled: true, cMoonPvpEqualizeHpAmount: true, cMoonPvpPointsPerWin: true,
      cMoonPvpJoinWindowSeconds: true, cMoonPvpRoundLimit: true, cMoonPvpPrivateLobbiesEnabled: true,
    },
  })

  return {
    cMoonPvpEnabled: !!config?.cMoonPvpEnabled,
    cMoonPvpMaxTeamSize: config?.cMoonPvpMaxTeamSize ?? 4,
    cMoonPvpTeammatesOnlyEnabled: !!config?.cMoonPvpTeammatesOnlyEnabled,
    cMoonPvpEqualizeHpEnabled: !!config?.cMoonPvpEqualizeHpEnabled,
    cMoonPvpEqualizeHpAmount: config?.cMoonPvpEqualizeHpAmount ?? 7,
    cMoonPvpPointsPerWin: config?.cMoonPvpPointsPerWin ?? 0,
    cMoonPvpJoinWindowSeconds: config?.cMoonPvpJoinWindowSeconds ?? 60,
    cMoonPvpRoundLimit: config?.cMoonPvpRoundLimit ?? 300,
    cMoonPvpPrivateLobbiesEnabled: config?.cMoonPvpPrivateLobbiesEnabled !== false,
  }
})
