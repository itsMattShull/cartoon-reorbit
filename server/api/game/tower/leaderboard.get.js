import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'

const CACHE_KEY  = 'towerstack:leaderboard:v1'
const CACHE_TTL  = 1800  // 30 minutes
const EXCLUDE_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

const PERIOD_FILTERS = {
  allTime: '',
  monthly: `AND s."createdAt" >= NOW() - INTERVAL '30 days'`,
  weekly:  `AND s."createdAt" >= NOW() - INTERVAL '7 days'`,
}

function rankedTop11(period) {
  const dateFilter = PERIOD_FILTERS[period]
  return prisma.$queryRawUnsafe(`
    SELECT u."id" AS "userId", u."username", u."avatar", MAX(s."score")::int AS "score",
           (ROW_NUMBER() OVER (ORDER BY MAX(s."score") DESC, u."username" ASC))::int AS rank
    FROM "TowerStackScore" s
    JOIN "User" u ON u."id" = s."userId"
    WHERE u."active" = true
      AND COALESCE(u."banned", false) = false
      AND s."userId" <> '${EXCLUDE_ID}'
      ${dateFilter}
    GROUP BY u."id", u."username", u."avatar"
    ORDER BY rank
    LIMIT 11;
  `)
}

function rankedViewer(period, userId) {
  const dateFilter = PERIOD_FILTERS[period]
  return prisma.$queryRawUnsafe(`
    WITH ranked AS (
      SELECT u."id" AS "userId", u."username", u."avatar", MAX(s."score")::int AS "score",
             (ROW_NUMBER() OVER (ORDER BY MAX(s."score") DESC, u."username" ASC))::int AS rank
      FROM "TowerStackScore" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE u."active" = true
        AND COALESCE(u."banned", false) = false
        AND s."userId" <> '${EXCLUDE_ID}'
        ${dateFilter}
      GROUP BY u."id", u."username", u."avatar"
    )
    SELECT * FROM ranked WHERE "userId" = $1;
  `, userId)
}

async function fetchTop11() {
  const [allTime, monthly, weekly] = await Promise.all([
    rankedTop11('allTime'),
    rankedTop11('monthly'),
    rankedTop11('weekly'),
  ])
  return { allTime, monthly, weekly }
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId || null

  let top11
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) top11 = JSON.parse(cached)
  } catch {}

  if (!top11) {
    top11 = await fetchTop11()
    try {
      await redis.set(CACHE_KEY, JSON.stringify(top11), 'EX', CACHE_TTL)
    } catch {}
  }

  const result = {}
  for (const p of ['allTime', 'monthly', 'weekly']) {
    const rows = top11[p]
    let viewerRow = null
    if (userId && !rows.some(r => r.userId === userId)) {
      try {
        const res = await rankedViewer(p, userId)
        viewerRow = res[0] || null
      } catch {}
    }
    result[p] = mergeViewerRow(rows, viewerRow, userId)
  }

  return result
})
