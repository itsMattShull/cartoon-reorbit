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
// ── Why SQL table names and not Prisma delegates ──────────────────────────────────────────
// Both match tables carry an index on
//   (LEAST(player1UserId, player2UserId), GREATEST(...), pointsAwardedAt) WHERE pointsAwardedAt IS NOT NULL
// which exists precisely to make this count cheap. A Postgres expression index only matches a
// query written with the SAME expression, so the natural Prisma form —
//   OR: [{ p1: a, p2: b }, { p1: b, p2: a }]
// — cannot use it, and EXPLAIN confirms it falls back to scanning the partial index on the
// timestamp alone and filtering the rest. Since this count runs inside the award transaction
// on every paying match, it is written as raw SQL in the LEAST/GREATEST form the index is
// built for. Table names come from this literal list, never from a request; every value is
// still bound.
//
// duelRuntime's assertSpec() checks each name against a real Prisma delegate at boot, so a
// typo here fails at startup rather than at payout.
export const DUEL_PAIR_SCOPE = ['EdRpsMatch', 'PokemonBattleMatch']

/** The Prisma delegate name for a table, which is the model name with a lowercased initial. */
export const delegateFor = (table) => table.charAt(0).toLowerCase() + table.slice(1)
