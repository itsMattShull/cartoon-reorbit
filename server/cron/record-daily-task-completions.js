// server/cron/record-daily-task-completions.js
// Thin entrypoint: the actual logic lives in server/utils/cmoon.js so every cMoon-scoring
// concern stays in one file (see that file's header comment on why). Scheduled every minute
// from server/cron/sync-guild-members.js — see the scoring-logic comment in
// server/utils/cmoon.js for why not just once daily (or every few hours).
//
// Overlap guard: a lease (GlobalGameConfig.cMoonDailyTaskCronClaimedAt), not a Postgres
// session-scoped advisory lock like every other cron job in this directory uses — see that
// column's schema comment for why. This job runs every minute (far more often than any other
// advisory-lock user here), so it hits that pattern's rare connection-pooling race far more
// often, which is exactly this job's own recurring "stops running until the server is restarted"
// symptom.
//
// Claim is one atomic conditional UPDATE; release is a second UPDATE guarded by the exact
// timestamp THIS run's own claim wrote (`claimedAt`), not an unconditional clear — so a run that
// finishes late, after its lease has already expired and been re-claimed by a newer run, can't
// clobber that newer run's still-active claim. Both are plain column writes with no session/
// connection affinity requirement at all (unlike an advisory lock), so there's nothing for
// connection pooling to break here.
//
// The explicit release (not just letting every run's lease expire on its own after
// LEASE_SECONDS) matters at scale: a run that's merely slow, not actually stuck, still finishes
// and releases well inside one lease window in the overwhelmingly common case, so the very next
// scheduled tick starts with a clean slate rather than skipping. Only a run that's genuinely
// hung (never reaches the `finally` at all) leans on the TTL — and even then, a hung run's own
// connection stays busy until ITS query finally returns or its connection is reaped, so only ONE
// new attempt can be admitted per lease window, not one per minute — a hung run can't cause new
// attempts to pile up faster than the lease window allows. Every write recordDailyTaskCompletions
// makes is independently idempotent regardless (UserDailyTaskCompletion's unique (userId, date),
// CMoonScoreLog's unique award constraint), so even a genuine overlap can only ever produce
// redundant no-op writes, never a double-award.
import { prisma } from '../prisma.js'
import { recordDailyTaskCompletions } from '../utils/cmoon.js'

const LEASE_SECONDS = 240 // generous headroom above any realistic run time — see header comment

export async function runRecordDailyTaskCompletions() {
  const claimed = await prisma.$queryRaw`
    UPDATE "GlobalGameConfig"
    SET "cMoonDailyTaskCronClaimedAt" = NOW()
    WHERE id = 'singleton'
      AND ("cMoonDailyTaskCronClaimedAt" IS NULL
        OR "cMoonDailyTaskCronClaimedAt" < NOW() - make_interval(secs => ${LEASE_SECONDS}))
    RETURNING "cMoonDailyTaskCronClaimedAt" AS "claimedAt"
  `
  if (!claimed.length) {
    console.log('[record-daily-task-completions] another run claimed the lease recently, skipping')
    return
  }
  const { claimedAt } = claimed[0]
  try {
    const { recorded } = await recordDailyTaskCompletions()
    console.log(`[record-daily-task-completions] recorded ${recorded} completion(s)`)
  } finally {
    await prisma.$queryRaw`
      UPDATE "GlobalGameConfig"
      SET "cMoonDailyTaskCronClaimedAt" = NULL
      WHERE id = 'singleton' AND "cMoonDailyTaskCronClaimedAt" = ${claimedAt}
    `
  }
}
