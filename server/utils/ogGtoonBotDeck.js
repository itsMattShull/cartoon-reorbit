// server/utils/ogGtoonBotDeck.js
//
// Resolves the practice bot's deck: one of the pre-defined decks for the chosen difficulty
// (ogGtoonBotDecks.js), built from the imported original gToons by NAME. Kept apart from
// ogGtoonsPractice.js so that module never imports Prisma; the only database access is this one read,
// injected there as `deps.loadBotDeck`.
import { prisma as db } from '../prisma.js'
import { toSnapshotCard } from './ogGtoonMatchCore.js'
import { botDecksFor, pickBotDeck } from './ogGtoonBotDecks.js'

/** { name, cards: [12 snapshot cards, position = list order] } from ctoon rows keyed by card name. */
export function buildBotDeckSnapshot(def, byName) {
  const cards = def.cards.map((name, position) => {
    const ctoon = byName.get(name)
    return ctoon ? toSnapshotCard(ctoon, position) : null
  })
  return cards.some(c => !c) ? null : { name: def.name, cards }
}

/**
 * A random pre-defined deck for `difficulty`, as 12 snapshot cards, or null when none of that
 * difficulty's decks can be built (cards not imported yet) — the caller then falls back to a copy of
 * the player's own deck. Decks with a missing card are skipped, so a partial import still works.
 */
export async function loadBotDeck(difficulty, rng = Math.random) {
  const names = [...new Set(botDecksFor(difficulty).flatMap(d => d.cards))]
  const rows = await db.ctoon.findMany({
    where: { isOgGtoon: true, name: { in: names } },
    orderBy: { createdAt: 'asc' }
  })
  const byName = new Map()
  for (const r of rows) if (!byName.has(r.name)) byName.set(r.name, r) // the oldest row of a name wins
  const def = pickBotDeck(difficulty, rng, new Set(byName.keys()))
  return def ? buildBotDeckSnapshot(def, byName) : null
}
