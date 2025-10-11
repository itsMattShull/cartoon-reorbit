// server/api/admin/net-points-issues.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // 1) Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  // 2) Params
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = rawGroupBy === 'weekly' ? 'weekly' : 'daily'

  const TF_DAYS  = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  const TF_WEEKS = { '1m':  4, '3m': 13, '6m':  26, '1y':  52 }

  const days  = TF_DAYS[timeframe]  ?? 90
  const weeks = TF_WEEKS[timeframe] ?? 13

  if (groupBy === 'weekly') {
    // 3) Weekly series: earned, spent, net, 7-week MA(net)
    const weekly = await prisma.$queryRawUnsafe(`
      WITH
        bounds AS (
          SELECT date_trunc('week', now()::date) AS end_wk,
                 date_trunc('week', now()::date) - INTERVAL '${weeks - 1} week' AS start_wk
        ),
        week_series AS (
          SELECT generate_series((SELECT start_wk FROM bounds),
                                 (SELECT end_wk   FROM bounds),
                                 '1 week')::date AS period
        ),
        agg AS (
          SELECT
            date_trunc('week', "createdAt")::date AS period,
            SUM(CASE WHEN "direction"='increase' THEN "points" ELSE 0 END)::int AS earned,
            SUM(CASE WHEN "direction"='decrease' THEN "points" ELSE 0 END)::int AS spent
          FROM "PointsLog"
          WHERE "createdAt" >= (SELECT start_wk FROM bounds)
            AND "createdAt" <  (SELECT end_wk   FROM bounds) + INTERVAL '1 week'
          GROUP BY 1
        ),
        joined AS (
          SELECT ws.period,
                 COALESCE(a.earned,0) AS earned,
                 COALESCE(a.spent,0)  AS spent
          FROM week_series ws
          LEFT JOIN agg a ON a.period = ws.period
        )
      SELECT
        period,
        earned,
        spent,
        (earned - spent) AS net,
        ROUND(AVG(earned - spent) OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)::numeric, 2) AS net_ma7
      FROM joined
      ORDER BY period;
    `)

    const series = weekly.map(r => ({
      period: r.period,
      earned: Number(r.earned),
      spent:  Number(r.spent),
      net:    Number(r.net),
      net_ma7: Number(r.net_ma7),
      // compatibility with existing frontend
      netPoints: Number(r.net),
      movingAvg7Day: Number(r.net_ma7)
    }))

    return { timeframe, weeks, series }
  }

  // 4) Daily series: earned, spent, net, 7-day MA(net)
  const daily = await prisma.$queryRawUnsafe(`
    WITH
      bounds AS (
        SELECT (now() - INTERVAL '${days} days')::date AS start_day,
               now()::date                            AS end_day
      ),
      day_series AS (
        SELECT generate_series((SELECT start_day FROM bounds),
                               (SELECT end_day   FROM bounds),
                               '1 day')::date AS period
      ),
      agg AS (
        SELECT
          date_trunc('day', "createdAt")::date AS period,
          SUM(CASE WHEN "direction"='increase' THEN "points" ELSE 0 END)::int AS earned,
          SUM(CASE WHEN "direction"='decrease' THEN "points" ELSE 0 END)::int AS spent
        FROM "PointsLog"
        WHERE "createdAt" >= (SELECT start_day FROM bounds)
          AND "createdAt" <  (SELECT end_day   FROM bounds) + INTERVAL '1 day'
        GROUP BY 1
      ),
      joined AS (
        SELECT ds.period,
               COALESCE(a.earned,0) AS earned,
               COALESCE(a.spent,0)  AS spent
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
  `)

  return {
    timeframe,
    days,
    daily: daily.map(r => ({
      period: r.period,
      earned: Number(r.earned),
      spent:  Number(r.spent),
      net:    Number(r.net),
      net_ma7: Number(r.net_ma7),
      // compatibility with existing frontend
      netPoints: Number(r.net),
      movingAvg7Day: Number(r.net_ma7)
    }))
  }
})
