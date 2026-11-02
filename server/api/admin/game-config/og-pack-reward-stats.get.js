// GET /api/admin/game-config/og-pack-reward-stats
// How the OG gToons PvP pack reward is actually being used — so farming is VISIBLE rather than something you only learn
// about from a complaint. Lives under game-config/ so a sub-admin who may configure the reward (the 'games' scope) can also
// see it (see utils/adminPermissions.js).
//
// Returns: this window's awards, per-status counts of evaluated matches for the last 24h / 7d, the most-rewarded winners and
// the most-repeated (winner, loser) pairs over 7 days, and the 20 most recent awards.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getPackDailyWindowStart } from '@/server/utils/packDailyWindow'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const now = Date.now()
  const since24h = new Date(now - 24 * 3600 * 1000)
  const since7d = new Date(now - 7 * 24 * 3600 * 1000)
  const windowStart = getPackDailyWindowStart()

  const [thisWindow, status24h, status7d, winners, pairs, recent] = await Promise.all([
    prisma.ogGtoonPackAward.count({ where: { windowStart } }),
    prisma.ogGtoonMatch.groupBy({ by: ['rewardStatus'], where: { endedAt: { gte: since24h }, rewardStatus: { not: null } }, _count: { _all: true } }),
    prisma.ogGtoonMatch.groupBy({ by: ['rewardStatus'], where: { endedAt: { gte: since7d }, rewardStatus: { not: null } }, _count: { _all: true } }),
    prisma.ogGtoonPackAward.groupBy({
      by: ['winnerUserId'], where: { createdAt: { gte: since7d } }, _count: { _all: true },
      orderBy: { _count: { winnerUserId: 'desc' } }, take: 10
    }),
    prisma.ogGtoonPackAward.groupBy({
      by: ['winnerUserId', 'loserUserId'], where: { createdAt: { gte: since7d } }, _count: { _all: true },
      having: { winnerUserId: { _count: { gte: 2 } } },
      orderBy: { _count: { winnerUserId: 'desc' } }, take: 10
    }),
    prisma.ogGtoonPackAward.findMany({
      orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, createdAt: true, winnerUserId: true, loserUserId: true, pack: { select: { name: true } } }
    })
  ])

  const ids = [...new Set([
    ...winners.map(w => w.winnerUserId),
    ...pairs.flatMap(p => [p.winnerUserId, p.loserUserId]),
    ...recent.flatMap(r => [r.winnerUserId, r.loserUserId])
  ])]
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : []
  const name = (id) => users.find(u => u.id === id)?.username ?? 'unknown'
  const tally = (rows) => Object.fromEntries(rows.map(r => [r.rewardStatus, r._count._all]))

  return {
    windowStart,
    awardedThisWindow: thisWindow,
    statusLast24h: tally(status24h),
    statusLast7d: tally(status7d),
    topWinners7d: winners.map(w => ({ username: name(w.winnerUserId), awards: w._count._all })),
    repeatPairs7d: pairs.map(p => ({ winner: name(p.winnerUserId), loser: name(p.loserUserId), awards: p._count._all })),
    recent: recent.map(r => ({ at: r.createdAt, winner: name(r.winnerUserId), loser: name(r.loserUserId), pack: r.pack?.name ?? null }))
  }
})
