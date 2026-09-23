// server/api/leaderboard/cmoons.get.js
// cMoon team leaderboard board for the Leaderboards page's "cMoons" tab. A dedicated file
// (rather than extending server/api/cmoons.get.js) because that endpoint already serves a
// different, latency-sensitive consumer (CMoonSelectModal) — same convention as every other
// board in server/api/leaderboard/*.get.js. cMoon count is small (tens), so this needs
// neither the Redis+lock treatment the per-user game boards use nor a top-N cutoff.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return []

  const [cmoons, currentMemberTotals] = await Promise.all([
    db.cMoon.findMany({
      // Locked cMoons don't appear on the team-standings leaderboard at all — this is a separate
      // concern from the general per-user cMoon badge lookup (leaderboard/cmoon-badges.post.js),
      // which stays unfiltered so locked-cMoon members keep their badge on non-cMoon boards.
      where: { joinLocked: false },
      select: { id: true, name: true, color: true, memberCount: true, teamScore: true },
    }),
    // Sum of CMoonScoreLog points earned by whoever is CURRENTLY on each team, not teamScore
    // (which sums every point the team has EVER earned, including from members who've since
    // left — see recomputeCMoonTeamScores in server/utils/cmoon.js, which never re-scopes it to
    // current membership). Using teamScore for an average-per-player ranking would let a team
    // that churned through big-earning members who then left show an inflated average relative
    // to what its actual current roster is earning. One query across every cMoon at once — same
    // JOIN condition (u."cMoonId" = <this team>) the per-team "Top Point Contributors" query
    // uses (server/api/cmoon/[id].get.js), just grouped by team instead of scoped to one.
    db.$queryRaw`
      SELECT u."cMoonId", SUM(csl."points")::int AS total
      FROM "CMoonScoreLog" csl
      JOIN "User" u ON u."id" = csl."userId"
      WHERE u."cMoonId" IS NOT NULL
        AND u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
      GROUP BY u."cMoonId"
    `,
  ])

  const currentMemberTotalById = new Map(currentMemberTotals.map(r => [r.cMoonId, r.total]))

  // Ranked by average points per CURRENT member, not raw teamScore — a purely presentational
  // choice for THIS board only (teamScore itself, individual rank progression, and every scoring
  // rule are untouched) so a large team isn't automatically #1 just by having more members.
  // Sorted in JS rather than via Prisma's orderBy since the average isn't a stored column; fine
  // at this scale (see this file's header comment — cMoon count is tens, not thousands).
  const ranked = cmoons
    .map(c => ({ ...c, avgScore: c.memberCount > 0 ? (currentMemberTotalById.get(c.id) || 0) / c.memberCount : 0 }))
    .sort((a, b) => b.avgScore - a.avgScore || a.name.localeCompare(b.name))

  return ranked.map((c, i) => ({ ...c, rank: i + 1 }))
})
