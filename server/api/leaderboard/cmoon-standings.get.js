// server/api/leaderboard/cmoon-standings.get.js
// Top individual point contributors per cMoon, for the Leaderboards page's cMoons tab. Sources
// each member's contribution from CMoonScoreLog — the same per-user, per-cMoon weekly team-score
// log that CMoon.teamScore (server/api/leaderboard/cmoons.get.js) is summed from, see
// recomputeCMoonTeamScores in server/utils/cmoon.js — so this board is a per-player breakdown of
// (a subset of) that same, already-correct total. Deliberately NOT User.cMoonPoints: that's a
// lifetime points-earned-from-anything counter, unrelated to what a player has actually
// contributed to their team, and it converges toward a player's whole account balance (the bug
// this endpoint used to have — a "contribution" that just mirrored total account points).
//
// One raw-SQL JOIN + GROUP BY + ORDER BY + LIMIT query per cMoon, mirroring the aggregate
// pattern already used by trending-earners.get.js / active-ctoon-acquirers.get.js /
// recomputeCMoonTeamScores, rather than a Prisma groupBy + JS-side sort. The JOIN to "User"
// (active/banned/current cMoonId) is what keeps a departed or banned member's historical log
// rows off the board — do not "simplify" this into a bare GROUP BY on CMoonScoreLog alone, that
// would let a former or banned member's old contributions reappear. No caching here, matching
// leaderboard/cmoons.get.js's own reasoning: cMoon count and per-team member counts are both
// small, so this stays cheap without it.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig, getCMoonCaptainUserIdSet, displayRankName } from '@/server/utils/cmoon'

const TOP_CONTRIBUTORS = 10

function topContributorsForCMoon(cMoonId) {
  return db.$queryRaw`
    SELECT u."id" AS "userId", u."username", u."avatar", r."name" AS "rankName",
           SUM(csl."points")::int AS "points"
    FROM "CMoonScoreLog" csl
    JOIN "User" u ON u."id" = csl."userId" AND u."cMoonId" = ${cMoonId}
    LEFT JOIN "CMoonRank" r ON r."id" = u."currentCMoonRankId"
    WHERE csl."cMoonId" = ${cMoonId}
      AND u."active" = true
      AND COALESCE(u."banned", false) = false
    GROUP BY u."id", u."username", u."avatar", r."name"
    HAVING SUM(csl."points") > 0
    ORDER BY SUM(csl."points") DESC, u."username" ASC
    LIMIT ${TOP_CONTRIBUTORS}
  `
}

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { cMoonEnabled: false, contributorsByCMoonId: {} }

  // Locked cMoons are excluded from this "top contributors" tab, same as the team-standings
  // board in leaderboard/cmoons.get.js — see CMoon.joinLocked in prisma/schema.prisma.
  const cmoons = await db.cMoon.findMany({ where: { joinLocked: false }, select: { id: true } })
  if (!cmoons.length) return { cMoonEnabled: true, contributorsByCMoonId: {} }

  const contributorsByCMoonId = {}
  await Promise.all(cmoons.map(async (c) => {
    const [rows, captainUserIds] = await Promise.all([
      topContributorsForCMoon(c.id),
      getCMoonCaptainUserIdSet(c.id),
    ])
    // A captain always displays as "Captain" regardless of their actually-earned rank tier —
    // see displayRankName in server/utils/cmoon.js.
    contributorsByCMoonId[c.id] = rows.map(row => ({
      username: row.username,
      avatar: row.avatar,
      points: row.points,
      rankName: displayRankName(row.rankName, captainUserIds.has(row.userId)),
    }))
  }))

  return { cMoonEnabled: true, contributorsByCMoonId }
})
