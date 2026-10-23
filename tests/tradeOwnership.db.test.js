// Accepting a trade offer must move every cToon and point to the right person — exactly once.
// Runs the real handler (server/api/trade/offers/[id]/accept.post.js) against a real Postgres; see helpers/dbKit.js.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, ownerOf, pointsOf, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const accept = (await import('../server/api/trade/offers/[id]/accept.post.js')).default
  api = await startApi([{ method: 'post', path: '/api/trade/offers/:id/accept', handler: accept }])
})
after(async () => { await api?.close() })

/** Two traders, each with one cToon, and a pending offer from `a` to `b`. */
async function setup({ aPoints = 1000, bPoints = 1000, pointsOffered = 0, pointsRequested = 0, offer = true, request = true } = {}) {
  const a = await mkUser(prisma, { points: aPoints })
  const b = await mkUser(prisma, { points: bPoints })
  const ctoon = await mkCtoon(prisma)
  const aCard = await mkUserCtoon(prisma, a.id, ctoon.id)
  const bCard = await mkUserCtoon(prisma, b.id, ctoon.id)
  const tradeOffer = await prisma.tradeOffer.create({
    data: {
      initiatorId: a.id, recipientId: b.id, pointsOffered, pointsRequested,
      ctoons: { create: [
        ...(offer ? [{ userCtoonId: aCard.id, role: 'OFFERED' }] : []),
        ...(request ? [{ userCtoonId: bCard.id, role: 'REQUESTED' }] : [])
      ] }
    }
  })
  return { a, b, aCard, bCard, offerId: tradeOffer.id }
}
const accept = (offerId, userId) => api.call('post', `/api/trade/offers/${offerId}/accept`, { userId })
const statusOf = async (offerId) => (await prisma.tradeOffer.findUnique({ where: { id: offerId } })).status

run('accepting swaps the cToons and moves the points between the right people', async () => {
  const { a, b, aCard, bCard, offerId } = await setup({ pointsOffered: 100 })

  const res = await accept(offerId, b.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))

  assert.equal(await ownerOf(prisma, aCard.id), b.id, "initiator's cToon goes to the recipient")
  assert.equal(await ownerOf(prisma, bCard.id), a.id, "recipient's cToon goes to the initiator")
  assert.equal(await pointsOf(prisma, a.id), 900)
  assert.equal(await pointsOf(prisma, b.id), 1100)

  const offer = await prisma.tradeOffer.findUnique({ where: { id: offerId } })
  assert.equal(offer.status, 'ACCEPTED')
  assert.equal(offer.acceptedByUserId, b.id)

  const logs = await prisma.ctoonOwnerLog.findMany({ where: { tradeOfferId: offerId } })
  assert.equal(logs.length, 2)
  assert.ok(logs.every(l => l.method === 'TRADE'))
  assert.equal(logs.find(l => l.userCtoonId === aCard.id).userId, b.id)
  assert.equal(logs.find(l => l.userCtoonId === bCard.id).userId, a.id)

  const pointsLogs = await prisma.pointsLog.findMany({ where: { userId: { in: [a.id, b.id] } } })
  assert.deepEqual(
    pointsLogs.map(l => `${l.userId === a.id ? 'a' : 'b'}:${l.direction}:${l.points}:${l.total}`).sort(),
    ['a:decrease:100:900', 'b:increase:100:1100']
  )
})

run('a counter offer that asks the recipient for points moves them the other way', async () => {
  const { a, b, offerId } = await setup({ pointsOffered: 0, pointsRequested: 250 })
  const res = await accept(offerId, b.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(await pointsOf(prisma, a.id), 1250)
  assert.equal(await pointsOf(prisma, b.id), 750)
})

run('a one-sided gift (cToon only, nothing requested back) still lands with the recipient', async () => {
  const { b, aCard, bCard, offerId } = await setup({ request: false })
  const res = await accept(offerId, b.id)
  assert.equal(res.status, 200)
  assert.equal(await ownerOf(prisma, aCard.id), b.id)
  assert.equal(await ownerOf(prisma, bCard.id), b.id, "the recipient's own cToon is untouched")
})

run('only the recipient can accept — not the initiator, not a stranger', async () => {
  const { a, aCard, bCard, offerId } = await setup()
  const stranger = await mkUser(prisma)

  for (const who of [a, stranger]) {
    const res = await accept(offerId, who.id)
    assert.equal(res.status, 403)
  }
  assert.equal((await api.call('post', `/api/trade/offers/${offerId}/accept`)).status, 401, 'logged-out')
  assert.equal(await ownerOf(prisma, aCard.id), a.id)
  assert.notEqual(await ownerOf(prisma, bCard.id), a.id)
  assert.equal(await statusOf(offerId), 'PENDING')
})

run('if the initiator no longer owns an offered cToon the offer is rejected and nothing moves', async () => {
  const { a, b, aCard, bCard, offerId } = await setup({ pointsOffered: 100 })
  const thief = await mkUser(prisma)
  await prisma.userCtoon.update({ where: { id: aCard.id }, data: { userId: thief.id } }) // sold elsewhere

  const res = await accept(offerId, b.id)
  assert.equal(res.status, 400)
  assert.equal(await statusOf(offerId), 'REJECTED')
  assert.equal(await ownerOf(prisma, aCard.id), thief.id)
  assert.equal(await ownerOf(prisma, bCard.id), b.id)
  assert.equal(await pointsOf(prisma, a.id), 1000)
  assert.equal(await pointsOf(prisma, b.id), 1000)
})

run('if the recipient no longer owns a requested cToon the offer is rejected and nothing moves', async () => {
  const { a, b, aCard, bCard, offerId } = await setup()
  const other = await mkUser(prisma)
  await prisma.userCtoon.update({ where: { id: bCard.id }, data: { userId: other.id } })

  const res = await accept(offerId, b.id)
  assert.equal(res.status, 400)
  assert.equal(await statusOf(offerId), 'REJECTED')
  assert.equal(await ownerOf(prisma, aCard.id), a.id)
  assert.equal(await ownerOf(prisma, bCard.id), other.id)
})

run('an initiator who can no longer afford the points offered gets the offer rejected and nothing moves', async () => {
  const { a, b, aCard, bCard, offerId } = await setup({ aPoints: 50, pointsOffered: 100 })
  const res = await accept(offerId, b.id)
  assert.equal(res.status, 400)
  assert.equal(await statusOf(offerId), 'REJECTED')
  assert.equal(await ownerOf(prisma, aCard.id), a.id)
  assert.equal(await ownerOf(prisma, bCard.id), b.id)
  assert.equal(await pointsOf(prisma, a.id), 50)
  assert.equal(await pointsOf(prisma, b.id), 1000)
})

run('a recipient who cannot cover the points asked of them is refused but the offer stays open', async () => {
  const { a, b, aCard, bCard, offerId } = await setup({ bPoints: 100, pointsRequested: 500 })
  const res = await accept(offerId, b.id)
  assert.equal(res.status, 400)
  assert.equal(await statusOf(offerId), 'PENDING', 'fixable by earning points, so not rejected')
  assert.equal(await ownerOf(prisma, aCard.id), a.id)
  assert.equal(await ownerOf(prisma, bCard.id), b.id)
})

run("points locked in an auction bid don't count as available for the recipient", async () => {
  const { b, offerId } = await setup({ bPoints: 600, pointsRequested: 500 })
  await prisma.lockedPoints.create({
    data: { userId: b.id, amount: 400, reason: 'AUCTION_BID', status: 'ACTIVE', contextType: 'AUCTION', contextId: 'some-auction' }
  })
  const res = await accept(offerId, b.id)
  assert.equal(res.status, 400) // 600 total - 400 locked = 200 available < 500
  assert.equal(await pointsOf(prisma, b.id), 600)
})

run('accepting consumes the lock held for the points offered', async () => {
  const { a, b, offerId } = await setup({ pointsOffered: 100 })
  const lock = await prisma.lockedPoints.create({
    data: { userId: a.id, amount: 100, reason: 'TRADE_OFFER', status: 'ACTIVE', contextType: 'TRADE', contextId: offerId }
  })
  assert.equal((await accept(offerId, b.id)).status, 200)
  assert.equal((await prisma.lockedPoints.findUnique({ where: { id: lock.id } })).status, 'CONSUMED')
})

run('a traded cToon is removed from its previous owner\'s trade list', async () => {
  const { a, b, aCard, offerId } = await setup()
  await prisma.userTradeListItem.create({ data: { userId: a.id, userCtoonId: aCard.id } })
  assert.equal((await accept(offerId, b.id)).status, 200)
  assert.equal(await prisma.userTradeListItem.count({ where: { userCtoonId: aCard.id } }), 0)
})

run('accepting twice (including simultaneously) only trades once', async () => {
  // sequential
  const first = await setup({ pointsOffered: 100 })
  assert.equal((await accept(first.offerId, first.b.id)).status, 200)
  const again = await accept(first.offerId, first.b.id)
  assert.equal(again.status, 400)
  assert.equal(await pointsOf(prisma, first.a.id), 900, 'points not paid a second time')
  assert.equal(await pointsOf(prisma, first.b.id), 1100)

  // simultaneous
  const race = await setup({ pointsOffered: 100 })
  const results = await Promise.all([accept(race.offerId, race.b.id), accept(race.offerId, race.b.id), accept(race.offerId, race.b.id)])
  assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results.map(r => r.status)))
  assert.equal(await pointsOf(prisma, race.a.id), 900)
  assert.equal(await pointsOf(prisma, race.b.id), 1100)
  assert.equal(await ownerOf(prisma, race.aCard.id), race.b.id)
  assert.equal(await ownerOf(prisma, race.bCard.id), race.a.id)
  assert.equal(await prisma.ctoonOwnerLog.count({ where: { tradeOfferId: race.offerId } }), 2)
})

run('one cToon offered to two people: only one accept wins and the loser pays nothing', async () => {
  const a = await mkUser(prisma, { points: 1000 })
  const b = await mkUser(prisma, { points: 1000 })
  const c = await mkUser(prisma, { points: 1000 })
  const ctoon = await mkCtoon(prisma)
  const card = await mkUserCtoon(prisma, a.id, ctoon.id)
  const mkOffer = (recipientId) => prisma.tradeOffer.create({
    data: { initiatorId: a.id, recipientId, pointsOffered: 100, ctoons: { create: [{ userCtoonId: card.id, role: 'OFFERED' }] } }
  })
  const toB = await mkOffer(b.id)
  const toC = await mkOffer(c.id)

  const [rb, rc] = await Promise.all([accept(toB.id, b.id), accept(toC.id, c.id)])
  assert.deepEqual([rb.status, rc.status].filter(s => s === 200).length, 1, `${rb.status} / ${rc.status}`)

  const winner = rb.status === 200 ? b : c
  const loser = rb.status === 200 ? c : b
  assert.equal(await ownerOf(prisma, card.id), winner.id, 'the cToon has exactly one new owner')
  assert.equal(await pointsOf(prisma, a.id), 900, 'initiator pays out once, not twice')
  assert.equal(await pointsOf(prisma, winner.id), 1100)
  assert.equal(await pointsOf(prisma, loser.id), 1000)
  assert.equal(await prisma.ctoonOwnerLog.count({ where: { userCtoonId: card.id, method: 'TRADE' } }), 1)
})

run('a burned cToon cannot be traded away', async () => {
  const { a, b, aCard, bCard, offerId } = await setup()
  await prisma.userCtoon.update({ where: { id: aCard.id }, data: { burnedAt: new Date() } })
  const res = await accept(offerId, b.id)
  assert.ok(res.status >= 400)
  assert.equal(await ownerOf(prisma, aCard.id), a.id)
  assert.equal(await ownerOf(prisma, bCard.id), b.id)
})
