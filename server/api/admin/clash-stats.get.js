// server/api/admin/clash-stats.get.js
import {
  defineEventHandler,
  getQuery,
  getRequestHeader,
  createError
} from 'h3'
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

  // 2) Parse timeframe + grouping
  const { timeframe = '3m', groupBy: rawGroupBy } = getQuery(event)
  const groupBy = rawGroupBy === 'weekly' ? 'weekly' : 'daily'

  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
  }

  if (groupBy === 'weekly') {
    // ---- Weekly buckets (week starts Monday per Postgres date_trunc) ----
    const rows = await prisma.$queryRaw`
      WITH base AS (
        SELECT
          ("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago') AS local_ts,
          outcome
        FROM "ClashGame"
        WHERE "startedAt" >= ${startDate}
      ),
      wk AS (
        SELECT
          date_trunc('week', local_ts)::date AS week_start,
          outcome
        FROM base
      )
      SELECT
        to_char(week_start, 'YYYY-MM-DD') AS period,
        COUNT(*)::int AS total,
        SUM(CASE
              WHEN outcome IS NOT NULL
               AND outcome != 'incomplete'
               AND outcome != ''
              THEN 1 ELSE 0
            END)::int AS finished
      FROM wk
      GROUP BY period
      ORDER BY period
    `

    return rows.map(r => {
      const total    = Number(r.total)
      const finished = Number(r.finished)
      return {
        period:          r.period,               // week start (local)
        count:           total,
        finishedCount:   finished,
        percentFinished: total > 0 ? Math.round((finished / total) * 100) : 0
      }
    })
  }

  // ---- Daily buckets (existing behavior) ----
  const rows = await prisma.$queryRaw`
    WITH base AS (
      SELECT
        ("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date AS day_local,
        outcome
      FROM "ClashGame"
      WHERE "startedAt" >= ${startDate}
    )
    SELECT
      to_char(day_local, 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS total,
      SUM(
        CASE
          WHEN outcome IS NOT NULL
           AND outcome != 'incomplete'
           AND outcome != ''
          THEN 1 ELSE 0
        END
      )::int AS finished
    FROM base
    GROUP BY day
    ORDER BY day
  `

  return rows.map(r => {
    const total    = Number(r.total)
    const finished = Number(r.finished)
    return {
      day:              r.day,                  // local day
      count:            total,
      finishedCount:    finished,
      percentFinished:  total > 0 ? Math.round((finished / total) * 100) : 0
    }
  })
})
