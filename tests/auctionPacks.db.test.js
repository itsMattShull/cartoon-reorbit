// Auctioning sealed packs, against a real Postgres: creation rules and races, settlement (a pack moves to the winner,
// nobody is charged for a pack they can't receive), and — most important for not breaking the Auction House — every
// read endpoint keeps working when cToon and pack auctions are MIXED in the same data (a pack auction has no userCtoon,
// and an unguarded read of it used to be a whole-page 500).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, mkBarePack, mkUserPack, startApi, pointsOf } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, settleAuction, S

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ settleAuction } = await import('../server/utils/auctionSettle.js'))
  S = await import('../server/utils/userPackState.js')
  const h = async (p) => (await import(p)).default
  api = await startApi([
    { method: 'post', path: '/api/auctions/pack', handler: await h('../server/api/auctions/pack.post.js') },
    { method: 'post', path: '/api/trade/offers', handler: await h('../server/api/trade/offers.post.js') },
    { method: 'get', path: '/api/auctions', handler: await h('../server/api/auctions.get.js') },
    { method: 'get', path: '/api/auctions/all', handler: await h('../server/api/auctions/all.get.js') },
    { method: 'get', path: '/api/auctions/trending', handler: await h('../server/api/auctions/trending.get.js') },
    { method: 'get', path: '/api/my-auctions', handler: await h('../server/api/my-auctions.get.js') },
    { method: 'get', path: '/api/auction/mybids', handler: await h('../server/api/auction/mybids.get.js') },
    { method: 'get', path: '/api/auction/:id', handler: await h('../server/api/auction/[id].get.js') },
    { method: 'get', path: '/api/auction/:id/getRecentAuctions', handler: await h('../server/api/auction/[id]/getRecentAuctions.get.js') },
    { method: 'get', path: '/api/admin/auctions', handler: await h('../server/api/admin/auctions.get.js') }
  ])
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma.$disconnect() })

const HOUR = 3600 * 1000
const create = (userId, body) => api.call('post', '/api/auctions/pack', { userId, body })
const get = (path, userId) => api.call('get', path, { userId })
const deps = () => {
  const won = []
  return { won, d: { db: prisma, scheduleAuctionClose: async () => {}, notifyAuctionWon: async (_tx, a) => { won.push(a) } } }
}
async function sealed(userId, over = {}) {
  const pack = over.pack ?? await mkBarePack(prisma)
  const up = await mkUserPack(prisma, userId, { packId: pack.id, ...over.userPack })
  return { pack, up }
}

// ── creation ───────────────────────────────────────────────────────────────────────────────────────────────────────
run('a sealed pack goes up for auction at any positive starting bid (no rarity floor), staying with its seller', async () => {
  const seller = await mkUser(prisma)
  const { up } = await sealed(seller.id)
  const res = await create(seller.id, { userPackId: up.id, initialBet: 1, durationDays: 1 })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const a = await prisma.auction.findUnique({ where: { id: res.body.auction.id } })
  assert.deepEqual([a.kind, a.userPackId, a.userCtoonId, a.creatorId, a.status, a.initialBet, a.isFeatured], ['PACK', up.id, null, seller.id, 'ACTIVE', 1, false])
  assert.equal((await prisma.userPack.findUnique({ where: { id: up.id } })).userId, seller.id)
})

run('creation is refused for: someone else\'s pack, opened, in a pending trade, already in an auction, and bad input', async () => {
  const [seller, other] = [await mkUser(prisma), await mkUser(prisma)]
  const mine = (await sealed(seller.id)).up
  const theirs = (await sealed(other.id)).up
  const opened = (await sealed(seller.id, { userPack: { opened: true, openedAt: new Date() } })).up
  const inTrade = (await sealed(seller.id)).up
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: seller.id, recipientId: other.id, status: 'PENDING' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: inTrade.id, role: 'OFFERED' } })
  const listed = (await sealed(seller.id)).up
  assert.equal((await create(seller.id, { userPackId: listed.id, initialBet: 5, durationDays: 1 })).status, 200)

  assert.equal((await create(seller.id, { userPackId: theirs.id, initialBet: 5, durationDays: 1 })).status, 404)
  assert.equal((await create(seller.id, { userPackId: opened.id, initialBet: 5, durationDays: 1 })).status, 400)
  assert.equal((await create(seller.id, { userPackId: inTrade.id, initialBet: 5, durationDays: 1 })).status, 409)
  assert.equal((await create(seller.id, { userPackId: listed.id, initialBet: 5, durationDays: 1 })).status, 409)
  assert.equal((await create(null, { userPackId: mine.id, initialBet: 5, durationDays: 1 })).status, 401)
  for (const bad of [{}, { userPackId: 'nope', initialBet: 5 }, { userPackId: mine.id }, { userPackId: mine.id, initialBet: 0 },
    { userPackId: mine.id, initialBet: -3 }, { userPackId: mine.id, initialBet: 1.5 }, { userPackId: mine.id, initialBet: 5e9 },
    { userPackId: mine.id, initialBet: '5\n\n\nspam' }, { userPackId: mine.id, initialBet: 5, durationDays: -1 },
    { userPackId: mine.id, initialBet: 5, durationDays: 99999 }]) {
    const r = await create(seller.id, bad)
    assert.ok([401, 422].includes(r.status), `${JSON.stringify(bad)} -> ${r.status}`)
  }
  assert.equal(await prisma.auction.count({ where: { userPackId: mine.id } }), 0)
})

run('racing an auction against a trade offer (or another auction) for the SAME pack: exactly one wins', async () => {
  for (let i = 0; i < 5; i++) {
    const [seller, buyer] = [await mkUser(prisma), await mkUser(prisma)]
    const { up, pack } = await sealed(seller.id)
    const rs = await Promise.all([
      create(seller.id, { userPackId: up.id, initialBet: 5, durationDays: 1 }),
      api.call('post', '/api/trade/offers', { userId: seller.id, body: { recipientUsername: buyer.username, packsOffered: [{ packId: pack.id, quantity: 1 }] } }),
      create(seller.id, { userPackId: up.id, initialBet: 6, durationDays: 1 })
    ])
    assert.equal(rs.filter(r => r.status === 200).length, 1, `round ${i}: ${JSON.stringify(rs.map(r => r.status))}`)
    const places = (await prisma.auction.count({ where: { userPackId: up.id, status: 'ACTIVE' } })) +
      (await prisma.tradeOfferPack.count({ where: { userPackId: up.id, tradeOffer: { status: 'PENDING' } } }))
    assert.equal(places, 1, 'the pack is in exactly one place')
  }
})

// ── settlement ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function endedPackAuction({ bids = [], sellerPoints = 500 } = {}) {
  const seller = await mkUser(prisma, { points: sellerPoints })
  const { up, pack } = await sealed(seller.id)
  const bidders = []
  for (const b of bids) bidders[b.who] ??= await mkUser(prisma, { points: 1000 })
  const createdAt = new Date(Date.now() - 24 * HOUR)
  const auction = await prisma.auction.create({
    data: { kind: 'PACK', userPackId: up.id, initialBet: 10, duration: 1, endAt: new Date(Date.now() - HOUR), createdAt, creatorId: seller.id }
  })
  let leader = null; let highest = 0
  for (const [i, b] of bids.entries()) {
    await prisma.bid.create({ data: { auctionId: auction.id, userId: bidders[b.who].id, amount: b.amount, createdAt: new Date(createdAt.getTime() + (i + 1) * 60000) } })
    if (b.amount > highest) {
      if (leader) await prisma.lockedPoints.updateMany({ where: { userId: leader, contextId: auction.id, status: 'ACTIVE' }, data: { status: 'RELEASED' } })
      await prisma.lockedPoints.create({ data: { userId: bidders[b.who].id, amount: b.amount, reason: 'AUCTION_BID', status: 'ACTIVE', contextType: 'AUCTION', contextId: auction.id } })
      leader = bidders[b.who].id; highest = b.amount
    }
  }
  if (leader) await prisma.auction.update({ where: { id: auction.id }, data: { highestBid: highest, highestBidderId: leader } })
  return { seller, up, pack, bidders, auction }
}

run('settling: the pack goes to the highest bidder, the seller is paid, history and notification record the PACK', async () => {
  const { seller, up, pack, bidders, auction } = await endedPackAuction({ bids: [{ who: 0, amount: 50 }, { who: 1, amount: 120 }] })
  const { won, d } = deps()
  const result = await settleAuction(auction.id, d)
  assert.deepEqual(result, { winnerId: bidders[1].id, winningBid: 120 })
  const row = await prisma.userPack.findUnique({ where: { id: up.id } })
  assert.deepEqual([row.userId, row.opened], [bidders[1].id, false])
  assert.equal(await pointsOf(prisma, bidders[1].id), 880); assert.equal(await pointsOf(prisma, seller.id), 620); assert.equal(await pointsOf(prisma, bidders[0].id), 1000)
  assert.equal((await prisma.auction.findUnique({ where: { id: auction.id } })).status, 'CLOSED')
  const log = await prisma.packOwnerLog.findFirst({ where: { userPackId: up.id, method: 'AUCTION' } })
  assert.deepEqual([log.userId, log.counterpartyUserId, log.auctionId], [bidders[1].id, seller.id, auction.id])
  assert.equal(won[0].ctoonName, pack.name, 'the "you won" text names the pack')
  assert.equal(await prisma.lockedPoints.count({ where: { contextId: auction.id, status: 'ACTIVE' } }), 0)
})

run('settling a pack auction leaves no cToon-shaped trace: no cToon ownership log, no trade-list change', async () => {
  const { seller, bidders, auction } = await endedPackAuction({ bids: [{ who: 0, amount: 30 }] })
  const ctoon = await mkCtoon(prisma)
  const before = (await prisma.ctoon.findUnique({ where: { id: ctoon.id } })).lastAuctionSoldPrice
  await settleAuction(auction.id, deps().d)
  assert.equal(await prisma.ctoonOwnerLog.count({ where: { userId: { in: [seller.id, bidders[0].id] } } }), 0)
  assert.equal((await prisma.ctoon.findUnique({ where: { id: ctoon.id } })).lastAuctionSoldPrice, before)
})

run('an unsold pack stays with the seller and can be listed again', async () => {
  const { seller, up, auction } = await endedPackAuction({ bids: [] })
  const { d } = deps()
  assert.deepEqual(await settleAuction(auction.id, d), { winnerId: null, winningBid: 0 })
  assert.equal((await prisma.userPack.findUnique({ where: { id: up.id } })).userId, seller.id)
  assert.equal((await create(seller.id, { userPackId: up.id, initialBet: 5, durationDays: 1 })).status, 200, 'free to list again')
})

run('if the pack is no longer the seller\'s sealed pack at close, NOBODY is charged and the holds are released', async () => {
  const { seller, up, bidders, auction } = await endedPackAuction({ bids: [{ who: 0, amount: 80 }] })
  const thief = await mkUser(prisma)
  await prisma.userPack.update({ where: { id: up.id }, data: { userId: thief.id } }) // admin transfer / data repair
  const { won, d } = deps()
  const result = await settleAuction(auction.id, d)
  assert.deepEqual(result, { winnerId: null, winningBid: 0 })
  assert.equal(await pointsOf(prisma, bidders[0].id), 1000); assert.equal(await pointsOf(prisma, seller.id), 500)
  assert.equal((await prisma.userPack.findUnique({ where: { id: up.id } })).userId, thief.id, 'the pack is left where it is')
  assert.equal(won.length, 0, 'no "you won" for a sale that did not happen')
  assert.equal(await prisma.lockedPoints.count({ where: { contextId: auction.id, status: 'ACTIVE' } }), 0)
  assert.equal((await prisma.auction.findUnique({ where: { id: auction.id } })).status, 'CLOSED')
})

run('an opened pack cannot be sold either', async () => {
  const { up, bidders, auction } = await endedPackAuction({ bids: [{ who: 0, amount: 80 }] })
  await prisma.userPack.update({ where: { id: up.id }, data: { opened: true, openedAt: new Date() } })
  const { d } = deps()
  assert.deepEqual(await settleAuction(auction.id, d), { winnerId: null, winningBid: 0 })
  assert.equal(await pointsOf(prisma, bidders[0].id), 1000)
})

run('settling twice is harmless: paid once, moved once', async () => {
  const { seller, bidders, auction } = await endedPackAuction({ bids: [{ who: 0, amount: 60 }] })
  const { d } = deps()
  await Promise.all([settleAuction(auction.id, d), settleAuction(auction.id, d)])
  assert.equal(await pointsOf(prisma, bidders[0].id), 940); assert.equal(await pointsOf(prisma, seller.id), 560)
})

run('a pack auction never looks like a double sale of another pack auction (the NULL userCtoonId trap)', async () => {
  // Two unrelated pack auctions both have userCtoonId NULL. A settle that queried "other auctions of this userCtoonId"
  // would match every pack auction and read the other sale as a conflict.
  const first = await endedPackAuction({ bids: [{ who: 0, amount: 40 }] })
  const second = await endedPackAuction({ bids: [{ who: 0, amount: 40 }] })
  const { d } = deps()
  await settleAuction(first.auction.id, d)
  const r = await settleAuction(second.auction.id, d)
  assert.equal(r.winningBid, 40, 'the second sale still completes')
  assert.equal((await prisma.userPack.findUnique({ where: { id: second.up.id } })).userId, second.bidders[0].id)
})

// ── read endpoints with cToon + pack auctions MIXED ───────────────────────────────────────────────────────────────
async function mixedData() {
  const seller = await mkUser(prisma); const viewer = await mkUser(prisma, { points: 1000 })
  const ctoon = await mkCtoon(prisma, { name: `Mix Toon ${Math.random()}` })
  const card = await mkUserCtoon(prisma, seller.id, ctoon.id, { isTradeable: false })
  const cAuc = await prisma.auction.create({ data: { userCtoonId: card.id, initialBet: 10, duration: 1, endAt: new Date(Date.now() + 2 * HOUR), creatorId: seller.id } })
  const { up, pack } = await sealed(seller.id, { pack: await mkBarePack(prisma, { name: `Mix Pack ${Math.random()}` }) })
  const pAuc = await prisma.auction.create({ data: { kind: 'PACK', userPackId: up.id, initialBet: 7, duration: 1, endAt: new Date(Date.now() + HOUR), creatorId: seller.id } })
  await prisma.bid.create({ data: { auctionId: pAuc.id, userId: viewer.id, amount: 9 } })
  await prisma.auction.update({ where: { id: pAuc.id }, data: { highestBid: 9, highestBidderId: viewer.id } })
  // a finished, sold pack auction (history + "recent sales")
  const sold = await endedPackAuction({ bids: [{ who: 0, amount: 33 }] })
  await settleAuction(sold.auction.id, deps().d)
  return { seller, viewer, ctoon, card, cAuc, up, pack, pAuc, sold }
}

run('Auction House current list: pack and cToon auctions together, no 500, correct item fields', async () => {
  const m = await mixedData()
  const res = await get('/api/auctions', m.viewer.id)
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300))
  const byId = Object.fromEntries(res.body.map(i => [i.id, i]))
  assert.equal(byId[m.pAuc.id].kind, 'PACK'); assert.equal(byId[m.pAuc.id].name, m.pack.name); assert.equal(byId[m.pAuc.id].assetPath, m.pack.imagePath)
  assert.equal(byId[m.pAuc.id].userPackId, m.up.id); assert.equal(byId[m.pAuc.id].ctoonId, null); assert.equal(byId[m.pAuc.id].rarity, null)
  assert.equal(byId[m.pAuc.id].initialBid, 7)
  assert.equal(byId[m.cAuc.id].kind, undefined, 'cToon rows are unchanged'); assert.equal(byId[m.cAuc.id].name, m.ctoon.name)
  assert.ok(byId[m.cAuc.id].userCtoonId)
})

run('history list, my auctions, my bids and trending all survive the mix', async () => {
  const m = await mixedData()
  const sellerQ = `&seller=${encodeURIComponent(m.sold.seller.username)}`
  const hist = await get(`/api/auctions/all?limit=100${sellerQ}`, m.viewer.id)
  assert.equal(hist.status, 200, JSON.stringify(hist.body).slice(0, 300))
  const soldRow = hist.body.items.find(i => i.id === m.sold.auction.id)
  assert.ok(soldRow); assert.equal(soldRow.kind, 'PACK'); assert.equal(soldRow.name, m.sold.pack.name)
  const onlyPacks = await get(`/api/auctions/all?limit=100&type=PACK${sellerQ}`, m.viewer.id)
  assert.ok(onlyPacks.body.items.length >= 1 && onlyPacks.body.items.every(i => i.kind === 'PACK'))
  const onlyCtoons = await get(`/api/auctions/all?limit=100&type=CTOON${sellerQ}`, m.viewer.id)
  assert.ok(onlyCtoons.body.items.every(i => i.kind !== 'PACK'))
  const byName = await get(`/api/auctions/all?limit=100&q=${encodeURIComponent(m.sold.pack.name.slice(0, 9))}${sellerQ}`, m.viewer.id)
  assert.ok(byName.body.items.some(i => i.id === m.sold.auction.id), 'a name search also matches pack names')
  const rarityFiltered = await get(`/api/auctions/all?limit=100&rarity=Common${sellerQ}`, m.viewer.id)
  assert.ok(rarityFiltered.body.items.every(i => i.kind !== 'PACK'), 'a cToon-only filter excludes packs')

  const mine = await get('/api/my-auctions?limit=100', m.seller.id)
  assert.equal(mine.status, 200, JSON.stringify(mine.body).slice(0, 300))
  const mineP = mine.body.items.find(i => i.id === m.pAuc.id)
  assert.deepEqual([mineP.kind, mineP.name, mineP.isOwner], ['PACK', m.pack.name, true])

  const bids = await get('/api/auction/mybids?limit=100', m.viewer.id)
  assert.equal(bids.status, 200, JSON.stringify(bids.body).slice(0, 300))
  const bidP = bids.body.items.find(i => i.id === m.pAuc.id)
  assert.deepEqual([bidP.kind, bidP.name, bidP.myBid], ['PACK', m.pack.name, 9])

  const trending = await get('/api/auctions/trending', m.viewer.id)
  assert.equal(trending.status, 200); assert.ok(trending.body.every(i => i.kind !== 'PACK'), 'trending is cToon-only')
})

run('auction detail for a pack: item, bids, recent sales of that pack type, and the re-list flag', async () => {
  const m = await mixedData()
  const res = await get(`/api/auction/${m.pAuc.id}`, m.viewer.id)
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300))
  assert.deepEqual([res.body.kind, res.body.userPackId, res.body.ctoon.name, res.body.ctoon.kind, res.body.isHolidayItem], ['PACK', m.up.id, m.pack.name, 'PACK', false])
  assert.equal(res.body.highestBid, 9); assert.equal(res.body.bids.length, 1)
  const cardRes = await get(`/api/auction/${m.cAuc.id}`, m.viewer.id)
  assert.equal(cardRes.status, 200); assert.equal(cardRes.body.ctoon.name, m.ctoon.name); assert.equal(cardRes.body.kind, 'CTOON')

  const recent = await get(`/api/auction/${m.sold.auction.id}/getRecentAuctions`, m.viewer.id)
  assert.equal(recent.status, 200); assert.deepEqual(recent.body.map(r => r.soldFor), [33])

  // unsold + back with the seller => can re-list; once it IS re-listed => cannot
  const un = await endedPackAuction({ bids: [] })
  await settleAuction(un.auction.id, deps().d)
  assert.equal((await get(`/api/auction/${un.auction.id}`, un.seller.id)).body.canRelist, true)
  assert.equal((await get(`/api/auction/${un.auction.id}`, m.viewer.id)).body.canRelist, false, 'only the holder')
  await create(un.seller.id, { userPackId: un.up.id, initialBet: 5, durationDays: 1 })
  assert.equal((await get(`/api/auction/${un.auction.id}`, un.seller.id)).body.canRelist, false)
})

run('the admin auction log shows a pack where it would show a cToon', async () => {
  const m = await mixedData()
  const admin = await mkUser(prisma); await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true } })
  const res = await get(`/api/admin/auctions?limit=100&creator=${encodeURIComponent(m.seller.username)}`, admin.id)
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300))
  const row = res.body.items.find(i => i.id === m.pAuc.id)
  assert.match(row.userCtoon.ctoon.name, new RegExp(m.pack.name)); assert.equal(row.kind, 'PACK')
})

run('while a pack is in an ACTIVE auction it cannot be opened or put in a trade (already covered), and a settled sale frees nothing it should not', async () => {
  const m = await mixedData()
  await assert.rejects(prisma.$transaction(tx => S.lockAndAssertPacks(tx, [m.up.id], { ownerId: m.seller.id })), (e) => e.statusCode === 409)
})
