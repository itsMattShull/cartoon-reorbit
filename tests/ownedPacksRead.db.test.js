// The two READ endpoints behind My Collection > Packs: the paginated list of my sealed packs (with derived lock
// flags) and the owner-scoped contents/odds preview. Real handlers over HTTP against a real Postgres.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkBarePack, mkUserPack, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const list = (await import('../server/api/collection/self/packs.get.js')).default
  const preview = (await import('../server/api/packs/[id]/preview.get.js')).default
  api = await startApi([
    { method: 'get', path: '/api/collection/self/packs', handler: list },
    { method: 'get', path: '/api/packs/:id/preview', handler: preview }
  ])
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma?.$disconnect() })

const inHours = (h) => new Date(Date.now() + h * 3600 * 1000)
const get = (path, userId) => api.call('get', path, { userId })

run('the list needs a login and shows only MY sealed packs, newest first', async () => {
  const [me, other] = [await mkUser(prisma), await mkUser(prisma)]
  assert.equal((await get('/api/collection/self/packs')).status, 401)
  const pack = await mkBarePack(prisma)
  const old = await mkUserPack(prisma, me.id, { packId: pack.id, createdAt: new Date(Date.now() - 5000) })
  const fresh = await mkUserPack(prisma, me.id, { packId: pack.id })
  await mkUserPack(prisma, me.id, { packId: pack.id, opened: true, openedAt: new Date() })
  await mkUserPack(prisma, other.id, { packId: pack.id })
  const res = await get('/api/collection/self/packs', me.id)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.items.map(i => i.id), [fresh.id, old.id])
  assert.equal(res.body.total, 2)
  assert.deepEqual(res.body.byPack.map(b => [b.packId, b.count]), [[pack.id, 2]])
  assert.equal(res.body.items[0].name, pack.name)
  assert.ok(!('userId' in res.body.items[0]), 'never leaks owner/price fields')
})

run('rows carry derived inAuction / inPendingTrade flags, and settled ones do not count', async () => {
  const [me, other] = [await mkUser(prisma), await mkUser(prisma)]
  const [a, t, closed, free] = await Promise.all([1, 2, 3, 4].map(() => mkUserPack(prisma, me.id)))
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: a.id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: me.id } })
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: closed.id, initialBet: 5, duration: 1, endAt: inHours(-1), creatorId: me.id, status: 'CLOSED' } })
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: me.id, recipientId: other.id, status: 'PENDING' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: t.id, role: 'OFFERED' } })
  const res = await get('/api/collection/self/packs', me.id)
  const by = Object.fromEntries(res.body.items.map(i => [i.id, i]))
  assert.deepEqual([by[a.id].inAuction, by[a.id].inPendingTrade], [true, false])
  assert.deepEqual([by[t.id].inAuction, by[t.id].inPendingTrade], [false, true])
  assert.deepEqual([by[closed.id].inAuction, by[closed.id].inPendingTrade], [false, false])
  assert.deepEqual([by[free.id].inAuction, by[free.id].inPendingTrade], [false, false])
})

run('pagination (24/page), type filter and summary mode', async () => {
  const me = await mkUser(prisma)
  const [pa, pb] = [await mkBarePack(prisma, { name: 'AAA pack' }), await mkBarePack(prisma, { name: 'BBB pack' })]
  for (let i = 0; i < 26; i++) await mkUserPack(prisma, me.id, { packId: pa.id })
  for (let i = 0; i < 3; i++) await mkUserPack(prisma, me.id, { packId: pb.id })
  const p1 = (await get('/api/collection/self/packs?page=1', me.id)).body
  const p2 = (await get('/api/collection/self/packs?page=2', me.id)).body
  assert.equal(p1.items.length, 24); assert.equal(p2.items.length, 5); assert.equal(p1.totalPages, 2); assert.equal(p1.total, 29)
  assert.equal(new Set([...p1.items, ...p2.items].map(i => i.id)).size, 29, 'no overlap between pages')
  const onlyB = (await get(`/api/collection/self/packs?packId=${pb.id}`, me.id)).body
  assert.equal(onlyB.items.length, 3); assert.equal(onlyB.totalPages, 1)
  const sum = (await get('/api/collection/self/packs?summary=1', me.id)).body
  assert.deepEqual(Object.keys(sum).sort(), ['byPack', 'total'])
  assert.deepEqual(sum.byPack.map(b => b.name), ['AAA pack', 'BBB pack'])
  assert.equal((await get('/api/collection/self/packs?page=999&packId=garbage', me.id)).status, 200)
})

run('preview: owner can see an UNLISTED pack; strangers get the same 404 as a nonexistent pack', async () => {
  const [me, stranger] = [await mkUser(prisma), await mkUser(prisma)]
  const visible = await mkCtoon(prisma, { name: 'Visible Toon' })
  const staged = await mkCtoon(prisma, { name: 'Staged Toon', releaseDate: inHours(48) })
  const pack = await prisma.pack.create({
    data: {
      name: 'Code only pack', inCmart: false,
      rarityConfigs: { create: [{ rarity: 'Common', count: 1, probabilityPercent: 100 }] },
      ctoonOptions: { create: [{ ctoonId: visible.id, weight: 5 }, { ctoonId: staged.id, weight: 5 }] }
    }
  })
  await mkUserPack(prisma, me.id, { packId: pack.id })
  const mine = await get(`/api/packs/${pack.id}/preview`, me.id)
  assert.equal(mine.status, 200, JSON.stringify(mine.body))
  assert.deepEqual(mine.body.ctoonOptions.map(o => o.name), ['Visible Toon'], 'unreleased cToons are never revealed')
  const theirs = await get(`/api/packs/${pack.id}/preview`, stranger.id)
  const ghost = await get('/api/packs/99999999-9999-4999-8999-999999999999/preview', stranger.id)
  assert.equal(theirs.status, 404); assert.equal(ghost.status, 404)
  assert.equal(theirs.body.statusMessage, ghost.body.statusMessage)
  assert.equal((await get(`/api/packs/${pack.id}/preview`)).status, 401)
  assert.equal((await get('/api/packs/nope/preview', me.id)).status, 400)
})

run('preview: a cMart-listed pack is public; an unlisted pack in an active auction becomes visible to everyone', async () => {
  const [seller, viewer] = [await mkUser(prisma), await mkUser(prisma)]
  const listed = await prisma.pack.create({ data: { name: 'Listed', inCmart: true } })
  assert.equal((await get(`/api/packs/${listed.id}/preview`, viewer.id)).status, 200)
  const unlisted = await mkBarePack(prisma)
  assert.equal((await get(`/api/packs/${unlisted.id}/preview`, viewer.id)).status, 404)
  const up = await mkUserPack(prisma, seller.id, { packId: unlisted.id })
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: up.id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: seller.id } })
  assert.equal((await get(`/api/packs/${unlisted.id}/preview`, viewer.id)).status, 200)
})
