// server/utils/pokemonBattleAssets.js
//
// Cached read of the Pokemon: Fire, Water, Grass! uploaded art and music, and the allowlist
// that decides what a public response is permitted to contain.
import { prisma as db } from '../prisma.js'

const TTL_MS = 60_000

// Every slot the game knows about. A key stored in GameConfig.pokemonBattleAssets that is not
// listed here is dropped on read rather than served — so a slot removed from the code cannot
// keep being handed to clients, and a value written by some future path cannot smuggle a new
// key into the public payload.
export const ASSET_SLOTS = [
  'charizard-front', 'charizard-back',
  'blastoise-front', 'blastoise-back',
  'venusaur-front', 'venusaur-back',
  'logo', 'battlebg', 'menubg',
  'battlemusic', 'menumusic'
]

// Paths are re-validated on the way OUT, not merely on the way in. A poisoned or hand-edited
// row would otherwise reach an <img :src> or an <audio :src> directly, and a value like
// "//evil.example" or a data: URI is live the moment it lands in an attribute.
const PATH_RE = /^\/(images\/)?pokemonbattle\/[A-Za-z0-9._-]+\.(webp|png|gif|mp3|ogg|wav)$/

let cache = null
let cachedAt = 0
let inflight = null

function sanitize(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const slot of ASSET_SLOTS) {
    const entry = raw[slot]
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.path !== 'string' || !PATH_RE.test(entry.path)) continue
    out[slot] = {
      path: entry.path,
      width: Number.isFinite(entry.width) ? entry.width : null,
      height: Number.isFinite(entry.height) ? entry.height : null,
      animated: entry.animated === true
    }
  }
  return out
}

/**
 * { assets, config } for the public endpoint.
 *
 * In-process rather than Redis: this is two single-row reads, and a Redis round-trip per call
 * would cost more than the query it replaces. Nuxt runs two cluster workers, so the whole site
 * costs two reads a minute. The HTTP layer adds its own Cache-Control on top.
 */
export async function getPokemonBattleAssets() {
  const now = Date.now()
  if (cache && now - cachedAt < TTL_MS) return cache
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const row = await db.gameConfig.findUnique({
        where: { gameName: 'PokemonBattle' },
        // Allowlisted select. GameConfig carries 256 columns including every other game's
        // tuning; a bare findUnique here would ship all of them to a public, unauthenticated
        // endpoint. pointsPerWin and the pair limit are deliberately NOT selected — those ride
        // the authenticated socket instead.
        select: {
          pokemonBattleAssets: true,
          pokemonBattleRoundSeconds: true,
          pokemonBattleWinsNeeded: true,
          pokemonBattleMaxRounds: true
        }
      })
      cache = {
        assets: sanitize(row?.pokemonBattleAssets),
        config: {
          roundSeconds: row?.pokemonBattleRoundSeconds ?? null,
          winsNeeded: row?.pokemonBattleWinsNeeded ?? null,
          maxRounds: row?.pokemonBattleMaxRounds ?? null
        }
      }
      cachedAt = Date.now()
      return cache
    } catch (err) {
      console.error('[pokemonbattle] asset read failed:', err)
      cache = cache || { assets: {}, config: { roundSeconds: null, winsNeeded: null, maxRounds: null } }
      cachedAt = Date.now()
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Drops the cache so an admin upload shows up without waiting out the TTL. */
export function invalidateAssets() {
  cache = null
  cachedAt = 0
}
