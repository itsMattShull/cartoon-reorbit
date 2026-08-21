// server/api/leaderboard/cmoon-standings.get.js
// Public cMoon team leaderboard: cMoon-vs-cMoon total standings plus each cMoon's top
// individual contributors. Reads User.cMoonPoints/currentCMoonRankId directly — the
// denormalized counters kept in sync by server/cron/cmoon-points-aggregate.js — rather than
// aggregating PointsLog live, so this stays cheap regardless of PointsLog's size.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

const TOP_CONTRIBUTORS = 10

export default defineEventHandler(async () => {
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return { cMoonEnabled: false, standings: [] }

  const cmoons = await db.cMoon.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true, memberCount: true },
  })
  if (!cmoons.length) return { cMoonEnabled: true, standings: [] }

  const totals = await db.user.groupBy({
    by: ['cMoonId'],
    where: { cMoonId: { not: null }, active: true, banned: false },
    _sum: { cMoonPoints: true },
  })
  const totalMap = new Map(totals.map(t => [t.cMoonId, t._sum.cMoonPoints || 0]))

  const standings = await Promise.all(cmoons.map(async (c) => {
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
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      memberCount: c.memberCount,
      totalPoints: totalMap.get(c.id) || 0,
      topContributors: topContributors.map(u => ({
        username: u.username,
        avatar: u.avatar,
        points: u.cMoonPoints,
        rankName: u.currentCMoonRank?.name || null,
      })),
    }
  }))

  standings.sort((a, b) => b.totalPoints - a.totalPoints)

  return { cMoonEnabled: true, standings }
})
