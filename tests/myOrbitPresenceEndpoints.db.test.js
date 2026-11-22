// Real-Redis + real-Postgres coverage for the MyOrbit presence mirror (server/utils/
// myOrbitPresence.js) and the two REST endpoints built on it: GET /api/myorbit/online and the
// onlineCount it adds to GET /api/myorbit/rooms. Exercises the real Redis writes/reads rather
// than simulating a live socket connection, since presence here is intentionally just a small
// cross-process pointer (see that file's own header) — the socket-server-side write/delete call
// sites are covered by the source-text contract tests instead.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, setUserPresence, clearUserPresence, listOnlinePresence, roomOccupancyCounts

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ setUserPresence, clearUserPresence, listOnlinePresence, roomOccupancyCounts } = await import('../server/utils/myOrbitPresence.js'))
  const online = (await import('../server/api/myorbit/online.get.js')).default
  const rooms = (await import('../server/api/myorbit/rooms.get.js')).default
  api = await startApi([
    { method: 'get', path: '/api/myorbit/online', handler: online },
    { method: 'get', path: '/api/myorbit/rooms', handler: rooms }
  ])
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) await prisma.$disconnect()
})

const mkRoom = (over = {}) => prisma.myOrbitRoom.create({
  data: { name: `Room ${randomUUID().slice(0, 8)}`, active: true, ...over }
})

run('listOnlinePresence: empty when nobody has set presence', async () => {
  // Scoped assertion (filter to ids this test created) rather than asserting a globally empty
  // list, since other tests in this file/run may leave their own keys until TTL expiry.
  const marker = randomUUID()
  const list = await listOnlinePresence()
  assert.equal(list.some(p => p.roomId === marker), false)
})

run('setUserPresence -> listOnlinePresence round-trips roomId/username; clearUserPresence removes it', async () => {
  const userId = randomUUID()
  const roomId = randomUUID()
  await setUserPresence(userId, { roomId, username: 'Tester' })
  let list = await listOnlinePresence()
  const mine = list.find(p => p.userId === userId)
  assert.ok(mine, 'presence row should be listed')
  assert.equal(mine.roomId, roomId)
  assert.equal(mine.username, 'Tester')

  await clearUserPresence(userId)
  list = await listOnlinePresence()
  assert.equal(list.some(p => p.userId === userId), false)
})

run('roomOccupancyCounts: groups online users by room, ignores rooms with nobody', async () => {
  const roomA = randomUUID()
  const roomB = randomUUID()
  const u1 = randomUUID(), u2 = randomUUID(), u3 = randomUUID()
  await Promise.all([
    setUserPresence(u1, { roomId: roomA, username: 'A1' }),
    setUserPresence(u2, { roomId: roomA, username: 'A2' }),
    setUserPresence(u3, { roomId: roomB, username: 'B1' })
  ])
  try {
    const counts = await roomOccupancyCounts()
    assert.equal(counts.get(roomA), 2)
    assert.equal(counts.get(roomB), 1)
  } finally {
    await Promise.all([clearUserPresence(u1), clearUserPresence(u2), clearUserPresence(u3)])
  }
})

run('GET /api/myorbit/online lists every online user with their room, unfiltered by friendship', async () => {
  const viewer = await mkUser(prisma)
  const u1 = randomUUID()
  const roomId = randomUUID()
  await setUserPresence(u1, { roomId, username: 'Wanderer' })
  try {
    const res = await api.call('get', '/api/myorbit/online', { userId: viewer.id })
    assert.equal(res.status, 200)
    const mine = res.body.users.find(u => u.userId === u1)
    assert.deepEqual(mine, { userId: u1, username: 'Wanderer', roomId })
  } finally {
    await clearUserPresence(u1)
  }
})

run('GET /api/myorbit/online requires authentication', async () => {
  const res = await api.call('get', '/api/myorbit/online', {})
  assert.equal(res.status, 401)
})

run('GET /api/myorbit/rooms includes a live onlineCount from the presence mirror, 0 for an empty room', async () => {
  const roomWithPeople = await mkRoom()
  const emptyRoom = await mkRoom()
  const viewer = await mkUser(prisma)
  const u1 = randomUUID(), u2 = randomUUID()
  await Promise.all([
    setUserPresence(u1, { roomId: roomWithPeople.id, username: 'P1' }),
    setUserPresence(u2, { roomId: roomWithPeople.id, username: 'P2' })
  ])
  try {
    const res = await api.call('get', '/api/myorbit/rooms', { userId: viewer.id })
    assert.equal(res.status, 200)
    const byId = Object.fromEntries(res.body.rooms.map(r => [r.id, r]))
    assert.equal(byId[roomWithPeople.id].onlineCount, 2)
    assert.equal(byId[emptyRoom.id].onlineCount, 0)
  } finally {
    await Promise.all([clearUserPresence(u1), clearUserPresence(u2)])
  }
})
