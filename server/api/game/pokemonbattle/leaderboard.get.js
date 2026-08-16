// Pokemon: Fire, Water, Grass! leaderboard — ranked by match wins.
//
// The shape lives in server/utils/duelLeaderboard.js and is shared with the RPS board. Only
// matches played to a natural finish count, so quitting a losing match can never pad a record.
import { defineEventHandler } from 'h3'
import { getDuelWinLeaderboard } from '@/server/utils/duelLeaderboard'

export default defineEventHandler((event) =>
  getDuelWinLeaderboard({
    // A literal, never anything derived from the request — it is interpolated as a SQL
    // identifier, which cannot be a bind parameter.
    table: 'PokemonBattleMatch',
    cacheKey: 'pokemonbattle:leaderboard:v1',
    userId: event.context.userId || null
  })
)
