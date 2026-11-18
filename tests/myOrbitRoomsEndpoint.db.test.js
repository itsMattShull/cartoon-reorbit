// Real-Postgres coverage for GET /api/myorbit/rooms — specifically the "faction war rooms"
// addition (theme/isHomeTurf) and the isRaidDen passthrough, none of which the pure
// myOrbitRoom.test.js unit tests can see (they only cover parseMyOrbitRoomBody's validation,
// never a real room row joined against a real CMoon).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, startApi } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  const rooms = (await import('../server/api/myorbit/rooms.get.js')).default
  api = await startApi([{ method: 'get', path: '/api/myorbit/rooms', handler: rooms }])
})
after(async () => {
  await api?.close()
  if (!skipUnlessDb) await prisma.$disconnect()
})

const tag = () => randomUUID().slice(0, 8)
const mkCMoon = (over = {}) => prisma.cMoon.create({ data: { name: `Faction ${tag()}`, color: '#ff0000', ...over } })
const mkRoom = (over = {}) => prisma.myOrbitRoom.create({
  data: { name: `Room ${tag()}`, active: true, ...over }
})

run('rooms list carries theme (id/name/color/iconPath) for a themed room, null for a plain one', async () => {
  const faction = await mkCMoon({ color: '#3366cc', avatarPath: '/test/faction-icon.png' })
  const themed = await mkRoom({ themeCMoonId: faction.id })
  const plain = await mkRoom()
  const user = await mkUser(prisma)

  const res = await api.call('get', '/api/myorbit/rooms', { userId: user.id })
  assert.equal(res.status, 200)
  const byId = Object.fromEntries(res.body.rooms.map(r => [r.id, r]))
  assert.deepEqual(byId[themed.id].theme, { id: faction.id, name: faction.name, color: '#3366cc', iconPath: '/test/faction-icon.png' })
  assert.equal(byId[plain.id].theme, null)
})

run('isHomeTurf is true only for a viewer whose OWN current cMoon matches the room\'s theme', async () => {
  const factionA = await mkCMoon()
  const factionB = await mkCMoon()
  const room = await mkRoom({ themeCMoonId: factionA.id })

  const member = await mkUser(prisma)
  await prisma.user.update({ where: { id: member.id }, data: { cMoonId: factionA.id } })
  const outsider = await mkUser(prisma)
  await prisma.user.update({ where: { id: outsider.id }, data: { cMoonId: factionB.id } })
  const noFaction = await mkUser(prisma)

  const [resMember, resOutsider, resNoFaction] = await Promise.all([
    api.call('get', '/api/myorbit/rooms', { userId: member.id }),
    api.call('get', '/api/myorbit/rooms', { userId: outsider.id }),
    api.call('get', '/api/myorbit/rooms', { userId: noFaction.id })
  ])
  const pick = (res) => res.body.rooms.find(r => r.id === room.id)
  assert.equal(pick(resMember).isHomeTurf, true)
  assert.equal(pick(resOutsider).isHomeTurf, false)
  assert.equal(pick(resNoFaction).isHomeTurf, false)
})

run('isRaidDen passes through, and only active rooms are listed', async () => {
  const den = await mkRoom({ isRaidDen: true })
  const inactive = await mkRoom({ active: false })
  const user = await mkUser(prisma)

  const res = await api.call('get', '/api/myorbit/rooms', { userId: user.id })
  assert.equal(res.status, 200)
  const ids = res.body.rooms.map(r => r.id)
  assert.ok(ids.includes(den.id))
  assert.equal(res.body.rooms.find(r => r.id === den.id).isRaidDen, true)
  assert.ok(!ids.includes(inactive.id))
})

run('rooms list requires authentication', async () => {
  const res = await api.call('get', '/api/myorbit/rooms', {})
  assert.equal(res.status, 401)
})
