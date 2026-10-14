// server/utils/queueHealth.js
//
// Pure helpers for the admin Queue Monitor: turn a queue's counts + oldest-waiting age + worker count
// into one status label, and summarize a sample of finished jobs. No Redis, no clock but `now`.
//
//   paused      the queue is paused — nothing will be picked up
//   no-workers  work is waiting/active but no worker process is attached to the queue
//   backed-up   jobs are waiting longer than BACKLOG_AGE_SEC, or more than BACKLOG_COUNT are waiting
//   failures    nothing is stuck, but the queue holds failed jobs (kept until removed/pruned)
//   ok          healthy (delayed jobs are future work, not a backlog)
export const BACKLOG_AGE_SEC = 300
export const BACKLOG_COUNT = 100

export function queueStatus({ counts = {}, isPaused = false, workers = null, oldestWaitingAgeSec = null } = {}) {
  const waiting = (counts.waiting || 0) + (counts.prioritized || 0)
  const active = counts.active || 0
  if (isPaused) return 'paused'
  if (workers === 0 && (waiting > 0 || active > 0)) return 'no-workers'
  if (waiting > BACKLOG_COUNT || (oldestWaitingAgeSec != null && oldestWaitingAgeSec > BACKLOG_AGE_SEC)) return 'backed-up'
  if ((counts.failed || 0) > 0) return 'failures'
  return 'ok'
}

/**
 * Summarize a sample of finished jobs (BullMQ keeps only the most recent N per removeOnComplete /
 * removeOnFail, so this describes the retained window, not all time).
 * @param {{timestamp?:number, processedOn?:number, finishedOn?:number}[]} jobs
 */
export function summarizeFinished(jobs, now = Date.now()) {
  const hourAgo = now - 3600_000
  const dayAgo = now - 24 * 3600_000
  let lastHour = 0
  let lastDay = 0
  const proc = []
  const wait = []
  for (const j of jobs) {
    if (!j.finishedOn) continue
    if (j.finishedOn >= hourAgo) lastHour++
    if (j.finishedOn >= dayAgo) lastDay++
    if (j.processedOn) proc.push(j.finishedOn - j.processedOn)
    if (j.processedOn && j.timestamp) wait.push(Math.max(0, j.processedOn - j.timestamp))
  }
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null)
  const p95 = (a) => {
    if (!a.length) return null
    const s = [...a].sort((x, y) => x - y)
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
  }
  return {
    sampled: jobs.length,
    lastHour,
    lastDay,
    avgProcessMs: avg(proc),
    p95ProcessMs: p95(proc),
    avgWaitMs: avg(wait),
    p95WaitMs: p95(wait),
  }
}
