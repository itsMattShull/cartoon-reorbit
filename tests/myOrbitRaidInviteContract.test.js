// Source-text wiring checks for "Squad up in-room" (invite another MyOrbit player into my own
// raid) — same style as ogGtoonTournamentSocket.test.js's own contract test. No live server
// needed: this only catches the class of bug where an event name, import, or handler
// registration silently drifts out of sync between the two socket modules and the two client
// composables that all have to agree on it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('cmoonRaidSocket.js exports getActiveRaidForUser, and myOrbitSocket.js imports and uses it', () => {
  const raidSocket = read('server/utils/cmoonRaidSocket.js')
  assert.match(raidSocket, /export function getActiveRaidForUser\(/)
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /import \{ getActiveRaidForUser \} from '\.\/cmoonRaidSocket\.js'/)
  assert.match(myOrbit, /getActiveRaidForUser\(me\.id\)/)
})

test("myOrbitSocket.js registers myorbit:inviteToRaid and targets the invite at user:<id>, never broadcasting it room-wide", () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /socket\.on\(EV\('inviteToRaid'\)/)
  assert.match(myOrbit, /io\.local\.to\(`user:\$\{targetUserId\}`\)\.emit\('cmoonraid:invite'/)
})

test('useMyOrbitSocket.js exposes inviteToRaid, emitting the same event name the server listens for', () => {
  const composable = read('composables/useMyOrbitSocket.js')
  assert.match(composable, /function inviteToRaid\(targetUserId\)/)
  assert.match(composable, /socket\.emit\('myorbit:inviteToRaid'/)
  assert.match(composable, /inviteToRaid\b/) // exported in the returned object
})

test('useCMoonRaidSocket.js listens for cmoonraid:invite and exposes incomingInvite/dismissInvite', () => {
  const composable = read('composables/useCMoonRaidSocket.js')
  assert.match(composable, /socket\.on\('cmoonraid:invite'/)
  assert.match(composable, /incomingInvite/)
  assert.match(composable, /function dismissInvite\(\)/)
})

test('MyOrbitWindow.vue only shows the invite action while the viewer is in a FORMING raid, and renders the received-invite banner', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /canInviteToRaid/)
  assert.match(win, /raid\.status === 'FORMING'/)
  assert.match(win, /onInviteToRaid\(p\.userId\)/)
  assert.match(win, /raidSocket\.incomingInvite\.value/)
})

test("MyOrbitRoom schema has themeCMoonId (-> CMoon) and isRaidDen, and the room-definition loader selects both", () => {
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /model MyOrbitRoom \{[\s\S]*?themeCMoonId String\?[\s\S]*?\n\}/)
  assert.match(schema, /model MyOrbitRoom \{[\s\S]*?isRaidDen\s+Boolean\s+@default\(false\)[\s\S]*?\n\}/)
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /theme: \{ select: \{ id: true, name: true, color: true, avatarPath: true \} \}/)
  assert.match(myOrbit, /isRaidDen: room\.isRaidDen/)
})

test('GET /api/myorbit/active-raid reads the live Redis mirror (never Postgres) and filters to IN_PROGRESS', () => {
  const handler = read('server/api/myorbit/active-raid.get.js')
  assert.match(handler, /scanCMoonRaids/)
  assert.match(handler, /raid\.status !== 'IN_PROGRESS'/)
  assert.doesNotMatch(handler, /prisma\.cMoonEnemyRaid\.findFirst/)
})
