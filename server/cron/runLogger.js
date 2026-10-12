// server/cron/runLogger.js
//
// Wraps every scheduled job run: times it, records the outcome to CronRunLog (history, shown on the
// admin "Cron Run Logs" page) and CronJobState (latest snapshot per job, used to flag a job that
// has stopped running), and mirrors failures into the existing CronErrorLog ("Error Logs" page).
//
// Never throws — a job failing, or this logging failing, must not take the scheduler down.
//
// A handler reports a deliberate no-op by RETURNING { skipped: true, reason } (e.g. it lost an
// advisory-lock race). Any other returned value is stored as the run's `detail`. A handler that
// throws is recorded as FAILED.
import { prisma } from '../prisma.js'
import { logCronError } from '../utils/cronErrorLog.js'
import { CRON_JOBS_BY_NAME, QUIET_JOB_LOG_THRESHOLD_MS } from './jobs.js'

const SUCCESS_RETENTION_DAYS = 7
const OTHER_RETENTION_DAYS = 30

function summarize(result) {
  if (result === undefined || result === null) return null
  if (typeof result === 'string') return result.slice(0, 500)
  try { return JSON.stringify(result).slice(0, 500) } catch { return null }
}

async function writeState(job, data) {
  try {
    await prisma.cronJobState.upsert({ where: { job }, create: { job, ...data }, update: data })
  } catch (e) {
    console.error('[cron-run-log] failed to update job state:', e?.message)
  }
}

/**
 * @param {string} name   job name (key of CRON_JOBS / JOB_HANDLERS)
 * @param {() => Promise<unknown>} fn
 * @param {{ trigger?: 'schedule'|'catchup'|'delayed'|'manual' }} [opts]
 */
export async function runLogged(name, fn, opts = {}) {
  const trigger = opts.trigger || 'schedule'
  const quiet = Boolean(CRON_JOBS_BY_NAME[name]?.quiet)
  const startedAt = new Date()

  // Non-quiet jobs are slow/rare, so it's worth a RUNNING marker: a job stuck mid-run then shows
  // as "running since ..." on the admin page rather than looking untouched.
  if (!quiet) await writeState(name, { lastStartedAt: startedAt, lastStatus: 'RUNNING' })

  let status = 'SUCCESS'
  let detail = null
  let error = null
  try {
    const result = await fn()
    if (result && typeof result === 'object' && result.skipped) {
      status = 'SKIPPED'
      detail = summarize(result.reason || result)
    } else {
      detail = summarize(result)
    }
  } catch (err) {
    status = 'FAILED'
    error = (err?.stack || err?.message || String(err)).slice(0, 8000)
    detail = (err?.message || String(err)).slice(0, 500)
    console.error(`[${name}] failed:`, err)
    await logCronError(name, err)
  }

  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - startedAt.getTime()

  await writeState(name, {
    lastStartedAt: startedAt,
    lastFinishedAt: finishedAt,
    ...(status === 'SUCCESS' ? { lastSuccessAt: finishedAt } : {}),
    lastStatus: status,
    lastDurationMs: durationMs,
    lastError: status === 'FAILED' ? detail : null,
  })

  const worthLogging = !quiet || status !== 'SUCCESS' || detail != null || durationMs >= QUIET_JOB_LOG_THRESHOLD_MS
  if (worthLogging) {
    try {
      await prisma.cronRunLog.create({
        data: { job: name, status, startedAt, finishedAt, durationMs, detail, error, trigger },
      })
    } catch (e) {
      console.error('[cron-run-log] failed to record run:', e?.message)
    }
  }

  return { status, durationMs }
}

/** Deletes old CronRunLog rows. Clean runs age out fast; failures/skips are kept longer. */
export async function pruneCronLogs() {
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()
  const ok = await prisma.cronRunLog.deleteMany({
    where: { status: 'SUCCESS', startedAt: { lt: new Date(now - SUCCESS_RETENTION_DAYS * day) } },
  })
  const other = await prisma.cronRunLog.deleteMany({
    where: { status: { not: 'SUCCESS' }, startedAt: { lt: new Date(now - OTHER_RETENTION_DAYS * day) } },
  })
  return { deletedSuccess: ok.count, deletedOther: other.count }
}
