// Pokemon: Fire, Water, Grass! — PvP wiring.
//
// The runtime lives in server/utils/duelRuntime.js and is shared with the Ed, Edd n Eddy RPS
// game. This file is only what differs.
//
// There is deliberately NO concept of an AI, bot, CPU or practice opponent anywhere in this
// file or in the runtime it configures. The single-player mode is played entirely in the
// browser and can never reach the award path, because a match can only be constructed from two
// distinct resolveSocketUser() results in a server-generated room. That is a structural
// guarantee rather than a checked one, and tests/pokemonBattleWiring.test.js asserts the words
// stay absent so it cannot quietly stop being true.
import { createDuelRuntime } from './duelRuntime.js'
// `#lib/...` (package.json "imports", not a relative path) — same Nitro
// dev-bundler relative-depth bug as server/utils/asteroidEngine.js's import
// of lib/asteroidSim.js; see the comment there for the full explanation.
import { compareTypes, isType, clampConfig, TYPES, intermissionMs } from '#lib/pokemonBattle.js'
import { isTrainerId } from './pokemonBattleConfig.js'
import { getPokemonBattleAssets } from './pokemonBattleAssets.js'
import { DUEL_PAIR_SCOPE } from './duelPairScope.js'

const runtime = createDuelRuntime({
  key: 'pkmnb',
  dataNs: 'pkmnBattle',
  gameName: 'PokemonBattle',
  pointsMethod: 'Game - Pokemon Fire Water Grass',

  matchDelegate: 'pokemonBattleMatch',
  matchTable: 'PokemonBattleMatch',
  pairScopeTables: DUEL_PAIR_SCOPE,

  configSelect: {
    pokemonBattleRoundSeconds: true,
    pokemonBattleWinsNeeded: true,
    pokemonBattleMaxRounds: true,
    pokemonBattlePairDailyAwardLimit: true
  },
  readConfig: (g) => ({
    roundSeconds: g.pokemonBattleRoundSeconds,
    winsNeeded: g.pokemonBattleWinsNeeded,
    maxRounds: g.pokemonBattleMaxRounds,
    pairDailyAwardLimit: g.pokemonBattlePairDailyAwardLimit
  }),
  clampConfig,

  choiceCount: TYPES.length,
  compare: compareTypes,
  isChoice: isType,
  // Unlike the RPS game's static cast, a trainer is a row in an admin-managed table, so this
  // is a genuine async membership test against a 60s-cached roster. It is the only place a
  // client-supplied string is admitted into match state, and that string is echoed to the
  // OPPONENT in the match view — so it must be a real id, not merely a plausible one.
  isAvatarId: isTrainerId,

  // Served from the same 60s cache the public config endpoint uses, so an admin flipping the
  // switch takes effect within a minute without a socket handler ever hitting the database.
  isEnabled: async () => (await getPokemonBattleAssets()).config.enabled,

  // Per-result: a tie narrates fewer lines than a decisive round, and both need longer than
  // the RPS game's flat banner. lib/pokemonBattle.js keeps these in step with the text budget
  // they have to cover, and the wiring test recomputes that budget from the real move names.
  breakMs: intermissionMs,

  announce: {
    emoji: '(!)',
    label: 'Pokemon: Fire, Water, Grass!',
    url: 'https://www.cartoonreorbit.com/newsite/pokemonbattle'
  }
})

export const registerPokemonBattle = runtime.register
export const startPokemonBattleSweep = runtime.startSweep

// Exposed for tests.
export const __testing = runtime.__testing
