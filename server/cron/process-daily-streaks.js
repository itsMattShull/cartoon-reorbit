// server/cron/process-daily-streaks.js
// Thin entrypoint: the actual logic lives in server/utils/dailyStreak.js (see that file's own
// header on why). Scheduled once daily, shortly after the Chicago 8pm daily-task boundary (see
// server/cron/jobs.js) — the same convention record-daily-task-completions.js documents for its
// own lease, copied verbatim here: a lease (GlobalGameConfig.dailyStreakCronClaimedAt/Token), not
// a Postgres advisory lock, specifically because this job also does many per-user transactional
// writes (User, DailyStreakClaim, CMoonScoreLog) across a run that can take a while for a large
// candidate set, and an advisory lock's connection-affinity pitfall (see that file's own comment)
// is exactly the kind of failure mode a job like this should not risk.
//
// Every write processDailyStreaks() makes is independently idempotent regardless
// (User.dailyStreakLastBoundary gates the increment/reset decision per boundary,
// DailyStreakClaim's unique (userId, streakDay) constraint gates the reward grant specifically),
// so even a genuine lease-overlap could only ever produce redundant no-op work, never a double
// grant or a double-reset.
import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.js'
import { processDailyStreaks } from '../utils/dailyStreak.js'

const LEASE_SECONDS = 1800 // generous headroom above any realistic run time, well under the 24h tick interval

export async function runProcessDailyStreaks() {
  const token = randomUUID()
  const claimed = await prisma.$queryRaw`
    UPDATE "GlobalGameConfig"
    SET "dailyStreakCronClaimedAt" = NOW(), "dailyStreakCronClaimToken" = ${token}
    WHERE id = 'singleton'
      AND ("dailyStreakCronClaimedAt" IS NULL
        OR "dailyStreakCronClaimedAt" < NOW() - make_interval(secs => ${LEASE_SECONDS}))
    RETURNING id
  `
  if (!claimed.length) {
    console.log('[process-daily-streaks] another run claimed the lease recently, skipping')
    return
  }
  try {
    const { processed, incremented, reset, deferred } = await processDailyStreaks()
    console.log(`[process-daily-streaks] processed ${processed} user(s): ${incremented} incremented, ${reset} reset, ${deferred} deferred to the morning resolution pass`)
    return processed ? `Processed ${processed} user(s): ${incremented} incremented, ${reset} reset, ${deferred} deferred` : undefined
  } finally {
    await prisma.$queryRaw`
      UPDATE "GlobalGameConfig"
      SET "dailyStreakCronClaimedAt" = NULL, "dailyStreakCronClaimToken" = NULL
      WHERE id = 'singleton' AND "dailyStreakCronClaimToken" = ${token}
    `
  }
}
