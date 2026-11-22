// Real-Postgres coverage for GET /api/myorbit/wishlist-match/[userId] — the "they have something
// on your wishlist" hint shown on a nearby MyOrbit avatar. Exercises the real lock/pending-trade
// exclusion logic (pendingTradeGuardWhere, isLockedCopy) this endpoint reuses rather than
// reimplements, same as server/api/collection/[username].get.js already does.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkUserCtoon, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const handler = (await import('../server/api/myorbit/wishlist-match/[userId].get.js')).default
  api = await startApi([{ method: 'get', path: '/api/myorbit/wishlist-match/:userId', handler }])
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) await prisma.$disconnect()
})

run('counts a tradable copy the other player owns of something on my wishlist', async () => {
  const me = await mkUser(prisma)
  const other = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma)
  await prisma.wishlistItem.create({ data: { userId: me.id, ctoonId: ctoon.id } })
  await mkUserCtoon(prisma, other.id, ctoon.id)

  const res = await api.call('get', `/api/myorbit/wishlist-match/${other.id}`, { userId: me.id })
  assert.equal(res.status, 200)
  assert.equal(res.body.count, 1)
})

run('0 when the other player owns nothing on my wishlist', async () => {
  const me = await mkUser(prisma)
  const other = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma)
  await prisma.wishlistItem.create({ data: { userId: me.id, ctoonId: ctoon.id } })

  const res = await api.call('get', `/api/myorbit/wishlist-match/${other.id}`, { userId: me.id })
  assert.equal(res.body.count, 0)
})

run('0 when I have nothing on my own wishlist (short-circuits before touching the other player\'s collection)', async () => {
  const me = await mkUser(prisma)
  const other = await mkUser(prisma)
  const res = await api.call('get', `/api/myorbit/wishlist-match/${other.id}`, { userId: me.id })
  assert.equal(res.body.count, 0)
})

run('excludes a burned copy, a non-tradeable copy, a locked copy, and a copy in a pending trade', async () => {
  const me = await mkUser(prisma)
  const other = await mkUser(prisma)
  const [burned, nonTradeable, locked, pending, tradable] = await Promise.all(
    Array.from({ length: 5 }, () => mkCtoon(prisma))
  )
  await prisma.wishlistItem.createMany({
    data: [burned, nonTradeable, locked, pending, tradable].map(c => ({ userId: me.id, ctoonId: c.id }))
  })

  await mkUserCtoon(prisma, other.id, burned.id, { burnedAt: new Date() })
  await mkUserCtoon(prisma, other.id, nonTradeable.id, { isTradeable: false })
  await mkUserCtoon(prisma, other.id, locked.id, { lockedByUserId: other.id })
  const pendingCopy = await mkUserCtoon(prisma, other.id, pending.id)
  await mkUserCtoon(prisma, other.id, tradable.id)

  const tradeOffer = await prisma.tradeOffer.create({
    data: { initiatorId: other.id, recipientId: me.id, status: 'PENDING' }
  })
  await prisma.tradeOfferCtoon.create({
    data: { tradeOfferId: tradeOffer.id, userCtoonId: pendingCopy.id, role: 'OFFERED' }
  })

  const res = await api.call('get', `/api/myorbit/wishlist-match/${other.id}`, { userId: me.id })
  assert.equal(res.status, 200)
  assert.equal(res.body.count, 1) // only `tradable` survives every exclusion
})

run('dedupes multiple mint copies of the same wishlisted cToon into one count', async () => {
  const me = await mkUser(prisma)
  const other = await mkUser(prisma)
  const ctoon = await mkCtoon(prisma)
  await prisma.wishlistItem.create({ data: { userId: me.id, ctoonId: ctoon.id } })
  await mkUserCtoon(prisma, other.id, ctoon.id)
  await mkUserCtoon(prisma, other.id, ctoon.id)

  const res = await api.call('get', `/api/myorbit/wishlist-match/${other.id}`, { userId: me.id })
  assert.equal(res.body.count, 1)
})

run('0 and no query at all for the degenerate "myself" case', async () => {
  const me = await mkUser(prisma)
  const res = await api.call('get', `/api/myorbit/wishlist-match/${me.id}`, { userId: me.id })
  assert.equal(res.status, 200)
  assert.equal(res.body.count, 0)
})

run('requires authentication', async () => {
  const other = await mkUser(prisma)
  const res = await api.call('get', `/api/myorbit/wishlist-match/${other.id}`, {})
  assert.equal(res.status, 401)
})
