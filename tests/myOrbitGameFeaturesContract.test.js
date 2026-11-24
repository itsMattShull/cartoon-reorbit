// Source-text wiring checks for the "things players can do together that reuse existing game
// features" batch: PvP invite, OG gToons nudge, trade link, cZone link, and the wishlist-match
// hint. Same style as the earlier myOrbitRaidInviteContract.test.js / myOrbitHangoutContract.
// test.js files — no live server needed, this only catches event-name/import drift between the
// modules and composables that all have to agree with each other.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('cmoonPvpSocket.js exports getActivePvpMatchForUser, and myOrbitSocket.js imports and uses it for its own, separately-delivered PvP invite', () => {
  const pvpSocket = read('server/utils/cmoonPvpSocket.js')
  assert.match(pvpSocket, /export function getActivePvpMatchForUser\(/)
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /import \{ getActivePvpMatchForUser \} from '\.\/cmoonPvpSocket\.js'/)
  assert.match(myOrbit, /getActivePvpMatchForUser\(me\.id\)/)
})

test("myOrbitSocket.js delivers the PvP invite and OG gToons nudge on ITS OWN myorbit:* events, not cmoonpvp:*/oggtoons:*, since those composables aren't guaranteed connected for the target", () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /socket\.on\(EV\('invitePvp'\)/)
  assert.match(myOrbit, /io\.local\.to\(`user:\$\{targetUserId\}`\)\.emit\('myorbit:pvpInvite'/)
  assert.match(myOrbit, /socket\.on\(EV\('challengeOgGtoons'\)/)
  assert.match(myOrbit, /io\.local\.to\(`user:\$\{targetUserId\}`\)\.emit\('myorbit:ogGtoonsNudge'/)
})

test('useMyOrbitSocket.js exposes inviteToPvp/challengeOgGtoons senders and incomingPvpInvite/incomingOgGtoonsNudge + dismiss functions', () => {
  const composable = read('composables/useMyOrbitSocket.js')
  assert.match(composable, /function inviteToPvp\(targetUserId\)/)
  assert.match(composable, /socket\.emit\('myorbit:invitePvp'/)
  assert.match(composable, /function challengeOgGtoons\(targetUserId\)/)
  assert.match(composable, /socket\.emit\('myorbit:challengeOgGtoons'/)
  assert.match(composable, /socket\.on\('myorbit:pvpInvite'/)
  assert.match(composable, /socket\.on\('myorbit:ogGtoonsNudge'/)
  assert.match(composable, /function dismissPvpInvite\(\)/)
  assert.match(composable, /function dismissOgGtoonsNudge\(\)/)
})

test('MyOrbitWindow.vue only enables the PvP invite action while the viewer is in a FORMING match, mirroring the raid gate', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /canInvitePvp/)
  assert.match(win, /match\.status === 'FORMING'/)
  assert.match(win, /onInvitePvp\(p\.userId\)/)
})

test('MyOrbitWindow.vue links Trade/Visit cZone to the EXISTING pages, never reimplementing them', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /path: '\/trade', query: \{ username \}/)
  assert.match(win, /\/czone\/\$\{encodeURIComponent\(username\)\}/)
})

test('MyOrbitWindow.vue deep-links the OG gToons nudge to the real matchmaking page', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /\/gtoons-classic/)
})

test('GET /api/myorbit/wishlist-match/[userId] reuses pendingTradeGuardWhere and isLockedCopy rather than reimplementing lock logic', () => {
  const handler = read('server/api/myorbit/wishlist-match/[userId].get.js')
  assert.match(handler, /pendingTradeGuardWhere/)
  assert.match(handler, /isLockedCopy/)
  assert.match(handler, /burnedAt: null/)
})

test('MyOrbitWindow.vue shows the wishlist-match badge and fetches it once per newly-seen participant, not on every move tick', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /wishlistMatchCounts/)
  assert.match(win, /\/api\/myorbit\/wishlist-match\/\$\{id\}/)
  assert.match(win, /if \(id === user\.value\?\.id \|\| id in wishlistMatchCounts\.value\) continue/)
})
