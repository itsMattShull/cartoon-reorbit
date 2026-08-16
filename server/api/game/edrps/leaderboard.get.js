// Ed, Edd n Eddy RPS leaderboard — ranked by match wins.
//
// The ~80 lines of raw SQL that used to live here moved to server/utils/duelLeaderboard.js
// when the Pokemon game needed the same board, rather than being copied a second time — the
// same call gameLeaderboard.js's header describes making at copy #4.
//
// That move also fixed the expensive part. This endpoint used to cache only the top 11, then
// re-run the FULL ranking query for any signed-in viewer outside it, once per period: three
// uncached aggregates per page view, each scanning the match table twice. The shared version
// caches a rank map alongside the top rows, so the viewer's row is a lookup, and single-flights
// the refill so an expiring key cannot start a stampede.
//
// Only matches played to a natural finish count, so quitting a losing match can never pad a
// record.
import { defineEventHandler } from 'h3'
import { getDuelWinLeaderboard } from '@/server/utils/duelLeaderboard'

export default defineEventHandler((event) =>
  getDuelWinLeaderboard({
    // A literal, never anything derived from the request — it is interpolated as a SQL
    // identifier, which cannot be a bind parameter.
    table: 'EdRpsMatch',
    // Bumped to v2: the cached value's shape changed from three arrays to { top, map }, and a
    // v1 payload left over from the previous deploy would otherwise be read as an empty board
    // for up to 30 minutes.
    cacheKey: 'edrps:leaderboard:v2',
    userId: event.context.userId || null
  })
)
