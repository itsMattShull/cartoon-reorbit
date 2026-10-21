// GET /api/game/oggtoons/tournaments/:id/standings — Swiss / bracket records, best first.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { cachedJson } from '@/server/utils/cache'
import { ogtRequireUser, ogtRequireEnabled, ogtId } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)
  const rows = await cachedJson(`og-tournament:${id}:standings`, 15, async () => {
    if (!(await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true } }))) return null
    const records = await prisma.ogGtoonTournamentPlayerRecord.findMany({
      where: { tournamentId: id },
      include: { user: { select: { id: true, username: true } } },
      orderBy: [{ points: 'desc' }, { opponentMatchWinPct: 'desc' }, { gameWinPct: 'desc' }, { userId: 'asc' }]
    })
    const dq = await prisma.ogGtoonTournamentOptIn.findMany({ where: { tournamentId: id, disqualified: true }, select: { userId: true } })
    const dqSet = new Set(dq.map(d => d.userId))
    return records.map(r => ({
      userId: r.userId, username: r.user?.username || 'Unknown', disqualified: dqSet.has(r.userId),
      swissWins: r.swissWins, swissLosses: r.swissLosses, swissTies: r.swissTies, swissByes: r.swissByes,
      bracketWins: r.bracketWins, bracketLosses: r.bracketLosses, points: r.points,
      opponentMatchWinPct: r.opponentMatchWinPct, gameWinPct: r.gameWinPct
    }))
  })
  if (!rows) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  return rows
})
