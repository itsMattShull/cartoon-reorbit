// Saving the OG gToons PvP pack-reward settings through the real admin endpoint, and the stats panel's endpoint.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkBarePack, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, admin, nobody

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const post = (await import('../server/api/admin/game-config.post.js')).default
  const get = (await import('../server/api/admin/game-config.get.js')).default
  const stats = (await import('../server/api/admin/game-config/og-pack-reward-stats.get.js')).default
  api = await startApi([
    { method: 'post', path: '/api/admin/game-config', handler: post },
    { method: 'get', path: '/api/admin/game-config', handler: get },
    { method: 'get', path: '/api/admin/game-config/og-pack-reward-stats', handler: stats }
  ])
  admin = await mkUser(prisma); await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true } })
  nobody = await mkUser(prisma)
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) { await prisma.gameConfig.updateMany({ where: { gameName: 'OgGtoons' }, data: { ogGtoonsWinPackId: null, ogGtoonsWinPackPerUserLimit: null } }); await prisma.$disconnect() }
})

const save = (body, userId = admin.id) => api.call('post', '/api/admin/game-config', { userId, body: { gameName: 'OgGtoons', ...body } })
const saved = () => prisma.gameConfig.findUnique({ where: { gameName: 'OgGtoons' } })
const mkFull = async (name = 'Full Pack') => {
  const ct = await prisma.ctoon.create({ data: { name: `Admin Toon ${Math.random()}`, type: 'Character', rarity: 'Common', assetPath: '/t.png', price: 1, quantity: null } })
  return prisma.pack.create({ data: { name, inCmart: false, rarityConfigs: { create: [{ rarity: 'Common', count: 1, probabilityPercent: 100 }] }, ctoonOptions: { create: [{ ctoonId: ct.id, weight: 1 }] } } })
}

run('an admin can set the reward pack + limit, and clear it; non-admins cannot', async () => {
  const pack = await mkFull('Admin Reward Pack')
  assert.equal((await save({ ogGtoonsWinPackId: pack.id, ogGtoonsWinPackPerUserLimit: 3 }, nobody.id)).status, 403)
  const res = await save({ ogGtoonsWinPackId: pack.id, ogGtoonsWinPackPerUserLimit: 3 })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  const row = await saved()
  assert.deepEqual([row.ogGtoonsWinPackId, row.ogGtoonsWinPackPerUserLimit], [pack.id, 3])
  // GET returns the saved values (the form reads them from here)
  const got = await api.call('get', '/api/admin/game-config?gameName=OgGtoons', { userId: admin.id })
  assert.deepEqual([got.body.ogGtoonsWinPackId, got.body.ogGtoonsWinPackPerUserLimit], [pack.id, 3])
  // audit trail names the pack
  const log = await prisma.adminChangeLog.findFirst({ where: { area: 'GameConfig:OgGtoons', key: 'pvpWinPackReward' }, orderBy: { createdAt: 'desc' } })
  assert.match(log.newValue, /Admin Reward Pack/); assert.match(log.newValue, /× 3/)
  // clearing both turns it off
  assert.equal((await save({ ogGtoonsWinPackId: null, ogGtoonsWinPackPerUserLimit: null })).status, 200)
  const off = await saved(); assert.deepEqual([off.ogGtoonsWinPackId, off.ogGtoonsWinPackPerUserLimit], [null, null])
})

run('refused: half a setting, a bad limit, an unknown pack, and a pack nobody could open', async () => {
  const pack = await mkFull(); const empty = await mkBarePack(prisma)
  for (const [body, why] of [
    [{ ogGtoonsWinPackId: pack.id }, 'pack without limit'],
    [{ ogGtoonsWinPackPerUserLimit: 2 }, 'limit without pack'],
    [{ ogGtoonsWinPackId: pack.id, ogGtoonsWinPackPerUserLimit: 0 }, 'zero limit'],
    [{ ogGtoonsWinPackId: pack.id, ogGtoonsWinPackPerUserLimit: 101 }, 'limit over 100'],
    [{ ogGtoonsWinPackId: pack.id, ogGtoonsWinPackPerUserLimit: 1.5 }, 'fractional limit'],
    [{ ogGtoonsWinPackId: 'not-a-uuid', ogGtoonsWinPackPerUserLimit: 2 }, 'not a uuid'],
    [{ ogGtoonsWinPackId: '99999999-9999-4999-8999-999999999999', ogGtoonsWinPackPerUserLimit: 2 }, 'unknown pack'],
    [{ ogGtoonsWinPackId: empty.id, ogGtoonsWinPackPerUserLimit: 2 }, 'a pack with no contents']
  ]) {
    const r = await save(body)
    assert.equal(r.status, 400, `${why}: ${JSON.stringify(r.body)}`)
  }
  assert.equal(await prisma.packOwnerLog.count({ where: { packId: empty.id } }), 0)
})

run('a save that does not mention the reward (a stale tab) leaves it untouched', async () => {
  const pack = await mkFull('Keep Me')
  await save({ ogGtoonsWinPackId: pack.id, ogGtoonsWinPackPerUserLimit: 4 })
  assert.equal((await save({ ogGtoonsPracticeEnabled: true })).status, 200)
  const row = await saved(); assert.deepEqual([row.ogGtoonsWinPackId, row.ogGtoonsWinPackPerUserLimit], [pack.id, 4])
  // changing only the limit keeps the stored pack
  assert.equal((await save({ ogGtoonsWinPackPerUserLimit: 7 })).status, 200)
  const row2 = await saved(); assert.deepEqual([row2.ogGtoonsWinPackId, row2.ogGtoonsWinPackPerUserLimit], [pack.id, 7])
})

run('the stats endpoint reports awards and statuses, and is admin-only', async () => {
  assert.equal((await api.call('get', '/api/admin/game-config/og-pack-reward-stats', { userId: nobody.id })).status, 403)
  const res = await api.call('get', '/api/admin/game-config/og-pack-reward-stats', { userId: admin.id })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  for (const k of ['windowStart', 'awardedThisWindow', 'statusLast24h', 'statusLast7d', 'topWinners7d', 'repeatPairs7d', 'recent']) assert.ok(k in res.body, k)
  assert.ok(Array.isArray(res.body.topWinners7d) && Array.isArray(res.body.repeatPairs7d) && Array.isArray(res.body.recent))
})
