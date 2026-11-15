import test from 'node:test'
import assert from 'node:assert/strict'
import { createReplay, clockOffsetMs, deadlineNote } from '../utils/ogGtoonReplay.js'

const rev = (seq) => ({ seq, round: seq, steps: [] })

test('missed reveals play in seq order, one at a time, each only after the previous is acknowledged', () => {
  const r = createReplay({ queue: [rev(3), rev(1), rev(2)] })
  assert.equal(r.current().seq, 1)
  assert.equal(r.ack(2), r.current(), 'an ack for a reveal that is not playing is ignored (a stale animation cannot skip ahead)')
  assert.equal(r.current().seq, 1)
  assert.equal(r.ack(1).seq, 2)
  assert.equal(r.ack(2).seq, 3)
  assert.equal(r.ack(3), null)
  assert.equal(r.isDone(), true)
  assert.equal(r.watchedSeq(), 3)
})

test('a live reveal that arrives mid-replay joins the end of the queue; duplicates and old ones are ignored', () => {
  const r = createReplay({ queue: [rev(1), rev(2)] })
  assert.equal(r.append(rev(3)), true)
  assert.equal(r.append(rev(3)), false, 'a duplicate')
  assert.equal(r.append(rev(2)), false, 'already queued')
  assert.equal(r.append(rev(4)), true)
  assert.equal(r.current().seq, 1, 'the one playing is not interrupted')
  r.ack(1); r.ack(2); r.ack(3)
  assert.equal(r.current().seq, 4)
})

test('skipping drops what is left and records everything as watched', () => {
  const r = createReplay({ queue: [rev(1), rev(2), rev(3)] })
  r.ack(1)
  r.skip()
  assert.equal(r.isDone(), true)
  assert.equal(r.current(), null)
  assert.equal(r.watchedSeq(), 3)
})

test('the most recent view wins at the end', () => {
  const r = createReplay({ queue: [rev(1)], finalView: { v: 'open' } })
  r.setFinalView({ v: 'later' })
  r.setFinalView(null)
  assert.deepEqual(r.finalView(), { v: 'later' })
})

test('progress is clamped and an empty queue is simply done', () => {
  const e = createReplay({})
  assert.equal(e.isDone(), true)
  assert.deepEqual(e.progress(), { index: 0, total: 0 })
  const r = createReplay({ queue: [rev(1), rev(2)] })
  assert.deepEqual(r.progress(), { index: 0, total: 2 })
  r.ack(1)
  assert.deepEqual(r.progress(), { index: 1, total: 2 })
  r.ack(2)
  assert.deepEqual(r.progress(), { index: 1, total: 2 })
})

test('the clock offset corrects for a skewed device clock', () => {
  assert.equal(clockOffsetMs(new Date(10_000), 4_000), 6_000)
  assert.equal(clockOffsetMs(null, 4_000), 0)
  assert.equal(clockOffsetMs('garbage', 4_000), 0)
})

test('the deadline line says whose move it is and what not moving costs', () => {
  const now = Date.parse('2026-11-15T12:00:00Z')
  const deadline = { dueAt: new Date(now + 5 * 3600 * 1000).toISOString(), extensions: 0 }
  const mine = deadlineNote({ waitingOn: 'you', deadline, now })
  assert.match(mine.text, /Your move\. If you haven't played by .* you lose the match\./)
  assert.equal(mine.tone, 'info')
  const theirs = deadlineNote({ waitingOn: 'opponent', deadline, now, opponentName: 'Sam' })
  assert.match(theirs.text, /You've moved\. Sam has until .* or you win the match\./)
  const soon = deadlineNote({ waitingOn: 'you', deadline: { dueAt: new Date(now + 20 * 60000).toISOString() }, now })
  assert.equal(soon.tone, 'urgent')
  assert.match(soon.text, /in 20 min/)
  const lastMinute = deadlineNote({ waitingOn: 'you', deadline: { dueAt: new Date(now + 30000).toISOString() }, now })
  assert.match(lastMinute.text, /one more minute/)
  const extended = deadlineNote({ waitingOn: 'opponent', deadline: { ...deadline, extensions: 2 }, now })
  assert.match(extended.text, /Extended 2 times/)
  assert.equal(deadlineNote({ waitingOn: 'you', deadline, now, over: true }), null)
  assert.match(deadlineNote({ waitingOn: null, deadline, now }).text, /decided at/)
})
