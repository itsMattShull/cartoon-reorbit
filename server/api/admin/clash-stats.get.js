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

  // 2) Parse timeframe → startDate (default 3m to match other endpoints)
  const { timeframe = '3m' } = getQuery(event)
  const now = new Date()
  const startDate = new Date(now)
  switch (timeframe) {
    case '1m': startDate.setMonth(startDate.getMonth() - 1); break
    case '3m': startDate.setMonth(startDate.getMonth() - 3); break
    case '6m': startDate.setMonth(startDate.getMonth() - 6); break
    case '1y': startDate.setFullYear(startDate.getFullYear() - 1); break
    default:   startDate.setMonth(startDate.getMonth() - 3)
  }

  // 3) Aggregate by local day (America/Chicago), filtered by timeframe
  const rows = await prisma.$queryRaw`
    WITH base AS (
      SELECT
        ("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::date AS day_local,
        outcome
      FROM "ClashGame"
      WHERE "startedAt" >= ${startDate}
    )
    SELECT
      to_char(day_local, 'YYYY-MM-DD')           AS day,
      COUNT(*)::int                               AS total,
      SUM(
        CASE
          WHEN outcome IS NOT NULL
           AND outcome != 'incomplete'
           AND outcome != ''
          THEN 1 ELSE 0
        END
      )::int                                      AS finished
    FROM base
    GROUP BY day
    ORDER BY day
  `

  // 4) Shape for the chart
  const results = rows.map(r => {
    const total    = Number(r.total)
    const finished = Number(r.finished)
    return {
      day:             r.day,
      count:           total,
      finishedCount:   finished,
      percentFinished: total > 0 ? Math.round((finished / total) * 100) : 0
    }
  })

  return results
})
