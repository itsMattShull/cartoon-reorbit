// Real-Postgres coverage for the Daily Streak admin endpoints: CRUD on DailyStreakReward
// (server/api/admin/daily-streak-rewards/*) and the repeat-indefinitely toggle
// (server/api/admin/daily-streak-settings.*). Mirrors the shape of the cMoon PvP reward
// endpoints these were modeled on.
//
// Every created DailyStreakReward row is deleted again before its test returns (via the DELETE
// endpoint itself, exercising it too): processDailyStreaks() resolves its reward cycle off
// MAX(day) across the WHOLE table with no per-test scoping, so a row left behind here would
// silently corrupt tests/dailyStreakProcessing.db.test.js's own cycle-math assertions on every
// later run of the shared test database - the same "clean up what a GLOBAL aggregate reads"
// discipline tests/myOrbitLeaderboardEndpoint.db.test.js's own header comment explains.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkCtoon, mkBarePack, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const rewardsGet = (await import('../server/api/admin/daily-streak-rewards/index.get.js')).default
  const rewardsPost = (await import('../server/api/admin/daily-streak-rewards/index.post.js')).default
  const rewardsDelete = (await import('../server/api/admin/daily-streak-rewards/[id].delete.js')).default
  const settingsGet = (await import('../server/api/admin/daily-streak-settings.get.js')).default
  const settingsPost = (await import('../server/api/admin/daily-streak-settings.post.js')).default
  api = await startApi([
    { method: 'get', path: '/api/admin/daily-streak-rewards', handler: rewardsGet },
    { method: 'post', path: '/api/admin/daily-streak-rewards', handler: rewardsPost },
    { method: 'delete', path: '/api/admin/daily-streak-rewards/:id', handler: rewardsDelete },
    { method: 'get', path: '/api/admin/daily-streak-settings', handler: settingsGet },
    { method: 'post', path: '/api/admin/daily-streak-settings', handler: settingsPost }
  ])
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) await prisma.$disconnect()
})

const mkAdmin = (p) => mkUser(p, { username: `admin_${Math.random().toString(36).slice(2, 8)}` }).then(u =>
  prisma.user.update({ where: { id: u.id }, data: { isAdmin: true } })
)

async function deleteReward(adminId, id) {
  await api.call('delete', `/api/admin/daily-streak-rewards/${id}`, { userId: adminId })
}

run('POST creates a POINTS reward row, listed by GET', async () => {
  const admin = await mkAdmin(prisma)
  const res = await api.call('post', '/api/admin/daily-streak-rewards', { userId: admin.id, body: { day: 5, rewardType: 'POINTS', amount: 250 } })
  assert.equal(res.status, 200)
  assert.ok(res.body.id)

  try {
    const list = await api.call('get', '/api/admin/daily-streak-rewards', { userId: admin.id })
    assert.equal(list.status, 200)
    const row = list.body.rewards.find(r => r.id === res.body.id)
    assert.ok(row)
    assert.equal(row.day, 5)
    assert.equal(row.rewardType, 'POINTS')
    assert.equal(row.amount, 250)
  } finally {
    await deleteReward(admin.id, res.body.id)
  }
})

run('POST creates a CTOON reward row referencing a real cToon, with its catalog data included', async () => {
  const admin = await mkAdmin(prisma)
  const ctoon = await mkCtoon(prisma, { name: 'Streak Prize Toon' })
  const res = await api.call('post', '/api/admin/daily-streak-rewards', { userId: admin.id, body: { day: 10, rewardType: 'CTOON', ctoonId: ctoon.id, amount: 2 } })
  assert.equal(res.status, 200)

  try {
    const list = await api.call('get', '/api/admin/daily-streak-rewards', { userId: admin.id })
    const row = list.body.rewards.find(r => r.id === res.body.id)
    assert.equal(row.ctoon?.name, 'Streak Prize Toon')
  } finally {
    await deleteReward(admin.id, res.body.id)
  }
})

run('POST creates a PACK reward row referencing a real pack', async () => {
  const admin = await mkAdmin(prisma)
  const pack = await mkBarePack(prisma, { name: 'Streak Prize Pack' })
  const res = await api.call('post', '/api/admin/daily-streak-rewards', { userId: admin.id, body: { day: 25, rewardType: 'PACK', packId: pack.id, amount: 1 } })
  assert.equal(res.status, 200)

  try {
    const list = await api.call('get', '/api/admin/daily-streak-rewards', { userId: admin.id })
    const row = list.body.rewards.find(r => r.id === res.body.id)
    assert.equal(row.pack?.name, 'Streak Prize Pack')
  } finally {
    await deleteReward(admin.id, res.body.id)
  }
})

run('POST rejects a CTOON reward referencing a nonexistent cToon', async () => {
  const admin = await mkAdmin(prisma)
  const res = await api.call('post', '/api/admin/daily-streak-rewards', { userId: admin.id, body: { day: 1, rewardType: 'CTOON', ctoonId: 'nope', amount: 1 } })
  assert.equal(res.status, 404)
})

run('POST allows multiple reward rows stacked on the same day', async () => {
  const admin = await mkAdmin(prisma)
  const day = 777
  const a = await api.call('post', '/api/admin/daily-streak-rewards', { userId: admin.id, body: { day, rewardType: 'POINTS', amount: 100 } })
  const b = await api.call('post', '/api/admin/daily-streak-rewards', { userId: admin.id, body: { day, rewardType: 'CMOON_POINTS', amount: 50 } })

  try {
    const list = await api.call('get', '/api/admin/daily-streak-rewards', { userId: admin.id })
    const rows = list.body.rewards.filter(r => r.day === day)
    assert.equal(rows.length, 2)
  } finally {
    await deleteReward(admin.id, a.body.id)
    await deleteReward(admin.id, b.body.id)
  }
})

run('POST requires admin', async () => {
  const notAdmin = await mkUser(prisma)
  const res = await api.call('post', '/api/admin/daily-streak-rewards', { userId: notAdmin.id, body: { day: 1, rewardType: 'POINTS', amount: 1 } })
  assert.equal(res.status, 403)
})

run('DELETE removes a reward row, and 404s for an unknown one', async () => {
  const admin = await mkAdmin(prisma)
  const created = await api.call('post', '/api/admin/daily-streak-rewards', { userId: admin.id, body: { day: 1, rewardType: 'POINTS', amount: 1 } })
  const del = await api.call('delete', `/api/admin/daily-streak-rewards/${created.body.id}`, { userId: admin.id })
  assert.equal(del.status, 200)

  const list = await api.call('get', '/api/admin/daily-streak-rewards', { userId: admin.id })
  assert.ok(!list.body.rewards.some(r => r.id === created.body.id))

  const del2 = await api.call('delete', `/api/admin/daily-streak-rewards/${created.body.id}`, { userId: admin.id })
  assert.equal(del2.status, 404)
})

run('settings GET/POST round-trip the repeat toggle', async () => {
  const admin = await mkAdmin(prisma)
  const initial = await api.call('get', '/api/admin/daily-streak-settings', { userId: admin.id })
  assert.equal(initial.status, 200)
  assert.equal(typeof initial.body.dailyStreakRepeatEnabled, 'boolean')

  const updated = await api.call('post', '/api/admin/daily-streak-settings', { userId: admin.id, body: { dailyStreakRepeatEnabled: true } })
  assert.equal(updated.status, 200)
  assert.equal(updated.body.dailyStreakRepeatEnabled, true)

  const reread = await api.call('get', '/api/admin/daily-streak-settings', { userId: admin.id })
  assert.equal(reread.body.dailyStreakRepeatEnabled, true)

  // Leave it as found for other tests in this run (processing tests assume default-off unless
  // they explicitly flip it themselves).
  await api.call('post', '/api/admin/daily-streak-settings', { userId: admin.id, body: { dailyStreakRepeatEnabled: false } })
})

run('settings POST requires admin', async () => {
  const notAdmin = await mkUser(prisma)
  const res = await api.call('post', '/api/admin/daily-streak-settings', { userId: notAdmin.id, body: { dailyStreakRepeatEnabled: true } })
  assert.equal(res.status, 403)
})
