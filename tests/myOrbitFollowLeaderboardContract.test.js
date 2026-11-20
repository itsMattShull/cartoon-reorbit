// Source-text wiring checks for the "follow a player, get notified when they come online" and
// "leaderboard plaque" features — same style as myOrbitRaidInviteContract.test.js. No live
// server needed: catches event-name/import drift between the socket module, the REST endpoints,
// the client composable/component, and the schema.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

// ── Follow / notify-when-online ─────────────────────────────────────────────────────────────

test('schema has MyOrbitFollow, the User relations, and the FOLLOWED_USER_ONLINE notification type', () => {
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /model MyOrbitFollow \{[\s\S]*?@@unique\(\[followerId, followedId\]\)/)
  assert.match(schema, /myOrbitFollowing\s+MyOrbitFollow\[\]\s+@relation\("MyOrbitFollower"\)/)
  assert.match(schema, /myOrbitFollowedBy\s+MyOrbitFollow\[\]\s+@relation\("MyOrbitFollowed"\)/)
  assert.match(schema, /FOLLOWED_USER_ONLINE/)
})

test('notifications.js exports notifyFollowedUserOnline, keyed by username (not id) for the click route', () => {
  const notifications = read('server/utils/notifications.js')
  assert.match(notifications, /export async function notifyFollowedUserOnline/)
  assert.match(notifications, /myOrbitFollow\.findMany/)
  assert.match(notifications, /FOLLOWED_USER_ONLINE/)
})

test('myOrbitSocket.js fires notifyFollowedUserOnline only on a genuine offline->online transition, before any room-hop mutation', () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /from '\.\/notifications\.js'/)
  assert.match(myOrbit, /from '\.\/realtimeNotify\.js'/)
  assert.match(myOrbit, /const wasOnlineBefore = roomByUser\.has\(me\.id\)/)
  // The capture must come before the room-hop block mutates roomByUser, not after.
  const joinHandler = myOrbit.slice(myOrbit.indexOf("socket.on(EV('join')"), myOrbit.indexOf("socket.on(EV('getState')"))
  const captureIdx = joinHandler.indexOf('const wasOnlineBefore')
  const hopIdx = joinHandler.indexOf('Room-hopping')
  assert.ok(captureIdx > -1 && hopIdx > -1 && captureIdx < hopIdx, 'wasOnlineBefore must be captured before the room-hop block')
  assert.match(joinHandler, /if \(!wasOnlineBefore\) \{\s*\n\s*notifyFollowedUserOnline\(/)
  assert.match(joinHandler, /pushUserNotifications\(io, written\)/)
})

test('Onboarding.vue routes FOLLOWED_USER_ONLINE to the followed player\'s cZone by username, ahead of the generic Auction fallback', () => {
  const onboarding = read('components/Onboarding.vue')
  const routeFn = onboarding.slice(onboarding.indexOf('const notificationRoute = (n) =>'), onboarding.indexOf('const markRead ='))
  const followedIdx = routeFn.indexOf("n.type === 'FOLLOWED_USER_ONLINE'")
  // The real fallback return, not the earlier PVP_PACK_WON branch's own comment mentioning the
  // same path as an example of what it's avoiding.
  const fallbackIdx = routeFn.indexOf('return `/newsite/AuctionHouse/')
  assert.ok(followedIdx > -1 && fallbackIdx > -1 && followedIdx < fallbackIdx)
  assert.match(routeFn, /\/newsite\/czone\/\$\{encodeURIComponent\(n\.contextId\)\}/)
})

test('REST endpoints exist for follow/unfollow/following, and follow is idempotent (upsert, not create)', () => {
  const post = read('server/api/myorbit/follow/[userId].post.js')
  assert.match(post, /myOrbitFollow\.upsert/)
  assert.match(post, /You cannot follow yourself/)
  const del = read('server/api/myorbit/follow/[userId].delete.js')
  assert.match(del, /myOrbitFollow\.deleteMany/)
  const following = read('server/api/myorbit/following.get.js')
  assert.match(following, /myOrbitFollow\.findMany/)
  assert.match(following, /listOnlinePresence/)
})

test('MyOrbitWindow.vue renders a Following section and a follow toggle on both the online list and the avatar action menu', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /followingUsers = ref\(\[\]\)/)
  assert.match(win, /followedUserIds = computed\(/)
  assert.match(win, /async function onToggleFollow\(targetUserId\)/)
  assert.match(win, /\$fetch\(`\/api\/myorbit\/follow\/\$\{targetUserId\}`, \{ method: wasFollowing \? 'DELETE' : 'POST' \}\)/)
  assert.match(win, /<p class="mow-section-label">Following<\/p>/)
  assert.match(win, /onToggleFollow\(p\.userId\)/) // avatar action menu
  assert.match(win, /onToggleFollow\(u\.userId\)/) // online-list star
})

test('onToggleFollow guards against a double-click re-sending the same request, and closes the avatar action menu', () => {
  const win = read('components/MyOrbitWindow.vue')
  const fn = win.slice(win.indexOf('async function onToggleFollow'), win.indexOf('function roomNameById'))
  assert.match(fn, /pendingFollowToggles\.value\.has\(targetUserId\)\) return/)
  assert.match(fn, /pendingFollowToggles\.value\.add\(targetUserId\)/)
  assert.match(fn, /pendingFollowToggles\.value\.delete\(targetUserId\)/)
  assert.match(fn, /openActionMenuFor\.value = null/)
})

test("myorbit:join defers leaving the player's previous room until every failure-return check for the NEW room has already passed", () => {
  const myOrbit = read('server/utils/myOrbitSocket.js')
  const joinHandler = myOrbit.slice(myOrbit.indexOf("socket.on(EV('join')"), myOrbit.indexOf("socket.on(EV('getState')"))
  const hopIdx = joinHandler.lastIndexOf('removeParticipant(io, previousRoomId, me.id)')
  const roomNotFoundIdx = joinHandler.indexOf('This room is not available')
  const roomFullIdx = joinHandler.lastIndexOf('This room is full')
  const noCtoonIdx = joinHandler.indexOf('Pick a cToon from your own collection first')
  const noFloorIdx = joinHandler.indexOf('This room has no walkable floor yet')
  const commitIdx = joinHandler.indexOf('roomByUser.set(me.id, roomId)')
  for (const idx of [roomNotFoundIdx, roomFullIdx, noCtoonIdx, noFloorIdx]) {
    assert.ok(idx > -1 && idx < hopIdx, 'every failure return for the new room must come before the hop')
  }
  assert.ok(hopIdx > -1 && hopIdx < commitIdx, 'the hop must still happen before the new membership is committed')
})

// ── Leaderboard plaque ───────────────────────────────────────────────────────────────────────

test('schema has MyOrbitRoom.showLeaderboard', () => {
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /model MyOrbitRoom \{[\s\S]*?showLeaderboard\s+Boolean\s+@default\(false\)[\s\S]*?\n\}/)
})

test('parseMyOrbitRoomBody validates showLeaderboard as a boolean, same as isRaidDen', () => {
  const roomUtil = read('server/utils/myOrbitRoom.js')
  assert.match(roomUtil, /showLeaderboard = toBoolean\(body\?\.showLeaderboard/)
  assert.match(roomUtil, /showLeaderboard must be true or false/)
})

test('GET /api/myorbit/leaderboard queries Auction and CMoonEnemyBattle directly, cached, auth-gated', () => {
  const lb = read('server/api/myorbit/leaderboard.get.js')
  assert.match(lb, /Not authenticated/)
  assert.match(lb, /cachedJson\('myorbit:leaderboard'/)
  assert.match(lb, /db\.auction\.findFirst/)
  assert.match(lb, /db\.cMoonEnemyBattle\.groupBy/)
  // Never an unguarded auction.userCtoon.<field> read - see tests/auctionItemAccess.test.js.
  assert.doesNotMatch(lb, /\bsale\.userCtoon\.[A-Za-z]/)
})

test('rooms.get.js, the admin rooms endpoints, and myOrbitSocket.js all carry showLeaderboard through to the client', () => {
  const rooms = read('server/api/myorbit/rooms.get.js')
  assert.match(rooms, /showLeaderboard: true/)
  assert.match(rooms, /showLeaderboard: r\.showLeaderboard/)
  const adminList = read('server/api/admin/myorbit-rooms/index.get.js')
  assert.match(adminList, /showLeaderboard: r\.showLeaderboard/)
  const adminGet = read('server/api/admin/myorbit-rooms/[id].get.js')
  assert.match(adminGet, /showLeaderboard: room\.showLeaderboard/)
  const myOrbit = read('server/utils/myOrbitSocket.js')
  assert.match(myOrbit, /showLeaderboard: room\.showLeaderboard/)
  assert.match(myOrbit, /room\.showLeaderboard = definition\.showLeaderboard/)
})

test('AdminMyOrbitRoomBuilder.vue has a showLeaderboard checkbox wired into the form', () => {
  const admin = read('components/newsite/AdminMyOrbitRoomBuilder.vue')
  assert.match(admin, /v-model="form\.showLeaderboard"/)
  assert.match(admin, /showLeaderboard: false \}/)
})

test('MyOrbitWindow.vue polls the leaderboard endpoint only while in a showLeaderboard room, and renders the widget', () => {
  const win = read('components/MyOrbitWindow.vue')
  assert.match(win, /const shouldPoll = !!roomState\.value\?\.showLeaderboard/)
  assert.match(win, /\$fetch\('\/api\/myorbit\/leaderboard'\)/)
  assert.match(win, /roomState\?\.showLeaderboard/)
  assert.match(win, /mow-leaderboard/)
})
