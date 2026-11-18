// Source-text wiring checks for "sit on furniture" and the custom status line — same style as
// myOrbitRaidInviteContract.test.js. No live server needed: catches event-name/import drift
// between the server socket module, the client composable, and the schema.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('myOrbitPathfinding.js exports isAdjacent, and myOrbitSocket.js imports and uses it for sitting', () => {
  const pathfinding = read('server/utils/myOrbitPathfinding.js')
  assert.match(pathfinding, /export function isAdjacent\(/)
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /isAdjacent\b/)
  assert.match(myOrbit, /from '\.\/myOrbitPathfinding\.js'/)
})

test("myOrbitSocket.js registers myorbit:sit, requires adjacency (not standing ON the seat), and clears seated on move", () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /socket\.on\(EV\('sit'\)/)
  assert.match(myOrbit, /f\.sittable/)
  assert.match(myOrbit, /isAdjacent\(\{ x: participant\.x, y: participant\.y \}/)
  assert.match(myOrbit, /if \(participant\.seated\) \{\s*participant\.seated = false/)
})

test('useMyOrbitSocket.js exposes sitAt, emitting myorbit:sit', () => {
  const composable = read('composables/useMyOrbitSocket.js')
  assert.match(composable, /function sitAt\(x, y\)/)
  assert.match(composable, /socket\.emit\('myorbit:sit'/)
})

test('MyOrbitWindow.vue renders a seated CSS class and a click target only on sittable furniture', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /mow-avatar-seated/)
  assert.match(win, /furniturePieces\.filter\(f => f\.sittable && f\.blocksWalk\)/)
  assert.match(win, /sitAt\(f\.x, f\.y\)/)
})

test('MyOrbitFurniture schema has sittable, and the furniture validator/admin UI/projection all carry it', () => {
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /model MyOrbitFurniture \{[\s\S]*?sittable\s+Boolean\s+@default\(false\)[\s\S]*?\n\}/)
  const assetsValidator = read('server/utils/myOrbitAssets.js')
  assert.match(assetsValidator, /sittable/)
  const adminUi = read('components/newsite/AdminMyOrbitFurniture.vue')
  assert.match(adminUi, /v-model="form\.sittable"/)
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /sittable: f\.furniture\.sittable/)
})

test('User schema has myOrbitStatus, and myOrbitSocket.js registers myorbit:setStatus with moderation + banned-word checks', () => {
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /myOrbitStatus\s+String\?/)
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /socket\.on\(EV\('setStatus'\)/)
  assert.match(myOrbit, /parseMyOrbitStatus\(status\)/)
  assert.match(myOrbit, /containsBannedWord\(parsed\.status, bannedWords\)/)
  assert.match(myOrbit, /data: \{ myOrbitStatus: parsed\.status \|\| null \}/)
})

test('useMyOrbitSocket.js exposes setStatus, emitting myorbit:setStatus', () => {
  const composable = read('composables/useMyOrbitSocket.js')
  assert.match(composable, /function setStatus\(status\)/)
  assert.match(composable, /socket\.emit\('myorbit:setStatus'/)
})

test('myOrbitPresence.js is imported by myOrbitSocket.js (write side) and both REST endpoints (read side)', () => {
  const presence = read('server/utils/myOrbitPresence.js')
  assert.match(presence, /export async function setUserPresence\(/)
  assert.match(presence, /export async function clearUserPresence\(/)
  assert.match(presence, /export async function listOnlinePresence\(/)
  assert.match(presence, /export async function roomOccupancyCounts\(/)

  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /from '\.\/myOrbitPresence\.js'/)
  assert.match(myOrbit, /setUserPresence\(/)
  assert.match(myOrbit, /clearUserPresence\(/)

  const online = read('server/api/myorbit/online.get.js')
  assert.match(online, /listOnlinePresence/)
  const rooms = read('server/api/myorbit/rooms.get.js')
  assert.match(rooms, /roomOccupancyCounts/)
})
