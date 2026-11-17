// GET /api/game/oggtoons/tournaments/:id/my-match
// The signed-in player's place in this tournament: their open pairing (with the live series score
// computed from the games, so it is right the moment a game ends) or where they stand otherwise.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { readSeries, isFresh } from '@/server/utils/ogGtoonTournamentLive'
import { gameSummaryFor } from '@/server/utils/ogGtoonTournamentGames'
import { ogtRequireUser, ogtRequireEnabled, ogtId, ogtRoundLabel } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)

  const t = await prisma.ogGtoonTournament.findUnique({
    where: { id },
    select: { id: true, status: true, maxExtraGames: true, format: true, finalPlacementsJson: true, roundWindowHours: true }
  })
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const optIn = await prisma.ogGtoonTournamentOptIn.findUnique({
    where: { tournamentId_userId: { tournamentId: id, userId: me.id } },
    select: { isActive: true, disqualified: true, disqualifiedNote: true }
  })
  if (!optIn?.isActive) return { phase: 'NOT_ENTERED' }
  if (optIn.disqualified) return { phase: 'DISQUALIFIED', note: optIn.disqualifiedNote }

  if (t.status === 'COMPLETE') {
    const place = (Array.isArray(t.finalPlacementsJson) ? t.finalPlacementsJson : []).find(p => p.userId === me.id)
    return { phase: 'FINISHED', place: place?.place || null }
  }
  if (t.status === 'CANCELLED') return { phase: 'CANCELLED' }
  if (['DRAFT', 'OPT_IN_OPEN', 'OPT_IN_CLOSED'].includes(t.status)) return { phase: 'REGISTERED' }

  const open = await prisma.ogGtoonTournamentMatch.findFirst({
    where: { tournamentId: id, lockedAt: null, status: { in: ['PENDING', 'IN_PROGRESS'] }, OR: [{ playerAUserId: me.id }, { playerBUserId: me.id }] },
    include: { playerA: { select: { id: true, username: true } }, playerB: { select: { id: true, username: true } } }
  })
  if (open) {
    const side = open.playerAUserId === me.id ? 'A' : 'B'
    const series = await readSeries(open, t)
    const games = await prisma.ogGtoonMatch.findMany({
      where: { tournamentMatchId: open.id, endedAt: { not: null } },
      orderBy: { startedAt: 'asc' }, select: { id: true, outcome: true, winnerUserId: true }
    })
    // Under the async rules a Start never expires, and there can be a game waiting on somebody for days.
    const asyncRules = !!open.asyncRules
    const game = asyncRules ? await gameSummaryFor(open.id, me.id) : null
    const mineReady = side === 'A' ? open.readyAAt : open.readyBAt
    const theirsReady = side === 'A' ? open.readyBAt : open.readyAAt
    const deckProblem = open.deckProblemSide
      ? (open.deckProblemSide === 'BOTH' ? 'both' : (open.deckProblemSide === side ? 'you' : 'opponent'))
      : null
    return {
      phase: open.needsAdmin ? 'NEEDS_ADMIN' : 'OPEN',
      needsAdminReason: open.needsAdmin ? open.needsAdminReason : null,
      match: {
        id: open.id, stage: open.stage, roundNumber: open.roundNumber, label: await ogtRoundLabel(open),
        bestOf: open.bestOf, dueAt: open.dueAt, live: asyncRules ? !!game : !!open.liveMatchId, requiresWinner: open.requiresWinner,
        asyncRules, baseDueAt: open.baseDueAt, extensions: open.extensions || 0, serverNow: new Date(),
        game, deckProblem,
        opponent: side === 'A' ? open.playerB : open.playerA,
        you: { userId: me.id, wins: side === 'A' ? series.winsA : series.winsB },
        opponentWins: side === 'A' ? series.winsB : series.winsA,
        ties: series.ties, gamesCounted: series.gamesCounted, nextGameNumber: series.nextGameNumber,
        voided: series.voided, decided: series.decided,
        myReady: asyncRules ? !!mineReady : isFresh(mineReady),
        opponentReady: asyncRules ? !!theirsReady : isFresh(theirsReady),
        games: games.map(g => ({ id: g.id, result: g.outcome === 'INCOMPLETE' ? 'VOID' : g.outcome === 'TIE' ? 'TIE' : g.winnerUserId === me.id ? 'WIN' : 'LOSS' }))
      }
    }
  }

  const last = await prisma.ogGtoonTournamentMatch.findFirst({
    where: { tournamentId: id, status: { in: ['COMPLETE', 'BYE'] }, OR: [{ playerAUserId: me.id }, { playerBUserId: me.id }] },
    orderBy: [{ roundNumber: 'desc' }, { completedAt: 'desc' }],
    include: { playerA: { select: { username: true } }, playerB: { select: { username: true } } }
  })
  // The most recent decided pairing, so the page (and the post-game card) can say how it ended.
  let lastResult = null
  if (last && last.status === 'COMPLETE') {
    const isA = last.playerAUserId === me.id
    lastResult = {
      matchId: last.id, stage: last.stage, roundNumber: last.roundNumber, resolution: last.resolution,
      result: last.outcome === 'TIE' ? 'DRAW' : last.winnerUserId === me.id ? 'WIN' : 'LOSS',
      you: isA ? last.winsA : last.winsB, opponentWins: isA ? last.winsB : last.winsA,
      opponentName: (isA ? last.playerB : last.playerA)?.username || 'your opponent'
    }
  }
  if (last?.stage === 'BRACKET' && last.status === 'COMPLETE' && last.winnerUserId && last.winnerUserId !== me.id) {
    return { phase: 'ELIMINATED', lastResult }
  }
  if (last?.status === 'BYE') return { phase: 'BYE', lastResult }
  return { phase: 'WAITING', lastResult }
})
