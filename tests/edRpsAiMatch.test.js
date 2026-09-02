import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { COMBAT_POOL_GAME_NAMES } from '../server/utils/gamePoints.js'

// "Play the Eds" — the server-authoritative bot opponent for Ed, Edd n Eddy RPS
// (server/utils/edRpsAiMatch.js). These assertions exist because the design review that shaped
// this module flagged specific, concrete ways it could regress into a farming hole: reusing
// duelRuntime's room/join path, losing the single-shot resolve guard, or letting the cluster-cap
// clamp get bypassed. Each test below pins down one of those.

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:'"`\\])\/\/.*$/gm, '$1')

const MODULE = 'server/utils/edRpsAiMatch.js'

test('the AI match pays from the combat pool under the same gameName as PvP EdRps', () => {
  assert.ok(COMBAT_POOL_GAME_NAMES.includes('EdRps'))
  const src = code(MODULE)
  assert.ok(src.includes("gameName: 'EdRps'"), 'the AI award path names a different gameName than PvP EdRps')
  assert.ok(src.includes('poolGameNames: COMBAT_POOL_GAME_NAMES'), 'the AI award path is not scoped to the combat pool')
  // Distinct from PvP's 'Game - Ed, Edd n Eddy RPS' so the admin points ledger can tell the two
  // apart, since this repo fully controls this award path (unlike TKO's).
  assert.ok(src.includes("method: 'Game - Ed, Edd n Eddy RPS (AI)'"), 'the AI award method label is missing or was renamed')
})

// Finds every `socket.on(EV('name'), ... => {` header and returns its name plus the 200 chars
// of body immediately after it. Deliberately not matchAll(): a global regex's automatic
// non-overlapping cursor can let one handler's captured 200-char body swallow the NEXT handler's
// own header text (exactly what happened with the one-line 'subscribe' handler here), silently
// dropping it from the results. Scanning headers first and slicing independently avoids that.
function findHandlers(src) {
  const headerRe = /socket\.on\(EV\('([^']+)'\),\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g
  const out = []
  let m
  while ((m = headerRe.exec(src))) {
    out.push({ name: m[1], body: src.slice(headerRe.lastIndex, headerRe.lastIndex + 200) })
  }
  return out
}

test('an AI match never touches duelRuntime\'s shared room/join machinery', () => {
  // A "vsBot" flag bolted onto createRoom/joinRoom was reviewed and rejected: joinRoom has no
  // notion of an AI seat, so a second real socket could attach to what was supposed to be a bot
  // match and inherit whichever checks assume "no second device exists for an AI match" — turning
  // this feature into a same-device PvP-farming path with none of PvP's anti-collusion checks.
  const src = code(MODULE) // stripped of comments — the header prose explains this very rule
  for (const forbidden of ['joinRoom', 'createRoom', "from './duelRuntime", 'rooms.set', 'rooms.get']) {
    assert.ok(!src.includes(forbidden), `${MODULE} references "${forbidden}" — it must stay off duelRuntime's room/join path`)
  }
  // Every event this module handles is namespaced edrps:ai:*, never bare edrps:*, so it can never
  // collide with (or be dispatched to) a duelRuntime PvP handler on the same socket.
  const handlerNames = findHandlers(src).map(h => h.name)
  assert.ok(handlerNames.length >= 4, `expected the AI match handlers, found ${handlerNames.length}`)
  assert.ok(src.includes("const EV = (name) => `edrps:ai:${name}`"), 'the AI event namespace prefix changed or is gone')
})

test('round resolution is single-shot: the resolving flag is set before any await or the bot hand is drawn', () => {
  const src = code(MODULE)
  const resolveIdx = src.indexOf('r.resolving = true')
  assert.notEqual(resolveIdx, -1, 'the resolve guard is gone')
  const guardIdx = src.lastIndexOf('r.resolving || r.resolved', resolveIdx)
  assert.notEqual(guardIdx, -1, 'the resolve guard check is gone')
  const between = src.slice(guardIdx, resolveIdx)
  assert.ok(!between.includes('await'), 'an await was introduced between the resolve guard and resolving = true')
  // The bot's hand must be drawn strictly AFTER resolving is latched, or a throw racing a
  // timeout could read/leak an uncommitted bot hand.
  const botHandIdx = src.indexOf('const botHand = randomInt(3)')
  assert.ok(botHandIdx > resolveIdx, 'the bot hand is drawn before the resolve guard is set')
})

test('the bot never uses Math.random, and hands come from a CSPRNG', () => {
  const src = read(MODULE)
  assert.ok(!src.includes('Math.random'), 'the AI match uses Math.random somewhere')
  assert.ok(src.includes('randomInt(3)'), 'the bot hand is no longer drawn with crypto.randomInt')
})

test('a loss, forfeit, or bot win is never a "won but suppressed" case', () => {
  // Only a natural human win can end up with a non-null suppressReason. Anything else returns
  // immediately with suppressReason: null — there was no win to suppress, so there is nothing
  // for the client's SUPPRESS_COPY table to explain, and no path where a loss could accidentally
  // fall through into the award transaction.
  const src = code(MODULE)
  const guardIdx = src.indexOf('if (!humanWon) {')
  assert.notEqual(guardIdx, -1, 'the humanWon guard is gone')
  const claimIdx = src.indexOf('claim.count !== 1')
  assert.notEqual(claimIdx, -1, 'the award claim is gone')
  assert.ok(guardIdx < claimIdx, 'the humanWon guard no longer runs before the award transaction')
})

test('the award claim is a compare-and-set, same idempotency guard as PvP', () => {
  const src = read(MODULE)
  assert.ok(src.includes('pointsAwardedAt: null'), 'the award claim no longer compares-and-sets')
  assert.ok(src.includes('claim.count !== 1'), 'the award claim no longer checks it won the race')
})

test('the device-cluster cap is computed and applied before the award, not after', () => {
  const src = code(MODULE)
  const clusterIdx = src.indexOf('clusterPointsUsed(tx')
  const awardIdx = src.indexOf('awardCappedGamePoints(tx')
  assert.notEqual(clusterIdx, -1, 'the cluster-cap lookup is gone')
  assert.notEqual(awardIdx, -1, 'the award call is gone')
  assert.ok(clusterIdx < awardIdx, 'the cluster cap is no longer computed before the award')
  assert.ok(src.includes('effectivePointsPerWin'), 'the award no longer uses a cluster-clamped pointsPerWin')
})

test('every edrps:ai:* handler goes through auth() before touching match state', () => {
  const handlers = findHandlers(code(MODULE))
  assert.ok(handlers.length >= 4, `expected the AI match handlers, found ${handlers.length}`)
  for (const { name, body } of handlers) {
    assert.ok(body.includes('await auth()'), `handler "${name}" does not start with await auth()`)
  }
})

test('the schema allows a null second player for an AI match, matching ClashGame/MonsterBattle', () => {
  const schema = read('prisma/schema.prisma')
  const modelStart = schema.indexOf('model EdRpsMatch {')
  const modelEnd = schema.indexOf('\n}', modelStart)
  const model = schema.slice(modelStart, modelEnd)
  assert.ok(/player2UserId\s+String\?/.test(model), 'EdRpsMatch.player2UserId is no longer nullable')
  assert.ok(/player2IsAi\s+Boolean/.test(model), 'EdRpsMatch.player2IsAi is missing')
  assert.ok(/winnerIsAi\s+Boolean/.test(model), 'EdRpsMatch.winnerIsAi is missing')
  // No CHECK constraint: every other AI-opponent table in this schema (ClashGame, MonsterBattle)
  // holds this invariant at the single write path rather than the DB, and this module is that
  // path for EdRpsMatch.
  assert.ok(!/CHECK/i.test(model), 'EdRpsMatch grew a CHECK constraint out of step with the rest of the schema')
})

test('starting a match reserves the slot before the first await, closing the double-start race', () => {
  // Two concurrent edrps:ai:start events for the same user (a double-tap, two tabs, a script)
  // both resolve their `await auth()` before either had a chance to register a match, and every
  // check between the "already in a match" guard and the first await after it is synchronous —
  // so both could pass that guard and each build and independently pay out its own match, unless
  // something claims the slot in that same synchronous stretch.
  const src = code(MODULE)
  const guardIdx = src.indexOf('if (matches.has(user.id)) {')
  const reserveIdx = src.indexOf('matches.set(user.id, { reserving: true')
  const firstAwaitAfterGuard = src.indexOf('await loadConfig()')
  assert.notEqual(guardIdx, -1, 'the "already in a match" guard is gone')
  assert.notEqual(reserveIdx, -1, 'the synchronous reservation is gone')
  assert.notEqual(firstAwaitAfterGuard, -1, 'the config load this reservation must precede is gone')
  assert.ok(guardIdx < reserveIdx, 'the reservation no longer comes after the "already in a match" guard')
  assert.ok(reserveIdx < firstAwaitAfterGuard, 'the reservation no longer comes before the first await — the race is back')
  assert.ok(!src.slice(guardIdx, reserveIdx).includes('await'), 'an await was introduced between the guard and the reservation')
})

test('the AI match is wired into the socket server alongside PvP EdRps', () => {
  const src = read('server/socket-server.js')
  assert.ok(src.includes('registerEdRpsAi(io, socket, resolveSocketUser)'), 'registerEdRpsAi is not registered on connection')
  assert.ok(src.includes('startEdRpsAiSweep()'), 'startEdRpsAiSweep is never started')
})
