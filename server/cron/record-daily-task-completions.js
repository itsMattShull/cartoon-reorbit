// server/cron/record-daily-task-completions.js
// Thin entrypoint: the actual logic lives in server/utils/cmoon.js so every cMoon-scoring
// concern stays in one file (see that file's header comment on why). Scheduled every minute
// from server/cron/sync-guild-members.js — see the scoring-logic comment in
// server/utils/cmoon.js for why not just once daily (or every few hours).
//
// Overlap guard: a self-expiring lease (GlobalGameConfig.cMoonDailyTaskCronClaimedAt), not a
// Postgres session-scoped advisory lock like every other cron job in this directory uses — see
// that column's schema comment for why. This job runs every minute (far more often than any
// other advisory-lock user here), so it hits that pattern's rare connection-pooling race far more
// often, which is exactly this job's own recurring "stops running until the server is restarted"
// symptom. One atomic conditional UPDATE claims the lease; there is deliberately no separate
// unlock call (nothing to pin to a connection), so it self-heals within LEASE_SECONDS no matter
// how the previous run ended. A run that's merely slow (not crashed) losing its lease early and
// overlapping the next tick is still safe: every write below is independently idempotent
// (UserDailyTaskCompletion's unique (userId, date), CMoonScoreLog's unique award constraint), so
// two overlapping passes can only ever produce redundant no-op writes, never a double-award.
import { prisma } from '../prisma.js'
import { recordDailyTaskCompletions } from '../utils/cmoon.js'

const LEASE_SECONDS = 55 // just under the 60s tick interval — see header comment

export async function runRecordDailyTaskCompletions() {
  const claimed = await prisma.$queryRaw`
    UPDATE "GlobalGameConfig"
    SET "cMoonDailyTaskCronClaimedAt" = NOW()
    WHERE id = 'singleton'
      AND ("cMoonDailyTaskCronClaimedAt" IS NULL
        OR "cMoonDailyTaskCronClaimedAt" < NOW() - make_interval(secs => ${LEASE_SECONDS}))
    RETURNING id
  `
  if (!claimed.length) {
    console.log('[record-daily-task-completions] another run claimed the lease recently, skipping')
    return
  }
  const { recorded } = await recordDailyTaskCompletions()
  console.log(`[record-daily-task-completions] recorded ${recorded} completion(s)`)
}
