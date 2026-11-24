// Real-Postgres coverage for the two batch (set-based SQL, not per-user-loop) completeness
// checks in server/utils/dailyTaskStatus.js: computeBatchDailyTaskCompleteness (used by
// processDailyStreaks' evening pass) and computeBatchMorningCompleteness (used by
// resolvePendingDailyStreaks' closed-window morning pass). These exist specifically so
// server/utils/dailyStreak.js's cron never does one Prisma round trip per candidate user to
// decide who qualifies — mirroring server/utils/cmoon.js's own daily-task cron
// (recordDailyTaskCompletions), which has always computed its whole candidate set in one query
// for the same reason. tests/dailyStreakProcessing.db.test.js and
// tests/dailyStreakDeferredMorningTasks.db.test.js already exercise these indirectly through the
// cron functions themselves; this file checks the two batch functions directly, several users at
// once, so a future change to the SQL can't silently regress without a dedicated red test.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser } from './helpers/dbKit.js'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from '../server/utils/dailyTaskWindows.js'

const run = skipUnlessDb ? test.skip : test
let prisma, computeBatchDailyTaskCompleteness, computeBatchMorningCompleteness, fetchTaskConfig

let boundary, windowStart, morningWindowStart
let originalWinwheel, originalLotto, originalGlobalConfig

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ computeBatchDailyTaskCompleteness, computeBatchMorningCompleteness, fetchTaskConfig } = await import('../server/utils/dailyTaskStatus.js'))

  const now = new Date()
  boundary = getChicagoDailyBoundary(now)
  const justBeforeBoundary = new Date(boundary.getTime() - 1)
  windowStart = getChicagoDailyBoundary(justBeforeBoundary)
  morningWindowStart = getChicagoMorningWindowStart(justBeforeBoundary)

  originalWinwheel = await prisma.gameConfig.findUnique({ where: { gameName: 'Winwheel' } })
  originalLotto = await prisma.lottoSettings.findUnique({ where: { id: 'lotto' } })
  originalGlobalConfig = await prisma.globalGameConfig.findUnique({
    where: { id: 'singleton' },
    select: { czoneVisitMaxPerDay: true, dailyPointLimit: true, tkoDailyPointLimit: true }
  })
  // Disable the three OTHER evening tasks for the whole file so "eveningComplete" reduces to
  // just the Daily Login check each test actually means to isolate — these tests care about the
  // batch SQL's own boundary/threshold mechanics, not this shared DB's real czone/game-point
  // configuration.
  await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: { czoneVisitMaxPerDay: 0, dailyPointLimit: 0, tkoDailyPointLimit: 0 } })
})

after(async () => {
  if (skipUnlessDb) return
  if (originalWinwheel) await prisma.gameConfig.update({ where: { gameName: 'Winwheel' }, data: { maxDailySpins: originalWinwheel.maxDailySpins } })
  else await prisma.gameConfig.deleteMany({ where: { gameName: 'Winwheel' } })
  if (originalLotto) await prisma.lottoSettings.update({ where: { id: 'lotto' }, data: { countPerDay: originalLotto.countPerDay } })
  else await prisma.lottoSettings.deleteMany({ where: { id: 'lotto' } })
  if (originalGlobalConfig) await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: originalGlobalConfig })
  await prisma.$disconnect()
})

async function enableLotto(countPerDay) {
  await prisma.lottoSettings.upsert({ where: { id: 'lotto' }, create: { id: 'lotto', countPerDay }, update: { countPerDay } })
}
async function enableWinwheel(maxDailySpins) {
  await prisma.gameConfig.upsert({ where: { gameName: 'Winwheel' }, create: { gameName: 'Winwheel', maxDailySpins }, update: { maxDailySpins } })
}

run('computeBatchDailyTaskCompleteness evaluates several users in one call, each independently', async () => {
  await enableWinwheel(0)
  await enableLotto(0) // both disabled: morningComplete is vacuously true for everyone here
  const config = await fetchTaskConfig(prisma)

  const loggedIn = await mkUser(prisma)
  const neverLoggedIn = await mkUser(prisma)
  const evening = new Date(boundary.getTime() - 60_000)
  await prisma.pointsLog.create({ data: { userId: loggedIn.id, points: 500, total: 500, method: 'Daily Login', direction: 'increase', createdAt: evening } })

  const map = await computeBatchDailyTaskCompleteness(prisma, [loggedIn.id, neverLoggedIn.id], {
    dailyWindowStart: windowStart, windowEnd: boundary, morningWindowStart, config
  })

  assert.equal(map.get(loggedIn.id).eveningComplete, true)
  assert.equal(map.get(loggedIn.id).morningComplete, true)
  assert.equal(map.get(neverLoggedIn.id).eveningComplete, false) // no login row at all
  assert.equal(map.get(neverLoggedIn.id).morningComplete, true) // both morning tasks disabled
})

run('computeBatchDailyTaskCompleteness treats a login outside the window as incomplete, and respects exact thresholds', async () => {
  await enableWinwheel(0)
  await enableLotto(0)
  const config = await fetchTaskConfig(prisma)

  const user = await mkUser(prisma)
  // A login BEFORE windowStart must not count.
  await prisma.pointsLog.create({ data: { userId: user.id, points: 500, total: 500, method: 'Daily Login', direction: 'increase', createdAt: new Date(windowStart.getTime() - 60_000) } })

  const before = await computeBatchDailyTaskCompleteness(prisma, [user.id], { dailyWindowStart: windowStart, windowEnd: boundary, morningWindowStart, config })
  assert.equal(before.get(user.id).eveningComplete, false)

  // A login exactly at windowStart (inclusive lower bound) must count.
  await prisma.pointsLog.create({ data: { userId: user.id, points: 500, total: 500, method: 'Daily Login', direction: 'increase', createdAt: windowStart } })
  const atStart = await computeBatchDailyTaskCompleteness(prisma, [user.id], { dailyWindowStart: windowStart, windowEnd: boundary, morningWindowStart, config })
  assert.equal(atStart.get(user.id).eveningComplete, true)
})

run('computeBatchDailyTaskCompleteness resolves Lotto from the LIVE LottoUser counter (not LottoLog) when no morningWindowEnd is capped', async () => {
  await enableWinwheel(0)
  await enableLotto(1)
  const config = await fetchTaskConfig(prisma)

  const satisfied = await mkUser(prisma)
  await prisma.pointsLog.create({ data: { userId: satisfied.id, points: 500, total: 500, method: 'Daily Login', direction: 'increase', createdAt: new Date(boundary.getTime() - 60_000) } })
  await prisma.lottoUser.create({ data: { userId: satisfied.id, purchasesToday: 1, lastReset: morningWindowStart } })

  const unsatisfied = await mkUser(prisma)
  await prisma.pointsLog.create({ data: { userId: unsatisfied.id, points: 500, total: 500, method: 'Daily Login', direction: 'increase', createdAt: new Date(boundary.getTime() - 60_000) } })
  // No LottoUser row at all -- must resolve to false, not throw or null-propagate.

  const map = await computeBatchDailyTaskCompleteness(prisma, [satisfied.id, unsatisfied.id], { dailyWindowStart: windowStart, windowEnd: boundary, morningWindowStart, config })
  assert.equal(map.get(satisfied.id).morningComplete, true)
  assert.equal(map.get(unsatisfied.id).morningComplete, false)
})

run('computeBatchMorningCompleteness resolves Lotto from LottoLog (not the live counter) for a CLOSED window, ignoring activity outside it', async () => {
  await enableWinwheel(0)
  await enableLotto(1)
  const config = await fetchTaskConfig(prisma)

  const morningWindowEnd = new Date(morningWindowStart.getTime() + 12 * 3600 * 1000)
  const inWindow = await mkUser(prisma)
  await prisma.lottoLog.create({ data: { userId: inWindow.id, outcome: 'NOTHING', oddsBefore: 1, oddsAfter: 1, createdAt: new Date(morningWindowStart.getTime() + 60_000) } })

  const outsideWindow = await mkUser(prisma)
  await prisma.lottoLog.create({ data: { userId: outsideWindow.id, outcome: 'NOTHING', oddsBefore: 1, oddsAfter: 1, createdAt: new Date(morningWindowEnd.getTime() + 60_000) } })

  const map = await computeBatchMorningCompleteness(prisma, [inWindow.id, outsideWindow.id], { morningWindowStart, morningWindowEnd, config })
  assert.equal(map.get(inWindow.id), true)
  assert.equal(map.get(outsideWindow.id), false)
})

run('both batch functions return an empty Map for an empty id list, without querying (and so without needing config)', async () => {
  const a = await computeBatchDailyTaskCompleteness(prisma, [], { dailyWindowStart: windowStart, windowEnd: boundary, morningWindowStart, config: undefined })
  const b = await computeBatchMorningCompleteness(prisma, [], { morningWindowStart, morningWindowEnd: boundary, config: undefined })
  assert.equal(a.size, 0)
  assert.equal(b.size, 0)
})
