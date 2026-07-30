// GET /api/economy/net-points
// Daily net points issued (earned - spent) for the last 30 days, with the same
// 7-day moving average the admin analytics chart uses, plus year-to-date and
// trailing-30-day inflation rates. Series query matches
// server/api/admin/net-points-issues.get.js (daily branch), fixed to a 30-day
// window and readable by any logged-in player — everything here is an
// economy-wide aggregate with no per-user data in it.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import { EXCLUDED_SYSTEM_USER_ID } from '@/server/utils/economyValuation'

const CACHE_KEY = 'economy:net-points:30d:v2'
const CACHE_TTL = 300 // 5 min — PointsLog changes constantly but this is a 30-day trend

async function computeSeries() {
  // The moving average needs 6 days of lead-in before the window starts,
  // otherwise the first points of the chart average over a short window.
  const rows = await prisma.$queryRaw`
    WITH
      bounds AS (
        SELECT (now() - INTERVAL '36 days')::date AS start_day,
               now()::date                        AS end_day
      ),
      day_series AS (
        SELECT generate_series((SELECT start_day FROM bounds),
                               (SELECT end_day   FROM bounds),
                               '1 day')::date AS period
      ),
      agg AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          SUM(CASE WHEN "direction" = 'increase' THEN "points" ELSE 0 END)::bigint AS earned,
          SUM(CASE WHEN "direction" = 'decrease' THEN "points" ELSE 0 END)::bigint AS spent
        FROM "PointsLog"
        WHERE "createdAt" >= (SELECT start_day FROM bounds)
          AND "createdAt" <  (SELECT end_day FROM bounds) + INTERVAL '1 day'
        GROUP BY 1
      ),
      joined AS (
        SELECT ds.period,
               COALESCE(a.earned, 0) AS earned,
               COALESCE(a.spent, 0)  AS spent
        FROM day_series ds
        LEFT JOIN agg a ON a.period = ds.period
      )
    SELECT
      period,
      earned,
      spent,
      (earned - spent) AS net,
      ROUND(AVG(earned - spent) OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)::numeric, 2) AS net_ma7
    FROM joined
    ORDER BY period;
  `

  // Drop the moving-average lead-in so the chart shows exactly 30 days.
  return rows.slice(-30).map(r => ({
    period: r.period instanceof Date ? r.period.toISOString().slice(0, 10) : String(r.period),
    earned: Number(r.earned),
    spent: Number(r.spent),
    net: Number(r.net),
    movingAvg7Day: Number(r.net_ma7)
  }))
}

// Point inflation = growth of the circulating player point supply over a
// period, as a percentage of what the supply was at the start of it.
// Supply at the start is derived by subtracting the period's net issuance
// from today's supply, so no historical snapshot table is needed.
//
// The official/system account is excluded from both the supply and the net:
// its balance is a static house hoard, not circulating player wealth, and
// leaving it in the denominator would flatten every rate to ~0%.
async function computeInflation() {
  const rows = await prisma.$queryRaw`
    WITH players AS (
      SELECT u.id
      FROM "User" u
      WHERE u."active" = true
        AND COALESCE(u."banned", false) = false
        AND u."id" <> ${EXCLUDED_SYSTEM_USER_ID}
    ),
    supply AS (
      SELECT COALESCE(SUM(up."points"), 0)::bigint AS total
      FROM "UserPoints" up
      JOIN players p ON p.id = up."userId"
    ),
    ytd AS (
      SELECT COALESCE(SUM(CASE WHEN pl."direction" = 'increase' THEN pl."points" ELSE -pl."points" END), 0)::bigint AS net
      FROM "PointsLog" pl
      JOIN players p ON p.id = pl."userId"
      WHERE pl."createdAt" >= date_trunc('year', now())
    ),
    last30 AS (
      SELECT COALESCE(SUM(CASE WHEN pl."direction" = 'increase' THEN pl."points" ELSE -pl."points" END), 0)::bigint AS net
      FROM "PointsLog" pl
      JOIN players p ON p.id = pl."userId"
      WHERE pl."createdAt" >= now() - INTERVAL '30 days'
    )
    SELECT supply.total AS "supply", ytd.net AS "netYtd", last30.net AS "net30d"
    FROM supply, ytd, last30
  `

  const row = rows[0] || {}
  const supply = Number(row.supply || 0)
  const netYtd = Number(row.netYtd || 0)
  const net30d = Number(row.net30d || 0)

  // A rate is only meaningful if there was a positive supply to grow from.
  const rate = (net) => {
    const startingSupply = supply - net
    if (!Number.isFinite(startingSupply) || startingSupply <= 0) return null
    return Math.round((net / startingSupply) * 10000) / 100
  }

  return {
    currentSupply: supply,
    netYtd,
    net30d,
    ytdPct: rate(netYtd),
    last30Pct: rate(net30d)
  }
}

export default defineEventHandler(async (event) => {
  if (!event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}

  const [series, inflation] = await Promise.all([computeSeries(), computeInflation()])
  const payload = { series, inflation }

  try {
    await redis.set(CACHE_KEY, JSON.stringify(payload), 'EX', CACHE_TTL)
  } catch {}

  return payload
})
