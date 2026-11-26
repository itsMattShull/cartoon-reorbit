// Regression tests for the "ghost queue entry" bug: a player who was not queued was still paired into
// games with whoever searched next, sometimes several at once. See server/utils/ogGtoonsQueue.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createMatchQueue } from '../server/utils/ogGtoonsQueue.js'

const entry = (userId, extra = {}) => ({ userId, username: userId, joinedAt: 1000, socket: { connected: true }, ...extra })

test('a repeat join never creates a second entry for the same user', () => {
  const q = createMatchQueue()
  q.add(entry('u1', { stake: 0 }))
  q.add(entry('u1', { stake: 5 })) // double click / second tab / reconnect re-emit
  assert.equal(q.size, 1)
  assert.equal(q.get('u1').stake, 5, 'the newest join wins')
})

test('leaving removes the user completely — nothing is left behind to be paired later', () => {
  const q = createMatchQueue()
  q.add(entry('u1'))
  q.add(entry('u1'))
  assert.equal(q.remove('u1'), true)
  assert.equal(q.has('u1'), false)
  assert.equal(q.size, 0)
  assert.equal(q.remove('u1'), false, 'removing someone not queued is a harmless no-op')
  q.add(entry('u2'))
  assert.equal(q.takePair(), null, 'u2 must not find a leftover u1 to play')
})

test('pairs the two longest-waiting players and takes them off the queue', () => {
  const q = createMatchQueue()
  for (const id of ['a', 'b', 'c']) q.add(entry(id))
  const pair = q.takePair()
  assert.deepEqual(pair.map(e => e.userId), ['a', 'b'])
  assert.equal(q.has('a'), false)
  assert.equal(q.has('b'), false)
  assert.equal(q.has('c'), true)
  assert.equal(q.takePair(), null)
})

test('entries that are not usable are dropped, reported, and never paired', () => {
  const q = createMatchQueue()
  q.add(entry('dead', { socket: { connected: false } }))
  q.add(entry('busy'))
  q.add(entry('x'))
  q.add(entry('y'))
  const dropped = []
  const pair = q.takePair(e => e.socket.connected && e.userId !== 'busy', e => dropped.push(e.userId))
  assert.deepEqual(dropped.sort(), ['busy', 'dead'])
  assert.deepEqual(pair.map(e => e.userId), ['x', 'y'])
  assert.equal(q.size, 0)
})

test('one waiting player is not paired with themselves', () => {
  const q = createMatchQueue()
  q.add(entry('solo'))
  assert.equal(q.takePair(), null)
  assert.equal(q.has('solo'), true, 'they keep their place while they wait')
})

test('stale entries are swept out and returned', () => {
  const q = createMatchQueue()
  q.add(entry('old', { joinedAt: 100 }))
  q.add(entry('new', { joinedAt: 900 }))
  assert.deepEqual(q.removeOlderThan(500).map(e => e.userId), ['old'])
  assert.equal(q.has('old'), false)
  assert.equal(q.has('new'), true)
})

/* ── Source-level guarantees on the socket runtime (it can't be imported without Prisma/Redis) ── */

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const socket = strip(readFileSync(new URL('../server/utils/ogGtoonsSocket.js', import.meta.url), 'utf8'))

test('the socket runtime keeps no second, parallel record of who is queued', () => {
  assert.doesNotMatch(socket, /queueByUser\s*=\s*new Map/)
  assert.doesNotMatch(socket, /queue\.push\(/)
  assert.match(socket, /const queue = createMatchQueue\(\)/)
})

test('queueJoin looks again for a concurrent join / starting match right before adding', () => {
  const join = socket.slice(socket.indexOf("socket.on(EV('queueJoin')"), socket.indexOf("socket.on(EV('queueLeave')"))
  assert.equal((join.match(/if \(refuseIfBusy\(\)\) return/g) || []).length, 2, 'checked before AND after the awaits')
  const lastCheck = join.lastIndexOf('if (refuseIfBusy()) return')
  const add = join.indexOf('queue.add(')
  assert.ok(lastCheck !== -1 && add > lastCheck, 'the recheck comes before the add')
  assert.doesNotMatch(join.slice(lastCheck, add), /await /, 'no await between the recheck and the add')
})

test('startMatch reserves both players before its first await and always releases them', () => {
  const start = socket.slice(socket.indexOf('async function startMatch('), socket.indexOf('async function beginMatch('))
  assert.ok(start.indexOf('startingUsers.add') < start.indexOf('await '), 'reserved before any await')
  assert.match(start, /a\.userId === b\.userId/)
  assert.match(start, /finally \{[\s\S]*startingUsers\.delete\(a\.userId\)[\s\S]*startingUsers\.delete\(b\.userId\)/)
})

test('pairing never offers a dead-socket or already-playing entry, and tells players who fall out of the queue', () => {
  const pair = socket.slice(socket.indexOf('async function tryPairQueue('), socket.indexOf('/* ── Challenge helpers'))
  assert.match(pair, /queue\.takePair\(/)
  assert.match(pair, /connected/)
  assert.match(pair, /inMatchOrStarting\(e\.userId\)/)
  assert.match(pair, /EV\('queueLeft'\)/)
})
