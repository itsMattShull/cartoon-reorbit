// Admin claim-code endpoints with pack rewards. The headline regression: codes.put.js deletes a code's reward batches
// and re-creates them, but RewardPack has no ON DELETE CASCADE and the old delete list omitted it — so editing ANY code
// that awards a pack would have failed on the foreign key. Also pins validation and the audit diff.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, mkBarePack, mkUserPack, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, admin, nobody

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const post = (await import('../server/api/admin/codes.post.js')).default
  const put = (await import('../server/api/admin/codes.put.js')).default
  const get = (await import('../server/api/admin/codes.get.js')).default
  const claimed = (await import('../server/api/admin/codes/claimed.get.js')).default
  api = await startApi([
    { method: 'get', path: '/api/admin/codes/claimed', handler: claimed },
    { method: 'post', path: '/api/admin/codes', handler: post },
    { method: 'put', path: '/api/admin/codes', handler: put },
    { method: 'get', path: '/api/admin/codes', handler: get }
  ])
  admin = await mkUser(prisma); await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true } })
  nobody = await mkUser(prisma)
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma.$disconnect() })

const rand = () => randomUUID().slice(0, 8)
const body = (code, packs, extra = {}) => ({ code, maxClaims: 5, rewards: [{ points: 10, ctoons: [], packs, ...extra }] })
const create = (b, userId = admin.id) => api.call('post', '/api/admin/codes', { userId, body: b })
const edit = (b, userId = admin.id) => api.call('put', '/api/admin/codes', { userId, body: b })

run('create stores packs (merging duplicates in a batch); non-admins are refused', async () => {
  const p = await mkBarePack(prisma)
  const code = `A${rand()}`
  assert.equal((await create(body(code, [{ packId: p.id, quantity: 1 }]), nobody.id)).status, 403)
  const res = await create(body(code, [{ packId: p.id, quantity: 2 }, { packId: p.id, quantity: 1 }]))
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const rows = await prisma.rewardPack.findMany({ where: { reward: { code: { code } } } })
  assert.deepEqual(rows.map(r => [r.packId, r.quantity]), [[p.id, 3]])
})

run('REGRESSION: editing a code that already awards a pack works, and replaces the pack rewards', async () => {
  const [a, b] = [await mkBarePack(prisma), await mkBarePack(prisma)]
  const code = `E${rand()}`
  assert.equal((await create(body(code, [{ packId: a.id, quantity: 2 }]))).status, 200)
  const res = await edit(body(code, [{ packId: b.id, quantity: 4 }]))
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const rows = await prisma.rewardPack.findMany({ where: { reward: { code: { code } } } })
  assert.deepEqual(rows.map(r => [r.packId, r.quantity]), [[b.id, 4]])
  // and removing every pack is fine too
  assert.equal((await edit(body(code, []))).status, 200)
  assert.equal(await prisma.rewardPack.count({ where: { reward: { code: { code } } } }), 0)
})

run('the audit log records a pack change on edit', async () => {
  const [a, b] = [await mkBarePack(prisma), await mkBarePack(prisma)]
  const code = `L${rand()}`
  await create(body(code, [{ packId: a.id, quantity: 1 }]))
  await edit(body(code, [{ packId: b.id, quantity: 2 }]))
  const logs = await prisma.adminChangeLog.findMany({ where: { area: `ClaimCode:${code}`, key: 'rewards' } })
  assert.equal(logs.length, 1)
  assert.match(logs[0].newValue, new RegExp(b.id)); assert.match(logs[0].prevValue, new RegExp(a.id))
})

run('validation: bad ids, quantities out of range, unknown packs and over-large codes are all refused', async () => {
  const p = await mkBarePack(prisma)
  const c = () => `V${rand()}`
  assert.equal((await create(body(c(), [{ packId: 'nope', quantity: 1 }]))).status, 400)
  assert.equal((await create(body(c(), [{ packId: p.id, quantity: 0 }]))).status, 400)
  assert.equal((await create(body(c(), [{ packId: p.id, quantity: 1.5 }]))).status, 400)
  assert.equal((await create(body(c(), [{ packId: p.id, quantity: 26 }]))).status, 400)
  assert.equal((await create(body(c(), [{ packId: p.id, quantity: 20 }, { packId: p.id, quantity: 20 }]))).status, 400, 'merged total over 25')
  assert.equal((await create(body(c(), [{ packId: randomUUID(), quantity: 1 }]))).status, 400, 'unknown pack')
  assert.equal((await create(body(c(), 'x'))).status, 400)
  const many = await Promise.all(Array.from({ length: 3 }, () => mkBarePack(prisma)))
  const over = many.map(m => ({ packId: m.id, quantity: 25 })) // 75 > 50 total
  assert.equal((await create(body(c(), over))).status, 400, 'more than 50 packs in total')
  // across batches too
  const across = { code: c(), maxClaims: 1, rewards: [{ points: 0, ctoons: [], packs: [{ packId: p.id, quantity: 20 }] }, { points: 0, ctoons: [], packs: [{ packId: p.id, quantity: 10 }] }] }
  assert.equal((await create(across)).status, 400, 'same pack across batches exceeds 25')
})

run('the code list returns each pack reward and can be searched by pack name', async () => {
  const p = await mkBarePack(prisma, { name: `Zzq${rand()} Pack` })
  const code = `S${rand()}`
  await create(body(code, [{ packId: p.id, quantity: 2 }]))
  const res = await api.call('get', `/api/admin/codes?code=${code}`, { userId: admin.id })
  assert.equal(res.status, 200)
  assert.equal(res.body.items[0].rewards[0].packs[0].pack.name, p.name)
  const search = await api.call('get', `/api/admin/codes?q=${encodeURIComponent(p.name.slice(0, 6))}`, { userId: admin.id })
  assert.ok(search.body.items.some(i => i.code === code))
})

run('the claimed view reports what each claim ACTUALLY granted, not what the code awards today', async () => {
  const p = await mkBarePack(prisma)
  const code = `C${rand()}`
  await create(body(code, [{ packId: p.id, quantity: 5 }]))
  const codeRow = await prisma.claimCode.findUnique({ where: { code } })
  const user = await mkUser(prisma)
  const claim = await prisma.claim.create({ data: { userId: user.id, codeId: codeRow.id } })
  // this claimant received 2 (an earlier definition of the code); the code now says 5
  for (let i = 0; i < 2; i++) await mkUserPack(prisma, user.id, { packId: p.id, source: 'CODE', sourceRef: claim.id, sourceOrdinal: i })
  const res = await api.call('get', `/api/admin/codes/claimed?q=${code}`, { userId: admin.id })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.items.find(i => i.id === claim.id).packsGranted, 2)
})
