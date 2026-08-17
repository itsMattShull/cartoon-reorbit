// server/utils/duelLeaderboard.js
//
// Win-count leaderboard shared by the duel games (Ed, Edd n Eddy RPS and Pokemon: Fire, Water,
// Grass!), shaped to the { allTime, monthly, weekly } contract that
// components/newsite/Leaderboards.vue expects from every game.
//
// server/utils/gameLeaderboard.js already opens with the reason this file exists: three games
// were each carrying a hand-rolled copy of the same board, and rather than add a fourth the
// shape moved into a helper. That helper assumes a score table though, and this is a win count
// over a match table, so it genuinely does not fit — hence a second shared shape rather than a
// second copy.
//
// ── The viewer row ────────────────────────────────────────────────────────────────────────
// The RPS board caches only the top 11 and then, for any signed-in viewer outside it, runs the
// FULL ranking query again — once per period, so three uncached aggregates per page view, each
// scanning the match table twice through its UNION ALL. That is the single most expensive
// thing either game does and it gets worse as the table grows.
//
// Here one cached payload carries both the top 11 AND a compact userId -> {rank, score, games}
// map, so a viewer row is a lookup rather than a query. The refill is also single-flighted
// through a Redis NX lock: without it, N requests arriving the moment the key expires each
// kick off their own refill.
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const CACHE_TTL = 1800 // 30 minutes
const LOCK_TTL = 30    // seconds a refill may hold the single-flight lock
const TOP_N = 11
// A cap on the ranked map so one enormous table cannot produce an enormous Redis value. Each
// entry carries the fields Leaderboards.vue renders for a row, so ~2000 is roughly 150KB.
// Players beyond this rank get the board without a personal row, which is the right thing to
// degrade: the top of the board is what everyone came for.
const MAP_LIMIT = 2000

const PERIOD_INTERVALS = { allTime: null, monthly: '30 days', weekly: '7 days' }

/**
 * One pass over the match table: each match contributes a row per player, so wins and games
 * come out of a single scan rather than a GROUP BY per metric.
 *
 * `table` is an identifier and therefore cannot be a bind parameter, so it is validated
 * against a literal allowlist by the caller and never interpolated from user input. Every
 * actual VALUE is still bound.
 */
function rankedRows(table, period, limit) {
  const interval = PERIOD_INTERVALS[period]
  const sql = `
    WITH participants AS (
      SELECT m."player1UserId" AS uid, (m."winnerUserId" = m."player1UserId") AS won
        FROM "${table}" m
       WHERE m."endedAt" IS NOT NULL
         AND m."endReason" = 'natural'
         AND m."player1UserId" <> m."player2UserId"
         AND ($2::interval IS NULL OR m."endedAt" >= NOW() - $2::interval)
      UNION ALL
      SELECT m."player2UserId" AS uid, (m."winnerUserId" = m."player2UserId") AS won
        FROM "${table}" m
       WHERE m."endedAt" IS NOT NULL
         AND m."endReason" = 'natural'
         AND m."player1UserId" <> m."player2UserId"
         AND ($2::interval IS NULL OR m."endedAt" >= NOW() - $2::interval)
    ),
    agg AS (
      SELECT uid,
             COUNT(*)::int                    AS games,
             COUNT(*) FILTER (WHERE won)::int AS wins
        FROM participants
       WHERE uid <> $1
       GROUP BY uid
    ),
    ranked AS (
      SELECT u."id" AS "userId", u."username", u."avatar",
             a.wins AS "score", a.games,
             (ROW_NUMBER() OVER (ORDER BY a.wins DESC, a.games ASC, u."username" ASC))::int AS rank
        FROM agg a
        JOIN "User" u ON u."id" = a.uid
       WHERE u."active" = true
         AND COALESCE(u."banned", false) = false
         AND a.wins > 0
    )
    SELECT * FROM ranked ORDER BY rank LIMIT $3;
  `
  return prisma.$queryRawUnsafe(sql, EXCLUDED_SYSTEM_USER_ID, interval, limit)
}

async function build(table) {
  const periods = await Promise.all(
    Object.keys(PERIOD_INTERVALS).map(p => rankedRows(table, p, MAP_LIMIT))
  )
  const out = {}
  Object.keys(PERIOD_INTERVALS).forEach((p, i) => {
    const rows = periods[i]
    const map = {}
    for (const r of rows) {
      // username and avatar are stored too, not just the rank: mergeViewerRow spreads this
      // straight into the rendered row, so a rank without a name renders as a blank entry.
      map[r.userId] = {
        rank: r.rank, score: r.score, games: r.games, username: r.username, avatar: r.avatar
      }
    }
    out[p] = { top: rows.slice(0, TOP_N), map }
  })
  return out
}

/**
 * @param {object} opts
 *   table     SQL table name — caller supplies a literal, never user input
 *   cacheKey  Redis key for this game's board
 *   userId    viewer, or null
 */
export async function getDuelWinLeaderboard({ table, cacheKey, userId }) {
  let payload
  try {
    const cached = await redis.get(cacheKey)
    if (cached) payload = JSON.parse(cached)
  } catch {}

  if (!payload) {
    let holdsLock = false
    try {
      holdsLock = Boolean(await redis.set(`${cacheKey}:lock`, '1', 'EX', LOCK_TTL, 'NX'))
    } catch {}

    if (holdsLock) {
      payload = await build(table)
      try { await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL) } catch {}
    } else {
      // Someone else is refilling. Give them a moment and reuse the result rather than running
      // a second full aggregate; if it still isn't there, build it — a slow board is better
      // than an empty one.
      await new Promise(r => setTimeout(r, 250))
      try {
        const cached = await redis.get(cacheKey)
        if (cached) payload = JSON.parse(cached)
      } catch {}
      if (!payload) payload = await build(table)
    }
  }

  const result = {}
  for (const p of Object.keys(PERIOD_INTERVALS)) {
    const { top = [], map = {} } = payload[p] || {}
    // A lookup, not a query: this is the whole point of caching the map alongside the top N.
    const hit = userId ? map[userId] : null
    const viewerRow = hit && !top.some(r => r.userId === userId) ? { userId, ...hit } : null
    result[p] = mergeViewerRow(top, viewerRow, userId)
  }
  return result
}
