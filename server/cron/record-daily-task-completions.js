// server/cron/record-daily-task-completions.js
// Thin entrypoint: the actual logic lives in server/utils/cmoon.js so every cMoon-scoring
// concern stays in one file (see that file's header comment on why). Scheduled every 4 hours
// from server/cron/sync-guild-members.js — see the scoring-logic comment in
// server/utils/cmoon.js for why not just once daily.
import { prisma } from '../prisma.js'
import { recordDailyTaskCompletions } from '../utils/cmoon.js'

const LOCK_KEY = 519284801 // arbitrary constant unique to this job, for pg_try_advisory_lock

export async function runRecordDailyTaskCompletions() {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[record-daily-task-completions] another run already holds the lock, skipping')
    return
  }
  try {
    const { recorded } = await recordDailyTaskCompletions()
    console.log(`[record-daily-task-completions] recorded ${recorded} completion(s)`)
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
}
