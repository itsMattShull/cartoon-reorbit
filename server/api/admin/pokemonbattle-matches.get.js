// Admin log of Pokemon: Fire, Water, Grass! matches.
//
// Identical row shape to the RPS log — both tables are written by the same shared runtime — so
// the query shape lives in server/utils/duelMatchLog.js and this is the delegate plus the
// trainer-name resolution that is specific to this game.
import { defineEventHandler, getQuery } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { listDuelMatches } from '@/server/utils/duelMatchLog'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const result = await listDuelMatches(db.pokemonBattleMatch, getQuery(event))

  // The stored character is a trainer id, not a readable name. Resolved in ONE query for the
  // whole page rather than per row, and including retired trainers — a match that used a
  // trainer since removed must still name it.
  const ids = [...new Set(result.matches.flatMap(m => [m.player1Character, m.player2Character]).filter(Boolean))]
  const names = new Map()
  if (ids.length) {
    const rows = await db.pokemonBattleTrainer.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true }
    })
    for (const r of rows) names.set(r.id, r.name)
  }

  return {
    ...result,
    matches: result.matches.map(m => ({
      ...m,
      player1Character: m.player1Character ? (names.get(m.player1Character) || 'unknown') : '—',
      player2Character: m.player2Character ? (names.get(m.player2Character) || 'unknown') : '—'
    }))
  }
})
