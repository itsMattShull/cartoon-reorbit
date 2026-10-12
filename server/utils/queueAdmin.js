// server/utils/queueAdmin.js
// Shared helpers for the admin Queue Monitor API routes (server/api/admin/queues/**).
import { getRequestHeader, createError } from 'h3'
import { getQueueEntry } from './queueRegistry.js'
import { queueStatus } from './queueHealth.js'

export const JOB_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed', 'prioritized']

export async function requireAdmin(event) {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  return me
}

export function requireQueue(event) {
  const entry = getQueueEntry(decodeURIComponent(String(event.context.params?.name || '')))
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'Unknown queue' })
  return entry
}

function clip(value, max) {
  if (value === undefined) return null
  let s
  try { s = typeof value === 'string' ? value : JSON.stringify(value) } catch { s = String(value) }
  if (s == null) return null
  return s.length > max ? `${s.slice(0, max)}… (${s.length - max} more chars)` : s
}

export function serializeJob(job) {
  return {
    id: job.id,
    name: job.name,
    data: clip(job.data, 2000),
    returnvalue: clip(job.returnvalue, 1000),
    failedReason: job.failedReason ? String(job.failedReason).slice(0, 1000) : null,
    stacktrace: Array.isArray(job.stacktrace) && job.stacktrace.length ? clip(job.stacktrace.join('\n'), 4000) : null,
    attemptsMade: job.attemptsMade ?? 0,
    maxAttempts: job.opts?.attempts ?? 1,
    progress: typeof job.progress === 'number' || typeof job.progress === 'string' ? job.progress : null,
    delayMs: job.opts?.delay ?? null,
    timestamp: job.timestamp ?? null,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    schedulerId: job.repeatJobKey || job.opts?.jobSchedulerId || null,
  }
}

/** Cheap per-queue snapshot used for the overview table (counts, worker count, oldest waiting). */
export async function queueOverview(entry, now = Date.now()) {
  const { queue } = entry
  const base = { name: entry.name, label: entry.label, description: entry.description, isCron: Boolean(entry.isCron) }
  try {
    const [counts, isPaused, workerList, oldest] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'prioritized', 'paused'),
      queue.isPaused(),
      // CLIENT LIST can be disabled on managed Redis; null = "unknown", not "zero".
      queue.getWorkers().catch(() => null),
      queue.getJobs(['waiting', 'prioritized'], 0, 4, true),
    ])
    const stamps = oldest.map(j => j.timestamp).filter(Boolean)
    const oldestWaitingAgeSec = stamps.length ? Math.max(0, Math.round((now - Math.min(...stamps)) / 1000)) : null
    const workers = workerList ? workerList.length : null
    return {
      ...base,
      counts,
      isPaused,
      workers,
      oldestWaitingAgeSec,
      status: queueStatus({ counts, isPaused, workers, oldestWaitingAgeSec }),
    }
  } catch (err) {
    return { ...base, error: err?.message || String(err), status: 'error' }
  }
}
