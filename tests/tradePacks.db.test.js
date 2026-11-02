// Trading sealed packs, end to end against a real Postgres: create / counter / accept / reject, with the rules that make
// packs safe to trade:
//   * a pack is in at most ONE place — never in a pending trade AND an auction, never opened while offered;
//   * accepting moves exactly the committed packs, exactly once, and leaves an audit trail;
//   * the other party's packs are never probe-able (one generic message, no row ids);
//   * a counter re-picks packs under lock with no exemption leak.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkBarePack, mkUserPack, pointsOf, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const create = (await import('../server/api/trade/offers.post.js')).default
  const counter = (await import('../server/api/trade/offers/[id]/counter.post.js')).default
  const accept = (await import('../server/api/trade/offers/[id]/accept.post.js')).default
  const reject = (await import('../server/api/trade/offers/[id]/reject.post.js')).default
  const incoming = (await import('../server/api/trade/offers/incoming.get.js')).default
  const userPacks = (await import('../server/api/trade/user-packs.get.js')).default
  api = await startApi([
    { method: 'post', path: '/api/trade/offers', handler: create },
    { method: 'post', path: '/api/trade/offers/:id/counter', handler: counter },
    { method: 'post', path: '/api/trade/offers/:id/accept', handler: accept },
    { method: 'post', path: '/api/trade/offers/:id/reject', handler: reject },
    { method: 'get', path: '/api/trade/offers/incoming', handler: incoming },
    { method: 'get', path: '/api/trade/user-packs', handler: userPacks }
  ])
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma.$disconnect() })

const inHours = (h) => new Date(Date.now() + h * 3600 * 1000)
const offer = (userId, body) => api.call('post', '/api/trade/offers', { userId, body })
const accept = (id, userId) => api.call('post', `/api/trade/offers/${id}/accept`, { userId })
const reject = (id, userId) => api.call('post', `/api/trade/offers/${id}/reject`, { userId })
const counter = (id, userId, body) => api.call('post', `/api/trade/offers/${id}/counter`, { userId, body })
const give = async (userId, packId, n, over = {}) => Promise.all(Array.from({ length: n }, (_, i) => mkUserPack(prisma, userId, { packId, createdAt: new Date(Date.now() - (n - i) * 1000), ...over })))
const ownerCount = (userId, packId) => prisma.userPack.count({ where: { userId, packId, opened: false } })

async function pair(opts = {}) {
  const [a, b] = [await mkUser(prisma, { points: opts.aPoints ?? 1000 }), await mkUser(prisma, { points: opts.bPoints ?? 1000 })]
  const [pa, pb] = [await mkBarePack(prisma), await mkBarePack(prisma)]
  return { a, b, pa, pb }
}

run('offering 2 packs for 1: the server picks the copies, accept swaps exactly those, with an audit trail', async () => {
  const { a, b, pa, pb } = await pair()
  await give(a.id, pa.id, 3); await give(b.id, pb.id, 2)
  const res = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 2 }], packsRequested: [{ packId: pb.id, quantity: 1 }] })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.deepEqual([res.body.offer.packsOffered, res.body.offer.packsRequested], [2, 1])
  const rows = await prisma.tradeOfferPack.findMany({ where: { tradeOfferId: res.body.offer.id } })
  assert.equal(rows.filter(r => r.role === 'OFFERED').length, 2); assert.equal(rows.filter(r => r.role === 'REQUESTED').length, 1)

  const ok = await accept(res.body.offer.id, b.id)
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.deepEqual([await ownerCount(a.id, pa.id), await ownerCount(b.id, pa.id)], [1, 2])
  assert.deepEqual([await ownerCount(a.id, pb.id), await ownerCount(b.id, pb.id)], [1, 1])
  const moved = await prisma.userPack.findMany({ where: { id: { in: rows.map(r => r.userPackId) } } })
  assert.ok(moved.every(m => m.opened === false))
  const logs = await prisma.packOwnerLog.findMany({ where: { tradeOfferId: res.body.offer.id } })
  assert.equal(logs.length, 3); assert.ok(logs.every(l => l.method === 'TRADE'))
  const gotByB = logs.filter(l => l.userId === b.id); assert.equal(gotByB.length, 2); assert.ok(gotByB.every(l => l.counterpartyUserId === a.id && l.counterpartyUsername === a.username))
  assert.equal((await prisma.tradeOffer.findUnique({ where: { id: res.body.offer.id } })).status, 'ACCEPTED')
})

run('a pack-only gift works, mixes with points, and counts as content', async () => {
  const { a, b, pa } = await pair()
  await give(a.id, pa.id, 1)
  const res = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }], pointsOffered: 100 })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal((await accept(res.body.offer.id, b.id)).status, 200)
  assert.equal(await ownerCount(b.id, pa.id), 1)
  assert.equal(await pointsOf(prisma, a.id), 900); assert.equal(await pointsOf(prisma, b.id), 1100)
  assert.equal((await offer(a.id, { recipientUsername: b.username })).status, 400, 'an empty offer is still refused')
})

run('a pack in an ACTIVE auction cannot be traded, offered or requested; the auction never gets a second place', async () => {
  const { a, b, pa } = await pair()
  const [only] = await give(a.id, pa.id, 1)
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: only.id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: a.id } })
  const offering = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })
  assert.equal(offering.status, 400); assert.match(offering.body.statusMessage, /auction|available/i)
  const asking = await offer(b.id, { recipientUsername: a.username, packsRequested: [{ packId: pa.id, quantity: 1 }] })
  assert.equal(asking.status, 400)
  assert.equal(await prisma.tradeOfferPack.count({ where: { userPackId: only.id } }), 0)
})

run('a pack already in a PENDING trade cannot be put in a second one', async () => {
  const { a, b, pa } = await pair()
  await give(a.id, pa.id, 1)
  const c = await mkUser(prisma)
  assert.equal((await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })).status, 200)
  assert.equal((await offer(a.id, { recipientUsername: c.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })).status, 400)
  assert.equal((await offer(c.id, { recipientUsername: a.username, packsRequested: [{ packId: pa.id, quantity: 1 }] })).status, 400)
})

run('asking for packs the other player does not have gives one generic message, whatever the reason', async () => {
  const { a, b, pa } = await pair()
  const [opened] = await give(b.id, pa.id, 1, { opened: true, openedAt: new Date() })
  const none = await offer(a.id, { recipientUsername: b.username, packsRequested: [{ packId: pa.id, quantity: 1 }] })
  const inAuction = await (async () => {
    const [p] = await give(b.id, pa.id, 1)
    await prisma.auction.create({ data: { kind: 'PACK', userPackId: p.id, initialBet: 1, duration: 1, endAt: inHours(1), creatorId: b.id } })
    return offer(a.id, { recipientUsername: b.username, packsRequested: [{ packId: pa.id, quantity: 1 }] })
  })()
  const tooMany = await offer(a.id, { recipientUsername: b.username, packsRequested: [{ packId: pa.id, quantity: 9 }] })
  assert.deepEqual([none.status, inAuction.status, tooMany.status], [400, 400, 400])
  assert.equal(new Set([none.body.statusMessage, inAuction.body.statusMessage, tooMany.body.statusMessage]).size, 1)
  assert.ok(!/lock/i.test(none.body.statusMessage))
  void opened
})

run('validation: bad ids, quantities, shapes and oversized requests are refused before anything is written', async () => {
  const { a, b, pa } = await pair()
  await give(a.id, pa.id, 2)
  const bad = [
    { packsOffered: 'x' }, { packsOffered: [{ packId: 'nope', quantity: 1 }] }, { packsOffered: [{ packId: pa.id, quantity: 0 }] },
    { packsOffered: [{ packId: pa.id, quantity: 1.5 }] }, { packsOffered: [{ packId: pa.id, quantity: 51 }] },
    { packsOffered: [{ packId: pa.id, quantity: 30 }, { packId: pa.id, quantity: 30 }] }
  ]
  for (const b2 of bad) assert.equal((await offer(a.id, { recipientUsername: b.username, ...b2 })).status, 400, JSON.stringify(b2))
  assert.equal(await prisma.tradeOffer.count({ where: { initiatorId: a.id } }), 0)
})

run('you cannot trade a pack with yourself, and cannot offer more than you have free', async () => {
  const { a, b, pa } = await pair()
  await give(a.id, pa.id, 1)
  assert.equal((await offer(a.id, { recipientUsername: a.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })).status, 400)
  assert.equal((await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 2 }] })).status, 400)
})

run('while offered, a pack cannot be opened; rejecting or withdrawing frees it again', async () => {
  const { a, b, pa } = await pair()
  const [up] = await give(a.id, pa.id, 1)
  const res = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })
  const { lockAndAssertPacks } = await import('../server/utils/userPackState.js')
  await assert.rejects(prisma.$transaction(tx => lockAndAssertPacks(tx, [up.id], { ownerId: a.id })), (e) => e.statusCode === 409)
  assert.equal((await reject(res.body.offer.id, a.id)).status, 200, 'initiator withdraws')
  await prisma.$transaction(tx => lockAndAssertPacks(tx, [up.id], { ownerId: a.id })) // free again
  assert.equal((await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })).status, 200)
})

run('a counter re-picks packs: the originals are released, the counter holds the new set, nothing is double-held', async () => {
  const { a, b, pa, pb } = await pair()
  await give(a.id, pa.id, 2); await give(b.id, pb.id, 2)
  const first = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }], packsRequested: [{ packId: pb.id, quantity: 1 }] })
  assert.equal(first.status, 200)
  const second = await counter(first.body.offer.id, b.id, { packsOffered: [{ packId: pb.id, quantity: 2 }], packsRequested: [{ packId: pa.id, quantity: 2 }] })
  assert.equal(second.status, 200, JSON.stringify(second.body))
  assert.equal((await prisma.tradeOffer.findUnique({ where: { id: first.body.offer.id } })).status, 'COUNTERED')
  assert.equal(await prisma.tradeOfferPack.count({ where: { tradeOfferId: second.body.offer.id } }), 4)
  const held = await prisma.tradeOfferPack.groupBy({ by: ['userPackId'], where: { tradeOffer: { status: 'PENDING' } , userPackId: { in: (await prisma.userPack.findMany({ where: { userId: { in: [a.id, b.id] } }, select: { id: true } })).map(x => x.id) } }, _count: { _all: true } })
  assert.ok(held.every(h => h._count._all === 1), 'no pack sits in two pending offers')
  assert.equal((await accept(second.body.offer.id, a.id)).status, 200)
  assert.deepEqual([await ownerCount(a.id, pa.id), await ownerCount(b.id, pa.id), await ownerCount(a.id, pb.id), await ownerCount(b.id, pb.id)], [0, 2, 2, 0])
})

run('accepting twice (or racing an accept with a reject) moves packs once', async () => {
  const { a, b, pa } = await pair()
  await give(a.id, pa.id, 2)
  const res = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 2 }] })
  const rs = await Promise.all([accept(res.body.offer.id, b.id), accept(res.body.offer.id, b.id), reject(res.body.offer.id, b.id)])
  assert.equal(rs.filter(r => r.status === 200).length, 1, JSON.stringify(rs.map(r => r.status)))
  const bHas = await ownerCount(b.id, pa.id)
  const status = (await prisma.tradeOffer.findUnique({ where: { id: res.body.offer.id } })).status
  assert.equal(bHas, status === 'ACCEPTED' ? 2 : 0)
  assert.equal(await ownerCount(a.id, pa.id) + bHas, 2, 'no pack created or lost')
})

run('parallel offers competing for the same free packs: each pack ends up in at most one pending offer', async () => {
  const { a, b, pa } = await pair()
  const c = await mkUser(prisma)
  await give(a.id, pa.id, 3)
  const rs = await Promise.all([
    offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 2 }] }),
    offer(a.id, { recipientUsername: c.username, packsOffered: [{ packId: pa.id, quantity: 2 }] }),
    offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })
  ])
  const okCount = rs.filter(r => r.status === 200).reduce((n, r) => n + r.body.offer.packsOffered, 0)
  assert.ok(okCount <= 3, `committed ${okCount} of 3 packs`)
  const dupes = await prisma.tradeOfferPack.groupBy({ by: ['userPackId'], where: { tradeOffer: { status: 'PENDING', initiatorId: a.id } }, _count: { _all: true } })
  assert.ok(dupes.every(d => d._count._all === 1))
})

run('an offer whose pack was moved out from under it by an admin is rejected on accept, with the points released', async () => {
  const { a, b, pa } = await pair()
  const [up] = await give(a.id, pa.id, 1)
  const res = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }], pointsOffered: 200 })
  await prisma.userPack.update({ where: { id: up.id }, data: { userId: b.id } }) // admin transfer
  const ok = await accept(res.body.offer.id, b.id)
  assert.equal(ok.status, 400)
  assert.equal((await prisma.tradeOffer.findUnique({ where: { id: res.body.offer.id } })).status, 'REJECTED')
  assert.equal(await prisma.lockedPoints.count({ where: { userId: a.id, contextId: res.body.offer.id, status: 'ACTIVE' } }), 0)
})

run('incoming offers list the packs in them, without exposing more than name/art/type', async () => {
  const { a, b, pa } = await pair()
  await give(a.id, pa.id, 2)
  await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 2 }] })
  const res = await api.call('get', '/api/trade/offers/incoming', { userId: b.id })
  assert.equal(res.status, 200)
  const o = res.body[0]
  assert.equal(o.packs.length, 2)
  assert.deepEqual(Object.keys(o.packs[0].userPack.pack).sort(), ['id', 'imagePath', 'name'])
})

run('user-packs lists a player\'s tradable packs by type with counts only, and hides ones in an auction/trade', async () => {
  const { a, b, pa, pb } = await pair()
  const mine = await give(a.id, pa.id, 3)
  await give(a.id, pb.id, 1)
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: mine[0].id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: a.id } })
  const res = await api.call('get', `/api/trade/user-packs?username=${a.username}`, { userId: b.id })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const byId = Object.fromEntries(res.body.packs.map(p => [p.packId, p]))
  assert.equal(byId[pa.id].available, 2, 'the pack in the auction is not offered'); assert.equal(byId[pb.id].available, 1)
  assert.deepEqual(Object.keys(byId[pa.id]).sort(), ['available', 'imagePath', 'name', 'packId'])
  assert.equal((await api.call('get', '/api/trade/user-packs?username=nobody-here', { userId: b.id })).status, 404)
  assert.equal((await api.call('get', '/api/trade/user-packs')).status, 401)
  const self = await api.call('get', '/api/trade/user-packs', { userId: a.id })
  assert.equal(self.body.packs.find(p => p.packId === pa.id).available, 2)
})

run('user-packs excludeOfferId frees the packs of the offer being countered — for its parties only', async () => {
  const { a, b, pa } = await pair()
  const [only] = await give(a.id, pa.id, 1)
  const o = await offer(a.id, { recipientUsername: b.username, packsOffered: [{ packId: pa.id, quantity: 1 }] })
  assert.equal(o.status, 200, JSON.stringify(o.body))
  const avail = (userId, qs) => api.call('get', `/api/trade/user-packs?username=${a.username}${qs}`, { userId })
    .then(r => r.body.packs.find(p => p.packId === pa.id)?.available || 0)
  assert.equal(await avail(b.id, ''), 0, 'held by the pending offer')
  assert.equal(await avail(b.id, `&excludeOfferId=${o.body.offer.id}`), 1, 'the recipient countering it sees the pack as available')
  const stranger = await mkUser(prisma)
  assert.equal(await avail(stranger.id, `&excludeOfferId=${o.body.offer.id}`), 0, 'a non-party gets the plain answer')
  assert.equal(await avail(b.id, '&excludeOfferId=not-a-uuid'), 0, 'garbage is ignored')
  void only
})
