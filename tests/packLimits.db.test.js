// cMart pack purchase limits (Pack.maxBuysPerUser / dailyPurchaseLimit) now that packs can be gifted, traded and
// auctioned. They must count PURCHASES by the ORIGINAL BUYER:
//   * a pack won from a code / PvP match does not use up a buy slot;
//   * trading a purchased pack away does not free one (otherwise: buy, trade away, buy again -> unlimited);
//   * parallel buy requests cannot all slip under the limit (the count used to run outside the transaction).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserPack, startApi, pointsOf } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const buy = (await import('../server/api/cmart/packs/buy.post.js')).default
  api = await startApi([{ method: 'post', path: '/api/cmart/packs/buy', handler: buy }])
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma.$disconnect() })

async function mkListedPack(over = {}) {
  const ct = await mkCtoon(prisma, { rarity: 'Common', quantity: 100000 })
  return prisma.pack.create({
    data: {
      name: 'Limit pack', inCmart: true, price: 100, priceDecays: false,
      rarityConfigs: { create: [{ rarity: 'Common', count: 1, probabilityPercent: 100 }] },
      ctoonOptions: { create: [{ ctoonId: ct.id, weight: 1 }] },
      ...over
    }
  })
}
const buy = (packId, userId) => api.call('post', '/api/cmart/packs/buy', { userId, body: { packId } })

run('a purchase is recorded as a PURCHASE by the buyer, with a history row', async () => {
  const pack = await mkListedPack()
  const user = await mkUser(prisma, { points: 1000 })
  const res = await buy(pack.id, user.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const up = await prisma.userPack.findUnique({ where: { id: res.body.userPackId } })
  assert.deepEqual([up.source, up.buyerId, up.userId, up.opened], ['PURCHASE', user.id, user.id, false])
  assert.equal(up.pricePaid, 100)
  assert.equal(await pointsOf(prisma, user.id), 900)
  assert.equal(await prisma.packOwnerLog.count({ where: { userPackId: up.id, method: 'PURCHASE', userId: user.id } }), 1)
})

run('packs received for free (code / PvP win) do NOT count against maxBuysPerUser', async () => {
  const pack = await mkListedPack({ maxBuysPerUser: 1 })
  const user = await mkUser(prisma, { points: 1000 })
  await mkUserPack(prisma, user.id, { packId: pack.id, source: 'CODE' })
  await mkUserPack(prisma, user.id, { packId: pack.id, source: 'OG_GTOONS_PVP' })
  assert.equal((await buy(pack.id, user.id)).status, 200, 'the one allowed purchase is still available')
  assert.equal((await buy(pack.id, user.id)).status, 429, 'and now the limit is reached')
})

run('trading a purchased pack away does NOT free a buy slot', async () => {
  const pack = await mkListedPack({ maxBuysPerUser: 1 })
  const [buyer, friend] = [await mkUser(prisma, { points: 1000 }), await mkUser(prisma)]
  const res = await buy(pack.id, buyer.id)
  assert.equal(res.status, 200)
  await prisma.userPack.update({ where: { id: res.body.userPackId }, data: { userId: friend.id } }) // what a trade does
  assert.equal((await buy(pack.id, buyer.id)).status, 429, 'cannot re-buy: the original buyer already used the slot')
})

run('a pack bought by someone else and received in a trade does not count against the new holder', async () => {
  const pack = await mkListedPack({ maxBuysPerUser: 1 })
  const [seller, holder] = [await mkUser(prisma, { points: 1000 }), await mkUser(prisma, { points: 1000 })]
  const res = await buy(pack.id, seller.id)
  await prisma.userPack.update({ where: { id: res.body.userPackId }, data: { userId: holder.id } })
  assert.equal((await buy(pack.id, holder.id)).status, 200)
})

run('daily limit counts purchases by the buyer in the window, not packs currently held', async () => {
  const pack = await mkListedPack({ dailyPurchaseLimit: 2 })
  const user = await mkUser(prisma, { points: 5000 })
  await mkUserPack(prisma, user.id, { packId: pack.id, source: 'CODE' }) // a gift today: no effect
  assert.equal((await buy(pack.id, user.id)).status, 200)
  assert.equal((await buy(pack.id, user.id)).status, 200)
  assert.equal((await buy(pack.id, user.id)).status, 429)
})

run('parallel buys cannot slip past the limit', async () => {
  for (const [limitField, limit] of [['maxBuysPerUser', 2], ['dailyPurchaseLimit', 2]]) {
    const pack = await mkListedPack({ [limitField]: limit })
    const user = await mkUser(prisma, { points: 100000 })
    const rs = await Promise.all(Array.from({ length: 8 }, () => buy(pack.id, user.id)))
    assert.equal(rs.filter(r => r.status === 200).length, limit, `${limitField}: ${JSON.stringify(rs.map(r => r.status))}`)
    assert.equal(await prisma.userPack.count({ where: { buyerId: user.id, packId: pack.id } }), limit)
    assert.equal(await pointsOf(prisma, user.id), 100000 - 100 * limit, 'only successful purchases were charged')
  }
})

run('parallel buys cannot spend the same points twice (affordability is re-checked under a row lock)', async () => {
  // 1000 points, 700-point packs, 6 parallel buys of DIFFERENT pack rows (so the per-(user,pack) advisory lock does not
  // serialise them): exactly one may succeed and the balance must never go negative.
  const packs = []
  for (let i = 0; i < 6; i++) packs.push(await mkListedPack({ price: 700 }))
  const user = await mkUser(prisma, { points: 1000 })
  const results = await Promise.all(packs.map(p => buy(p.id, user.id)))
  const ok = results.filter(r => r.status === 200).length
  assert.equal(ok, 1, JSON.stringify(results.map(r => r.status)))
  assert.equal(await pointsOf(prisma, user.id), 300)
  assert.equal(await prisma.userPack.count({ where: { userId: user.id } }), 1)
})
