// Minting a cToon (a cMart purchase, or a special mint such as a pack/code/cZone award) must charge the right
// person the right amount, create exactly one copy for them with the next mint number, and never oversell.
// Runs the real job processor (server/utils/mintCtoon.js) — the same function the BullMQ mint worker calls —
// with the job payloads buy.post.js and open-pack.get.js enqueue.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, pointsOf } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, processMintJob

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ processMintJob } = await import('../server/utils/mintCtoon.js'))
})

const mint = (data) => processMintJob({ data }, prisma)
const cmartBuy = (userId, ctoon, extra = {}) => mint({ userId, ctoonId: ctoon.id, effectivePrice: ctoon.price, saleId: null, ...extra })
const copiesOf = (ctoonId) => prisma.userCtoon.findMany({ where: { ctoonId }, orderBy: { mintNumber: 'asc' } })
const rejects = (promise, pattern) => assert.rejects(promise, (err) => pattern.test(err.message), `expected an error matching ${pattern}`)

run('a cMart purchase charges the buyer and creates one copy for them, logged as CMART', async () => {
  const buyer = await mkUser(prisma, { points: 1000 })
  const ctoon = await mkCtoon(prisma, { price: 250, quantity: 10, initialQuantity: 10 })

  await cmartBuy(buyer.id, ctoon)

  assert.equal(await pointsOf(prisma, buyer.id), 750)
  const copies = await copiesOf(ctoon.id)
  assert.equal(copies.length, 1)
  assert.equal(copies[0].userId, buyer.id)
  assert.equal(copies[0].mintNumber, 1)
  assert.equal(copies[0].pricePaid, 250)
  assert.equal(copies[0].isFirstEdition, true)
  assert.equal((await prisma.ctoon.findUnique({ where: { id: ctoon.id } })).totalMinted, 1)

  const owner = await prisma.ctoonOwnerLog.findMany({ where: { userCtoonId: copies[0].id } })
  assert.deepEqual(owner.map(o => [o.userId, o.method, o.mintNumber]), [[buyer.id, 'CMART', 1]])
  const log = await prisma.pointsLog.findFirst({ where: { userId: buyer.id } })
  assert.deepEqual([log.direction, log.points, log.total, log.method], ['decrease', 250, 750, 'Bought cToon'])
  assert.equal(await prisma.cmartPurchaseLog.count({ where: { userId: buyer.id, ctoonId: ctoon.id } }), 1)
})

run('buyers get consecutive mint numbers and each copy belongs to its own buyer', async () => {
  const ctoon = await mkCtoon(prisma, { price: 10, quantity: 5, initialQuantity: 5 })
  const buyers = await Promise.all([1, 2, 3].map(() => mkUser(prisma, { points: 100 })))
  for (const b of buyers) await cmartBuy(b.id, ctoon)

  const copies = await copiesOf(ctoon.id)
  assert.deepEqual(copies.map(c => c.mintNumber), [1, 2, 3])
  assert.deepEqual(copies.map(c => c.userId), buyers.map(b => b.id))
})

run('a buyer without enough points gets nothing and is not charged', async () => {
  const buyer = await mkUser(prisma, { points: 99 })
  const ctoon = await mkCtoon(prisma, { price: 100, quantity: 10 })
  await rejects(cmartBuy(buyer.id, ctoon), /insufficient points/i)
  assert.equal(await pointsOf(prisma, buyer.id), 99)
  assert.equal((await copiesOf(ctoon.id)).length, 0)
  assert.equal((await prisma.ctoon.findUnique({ where: { id: ctoon.id } })).totalMinted, 0)
})

run('points held in an auction or trade are not spendable', async () => {
  const buyer = await mkUser(prisma, { points: 500 })
  await prisma.lockedPoints.create({
    data: { userId: buyer.id, amount: 450, reason: 'AUCTION_BID', status: 'ACTIVE', contextType: 'AUCTION', contextId: 'a-1' }
  })
  const ctoon = await mkCtoon(prisma, { price: 100, quantity: 10 })
  await rejects(cmartBuy(buyer.id, ctoon), /insufficient points/i)
  assert.equal((await copiesOf(ctoon.id)).length, 0)

  // once the hold is released the same purchase goes through
  await prisma.lockedPoints.updateMany({ where: { userId: buyer.id }, data: { status: 'RELEASED' } })
  await cmartBuy(buyer.id, ctoon)
  assert.equal(await pointsOf(prisma, buyer.id), 400)
})

run('the last copy sells once: a second buyer is refused and is not charged', async () => {
  const [first, second] = await Promise.all([mkUser(prisma, { points: 500 }), mkUser(prisma, { points: 500 })])
  const ctoon = await mkCtoon(prisma, { price: 100, quantity: 1, initialQuantity: 1 })

  await cmartBuy(first.id, ctoon)
  await rejects(cmartBuy(second.id, ctoon), /sold out/i)

  assert.equal((await copiesOf(ctoon.id)).length, 1)
  assert.equal(await pointsOf(prisma, second.id), 500)
  assert.equal((await prisma.ctoon.findUnique({ where: { id: ctoon.id } })).totalMinted, 1, 'the failed attempt did not burn a mint number')
})

run('a rush on a limited cToon never oversells, duplicates a mint number, or charges a loser', async () => {
  const LIMIT = 3
  const ctoon = await mkCtoon(prisma, { price: 100, quantity: LIMIT, initialQuantity: LIMIT })
  const buyers = await Promise.all(Array.from({ length: 8 }, () => mkUser(prisma, { points: 500 })))

  const results = await Promise.allSettled(buyers.map(b => cmartBuy(b.id, ctoon)))
  const won = buyers.filter((_, i) => results[i].status === 'fulfilled')
  const lost = buyers.filter((_, i) => results[i].status === 'rejected')

  assert.equal(won.length, LIMIT)
  assert.ok(results.filter(r => r.status === 'rejected').every(r => /sold out/i.test(r.reason.message)))
  const copies = await copiesOf(ctoon.id)
  assert.deepEqual(copies.map(c => c.mintNumber), [1, 2, 3])
  assert.deepEqual(new Set(copies.map(c => c.userId)), new Set(won.map(b => b.id)), 'each copy is owned by a buyer whose purchase succeeded')
  for (const b of won) assert.equal(await pointsOf(prisma, b.id), 400, 'winners are charged exactly once')
  for (const b of lost) assert.equal(await pointsOf(prisma, b.id), 500, 'losers are not charged')
  assert.equal((await prisma.ctoon.findUnique({ where: { id: ctoon.id } })).totalMinted, LIMIT)
})

run('one user cannot buy past a per-user limit', async () => {
  const buyer = await mkUser(prisma, { points: 1000 })
  const ctoon = await mkCtoon(prisma, { price: 100, quantity: 10, perUserLimit: 1 })
  await cmartBuy(buyer.id, ctoon)
  await rejects(cmartBuy(buyer.id, ctoon), /purchase limit/i)
  assert.equal(await pointsOf(prisma, buyer.id), 900)
  assert.equal((await copiesOf(ctoon.id)).length, 1)
})

run('a time-based cToon cannot be minted after its window closes (before the quantity is finalised)', async () => {
  const buyer = await mkUser(prisma, { points: 1000 })
  const ctoon = await mkCtoon(prisma, { price: 100, quantity: 999999999, mintLimitType: 'timeBased', mintEndDate: new Date(Date.now() - 60_000) })
  await rejects(cmartBuy(buyer.id, ctoon), /minting period has ended/i)
  assert.equal(await pointsOf(prisma, buyer.id), 1000)
  assert.equal((await copiesOf(ctoon.id)).length, 0)
})

run('an unknown cToon is refused', async () => {
  const buyer = await mkUser(prisma, { points: 1000 })
  await rejects(mint({ userId: buyer.id, ctoonId: '00000000-0000-0000-0000-000000000000', effectivePrice: 1 }), /not-for-sale|invalid/i)
  assert.equal(await pointsOf(prisma, buyer.id), 1000)
})

run("an active sale's price is what gets charged, whatever price the request claimed", async () => {
  const admin = await mkUser(prisma)
  const buyer = await mkUser(prisma, { points: 1000 })
  const ctoon = await mkCtoon(prisma, { price: 400, quantity: 10 })
  const sale = await prisma.sale.create({
    data: { name: 'Test sale', startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() + 3600_000), createdById: admin.id,
      items: { create: [{ ctoonId: ctoon.id, price: 60, perDayLimit: 2 }] } }
  })

  await cmartBuy(buyer.id, ctoon, { effectivePrice: 999, saleId: sale.id }) // a stale/forged price from the HTTP layer
  assert.equal(await pointsOf(prisma, buyer.id), 940)
  assert.equal((await copiesOf(ctoon.id))[0].pricePaid, 60)
  assert.equal((await prisma.cmartPurchaseLog.findFirst({ where: { userId: buyer.id } })).saleId, sale.id)
})

run("a sale's per-day limit holds even when the purchases arrive together", async () => {
  const admin = await mkUser(prisma)
  const buyer = await mkUser(prisma, { points: 1000 })
  const ctoon = await mkCtoon(prisma, { price: 400, quantity: 10 })
  await prisma.sale.create({
    data: { name: 'Limit sale', startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() + 3600_000), createdById: admin.id,
      items: { create: [{ ctoonId: ctoon.id, price: 50, perDayLimit: 2 }] } }
  })

  const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => cmartBuy(buyer.id, ctoon)))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2)
  assert.ok(results.filter(r => r.status === 'rejected').every(r => /daily limit/i.test(r.reason.message)))
  assert.equal((await copiesOf(ctoon.id)).length, 2)
  assert.equal(await pointsOf(prisma, buyer.id), 900, 'charged for the two that went through')
})

run('a special mint (pack, code, award) is free, bypasses the sale/limit rules, and is logged with its method', async () => {
  const user = await mkUser(prisma, { points: 0 })
  const ctoon = await mkCtoon(prisma, { price: 500, quantity: 5, perUserLimit: 1 })

  await mint({ userId: user.id, ctoonId: ctoon.id, isSpecial: true, method: 'CODE' })
  await mint({ userId: user.id, ctoonId: ctoon.id, isSpecial: true, method: 'CODE' }) // per-user limit is for purchases only

  assert.equal(await pointsOf(prisma, user.id), 0, 'never charged')
  const copies = await copiesOf(ctoon.id)
  assert.deepEqual(copies.map(c => [c.userId, c.mintNumber, c.pricePaid]), [[user.id, 1, null], [user.id, 2, null]])
  const owner = await prisma.ctoonOwnerLog.findMany({ where: { ctoonId: ctoon.id } })
  assert.ok(owner.every(o => o.method === 'CODE' && o.userId === user.id))
  assert.equal(await prisma.pointsLog.count({ where: { userId: user.id } }), 0)
  assert.equal(await prisma.cmartPurchaseLog.count({ where: { userId: user.id } }), 0, 'not counted as a cMart purchase')
})

run('a special mint still cannot exceed the cToon\'s total quantity', async () => {
  const user = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma, { quantity: 1, initialQuantity: 1 })
  await mint({ userId: user.id, ctoonId: ctoon.id, isSpecial: true, method: 'CODE' })
  await rejects(mint({ userId: user.id, ctoonId: ctoon.id, isSpecial: true, method: 'CODE' }), /sold out/i)
  assert.equal((await copiesOf(ctoon.id)).length, 1)
})

run('a pack mint records the pack it came from and logs the method as PACK', async () => {
  const user = await mkUser(prisma)
  const pack = await prisma.pack.create({ data: { name: 'P' } })
  const userPack = await prisma.userPack.create({ data: { userId: user.id, packId: pack.id } })
  const ctoon = await mkCtoon(prisma, { quantity: 5 })

  await mint({ userId: user.id, ctoonId: ctoon.id, isSpecial: true, userPackId: userPack.id })

  const [copy] = await copiesOf(ctoon.id)
  assert.equal(copy.userId, user.id)
  assert.equal(copy.userPackId, userPack.id)
  assert.equal((await prisma.ctoonOwnerLog.findFirst({ where: { userCtoonId: copy.id } })).method, 'PACK')
})
