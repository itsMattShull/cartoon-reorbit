// Real-Postgres coverage for GET /api/myorbit/leaderboard — the "leaderboard plaque" MyOrbit
// room widget (MyOrbitRoom.showLeaderboard). Exercises the real aggregate queries against
// Auction and CMoonEnemyBattle rather than the pure function in isolation, since the whole point
// of this endpoint is "zero new tracking, just query what already exists" — a unit test with a
// fake db would just restate the Prisma call, not prove it actually picks the right row.
//
// Both queries are genuinely GLOBAL ("top 1 across every row this week"), with every other
// *.db.test.js file (and every previous run of THIS file, since nothing here gets wiped between
// runs of the shared test database) sharing the same real Postgres. Every test therefore cleans
// up the rows it created in a `finally`, same convention as myOrbitPresenceEndpoints.db.test.js's
// own clearUserPresence calls — without that, two runs each writing the same "obviously biggest"
// amount would tie, and a tie's winner is whatever order Postgres happens to return it in, not
// necessarily this run's own fixture.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, mkBarePack, mkUserPack, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, getRedis

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ getRedis } = await import('../server/utils/redis.js'))
  const handler = (await import('../server/api/myorbit/leaderboard.get.js')).default
  api = await startApi([{ method: 'get', path: '/api/myorbit/leaderboard', handler }])
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) await prisma.$disconnect()
})

// The endpoint caches both queries for 60s (server/api/myorbit/leaderboard.get.js's own
// CACHE_TTL_SEC) under one global `cachedJson('myorbit:leaderboard', ...)` key — real and
// correct for production (several players with a leaderboard room open shouldn't each re-run
// both queries), but it means every test in this file sharing that TTL window would otherwise
// see whichever test happened to run first's cached result. Clear it before each DB-touching
// test so each one exercises a fresh read against the fixtures IT just wrote.
async function clearLeaderboardCache() {
  await getRedis().del('cache:myorbit:leaderboard')
}

const DAY = 24 * 60 * 60 * 1000
// Comfortably past any other suite's plausible fixture amount (tens/hundreds/thousands), but
// still well inside Postgres INTEGER range (highestBid/damageDealt are both `Int`, max ~2.147B) -
// a literal 10 billion would overflow and fail the insert outright.
const HUGE = 2_000_000_000

async function mkClosedCtoonAuction(seller, winner, { highestBid, endAt, ctoonName }) {
  const ctoon = await mkCtoon(prisma, { name: ctoonName })
  const userCtoon = await mkUserCtoon(prisma, seller.id, ctoon.id)
  return prisma.auction.create({
    data: {
      kind: 'CTOON', userCtoonId: userCtoon.id, initialBet: 10, duration: 1, endAt,
      status: 'CLOSED', winnerId: winner.id, highestBid, creatorId: seller.id
    }
  })
}

async function mkClosedPackAuction(seller, winner, { highestBid, endAt, packName }) {
  const pack = await mkBarePack(prisma, { name: packName })
  const userPack = await mkUserPack(prisma, seller.id, { packId: pack.id })
  return prisma.auction.create({
    data: {
      kind: 'PACK', userPackId: userPack.id, initialBet: 10, duration: 1, endAt,
      status: 'CLOSED', winnerId: winner.id, highestBid, creatorId: seller.id
    }
  })
}

async function deleteAuctions(ids) {
  await prisma.auction.deleteMany({ where: { id: { in: ids } } })
}

async function mkRaidFixture() {
  const cMoon = await prisma.cMoon.create({ data: { name: `cMoon ${randomUUID().slice(0, 8)}`, color: '#ffffff' } })
  const faction = await prisma.cMoonEnemyFaction.create({ data: { name: `Faction ${randomUUID().slice(0, 8)}` } })
  const member = await prisma.cMoonEnemyMember.create({ data: { factionId: faction.id, name: `Member ${randomUUID().slice(0, 8)}` } })
  const raid = await prisma.cMoonEnemyRaid.create({
    data: { enemyMemberId: member.id, cMoonId: cMoon.id, enemyHpRemaining: 10, joinDeadlineAt: new Date() }
  })
  return { cMoonId: cMoon.id, factionId: faction.id, member, raid }
}

function mkRaidBattle(userId, memberId, raidId, { damageDealt, startedAt }) {
  return prisma.cMoonEnemyBattle.create({
    data: { userId, enemyMemberId: memberId, playerHpRemaining: 1, enemyHpRemaining: 0, raidId, damageDealt, startedAt }
  })
}

async function deleteRaidFixture({ cMoonId, factionId, member, raid }, battleIds) {
  await prisma.cMoonEnemyBattle.deleteMany({ where: { id: { in: battleIds } } })
  await prisma.cMoonEnemyRaid.delete({ where: { id: raid.id } })
  await prisma.cMoonEnemyMember.delete({ where: { id: member.id } })
  await prisma.cMoonEnemyFaction.delete({ where: { id: factionId } })
  await prisma.cMoon.delete({ where: { id: cMoonId } })
}

run('both stats are present (null or an object) with no DB/crash on a cold query', async () => {
  const viewer = await mkUser(prisma)
  await clearLeaderboardCache()
  const res = await api.call('get', '/api/myorbit/leaderboard', { userId: viewer.id })
  assert.equal(res.status, 200)
  assert.ok('topAuctionSale' in res.body)
  assert.ok('topRaidDamage' in res.body)
})

run('topAuctionSale: a huge CLOSED cToon sale this week beats a small one, a stale one, and a still-ACTIVE one', async () => {
  const seller = await mkUser(prisma)
  const bigWinner = await mkUser(prisma)
  const smallWinner = await mkUser(prisma)
  const staleWinner = await mkUser(prisma)
  const now = new Date()
  const ctoonName = `BigPrize_${randomUUID().slice(0, 8)}`

  const big = await mkClosedCtoonAuction(seller, bigWinner, { highestBid: HUGE, endAt: now, ctoonName })
  const small = await mkClosedCtoonAuction(seller, smallWinner, { highestBid: 1_000, endAt: now, ctoonName: 'SmallPrize' })
  // Outside the 7-day window - must not win even with an enormous bid.
  const stale = await mkClosedCtoonAuction(seller, staleWinner, { highestBid: HUGE, endAt: new Date(now.getTime() - 8 * DAY), ctoonName: 'StalePrize' })
  // ACTIVE, not CLOSED - must be excluded regardless of bid or date.
  const activeCtoon = await mkCtoon(prisma, { name: 'ActivePrize' })
  const activeUserCtoon = await mkUserCtoon(prisma, seller.id, activeCtoon.id)
  const active = await prisma.auction.create({
    data: { kind: 'CTOON', userCtoonId: activeUserCtoon.id, initialBet: 10, duration: 1, endAt: new Date(now.getTime() + DAY), status: 'ACTIVE', highestBid: HUGE, creatorId: seller.id }
  })

  try {
    await clearLeaderboardCache()
    const res = await api.call('get', '/api/myorbit/leaderboard', { userId: seller.id })
    assert.equal(res.status, 200)
    assert.equal(res.body.topAuctionSale.amount, HUGE)
    assert.equal(res.body.topAuctionSale.username, bigWinner.username)
    assert.equal(res.body.topAuctionSale.itemName, ctoonName)
  } finally {
    await deleteAuctions([big.id, small.id, stale.id, active.id])
  }
})

run('topAuctionSale: resolves a PACK auction\'s item name through the pack, not userCtoon', async () => {
  const seller = await mkUser(prisma)
  const winner = await mkUser(prisma)
  const now = new Date()
  const packName = `OnlyPack_${randomUUID().slice(0, 8)}`
  const pack = await mkClosedPackAuction(seller, winner, { highestBid: HUGE, endAt: now, packName })

  try {
    await clearLeaderboardCache()
    const res = await api.call('get', '/api/myorbit/leaderboard', { userId: seller.id })
    assert.equal(res.status, 200)
    assert.equal(res.body.topAuctionSale.amount, HUGE)
    assert.equal(res.body.topAuctionSale.itemName, packName)
  } finally {
    await deleteAuctions([pack.id])
  }
})

run('topRaidDamage: sums a user\'s damage across multiple raids this week, excludes solo battles and old raids', async () => {
  const fixture = await mkRaidFixture()
  const { member, raid } = fixture
  const topUser = await mkUser(prisma)
  const otherUser = await mkUser(prisma)
  const now = new Date()

  const b1 = await mkRaidBattle(topUser.id, member.id, raid.id, { damageDealt: 1_800_000_000, startedAt: now })
  const b2 = await mkRaidBattle(topUser.id, member.id, raid.id, { damageDealt: 200_000_000, startedAt: now }) // summed with b1 (= HUGE)
  const b3 = await mkRaidBattle(otherUser.id, member.id, raid.id, { damageDealt: 500, startedAt: now })
  // Outside the 7-day window - must not count even with an enormous amount.
  const b4 = await mkRaidBattle(otherUser.id, member.id, raid.id, { damageDealt: HUGE, startedAt: new Date(now.getTime() - 8 * DAY) })
  // A solo (non-raid) battle - raidId null - must never be summed into this stat.
  const b5 = await prisma.cMoonEnemyBattle.create({
    data: { userId: otherUser.id, enemyMemberId: member.id, playerHpRemaining: 1, enemyHpRemaining: 0, damageDealt: HUGE, startedAt: now }
  })

  try {
    await clearLeaderboardCache()
    const res = await api.call('get', '/api/myorbit/leaderboard', { userId: topUser.id })
    assert.equal(res.status, 200)
    assert.equal(res.body.topRaidDamage.username, topUser.username)
    assert.equal(res.body.topRaidDamage.amount, HUGE)
  } finally {
    await deleteRaidFixture(fixture, [b1.id, b2.id, b3.id, b4.id, b5.id])
  }
})

run('requires authentication', async () => {
  const res = await api.call('get', '/api/myorbit/leaderboard', {})
  assert.equal(res.status, 401)
})
