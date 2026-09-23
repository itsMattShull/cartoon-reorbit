// server/api/admin/cmoons/run-scoring-now.post.js
// Manually triggers the once-daily HIGH_SCORE/TOP10 scoring pass (runDailyCMoonScoring) right
// now, bypassing checkAndRunCMoonDailyScoring's "already ran today" gate — that gate only exists
// to stop the automated 5-minute checker from re-firing itself, not to stop an admin from
// deliberately asking for another pass. Safe to click any time, including right after a normal
// automated run already happened today: runDailyCMoonScoring's own per-(cMoonId, userId,
// category, detail) "already credited today" guard means anyone already awarded earlier today is
// skipped, so this only ever fills in genuine gaps (e.g. from GlobalGameConfig.
// cMoonScoringRunHour/Minute having been changed mid-day, see that guard's own comment) — it can
// never double-award. Reuses the scheduled checker's own advisory lock so the two can never run
// concurrently and race each other.
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { runDailyCMoonScoring } from '@/server/utils/cmoon'
import { LOCK_KEY } from '@/server/cron/cmoon-daily-score'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const [{ locked }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint) AS locked`
  if (!locked) {
    throw createError({ statusCode: 409, statusMessage: 'A scoring run is already in progress — try again shortly.' })
  }
  try {
    const result = await runDailyCMoonScoring()
    return result
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`
  }
})
