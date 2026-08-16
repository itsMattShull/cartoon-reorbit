// Public config for Pokemon: Fire, Water, Grass! — uploaded art, music and the trainer roster.
//
// Public and unauthenticated on purpose: the single-player mode has to work logged out, and
// serving it here means a player who never opens the PvP lobby never opens a socket at all.
// The socket server is a single fork'd process, so keeping AI-only players off it entirely is
// the point.
//
// Deliberately NOT here, because this is readable by anyone:
//   * pointsPerWin, the daily cap, the per-pair award limit, any suppression threshold — all
//     of that rides the AUTHENTICATED socket (the runtime's `config` event) instead. None of
//     it is needed to render a match, and together it is a map of where the farming limits sit.
//   * anything not on the allowlist in server/utils/pokemonBattleAssets.js, and any trainer
//     column beyond id/name/image — both reads use an explicit select, so a column added to
//     either model later cannot start leaking to logged-out visitors by default.
//
// There is no per-id route to go with this. A whole-list GET has no IDOR surface; adding
// /trainer/[id] would create one for free and buy nothing.
import { defineEventHandler, setHeader } from 'h3'
import { getPokemonBattleAssets } from '@/server/utils/pokemonBattleAssets'
import { getTrainerRoster } from '@/server/utils/pokemonBattleConfig'
import { AI_TIERS, CONFIG_LIMITS, clampConfig } from '~~/lib/pokemonBattle'

export default defineEventHandler(async (event) => {
  const [{ assets, config }, roster] = await Promise.all([
    getPokemonBattleAssets(),
    getTrainerRoster()
  ])

  // Both reads are served from a 60s in-process cache, so this endpoint costs about two
  // queries a minute per Nuxt worker no matter how many players load it. The HTTP cache in
  // front absorbs nearly all of the rest. Uploaded filenames are timestamped, so a stale
  // window means a stale POINTER for at most a minute, never a stale asset.
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300')

  // Clamped here as well as in the runtime: the client sizes the HP bar and the round timer
  // from these, and an out-of-range value saved before a clamp existed should not reach it.
  const tuning = clampConfig({
    roundSeconds: config.roundSeconds,
    winsNeeded: config.winsNeeded,
    maxRounds: config.maxRounds
  })

  return {
    assets,
    trainers: roster.list,
    // Difficulty tiers are public rules — the AI runs in the browser and pays nothing, so
    // there is nothing here to protect.
    aiTiers: AI_TIERS.map(t => ({ id: t.id, label: t.label })),
    roundSeconds: tuning.roundSeconds,
    winsNeeded: tuning.winsNeeded,
    maxRounds: tuning.maxRounds,
    maxWinsNeeded: CONFIG_LIMITS.winsNeeded.max
  }
})
