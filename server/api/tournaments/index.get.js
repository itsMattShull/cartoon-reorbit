import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async () => {
  const tournaments = await prisma.gtoonTournament.findMany({
    orderBy: { optInStartAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      format: true,
      optInStartAt: true,
      optInEndAt: true,
      swissRounds: true,
      bestOf: true,
      maxSuddenDeathGames: true,
      finalizedAt: true,
      tournamentCompletedAt: true,
      winner: { select: { username: true } }
    }
  })

  const counts = await prisma.gtoonTournamentOptIn.groupBy({
    by: ['tournamentId'],
    where: { isActive: true },
    _count: { _all: true }
  })

  const countByTournament = new Map()
  for (const row of counts) {
    countByTournament.set(row.tournamentId, row._count._all)
  }

  return tournaments.map(t => ({
    ...t,
    optInCount: countByTournament.get(t.id) || 0,
    winnerUsername: t.winner?.username || null
  }))
})
