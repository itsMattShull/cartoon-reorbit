// server/api/leaderboard/cmoon-standings.get.js
// Top individual point contributors per cMoon, for the Leaderboards page's cMoons tab. This
// is a different, complementary metric from server/api/leaderboard/cmoons.get.js's
// teamScore-based standings (weekly bonus categories — see runWeeklyCMoonScoring in
// server/utils/cmoon.js): here we read User.cMoonPoints, each member's own lifetime point
// contribution to their current cMoon, which is what feeds the cMoon rank/achievement system
// (see server/utils/achievements.js). Reads a denormalized column (kept in sync by
// server/cron/cmoon-points-aggregate.js), not a live PointsLog aggregate, so this stays cheap.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

const TOP_CONTRIBUTORS = 10

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { cMoonEnabled: false, contributorsByCMoonId: {} }

  const cmoons = await db.cMoon.findMany({ select: { id: true } })
  if (!cmoons.length) return { cMoonEnabled: true, contributorsByCMoonId: {} }

  const contributorsByCMoonId = {}
  await Promise.all(cmoons.map(async (c) => {
    const topContributors = await db.user.findMany({
      where: { cMoonId: c.id, active: true, banned: false, cMoonPoints: { gt: 0 } },
      orderBy: { cMoonPoints: 'desc' },
      take: TOP_CONTRIBUTORS,
      select: {
        username: true,
        avatar: true,
        cMoonPoints: true,
        currentCMoonRank: { select: { name: true } },
      },
    })
    contributorsByCMoonId[c.id] = topContributors.map(u => ({
      username: u.username,
      avatar: u.avatar,
      points: u.cMoonPoints,
      rankName: u.currentCMoonRank?.name || null,
    }))
  }))

  return { cMoonEnabled: true, contributorsByCMoonId }
})
