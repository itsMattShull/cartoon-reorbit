// ReOrbit Chess leaderboard — ranked by wins.
//
// Shaped to the contract components/newsite/Leaderboards.vue expects from every game in its
// `gameOptions` list ({ allTime, monthly, weekly } of { userId, username, avatar, score,
// rank }), and modelled directly on the Ed, Edd n Eddy RPS board next door.
//
// Only games that were genuinely played out count. 'forfeit' and 'sweep' are excluded so
// abandoning a losing position can never pad a record, and draws contribute a game but not a
// win — which is the right incentive, since a draw pays no points either.
//
// Games against the three AI opponents are absent by construction: they are played entirely
// in the browser and never written to this table.
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { mergeViewerRow } from '@/server/utils/leaderboardRank'

const CACHE_KEY = 'reorbitchess:leaderboard:v1'
const CACHE_TTL = 1800 // 30 minutes
const EXCLUDE_ID = '4f0e8b3b-7d0b-466b-99e7-8996c91d7eb3'

const PERIOD_INTERVALS = {
  allTime: null,
  monthly: '30 days',
  weekly: '7 days'
}

// One pass over the table: each game contributes a row per player, so wins and games come out
// of a single scan. The partial indexes in the migration (WHERE "endedAt" IS NOT NULL) are
// what keep this off a sequential scan as the table grows.
function rankedRows (period, viewerId) {
  const interval = PERIOD_INTERVALS[period]

  // Bound parameters rather than string interpolation, even though `period` is a fixed enum.
  const sql = `
    WITH participants AS (
      SELECT m."whiteUserId" AS uid, (m."winnerUserId" = m."whiteUserId") AS won
        FROM "ReOrbitChessMatch" m
       WHERE m."endedAt" IS NOT NULL
         AND m."endReason" NOT IN ('forfeit', 'sweep')
         AND m."whiteUserId" <> m."blackUserId"
         AND ($2::interval IS NULL OR m."endedAt" >= NOW() - $2::interval)
      UNION ALL
      SELECT m."blackUserId" AS uid, (m."winnerUserId" = m."blackUserId") AS won
        FROM "ReOrbitChessMatch" m
       WHERE m."endedAt" IS NOT NULL
         AND m."endReason" NOT IN ('forfeit', 'sweep')
         AND m."whiteUserId" <> m."blackUserId"
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
    SELECT * FROM ranked
     WHERE ($3::text IS NULL OR "userId" = $3)
     ORDER BY rank
     LIMIT CASE WHEN $3::text IS NULL THEN 11 ELSE 1 END;
  `
  return prisma.$queryRawUnsafe(sql, EXCLUDE_ID, interval, viewerId ?? null)
}

async function fetchTop11 () {
  const [allTime, monthly, weekly] = await Promise.all([
    rankedRows('allTime', null),
    rankedRows('monthly', null),
    rankedRows('weekly', null)
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
    const rows = top11[p] || []
    let viewerRow = null
    if (userId && !rows.some(r => r.userId === userId)) {
      try {
        const res = await rankedRows(p, userId)
        viewerRow = res[0] || null
      } catch {}
    }
    result[p] = mergeViewerRow(rows, viewerRow, userId)
  }

  return result
})
