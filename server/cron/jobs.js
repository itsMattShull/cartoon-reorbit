// server/cron/jobs.js
//
// Metadata for every recurring background job — PURE DATA, no imports, so both the schedulers
// (server/cron/scheduler.js) and the admin Cron Run Logs API can read it without pulling in Prisma,
// Discord, or BullMQ. The matching functions live in server/cron/jobHandlers.js (JOB_HANDLERS),
// keyed by `name`; tests/cronJobsRegistry.test.js keeps the two in sync.
//
// Two tiers, each its own PM2 process + BullMQ queue (see ecosystem.config.cjs):
//   critical    — cheap, time-sensitive jobs (packs going live, AuctionOnly go-live, announcements,
//                 tournaments, the daily-achievements enqueue, cMoon scoring). Runs several jobs at
//                 once and NEVER shares a process with the slow Discord/aggregate work below, so a
//                 long maintenance job can't delay one of these.
//   maintenance — heavy / slow / Discord-API-bound jobs (guild sync, role grants, inactivity
//                 sweeps, full-table recomputes, aggregates). One job at a time, on purpose: it
//                 serializes the big DB writers instead of letting them pile onto the pool together.
//
// Fields
//   pattern / tz     cron expression (5-field) and optional IANA zone. No tz = the server's local zone,
//                    exactly what node-cron did for the jobs that had none.
//   intervalSec      the longest gap that is normal between two successful runs; the admin page flags
//                    a job "late" when it has gone more than 2x this (+ a small grace) without one.
//   quiet            high-frequency checker: a clean run is NOT written to CronRunLog (the per-job
//                    CronJobState row is still updated), only failures / skips / slow runs are.
//   catchUpAfterSec  on scheduler start, a job whose last success is older than this is queued once
//                    (staggered) instead of waiting for its next slot. Replaces "run everything at
//                    startup". A job that has never run under this system is NOT caught up.

export const TIER_CRITICAL = 'critical'
export const TIER_MAINTENANCE = 'maintenance'

const CHI = 'America/Chicago'
const DAY = 86400

export const CRON_JOBS = [
  // ── critical ────────────────────────────────────────────────────────────────
  { name: 'markScheduledPacksInCmart', tier: TIER_CRITICAL, pattern: '*/5 * * * *', intervalSec: 300, quiet: true,
    description: 'Safety-net sweep: puts scheduled packs in cMart / takes them off (exact timing comes from delayed jobs)' },
  { name: 'sendDueAnnouncements', tier: TIER_CRITICAL, pattern: '1-59/5 * * * *', intervalSec: 300, quiet: true,
    description: 'Posts due announcements to Discord' },
  { name: 'startDueAuctions', tier: TIER_CRITICAL, pattern: '2-59/5 * * * *', intervalSec: 300, quiet: true,
    description: 'Activates AuctionOnly rows whose start time has passed' },
  { name: 'requeueOverdueDissolveLaunches', tier: TIER_CRITICAL, pattern: '7-59/10 * * * *', intervalSec: 600, quiet: true,
    description: 'Safety-net sweep: relaunches past-due dissolve-queue auctions whose delayed job was lost or failed (exact timing comes from delayed jobs)' },
  { name: 'reconcileHolidayRedemptions', tier: TIER_CRITICAL, pattern: '3-59/5 * * * *', intervalSec: 300, quiet: true,
    description: 'Reconciles Holiday Item redemptions' },
  { name: 'cmoonDailyScoreCheck', tier: TIER_CRITICAL, pattern: '4-59/5 * * * *', tz: CHI, intervalSec: 300, quiet: true,
    description: 'Runs cMoon daily scoring once the configured time of day is reached' },
  { name: 'updateWinballGrandPrizeFromSchedule', tier: TIER_CRITICAL, pattern: '5-59/5 * * * *', intervalSec: 300, quiet: true,
    description: 'Safety-net sweep: sets the current Winball grand prize from its schedule (exact timing comes from delayed jobs)' },
  { name: 'runTournamentCron', tier: TIER_CRITICAL, pattern: '7,22,37,52 * * * *', intervalSec: 900, quiet: true,
    description: 'Advances gToons tournaments (state, announcements, matches, rounds)' },
  { name: 'runOgGtoonTournamentCron', tier: TIER_CRITICAL, pattern: '12,27,42,57 * * * *', intervalSec: 900, quiet: true,
    description: 'Advances OG gToons tournaments (opt-in windows, deadlines, reminders, rounds, prizes) — a safety net behind the instant advance after each game' },
  { name: 'recordDailyTaskCompletions', tier: TIER_CRITICAL, pattern: '8,38 * * * *', tz: CHI, intervalSec: 1800, quiet: true,
    description: 'Records cMoon daily-task completions' },
  { name: 'checkAndCreateWeeklyCZoneContest', tier: TIER_CRITICAL, pattern: '* * * * *', tz: CHI, intervalSec: 60, quiet: true,
    description: 'Creates the weekly cZone contest when it is time' },
  { name: 'checkAndPostWeeklyRiddle', tier: TIER_CRITICAL, pattern: '* * * * *', tz: CHI, intervalSec: 60, quiet: true,
    description: 'Posts the weekly cMoon riddle when it is time' },
  { name: 'checkAndPostWeeklyCMoonRecap', tier: TIER_CRITICAL, pattern: '* * * * *', tz: CHI, intervalSec: 60, quiet: true,
    description: 'Posts each cMoon\'s weekly top-slayer recap when it is time' },
  { name: 'runCMoonPointsAggregate', tier: TIER_CRITICAL, pattern: '10,40 * * * *', intervalSec: 1800, catchUpAfterSec: 5400,
    description: 'Recomputes cMoon points and queues achievement checks for whoever changed' },
  { name: 'enqueueAchievementsDaily', tier: TIER_CRITICAL, pattern: '0 3 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Queues the daily achievements check for every active user' },

  // ── maintenance ─────────────────────────────────────────────────────────────
  { name: 'syncGuildMembers', tier: TIER_MAINTENANCE, pattern: '0 0 * * *', intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Syncs Discord guild membership, booster status and nicknames' },
  { name: 'recordDailyActivity', tier: TIER_MAINTENANCE, pattern: '30 2 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Rolls yesterday\'s activity into UserDailyActivity' },
  { name: 'syncVerifiedRoles', tier: TIER_MAINTENANCE, pattern: '35 2 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Grants the Discord Verified role' },
  { name: 'syncCMoonDiscordRoles', tier: TIER_MAINTENANCE, pattern: '45 2 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Grants cMoon and cMoon-rank Discord roles' },
  { name: 'sendInactivityWarnings', tier: TIER_MAINTENANCE, pattern: '0 3 * * *', intervalSec: DAY,
    description: 'DMs 6/7/8-month inactivity warnings' },
  { name: 'recomputeLastActivity', tier: TIER_MAINTENANCE, pattern: '0 4 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Recomputes User.lastActivity in batches' },
  { name: 'enforceDormantAccounts', tier: TIER_MAINTENANCE, pattern: '0 4 * * *', intervalSec: DAY,
    description: 'Disables 9-month-inactive accounts and queues their cToons for dissolve auctions' },
  { name: 'runEconomyAggregate', tier: TIER_MAINTENANCE, pattern: '10 4 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Economy page price/volume aggregation' },
  { name: 'runCzoneDisplayCountAggregate', tier: TIER_MAINTENANCE, pattern: '0 5 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Recomputes Ctoon.czoneDisplayCount' },
  { name: 'syncWordleResultsDaily', tier: TIER_MAINTENANCE, pattern: '0 10 * * *', tz: CHI, intervalSec: DAY, catchUpAfterSec: 30 * 3600,
    description: 'Syncs Wordle crown results from Discord' },
  { name: 'pruneCronRunLogs', tier: TIER_MAINTENANCE, pattern: '30 5 * * *', tz: CHI, intervalSec: DAY,
    description: 'Deletes old Cron Run Logs' },
]

export const CRON_JOBS_BY_NAME = Object.fromEntries(CRON_JOBS.map(j => [j.name, j]))

// BullMQ queue a tier's schedulers and worker use (shared by server/cron/scheduler.js and the admin
// Queue Monitor, which has to open the same queues).
export function cronQueueName(tier) {
  return process.env[`CRON_${String(tier).toUpperCase()}_QUEUE_KEY`] || `cron${tier[0].toUpperCase()}${tier.slice(1)}`
}

export function jobsForTier(tier) {
  return CRON_JOBS.filter(j => j.tier === tier)
}

// A run counts as slow enough to be logged even for a `quiet` job.
export const QUIET_JOB_LOG_THRESHOLD_MS = 2000
