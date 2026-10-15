// server/utils/ogGtoonsConfig.js
//
// Cached read of the original gToons (2002 game) feature-visibility switches, mirroring
// server/utils/pokemonBattleAssets.js's TTL-cache pattern for the same reason: this is read on
// nearly every REST call and socket action for the feature, and a Redis/Postgres round-trip per
// call would cost more than the query it replaces.
import { prisma as db } from '../prisma.js'
import { normalizeRevealTiming, REVEAL_TIMING_DEFAULTS } from '../../utils/ogGtoonReveal.js'

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
        ogGtoonsLeaderboardEnabled: true,
        ogGtoonsPracticeEnabled: true,
        ogGtoonsGamesPageVisible: true,
        ogGtoonsRevealFirstMs: true,
        ogGtoonsRevealCardMs: true,
        ogGtoonsRevealEffectsMs: true,
        ogGtoonsRevealQuietMs: true
      }
    })
    return {
      // Only an explicit `true` enables a section. This feature is still being rolled out, so a
      // missing row or a database that predates the migration must leave every section hidden
      // rather than silently switching it on.
      matchmakingEnabled: row?.ogGtoonsMatchmakingEnabled === true,
      gameEnabled: row?.ogGtoonsGameEnabled === true,
      deckBuildingEnabled: row?.ogGtoonsDeckBuildingEnabled === true,
      leaderboardEnabled: row?.ogGtoonsLeaderboardEnabled === true,
      practiceEnabled: row?.ogGtoonsPracticeEnabled === true,
      // Independent of the four above, and opposite polarity on purpose — see this column's
      // schema comment. It isn't part of the rollout-safety gate those four exist for, so a
      // missing row (or a read failure) leaves it visible by default; only an explicit `false`
      // hides the Games page tile, and it never gates the feature itself.
      gamesPageVisible: row?.ogGtoonsGamesPageVisible !== false,
      // Pace of the one-card-at-a-time reveal; null columns fall back to the built-in defaults.
      reveal: normalizeRevealTiming({
        firstMs: row?.ogGtoonsRevealFirstMs, cardMs: row?.ogGtoonsRevealCardMs,
        effectsMs: row?.ogGtoonsRevealEffectsMs, quietMs: row?.ogGtoonsRevealQuietMs
      })
    }
  } catch (err) {
    console.error('[ogGtoons] config read failed:', err)
    return { matchmakingEnabled: false, gameEnabled: false, deckBuildingEnabled: false, leaderboardEnabled: false, practiceEnabled: false, gamesPageVisible: true, reveal: { ...REVEAL_TIMING_DEFAULTS } }
  }
}

/** { matchmakingEnabled, gameEnabled, deckBuildingEnabled, leaderboardEnabled, practiceEnabled, gamesPageVisible, reveal } */
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

/**
 * The reveal pacing right now, synchronously: whatever is cached (even if the TTL has lapsed — these are
 * tuning knobs, not switches), else the defaults. Every live match has already gone through
 * getOgGtoonsConfig(), so the cache is warm by the time a round resolves.
 */
export function peekRevealTiming() {
  return cache?.reveal ? { ...cache.reveal } : { ...REVEAL_TIMING_DEFAULTS }
}

/** Drops the cache so an admin toggle takes effect without waiting out the TTL. */
export function invalidateOgGtoonsConfigCache() {
  cache = null
  cachedAt = 0
}
