// server/cron/cmoon-weekly-score.js
// Thin entrypoint: the actual logic lives in server/utils/cmoon.js so every cMoon-scoring
// concern stays in one file (see that file's header comment on why). Scheduled weekly from
// server/cron/sync-guild-members.js, once the current calendar week has started (see
// server/utils/centralTime.js's getWeekWindowStart) so it scores the week that just ended.
import { prisma } from '../prisma.js'
import { runWeeklyCMoonScoring } from '../utils/cmoon.js'

const LOCK_KEY = 519284802 // arbitrary constant unique to this job, for pg_try_advisory_lock

export async function runCMoonWeeklyScore() {
  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    console.log('[cmoon-weekly-score] another run already holds the lock, skipping')
    return
  }
  try {
    const { awarded } = await runWeeklyCMoonScoring()
    console.log(`[cmoon-weekly-score] applied ${awarded} award(s)`)
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
}
