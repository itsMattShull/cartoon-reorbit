// server/api/admin/cron-run-logs/index.get.js
// GET /api/admin/cron-run-logs?job=&status=&take=&skip=
// Newest-first page of CronRunLog rows plus the total matching the filter (so the page can offer
// "select all N" across pages) and the list of job names present in the log.
import { defineEventHandler, getRequestHeader, getQuery, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { CRON_JOBS } from '@/server/cron/jobs'

const STATUSES = ['SUCCESS', 'FAILED', 'SKIPPED']

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const q = getQuery(event)
  const take = Math.min(Math.max(parseInt(q.take, 10) || 100, 1), 500)
  const skip = Math.max(parseInt(q.skip, 10) || 0, 0)
  const where = {}
  if (q.job) where.job = String(q.job)
  if (q.status && STATUSES.includes(String(q.status))) where.status = String(q.status)

  const [rows, total, jobRows] = await Promise.all([
    prisma.cronRunLog.findMany({ where, orderBy: { startedAt: 'desc' }, take, skip }),
    prisma.cronRunLog.count({ where }),
    prisma.cronRunLog.groupBy({ by: ['job'] }),
  ])

  const jobs = [...new Set([...CRON_JOBS.map(j => j.name), ...jobRows.map(r => r.job)])].sort()
  return { rows, total, jobs }
})
