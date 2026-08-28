// Ed, Edd n Eddy Rock Paper Scissors — PvP wiring.
//
// The runtime itself lives in server/utils/duelRuntime.js and is shared with
// server/utils/pokemonBattleRuntime.js. This file is only the part that is actually specific
// to this game; everything below the spec — identity, rooms, rounds, reconnect grace, the
// sweep, and the whole award path — is common code with one implementation.
//
// The exports and their signatures are unchanged, so server/socket-server.js needs no edit.
import { createDuelRuntime } from './duelRuntime.js'
// `#lib/...` (package.json "imports", not a relative path) — same Nitro
// dev-bundler relative-depth bug as server/utils/asteroidEngine.js's import
// of lib/asteroidSim.js; see the comment there for the full explanation.
import { compareHands, isHand, isCharacterId, clampConfig, HANDS, ROUND_BREAK_MS } from '#lib/edRps.js'
import { DUEL_PAIR_SCOPE } from './duelPairScope.js'

const runtime = createDuelRuntime({
  key: 'edrps',
  dataNs: 'edRps',
  gameName: 'EdRps',
  pointsMethod: 'Game - Ed, Edd n Eddy RPS',

  matchDelegate: 'edRpsMatch',
  matchTable: 'EdRpsMatch',
  pairScopeTables: DUEL_PAIR_SCOPE,

  configSelect: {
    edRpsRoundSeconds: true,
    edRpsWinsNeeded: true,
    edRpsMaxRounds: true,
    edRpsPairDailyAwardLimit: true
  },
  readConfig: (g) => ({
    roundSeconds: g.edRpsRoundSeconds,
    winsNeeded: g.edRpsWinsNeeded,
    maxRounds: g.edRpsMaxRounds,
    pairDailyAwardLimit: g.edRpsPairDailyAwardLimit
  }),
  clampConfig,

  choiceCount: HANDS.length,
  compare: compareHands,
  isChoice: isHand,
  // Static list, so this is synchronous — the factory awaits it either way, which is what lets
  // the Pokemon game validate against a DB-backed trainer roster instead.
  isAvatarId: (id) => isCharacterId(id),

  // Flat pause: this game shows a one-line result banner, not narrated battle text.
  breakMs: () => ROUND_BREAK_MS,

  announce: {
    emoji: '✊✋✌️',
    label: 'Ed, Edd n Eddy RPS',
    url: 'https://www.cartoonreorbit.com/newsite/edrps'
  }
})

export const registerEdRps = runtime.register
export const startEdRpsSweep = runtime.startSweep

// So server/utils/edRpsAiMatch.js can refuse to start a bot match under a user already mid-PvP-
// match, and vice versa — the two modes share a player but not a match table row.
export const hasLiveEdRpsMatch = runtime.hasLiveMatch

// Exposed for tests.
export const __testing = { ...runtime.__testing, HANDS }
