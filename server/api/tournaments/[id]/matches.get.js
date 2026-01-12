import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })

  const tournament = await prisma.gtoonTournament.findUnique({
    where: { id: String(id) },
    select: { id: true }
  })
  if (!tournament) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const matches = await prisma.gtoonTournamentMatch.findMany({
    where: { tournamentId: tournament.id },
    include: {
      playerA: { select: { id: true, username: true } },
      playerB: { select: { id: true, username: true } }
    },
    orderBy: [
      { stage: 'asc' },
      { roundNumber: 'asc' },
      { tableNumber: 'asc' }
    ]
  })

  const grouped = { SWISS: {}, BRACKET: {} }

  for (const match of matches) {
    const needsTiebreak =
      match.stage === 'BRACKET' &&
      match.requiresWinner &&
      match.outcome === 'TIE' &&
      !match.winnerUserId

    const entry = {
      id: match.id,
      stage: match.stage,
      roundNumber: match.roundNumber,
      tableNumber: match.tableNumber,
      status: match.status,
      playerAUserId: match.playerAUserId,
      playerBUserId: match.playerBUserId,
      playerAName: match.playerA?.username || 'Unknown',
      playerBName: match.status === 'BYE' ? 'BYE' : (match.playerB?.username || 'Unknown'),
      winsA: match.winsA,
      winsB: match.winsB,
      ties: match.ties,
      gamesCounted: match.gamesCounted,
      outcome: match.outcome,
      winnerUserId: match.winnerUserId,
      requiresWinner: match.requiresWinner,
      needsTiebreak,
      tiebreakNotes: match.tiebreakNotes,
      suddenDeathGamesCounted: match.suddenDeathGamesCounted
    }

    if (!grouped[match.stage][match.roundNumber]) {
      grouped[match.stage][match.roundNumber] = []
    }
    grouped[match.stage][match.roundNumber].push(entry)
  }

  return grouped
})
