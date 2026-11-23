// Admin "Ban Trades/Auctions" tool against a real Postgres: creating a ban withdraws pending trades between the pair and
// turns off their auto-bids on each other's auctions; while it stands they can't offer, counter or accept trades with
// each other or bid on each other's auctions; deleting it lifts the block and restores nothing. Skipped unless
// OWNERSHIP_TEST_DB is set (see tests/helpers/dbKit.js).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, applyProxyAutoBids

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ applyProxyAutoBids } = await import('../server/utils/autoBid.js'))
  const h = async (p) => (await import(p)).default
  api = await startApi([
    { method: 'get', path: '/api/admin/trade-auction-bans', handler: await h('../server/api/admin/trade-auction-bans.get.js') },
    { method: 'post', path: '/api/admin/trade-auction-bans', handler: await h('../server/api/admin/trade-auction-bans.post.js') },
    { method: 'delete', path: '/api/admin/trade-auction-bans/:id', handler: await h('../server/api/admin/trade-auction-bans/[id].delete.js') },
    { method: 'post', path: '/api/trade/offers', handler: await h('../server/api/trade/offers.post.js') },
    { method: 'post', path: '/api/trade/offers/:id/counter', handler: await h('../server/api/trade/offers/[id]/counter.post.js') },
    { method: 'post', path: '/api/trade/offers/:id/accept', handler: await h('../server/api/trade/offers/[id]/accept.post.js') },
    { method: 'post', path: '/api/auction/:id/bid', handler: await h('../server/api/auction/[id]/bid.post.js') },
    { method: 'post', path: '/api/auction/:id/autobid', handler: await h('../server/api/auction/[id]/autobid.post.js') }
  ])
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma.$disconnect() })

const inHours = (h) => new Date(Date.now() + h * 3600 * 1000)

async function mkAdmin () {
  const u = await mkUser(prisma)
  return prisma.user.update({ where: { id: u.id }, data: { isAdmin: true } })
}

async function setup () {
  const admin = await mkAdmin()
  const [a, b, c] = [await mkUser(prisma, { points: 1000 }), await mkUser(prisma, { points: 1000 }), await mkUser(prisma, { points: 1000 })]
  const ctoon = await mkCtoon(prisma)
  return { admin, a, b, c, ctoon }
}

const ban = (admin, x, y, reason) => api.call('post', '/api/admin/trade-auction-bans', { userId: admin.id, body: { userIds: [x.id, y.id], reason } })
const offer = (from, to, ctoonCopy, points = 0) =>
  api.call('post', '/api/trade/offers', { userId: from.id, body: { recipientUsername: to.username, ctoonIdsRequested: [ctoonCopy.id], pointsOffered: points } })

async function mkAuction (creator, ctoon) {
  const uc = await mkUserCtoon(prisma, creator.id, ctoon.id, { isTradeable: false })
  return prisma.auction.create({ data: { userCtoonId: uc.id, initialBet: 10, duration: 1, endAt: inHours(2), creatorId: creator.id } })
}

run('creating a ban withdraws pending trades both ways, releases their points and stops auto-bids on each other\'s auctions', async () => {
  const { admin, a, b, c, ctoon } = await setup()
  const bCopy = await mkUserCtoon(prisma, b.id, ctoon.id)
  const aCopy = await mkUserCtoon(prisma, a.id, ctoon.id)
  const cCopy = await mkUserCtoon(prisma, c.id, ctoon.id)
  const ab = await offer(a, b, bCopy, 50)
  const ba = await offer(b, a, aCopy)
  const ac = await offer(a, c, cCopy)
  for (const r of [ab, ba, ac]) assert.equal(r.status, 200, JSON.stringify(r.body))

  const bAuction = await mkAuction(b, ctoon)
  const cAuction = await mkAuction(c, ctoon)
  await prisma.auctionAutoBid.createMany({ data: [
    { auctionId: bAuction.id, userId: a.id, maxAmount: 100 },
    { auctionId: cAuction.id, userId: a.id, maxAmount: 100 }
  ] })

  const res = await ban(admin, b, a, '  alt accounts  ')
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.withdrawnTrades, 2)
  assert.equal(res.body.autoBidsStopped, 1)
  assert.equal(res.body.ban.reason, 'alt accounts')

  const status = async (id) => (await prisma.tradeOffer.findUnique({ where: { id } })).status
  assert.equal(await status(ab.body.offer.id), 'WITHDRAWN')
  assert.equal(await status(ba.body.offer.id), 'WITHDRAWN')
  assert.equal(await status(ac.body.offer.id), 'PENDING', 'a trade with someone else is untouched')
  const lock = await prisma.lockedPoints.findFirst({ where: { contextType: 'TRADE', contextId: ab.body.offer.id } })
  assert.equal(lock.status, 'RELEASED')

  const auto = await prisma.auctionAutoBid.findMany({ where: { userId: a.id }, select: { auctionId: true, isActive: true } })
  assert.deepEqual(Object.fromEntries(auto.map(x => [x.auctionId, x.isActive])), { [bAuction.id]: false, [cAuction.id]: true })

  const logs = await prisma.adminChangeLog.count({ where: { userId: admin.id, area: 'Admin:TradeAuctionBan', key: 'createTradeAuctionBan' } })
  assert.equal(logs, 2, 'one change-log row per user')
})

run('a second ban of the same pair, in either order, is refused; the same user twice is refused', async () => {
  const { admin, a, b } = await setup()
  assert.equal((await ban(admin, a, b)).status, 200)
  const again = await ban(admin, b, a)
  assert.equal(again.status, 409)
  assert.equal((await ban(admin, a, a)).status, 400)
  assert.equal(await prisma.tradeAuctionBan.count({ where: { OR: [{ userAId: a.id }, { userBId: a.id }] } }), 1)
})

run('only admins can list, create or delete bans', async () => {
  const { a, b } = await setup()
  assert.equal((await api.call('get', '/api/admin/trade-auction-bans', { userId: a.id })).status, 403)
  assert.equal((await ban(a, a, b)).status, 403)
})

run('while banned, neither user can offer, counter or accept a trade with the other; other users are unaffected', async () => {
  const { admin, a, b, c, ctoon } = await setup()
  const bCopy = await mkUserCtoon(prisma, b.id, ctoon.id)
  const aCopy = await mkUserCtoon(prisma, a.id, ctoon.id)
  const cCopy = await mkUserCtoon(prisma, c.id, ctoon.id)
  // An offer from c to a, which a then tries to counter after a ban with c.
  const ca = await offer(c, a, aCopy)
  assert.equal(ca.status, 200)

  assert.equal((await ban(admin, a, b)).status, 200)
  for (const r of [await offer(a, b, bCopy), await offer(b, a, aCopy)]) {
    assert.equal(r.status, 403)
    assert.equal(r.body.statusMessage, "You can't trade with this user.")
  }
  assert.equal((await offer(a, c, cCopy)).status, 200, 'a can still trade with c')

  // Pending offer between a and c, then a ban: withdrawn, so neither counter nor accept can go through.
  assert.equal((await ban(admin, a, c)).status, 200)
  const counter = await api.call('post', `/api/trade/offers/${ca.body.offer.id}/counter`, { userId: a.id, body: { ctoonIdsRequested: [cCopy.id] } })
  assert.notEqual(counter.status, 200)
  const accept = await api.call('post', `/api/trade/offers/${ca.body.offer.id}/accept`, { userId: a.id })
  assert.notEqual(accept.status, 200)
})

run('accept re-checks the ban inside its transaction, even if the offer is somehow still pending', async () => {
  const { admin, a, b, ctoon } = await setup()
  const bCopy = await mkUserCtoon(prisma, b.id, ctoon.id)
  const ab = await offer(a, b, bCopy)
  assert.equal(ab.status, 200)
  // Insert the ban row directly, skipping the withdraw step, as if the ban committed while the offer was being accepted.
  const [x, y] = [a.id, b.id].sort()
  await prisma.tradeAuctionBan.create({ data: { userAId: x, userBId: y, createdById: admin.id } })
  const res = await api.call('post', `/api/trade/offers/${ab.body.offer.id}/accept`, { userId: b.id })
  assert.equal(res.status, 403)
  const row = await prisma.tradeOffer.findUnique({ where: { id: ab.body.offer.id } })
  assert.equal(row.status, 'PENDING', 'the refused accept rolled its claim back')
  assert.equal((await prisma.userCtoon.findUnique({ where: { id: bCopy.id } })).userId, b.id)
})

run('while banned, neither can bid or set an auto-bid on the other\'s auction, and a stale auto-bid never raises', async () => {
  const { admin, a, b, c, ctoon } = await setup()
  const bAuction = await mkAuction(b, ctoon)
  const aAuction = await mkAuction(a, ctoon)
  // An auto-bid of a's that is still active when the ban lands (as if set a moment before).
  await prisma.auctionAutoBid.create({ data: { auctionId: bAuction.id, userId: a.id, maxAmount: 200 } })
  const [x, y] = [a.id, b.id].sort()
  await prisma.tradeAuctionBan.create({ data: { userAId: x, userBId: y, createdById: admin.id } })

  for (const [who, auc] of [[a, bAuction], [b, aAuction]]) {
    const bid = await api.call('post', `/api/auction/${auc.id}/bid`, { userId: who.id, body: { amount: 10 } })
    assert.equal(bid.status, 403, JSON.stringify(bid.body))
    assert.equal(bid.body.statusMessage, "You can't bid on this user's auctions.")
    const auto = await api.call('post', `/api/auction/${auc.id}/autobid`, { userId: who.id, body: { maxAmount: 50 } })
    assert.equal(auto.status, 403, JSON.stringify(auto.body))
  }

  // Proxy raises skip the banned auto-bidder; an unbanned one still bids.
  const steps0 = await prisma.$transaction(tx => applyProxyAutoBids(tx, bAuction.id))
  assert.equal(steps0.steps.length, 0)
  await prisma.auctionAutoBid.create({ data: { auctionId: bAuction.id, userId: c.id, maxAmount: 50 } })
  const steps1 = await prisma.$transaction(tx => applyProxyAutoBids(tx, bAuction.id))
  assert.ok(steps1.steps.length >= 1)
  assert.ok(steps1.steps.every(s => s.userId === c.id), JSON.stringify(steps1.steps))
})

run('deleting a ban lifts it, restores nothing, and logs it; the list filters by username', async () => {
  const { admin, a, b, ctoon } = await setup()
  const bCopy = await mkUserCtoon(prisma, b.id, ctoon.id)
  const ab = await offer(a, b, bCopy)
  const created = await ban(admin, a, b, 'test')
  assert.equal(created.status, 200)

  const list = await api.call('get', `/api/admin/trade-auction-bans?user=${encodeURIComponent(b.username)}`, { userId: admin.id })
  assert.equal(list.status, 200)
  assert.equal(list.body.total, 1)
  assert.deepEqual([list.body.items[0].userA.username, list.body.items[0].userB.username].sort(), [a.username, b.username].sort())

  const del = await api.call('delete', `/api/admin/trade-auction-bans/${created.body.ban.id}`, { userId: admin.id })
  assert.equal(del.status, 200, JSON.stringify(del.body))
  assert.equal((await api.call('delete', `/api/admin/trade-auction-bans/${created.body.ban.id}`, { userId: admin.id })).status, 404)
  assert.equal((await prisma.tradeOffer.findUnique({ where: { id: ab.body.offer.id } })).status, 'WITHDRAWN', 'nothing restored')
  assert.equal((await offer(a, b, bCopy)).status, 200, 'they can trade again')
  assert.equal(await prisma.adminChangeLog.count({ where: { userId: admin.id, key: 'deleteTradeAuctionBan' } }), 2)
})
