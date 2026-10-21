// GET /api/game/oggtoons/tournaments/:id/matches — every pairing, grouped by stage and round.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { cachedJson } from '@/server/utils/cache'
import { bracketRoundLabel } from '@/server/utils/tournamentCore'
import { ogtRequireUser, ogtRequireEnabled, ogtId } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)
  const data = await cachedJson(`og-tournament:${id}:matches`, 15, async () => {
    if (!(await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true } }))) return null
    const [rounds, matches] = await Promise.all([
      prisma.ogGtoonTournamentRound.findMany({ where: { tournamentId: id }, orderBy: [{ stage: 'asc' }, { roundNumber: 'asc' }] }),
      prisma.ogGtoonTournamentMatch.findMany({
        where: { tournamentId: id },
        include: { playerA: { select: { id: true, username: true } }, playerB: { select: { id: true, username: true } } },
        orderBy: [{ stage: 'asc' }, { roundNumber: 'asc' }, { tableNumber: 'asc' }]
      })
    ])
    const out = rounds.map(r => ({ id: r.id, stage: r.stage, roundNumber: r.roundNumber, dueAt: r.dueAt, openedAt: r.openedAt, label: null, matches: [] }))
    const byRound = new Map(out.map(r => [r.id, r]))
    for (const m of matches) {
      byRound.get(m.roundId)?.matches.push({
        id: m.id, tableNumber: m.tableNumber, status: m.status,
        playerAUserId: m.playerAUserId, playerBUserId: m.playerBUserId,
        playerAName: m.playerA?.username || 'Unknown', playerBName: m.status === 'BYE' ? 'BYE' : (m.playerB?.username || 'Unknown'),
        winsA: m.winsA, winsB: m.winsB, ties: m.ties, gamesCounted: m.gamesCounted,
        outcome: m.outcome, winnerUserId: m.winnerUserId, resolution: m.resolution,
        seedA: m.seedA, seedB: m.seedB, dueAt: m.dueAt, live: !!m.liveMatchId, needsAdmin: m.needsAdmin
      })
    }
    for (const r of out) r.label = r.stage === 'SWISS' ? `Swiss Round ${r.roundNumber}` : bracketRoundLabel(r.matches.length)
    return out
  })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  return data
})
