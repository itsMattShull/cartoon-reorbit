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
    // Locked cMoons don't appear on the team-standings leaderboard at all — this is a separate
    // concern from the general per-user cMoon badge lookup (leaderboard/cmoon-badges.post.js),
    // which stays unfiltered so locked-cMoon members keep their badge on non-cMoon boards.
    where: { joinLocked: false },
    select: { id: true, name: true, color: true, memberCount: true, teamScore: true },
  })

  // Ranked by average points per member, not raw teamScore — a purely presentational choice for
  // THIS board only (teamScore itself, individual rank progression, and every scoring rule are
  // untouched) so a large team isn't automatically #1 just by having more members. Sorted in JS
  // rather than via Prisma's orderBy since the average isn't a stored column; fine at this scale
  // (see this file's header comment — cMoon count is tens, not thousands).
  const ranked = cmoons
    .map(c => ({ ...c, avgScore: c.memberCount > 0 ? c.teamScore / c.memberCount : 0 }))
    .sort((a, b) => b.avgScore - a.avgScore || a.name.localeCompare(b.name))

  return ranked.map((c, i) => ({ ...c, rank: i + 1 }))
})
