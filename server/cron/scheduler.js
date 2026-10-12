// server/cron/scheduler.js
//
// Runs ONE tier of recurring jobs on BullMQ job schedulers:
//
//   node server/cron/scheduler.js critical      (PM2 app "cron-critical")
//   node server/cron/scheduler.js maintenance   (PM2 app "cron-maintenance")
//
// This replaces the old single `guild-checker` process, which ran ~25 node-cron jobs on one event
// loop and awaited a long chain of heavy jobs at startup BEFORE registering most of its schedules
// (so a restart left packs, announcements and achievements unscheduled until the whole Discord /
// recompute chain finished). Differences that matter:
//
//   * Schedules live in Redis (BullMQ job schedulers), upserted from server/cron/jobs.js on boot.
//     They are registered immediately and synchronously-ish; nothing heavy runs first.
//   * Nothing heavy runs at startup. Instead a job whose last success is overdue is queued ONCE,
//     staggered (see queueCatchUps) — and a job that has never run under this system is left alone.
//   * Critical and maintenance are separate processes with separate queues and separate DB pools,
//     so a slow Discord sync can never delay a pack going live.
//   * Every run is timed and recorded (server/cron/runLogger.js) for the admin Cron Run Logs page.
//   * The critical process also hosts the exact-time "scheduled events" worker (delayed jobs for
//     pack on/off, AuctionOnly start, announcements — see server/utils/queues.js).
import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { redisConnection, SCHEDULED_EVENTS_QUEUE_NAME } from '../utils/queues.js'
import { logAuctionOnlyError } from '../utils/auctionOnlyErrorLog.js'
import { logCronError } from '../utils/cronErrorLog.js'
import { JOB_HANDLERS, SCHEDULED_EVENT_HANDLERS } from './jobHandlers.js'
import { runLogged } from './runLogger.js'
import { CRON_JOBS, TIER_CRITICAL, TIER_MAINTENANCE, jobsForTier } from './jobs.js'

const TIER = String(process.argv[2] || process.env.CRON_TIER || '').toLowerCase()
if (![TIER_CRITICAL, TIER_MAINTENANCE].includes(TIER)) {
  console.error(`[scheduler] usage: node server/cron/scheduler.js <${TIER_CRITICAL}|${TIER_MAINTENANCE}>`)
  process.exit(1)
}
const LABEL = `cron-${TIER}`

// Last-resort nets. Job failures are caught per run in runLogged; these catch anything that escapes
// from a fire-and-forget promise inside a job so one stray rejection can't kill the whole process.
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason))
  console.error(`[${LABEL}] Unhandled rejection (process kept alive):`, reason)
  logAuctionOnlyError('process', err, null).catch(() => {})
  logCronError(`process:${TIER}`, err).catch(() => {})
})
process.on('uncaughtException', (err) => {
  console.error(`[${LABEL}] Uncaught exception (process kept alive):`, err)
  logAuctionOnlyError('process', err, null).catch(() => {})
  logCronError(`process:${TIER}`, err).catch(() => {})
})

const QUEUE_NAME = process.env[`CRON_${TIER.toUpperCase()}_QUEUE_KEY`] || `cron${TIER[0].toUpperCase()}${TIER.slice(1)}`

// Critical jobs are short and independent, so a few can run side by side. Maintenance jobs are the
// big DB writers / Discord crawlers: strictly one at a time.
const CONCURRENCY = TIER === TIER_CRITICAL ? 3 : 1

const jobs = jobsForTier(TIER)
const missing = jobs.filter(j => typeof JOB_HANDLERS[j.name] !== 'function').map(j => j.name)
if (missing.length) {
  console.error(`[${LABEL}] no handler for registered job(s): ${missing.join(', ')}`)
  process.exit(1)
}

const queue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 }, attempts: 1 },
})

async function registerSchedules() {
  // Drop schedulers for jobs that were removed from the registry / moved to the other tier.
  const wanted = new Set(jobs.map(j => j.name))
  try {
    const existing = await queue.getJobSchedulers(0, -1)
    for (const sched of existing) {
      const id = sched.key || sched.id
      if (id && !wanted.has(id)) {
        await queue.removeJobScheduler(id)
        console.log(`[${LABEL}] removed obsolete scheduler ${id}`)
      }
    }
  } catch (err) {
    console.error(`[${LABEL}] failed to prune obsolete schedulers:`, err?.message)
  }

  for (const job of jobs) {
    await queue.upsertJobScheduler(
      job.name,
      { pattern: job.pattern, ...(job.tz ? { tz: job.tz } : {}) },
      { name: job.name, data: { trigger: 'schedule' } },
    )
  }
  console.log(`[${LABEL}] registered ${jobs.length} schedule(s) on queue "${QUEUE_NAME}"`)
}

// Replaces "run every job at startup". For each job that opts in (catchUpAfterSec) and HAS run
// before, queue a single run if its last success is older than that — one at a time, staggered, and
// de-duplicated per hour so a crash loop can't queue it over and over.
async function queueCatchUps() {
  const candidates = jobs.filter(j => j.catchUpAfterSec)
  if (!candidates.length) return
  let states = []
  try {
    states = await prisma.cronJobState.findMany({ where: { job: { in: candidates.map(j => j.name) } } })
  } catch (err) {
    console.error(`[${LABEL}] catch-up check failed:`, err?.message)
    return
  }
  const byJob = new Map(states.map(s => [s.job, s]))
  const hourBucket = Math.floor(Date.now() / 3_600_000)
  let n = 0
  for (const job of candidates) {
    const st = byJob.get(job.name)
    if (!st) continue // never ran under this system: wait for its normal slot
    const lastOk = st.lastSuccessAt ? st.lastSuccessAt.getTime() : 0
    if (Date.now() - lastOk <= job.catchUpAfterSec * 1000) continue
    await queue.add(
      job.name,
      { trigger: 'catchup' },
      { jobId: `catchup-${job.name}-${hourBucket}`, delay: 60_000 + n * 60_000 },
    )
    n++
    console.log(`[${LABEL}] ${job.name} is overdue — queued a catch-up run`)
  }
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const handler = JOB_HANDLERS[job.name]
    if (typeof handler !== 'function') {
      console.error(`[${LABEL}] unknown job "${job.name}" — ignoring`)
      return
    }
    await runLogged(job.name, () => handler(job.data), { trigger: job.data?.trigger || 'schedule' })
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    // Long jobs (Discord crawls) keep their lock alive by heartbeat; a generous lockDuration plus
    // maxStalledCount 0 means a briefly-blocked event loop fails the run instead of silently
    // running a non-idempotent job a second time.
    lockDuration: 5 * 60 * 1000,
    maxStalledCount: 0,
  },
)
worker.on('error', (err) => console.error(`[${LABEL}] worker error:`, err?.message))

// ── exact-time scheduled events (critical tier only) ────────────────────────────
let eventsWorker = null
if (TIER === TIER_CRITICAL) {
  eventsWorker = new Worker(
    SCHEDULED_EVENTS_QUEUE_NAME,
    async (job) => {
      const handler = SCHEDULED_EVENT_HANDLERS[job.name]
      if (typeof handler !== 'function') {
        console.error(`[${LABEL}] unknown scheduled event "${job.name}" — ignoring`)
        return
      }
      await runLogged(`event:${job.name}`, () => handler(job.data), { trigger: 'delayed' })
    },
    { connection: redisConnection, concurrency: 2, lockDuration: 5 * 60 * 1000, maxStalledCount: 0 },
  )
  eventsWorker.on('error', (err) => console.error(`[${LABEL}] events worker error:`, err?.message))
}

async function shutdown(signal) {
  console.log(`[${LABEL}] ${signal} — shutting down`)
  try {
    await Promise.all([worker.close(), eventsWorker?.close(), queue.close()].filter(Boolean))
  } catch {}
  try { await prisma.$disconnect() } catch {}
  process.exit(0)
}
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

await registerSchedules()
await queueCatchUps()
console.log(`[${LABEL}] ready (concurrency ${CONCURRENCY}; ${CRON_JOBS.length} jobs registered across both tiers)`)
