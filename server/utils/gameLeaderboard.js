// Shared arcade-game leaderboard: top 11 for all-time / monthly / weekly, with the viewer's
// own row merged in if they didn't make the cut.
//
// Tower Stack, ReOrbit Match and ReOrbit Memory each carry a ~90-line hand-rolled copy of this
// that differs only in table name, score column, sort direction and cache key — and each
// re-declares the excluded system-account UUID that server/utils/economyValuation.js already
// exports. Rather than add a fourth verbatim copy for Flappy Powerpuff, the shape lives here.
// The existing three are untouched; they can move over independently.
//
// Two things this does that the hand-rolled copies do not:
//  - The viewer's rank is derived from two indexed aggregates instead of materializing and
//    sorting a full GROUP BY + ROW_NUMBER() CTE over every score row in the table, three times
//    per request, for every logged-in player outside the top 11 (i.e. almost all of them).
//  - That viewer row is cached too. Only the top 11 was cached before, which is the cheap half.
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const TOP_TTL = 1800 // 30 min
const VIEWER_TTL = 120

const PERIODS = ['allTime', 'monthly', 'weekly']
const PERIOD_DAYS = { allTime: null, monthly: 30, weekly: 7 }

// Table and column names are compile-time constants supplied by the caller, never user input;
// every value that varies at runtime is bound as a parameter.
// `AND s."createdAt" >= NOW() - interval`, with the day count bound to the given placeholder.
function dateFilterAt(days, paramIndex) {
  return days === null ? '' : `AND s."createdAt" >= NOW() - ($${paramIndex} || ' days')::interval`
}

function buildTop11(table, scoreColumn, direction, days) {
  const order = direction === 'asc' ? 'ASC' : 'DESC'
  const agg = direction === 'asc' ? 'MIN' : 'MAX'
  const dateFilter = dateFilterAt(days, 2)
  const sql = `
    SELECT u."id" AS "userId", u."username", u."avatar", ${agg}(s."${scoreColumn}")::int AS "score",
           (ROW_NUMBER() OVER (ORDER BY ${agg}(s."${scoreColumn}") ${order}, u."username" ASC))::int AS rank
    FROM "${table}" s
    JOIN "User" u ON u."id" = s."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND s."userId" <> $1
      ${dateFilter}
    GROUP BY u."id", u."username", u."avatar"
    ORDER BY rank
    LIMIT 11;
  `
  return days === null
    ? prisma.$queryRawUnsafe(sql, EXCLUDED_SYSTEM_USER_ID)
    : prisma.$queryRawUnsafe(sql, EXCLUDED_SYSTEM_USER_ID, String(days))
}

// The viewer's best, then their rank as "how many players beat it, plus one". Two index-only
// aggregates instead of ranking the entire player base to read one row out of it.
async function buildViewerRow(table, scoreColumn, direction, days, userId) {
  const better = direction === 'asc' ? '<' : '>'
  const agg = direction === 'asc' ? 'MIN' : 'MAX'

  const bestSql = `
    SELECT ${agg}(s."${scoreColumn}")::int AS "score", u."username", u."avatar"
    FROM "${table}" s
    JOIN "User" u ON u."id" = s."userId"
    WHERE s."userId" = $1
      AND u."active" = true
      AND COALESCE(u."banned", false) = false
      ${dateFilterAt(days, 2)}
    GROUP BY u."username", u."avatar";
  `
  const bestRows = days === null
    ? await prisma.$queryRawUnsafe(bestSql, userId)
    : await prisma.$queryRawUnsafe(bestSql, userId, String(days))
  const best = bestRows?.[0]
  if (!best || best.score === null) return null

  const rankSql = `
    SELECT (COUNT(*) + 1)::int AS rank FROM (
      SELECT s."userId"
      FROM "${table}" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE u."active" = true
        AND COALESCE(u."banned", false) = false
        AND s."userId" <> $1
        AND s."userId" <> $2
        ${dateFilterAt(days, 4)}
      GROUP BY s."userId"
      HAVING ${agg}(s."${scoreColumn}") ${better} $3
    ) beaten;
  `
  const args = days === null
    ? [EXCLUDED_SYSTEM_USER_ID, userId, best.score]
    : [EXCLUDED_SYSTEM_USER_ID, userId, best.score, String(days)]
  const rankRows = await prisma.$queryRawUnsafe(rankSql, ...args)

  return {
    userId,
    username: best.username,
    avatar: best.avatar,
    score: best.score,
    rank: rankRows?.[0]?.rank ?? null
  }
}

/**
 * @param {object} opts
 * @param {string} opts.table          Prisma model's table name, e.g. 'FlappyPowerpuffScore'
 * @param {string} opts.scoreColumn    e.g. 'score'
 * @param {'asc'|'desc'} opts.direction 'asc' when lower is better (ReOrbit Memory's moves)
 * @param {string} opts.cacheKey       MUST be unique per game — a copy-pasted key silently
 *                                     serves another game's board for the whole TTL.
 * @param {string|null} opts.userId
 */
export async function getGameLeaderboard({ table, scoreColumn = 'score', direction = 'desc', cacheKey, userId }) {
  let top
  try {
    const cached = await redis.get(cacheKey)
    if (cached) top = JSON.parse(cached)
  } catch {}

  if (!top) {
    const [allTime, monthly, weekly] = await Promise.all(
      PERIODS.map(p => buildTop11(table, scoreColumn, direction, PERIOD_DAYS[p]))
    )
    top = { allTime, monthly, weekly }
    try { await redis.set(cacheKey, JSON.stringify(top), 'EX', TOP_TTL) } catch {}
  }

  const result = {}
  for (const period of PERIODS) {
    const rows = top[period]
    let viewerRow = null
    if (userId && !rows.some(r => r.userId === userId)) {
      const vKey = `${cacheKey}:viewer:${period}:${userId}`
      try {
        const cached = await redis.get(vKey)
        if (cached) viewerRow = JSON.parse(cached)
      } catch {}
      if (!viewerRow) {
        try {
          viewerRow = await buildViewerRow(table, scoreColumn, direction, PERIOD_DAYS[period], userId)
          if (viewerRow) {
            try { await redis.set(vKey, JSON.stringify(viewerRow), 'EX', VIEWER_TTL) } catch {}
          }
        } catch {}
      }
    }
    result[period] = mergeViewerRow(rows, viewerRow, userId)
  }

  return result
}
