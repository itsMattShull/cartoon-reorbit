// server/utils/ogGtoonTutorialDeck.js
//
// Resolves the tutorial's two scripted decks (see ogGtoonTutorialScript.js) from the imported
// original gToons. Kept apart from ogGtoonsTutorial.js so that module — like practice — never
// imports Prisma; the only database access is this one read, injected as `deps.loadDecks`.
import { prisma as db } from '../prisma.js'
import { toSnapshotCard } from './ogGtoonMatchCore.js'
import { TUTORIAL_CARD_NAMES, TUTORIAL_USER_DECK, TUTORIAL_BOT_DECK } from './ogGtoonTutorialScript.js'

/**
 * Builds { user, bot } 12-card snapshots from ctoon rows keyed by card name, or null if any card
 * the script names is missing (the tutorial then reports itself unavailable rather than running
 * a different game from the one its steps describe).
 */
export function buildTutorialDecks(byName) {
  const make = (names) => {
    const deck = names.map((name, position) => {
      const ctoon = byName.get(name)
      return ctoon ? toSnapshotCard(ctoon, position) : null
    })
    return deck.some(c => !c) ? null : deck
  }
  const user = make(TUTORIAL_USER_DECK)
  const bot = make(TUTORIAL_BOT_DECK)
  return user && bot ? { user, bot } : null
}

export async function loadTutorialDecks() {
  const rows = await db.ctoon.findMany({
    where: { isOgGtoon: true, name: { in: TUTORIAL_CARD_NAMES } },
    orderBy: { createdAt: 'asc' }
  })
  const byName = new Map()
  for (const r of rows) if (!byName.has(r.name)) byName.set(r.name, r) // the oldest row of a name wins
  return buildTutorialDecks(byName)
}
