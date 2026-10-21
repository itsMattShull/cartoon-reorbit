// GET /api/game/oggtoons/tournaments
// Every tournament worth listing (live ones, ones opening within a week, and recent history) plus
// the signed-in player's own entry / "needs your action" flags. The shared part is cached briefly;
// only the small per-player part is queried per request.
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { cachedJson } from '@/server/utils/cache'
import { ogtRequireUser, ogtRequireEnabled } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()

  const tournaments = await cachedJson('og-tournaments:list', 15, async () => {
    const soon = new Date(Date.now() + 7 * 86400000)
    const rows = await prisma.ogGtoonTournament.findMany({
      where: { OR: [{ status: { not: 'DRAFT' } }, { status: 'DRAFT', optInStartAt: { lte: soon } }] },
      orderBy: { optInStartAt: 'desc' },
      take: 60,
      select: {
        id: true, name: true, description: true, status: true, format: true, optInStartAt: true, optInEndAt: true,
        bestOf: true, roundWindowHours: true, tournamentCompletedAt: true, winner: { select: { username: true } },
        firstPrizeJson: true, top8PrizeJson: true
      }
    })
    const counts = await prisma.ogGtoonTournamentOptIn.groupBy({
      by: ['tournamentId'], where: { isActive: true, tournamentId: { in: rows.map(r => r.id) } }, _count: { _all: true }
    })
    const countBy = new Map(counts.map(c => [c.tournamentId, c._count._all]))
    return rows.map(({ firstPrizeJson, top8PrizeJson, winner, ...t }) => ({
      ...t,
      optInCount: countBy.get(t.id) || 0,
      winnerUsername: winner?.username || null,
      hasPrizes: !!(firstPrizeJson && (firstPrizeJson.points || firstPrizeJson.ctoons?.length || firstPrizeJson.backgrounds?.length)) ||
        !!(top8PrizeJson && (top8PrizeJson.points || top8PrizeJson.ctoons?.length || top8PrizeJson.backgrounds?.length))
    }))
  })

  const ids = tournaments.map(t => t.id)
  const [optIns, open] = await Promise.all([
    prisma.ogGtoonTournamentOptIn.findMany({
      where: { userId: me.id, tournamentId: { in: ids } }, select: { tournamentId: true, isActive: true, disqualified: true }
    }),
    prisma.ogGtoonTournamentMatch.findMany({
      where: {
        tournamentId: { in: ids }, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] },
        OR: [{ playerAUserId: me.id }, { playerBUserId: me.id }]
      },
      select: { id: true, tournamentId: true }
    })
  ])
  const optBy = new Map(optIns.map(o => [o.tournamentId, o]))
  const openBy = new Map(open.map(m => [m.tournamentId, m.id]))
  return tournaments.map(t => ({
    ...t,
    isOptedIn: !!optBy.get(t.id)?.isActive,
    disqualified: !!optBy.get(t.id)?.disqualified,
    myMatchId: openBy.get(t.id) || null,
    needsAction: openBy.has(t.id)
  }))
})
