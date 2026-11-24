// Real-Postgres coverage for the two-phase Daily Streak evaluation: processDailyStreaks() defers
// the increment/reset verdict (User.dailyStreakPendingBoundary) when a player has finished every
// EVENING-rooted task but an enabled Winwheel/Lotto task is still outstanding at the 8pm cron —
// that task's real deadline is 8am the next morning, not tonight — and resolvePendingDailyStreaks()
// finishes the verdict once that window has actually closed. See server/utils/dailyStreak.js's
// own header comment for the full design and why this exists (a player who reset to 0 before
// their actual deadline, just because they hadn't done their nightly spin/lotto YET by 8pm).
//
// Winwheel/Lotto are both disabled (limit 0) by default in this test DB (confirmed by
// tests/dailyStreakProcessing.db.test.js's own threshold read) — this file temporarily enables
// one or the other per test via GameConfig('Winwheel')/LottoSettings('lotto'), restoring whatever
// was there before (including "didn't exist") in `after`, so it can't leak into any other test
// file sharing this database.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, pointsOf } from './helpers/dbKit.js'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from '../server/utils/dailyTaskWindows.js'

const run = skipUnlessDb ? test.skip : test
let prisma, processDailyStreaks, resolvePendingDailyStreaks

let boundary, justBeforeBoundary, windowStart, morningBoundary, justBeforeMorningBoundary, morningNow, eveningCallNow
let originalWinwheel, originalLotto

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ processDailyStreaks, resolvePendingDailyStreaks } = await import('../server/utils/dailyStreak.js'))

  const eveningNow = new Date()
  boundary = getChicagoDailyBoundary(eveningNow)
  justBeforeBoundary = new Date(boundary.getTime() - 1)
  windowStart = getChicagoDailyBoundary(justBeforeBoundary)
  // 5 minutes after `boundary`, mirroring the real cron's own buffer, and -- critically -- AFTER
  // boundary, not before it: getChicagoDailyBoundary(asOf) resolves to the most recent 8pm AT OR
  // BEFORE asOf, so an asOf still a minute short of 8pm would resolve to YESTERDAY's boundary.
  eveningCallNow = new Date(boundary.getTime() + 5 * 60 * 1000)
  // +14h robustly lands on the NEXT 8am after `boundary` regardless of a ±1h DST shift in
  // between (a plain +12h could undershoot on a fall-back night, landing short of 8am).
  morningBoundary = getChicagoMorningWindowStart(new Date(boundary.getTime() + 14 * 3600 * 1000))
  justBeforeMorningBoundary = new Date(morningBoundary.getTime() - 1)
  // 5 minutes past the boundary, mirroring the real cron's own buffer — safely inside
  // [morningBoundary, morningBoundary + 24h) so getChicagoMorningWindowStart(morningNow) resolves
  // back to this exact morningBoundary.
  morningNow = new Date(morningBoundary.getTime() + 5 * 60 * 1000)

  originalWinwheel = await prisma.gameConfig.findUnique({ where: { gameName: 'Winwheel' } })
  originalLotto = await prisma.lottoSettings.findUnique({ where: { id: 'lotto' } })
})

after(async () => {
  if (skipUnlessDb) return
  if (originalWinwheel) {
    await prisma.gameConfig.update({ where: { gameName: 'Winwheel' }, data: { maxDailySpins: originalWinwheel.maxDailySpins } })
  } else {
    await prisma.gameConfig.deleteMany({ where: { gameName: 'Winwheel' } })
  }
  if (originalLotto) {
    await prisma.lottoSettings.update({ where: { id: 'lotto' }, data: { countPerDay: originalLotto.countPerDay } })
  } else {
    await prisma.lottoSettings.deleteMany({ where: { id: 'lotto' } })
  }
  await prisma.$disconnect()
})

async function enableLotto(countPerDay = 1) {
  await prisma.lottoSettings.upsert({
    where: { id: 'lotto' },
    create: { id: 'lotto', countPerDay },
    update: { countPerDay }
  })
}
async function enableWinwheel(maxDailySpins = 1) {
  await prisma.gameConfig.upsert({
    where: { gameName: 'Winwheel' },
    create: { gameName: 'Winwheel', maxDailySpins },
    update: { maxDailySpins }
  })
}
// Each test explicitly disables the OTHER morning task (rather than relying on the default-off
// state another test in this same file may have already changed) so allEnabledMorningTasksComplete
// only ever has the one task this test means to exercise in play.
const disableLotto = () => enableLotto(0)
const disableWinwheel = () => enableWinwheel(0)

async function mkStreakUser(dailyStreakCount = 0) {
  const user = await mkUser(prisma)
  await prisma.user.update({ where: { id: user.id }, data: { dailyStreakCount } })
  return user.id
}

// Completes every EVENING-rooted task only (login/cZone/game points/TKO points), deliberately
// leaving Winwheel/Lotto untouched — the scenario this whole two-phase design exists for.
async function completeEveningTasksOnly(userId) {
  const evening = new Date(boundary.getTime() - 60_000)
  const [g] = await Promise.all([
    prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { dailyPointLimit: true, tkoDailyPointLimit: true, czoneVisitMaxPerDay: true } })
  ])
  const dailyPointLimit = Number(g?.dailyPointLimit ?? 250)
  const tkoDailyPointLimit = Number(g?.tkoDailyPointLimit ?? 250)
  const czoneVisitMaxPerDay = Number(g?.czoneVisitMaxPerDay ?? 10)

  await prisma.pointsLog.create({ data: { userId, points: 500, total: 500, method: 'Daily Login', direction: 'increase', createdAt: evening } })
  if (czoneVisitMaxPerDay > 0) {
    await prisma.pointsLog.createMany({ data: Array.from({ length: czoneVisitMaxPerDay }, () => ({ userId, points: 20, total: 20, method: 'cZone Visit', direction: 'increase', createdAt: evening })) })
  }
  if (dailyPointLimit > 0) await prisma.gamePointLog.create({ data: { userId, points: dailyPointLimit, gameName: null, createdAt: evening } })
  if (tkoDailyPointLimit > 0) await prisma.gamePointLog.create({ data: { userId, points: tkoDailyPointLimit, gameName: 'TKO', createdAt: evening } })
}

run('a player who finishes every evening task but not an enabled Lotto task by 8pm is deferred, not reset', async () => {
  await enableLotto(1)
  await disableWinwheel()
  const userId = await mkStreakUser(0)
  await completeEveningTasksOnly(userId)

  await processDailyStreaks(eveningCallNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true, dailyStreakPendingBoundary: true } })
  assert.equal(user.dailyStreakCount, 0) // not yet advanced
  assert.equal(user.dailyStreakLastBoundary, null) // not yet stamped either
  assert.equal(user.dailyStreakPendingBoundary?.getTime(), boundary.getTime())
})

run('a deferred player who completes their Lotto purchase before 8am gets their streak advanced at resolution, stamped to the EVENING boundary', async () => {
  await enableLotto(1)
  await disableWinwheel()
  const userId = await mkStreakUser(0)
  await completeEveningTasksOnly(userId)
  await processDailyStreaks(eveningCallNow)

  // The purchase happens overnight, well inside the closed window [windowStart-equivalent morning
  // start, morningBoundary) -- use a timestamp a couple of hours after the evening boundary.
  await prisma.lottoLog.create({
    data: { userId, outcome: 'NOTHING', oddsBefore: 1, oddsAfter: 1, createdAt: new Date(boundary.getTime() + 2 * 3600 * 1000) }
  })

  await resolvePendingDailyStreaks(morningNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true, dailyStreakPendingBoundary: true } })
  assert.equal(user.dailyStreakCount, 1)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())
  assert.equal(user.dailyStreakPendingBoundary, null)
})

run('a deferred player who never completes their Lotto purchase gets reset at resolution, not left pending forever', async () => {
  await enableLotto(1)
  await disableWinwheel()
  const userId = await mkStreakUser(3)
  await completeEveningTasksOnly(userId)
  await processDailyStreaks(eveningCallNow)

  await resolvePendingDailyStreaks(morningNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true, dailyStreakPendingBoundary: true } })
  assert.equal(user.dailyStreakCount, 0)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())
  assert.equal(user.dailyStreakPendingBoundary, null)
})

run('a Lotto purchase made AFTER the window closes (the new morning window) does not spuriously resolve the old pending verdict', async () => {
  await enableLotto(1)
  await disableWinwheel()
  const userId = await mkStreakUser(0)
  await completeEveningTasksOnly(userId)
  await processDailyStreaks(eveningCallNow)

  // Inside the NEW morning window that starts the instant the old one closes -- this must NOT
  // count toward the window resolvePendingDailyStreaks is checking (the exact regression the
  // morningWindowEnd cap in computeDailyTaskStatus exists to prevent).
  await prisma.lottoLog.create({
    data: { userId, outcome: 'NOTHING', oddsBefore: 1, oddsAfter: 1, createdAt: new Date(morningBoundary.getTime() + 2 * 60_000) }
  })

  await resolvePendingDailyStreaks(morningNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakPendingBoundary: true } })
  assert.equal(user.dailyStreakCount, 0) // reset, NOT advanced -- the new-window purchase doesn't count
  assert.equal(user.dailyStreakPendingBoundary, null)
})

run('a deferred player who completes their Winwheel spin before 8am gets their streak advanced at resolution', async () => {
  await enableWinwheel(1)
  await disableLotto()
  const userId = await mkStreakUser(0)
  await completeEveningTasksOnly(userId)
  await processDailyStreaks(eveningCallNow)

  const beforeSpin = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakPendingBoundary: true } })
  assert.equal(beforeSpin.dailyStreakPendingBoundary?.getTime(), boundary.getTime())

  await prisma.wheelSpinLog.create({
    data: { userId, result: 'points', points: 10, status: 'completed', createdAt: new Date(boundary.getTime() + 2 * 3600 * 1000) }
  })

  await resolvePendingDailyStreaks(morningNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true, dailyStreakPendingBoundary: true } })
  assert.equal(user.dailyStreakCount, 1)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())
  assert.equal(user.dailyStreakPendingBoundary, null)
})

run('a Winwheel spin made AFTER the window closes does not spuriously resolve the old pending verdict', async () => {
  await enableWinwheel(1)
  await disableLotto()
  const userId = await mkStreakUser(0)
  await completeEveningTasksOnly(userId)
  await processDailyStreaks(eveningCallNow)

  await prisma.wheelSpinLog.create({
    data: { userId, result: 'points', points: 10, status: 'completed', createdAt: new Date(morningBoundary.getTime() + 2 * 60_000) }
  })

  await resolvePendingDailyStreaks(morningNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true } })
  assert.equal(user.dailyStreakCount, 0)
})

run('a STALE pending boundary (resolvePendingDailyStreaks never resolved an earlier night) is treated as a conservative miss, not a free pass for tonight', async () => {
  await disableLotto()
  await disableWinwheel()
  const userId = await mkStreakUser(7)
  // Simulate last night's resolution job never having run at all: a pending flag left over from
  // a DIFFERENT (older) evening boundary, not tonight's.
  await prisma.user.update({ where: { id: userId }, data: { dailyStreakPendingBoundary: windowStart } })
  await completeEveningTasksOnly(userId)

  await processDailyStreaks(eveningCallNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true, dailyStreakPendingBoundary: true } })
  // 1, not 8 -- the orphaned night's never-verified count is discarded rather than carried
  // forward, and tonight's own completion starts a fresh streak from 0.
  assert.equal(user.dailyStreakCount, 1)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())
  assert.equal(user.dailyStreakPendingBoundary, null)
})

run('a player who misses an evening task is reset immediately, never deferred, even with Lotto enabled', async () => {
  await enableLotto(1)
  await disableWinwheel()
  const userId = await mkStreakUser(5)
  // Deliberately skip the Daily Login row -- an evening-task miss.

  await processDailyStreaks(eveningCallNow)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true, dailyStreakPendingBoundary: true } })
  assert.equal(user.dailyStreakCount, 0)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())
  assert.equal(user.dailyStreakPendingBoundary, null) // never deferred -- the evening miss alone already decides it
})
