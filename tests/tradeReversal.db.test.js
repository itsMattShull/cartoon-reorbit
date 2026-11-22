// Admin Trade Reversal tool against a real Postgres: items go back to whoever gave them, gone items are skipped or paid
// for at fair market value, points net into one transfer, open offers holding a returned item are withdrawn, and a
// trade can be reversed only once — even by two admins at the same moment. Skipped unless OWNERSHIP_TEST_DB is set
// (see tests/helpers/dbKit.js).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, mkUserPack, startApi, pointsOf, ownerOf, packOwnerOf } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, R

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  R = await import('../server/utils/tradeReversal.js')
  const h = async (p) => (await import(p)).default
  api = await startApi([
    { method: 'get', path: '/api/admin/trade-reversal/trades', handler: await h('../server/api/admin/trade-reversal/trades.get.js') },
    { method: 'get', path: '/api/admin/trade-reversal/trades/:id', handler: await h('../server/api/admin/trade-reversal/trades/[id].get.js') },
    { method: 'post', path: '/api/admin/trade-reversal/trades/:id/undo', handler: await h('../server/api/admin/trade-reversal/trades/[id]/undo.post.js') }
  ])
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma.$disconnect() })

async function mkAdmin () {
  const u = await mkUser(prisma)
  return prisma.user.update({ where: { id: u.id }, data: { isAdmin: true } })
}

/**
 * An ACCEPTED trade, already carried out: `offered` cToons/packs now belong to the recipient, `requested` ones to the
 * initiator, and the points have moved (balances given are the post-trade ones).
 */
async function mkAcceptedTrade ({ initiator, recipient, offered = [], requested = [], offeredPacks = [], requestedPacks = [], pointsOffered = 0, pointsRequested = 0 }) {
  return prisma.tradeOffer.create({
    data: {
      initiatorId: initiator.id,
      recipientId: recipient.id,
      pointsOffered,
      pointsRequested,
      status: 'ACCEPTED',
      ctoons: {
        create: [
          ...offered.map(uc => ({ userCtoonId: uc.id, role: 'OFFERED' })),
          ...requested.map(uc => ({ userCtoonId: uc.id, role: 'REQUESTED' }))
        ]
      },
      packs: {
        create: [
          ...offeredPacks.map(up => ({ userPackId: up.id, role: 'OFFERED' })),
          ...requestedPacks.map(up => ({ userPackId: up.id, role: 'REQUESTED' }))
        ]
      }
    }
  })
}

async function soldAuction (ctoonId, price) {
  const [seller, buyer] = [await mkUser(prisma), await mkUser(prisma)]
  const uc = await mkUserCtoon(prisma, buyer.id, ctoonId)
  return prisma.auction.create({
    data: {
      kind: 'CTOON', userCtoonId: uc.id, initialBet: 1, duration: 1, endAt: new Date(), status: 'CLOSED',
      creatorId: seller.id, highestBid: price, highestBidderId: buyer.id, winnerId: buyer.id, winnerAt: new Date()
    }
  })
}

/** POSTs the undo and returns the parsed server-sent events. */
async function undo (adminId, offerId, body) {
  const res = await api.call('post', `/api/admin/trade-reversal/trades/${offerId}/undo`, { userId: adminId, body })
  if (res.status !== 200) return { status: res.status, events: [], body: res.body }
  const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
  const events = text.split('\n')
    .filter(l => l.startsWith('data:'))
    .map(l => JSON.parse(l.slice(5).trim()))
  return { status: res.status, events, last: events[events.length - 1] }
}

run('only admins can use the tool', async () => {
  const user = await mkUser(prisma)
  for (const [m, p] of [['get', '/api/admin/trade-reversal/trades'], ['get', '/api/admin/trade-reversal/trades/x'], ['post', '/api/admin/trade-reversal/trades/x/undo']]) {
    assert.equal((await api.call(m, p, { userId: user.id, body: m === 'post' ? {} : undefined })).status, 403, p)
    assert.equal((await api.call(m, p, { body: m === 'post' ? {} : undefined })).status, 401, p)
  }
})

run('without fair market value: still-held items go back, gone items are skipped, points net, open offers are withdrawn', async () => {
  const admin = await mkAdmin()
  const [a, b, c] = [await mkUser(prisma, { points: 1000 }), await mkUser(prisma, { points: 2000 }), await mkUser(prisma)]
  const [t1, t2, t3] = [await mkCtoon(prisma), await mkCtoon(prisma), await mkCtoon(prisma)]
  // Post-trade state: A's c1 and c2 went to B (c2 since traded on to C), B's c3 went to A, A's pack went to B.
  const c1 = await mkUserCtoon(prisma, b.id, t1.id)
  const c2 = await mkUserCtoon(prisma, c.id, t2.id)
  const c3 = await mkUserCtoon(prisma, a.id, t3.id)
  const p1 = await mkUserPack(prisma, b.id)
  const offer = await mkAcceptedTrade({ initiator: a, recipient: b, offered: [c1, c2], requested: [c3], offeredPacks: [p1], pointsOffered: 300, pointsRequested: 100 })

  // B has since put c1 into an open offer to C, with points locked against it.
  const pending = await prisma.tradeOffer.create({
    data: { initiatorId: b.id, recipientId: c.id, pointsOffered: 10, status: 'PENDING', ctoons: { create: [{ userCtoonId: c1.id, role: 'OFFERED' }] } }
  })
  await prisma.lockedPoints.create({ data: { userId: b.id, amount: 10, reason: 'TRADE_OFFER', contextType: 'TRADE', contextId: pending.id } })

  // The list shows it with the right counts.
  const list = await api.call('get', `/api/admin/trade-reversal/trades?user=${a.username}`, { userId: admin.id })
  assert.equal(list.status, 200, JSON.stringify(list.body))
  const row = list.body.items.find(i => i.id === offer.id)
  assert.deepEqual([row.initiatorGave, row.recipientGave], [{ ctoons: 2, packs: 1, points: 300 }, { ctoons: 1, packs: 0, points: 100 }])
  assert.equal(row.reversal, null)

  // The preview matches.
  const preview = await api.call('get', `/api/admin/trade-reversal/trades/${offer.id}`, { userId: admin.id })
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  assert.equal(preview.body.reversible, true)
  const p = preview.body.withoutFairMarketValue
  assert.deepEqual(Object.fromEntries(p.items.map(i => [i.id, i.outcome])), { [c1.id]: 'RETURN', [c2.id]: 'SKIP', [c3.id]: 'RETURN', [p1.id]: 'RETURN' })
  assert.equal(p.items.find(i => i.id === c2.id).reasonCode, 'MOVED_ON')
  assert.deepEqual(p.balances, { initiator: { before: 1000, after: 1200 }, recipient: { before: 2000, after: 1800 } })

  const res = await undo(admin.id, offer.id, { includeFairMarketValue: false })
  assert.equal(res.status, 200)
  assert.equal(res.last.type, 'complete', JSON.stringify(res.events))
  assert.equal(res.events[0].type, 'start')
  const steps = res.events.filter(e => e.type === 'step')
  assert.equal(steps.at(-1).done, res.events[0].totalSteps, 'progress reaches 100%')

  assert.equal(await ownerOf(prisma, c1.id), a.id)
  assert.equal(await ownerOf(prisma, c2.id), c.id, 'a cToon traded away is left alone')
  assert.equal(await ownerOf(prisma, c3.id), b.id)
  assert.equal(await packOwnerOf(prisma, p1.id), a.id)
  assert.equal(await pointsOf(prisma, a.id), 1200)
  assert.equal(await pointsOf(prisma, b.id), 1800)

  assert.equal((await prisma.tradeOffer.findUnique({ where: { id: pending.id } })).status, 'WITHDRAWN')
  assert.equal((await prisma.lockedPoints.findFirst({ where: { contextId: pending.id } })).status, 'RELEASED')
  assert.equal((await prisma.tradeOffer.findUnique({ where: { id: offer.id } })).status, 'ACCEPTED', 'the trade itself keeps its status')

  const s = res.last.summary
  assert.deepEqual([s.counts.ctoonsReturned, s.counts.packsReturned, s.counts.ctoonsSkipped, s.withdrawnOffers], [2, 1, 1, 1])
  assert.deepEqual(s.points.balancesAfter, { initiator: 1200, recipient: 1800 })

  const logs = await prisma.pointsLog.findMany({ where: { userId: { in: [a.id, b.id] }, method: 'Trade Reversal' } })
  assert.deepEqual(logs.map(l => [l.userId, l.direction, l.points]).sort(), [[a.id, 'increase', 200], [b.id, 'decrease', 200]].sort())
  const ownerLogs = await prisma.ctoonOwnerLog.findMany({ where: { tradeOfferId: offer.id, method: 'TRADE_REVERSAL' } })
  assert.equal(ownerLogs.length, 2)
  assert.equal((await prisma.packOwnerLog.findMany({ where: { tradeOfferId: offer.id, method: 'TRADE_REVERSAL' } })).length, 1)
  assert.equal((await prisma.adminChangeLog.findMany({ where: { area: 'Admin:TradeReversal', userId: admin.id } })).length, 2)

  const reversal = await prisma.tradeReversal.findUnique({ where: { tradeOfferId: offer.id } })
  assert.equal(reversal.adminId, admin.id)
  assert.equal(reversal.summary.counts.ctoonsReturned, 2)

  // A second undo is refused and changes nothing.
  const again = await undo(admin.id, offer.id, { includeFairMarketValue: true })
  assert.equal(again.last.type, 'error')
  assert.match(again.last.message, /already been reversed/)
  assert.equal(await pointsOf(prisma, a.id), 1200)
  const preview2 = await api.call('get', `/api/admin/trade-reversal/trades/${offer.id}`, { userId: admin.id })
  assert.equal(preview2.body.reversible, false)
  const reversedList = await api.call('get', `/api/admin/trade-reversal/trades?user=${a.username}&reversed=yes`, { userId: admin.id })
  assert.ok(reversedList.body.items.some(i => i.id === offer.id && i.reversal))
})

run('with fair market value: the receiver pays the recent-sales value of every gone item, even below zero', async () => {
  const admin = await mkAdmin()
  const [a, b, c] = [await mkUser(prisma, { points: 0 }), await mkUser(prisma, { points: 100 }), await mkUser(prisma)]
  const t1 = await mkCtoon(prisma, { price: 50 })
  const t2 = await mkCtoon(prisma, { price: 80 }) // never auctioned -> its price
  await soldAuction(t1.id, 300)
  await soldAuction(t1.id, 500)
  const gone1 = await mkUserCtoon(prisma, c.id, t1.id) // traded on
  const gone2 = await mkUserCtoon(prisma, b.id, t2.id, { burnedAt: new Date() }) // burned
  const offer = await mkAcceptedTrade({ initiator: a, recipient: b, offered: [gone1, gone2] })

  const res = await undo(admin.id, offer.id, { includeFairMarketValue: true })
  assert.equal(res.last.type, 'complete', JSON.stringify(res.events))
  const s = res.last.summary
  assert.deepEqual(s.items.map(i => [i.id, i.outcome, i.fairMarketValue]).sort(), [[gone1.id, 'FMV', 400], [gone2.id, 'FMV', 80]].sort())
  assert.deepEqual(s.points.net.amount, 480)
  assert.equal(await pointsOf(prisma, a.id), 480)
  assert.equal(await pointsOf(prisma, b.id), -380)
  assert.equal(await ownerOf(prisma, gone1.id), c.id)
})

run('an item locked in an active auction by the receiver is not pulled out of it', async () => {
  const admin = await mkAdmin()
  const [a, b] = [await mkUser(prisma), await mkUser(prisma)]
  const t = await mkCtoon(prisma)
  const uc = await mkUserCtoon(prisma, b.id, t.id)
  await prisma.auction.create({ data: { kind: 'CTOON', userCtoonId: uc.id, initialBet: 1, duration: 1, endAt: new Date(Date.now() + 3600e3), status: 'ACTIVE', creatorId: b.id } })
  const offer = await mkAcceptedTrade({ initiator: a, recipient: b, offered: [uc] })
  const res = await undo(admin.id, offer.id, { includeFairMarketValue: false })
  assert.equal(res.last.type, 'complete', JSON.stringify(res.events))
  assert.equal(res.last.summary.items[0].outcome, 'SKIP')
  assert.equal(res.last.summary.items[0].reason, 'is listed in an active auction by the user who received it')
  assert.equal(await ownerOf(prisma, uc.id), b.id)
})

run('two admins reversing at the same moment: exactly one goes through', async () => {
  const [admin1, admin2] = [await mkAdmin(), await mkAdmin()]
  const [a, b] = [await mkUser(prisma, { points: 0 }), await mkUser(prisma, { points: 500 })]
  const t = await mkCtoon(prisma)
  const uc = await mkUserCtoon(prisma, b.id, t.id)
  const offer = await mkAcceptedTrade({ initiator: a, recipient: b, offered: [uc], pointsOffered: 500 })
  const results = await Promise.allSettled([
    R.executeTradeReversal(prisma, { offerId: offer.id, includeFairMarketValue: false, admin: admin1 }),
    R.executeTradeReversal(prisma, { offerId: offer.id, includeFairMarketValue: false, admin: admin2 })
  ])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, JSON.stringify(results.map(r => r.reason?.message)))
  const failed = results.find(r => r.status === 'rejected')
  assert.match(R.describeTradeReversalError(failed.reason), /already been reversed/)
  assert.equal(await pointsOf(prisma, a.id), 500, 'points moved once')
  assert.equal(await pointsOf(prisma, b.id), 0)
  assert.equal(await ownerOf(prisma, uc.id), a.id)
})

run('only accepted trades can be reversed', async () => {
  const admin = await mkAdmin()
  const [a, b] = [await mkUser(prisma), await mkUser(prisma)]
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: a.id, recipientId: b.id, status: 'REJECTED' } })
  const res = await undo(admin.id, offer.id, { includeFairMarketValue: false })
  assert.equal(res.last.type, 'error')
  assert.match(res.last.message, /Only accepted trades/)
  assert.equal(await prisma.tradeReversal.count({ where: { tradeOfferId: offer.id } }), 0)
})

run('a failure part way through rolls everything back, and the admin is told why', async () => {
  const admin = await mkAdmin()
  const [a, b] = [await mkUser(prisma, { points: 0 }), await mkUser(prisma, { points: 500 })]
  const t = await mkCtoon(prisma)
  const uc = await mkUserCtoon(prisma, b.id, t.id)
  const offer = await mkAcceptedTrade({ initiator: a, recipient: b, offered: [uc], pointsOffered: 500 })

  // Make the points step fail for this user only: by then the reversal row is written and the cToon has moved.
  const fn = `trfail_${a.id.replace(/-/g, '')}`
  await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN
    IF NEW."userId" = '${a.id}' THEN RAISE EXCEPTION 'points log refused for test'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE INSERT ON "PointsLog" FOR EACH ROW EXECUTE FUNCTION ${fn}()`)
  try {
    const res = await undo(admin.id, offer.id, { includeFairMarketValue: false })
    assert.equal(res.last.type, 'error', JSON.stringify(res.events))
    assert.match(res.last.message, /points log refused for test/)
    assert.ok(res.events.some(e => e.type === 'step'), 'some steps had reported progress before the failure')
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON "PointsLog"`)
    await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`)
  }
  assert.equal(await ownerOf(prisma, uc.id), b.id, 'the cToon move was rolled back')
  assert.equal(await pointsOf(prisma, a.id), 0)
  assert.equal(await pointsOf(prisma, b.id), 500)
  assert.equal(await prisma.tradeReversal.count({ where: { tradeOfferId: offer.id } }), 0, 'no reversal record, so it can be retried')

  // And it can be retried once the problem is gone.
  const retry = await undo(admin.id, offer.id, { includeFairMarketValue: false })
  assert.equal(retry.last.type, 'complete', JSON.stringify(retry.events))
  assert.equal(await ownerOf(prisma, uc.id), a.id)
})
