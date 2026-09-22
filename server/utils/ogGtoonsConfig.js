// server/utils/ogGtoonsConfig.js
//
// Cached read of the original gToons (2002 game) feature-visibility switches, mirroring
// server/utils/pokemonBattleAssets.js's TTL-cache pattern for the same reason: this is read on
// nearly every REST call and socket action for the feature, and a Redis/Postgres round-trip per
// call would cost more than the query it replaces.
import { prisma as db } from '../prisma.js'

const TTL_MS = 60_000

let cache = null
let cachedAt = 0
let inflight = null

async function load() {
  try {
    const row = await db.gameConfig.findUnique({
      where: { gameName: 'OgGtoons' },
      select: {
        ogGtoonsMatchmakingEnabled: true,
        ogGtoonsGameEnabled: true,
        ogGtoonsDeckBuildingEnabled: true,
        ogGtoonsLeaderboardEnabled: true
      }
    })
    return {
      // Only an explicit `true` enables a section. This feature is still being rolled out, so a
      // missing row or a database that predates the migration must leave every section hidden
      // rather than silently switching it on.
      matchmakingEnabled: row?.ogGtoonsMatchmakingEnabled === true,
      gameEnabled: row?.ogGtoonsGameEnabled === true,
      deckBuildingEnabled: row?.ogGtoonsDeckBuildingEnabled === true,
      leaderboardEnabled: row?.ogGtoonsLeaderboardEnabled === true
    }
  } catch (err) {
    console.error('[ogGtoons] config read failed:', err)
    return { matchmakingEnabled: false, gameEnabled: false, deckBuildingEnabled: false, leaderboardEnabled: false }
  }
}

/** { matchmakingEnabled, gameEnabled, deckBuildingEnabled, leaderboardEnabled } */
export async function getOgGtoonsConfig() {
  const now = Date.now()
  if (cache && now - cachedAt < TTL_MS) return cache
  if (inflight) return inflight

  inflight = (async () => {
    cache = await load()
    cachedAt = Date.now()
    inflight = null
    return cache
  })()
  return inflight
}

/** Drops the cache so an admin toggle takes effect without waiting out the TTL. */
export function invalidateOgGtoonsConfigCache() {
  cache = null
  cachedAt = 0
}
