// server/utils/cronErrorLog.js
import { prisma } from '../prisma.js'

/**
 * Best-effort error log entry for background cron/worker jobs, surfaced on the admin
 * "Error Logs" page. Never throws — logging a failure must never cause a second failure.
 * @param {string} job - job name, e.g. "syncGuildMembers", "startDueAuctions", "process"
 * @param {unknown} err
 */
export async function logCronError(job, err) {
  try {
    const summary = (err?.message || String(err)).slice(0, 500)
    const message = (err?.stack || err?.message || String(err)).slice(0, 8000)
    await prisma.cronErrorLog.create({ data: { job, summary, message } })
  } catch (e2) {
    console.error('[cron-error-log] failed to record error:', e2?.message)
  }
}
