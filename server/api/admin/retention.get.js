// server/api/admin/retention.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

const COHORTS = {
  week: { trunc: 'week', defaultLimit: 12 },
  month: { trunc: 'month', defaultLimit: 12 },
  quarter: { trunc: 'quarter', defaultLimit: 8 }
}

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
    throw createError({ statusCode: 403, statusMessage: 'Forbidden - Admins only' })
  }

  // 2) Params
  const { cohort: rawCohort, limit: rawLimit } = getQuery(event)
  const cohort = (rawCohort === 'week' || rawCohort === 'month' || rawCohort === 'quarter')
    ? rawCohort
    : 'week'
  const defaultLimit = COHORTS[cohort].defaultLimit
  const parsedLimit = Number.parseInt(rawLimit, 10)
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 52)
    : defaultLimit

  const now = new Date()
  const startDate = new Date(now)
  if (cohort === 'week') {
    startDate.setDate(startDate.getDate() - (limit + 2) * 7)
  } else if (cohort === 'month') {
    startDate.setMonth(startDate.getMonth() - (limit + 2))
  } else {
    startDate.setMonth(startDate.getMonth() - (limit + 2) * 3)
  }
  startDate.setHours(0, 0, 0, 0)

  const truncUnit = COHORTS[cohort].trunc
  const sql = `
    SELECT
      date_trunc('${truncUnit}', "createdAt")::date AS cohort_start,
      to_char(date_trunc('${truncUnit}', "createdAt"), 'YYYY-MM-DD') AS cohort_label,
      COUNT(*)::int AS cohort_size,
      COUNT(*) FILTER (WHERE "createdAt" <= now() - interval '3 days')::int AS eligible_3d,
      COUNT(*) FILTER (
        WHERE "createdAt" <= now() - interval '3 days'
          AND "lastActivity" >= "createdAt" + interval '3 days'
      )::int AS retained_3d,
      COUNT(*) FILTER (WHERE "createdAt" <= now() - interval '7 days')::int AS eligible_1w,
      COUNT(*) FILTER (
        WHERE "createdAt" <= now() - interval '7 days'
          AND "lastActivity" >= "createdAt" + interval '7 days'
      )::int AS retained_1w,
      COUNT(*) FILTER (WHERE "createdAt" <= now() - interval '14 days')::int AS eligible_2w,
      COUNT(*) FILTER (
        WHERE "createdAt" <= now() - interval '14 days'
          AND "lastActivity" >= "createdAt" + interval '14 days'
      )::int AS retained_2w,
      COUNT(*) FILTER (WHERE "createdAt" <= now() - interval '1 month')::int AS eligible_1m,
      COUNT(*) FILTER (
        WHERE "createdAt" <= now() - interval '1 month'
          AND "lastActivity" >= "createdAt" + interval '1 month'
      )::int AS retained_1m,
      COUNT(*) FILTER (WHERE "createdAt" <= now() - interval '3 months')::int AS eligible_3m,
      COUNT(*) FILTER (
        WHERE "createdAt" <= now() - interval '3 months'
          AND "lastActivity" >= "createdAt" + interval '3 months'
      )::int AS retained_3m,
      COUNT(*) FILTER (WHERE "createdAt" <= now() - interval '6 months')::int AS eligible_6m,
      COUNT(*) FILTER (
        WHERE "createdAt" <= now() - interval '6 months'
          AND "lastActivity" >= "createdAt" + interval '6 months'
      )::int AS retained_6m,
      COUNT(*) FILTER (WHERE "createdAt" <= now() - interval '1 year')::int AS eligible_1y,
      COUNT(*) FILTER (
        WHERE "createdAt" <= now() - interval '1 year'
          AND "lastActivity" >= "createdAt" + interval '1 year'
      )::int AS retained_1y
    FROM "User"
    WHERE "createdAt" >= $1
    GROUP BY cohort_start, cohort_label
    ORDER BY cohort_start DESC
    LIMIT $2
  `

  const rows = await prisma.$queryRawUnsafe(sql, startDate, limit)

  return {
    cohort,
    rows: rows.map(r => ({
      cohortStart: r.cohort_label,
      cohortSize: Number(r.cohort_size || 0),
      metrics: {
        d3: { eligible: Number(r.eligible_3d || 0), retained: Number(r.retained_3d || 0) },
        w1: { eligible: Number(r.eligible_1w || 0), retained: Number(r.retained_1w || 0) },
        w2: { eligible: Number(r.eligible_2w || 0), retained: Number(r.retained_2w || 0) },
        m1: { eligible: Number(r.eligible_1m || 0), retained: Number(r.retained_1m || 0) },
        m3: { eligible: Number(r.eligible_3m || 0), retained: Number(r.retained_3m || 0) },
        m6: { eligible: Number(r.eligible_6m || 0), retained: Number(r.retained_6m || 0) },
        y1: { eligible: Number(r.eligible_1y || 0), retained: Number(r.retained_1y || 0) }
      }
    }))
  }
})
