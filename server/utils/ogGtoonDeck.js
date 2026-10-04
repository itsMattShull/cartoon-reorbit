// server/utils/ogGtoonDeck.js
//
// Database-backed deck verification shared by PvP (ogGtoonsSocket.js) and Practice
// (ogGtoonsPractice.js). Kept out of ogGtoonMatchCore.js so that module stays free of Prisma.
import { prisma as db } from '../prisma.js'
import { toSnapshotCard } from './ogGtoonMatchCore.js'

/**
 * Re-verifies deck ownership + isOgGtoon + exactly 12 unique positions 0-11 straight from the
 * database (never trusting whatever the deck looked like at its last save) and returns the
 * ordered 12-card snapshot, or null if the deck is no longer valid.
 */
export async function loadVerifiedDeckSnapshot(userId, deckId) {
  if (!deckId || typeof deckId !== 'string') return null
  const deck = await db.ogGtoonDeck.findUnique({
    where: { id: deckId },
    include: { cards: { include: { ctoon: true }, orderBy: { position: 'asc' } } }
  })
  if (!deck || deck.userId !== userId) return null
  if (deck.cards.length !== 12) return null

  const positions = new Set()
  const ownedCtoonIds = new Set(
    (await db.userCtoon.findMany({
      where: { userId, ctoonId: { in: deck.cards.map(c => c.ctoonId) } },
      select: { ctoonId: true }
    })).map(r => r.ctoonId)
  )

  const ordered = new Array(12).fill(null)
  for (const dc of deck.cards) {
    if (positions.has(dc.position) || dc.position < 0 || dc.position > 11) return null
    positions.add(dc.position)
    if (!dc.ctoon?.isOgGtoon) return null
    if (!ownedCtoonIds.has(dc.ctoonId)) return null
    ordered[dc.position] = toSnapshotCard(dc.ctoon, dc.position)
  }
  if (positions.size !== 12 || ordered.some(c => !c)) return null
  return ordered
}
