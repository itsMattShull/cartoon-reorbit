// server/utils/clashConfig.js
//
// Cached read of the gToons Clash "hide from players" switch, using the same TTL-cache pattern as
// server/utils/ogGtoonsConfig.js: the socket actions and REST routes it gates are hot paths, and
// a Postgres round-trip per call would cost more than the query it replaces.
import { prisma as db } from '../prisma.js'

const TTL_MS = 60_000

let cache = null
let cachedAt = 0
let inflight = null

async function load() {
  try {
    const row = await db.gameConfig.findUnique({
      where: { gameName: 'Clash' },
      select: { clashHidden: true }
    })
    // Only an explicit `false` shows the game. A missing row (nobody has opened the admin tab
    // yet) or a NULL column reads as hidden, matching the column's default of true.
    return { hidden: row?.clashHidden !== false }
  } catch (err) {
    console.error('[clash] config read failed:', err)
    // A read failure (e.g. the column's migration hasn't run) must not take a live game offline.
    return { hidden: false }
  }
}

/** { hidden } */
export async function getClashConfig() {
  const now = Date.now()
  if (cache && now - cachedAt < TTL_MS) return cache
  if (inflight) return inflight

  inflight = (async () => {
    try {
      cache = await load()
      cachedAt = Date.now()
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export async function isClashHidden() {
  return (await getClashConfig()).hidden
}

/** Drops the cache so an admin toggle takes effect without waiting out the TTL. */
export function invalidateClashConfigCache() {
  cache = null
  cachedAt = 0
}
