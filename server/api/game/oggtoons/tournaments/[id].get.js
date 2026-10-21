// GET /api/game/oggtoons/tournaments/:id — one tournament, with its prizes spelled out.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { cachedJson } from '@/server/utils/cache'
import { ogtRequireUser, ogtRequireEnabled, ogtId, ogtPrizeView } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)

  const pub = await cachedJson(`og-tournament:${id}`, 15, async () => {
    const t = await prisma.ogGtoonTournament.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, status: true, format: true, optInStartAt: true, optInEndAt: true,
        swissRoundsPlanned: true, bestOf: true, roundWindowHours: true, minEntrantsTop8Prize: true,
        finalPlacementsJson: true, winnerUserId: true, tournamentCompletedAt: true, firstPrizeJson: true, top8PrizeJson: true,
        winner: { select: { username: true } }
      }
    })
    if (!t) return null
    const [optInCount, round, first, top8] = await Promise.all([
      prisma.ogGtoonTournamentOptIn.count({ where: { tournamentId: id, isActive: true } }),
      prisma.ogGtoonTournamentRound.findFirst({ where: { tournamentId: id }, orderBy: [{ openedAt: 'desc' }] }),
      ogtPrizeView(t.firstPrizeJson),
      ogtPrizeView(t.top8PrizeJson)
    ])
    const { firstPrizeJson, top8PrizeJson, winner, ...rest } = t
    return {
      ...rest, optInCount, winnerUsername: winner?.username || null,
      currentRound: round ? { stage: round.stage, roundNumber: round.roundNumber, dueAt: round.dueAt } : null,
      prizes: { first, top8 }
    }
  })
  if (!pub) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })

  const optIn = await prisma.ogGtoonTournamentOptIn.findUnique({
    where: { tournamentId_userId: { tournamentId: id, userId: me.id } },
    select: { isActive: true, disqualified: true, disqualifiedNote: true, repairCount: true }
  })
  return { ...pub, meId: me.id, isOptedIn: !!optIn?.isActive, disqualified: !!optIn?.disqualified, disqualifiedNote: optIn?.disqualifiedNote || null }
})
