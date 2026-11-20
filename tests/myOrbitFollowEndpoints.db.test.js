// Real-Postgres (+ real-Redis, for the online cross-reference) coverage for the MyOrbit follow
// feature: POST/DELETE /api/myorbit/follow/[userId] and GET /api/myorbit/following. See
// notifications.test.js for notifyFollowedUserOnline's own unit coverage (a fake db there, since
// that function's job is the SQL shape, not whether a real follow row exists) and
// myOrbitHangoutContract.test.js for the source-text wiring between myOrbitSocket.js's join
// handler and that notifier.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, setUserPresence, clearUserPresence

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ setUserPresence, clearUserPresence } = await import('../server/utils/myOrbitPresence.js'))
  const followPost = (await import('../server/api/myorbit/follow/[userId].post.js')).default
  const followDelete = (await import('../server/api/myorbit/follow/[userId].delete.js')).default
  const following = (await import('../server/api/myorbit/following.get.js')).default
  api = await startApi([
    { method: 'post', path: '/api/myorbit/follow/:userId', handler: followPost },
    { method: 'delete', path: '/api/myorbit/follow/:userId', handler: followDelete },
    { method: 'get', path: '/api/myorbit/following', handler: following }
  ])
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) await prisma.$disconnect()
})

run('POST follow creates a row, and is idempotent on a repeat follow', async () => {
  const me = await mkUser(prisma)
  const target = await mkUser(prisma)

  const res1 = await api.call('post', `/api/myorbit/follow/${target.id}`, { userId: me.id })
  assert.equal(res1.status, 200)
  assert.deepEqual(res1.body, { success: true, following: true, username: target.username })

  const row = await prisma.myOrbitFollow.findUnique({ where: { followerId_followedId: { followerId: me.id, followedId: target.id } } })
  assert.ok(row)

  const res2 = await api.call('post', `/api/myorbit/follow/${target.id}`, { userId: me.id })
  assert.equal(res2.status, 200)
  const count = await prisma.myOrbitFollow.count({ where: { followerId: me.id, followedId: target.id } })
  assert.equal(count, 1, 'a repeat follow must not create a second row')
})

run('POST follow rejects following yourself', async () => {
  const me = await mkUser(prisma)
  const res = await api.call('post', `/api/myorbit/follow/${me.id}`, { userId: me.id })
  assert.equal(res.status, 400)
})

run('POST follow 404s for a nonexistent user', async () => {
  const me = await mkUser(prisma)
  const res = await api.call('post', '/api/myorbit/follow/00000000-0000-0000-0000-000000000000', { userId: me.id })
  assert.equal(res.status, 404)
})

run('POST follow requires authentication', async () => {
  const target = await mkUser(prisma)
  const res = await api.call('post', `/api/myorbit/follow/${target.id}`, {})
  assert.equal(res.status, 401)
})

run('DELETE unfollow removes the row, and is idempotent when not following', async () => {
  const me = await mkUser(prisma)
  const target = await mkUser(prisma)
  await prisma.myOrbitFollow.create({ data: { followerId: me.id, followedId: target.id } })

  const res = await api.call('delete', `/api/myorbit/follow/${target.id}`, { userId: me.id })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { success: true, following: false })
  const row = await prisma.myOrbitFollow.findUnique({ where: { followerId_followedId: { followerId: me.id, followedId: target.id } } })
  assert.equal(row, null)

  // Unfollowing again (nothing to remove) must not 404/500.
  const res2 = await api.call('delete', `/api/myorbit/follow/${target.id}`, { userId: me.id })
  assert.equal(res2.status, 200)
})

run('GET following lists followed users, with online:true/roomId set only for those currently present', async () => {
  const me = await mkUser(prisma)
  const onlineFollowed = await mkUser(prisma)
  const offlineFollowed = await mkUser(prisma)
  await prisma.myOrbitFollow.createMany({
    data: [
      { followerId: me.id, followedId: onlineFollowed.id },
      { followerId: me.id, followedId: offlineFollowed.id }
    ]
  })
  await setUserPresence(onlineFollowed.id, { roomId: 'room-123', username: onlineFollowed.username })
  try {
    const res = await api.call('get', '/api/myorbit/following', { userId: me.id })
    assert.equal(res.status, 200)
    const byId = Object.fromEntries(res.body.users.map(u => [u.userId, u]))
    assert.deepEqual(byId[onlineFollowed.id], { userId: onlineFollowed.id, username: onlineFollowed.username, online: true, roomId: 'room-123' })
    assert.deepEqual(byId[offlineFollowed.id], { userId: offlineFollowed.id, username: offlineFollowed.username, online: false, roomId: null })
  } finally {
    await clearUserPresence(onlineFollowed.id)
  }
})

run('GET following is empty for someone following nobody, and requires authentication', async () => {
  const me = await mkUser(prisma)
  const res = await api.call('get', '/api/myorbit/following', { userId: me.id })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { users: [] })

  const res2 = await api.call('get', '/api/myorbit/following', {})
  assert.equal(res2.status, 401)
})
