// Redeeming a code that awards sealed packs. The guarantees that matter:
//  * packs exist exactly once per redemption (no double-grant on retry, parallel requests or a mint failure);
//  * a code that also mints cToons creates its packs only AFTER every mint succeeded, so a rolled-back claim can never
//    leave the player holding packs they already opened/traded (the loop: open -> mint failure -> claim rolled back ->
//    redeem again for a second set);
//  * maxClaims holds under parallel redeemers; pack-only codes need no Redis.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkBarePack, startApi, pointsOf } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, mintQueue, worker, grantCodePacks

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ mintQueue } = await import('../server/utils/queues.js'))
  ;({ grantCodePacks } = await import('../server/utils/codePackGrant.js'))
  const { processMintJob } = await import('../server/utils/mintCtoon.js')
  const { Worker } = await import('bullmq')
  // The real worker, as in production: redeem waits on mint jobs to finish.
  worker = new Worker(mintQueue.name, job => processMintJob(job, prisma), {
    connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) }
  })
  const redeem = (await import('../server/api/redeem.post.js')).default
  api = await startApi([{ method: 'post', path: '/api/redeem', handler: redeem }])
})
after(async () => {
  await api?.close()
  await worker?.close()
  if (!skipUnlessDb) { await mintQueue.obliterate({ force: true }); await mintQueue.close(); await prisma.$disconnect() }
})

const redeem = (code, userId) => api.call('post', '/api/redeem', { userId, body: { code } })
const rand = () => randomUUID().slice(0, 8)

async function mkCode({ maxClaims = 100, points = 0, packs = [], ctoons = [], batches } = {}) {
  const code = `T${rand()}`
  const mkBatch = (b) => ({
    points: b.points ?? 0,
    ...(b.ctoons?.length ? { ctoons: { create: b.ctoons.map(c => ({ ctoonId: c.id, quantity: c.quantity ?? 1 })) } } : {}),
    ...(b.packs?.length ? { packs: { create: b.packs.map(p => ({ packId: p.packId, quantity: p.quantity })) } } : {})
  })
  await prisma.claimCode.create({
    data: { code, maxClaims, rewards: { create: (batches || [{ points, packs, ctoons }]).map(mkBatch) } }
  })
  return code
}
const packsOf = (userId) => prisma.userPack.findMany({ where: { userId }, orderBy: { sourceOrdinal: 'asc' } })

run('a pack-only code awards sealed packs, tagged as code grants, with a history row each — and queues nothing', async () => {
  const [a, b] = [await mkBarePack(prisma), await mkBarePack(prisma)]
  const user = await mkUser(prisma)
  const code = await mkCode({ packs: [{ packId: a.id, quantity: 3 }, { packId: b.id, quantity: 1 }] })
  const res = await redeem(code, user.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const byPack = Object.fromEntries(res.body.packs.map(p => [p.packId, p]))
  assert.equal(byPack[a.id].quantity, 3); assert.equal(byPack[a.id].userPackIds.length, 3)
  assert.equal(byPack[b.id].quantity, 1)
  assert.equal(byPack[a.id].name, a.name); assert.equal(byPack[a.id].imagePath, a.imagePath)

  const rows = await packsOf(user.id)
  assert.equal(rows.length, 4)
  assert.ok(rows.every(r => r.source === 'CODE' && r.opened === false && r.buyerId === null && r.pricePaid === null))
  const claim = await prisma.claim.findFirst({ where: { userId: user.id } })
  assert.ok(rows.every(r => r.sourceRef === claim.id))
  assert.deepEqual(rows.map(r => r.sourceOrdinal), [0, 1, 2, 3])
  assert.deepEqual(new Set(res.body.packs.flatMap(p => p.userPackIds)), new Set(rows.map(r => r.id)))
  assert.equal(await prisma.packOwnerLog.count({ where: { userPackId: { in: rows.map(r => r.id) }, method: 'CODE', userId: user.id } }), 4)
  assert.equal((await mintQueue.getJobs(['waiting', 'active', 'delayed', 'completed'])).length, 0, 'no mint jobs for a pack-only code')
})

run('redeeming twice grants once; the second attempt is refused and adds nothing', async () => {
  const p = await mkBarePack(prisma)
  const user = await mkUser(prisma)
  const code = await mkCode({ packs: [{ packId: p.id, quantity: 2 }] })
  assert.equal((await redeem(code, user.id)).status, 200)
  const again = await redeem(code, user.id)
  assert.equal(again.status, 400)
  assert.equal((await packsOf(user.id)).length, 2)
})

run('the same user firing parallel requests redeems once (and gets packs once)', async () => {
  const p = await mkBarePack(prisma)
  const user = await mkUser(prisma)
  const code = await mkCode({ packs: [{ packId: p.id, quantity: 2 }] })
  const rs = await Promise.all(Array.from({ length: 6 }, () => redeem(code, user.id)))
  assert.equal(rs.filter(r => r.status === 200).length, 1, JSON.stringify(rs.map(r => r.status)))
  assert.ok(rs.filter(r => r.status !== 200).every(r => r.status === 400))
  assert.equal((await packsOf(user.id)).length, 2)
  assert.equal(await prisma.claim.count({ where: { userId: user.id } }), 1)
})

run('maxClaims holds under parallel redeemers, and only successful claims get packs', async () => {
  const p = await mkBarePack(prisma)
  const users = await Promise.all(Array.from({ length: 8 }, () => mkUser(prisma)))
  const code = await mkCode({ maxClaims: 3, packs: [{ packId: p.id, quantity: 2 }] })
  const rs = await Promise.all(users.map(u => redeem(code, u.id)))
  assert.equal(rs.filter(r => r.status === 200).length, 3, JSON.stringify(rs.map(r => r.status)))
  assert.equal(await prisma.userPack.count({ where: { userId: { in: users.map(u => u.id) } } }), 6)
  assert.equal(await prisma.claim.count({ where: { code: { code } } }), 3)
})

run('the same pack in two reward batches is summed into one award', async () => {
  const p = await mkBarePack(prisma)
  const user = await mkUser(prisma)
  const code = await mkCode({ batches: [{ packs: [{ packId: p.id, quantity: 2 }] }, { packs: [{ packId: p.id, quantity: 3 }] }] })
  const res = await redeem(code, user.id)
  assert.equal(res.status, 200)
  assert.equal(res.body.packs.length, 1); assert.equal(res.body.packs[0].quantity, 5)
  assert.equal((await packsOf(user.id)).length, 5)
})

run('a code that also mints cToons: packs appear only after the mints, with the cToons and points', async () => {
  const p = await mkBarePack(prisma)
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const user = await mkUser(prisma, { points: 5 })
  const code = await mkCode({ points: 50, ctoons: [{ id: ct.id, quantity: 2 }], packs: [{ packId: p.id, quantity: 2 }] })
  const res = await redeem(code, user.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.ctoons.length, 2)
  assert.equal(res.body.packs[0].quantity, 2)
  assert.equal(await pointsOf(prisma, user.id), 55)
  const minted = await prisma.userCtoon.findMany({ where: { userId: user.id, ctoonId: ct.id } })
  const packs = await packsOf(user.id)
  assert.equal(minted.length, 2); assert.equal(packs.length, 2)
  const lastMint = Math.max(...minted.map(m => m.createdAt.getTime()))
  assert.ok(packs.every(pk => pk.createdAt.getTime() >= lastMint), 'packs were created after the last mint')
})

run('if a mint fails the claim is rolled back and NO pack was ever created, so a retry cannot double-grant', async () => {
  const p = await mkBarePack(prisma)
  const holder = await mkUser(prisma)
  const gone = await mkCtoon(prisma, { quantity: 1, initialQuantity: 1 })
  await prisma.userCtoon.create({ data: { userId: holder.id, ctoonId: gone.id, mintNumber: 1 } })
  const user = await mkUser(prisma, { points: 0 })
  const code = await mkCode({ points: 40, ctoons: [{ id: gone.id, quantity: 1 }], packs: [{ packId: p.id, quantity: 3 }] })
  const res = await redeem(code, user.id)
  assert.equal(res.status, 500, JSON.stringify(res.body))
  assert.equal((await packsOf(user.id)).length, 0, 'no packs were ever created')
  assert.equal(await prisma.claim.count({ where: { userId: user.id } }), 0, 'claim rolled back')
  assert.equal(await pointsOf(prisma, user.id), 0, 'points reversed')
  assert.equal(await prisma.packOwnerLog.count({ where: { userId: user.id } }), 0)
})

run('grantCodePacks is idempotent per claim: a second run creates nothing and returns the same ids', async () => {
  const p = await mkBarePack(prisma)
  const user = await mkUser(prisma)
  const claimId = `claim-${rand()}`
  const first = await prisma.$transaction(tx => grantCodePacks(tx, { userId: user.id, claimId, awards: [{ packId: p.id, quantity: 3 }] }))
  const second = await prisma.$transaction(tx => grantCodePacks(tx, { userId: user.id, claimId, awards: [{ packId: p.id, quantity: 3 }] }))
  assert.deepEqual(second, first)
  assert.equal((await packsOf(user.id)).length, 3)
  assert.equal(await prisma.packOwnerLog.count({ where: { userId: user.id, method: 'CODE' } }), 3, 'history written once')
})

run('a code with no packs still works and reports an empty packs list', async () => {
  const user = await mkUser(prisma)
  const code = await mkCode({ points: 25 })
  const res = await redeem(code, user.id)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.packs, [])
  assert.equal(await pointsOf(prisma, user.id), 25)
})
