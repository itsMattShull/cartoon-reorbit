import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Guards the socket server's identity rule, which no runtime test can catch: a handler that
// takes a userId from its event payload is trusting an anonymous caller's claim about who they
// are. Anyone can open a socket and emit anything.
//
// These handlers used to do exactly that. Because startPvpMatch debits both players' staked
// points and handleClashLeave settles the pot, an unauthenticated caller could create a room
// as one player, join it as another, ready both up with decks it enumerated over the same
// hole, then leave — moving points between two accounts it did not own. pvp:match:rejoin
// additionally returned the named player's private hand.
//
// The fix is uniform: resolve the caller from their session cookie and ignore the payload. It
// is also easy to undo by accident, since adding `userId` back to a destructure looks harmless
// and every client still sends one.

const here = dirname(fileURLToPath(import.meta.url))
const SERVER = readFileSync(join(here, '..', 'server', 'socket-server.js'), 'utf8')

// Every handler that acts for a user or returns something belonging to one.
const AUTHENTICATED_HANDLERS = [
  'createClashRoom',
  'joinClashRoom',
  'listClashDecks',
  'readyUpWithDeck',
  'leaveClashRoom',
  'pvp:rejoin',
  'pve:rejoin',
  'pvp:match:rejoin',
  'joinPvE',
  'battle:create',
  'battle:join'
]

/**
 * Returns the source of one `socket.on('name', ...)` handler.
 *
 * Brace matching starts at the body's `=> {`, not at the marker: several of these handlers
 * destructure their payload, and that `{ roomId, deck }` would otherwise open and close the
 * first brace pair and truncate the handler to its own parameter list.
 */
function handlerSource(name) {
  const marker = `socket.on('${name}'`
  const start = SERVER.indexOf(marker)
  assert.notEqual(start, -1, `handler ${name} not found — was it renamed?`)
  const bodyStart = SERVER.indexOf('=> {', start)
  assert.notEqual(bodyStart, -1, `handler ${name} has no arrow body`)

  let depth = 0
  for (let i = bodyStart + 3; i < SERVER.length; i++) {
    const ch = SERVER[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return SERVER.slice(start, i + 1)
    }
  }
  throw new Error(`could not brace-match handler ${name}`)
}

test('no authenticated handler destructures a user id from its payload', () => {
  // Matches a user-id-ish key in the handler's own parameter destructure, e.g.
  // `async ({ roomId, userId, deck })` or `({ player1UserId, ... })`.
  const paramList = /socket\.on\(\s*'[^']+'\s*,\s*(?:async\s*)?\(\s*\{([^}]*)\}/
  for (const name of AUTHENTICATED_HANDLERS) {
    const src = handlerSource(name)
    const params = paramList.exec(src)?.[1] ?? ''
    const offenders = params
      .split(',')
      .map(s => s.trim().split(':')[0].trim())
      .filter(k => /^(userId|player\dUserId|uid)$/i.test(k))
    assert.deepEqual(
      offenders, [],
      `${name} destructures ${offenders.join(', ')} from its payload — resolve the caller with ` +
      'requireSocketUser(socket) instead; a payload id is an unauthenticated claim'
    )
  }
})

test('every authenticated handler resolves the caller from the session', () => {
  for (const name of AUTHENTICATED_HANDLERS) {
    const src = handlerSource(name)
    assert.ok(
      src.includes('requireSocketUser(socket'),
      `${name} never calls requireSocketUser — it cannot know who is calling`
    )
  }
})

test('socket.data.userId is only ever assigned from an authenticated id', () => {
  // The disconnect cleanup and the in-match card handlers read this field, so poisoning it
  // forges every later event on the connection. The only legal right-hand sides are the
  // authenticated `uid`/`me.id` locals.
  const assignments = [...SERVER.matchAll(/socket\.data\.userId\s*=\s*([^\n;]+)/g)]
    .map(m => m[1].trim())
  assert.ok(assignments.length > 0, 'expected socket.data.userId assignments to exist')
  for (const rhs of assignments) {
    assert.match(
      rhs, /^(uid|me\.id|sid\(me\.id\)|null)$/,
      `socket.data.userId assigned from "${rhs}" — must come from the authenticated user`
    )
  }
})

test('clash room ids are constrained before use as a room name', () => {
  const src = handlerSource('createClashRoom')
  // Room ids arrive from the client. Unconstrained, they double as socket.io room names, so a
  // crafted one joins the caller to another feature's broadcast channel ('spin-the-wheel',
  // 'marbles-race', `auction_<id>`, a cZone name), and an id that already exists silently
  // replaced the waiting player's lobby entry.
  assert.match(src, /\/\^\\d\{\d+,\d+\}\$\//, 'createClashRoom does not validate the room id shape')
  assert.ok(
    src.includes('pvpRooms.has(roomId)'),
    'createClashRoom does not reject an id that is already in use'
  )
})

test('the socket server does not allow every origin with credentials', () => {
  // '*' plus credentials is rejected by browsers outright, so this would also break the
  // clients that now authenticate over the handshake.
  assert.ok(
    !/cors:\s*\{\s*origin:\s*'\*'/.test(SERVER),
    "socket.io is configured with cors.origin '*'"
  )
  assert.ok(SERVER.includes('credentials: true'), 'socket.io CORS does not allow credentials')
})

// ── Discord chat relay ────────────────────────────────────────────────────
// Chat handlers go through resolveChatMember() rather than requireSocketUser
// directly, since resolveSocketUser caches {id, username, banned} for the
// connection's life and knows nothing about inGuild/active/chatMutedUntil.
const CHAT_HANDLERS = ['chat:join', 'chat:send']

test('chat handlers do not take a user id from the payload', () => {
  const paramList = /socket\.on\(\s*'[^']+'\s*,\s*(?:async\s*)?\(\s*\{([^}]*)\}/
  for (const name of CHAT_HANDLERS) {
    const src = handlerSource(name)
    const params = paramList.exec(src)?.[1] ?? ''
    const offenders = params
      .split(',')
      .map(s => s.trim().split(':')[0].trim())
      .filter(k => /^(userId|username|uid|user)$/i.test(k))
    assert.deepEqual(
      offenders, [],
      `${name} destructures ${offenders.join(', ')} from its payload — the relay posts into a ` +
      'real Discord community under that name, so identity must come from the session cookie'
    )
  }
})

test('chat handlers resolve the caller through resolveChatMember', () => {
  for (const name of CHAT_HANDLERS) {
    const src = handlerSource(name)
    assert.ok(
      src.includes('resolveChatMember(socket'),
      `${name} never calls resolveChatMember — it cannot know who is calling`
    )
  }
})

test('resolveChatMember authenticates and re-reads the gating fields', () => {
  const start = SERVER.indexOf('async function resolveChatMember')
  assert.notEqual(start, -1, 'resolveChatMember not found — was it renamed?')
  const src = SERVER.slice(start, start + 2500)

  assert.ok(src.includes('requireSocketUser(socket'), 'resolveChatMember does not authenticate')
  assert.ok(src.includes('db.user.findUnique'), 'resolveChatMember does not re-read the user row')
  for (const field of ['banned', 'active', 'inGuild', 'chatMutedUntil']) {
    assert.ok(src.includes(field), `resolveChatMember does not check ${field}`)
  }
})

test('sending into Discord verifies guild membership live, not from the cached flag', () => {
  // User.inGuild is only refreshed by the hourly guild-sync cron (a bug in
  // refreshDiscordTokenAndRoles's call sites means the live re-check never
  // runs), so it can't be the gate for writing into someone else's community.
  const start = SERVER.indexOf('async function resolveChatMember')
  const src = SERVER.slice(start, start + 2500)
  assert.ok(
    src.includes('verifyGuildMembership'),
    'the send path does not verify guild membership against Discord'
  )
})

test('the unauthenticated cZone chat-message relay is gone', () => {
  // It took the room name and display name from the client — any anonymous
  // socket could broadcast into any room as any user.
  assert.ok(
    !/socket\.on\(\s*'chat-message'/.test(SERVER),
    "the unauthenticated 'chat-message' handler is back — it must not be reintroduced"
  )
  assert.ok(
    !/socket\.on\(\s*'join-zone'/.test(SERVER),
    "the unauthenticated 'join-zone' handler is back — it let a client pick any room name"
  )
})
