// Failed code redemptions are logged (server/utils/redeemAttemptLog.js) and listed in the admin
// Codes → "Failed Attempts" tab (server/api/admin/codes/failed-attempts.get.js). Pins: every
// failure reason is classified, the original error still reaches the player unchanged, a
// successful redeem writes no log row, the "before start" timing is reported, and only admins
// can read the list.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, startApi } from './helpers/dbKit.js'
import { classifyRedeemFailure } from '../server/utils/redeemAttemptLog.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, admin, player

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const redeem = (await import('../server/api/redeem.post.js')).default
  const failedAttempts = (await import('../server/api/admin/codes/failed-attempts.get.js')).default
  api = await startApi([
    { method: 'post', path: '/api/redeem', handler: redeem },
    { method: 'get', path: '/api/admin/codes/failed-attempts', handler: failedAttempts }
  ])
  admin = await mkUser(prisma); await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true } })
  player = await mkUser(prisma)
})
after(async () => { await api?.close(); if (!skipUnlessDb) await prisma.$disconnect() })

const rand = () => randomUUID().slice(0, 8)
const mkCode = (over = {}) => prisma.claimCode.create({
  data: { code: `T${rand()}`, maxClaims: 5, rewards: { create: [{ points: 10 }] }, ...over }
})
const redeem = (code, userId = player.id) => api.call('post', '/api/redeem', { userId, body: { code } })
const logsFor = (userId) => prisma.redeemAttemptLog.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })

test('classifyRedeemFailure maps every redeemClaimCode error message', () => {
  const c = (statusMessage) => classifyRedeemFailure({ statusMessage })
  assert.equal(c('Code is required'), 'MISSING')
  assert.equal(c('Invalid code'), 'INVALID')
  assert.equal(c('This code is not yet available'), 'NOT_STARTED')
  assert.equal(c('Code expired'), 'EXPIRED')
  assert.equal(c('You must own the following cToons to redeem this code: X'), 'PREREQ')
  assert.equal(c('You must own at least 2 of the following cToons to redeem this code (you own 0): X, Y'), 'PREREQ')
  assert.equal(c('Code fully redeemed'), 'FULL')
  assert.equal(c('Code already redeemed'), 'ALREADY_REDEEMED')
  assert.equal(c('Failed to mint cToon. Please try again.'), 'ERROR')
  assert.equal(classifyRedeemFailure(new Error('boom')), 'ERROR')
})

run('each failure is logged with its reason and the player still gets the original error', async () => {
  const user = await mkUser(prisma)
  const future = await mkCode({ startsAt: new Date(Date.now() + 90_000) })
  const expired = await mkCode({ expiresAt: new Date(Date.now() - 60_000) })
  const live = await mkCode()

  const r1 = await redeem(`NOPE${rand()}`, user.id)
  assert.equal(r1.status, 404)
  assert.equal(r1.body.statusMessage, 'Invalid code')
  assert.equal((await redeem(future.code, user.id)).status, 400)
  assert.equal((await redeem(expired.code, user.id)).status, 400)
  assert.equal((await redeem(live.code, user.id)).status, 200, 'a successful redeem is not a failure')
  assert.equal((await redeem(live.code, user.id)).status, 400)
  assert.equal((await redeem('', user.id)).status, 400)

  const logs = await logsFor(user.id)
  assert.deepEqual(logs.map(l => l.reason), ['INVALID', 'NOT_STARTED', 'EXPIRED', 'ALREADY_REDEEMED', 'MISSING'])
  assert.equal(logs[0].codeId, null, 'an invalid code links to nothing')
  assert.equal(logs[1].codeId, future.id)
  assert.equal(logs[3].codeId, live.id)
  assert.equal(logs[0].statusCode, 404)
  assert.equal(logs[1].message, 'This code is not yet available')
  // Node's fetch is not a browser: no Origin / Sec-Fetch-Site, which is exactly what the tab flags.
  assert.equal(logs[0].origin, null)
  assert.equal(logs[0].secFetchSite, null)
  assert.ok(logs[0].userAgent, 'user agent is recorded')
})

run('admin list: newest first, filters, before-start timing, IP is never returned raw', async () => {
  const user = await mkUser(prisma)
  const future = await mkCode({ startsAt: new Date(Date.now() + 120_000) })
  await redeem(`GUESS${rand()}`, user.id)
  await redeem(future.code, user.id)

  const all = await api.call('get', `/api/admin/codes/failed-attempts?q=${user.username}`, { userId: admin.id })
  assert.equal(all.status, 200, JSON.stringify(all.body))
  assert.equal(all.body.total, 2)
  const [newest, older] = all.body.items
  assert.equal(newest.reason, 'NOT_STARTED')
  assert.equal(newest.matchedCode, future.code)
  assert.ok(newest.secsBeforeStart > 100 && newest.secsBeforeStart <= 120, String(newest.secsBeforeStart))
  assert.equal(older.reason, 'INVALID')
  assert.equal(older.secsBeforeStart, null)
  assert.equal(newest.user.username, user.username)
  assert.ok(!('ip' in newest), 'raw/encrypted IP is not exposed')

  const onlyEarly = await api.call('get', `/api/admin/codes/failed-attempts?q=${user.username}&reason=NOT_STARTED`, { userId: admin.id })
  assert.equal(onlyEarly.body.total, 1)
  const byCode = await api.call('get', `/api/admin/codes/failed-attempts?q=${future.code}`, { userId: admin.id })
  assert.ok(byCode.body.items.some(i => i.user.id === user.id))
})

run('non-admins cannot read failed attempts', async () => {
  assert.equal((await api.call('get', '/api/admin/codes/failed-attempts', { userId: player.id })).status, 403)
  assert.equal((await api.call('get', '/api/admin/codes/failed-attempts')).status, 401)
})
