// When an auction ends, the cToon must go to the winning bidder, the points to the seller, and every other
// bidder's held points must be released. Runs the real settlement (server/utils/auctionSettle.js) against a real Postgres.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, ownerOf, pointsOf } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, settleAuction

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ settleAuction } = await import('../server/utils/auctionSettle.js'))
})

const HOUR = 3600 * 1000
// Stand-ins for the socket server's collaborators, recording what was asked of them.
function deps() {
  const calls = { rescheduled: [], won: [] }
  return {
    calls,
    deps: {
      db: prisma,
      scheduleAuctionClose: async (id, endAt) => { calls.rescheduled.push({ id, endAt }) },
      notifyAuctionWon: async (_tx, args) => { calls.won.push(args) }
    }
  }
}

/**
 * A seller's cToon up for auction, with `bids` placed in order (each { user, amount, at? }). Mirrors what the bid
 * endpoint leaves behind: the leader's points held ACTIVE, outbid leaders' holds RELEASED.
 */
async function setup({ bids = [], endedAgo = HOUR, bidderPoints = 1000, sellerPoints = 500, official = false } = {}) {
  const seller = await mkUser(prisma, { points: sellerPoints })
  const ctoon = await mkCtoon(prisma, { name: 'Auctioned Toon' })
  const card = await mkUserCtoon(prisma, seller.id, ctoon.id, { isTradeable: false }) // untradeable while listed
  const bidders = []
  const needed = new Set(bids.map(b => b.who))
  for (const who of needed) bidders[who] = await mkUser(prisma, { points: bidderPoints })

  const createdAt = new Date(Date.now() - 24 * HOUR)
  const endAt = new Date(Date.now() - endedAgo)
  const auction = await prisma.auction.create({
    data: { userCtoonId: card.id, initialBet: 10, duration: 1, endAt, createdAt, creatorId: official ? null : seller.id }
  })
  let leader = null, highest = 0
  for (const [i, b] of bids.entries()) {
    const at = b.at ?? new Date(createdAt.getTime() + (i + 1) * 60 * 1000)
    await prisma.bid.create({ data: { auctionId: auction.id, userId: bidders[b.who].id, amount: b.amount, createdAt: at } })
    const leads = b.amount > highest
    if (leads) {
      if (leader) await prisma.lockedPoints.updateMany({ where: { userId: leader, contextId: auction.id, status: 'ACTIVE' }, data: { status: 'RELEASED' } })
      await prisma.lockedPoints.create({
        data: { userId: bidders[b.who].id, amount: b.amount, reason: 'AUCTION_BID', status: 'ACTIVE', contextType: 'AUCTION', contextId: auction.id }
      })
      leader = bidders[b.who].id; highest = b.amount
    }
  }
  if (leader) await prisma.auction.update({ where: { id: auction.id }, data: { highestBid: highest, highestBidderId: leader } })
  return { seller, ctoon, card, bidders, auction }
}
const auctionRow = (id) => prisma.auction.findUnique({ where: { id } })
const locksFor = (auctionId) => prisma.lockedPoints.findMany({ where: { contextType: 'AUCTION', contextId: auctionId } })

run('the highest bidder gets the cToon, the seller gets the points, and the loser keeps theirs', async () => {
  const { seller, card, bidders, auction, ctoon } = await setup({ bids: [{ who: 0, amount: 50 }, { who: 1, amount: 120 }, { who: 2, amount: 200 }] })
  const { deps: d, calls } = deps()

  const result = await settleAuction(auction.id, d)

  assert.deepEqual(result, { winnerId: bidders[2].id, winningBid: 200 }, 'what the socket server broadcasts')
  assert.equal(await ownerOf(prisma, card.id), bidders[2].id)
  assert.equal((await prisma.userCtoon.findUnique({ where: { id: card.id } })).isTradeable, true)
  assert.equal(await pointsOf(prisma, bidders[2].id), 800, 'winner pays')
  assert.equal(await pointsOf(prisma, seller.id), 700, 'seller is paid')
  assert.equal(await pointsOf(prisma, bidders[0].id), 1000, 'outbid bidders pay nothing')
  assert.equal(await pointsOf(prisma, bidders[1].id), 1000)

  const row = await auctionRow(auction.id)
  assert.equal(row.status, 'CLOSED')
  assert.equal(row.winnerId, bidders[2].id)
  assert.equal(row.highestBid, 200)

  const owner = await prisma.ctoonOwnerLog.findMany({ where: { userCtoonId: card.id } })
  assert.equal(owner.length, 1)
  assert.equal(owner[0].method, 'AUCTION')
  assert.equal(owner[0].userId, bidders[2].id)
  assert.equal(owner[0].counterpartyUserId, seller.id)

  const logs = await prisma.pointsLog.findMany({ where: { userId: { in: [seller.id, bidders[2].id] }, method: 'Auction' } })
  assert.deepEqual(logs.map(l => `${l.userId === seller.id ? 'seller' : 'winner'}:${l.direction}:${l.points}`).sort(), ['seller:increase:200', 'winner:decrease:200'])

  const locks = await locksFor(auction.id)
  assert.equal(locks.filter(l => l.status === 'ACTIVE').length, 0, 'no hold left active')
  assert.equal(locks.find(l => l.userId === bidders[2].id && l.amount === 200).status, 'CONSUMED')
  assert.ok(locks.filter(l => l.userId !== bidders[2].id).every(l => l.status === 'RELEASED'))

  assert.equal((await prisma.ctoon.findUnique({ where: { id: ctoon.id } })).lastAuctionSoldPrice, 200)
  assert.deepEqual(calls.won.map(w => [w.userId, w.amount]), [[bidders[2].id, 200]], 'the winner (only) is told')
})

run('a tie goes to whoever bid first; a bid placed after the end time does not count', async () => {
  const end = Date.now() - HOUR
  const { card, bidders, auction } = await setup({
    bids: [
      { who: 0, amount: 100, at: new Date(end - 30 * 60 * 1000) },
      { who: 1, amount: 100, at: new Date(end - 20 * 60 * 1000) }, // ties, but later
      { who: 2, amount: 900, at: new Date(end + 5 * 60 * 1000) }   // after the bell
    ]
  })
  const result = await settleAuction(auction.id, deps().deps)
  assert.equal(result.winnerId, bidders[0].id)
  assert.equal(result.winningBid, 100)
  assert.equal(await ownerOf(prisma, card.id), bidders[0].id)
  assert.equal(await pointsOf(prisma, bidders[2].id), 1000, 'late bidder is not charged')
})

run('no bids: the cToon stays with the seller, nobody pays, and holds are released', async () => {
  const { seller, card, auction } = await setup({ bids: [] })
  const { deps: d, calls } = deps()
  const result = await settleAuction(auction.id, d)

  assert.deepEqual(result, { winnerId: null, winningBid: 0 })
  assert.equal(await ownerOf(prisma, card.id), seller.id)
  assert.equal((await prisma.userCtoon.findUnique({ where: { id: card.id } })).isTradeable, true, 'listing no longer blocks trading')
  assert.equal(await pointsOf(prisma, seller.id), 500)
  const row = await auctionRow(auction.id)
  assert.equal(row.status, 'CLOSED')
  assert.equal(row.winnerId, null)
  assert.equal(await prisma.ctoonOwnerLog.count({ where: { userCtoonId: card.id } }), 0)
  assert.equal(calls.won.length, 0)
})

run('an official-account listing (no creator) pays the official user', async () => {
  const official = await mkUser(prisma, { points: 0, username: `official_${Date.now()}` })
  process.env.OFFICIAL_USERNAME = official.username
  try {
    const { card, bidders, auction } = await setup({ official: true, bids: [{ who: 0, amount: 75 }] })
    await settleAuction(auction.id, deps().deps)
    assert.equal(await ownerOf(prisma, card.id), bidders[0].id)
    assert.equal(await pointsOf(prisma, official.id), 75)
    assert.equal((await prisma.ctoonOwnerLog.findFirst({ where: { userCtoonId: card.id } })).counterpartyUserId, official.id)
  } finally { delete process.env.OFFICIAL_USERNAME }
})

run("the previous owner's trade-list entry is cleared when the cToon is won", async () => {
  const { seller, card, auction } = await setup({ bids: [{ who: 0, amount: 40 }] })
  await prisma.userTradeListItem.create({ data: { userId: seller.id, userCtoonId: card.id } })
  await settleAuction(auction.id, deps().deps)
  assert.equal(await prisma.userTradeListItem.count({ where: { userCtoonId: card.id } }), 0)
})

run('settling twice — or at the same moment — pays out once', async () => {
  const { seller, card, bidders, auction } = await setup({ bids: [{ who: 0, amount: 300 }] })
  const results = await Promise.all([settleAuction(auction.id, deps().deps), settleAuction(auction.id, deps().deps), settleAuction(auction.id, deps().deps)])
  assert.equal(results.filter(Boolean).length, 1, 'only one settlement broadcasts a result')
  assert.equal(await ownerOf(prisma, card.id), bidders[0].id)
  assert.equal(await pointsOf(prisma, bidders[0].id), 700)
  assert.equal(await pointsOf(prisma, seller.id), 800)
  assert.equal(await prisma.ctoonOwnerLog.count({ where: { userCtoonId: card.id } }), 1)

  assert.equal(await settleAuction(auction.id, deps().deps), null, 'a later duplicate job is a no-op')
  assert.equal(await pointsOf(prisma, bidders[0].id), 700)
})

run('an auction that has not actually ended yet is rescheduled, not settled', async () => {
  const { seller, card, bidders, auction } = await setup({ bids: [{ who: 0, amount: 90 }], endedAgo: -HOUR }) // ends in an hour
  const { deps: d, calls } = deps()
  assert.equal(await settleAuction(auction.id, d), null)
  assert.equal(calls.rescheduled.length, 1)
  assert.equal(calls.rescheduled[0].id, auction.id)
  assert.equal((await auctionRow(auction.id)).status, 'ACTIVE')
  assert.equal(await ownerOf(prisma, card.id), seller.id)
  assert.equal(await pointsOf(prisma, bidders[0].id), 1000)
})

run('cancelled and missing auctions are left alone', async () => {
  const { seller, card, auction } = await setup({ bids: [{ who: 0, amount: 90 }] })
  await prisma.auction.update({ where: { id: auction.id }, data: { status: 'CANCELLED' } })
  assert.equal(await settleAuction(auction.id, deps().deps), null)
  assert.equal(await ownerOf(prisma, card.id), seller.id)
  assert.equal(await settleAuction('00000000-0000-0000-0000-000000000000', deps().deps), null)
})

run('if the same cToon already sold through another auction, nothing moves and holds are released', async () => {
  const { seller, card, bidders, auction } = await setup({ bids: [{ who: 0, amount: 500 }] })
  // A later-closed auction of this same physical cToon that already had a winner (the "double sale" case).
  const firstBuyer = await mkUser(prisma, { points: 0 })
  await prisma.auction.create({
    data: {
      userCtoonId: card.id, initialBet: 10, duration: 1, endAt: new Date(Date.now() - 2 * HOUR), status: 'CLOSED',
      creatorId: seller.id, winnerId: firstBuyer.id, winnerAt: new Date(Date.now() - 2 * HOUR)
    }
  })
  await prisma.userCtoon.update({ where: { id: card.id }, data: { userId: firstBuyer.id } })

  const errors = console.error; console.error = () => {} // the settlement logs this loudly on purpose
  let result
  try { result = await settleAuction(auction.id, deps().deps) } finally { console.error = errors }

  assert.deepEqual(result, { winnerId: null, winningBid: 0 })
  assert.equal(await ownerOf(prisma, card.id), firstBuyer.id, 'the first sale stands')
  assert.equal(await pointsOf(prisma, bidders[0].id), 1000, 'the second bidder is not charged')
  assert.equal(await pointsOf(prisma, seller.id), 500, 'the seller is not paid twice')
  assert.equal((await auctionRow(auction.id)).status, 'CLOSED')
  assert.equal((await locksFor(auction.id)).filter(l => l.status === 'ACTIVE').length, 0)
})
