// server/utils/pokemonBattleConfig.js
//
// Cached reads of the Pokemon: Fire, Water, Grass! trainer roster and uploaded assets.
//
// Cached in-process on a short TTL for the same reason duelRuntime caches GameConfig: the
// alternative is a database read on every lobby subscribe and every room join, which is
// precisely the gToons Clash defect ("an unauthenticated DB amplification primitive") that the
// duel runtime was written to avoid. Nothing here may ever be called from inside a socket
// handler without going through this cache.
import { prisma as db } from '../prisma.js'

const TTL_MS = 60_000

// Only ever grows to the roster size, which is admin-controlled and capped on read.
const MAX_TRAINERS = 200

let cache = null
let cachedAt = 0
let inflight = null

/**
 * The active trainer roster plus a Set of valid ids.
 *
 * Single-flight: without `inflight`, a burst of lobby joins on a cold cache each issue their
 * own query. The Set is what the runtime validates against — a trainerId arriving over a
 * socket is attacker-controlled, and it is echoed to the OPPONENT's client in the match view,
 * so "is this a real trainer" has to be a membership test rather than a shape test.
 */
export async function getTrainerRoster() {
  const now = Date.now()
  if (cache && now - cachedAt < TTL_MS) return cache
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const rows = await db.pokemonBattleTrainer.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        take: MAX_TRAINERS,
        // Allowlisted select, never the whole row: this feeds a PUBLIC endpoint, so anything
        // added to the model later would otherwise start shipping to logged-out visitors.
        select: { id: true, name: true, imagePath: true, thumbPath: true, width: true, height: true }
      })
      cache = { list: rows, ids: new Set(rows.map(r => r.id)) }
      cachedAt = Date.now()
      return cache
    } catch (err) {
      console.error('[pokemonbattle] trainer roster read failed:', err)
      // Fail open with an EMPTY roster rather than throwing: a database blip should make
      // trainers unavailable, not make the game unjoinable.
      cache = cache || { list: [], ids: new Set() }
      cachedAt = Date.now()
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * Validates a client-supplied trainer id.
 *
 * `null` is allowed and means "no trainer" — the roster starts empty, so a player must be able
 * to play before any trainer exists. Anything else must be a real id from the active roster.
 */
export async function isTrainerId(id) {
  if (id === null || id === undefined || id === '') return true
  if (typeof id !== 'string' || id.length > 64) return false
  const { ids } = await getTrainerRoster()
  return ids.has(id)
}

/** Drops the cache so an admin edit shows up without waiting out the TTL. */
export function invalidateTrainerRoster() {
  cache = null
  cachedAt = 0
}
