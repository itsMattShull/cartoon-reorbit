// server/cron/resolve-pending-daily-streaks.js
// Thin entrypoint: the actual logic lives in server/utils/dailyStreak.js's
// resolvePendingDailyStreaks (see that file's own header for why this job exists at all).
// Scheduled once daily, shortly after the Chicago 8am morning-task boundary (see
// server/cron/jobs.js) — a few minutes later than process-daily-streaks.js's own evening run,
// same reasoning: enough buffer that the window being resolved (which closes exactly AT 8am) is
// safely in the past by the time this queries it, with no risk of also picking up a spin/purchase
// from the brand-new morning window that started the moment the old one closed.
//
// Own lease pair (GlobalGameConfig.dailyStreakMorningCronClaimedAt/Token), separate from
// process-daily-streaks.js's — same lease-not-advisory-lock reasoning that file's own header
// comment gives, just never sharing a claim with the evening job despite both touching this same
// singleton row.
import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.js'
import { resolvePendingDailyStreaks } from '../utils/dailyStreak.js'

const LEASE_SECONDS = 1800 // generous headroom above any realistic run time, well under the 24h tick interval

export async function runResolvePendingDailyStreaks() {
  const token = randomUUID()
  const claimed = await prisma.$queryRaw`
    UPDATE "GlobalGameConfig"
    SET "dailyStreakMorningCronClaimedAt" = NOW(), "dailyStreakMorningCronClaimToken" = ${token}
    WHERE id = 'singleton'
      AND ("dailyStreakMorningCronClaimedAt" IS NULL
        OR "dailyStreakMorningCronClaimedAt" < NOW() - make_interval(secs => ${LEASE_SECONDS}))
    RETURNING id
  `
  if (!claimed.length) {
    console.log('[resolve-pending-daily-streaks] another run claimed the lease recently, skipping')
    return
  }
  try {
    const { processed, incremented, reset } = await resolvePendingDailyStreaks()
    console.log(`[resolve-pending-daily-streaks] resolved ${processed} pending user(s): ${incremented} incremented, ${reset} reset`)
    return processed ? `Resolved ${processed} pending user(s): ${incremented} incremented, ${reset} reset` : undefined
  } finally {
    await prisma.$queryRaw`
      UPDATE "GlobalGameConfig"
      SET "dailyStreakMorningCronClaimedAt" = NULL, "dailyStreakMorningCronClaimToken" = NULL
      WHERE id = 'singleton' AND "dailyStreakMorningCronClaimToken" = ${token}
    `
  }
}
