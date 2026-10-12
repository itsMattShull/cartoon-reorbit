// server/api/admin/cron-run-logs/summary.get.js
// GET /api/admin/cron-run-logs/summary
// One entry per registered job: schedule, last run snapshot, and a computed health label
// (ok / late / failing / running / stuck / never). This is what makes a job that has silently
// stopped firing visible — the run history alone can't show something that never ran.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { CRON_JOBS } from '@/server/cron/jobs'
import { computeJobHealth } from '@/server/utils/cronHealth'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const states = await prisma.cronJobState.findMany()
  const byJob = new Map(states.map(s => [s.job, s]))
  const now = Date.now()

  return CRON_JOBS.map((job) => {
    const st = byJob.get(job.name) || null
    return {
      job: job.name,
      tier: job.tier,
      description: job.description,
      pattern: job.pattern,
      tz: job.tz || null,
      intervalSec: job.intervalSec,
      health: computeJobHealth(job, st, now),
      lastStatus: st?.lastStatus || null,
      lastStartedAt: st?.lastStartedAt || null,
      lastFinishedAt: st?.lastFinishedAt || null,
      lastSuccessAt: st?.lastSuccessAt || null,
      lastDurationMs: st?.lastDurationMs ?? null,
      lastError: st?.lastError || null,
    }
  })
})
