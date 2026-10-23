// Opening a pack must give the cToons to the person who owns the pack — once — and charge nothing.
// Runs the real handler (server/api/cmart/open-pack.get.js) against a real Postgres and Redis, then plays the
// mint jobs it queued through the real mint processor, which is what the BullMQ worker does in production.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, pointsOf, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, mintQueue, processMintJob

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ mintQueue } = await import('../server/utils/queues.js'))
  ;({ processMintJob } = await import('../server/utils/mintCtoon.js'))
  const openPack = (await import('../server/api/cmart/open-pack.get.js')).default
  api = await startApi([{ method: 'get', path: '/api/cmart/open-pack', handler: openPack }])
})
beforeEach(async () => { if (!skipUnlessDb) await mintQueue.obliterate({ force: true }) })
after(async () => { await api?.close(); if (!skipUnlessDb) { await mintQueue.obliterate({ force: true }); await mintQueue.close() } })

/** A pack whose Common slot always yields `count` cToons from `options` (each { ctoon, weight }). */
async function mkPack(options, { count = 1, rarity = 'Common', sellOutBehavior } = {}) {
  return prisma.pack.create({
    data: {
      name: 'Test pack', inCmart: true, ...(sellOutBehavior ? { sellOutBehavior } : {}),
      rarityConfigs: { create: [{ rarity, count, probabilityPercent: 100 }] },
      ctoonOptions: { create: options.map(o => ({ ctoonId: o.ctoon.id, weight: o.weight ?? 1 })) }
    }
  })
}
const openIt = (userPackId, userId) => api.call('get', `/api/cmart/open-pack?id=${userPackId}`, { userId })
/** Runs every queued mint job, in order, the way the worker would. */
async function runWorker() {
  const jobs = (await mintQueue.getJobs(['waiting', 'delayed', 'prioritized'])).sort((x, y) => x.timestamp - y.timestamp)
  for (const job of jobs) { await processMintJob(job, prisma); await job.remove() }
  return jobs
}
const copiesOf = (ctoonId) => prisma.userCtoon.findMany({ where: { ctoonId }, orderBy: { mintNumber: 'asc' } })

run('opening a pack queues one free mint per cToon pulled, for the pack owner, and nobody else gets anything', async () => {
  const owner = await mkUser(prisma, { points: 100 })
  const bystander = await mkUser(prisma, { points: 100 })
  const ctoon = await mkCtoon(prisma, { rarity: 'Common', quantity: 100 })
  const pack = await mkPack([{ ctoon }], { count: 1 })
  const userPack = await prisma.userPack.create({ data: { userId: owner.id, packId: pack.id } })

  const res = await openIt(userPack.id, owner.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.deepEqual(res.body.map(c => c.id), [ctoon.id])
  assert.equal(res.body[0].mintNumber, 1)
  assert.equal((await prisma.userPack.findUnique({ where: { id: userPack.id } })).opened, true)

  const jobs = await runWorker()
  assert.equal(jobs.length, 1)
  assert.deepEqual([jobs[0].data.userId, jobs[0].data.ctoonId, jobs[0].data.isSpecial, jobs[0].data.userPackId], [owner.id, ctoon.id, true, userPack.id])

  const copies = await copiesOf(ctoon.id)
  assert.equal(copies.length, 1)
  assert.equal(copies[0].userId, owner.id)
  assert.equal(copies[0].userPackId, userPack.id)
  assert.equal(copies[0].mintNumber, res.body[0].mintNumber, 'the number shown to the player is the number minted')
  assert.equal((await prisma.ctoonOwnerLog.findFirst({ where: { userCtoonId: copies[0].id } })).method, 'PACK')
  assert.equal(await pointsOf(prisma, owner.id), 100, 'opening a pack costs nothing')
  assert.equal(await pointsOf(prisma, bystander.id), 100)
})

run('a pack that yields several cToons mints every one of them to the owner', async () => {
  const owner = await mkUser(prisma)
  const ctoons = await Promise.all([1, 2, 3, 4].map(() => mkCtoon(prisma, { rarity: 'Common', quantity: 100 })))
  const pack = await mkPack(ctoons.map(ctoon => ({ ctoon })), { count: 3 })
  const userPack = await prisma.userPack.create({ data: { userId: owner.id, packId: pack.id } })

  const res = await openIt(userPack.id, owner.id)
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 3)
  assert.equal(new Set(res.body.map(c => c.id)).size, 3, 'three different cToons from the pool, no repeats')

  await runWorker()
  const owned = await prisma.userCtoon.findMany({ where: { userPackId: userPack.id } })
  assert.equal(owned.length, 3)
  assert.ok(owned.every(c => c.userId === owner.id))
  assert.deepEqual(new Set(owned.map(c => c.ctoonId)), new Set(res.body.map(c => c.id)))
})

run("you can't open someone else's pack, or one that's already open", async () => {
  const owner = await mkUser(prisma)
  const stranger = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma, { rarity: 'Common', quantity: 100 })
  const pack = await mkPack([{ ctoon }])
  const userPack = await prisma.userPack.create({ data: { userId: owner.id, packId: pack.id } })

  assert.equal((await openIt(userPack.id, stranger.id)).status, 404)
  assert.equal((await api.call('get', `/api/cmart/open-pack?id=${userPack.id}`)).status, 401)
  assert.equal((await mintQueue.getJobs(['waiting'])).length, 0, 'nothing was queued for the failed attempts')
  assert.equal((await prisma.userPack.findUnique({ where: { id: userPack.id } })).opened, false)

  assert.equal((await openIt(userPack.id, owner.id)).status, 200)
  const again = await openIt(userPack.id, owner.id)
  assert.equal(again.status, 400)
  await runWorker()
  assert.equal((await copiesOf(ctoon.id)).length, 1, 'opened once, minted once')
})

run('a cToon that is already sold out is never pulled', async () => {
  const owner = await mkUser(prisma)
  const holder = await mkUser(prisma)
  const soldOut = await mkCtoon(prisma, { rarity: 'Common', quantity: 1, initialQuantity: 1 })
  await prisma.userCtoon.create({ data: { userId: holder.id, ctoonId: soldOut.id, mintNumber: 1 } })
  const available = await mkCtoon(prisma, { rarity: 'Common', quantity: 100 })
  const pack = await mkPack([{ ctoon: soldOut, weight: 1000 }, { ctoon: available, weight: 1 }])

  for (let i = 0; i < 5; i++) {
    const userPack = await prisma.userPack.create({ data: { userId: owner.id, packId: pack.id } })
    const res = await openIt(userPack.id, owner.id)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.deepEqual(res.body.map(c => c.id), [available.id])
  }
  await runWorker()
  assert.equal((await copiesOf(soldOut.id)).length, 1, 'no extra copy of the sold-out cToon')
  assert.equal((await copiesOf(available.id)).length, 5)
})

run('pulling the last copy of a cToon removes it from the pack so it cannot be pulled again', async () => {
  const owner = await mkUser(prisma)
  const lastOne = await mkCtoon(prisma, { rarity: 'Common', quantity: 1, initialQuantity: 1 })
  const other = await mkCtoon(prisma, { rarity: 'Common', quantity: 100 })
  const pack = await mkPack([{ ctoon: lastOne, weight: 1000000 }, { ctoon: other, weight: 1 }])
  const first = await prisma.userPack.create({ data: { userId: owner.id, packId: pack.id } })

  const res = await openIt(first.id, owner.id)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.map(c => c.id), [lastOne.id])
  await runWorker()

  const remaining = await prisma.packCtoonOption.findMany({ where: { packId: pack.id } })
  assert.deepEqual(remaining.map(o => o.ctoonId), [other.id])
  assert.equal((await copiesOf(lastOne.id)).length, 1)
})

run('the same pack opened twice at the same moment only mints once', async () => {
  const owner = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma, { rarity: 'Common', quantity: 100 })
  const pack = await mkPack([{ ctoon }])
  const userPack = await prisma.userPack.create({ data: { userId: owner.id, packId: pack.id } })

  const results = await Promise.all([openIt(userPack.id, owner.id), openIt(userPack.id, owner.id), openIt(userPack.id, owner.id)])
  await runWorker()

  assert.equal(results.filter(r => r.status === 200).length, 1, `statuses: ${results.map(r => r.status)}`)
  assert.equal((await copiesOf(ctoon.id)).length, 1, 'one pack, one pull')
})
