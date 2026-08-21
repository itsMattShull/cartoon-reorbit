// server/api/leaderboard/cmoons.get.js
// cMoon team leaderboard board for the Leaderboards page's "cMoons" tab. A dedicated file
// (rather than extending server/api/cmoons.get.js) because that endpoint already serves a
// different, latency-sensitive consumer (CMoonSelectModal) — same convention as every other
// board in server/api/leaderboard/*.get.js. cMoon count is small (tens), so this needs
// neither the Redis+lock treatment the per-user game boards use nor a top-N cutoff.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return []

  const cmoons = await db.cMoon.findMany({
    orderBy: [{ teamScore: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, memberCount: true, teamScore: true },
  })

  return cmoons.map((c, i) => ({ ...c, rank: i + 1 }))
})
