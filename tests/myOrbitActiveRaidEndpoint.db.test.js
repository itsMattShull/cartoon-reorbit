// Real-Redis coverage for GET /api/myorbit/active-raid (the "Raid Den" feature) — seeds the SAME
// Redis mirror server/utils/cmoonRaidSocket.js keeps current (via setCMoonRaid, the real
// serializer) rather than simulating an actual raid, since building a full live raid through
// socket handlers has no existing test precedent in this codebase to build on. This still
// exercises the real boundary this endpoint owns: reading real Redis, picking the right raid by
// status, and shaping the public summary (see that file's own comment on why Postgres can't
// serve this at all).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, setCMoonRaid, delCMoonRaid

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ setCMoonRaid, delCMoonRaid } = await import('../server/utils/cmoonRaidRedisState.js'))
  const activeRaid = (await import('../server/api/myorbit/active-raid.get.js')).default
  api = await startApi([{ method: 'get', path: '/api/myorbit/active-raid', handler: activeRaid }])
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) await prisma.$disconnect()
})

function fakeRaid(over = {}) {
  return {
    id: randomUUID(), status: 'IN_PROGRESS', enemyName: 'Test Boss', enemyImagePath: '/test/boss.png',
    enemyStats: { maxHp: 1000 }, enemyHpRemaining: 400, roundNumber: 3,
    roundLog: [{ round: 1, enemyDamageDealt: 50 }, { round: 2, enemyDamageDealt: 80 }, { round: 3, enemyDamageDealt: 120 }],
    participants: new Map([['u1', { userId: 'u1' }], ['u2', { userId: 'u2' }]]),
    startedAt: new Date(Date.now() - 60_000), combatStartedAt: new Date(Date.now() - 30_000),
    ...over
  }
}

run('returns null when no raid is IN_PROGRESS', async () => {
  const user = await mkUser(prisma)
  const res = await api.call('get', '/api/myorbit/active-raid', { userId: user.id })
  assert.equal(res.status, 200)
  assert.equal(res.body.raid, null)
})

run('shapes the live summary from the Redis mirror: hp/maxHp/round/last-round line', async () => {
  const user = await mkUser(prisma)
  const raid = fakeRaid()
  await setCMoonRaid(raid.id, raid)
  try {
    const res = await api.call('get', '/api/myorbit/active-raid', { userId: user.id })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.raid, {
      id: raid.id, enemyName: 'Test Boss', enemyImagePath: '/test/boss.png',
      maxHp: 1000, hpRemaining: 400, roundNumber: 3, participantCount: 2,
      lastRoundSummary: 'Round 3: the party dealt 120 damage!'
    })
  } finally {
    await delCMoonRaid(raid.id)
  }
})

run('ignores a FORMING or RESOLVED raid even if it is the only one in Redis', async () => {
  const user = await mkUser(prisma)
  const forming = fakeRaid({ status: 'FORMING' })
  await setCMoonRaid(forming.id, forming)
  try {
    const res = await api.call('get', '/api/myorbit/active-raid', { userId: user.id })
    assert.equal(res.body.raid, null)
  } finally {
    await delCMoonRaid(forming.id)
  }
})

run('picks the most recently started IN_PROGRESS raid when more than one is live', async () => {
  const user = await mkUser(prisma)
  const older = fakeRaid({ enemyName: 'Older Boss', combatStartedAt: new Date(Date.now() - 120_000) })
  const newer = fakeRaid({ enemyName: 'Newer Boss', combatStartedAt: new Date(Date.now() - 5_000) })
  await setCMoonRaid(older.id, older)
  await setCMoonRaid(newer.id, newer)
  try {
    const res = await api.call('get', '/api/myorbit/active-raid', { userId: user.id })
    assert.equal(res.body.raid.enemyName, 'Newer Boss')
  } finally {
    await delCMoonRaid(older.id)
    await delCMoonRaid(newer.id)
  }
})

run('active-raid requires authentication', async () => {
  const res = await api.call('get', '/api/myorbit/active-raid', {})
  assert.equal(res.status, 401)
})
