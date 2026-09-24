// server/cron/record-daily-task-completions.js
// Thin entrypoint: the actual logic lives in server/utils/cmoon.js so every cMoon-scoring
// concern stays in one file (see that file's header comment on why). Scheduled every 30 minutes
// from server/cron/sync-guild-members.js — see the scoring-logic comment there for why 30
// minutes rather than once daily.
//
// Overlap guard: a lease (GlobalGameConfig.cMoonDailyTaskCronClaimedAt), not a Postgres
// session-scoped advisory lock like every other cron job in this directory uses — see that
// column's schema comment for why. This job originally ran every minute, far more often than any
// other advisory-lock user here, and hit that pattern's rare connection-pooling race often enough
// to be this job's own recurring "stops running until the server is restarted" symptom — the race
// itself isn't tied to any particular interval (any tick can hit it), so the lease stays even now
// that this runs less often than several of its neighbors.
//
// Claim is one atomic conditional UPDATE; release is a second UPDATE guarded by a fresh random
// token THIS run generated and wrote as part of its own claim, not an unconditional clear — so a
// run that finishes late, after its lease has already expired and been re-claimed by a newer run,
// can't clobber that newer run's still-active claim (its own stale token no longer matches what's
// stored). The token — not the claimed-at timestamp itself — is what ownership is compared on:
// a timestamp round-tripped out through Prisma and back into a fresh query's parameter depends on
// the DB session's timezone setting to compare equal again, while a plain opaque string never
// does. Staleness is still checked via NOW() against the timestamp, but only ever within the SAME
// statement that reads it, which is safe regardless of session timezone. Both claim and release
// are plain column writes with no session/connection affinity requirement at all (unlike an
// advisory lock), so there's nothing for connection pooling to break here.
//
// The explicit release (not just letting every run's lease expire on its own after
// LEASE_SECONDS) matters at scale: a run that's merely slow, not actually stuck, still finishes
// and releases well inside one lease window in the overwhelmingly common case, so the very next
// scheduled tick starts with a clean slate rather than skipping. Only a run that's genuinely
// hung (never reaches the `finally` at all) leans on the TTL — and even then, a hung run's own
// connection stays busy until ITS query finally returns or its connection is reaped, so only ONE
// new attempt can be admitted per lease window — a hung run can't cause new attempts to pile up
// faster than the lease window allows, regardless of how often this job is scheduled. Every write
// recordDailyTaskCompletions makes is independently idempotent regardless (UserDailyTaskCompletion's
// unique (userId, date), CMoonScoreLog's unique award constraint), so even a genuine overlap can
// only ever produce redundant no-op writes, never a double-award.
import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.js'
import { recordDailyTaskCompletions } from '../utils/cmoon.js'

const LEASE_SECONDS = 240 // generous headroom above any realistic run time, well under the 30-minute tick interval

export async function runRecordDailyTaskCompletions() {
  const token = randomUUID()
  const claimed = await prisma.$queryRaw`
    UPDATE "GlobalGameConfig"
    SET "cMoonDailyTaskCronClaimedAt" = NOW(), "cMoonDailyTaskCronClaimToken" = ${token}
    WHERE id = 'singleton'
      AND ("cMoonDailyTaskCronClaimedAt" IS NULL
        OR "cMoonDailyTaskCronClaimedAt" < NOW() - make_interval(secs => ${LEASE_SECONDS}))
    RETURNING id
  `
  if (!claimed.length) {
    console.log('[record-daily-task-completions] another run claimed the lease recently, skipping')
    return
  }
  try {
    const { recorded } = await recordDailyTaskCompletions()
    console.log(`[record-daily-task-completions] recorded ${recorded} completion(s)`)
  } finally {
    await prisma.$queryRaw`
      UPDATE "GlobalGameConfig"
      SET "cMoonDailyTaskCronClaimedAt" = NULL, "cMoonDailyTaskCronClaimToken" = NULL
      WHERE id = 'singleton' AND "cMoonDailyTaskCronClaimToken" = ${token}
    `
  }
}
