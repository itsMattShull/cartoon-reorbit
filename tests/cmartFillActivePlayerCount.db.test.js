// Real-Postgres coverage for the "Fill from Active Players" count source:
// getAvgCodeRedeemCountFromExpiredCodes (server/utils/activePlayers.js) and the toggle/fallback
// resolver getFillActivePlayerCount (server/utils/cmartStandardizedMetrics.js). These exist so an
// admin who thinks the lastActivity-based active-player count reads inflated can switch "Fill from
// Active Players" to the average number of Claim rows per ClaimCode among codes that expired in
// the last CODE_REDEEM_AVG_WINDOW_DAYS days instead — see GlobalGameConfig.cmartFillUsesCodeRedeemAvg.
//
// The underlying tables (ClaimCode/Claim) hold real pre-existing rows in this shared test database,
// so exact-count assertions against the whole table would be flaky. Instead, each test either (a)
// computes its own expected value independently via a plain Prisma query over the same window and
// compares it to the function under test, or (b) asserts an invariant that holds regardless of
// what else is in the table.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, getAvgCodeRedeemCountFromExpiredCodes, CODE_REDEEM_AVG_WINDOW_DAYS, getFillActivePlayerCount, getActivePlayerCount
let originalConfig

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ getAvgCodeRedeemCountFromExpiredCodes, getActivePlayerCount, CODE_REDEEM_AVG_WINDOW_DAYS } = await import('../server/utils/activePlayers.js'))
  ;({ getFillActivePlayerCount } = await import('../server/utils/cmartStandardizedMetrics.js'))
  originalConfig = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { cmartFillUsesCodeRedeemAvg: true } })
})

after(async () => {
  if (skipUnlessDb) return
  if (originalConfig) {
    await prisma.globalGameConfig.update({ where: { id: 'singleton' }, data: { cmartFillUsesCodeRedeemAvg: originalConfig.cmartFillUsesCodeRedeemAvg } })
  }
  await prisma.$disconnect()
})

async function setToggle(value) {
  await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', dailyPointLimit: 250, cmartFillUsesCodeRedeemAvg: value },
    update: { cmartFillUsesCodeRedeemAvg: value }
  })
}

function daysAgo(n) { return new Date(Date.now() - n * 24 * 3600 * 1000) }
function daysFromNow(n) { return new Date(Date.now() + n * 24 * 3600 * 1000) }

async function mkExpiredCode(expiresAt, claimCount) {
  const code = await prisma.claimCode.create({ data: { code: `T-${randomUUID()}`, maxClaims: 1000, expiresAt } })
  for (let i = 0; i < claimCount; i++) {
    const user = await mkUser(prisma)
    await prisma.claim.create({ data: { userId: user.id, codeId: code.id } })
  }
  return code
}

/** Mirrors getAvgCodeRedeemCountFromExpiredCodes's own definition via a plain Prisma query, independent of its SQL. */
async function expectedAvgAndCount(windowDays) {
  const codes = await prisma.claimCode.findMany({
    where: { expiresAt: { not: null, gte: daysAgo(windowDays), lte: new Date() } },
    select: { _count: { select: { claims: true } } }
  })
  const codeCount = codes.length
  if (codeCount === 0) return { avgRedeemCount: null, codeCount: 0 }
  const total = codes.reduce((sum, c) => sum + c._count.claims, 0)
  return { avgRedeemCount: Math.round(total / codeCount), codeCount }
}

run('getAvgCodeRedeemCountFromExpiredCodes averages only codes that expired within the window, excluding older or not-yet-expired ones', async () => {
  await mkExpiredCode(daysAgo(3), 4)
  await mkExpiredCode(daysAgo(5), 2)
  await mkExpiredCode(daysAgo(10), 100) // outside the 7-day window
  await mkExpiredCode(daysFromNow(3), 999) // not expired yet

  const result = await getAvgCodeRedeemCountFromExpiredCodes(CODE_REDEEM_AVG_WINDOW_DAYS)
  const expected = await expectedAvgAndCount(CODE_REDEEM_AVG_WINDOW_DAYS)

  assert.equal(result.codeCount, expected.codeCount)
  assert.equal(result.avgRedeemCount, expected.avgRedeemCount)
})

run('getAvgCodeRedeemCountFromExpiredCodes returns null (not 0) when nothing has expired in the window', async () => {
  // A 0-day window can only ever match a code whose expiresAt is exactly "now" to the microsecond,
  // so this is effectively always empty — without assuming anything about the rest of the table.
  const result = await getAvgCodeRedeemCountFromExpiredCodes(0)
  const expected = await expectedAvgAndCount(0)
  assert.equal(expected.codeCount, 0)
  assert.equal(result.codeCount, 0)
  assert.equal(result.avgRedeemCount, null)
})

run('getFillActivePlayerCount uses the real active-player count when the toggle is off, regardless of any code-redeem data', async () => {
  await setToggle(false)
  const [fill, activePlayerCount] = await Promise.all([getFillActivePlayerCount(), getActivePlayerCount()])
  assert.equal(fill.source, 'activePlayers')
  assert.equal(fill.count, activePlayerCount)
  assert.equal(fill.useCodeRedeemAvg, false)
  assert.equal(fill.avgCodeRedeemCount, null)
  assert.equal(fill.codeRedeemSampleSize, 0)
})

run('getFillActivePlayerCount uses the code-redeem average when the toggle is on and at least one code expired in the window', async () => {
  await mkExpiredCode(daysAgo(1), 6)
  await setToggle(true)

  const fill = await getFillActivePlayerCount()
  assert.ok(fill.codeRedeemSampleSize > 0)
  assert.equal(fill.source, 'codeRedeemAvg')
  assert.equal(fill.useCodeRedeemAvg, true)
  assert.equal(fill.avgCodeRedeemCount, fill.count)
})

run('getFillActivePlayerCount only ever reports codeRedeemAvg when it actually has a sample, and activePlayers otherwise — whichever branch the data lands in', async () => {
  await setToggle(true)
  const fill = await getFillActivePlayerCount()
  if (fill.codeRedeemSampleSize === 0) {
    assert.equal(fill.source, 'activePlayers')
    assert.equal(fill.avgCodeRedeemCount, null)
    assert.equal(fill.count, await getActivePlayerCount())
  } else {
    assert.equal(fill.source, 'codeRedeemAvg')
    assert.equal(fill.count, fill.avgCodeRedeemCount)
  }
})
