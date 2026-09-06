// server/utils/activeDailyTaskUsers.js
// "Active" for the Economy page's Net Points (7d) stat means: completed at
// least one item of the onboarding daily-task checklist (see
// server/api/onboarding/daily.get.js) on at least one day within the trailing
// 7-day window. Without this filter, Net Points sums every point issued to
// every account regardless of engagement, which inflates the number with
// points granted to accounts that did nothing that week (e.g. a passive
// admin/promo credit, or an account that never logged back in).
//
// Mirrors onboarding/daily.get.js's per-task completion rules exactly (same
// config sources, same "complete" thresholds and the same two daily-reset
// boundaries from dailyTaskWindows.js), just evaluated over every day in the
// trailing week and OR'd across tasks, instead of only "today" per task.
//
// Monster barcode scans are the one checklist item left out on purpose:
// UserBarcodeScan stores one upserted row per (user, mapping) with a single
// lastScannedAt, not a full per-scan log, so a past day's scan count can't be
// reconstructed from it after the fact — only "most recent scan" is knowable.
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/prisma'
import { COMBAT_POOL_GAME_NAMES } from './gamePoints'

const WINDOW = Prisma.sql`NOW() - INTERVAL '7 days'`

// Same boundary shift as getChicagoDailyBoundary()/getChicagoMorningWindowStart()
// in dailyTaskWindows.js: shift into Chicago local time, subtract the reset
// hour, then truncate to a calendar day — so everything since the last reset
// buckets into "today", not whatever UTC day it happened to land in.
const EIGHT_PM_BUCKET = Prisma.sql`date_trunc('day', ("createdAt" AT TIME ZONE 'America/Chicago') - INTERVAL '20 hours')`
const EIGHT_AM_BUCKET = Prisma.sql`date_trunc('day', ("createdAt" AT TIME ZONE 'America/Chicago') - INTERVAL '8 hours')`

/**
 * A Prisma.sql fragment selecting the distinct "userId"s who completed at
 * least one daily task on at least one day in the trailing 7 days. Meant to
 * be composed into a surrounding query, e.g.
 * `... WHERE "userId" IN (${await activeDailyTaskUsersFragment()})`.
 */
export async function activeDailyTaskUsersFragment() {
  const [globalConfig, winwheelConfig, lottoSettings] = await Promise.all([
    prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true, tkoDailyPointLimit: true, czoneVisitMaxPerDay: true }
    }),
    prisma.gameConfig.findUnique({ where: { gameName: 'Winwheel' }, select: { maxDailySpins: true } }),
    prisma.lottoSettings.findUnique({ where: { id: 'lotto' }, select: { countPerDay: true } })
  ])

  const dailyPointLimit = Number(globalConfig?.dailyPointLimit ?? 250)
  const tkoDailyPointLimit = Number(globalConfig?.tkoDailyPointLimit ?? 250)
  const czoneVisitMaxPerDay = Number(globalConfig?.czoneVisitMaxPerDay ?? 10)
  const winwheelMaxDailySpins = Number(winwheelConfig?.maxDailySpins ?? 0)
  // -1 means "unlimited" (never a completable "task"), same guard as onboarding/daily.get.js.
  const lottoCountPerDay = Number(lottoSettings?.countPerDay ?? 0)

  return Prisma.sql`
    -- Daily Login: any such PointsLog row already represents one fully
    -- completed Chicago-8pm-boundary day (the daily-points middleware only
    -- ever creates one per boundary), so no threshold/bucketing is needed.
    SELECT "userId" FROM "PointsLog"
     WHERE "method" = 'Daily Login' AND "createdAt" >= ${WINDOW}
    UNION
    SELECT "userId" FROM (
      SELECT "userId", ${EIGHT_PM_BUCKET} AS bucket, COUNT(*) AS cnt
        FROM "PointsLog"
       WHERE "method" = 'cZone Visit' AND "createdAt" >= ${WINDOW}
       GROUP BY "userId", bucket
    ) t WHERE ${czoneVisitMaxPerDay} > 0 AND cnt >= ${czoneVisitMaxPerDay}
    UNION
    SELECT "userId" FROM (
      SELECT "userId", ${EIGHT_PM_BUCKET} AS bucket, SUM("points") AS total
        FROM "GamePointLog"
       WHERE "createdAt" >= ${WINDOW}
         AND ("gameName" IS NULL OR "gameName" NOT IN (${Prisma.join(COMBAT_POOL_GAME_NAMES)}))
       GROUP BY "userId", bucket
    ) t WHERE ${dailyPointLimit} > 0 AND total >= ${dailyPointLimit}
    UNION
    SELECT "userId" FROM (
      SELECT "userId", ${EIGHT_PM_BUCKET} AS bucket, SUM("points") AS total
        FROM "GamePointLog"
       WHERE "createdAt" >= ${WINDOW}
         AND "gameName" IN (${Prisma.join(COMBAT_POOL_GAME_NAMES)})
       GROUP BY "userId", bucket
    ) t WHERE ${tkoDailyPointLimit} > 0 AND total >= ${tkoDailyPointLimit}
    UNION
    SELECT "userId" FROM (
      SELECT "userId", ${EIGHT_AM_BUCKET} AS bucket, COUNT(*) AS cnt
        FROM "WheelSpinLog"
       WHERE "createdAt" >= ${WINDOW} AND "status" <> 'failed'
       GROUP BY "userId", bucket
    ) t WHERE ${winwheelMaxDailySpins} > 0 AND cnt >= ${winwheelMaxDailySpins}
    UNION
    SELECT "userId" FROM (
      SELECT "userId", ${EIGHT_AM_BUCKET} AS bucket, COUNT(*) AS cnt
        FROM "LottoLog"
       WHERE "createdAt" >= ${WINDOW}
       GROUP BY "userId", bucket
    ) t WHERE ${lottoCountPerDay} > 0 AND cnt >= ${lottoCountPerDay}
  `
}
