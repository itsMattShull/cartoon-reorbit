// GET /api/game/oggtoons/tournaments/:id/my-deck — the deck the player locked, card by card, with
// which cards (if any) are no longer valid and what they could be replaced with.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { loadLockedDeckForGame } from '@/server/utils/ogGtoonTournamentLive'
import { ogtRequireUser, ogtRequireEnabled, ogtId } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)
  const optIn = await prisma.ogGtoonTournamentOptIn.findUnique({ where: { tournamentId_userId: { tournamentId: id, userId: me.id } } })
  if (!optIn || !optIn.isActive) throw createError({ statusCode: 404, statusMessage: 'You have not entered this tournament' })

  const snapshot = Array.isArray(optIn.deckSnapshotJson) ? optIn.deckSnapshotJson : []
  const check = await loadLockedDeckForGame(me.id, snapshot)
  const ctoons = await prisma.ctoon.findMany({
    where: { id: { in: snapshot.map(s => s.ctoonId) } },
    select: { id: true, name: true, assetPath: true, gtoonColor: true, gtoonValue: true }
  })
  const byId = new Map(ctoons.map(c => [c.id, c]))
  const flagged = new Set([...check.missing, ...check.moved])
  return {
    valid: check.valid,
    sourceDeckId: optIn.sourceDeckId,
    repairCount: optIn.repairCount,
    cards: snapshot
      .slice().sort((a, b) => a.position - b.position)
      .map(s => ({
        position: s.position, ctoonId: s.ctoonId, name: byId.get(s.ctoonId)?.name || 'Unknown',
        assetPath: byId.get(s.ctoonId)?.assetPath || null, color: byId.get(s.ctoonId)?.gtoonColor || null,
        value: byId.get(s.ctoonId)?.gtoonValue ?? null,
        problem: check.missing.includes(s.position) ? 'MISSING' : check.moved.includes(s.position) ? 'MOVED' : null
      })),
    flaggedPositions: [...flagged]
  }
})
