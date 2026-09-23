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
    // Sum of CMoonScoreLog points actually earned FOR each team, not teamScore (which sums every
    // point the team has EVER earned, including from members who've since left — see
    // recomputeCMoonTeamScores in server/utils/cmoon.js, which never re-scopes it to current
    // membership). Using teamScore for an average-per-player ranking would let a team that
    // churned through big-earning members who then left show an inflated average relative to
    // what its actual current roster is earning.
    //
    // "csl.cMoonId" = u."cMoonId" is the critical condition, not just grouping by the user's
    // current cMoonId: a CMoonScoreLog row is permanently tagged with whichever cMoon it was
    // earned for and never moves when a player changes teams (admin reassignment, Balance Teams,
    // accepted change requests — see reassignUserCMoon's own comment in server/utils/cmoon.js).
    // Without this, a player who switches teams would carry every point they ever earned on
    // their OLD team into their new team's average.
    //
    // No active/banned filter — unlike "Top Point Contributors" (server/api/cmoon/[id].get.js),
    // a public leaderboard of named individuals where hiding a banned player makes sense, this
    // total is divided by memberCount, which does NOT exclude banned/inactive members (neither
    // banning nor the inactive-account sweep touches cMoonId or memberCount). Filtering the
    // numerator but not the denominator would unfairly lower a team's average for every banned/
    // inactive member it has — matches recomputeCMoonTeamScores's own convention (no such filter)
    // for the same reason. One query across every cMoon at once rather than per-team.
    db.$queryRaw`
      SELECT u."cMoonId", SUM(csl."points")::int AS total
      FROM "CMoonScoreLog" csl
      JOIN "User" u ON u."id" = csl."userId" AND u."cMoonId" = csl."cMoonId"
      WHERE u."cMoonId" IS NOT NULL
        AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
      GROUP BY u."cMoonId"
    `,
  ])

  const currentMemberTotalById = new Map(currentMemberTotals.map(r => [r.cMoonId, r.total]))

  // Site-wide average (across every unlocked cMoon being ranked here) that small teams' averages
  // get shrunk toward below — computed from the same totals already fetched above, no extra query.
  const totalPointsAllTeams = cmoons.reduce((sum, c) => sum + (currentMemberTotalById.get(c.id) || 0), 0)
  const totalMembersAllTeams = cmoons.reduce((sum, c) => sum + c.memberCount, 0)
  const siteAvg = totalMembersAllTeams > 0 ? totalPointsAllTeams / totalMembersAllTeams : 0

  // See GlobalGameConfig.cMoonAvgShrinkageK's schema comment for the full explanation: a tiny
  // team can post a huge PLAIN average off one or two lucky/active members, dominating the
  // ranking on noise rather than sustained performance. Bayesian/IMDb-style shrinkage blends a
  // team's own average with the site-wide average, weighted by memberCount, so a small team is
  // pulled toward siteAvg until it has "earned" enough members for its own average to be trusted.
  // k=0 degenerates to memberCount/(memberCount+0) = 1, i.e. the plain average, no special-casing
  // needed.
  const shrinkageK = Number.isInteger(config.cMoonAvgShrinkageK) ? config.cMoonAvgShrinkageK : 10

  // Ranked by (shrunk) average points per CURRENT member, not raw teamScore — a purely
  // presentational choice for THIS board only (teamScore itself, individual rank progression,
  // and every scoring rule are untouched) so a large team isn't automatically #1 just by having
  // more members, and a tiny team isn't automatically #1 just by a small, noisy sample. Sorted in
  // JS rather than via Prisma's orderBy since the average isn't a stored column; fine at this
  // scale (see this file's header comment — cMoon count is tens, not thousands).
  const ranked = cmoons
    .map(c => {
      const ownAvg = c.memberCount > 0 ? (currentMemberTotalById.get(c.id) || 0) / c.memberCount : 0
      const avgScore = c.memberCount > 0
        ? (c.memberCount / (c.memberCount + shrinkageK)) * ownAvg + (shrinkageK / (c.memberCount + shrinkageK)) * siteAvg
        : 0
      return { ...c, avgScore }
    })
    .sort((a, b) => b.avgScore - a.avgScore || a.name.localeCompare(b.name))

  return ranked.map((c, i) => ({ ...c, rank: i + 1 }))
})
