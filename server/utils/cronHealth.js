// server/utils/cronHealth.js
//
// Turns a job's registry entry (server/cron/jobs.js) plus its latest CronJobState snapshot into a
// health label for the admin Cron Run Logs page. Pure function — no DB, no clock besides `now`.
//
//   never    no run recorded yet (e.g. just deployed; waiting for its first slot)
//   running  currently executing
//   stuck    marked running for far longer than any normal run (process died mid-run?)
//   failing  the most recent run threw
//   late     no successful run within 2x its expected interval (+ grace) — i.e. it has stopped
//            happening on time, whether because it keeps failing/skipping or isn't being fired
//   ok       last success is recent
const GRACE_SEC = 120
const STUCK_AFTER_SEC = 3 * 60 * 60

export function computeJobHealth(job, state, now = Date.now()) {
  if (!state || (!state.lastStartedAt && !state.lastSuccessAt)) return 'never'

  const startedMs = state.lastStartedAt ? new Date(state.lastStartedAt).getTime() : null
  if (state.lastStatus === 'RUNNING') {
    return startedMs != null && now - startedMs > STUCK_AFTER_SEC * 1000 ? 'stuck' : 'running'
  }

  const lastOkMs = state.lastSuccessAt ? new Date(state.lastSuccessAt).getTime() : null
  const lateAfterMs = (2 * job.intervalSec + GRACE_SEC) * 1000
  const late = lastOkMs == null || now - lastOkMs > lateAfterMs

  if (state.lastStatus === 'FAILED') return 'failing'
  if (late) return 'late'
  return 'ok'
}
