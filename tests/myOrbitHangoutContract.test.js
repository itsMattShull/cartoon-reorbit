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
  assert.match(win, /sittableFurniturePieces = computed\(/)
  assert.match(win, /furniturePieces\.value\.filter\(f => f\.sittable && f\.blocksWalk\)/)
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

// ── Regression coverage for the full-PR adversarial review's confirmed findings ──────────────

test('myorbit:sit checks ban/mute status before acting, same as every sibling interactive handler', () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  const sitHandler = myOrbit.slice(myOrbit.indexOf("socket.on(EV('sit')"), myOrbit.indexOf("socket.on(EV('setStatus')"))
  assert.match(sitHandler, /loadModerationStatus\(me\.id\)/)
  assert.match(sitHandler, /myOrbitBannedAt/)
  assert.match(sitHandler, /myOrbitMutedUntil/)
})

test('myorbit:setStatus is rate-limited (lastStatusAt), with the check claimed before the moderation await', () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /STATUS_RATE_LIMIT_MS/)
  assert.match(myOrbit, /lastStatusAt/)
  const setStatusHandler = myOrbit.slice(myOrbit.indexOf("socket.on(EV('setStatus')"), myOrbit.indexOf("socket.on(EV('leave')"))
  const claimIdx = setStatusHandler.indexOf('participant.lastStatusAt = now')
  const awaitIdx = setStatusHandler.indexOf('await loadModerationStatus')
  assert.ok(claimIdx > -1 && awaitIdx > -1 && claimIdx < awaitIdx, 'rate-limit must be claimed before the moderation await, not after')
})

test('myorbit:chat and myorbit:emote claim their rate-limit timestamp before the moderation await, not after', () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  const chatHandler = myOrbit.slice(myOrbit.indexOf("socket.on(EV('chat')"), myOrbit.indexOf("socket.on(EV('emote')"))
  const chatClaim = chatHandler.indexOf('participant.lastMessageAt = now')
  const chatAwait = chatHandler.indexOf('await loadModerationStatus')
  assert.ok(chatClaim > -1 && chatAwait > -1 && chatClaim < chatAwait)

  const emoteHandler = myOrbit.slice(myOrbit.indexOf("socket.on(EV('emote')"), myOrbit.indexOf("// \"Squad up in-room\""))
  const emoteClaim = emoteHandler.indexOf('participant.lastEmoteAt = now')
  const emoteAwait = emoteHandler.indexOf('await loadModerationStatus')
  assert.ok(emoteClaim > -1 && emoteAwait > -1 && emoteClaim < emoteAwait)
})

test('all three invite/nudge handlers check mute status (not just ban), and emit an explicit error on a rate-limit hit instead of a silent drop', () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  for (const name of ['inviteToRaid', 'invitePvp', 'challengeOgGtoons']) {
    const start = myOrbit.indexOf(`socket.on(EV('${name}')`)
    assert.ok(start > -1, `${name} handler not found`)
    const end = myOrbit.indexOf('}))', start) + 3
    const handler = myOrbit.slice(start, end)
    assert.match(handler, /myOrbitMutedUntil/, `${name} should check mute status`)
    assert.match(handler, /INVITE_RATE_LIMIT_MS\) \{\s*\n\s*return socket\.emit\(EV\('error'\)/, `${name} should emit an error on rate-limit, not a silent return`)
  }
})

test('MyOrbitWindow.vue connects useCMoonPvpSocket lazily (on first canInvitePvp read), not unconditionally for every page visitor', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /let pvpSocket = null/)
  assert.doesNotMatch(win, /const pvpSocket = useCMoonPvpSocket\(\)/)
  assert.match(win, /if \(!pvpSocket\) pvpSocket = useCMoonPvpSocket\(\)/)
})

test('MyOrbitFurniture validator requires blocksWalk when sittable, so a created row is always reachable from the client', () => {
  const assets = read('server/utils/myOrbitAssets.js')
  assert.match(assets, /if \(sittable && !blocksWalk\)/)
})
