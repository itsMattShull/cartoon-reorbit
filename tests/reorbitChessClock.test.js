import test from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'

import { liveClocks, chargeClock } from '../lib/reorbitChess.js'

// The clock is the only part of this game where a bug is worth real points, so its arithmetic
// is tested directly.
//
// These import from lib/ rather than from the socket runtime deliberately: the runtime pulls
// in Prisma and Redis, and a test that reaches into it never drains the event loop. Keeping
// the arithmetic pure is what makes it testable at all.

const WHITE = 0
const BLACK = 1
const now = () => Date.now()

test('a move is charged the time it took and credited the increment', () => {
  const r = chargeClock({ clockMs: 300000, turnStartedAt: now() - 5000, incrementSeconds: 3 })
  assert.equal(r.flagged, false)
  // 300s - 5s + 3s = 298s, give or take the millisecond the test itself takes.
  assert.ok(Math.abs(r.ms - 298000) < 200, `expected ~298000, got ${r.ms}`)
})

test('a player who has run out is not credited an increment', () => {
  // The bug this guards: crediting the increment before testing for a flag hands a player who
  // has already lost on time a fresh three seconds, and the flag never fires at all.
  const r = chargeClock({ clockMs: 4000, turnStartedAt: now() - 9000, incrementSeconds: 3 })
  assert.equal(r.flagged, true)
  assert.equal(r.ms, 0)
})

test('flagging is decided on the exact remaining time, not a rounded one', () => {
  const justAlive = chargeClock({ clockMs: 5000, turnStartedAt: now() - 4900, incrementSeconds: 0 })
  assert.equal(justAlive.flagged, false)
  const justDead = chargeClock({ clockMs: 5000, turnStartedAt: now() - 5100, incrementSeconds: 0 })
  assert.equal(justDead.flagged, true)
})

test('a zero increment is honoured', () => {
  const r = chargeClock({ clockMs: 60000, turnStartedAt: now() - 1000, incrementSeconds: 0 })
  assert.ok(Math.abs(r.ms - 59000) < 200, `expected ~59000, got ${r.ms}`)
})

test('liveClocks counts down only the side to move', () => {
  const [w, b] = liveClocks({ clocks: [300000, 300000], turnIdx: WHITE, turnStartedAt: now() - 7000 })
  assert.ok(Math.abs(w - 293000) < 200, `white should be ticking, got ${w}`)
  assert.equal(b, 300000, 'black must be frozen while white thinks')

  const [w2, b2] = liveClocks({ clocks: [300000, 300000], turnIdx: BLACK, turnStartedAt: now() - 2000 })
  assert.equal(w2, 300000, 'white must be frozen while black thinks')
  assert.ok(Math.abs(b2 - 298000) < 200, `black should be ticking, got ${b2}`)
})

test('liveClocks never reports a negative clock', () => {
  const [w] = liveClocks({ clocks: [1000, 300000], turnIdx: WHITE, turnStartedAt: now() - 60000 })
  assert.equal(w, 0)
})

test('liveClocks does not mutate the clocks it is given', () => {
  // It is called from publicMatchView on every emit, and once per connected socket. A
  // mutating read would drain a player's clock faster the more tabs they have open.
  const clocks = [300000, 300000]
  const state = { clocks, turnIdx: WHITE, turnStartedAt: now() - 5000 }
  liveClocks(state); liveClocks(state); liveClocks(state)
  assert.deepEqual(clocks, [300000, 300000])
})

test('a disconnect buys no time: the clock is a function of wall time alone', () => {
  // Pausing a disconnected player's clock would make pulling the network cable a free
  // timeout, which is the oldest trick in online chess. Nothing here can express a pause.
  const started = now() - 30000
  const a = liveClocks({ clocks: [300000, 300000], turnIdx: WHITE, turnStartedAt: started })
  const b = liveClocks({ clocks: [300000, 300000], turnIdx: WHITE, turnStartedAt: started })
  assert.ok(Math.abs(a[0] - b[0]) < 50, 'the clock depends only on elapsed wall time')
  assert.ok(a[0] < 271000, 'thirty seconds of absence must be thirty seconds off the clock')
})

test('an illegal move leaves the position untouched, so it can never be charged', () => {
  // The exploit this pins: charge first, validate second, and every rejected move collects an
  // increment while turnStartedAt stays put — unlimited free time at the rate limiter's
  // ceiling. The runtime therefore applies the move first and only charges one that
  // succeeded, which is safe precisely because a rejected chess.js move is a no-op.
  const c = new Chess()
  const before = c.fen()
  let applied = null
  try { applied = c.move({ from: 'e2', to: 'e5' }) } catch { applied = null }
  assert.equal(applied, null, 'e2-e5 is not a legal opening move')
  assert.equal(c.fen(), before, 'a rejected move must leave the position untouched')
})

test('a flagged move can be taken back cleanly', () => {
  // A player who flags mid-move has the move undone: they cannot both have run out of time
  // and have moved.
  const c = new Chess()
  const before = c.fen()
  c.move('e4')
  const r = chargeClock({ clockMs: 500, turnStartedAt: now() - 4000, incrementSeconds: 3 })
  assert.equal(r.flagged, true)
  c.undo()
  assert.equal(c.fen(), before)
})

test('a full game of increments cannot mint time out of nothing', () => {
  // Sixty moves at a 3s increment, each genuinely taking 3s, must leave the clock roughly
  // where it started rather than drifting upward.
  let clockMs = 300000
  for (let i = 0; i < 60; i++) {
    const r = chargeClock({ clockMs, turnStartedAt: now() - 3000, incrementSeconds: 3 })
    assert.equal(r.flagged, false)
    clockMs = r.ms
  }
  assert.ok(Math.abs(clockMs - 300000) < 15000, `clock drifted to ${clockMs}`)
})
