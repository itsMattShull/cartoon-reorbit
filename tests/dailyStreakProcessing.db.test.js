// Real-Postgres + Redis end-to-end coverage for processDailyStreaks() (server/utils/dailyStreak.js):
// the nightly rollup that increments/resets User.dailyStreakCount and grants DailyStreakReward
// rows. Fixtures are built against the CURRENT real GlobalGameConfig/GameConfig(Winwheel)/
// LottoSettings thresholds, read at runtime rather than mutated — see
// tests/dailyStreakAdminEndpoints.db.test.js's own header comment for why a feature driven by a
// GLOBAL, unscoped aggregate (here, MAX(day) across the whole DailyStreakReward table) needs
// every test that writes into that aggregate's input to clean up after itself; this file deletes
// every DailyStreakReward row it creates, and restores dailyStreakRepeatEnabled, in `after`.
//
// A single `now`/`boundary` is computed once in `before` and reused by every test in this file
// (rather than each test calling `new Date()` separately) so no test can flake by straddling the
// real 8pm America/Chicago boundary mid-run.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkBarePack, pointsOf } from './helpers/dbKit.js'
import { getChicagoDailyBoundary, getChicagoMorningWindowStart } from '../server/utils/dailyTaskWindows.js'
import { COMBAT_POOL_GAME_NAMES } from '../server/utils/gamePoints.js'

const run = skipUnlessDb ? test.skip : test
let prisma, mintQueue, worker, processDailyStreaks

let now, boundary, windowStart, morningWindowStart, thresholds, maxDay
let ctoon, pack, originalRepeatEnabled
const createdRewardIds = []

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ processDailyStreaks } = await import('../server/utils/dailyStreak.js'))
  ;({ mintQueue } = await import('../server/utils/queues.js'))
  const { processMintJob } = await import('../server/utils/mintCtoon.js')
  const { Worker } = await import('bullmq')
  // A real worker, as in production: the CTOON reward path mints asynchronously via mintQueue.
  worker = new Worker(mintQueue.name, job => processMintJob(job, prisma), {
    connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) }
  })

  now = new Date()
  boundary = getChicagoDailyBoundary(now)
  const justBeforeBoundary = new Date(boundary.getTime() - 1)
  windowStart = getChicagoDailyBoundary(justBeforeBoundary)
  morningWindowStart = getChicagoMorningWindowStart(justBeforeBoundary)
  thresholds = await readTaskThresholds()

  const original = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { dailyStreakRepeatEnabled: true } })
  originalRepeatEnabled = !!original?.dailyStreakRepeatEnabled

  ctoon = await mkCtoon(prisma, { name: `Streak Prize ${randomUUID().slice(0, 8)}` })
  pack = await mkBarePack(prisma)

  // Day 1 always qualifies as the effective day for a streakDay of exactly 1 regardless of any
  // OTHER DailyStreakReward rows that might exist (1 <= maxDay always holds once this row
  // itself exists) -- see REWARD_DAY's use below.
  await Promise.all([
    mkReward(REWARD_DAY, { rewardType: 'POINTS', amount: REWARD_POINTS }),
    mkReward(REWARD_DAY, { rewardType: 'CTOON', ctoonId: ctoon.id, amount: REWARD_CTOON_QTY }),
    mkReward(REWARD_DAY, { rewardType: 'PACK', packId: pack.id, amount: REWARD_PACK_QTY }),
    mkReward(REWARD_DAY, { rewardType: 'CMOON_POINTS', amount: REWARD_CMOON_POINTS })
  ])

  const agg = await prisma.dailyStreakReward.aggregate({ _max: { day: true } })
  maxDay = agg._max.day
})

after(async () => {
  if (skipUnlessDb) return
  await prisma.dailyStreakReward.deleteMany({ where: { id: { in: createdRewardIds } } })
  await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: { dailyStreakRepeatEnabled: originalRepeatEnabled } })
  await worker?.close()
  await mintQueue.obliterate({ force: true })
  await mintQueue.close()
  await prisma.$disconnect()
})

const REWARD_DAY = 1
const REWARD_POINTS = 37
const REWARD_CTOON_QTY = 2
const REWARD_PACK_QTY = 1
const REWARD_CMOON_POINTS = 15

async function mkReward(day, data) {
  const row = await prisma.dailyStreakReward.create({ data: { day, ...data } })
  createdRewardIds.push(row.id)
  return row
}

async function readTaskThresholds() {
  const [g, w, l] = await Promise.all([
    prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { dailyPointLimit: true, tkoDailyPointLimit: true, czoneVisitMaxPerDay: true } }),
    prisma.gameConfig.findUnique({ where: { gameName: 'Winwheel' }, select: { maxDailySpins: true } }),
    prisma.lottoSettings.findUnique({ where: { id: 'lotto' }, select: { countPerDay: true } })
  ])
  return {
    dailyPointLimit: Number(g?.dailyPointLimit ?? 250),
    tkoDailyPointLimit: Number(g?.tkoDailyPointLimit ?? 250),
    czoneVisitMaxPerDay: Number(g?.czoneVisitMaxPerDay ?? 10),
    winwheelMaxDailySpins: Number(w?.maxDailySpins ?? 0),
    lottoCountPerDay: Number(l?.countPerDay ?? 0)
  }
}

async function mkStreakUser({ withCMoon = false, dailyStreakCount = 0 } = {}) {
  const user = await mkUser(prisma)
  let cMoonId = null
  if (withCMoon) {
    const cMoon = await prisma.cMoon.create({ data: { name: `Streak Test cMoon ${randomUUID().slice(0, 8)}`, color: '#112233' } })
    cMoonId = cMoon.id
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { dailyStreakCount, cMoonId, cMoonSelectedAt: withCMoon ? new Date(now.getTime() - 86400000) : null }
  })
  return user.id
}

// Completes every currently-ENABLED (admin limit > 0) daily task for `userId` inside the window
// that closes at `boundary`, using the real current thresholds read in `before` -- mirrors
// exactly what computeDailyTaskStatus/allEnabledDailyTasksComplete check. `skip` omits one
// enabled task's rows on purpose (used by the reset-on-miss test).
async function completeTasks(userId, { skip = null } = {}) {
  const evening = new Date(boundary.getTime() - 60_000) // safely inside [windowStart, boundary)
  await prisma.pointsLog.create({ data: { userId, points: 500, total: 500, method: 'Daily Login', direction: 'increase', createdAt: evening } })

  if (skip !== 'czone' && thresholds.czoneVisitMaxPerDay > 0) {
    await prisma.pointsLog.createMany({
      data: Array.from({ length: thresholds.czoneVisitMaxPerDay }, () => ({ userId, points: 20, total: 20, method: 'cZone Visit', direction: 'increase', createdAt: evening }))
    })
  }
  if (skip !== 'gamePoints' && thresholds.dailyPointLimit > 0) {
    await prisma.gamePointLog.create({ data: { userId, points: thresholds.dailyPointLimit, gameName: null, createdAt: evening } })
  }
  if (skip !== 'tko' && thresholds.tkoDailyPointLimit > 0) {
    await prisma.gamePointLog.create({ data: { userId, points: thresholds.tkoDailyPointLimit, gameName: COMBAT_POOL_GAME_NAMES[0], createdAt: evening } })
  }
  if (skip !== 'winwheel' && thresholds.winwheelMaxDailySpins > 0) {
    const morning = new Date(morningWindowStart.getTime() + 60_000)
    await prisma.wheelSpinLog.createMany({
      data: Array.from({ length: thresholds.winwheelMaxDailySpins }, () => ({ userId, status: 'completed', result: 'points', createdAt: morning }))
    })
  }
  if (skip !== 'lotto' && thresholds.lottoCountPerDay > 0) {
    await prisma.lottoUser.upsert({
      where: { userId },
      create: { userId, purchasesToday: thresholds.lottoCountPerDay, lastReset: morningWindowStart },
      update: { purchasesToday: thresholds.lottoCountPerDay, lastReset: morningWindowStart }
    })
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function waitForMintedCount(ctoonId, userId, expected, { timeoutMs = 4000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs
  let count = 0
  while (Date.now() < deadline) {
    count = await prisma.userCtoon.count({ where: { ctoonId, userId } })
    if (count >= expected) return count
    await sleep(intervalMs)
  }
  return count
}

run('a user who completes every enabled task and has a cMoon advances the streak and gets every configured reward, including cMoon points', async () => {
  const userId = await mkStreakUser({ withCMoon: true })
  const startingPoints = await pointsOf(prisma, userId)

  await completeTasks(userId)
  await processDailyStreaks(now)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true, cMoonPoints: true } })
  assert.equal(user.dailyStreakCount, 1)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())

  assert.equal(await pointsOf(prisma, userId), startingPoints + REWARD_POINTS)

  const packCount = await prisma.userPack.count({ where: { userId, packId: pack.id } })
  assert.equal(packCount, REWARD_PACK_QTY)

  const mintedCount = await waitForMintedCount(ctoon.id, userId, REWARD_CTOON_QTY)
  assert.equal(mintedCount, REWARD_CTOON_QTY)

  const scoreLog = await prisma.cMoonScoreLog.findFirst({ where: { userId, category: 'DAILY_STREAK' } })
  assert.ok(scoreLog)
  assert.equal(scoreLog.points, REWARD_CMOON_POINTS)
  assert.equal(user.cMoonPoints, REWARD_CMOON_POINTS)

  const claim = await prisma.dailyStreakClaim.findUnique({ where: { userId_streakDay: { userId, streakDay: 1 } } })
  assert.ok(claim)
})

run('a user with no current cMoon still gets every other reward for the day, but silently skips the CMOON_POINTS portion', async () => {
  const userId = await mkStreakUser({ withCMoon: false })
  const startingPoints = await pointsOf(prisma, userId)

  await completeTasks(userId)
  await processDailyStreaks(now)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true } })
  assert.equal(user.dailyStreakCount, 1)

  assert.equal(await pointsOf(prisma, userId), startingPoints + REWARD_POINTS)
  const packCount = await prisma.userPack.count({ where: { userId, packId: pack.id } })
  assert.equal(packCount, REWARD_PACK_QTY)
  await waitForMintedCount(ctoon.id, userId, REWARD_CTOON_QTY)

  const scoreLog = await prisma.cMoonScoreLog.findFirst({ where: { userId, category: 'DAILY_STREAK' } })
  assert.equal(scoreLog, null)
})

run('a user who misses one enabled task gets their streak reset to 0, even with an active prior streak', async (t) => {
  if (thresholds.czoneVisitMaxPerDay <= 0) return t.skip('cZone visits are currently disabled in GlobalGameConfig')

  const userId = await mkStreakUser({ dailyStreakCount: 5 })
  const startingPoints = await pointsOf(prisma, userId)

  await completeTasks(userId, { skip: 'czone' })
  await processDailyStreaks(now)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true } })
  assert.equal(user.dailyStreakCount, 0)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())
  // No reward granted for a reset day.
  assert.equal(await pointsOf(prisma, userId), startingPoints)
})

run('with repeat enabled, a streak day past maxDay wraps around and re-grants an earlier milestone', async () => {
  await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: { dailyStreakRepeatEnabled: true } })

  // streakDay = maxDay + 1 always wraps to effectiveDay 1 (our configured reward day), regardless
  // of maxDay's actual value: ((maxDay + 1 - 1) % maxDay) + 1 === 1.
  const userId = await mkStreakUser({ dailyStreakCount: maxDay })
  const startingPoints = await pointsOf(prisma, userId)

  await completeTasks(userId)
  await processDailyStreaks(now)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true } })
  assert.equal(user.dailyStreakCount, maxDay + 1)
  assert.equal(await pointsOf(prisma, userId), startingPoints + REWARD_POINTS)
})

run('a streak day past maxDay with repeat disabled still advances the counter, but writes no DailyStreakClaim row (nothing to protect)', async () => {
  await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: { dailyStreakRepeatEnabled: false } })

  const userId = await mkStreakUser({ dailyStreakCount: maxDay }) // streakDay = maxDay + 1, past maxDay, repeat off -> effectiveDay is null
  const startingPoints = await pointsOf(prisma, userId)

  await completeTasks(userId)
  await processDailyStreaks(now)

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true, dailyStreakLastBoundary: true } })
  assert.equal(user.dailyStreakCount, maxDay + 1)
  assert.equal(user.dailyStreakLastBoundary?.getTime(), boundary.getTime())
  assert.equal(await pointsOf(prisma, userId), startingPoints) // nothing to grant

  const claim = await prisma.dailyStreakClaim.findUnique({ where: { userId_streakDay: { userId, streakDay: maxDay + 1 } } })
  assert.equal(claim, null)
})

run('running processDailyStreaks twice for the same boundary never double-grants (the per-boundary stamp)', async () => {
  const userId = await mkStreakUser()
  const startingPoints = await pointsOf(prisma, userId)

  await completeTasks(userId)
  await processDailyStreaks(now)
  await processDailyStreaks(now) // same boundary -- dailyStreakLastBoundary already stamped, should be a no-op for this user

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true } })
  assert.equal(user.dailyStreakCount, 1)
  assert.equal(await pointsOf(prisma, userId), startingPoints + REWARD_POINTS)
})

run('the DailyStreakClaim unique constraint blocks a duplicate grant for the same (user, streakDay) even if the per-boundary stamp is lost', async () => {
  const userId = await mkStreakUser()

  await completeTasks(userId)
  await processDailyStreaks(now)
  const afterFirst = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true } })
  assert.equal(afterFirst.dailyStreakCount, 1)
  const pointsAfterFirst = await pointsOf(prisma, userId)

  // Simulate the per-boundary stamp AND the counter itself reverting to their pre-grant values
  // while the DailyStreakClaim row survives (this can't happen in production -- the claim and
  // the counter bump commit in the very same transaction -- but it's exactly the scenario the
  // claim's own unique constraint exists to guard against as a backstop): without resetting
  // dailyStreakCount too, the retry would recompute streakDay as 2, not 1, and never even
  // reach the existing claim.
  await prisma.user.update({ where: { id: userId }, data: { dailyStreakCount: 0, dailyStreakLastBoundary: null } })
  await processDailyStreaks(now)

  // advanceOneUserStreak recomputes streakDay = dailyStreakCount(0) + 1 = 1 again, collides with
  // the existing DailyStreakClaim(userId, 1) row, and the WHOLE transaction (claim insert AND the
  // counter bump) rolls back together -- so dailyStreakCount stays at its pre-retry value rather
  // than silently granting the reward a second time.
  const afterRetry = await prisma.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true } })
  assert.equal(afterRetry.dailyStreakCount, 0)
  assert.equal(await pointsOf(prisma, userId), pointsAfterFirst)

  const claims = await prisma.dailyStreakClaim.findMany({ where: { userId, streakDay: 1 } })
  assert.equal(claims.length, 1)
})
