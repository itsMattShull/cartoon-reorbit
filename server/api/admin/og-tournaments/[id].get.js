// GET /api/admin/og-tournaments/:id — everything about one tournament, for the admin console.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { isFresh } from '@/server/utils/ogGtoonTournamentLive'
import { ogtPrizeView } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = event.context.params?.id
  const t = await prisma.ogGtoonTournament.findUnique({ where: { id: String(id) }, include: { winner: { select: { username: true } } } })
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const [optIns, rounds, matches, grants] = await Promise.all([
    prisma.ogGtoonTournamentOptIn.findMany({
      where: { tournamentId: t.id }, orderBy: { optedInAt: 'asc' },
      include: { user: { select: { id: true, username: true, banned: true } } }
    }),
    prisma.ogGtoonTournamentRound.findMany({ where: { tournamentId: t.id }, orderBy: [{ stage: 'asc' }, { roundNumber: 'asc' }] }),
    prisma.ogGtoonTournamentMatch.findMany({
      where: { tournamentId: t.id },
      include: {
        playerA: { select: { id: true, username: true } }, playerB: { select: { id: true, username: true } },
        games: { orderBy: { startedAt: 'asc' }, select: { id: true, outcome: true, winnerUserId: true, player1Score: true, player2Score: true, player1UserId: true, endedAt: true } }
      },
      orderBy: [{ stage: 'asc' }, { roundNumber: 'asc' }, { tableNumber: 'asc' }]
    }),
    prisma.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id }, include: { user: { select: { username: true } } }, orderBy: [{ place: 'asc' }] })
  ])
  const now = Date.now()
  const [firstPrizeView, top8PrizeView] = await Promise.all([ogtPrizeView(t.firstPrizeJson), ogtPrizeView(t.top8PrizeJson)])
  return {
    tournament: { ...t, winnerUsername: t.winner?.username || null, winner: undefined },
    firstPrizeView, top8PrizeView,
    entrants: optIns.map(o => ({
      userId: o.userId, username: o.user?.username, banned: !!o.user?.banned, isActive: o.isActive,
      disqualified: o.disqualified, disqualifiedNote: o.disqualifiedNote, optedInAt: o.optedInAt,
      repairCount: o.repairCount, deck: o.deckSnapshotJson
    })),
    rounds: rounds.map(r => ({ id: r.id, stage: r.stage, roundNumber: r.roundNumber, dueAt: r.dueAt, openedAt: r.openedAt })),
    matches: matches.map(m => ({
      id: m.id, roundId: m.roundId, stage: m.stage, roundNumber: m.roundNumber, tableNumber: m.tableNumber, status: m.status,
      playerAUserId: m.playerAUserId, playerBUserId: m.playerBUserId,
      playerAName: m.playerA?.username, playerBName: m.status === 'BYE' ? 'BYE' : m.playerB?.username,
      winsA: m.winsA, winsB: m.winsB, ties: m.ties, gamesCounted: m.gamesCounted, outcome: m.outcome,
      winnerUserId: m.winnerUserId, resolution: m.resolution, dueAt: m.dueAt, lockedAt: m.lockedAt,
      overdue: !m.lockedAt && !!m.dueAt && m.dueAt.getTime() < now && ['PENDING', 'IN_PROGRESS'].includes(m.status),
      needsAdmin: m.needsAdmin, needsAdminReason: m.needsAdminReason, adminNotes: m.adminNotes, voidedGames: m.voidedGames,
      live: !!m.liveMatchId, readyA: isFresh(m.readyAAt), readyB: isFresh(m.readyBAt), seedA: m.seedA, seedB: m.seedB,
      games: m.games.map(g => ({ id: g.id, outcome: g.outcome, winnerUserId: g.winnerUserId, scoreA: g.player1UserId === m.playerAUserId ? g.player1Score : g.player2Score, scoreB: g.player1UserId === m.playerAUserId ? g.player2Score : g.player1Score, endedAt: g.endedAt }))
    })),
    prizeGrants: grants.map(g => ({ id: g.id, userId: g.userId, username: g.user?.username, tier: g.tier, place: g.place, status: g.status, errorMessage: g.errorMessage, summary: g.summaryJson, grantedAt: g.grantedAt, attempts: g.attempts }))
  }
})
