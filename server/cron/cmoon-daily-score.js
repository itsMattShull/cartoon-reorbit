// server/cron/cmoon-daily-score.js
// Thin entrypoint: the actual scoring logic lives in server/utils/cmoon.js so every cMoon-scoring
// concern stays in one file (see that file's header comment on why). Scheduled frequently
// (server/cron/sync-guild-members.js runs checkAndRunCMoonDailyScoring every 5 minutes) rather
// than at a single fixed cron time, since the run time itself is now admin-adjustable
// (GlobalGameConfig.cMoonScoringRunHour/Minute, Admin > cMoons > Scoring Rules) instead of a
// hardcoded "Monday 02:50 CST" — this checker just fires the real job the first tick on-or-after
// that configured time each day.
import { DateTime } from 'luxon'
import { prisma } from '../prisma.js'
import { getGlobalConfig, invalidateGlobalConfigCache, runDailyCMoonScoring } from '../utils/cmoon.js'

// Exported so a manual admin-triggered run (server/api/admin/cmoons/run-scoring-now.post.js) can
// hold the SAME lock and never overlap with the scheduled checker below.
export const LOCK_KEY = 519284802 // arbitrary constant unique to this job, for pg_try_advisory_lock

export async function checkAndRunCMoonDailyScoring() {
  // The cached getter (30s TTL) is deliberate here: this checker ticks every 5 minutes purely to
  // compare a time-of-day, so there's no reason to force a fresh row read on every single tick.
  const config = await getGlobalConfig()
  if (!config?.cMoonEnabled) return

  const chicagoNow = DateTime.now().setZone('America/Chicago')
  const today = chicagoNow.toISODate()
  const targetHour = Number.isInteger(config.cMoonScoringRunHour) ? config.cMoonScoringRunHour : 0
  const targetMinute = Number.isInteger(config.cMoonScoringRunMinute) ? config.cMoonScoringRunMinute : 0
  const reachedTargetTime =
    chicagoNow.hour > targetHour ||
    (chicagoNow.hour === targetHour && chicagoNow.minute >= targetMinute)

  // Cheap pre-check outside the lock — on almost every one of the 288 ticks/day this is false
  // (either already ran today, or the target time hasn't arrived yet) and nothing else runs.
  if (!reachedTargetTime || config.cMoonScoringLastRunDate === today) return

  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[cmoon-daily-score] another run already holds the lock, skipping')
    return
  }
  try {
    // Re-read + re-check INSIDE the lock: the outside-lock check above is only an optimization
    // to skip the lock entirely on most ticks, not the actual guard. Without this re-check, two
    // overlapping ticks that both read "not run today" before either had stamped the date could
    // otherwise both pass the outer check, and the second would acquire the lock right after the
    // first releases it, re-running (and double-awarding a day of) HIGH_SCORE/TOP10.
    const fresh = await getGlobalConfig({ fresh: true })
    if (fresh?.cMoonScoringLastRunDate === today) return

    const { awarded } = await runDailyCMoonScoring()
    console.log(`[cmoon-daily-score] applied ${awarded} award(s)`)

    await prisma.globalGameConfig.update({
      where: { id: 'singleton' },
      data: { cMoonScoringLastRunDate: today },
    })
    invalidateGlobalConfigCache()
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
}
