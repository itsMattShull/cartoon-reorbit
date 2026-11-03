// The rules for opening a sealed pack that is OWNED (sits in My Collection) rather than bought-and-opened in one go:
// not while it is in an active auction or a pending trade, not twice, not if nothing can be pulled, and never via a
// state-changing GET. Real handler, real Postgres/Redis — see tests/packOpening.db.test.js for the base behaviour.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserPack, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, mintQueue, processMintJob

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ mintQueue } = await import('../server/utils/queues.js'))
  ;({ processMintJob } = await import('../server/utils/mintCtoon.js'))
  const openPack = (await import('../server/api/packs/open.post.js')).default
  api = await startApi([{ method: 'post', path: '/api/packs/open', handler: openPack }])
})
beforeEach(async () => { if (!skipUnlessDb) await mintQueue.obliterate({ force: true }) })
after(async () => { await api?.close(); if (!skipUnlessDb) { await mintQueue.obliterate({ force: true }); await mintQueue.close() } })

async function mkPackOf(ctoons, { count = 1, rarity = 'Common' } = {}) {
  return prisma.pack.create({
    data: {
      name: 'Rules pack', inCmart: true,
      rarityConfigs: { create: [{ rarity, count, probabilityPercent: 100 }] },
      ctoonOptions: { create: ctoons.map(c => ({ ctoonId: c.id, weight: 1 })) }
    }
  })
}
const open = (userPackId, userId) => api.call('post', '/api/packs/open', { userId, body: { userPackId } })
const sealed = async (id) => (await prisma.userPack.findUnique({ where: { id } })).opened === false
const queued = async () => (await mintQueue.getJobs(['waiting', 'delayed', 'prioritized'])).length
const inHours = (h) => new Date(Date.now() + h * 3600 * 1000)

run('a pack in an ACTIVE auction cannot be opened; it stays sealed and nothing is queued', async () => {
  const owner = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma, { quantity: 100 })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([ctoon])).id })
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: up.id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: owner.id } })
  const res = await open(up.id, owner.id)
  assert.equal(res.status, 409, JSON.stringify(res.body))
  assert.ok(await sealed(up.id))
  assert.equal(await queued(), 0)
})

run('a pack in a PENDING trade cannot be opened — but can once the trade is rejected', async () => {
  const [owner, other] = [await mkUser(prisma), await mkUser(prisma)]
  const ctoon = await mkCtoon(prisma, { quantity: 100 })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([ctoon])).id })
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: owner.id, recipientId: other.id, status: 'PENDING' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: up.id, role: 'OFFERED' } })
  assert.equal((await open(up.id, owner.id)).status, 409)
  assert.ok(await sealed(up.id))
  await prisma.tradeOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } })
  assert.equal((await open(up.id, owner.id)).status, 200)
})

run('a pack the requester is being ASKED for in someone else\'s pending trade is also protected from its owner opening it', async () => {
  const [owner, asker] = [await mkUser(prisma), await mkUser(prisma)]
  const ctoon = await mkCtoon(prisma, { quantity: 100 })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([ctoon])).id })
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: asker.id, recipientId: owner.id, status: 'PENDING' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: up.id, role: 'REQUESTED' } })
  assert.equal((await open(up.id, owner.id)).status, 409)
})

run('if nothing can be pulled the request fails, the pack stays sealed and nothing is consumed', async () => {
  const [owner, holder] = [await mkUser(prisma), await mkUser(prisma)]
  const gone = await mkCtoon(prisma, { quantity: 1, initialQuantity: 1 })
  await prisma.userCtoon.create({ data: { userId: holder.id, ctoonId: gone.id, mintNumber: 1 } })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([gone])).id })
  const res = await open(up.id, owner.id)
  assert.equal(res.status, 409, JSON.stringify(res.body))
  assert.match(res.body.statusMessage || res.body.message || '', /still sealed/i)
  assert.ok(await sealed(up.id))
  assert.equal(await prisma.packOwnerLog.count({ where: { userPackId: up.id, method: 'OPEN' } }), 0)
  assert.equal(await queued(), 0)
})

run('each card says whether it is NEW for this player, decided server-side before minting', async () => {
  const owner = await mkUser(prisma)
  const have = await mkCtoon(prisma, { quantity: 100 })
  const fresh = await mkCtoon(prisma, { quantity: 100 })
  await prisma.userCtoon.create({ data: { userId: owner.id, ctoonId: have.id, mintNumber: 1 } })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([have, fresh], { count: 2 })).id })
  const res = await open(up.id, owner.id)
  assert.equal(res.status, 200)
  const byId = Object.fromEntries(res.body.map(c => [c.id, c]))
  assert.equal(byId[have.id].isNew, false)
  assert.equal(byId[fresh.id].isNew, true)
  assert.equal(await prisma.packOwnerLog.count({ where: { userPackId: up.id, method: 'OPEN', userId: owner.id } }), 1)
})

run('the endpoint only accepts a JSON body and a real UUID', async () => {
  const owner = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma, { quantity: 100 })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([ctoon])).id })
  assert.equal((await api.call('post', '/api/packs/open', { userId: owner.id })).status, 415, 'no JSON content-type => refused (cross-site form/link safe)')
  assert.equal((await open('not-a-uuid', owner.id)).status, 400)
  assert.equal((await api.call('post', '/api/packs/open', { userId: owner.id, body: {} })).status, 400)
  assert.ok(await sealed(up.id))
})

run('double-click / parallel requests open a pack exactly once and queue its mints once', async () => {
  const owner = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma, { quantity: 100 })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([ctoon])).id })
  const rs = await Promise.all(Array.from({ length: 6 }, () => open(up.id, owner.id)))
  assert.equal(rs.filter(r => r.status === 200).length, 1, JSON.stringify(rs.map(r => r.status)))
  assert.ok(rs.filter(r => r.status !== 200).every(r => r.status === 400))
  assert.equal(await queued(), 1)
})

run('many owners opening the SAME pack type at once: no deadlock, every pack opens once, pool pruning stays consistent', async () => {
  const scarce = await mkCtoon(prisma, { quantity: 3, initialQuantity: 3 })
  const plenty = await mkCtoon(prisma, { quantity: 1000 })
  const pack = await mkPackOf([scarce, plenty])
  const owners = await Promise.all(Array.from({ length: 8 }, () => mkUser(prisma)))
  const ups = await Promise.all(owners.map(o => mkUserPack(prisma, o.id, { packId: pack.id })))
  const rs = await Promise.all(ups.map((up, i) => open(up.id, owners[i].id)))
  assert.deepEqual(rs.map(r => r.status), Array(8).fill(200), JSON.stringify(rs.map(r => r.body?.statusMessage)))
  assert.equal(await prisma.userPack.count({ where: { id: { in: ups.map(u => u.id) }, opened: true } }), 8)
  assert.equal(await queued(), 8)
  const opts = await prisma.packCtoonOption.findMany({ where: { packId: pack.id } })
  assert.ok(opts.every(o => o.weight >= 1), 'weights never go to zero/negative')
})

run('queued mints carry retry options so a transient failure does not cost the player a cToon', async () => {
  const owner = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma, { quantity: 100 })
  const up = await mkUserPack(prisma, owner.id, { packId: (await mkPackOf([ctoon])).id })
  assert.equal((await open(up.id, owner.id)).status, 200)
  const [job] = await mintQueue.getJobs(['waiting', 'delayed', 'prioritized'])
  assert.equal(job.opts.attempts, 3)
  await processMintJob(job, prisma)
  assert.equal(await prisma.userCtoon.count({ where: { userId: owner.id, ctoonId: ctoon.id, userPackId: up.id } }), 1)
})
