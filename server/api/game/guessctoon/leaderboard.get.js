import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'

const CACHE_KEY = 'guessctoon:leaderboard:v1'
const CACHE_TTL = 1800 // 30 minutes
const EXCLUDE_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

// Safety valve on the cached payload. A viewer ranked below this simply gets no personal
// row, which is a far better failure mode than an unbounded cache entry.
const MAX_RANKED = 5000

// Unlike the other games' leaderboards, the FULL ranked list is cached rather than just the
// top 11. Those endpoints run a second, uncached, full GROUP BY (three times — once per
// period) for every viewer outside the top 11, which is an unbounded aggregation over the
// whole score table on every page view. Caching the ranked list instead makes the viewer's
// rank an in-memory lookup and takes Postgres out of the request entirely on a cache hit.
//
// Ranking is by best streak descending, tie-broken by who reached it first. Streaks are
// small integers, so ties are the common case, not the exception — an alphabetical
// tie-break (what the other boards use) would leave hundreds of players sorted by username
// and make the board unwinnable for anyone late in the alphabet.
//
// Plays are unlimited, so only runs marked `counted` — the first few each day, per the
// admin-configured cap — are eligible here. Practice runs are recorded but never ranked.
//
// `suspicious` runs are excluded rather than deleted: a run whose answer cadence looks
// machine-generated keeps its row for auditing but does not occupy a leaderboard slot.

function rankedAllTime () {
  return prisma.$queryRaw`
    WITH best AS (
      SELECT DISTINCT ON (s."userId")
             s."userId", s."streak", s."createdAt"
      FROM "GuessCtoonScore" s
      WHERE s."suspicious" = false
        AND s."counted" = true
      ORDER BY s."userId", s."streak" DESC, s."createdAt" ASC
    )
    SELECT u."id" AS "userId", u."username", u."avatar", b."streak"::int AS "score",
           (ROW_NUMBER() OVER (ORDER BY b."streak" DESC, b."createdAt" ASC))::int AS rank
    FROM best b
    JOIN "User" u ON u."id" = b."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND b."userId" <> ${EXCLUDE_ID}
    ORDER BY rank
    LIMIT ${MAX_RANKED};
  `
}

function rankedSince (days) {
  return prisma.$queryRaw`
    WITH best AS (
      SELECT DISTINCT ON (s."userId")
             s."userId", s."streak", s."createdAt"
      FROM "GuessCtoonScore" s
      WHERE s."suspicious" = false
        AND s."counted" = true
        AND s."createdAt" >= NOW() - (${days} || ' days')::interval
      ORDER BY s."userId", s."streak" DESC, s."createdAt" ASC
    )
    SELECT u."id" AS "userId", u."username", u."avatar", b."streak"::int AS "score",
           (ROW_NUMBER() OVER (ORDER BY b."streak" DESC, b."createdAt" ASC))::int AS rank
    FROM best b
    JOIN "User" u ON u."id" = b."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND b."userId" <> ${EXCLUDE_ID}
    ORDER BY rank
    LIMIT ${MAX_RANKED};
  `
}

async function fetchRanked () {
  const [allTime, monthly, weekly] = await Promise.all([
    rankedAllTime(),
    rankedSince('30'),
    rankedSince('7')
  ])
  return { allTime, monthly, weekly }
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId || null

  let ranked
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) ranked = JSON.parse(cached)
  } catch {}

  if (!ranked) {
    ranked = await fetchRanked()
    try {
      await redis.set(CACHE_KEY, JSON.stringify(ranked), 'EX', CACHE_TTL)
    } catch {}
  }

  const result = {}
  for (const period of ['allTime', 'monthly', 'weekly']) {
    const rows = Array.isArray(ranked[period]) ? ranked[period] : []
    const top11 = rows.slice(0, 11)
    const viewerRow = userId && !top11.some(r => r.userId === userId)
      ? rows.find(r => r.userId === userId) || null
      : null
    result[period] = mergeViewerRow(top11, viewerRow, userId)
  }

  return result
})
