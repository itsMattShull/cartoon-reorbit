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

  const records = await prisma.gtoonTournamentPlayerRecord.findMany({
    where: { tournamentId: tournament.id },
    include: { user: { select: { id: true, username: true } } },
    orderBy: [
      { points: 'desc' },
      { opponentMatchWinPct: 'desc' },
      { gameWinPct: 'desc' },
      { userId: 'asc' }
    ]
  })

  return records.map(rec => ({
    userId: rec.userId,
    username: rec.user?.username || 'Unknown',
    swissWins: rec.swissWins,
    swissLosses: rec.swissLosses,
    swissTies: rec.swissTies,
    swissByes: rec.swissByes,
    bracketWins: rec.bracketWins,
    bracketLosses: rec.bracketLosses,
    points: rec.points,
    swissGameWins: rec.swissGameWins,
    swissGameLosses: rec.swissGameLosses,
    swissGameTies: rec.swissGameTies,
    opponentMatchWinPct: rec.opponentMatchWinPct,
    gameWinPct: rec.gameWinPct
  }))
})
