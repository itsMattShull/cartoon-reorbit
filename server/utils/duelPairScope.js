// server/utils/duelPairScope.js
//
// Every duel-game match table that shares ONE per-pair daily award budget.
//
// This is the pair-limit analogue of COMBAT_POOL_GAME_NAMES in gamePoints.js, and it exists
// for the same reason: the constant has to be edited when a game is added, and forgetting
// costs real points.
//
// The shared daily cap already bounds how much any single player can earn. The pair limit does
// a different job — it bounds how much any single PAIR of accounts can pay each other, so that
// a farmer has to acquire distinct partners rather than simply replay the same alt. Give each
// game its own budget and that protection halves per game added: the same two accounts trade
// their quota in RPS, then trade it again in Pokemon.
//
// Listed as Prisma delegate names because that is what the runtime indexes the client with.
// duelRuntime's assertSpec() verifies each one exists and that a game's own delegate is
// present, so a typo fails at boot rather than at payout.
export const DUEL_PAIR_SCOPE = ['edRpsMatch', 'pokemonBattleMatch']
