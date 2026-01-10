// server/api/admin/spend-earn-ratio.get.js
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
  const groupBy = (rawGroupBy === 'daily' || rawGroupBy === 'weekly' || rawGroupBy === 'monthly')
    ? rawGroupBy
    : 'daily'

  const TF_DAYS  = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
  const TF_WEEKS = { '1m':  4, '3m': 13, '6m':  26, '1y':  52 }
  const TF_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }

  const days  = TF_DAYS[timeframe]  ?? 90
  const weeks = TF_WEEKS[timeframe] ?? 13
  const months = TF_MONTHS[timeframe] ?? 3

  if (groupBy === 'weekly') {
    // Weekly: ratio = spend/earn; MA ratio = MA(spend)/MA(earn)
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
            SUM(CASE WHEN "direction"='decrease' THEN "points" ELSE 0 END)::float AS spend,
            SUM(CASE WHEN "direction"='increase' THEN "points" ELSE 0 END)::float AS earn
          FROM "PointsLog"
          WHERE "createdAt" >= (SELECT start_wk FROM bounds)
            AND "createdAt" <  (SELECT end_wk   FROM bounds) + INTERVAL '1 week'
          GROUP BY 1
        ),
        joined AS (
          SELECT ws.period,
                 COALESCE(a.spend,0) AS spend,
                 COALESCE(a.earn,0)  AS earn
          FROM week_series ws
          LEFT JOIN agg a ON a.period = ws.period
        ),
        calc AS (
          SELECT
            period,
            spend,
            earn,
            CASE WHEN earn = 0 THEN NULL ELSE spend/earn END AS ratio,
            AVG(spend) OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_spend,
            AVG(earn)  OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_earn
          FROM joined
        )
      SELECT
        period,
        spend,
        earn,
        ROUND(ratio::numeric, 3) AS spend_earn_ratio,
        CASE
          WHEN ma_earn = 0 THEN NULL
          ELSE ROUND((ma_spend / ma_earn)::numeric, 3)
        END AS ratio_ma7
      FROM calc
      ORDER BY period;
    `)

    const series = weekly.map(r => ({
      period: r.period,
      spend: Number(r.spend),
      earn:  Number(r.earn),
      spendEarnRatio: r.spend_earn_ratio === null ? null : Number(r.spend_earn_ratio),
      // keep frontend compatibility
      movingAvg7Day: r.ratio_ma7 === null ? null : Number(r.ratio_ma7)
    }))

    return { timeframe, days, weeks, series }
  }

  if (groupBy === 'monthly') {
    // Monthly: ratio = spend/earn; MA ratio = MA(spend)/MA(earn)
    const monthly = await prisma.$queryRawUnsafe(`
      WITH
        bounds AS (
          SELECT date_trunc('month', now()::date) AS end_mo,
                 date_trunc('month', now()::date) - INTERVAL '${months - 1} month' AS start_mo
        ),
        month_series AS (
          SELECT generate_series((SELECT start_mo FROM bounds),
                                 (SELECT end_mo   FROM bounds),
                                 '1 month')::date AS period
        ),
        agg AS (
          SELECT
            date_trunc('month', "createdAt")::date AS period,
            SUM(CASE WHEN "direction"='decrease' THEN "points" ELSE 0 END)::float AS spend,
            SUM(CASE WHEN "direction"='increase' THEN "points" ELSE 0 END)::float AS earn
          FROM "PointsLog"
          WHERE "createdAt" >= (SELECT start_mo FROM bounds)
            AND "createdAt" <  (SELECT end_mo   FROM bounds) + INTERVAL '1 month'
          GROUP BY 1
        ),
        joined AS (
          SELECT ms.period,
                 COALESCE(a.spend,0) AS spend,
                 COALESCE(a.earn,0)  AS earn
          FROM month_series ms
          LEFT JOIN agg a ON a.period = ms.period
        ),
        calc AS (
          SELECT
            period,
            spend,
            earn,
            CASE WHEN earn = 0 THEN NULL ELSE spend/earn END AS ratio,
            AVG(spend) OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_spend,
            AVG(earn)  OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_earn
          FROM joined
        )
      SELECT
        period,
        spend,
        earn,
        ROUND(ratio::numeric, 3) AS spend_earn_ratio,
        CASE
          WHEN ma_earn = 0 THEN NULL
          ELSE ROUND((ma_spend / ma_earn)::numeric, 3)
        END AS ratio_ma7
      FROM calc
      ORDER BY period;
    `)

    const series = monthly.map(r => ({
      period: r.period,
      spend: Number(r.spend),
      earn:  Number(r.earn),
      spendEarnRatio: r.spend_earn_ratio === null ? null : Number(r.spend_earn_ratio),
      // keep frontend compatibility
      movingAvg7Day: r.ratio_ma7 === null ? null : Number(r.ratio_ma7)
    }))

    return { timeframe, months, series }
  }

  // Daily: ratio = spend/earn; MA ratio = MA(spend)/MA(earn)
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
          SUM(CASE WHEN "direction"='decrease' THEN "points" ELSE 0 END)::float AS spend,
          SUM(CASE WHEN "direction"='increase' THEN "points" ELSE 0 END)::float AS earn
        FROM "PointsLog"
        WHERE "createdAt" >= (SELECT start_day FROM bounds)
          AND "createdAt" <  (SELECT end_day   FROM bounds) + INTERVAL '1 day'
        GROUP BY 1
      ),
      joined AS (
        SELECT ds.period,
               COALESCE(a.spend,0) AS spend,
               COALESCE(a.earn,0)  AS earn
        FROM day_series ds
        LEFT JOIN agg a ON a.period = ds.period
      ),
      calc AS (
        SELECT
          period,
          spend,
          earn,
          CASE WHEN earn = 0 THEN NULL ELSE spend/earn END AS ratio,
          AVG(spend) OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_spend,
          AVG(earn)  OVER (ORDER BY period ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_earn
        FROM joined
      )
    SELECT
      period,
      spend,
      earn,
      ROUND(ratio::numeric, 3) AS spend_earn_ratio,
      CASE
        WHEN ma_earn = 0 THEN NULL
        ELSE ROUND((ma_spend / ma_earn)::numeric, 3)
      END AS ratio_ma7
    FROM calc
    ORDER BY period;
  `)

  return {
    timeframe,
    days,
    daily: daily.map(r => ({
      period: r.period,
      spend: Number(r.spend),
      earn:  Number(r.earn),
      spendEarnRatio: r.spend_earn_ratio === null ? null : Number(r.spend_earn_ratio),
      // keep frontend compatibility
      movingAvg7Day: r.ratio_ma7 === null ? null : Number(r.ratio_ma7)
    }))
  }
})
