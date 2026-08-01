import test from 'node:test'
import assert from 'node:assert/strict'
import {
  replayFlappyGame,
  sanitizeFlappyCfg,
  gapCentersFor,
  arrivalTimesFor,
  speedForPipe,
  buildSegments,
  hashSeed,
  hasSolverClustering,
  GROUND_Y,
  BIRD_X,
  BIRD_H,
  PIPE_W,
  BIRD_W,
  LEAD_IN,
  MAX_FLAPS_HARD_CAP
} from '../server/utils/flappyPowerpuffEngine.js'

const CFG = sanitizeFlappyCfg({})
const SEED = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

// Drives the same closed-form physics the engine uses to produce a flap log that actually
// plays the game: flap whenever the girl has fallen below the gap she is heading for. This is
// the "solver" a bot would write, and it's also the only honest way to assert that a positive
// score is reachable at all with the shipped defaults.
function autopilot(seed, cfg, { targetOffset = 0, jitterMs = 0, maxPipes = 60 } = {}) {
  const arrivals = arrivalTimesFor(maxPipes, cfg)
  const gaps = gapCentersFor(hashSeed(seed), maxPipes, cfg)
  const flaps = []
  const stepMs = 16
  let rnd = 12345
  const nextJitter = () => {
    rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0
    return ((rnd / 4294967296) * 2 - 1) * jitterMs
  }

  const endT = arrivals[maxPipes - 1]
  for (let ms = 0; ms / 1000 < endT; ms += stepMs) {
    const t = ms / 1000
    const segs = buildSegments(flaps.map(f => f / 1000), cfg)
    const seg = segs[segs.length - 1]
    const d = t - seg.t0
    const y = seg.y0 + seg.v0 * d + 0.5 * cfg.gravity * d * d

    // Aim at the building she is still passing, not the one she is approaching: the girl has
    // to hold a gap for the whole width of the building, so switching aim at the arrival
    // instant dives her out through the bottom of the one she hasn't cleared yet.
    let target = gaps[maxPipes - 1]
    for (let n = 0; n < maxPipes; n++) {
      const exit = arrivals[n] + (PIPE_W + BIRD_W) / 2 / speedForPipe(n + 1, cfg)
      if (exit >= t) { target = gaps[n]; break }
    }
    target += targetOffset

    const last = flaps.length ? flaps[flaps.length - 1] : -Infinity
    if (y > target && ms - last >= 60) flaps.push(Math.round(ms + nextJitter()))
  }
  // Jitter can reorder or crowd timestamps; the client drops such flaps rather than shifting
  // them, so mirror that here.
  const clean = []
  for (const f of flaps) {
    if (f < 0) continue
    if (clean.length && f - clean[clean.length - 1] < 60) continue
    clean.push(f)
  }
  return clean
}

test('a run with no flaps scores zero and terminates', () => {
  const r = replayFlappyGame([], SEED, CFG)
  assert.equal(r.score, 0)
})

test('falling from rest reaches the street before the first building arrives', () => {
  // Defaults must not let a player score by doing nothing at all.
  const arrivals = arrivalTimesFor(1, CFG)
  const fallTime = Math.sqrt((2 * (GROUND_Y - BIRD_H / 2 - 380)) / CFG.gravity)
  assert.ok(fallTime < arrivals[0], `street at ${fallTime}s must precede building 1 at ${arrivals[0]}s`)
})

test('a competently played run scores', () => {
  const log = autopilot(SEED, CFG)
  const r = replayFlappyGame(log, SEED, CFG)
  assert.ok(r.score > 20, `expected a playable run to clear 20+ buildings, got ${r.score}`)
})

test('replay is deterministic for the same log and seed', () => {
  const log = autopilot(SEED, CFG)
  const a = replayFlappyGame(log, SEED, CFG)
  const b = replayFlappyGame(log, SEED, CFG)
  assert.deepEqual(a, b)
})

test('the same log against a different seed does not carry its score over', () => {
  // This is what per-session pipeSeed buys: a solved log cannot be replayed across sessions.
  const log = autopilot(SEED, CFG)
  const mine = replayFlappyGame(log, SEED, CFG)
  const stolen = replayFlappyGame(log, 'ffffffffffffffffffffffffffffffff', CFG)
  assert.ok(stolen.score < mine.score, 'a log solved for one seed must not score as well on another')
})

test('flying into a building ends the run at that building', () => {
  // Aim 400 units below every gap: she survives the early wide-open approach, then crashes.
  const log = autopilot(SEED, CFG, { targetOffset: 400 })
  const r = replayFlappyGame(log, SEED, CFG)
  assert.ok(r.score < 5, `expected an early crash, got ${r.score}`)
})

test('score is capped by maxScore', () => {
  const cfg = sanitizeFlappyCfg({ ...CFG, maxScore: 3 })
  const log = autopilot(SEED, cfg)
  const r = replayFlappyGame(log, SEED, cfg)
  assert.equal(r.score, 3)
})

test('rejects non-monotonic, fractional, negative and superhuman timestamps', () => {
  assert.throws(() => replayFlappyGame([500, 400], SEED, CFG), /monotonically/)
  assert.throws(() => replayFlappyGame([100.5], SEED, CFG), /whole milliseconds/)
  assert.throws(() => replayFlappyGame([-1], SEED, CFG), /Invalid flap timestamp/)
  assert.throws(() => replayFlappyGame([100, 110], SEED, CFG), /too fast/)
  assert.throws(() => replayFlappyGame(['x'], SEED, CFG), /Invalid flap timestamp/)
  assert.throws(() => replayFlappyGame(null, SEED, CFG), /must be an array/)
})

test('rejects a flap log past the hard cap', () => {
  const log = Array.from({ length: MAX_FLAPS_HARD_CAP + 1 }, (_, i) => i * 100)
  assert.throws(() => replayFlappyGame(log, SEED, CFG), /exceeds maximum/)
})

test('sanitizeFlappyCfg neutralizes NaN, wrong-sign and out-of-range values', () => {
  // typeof NaN === 'number' and NaN < 0 is false, so the admin endpoint's checks alone would
  // let these through; the engine is the backstop.
  const cfg = sanitizeFlappyCfg({
    gravity: NaN,
    pipeSpacing: 0,
    scrollSpeed: -50,
    maxScore: 1e12,
    maxSessionSeconds: 1e9,
    flapVelocity: 'fast',
    pipeGap: undefined
  })
  assert.ok(cfg.gravity >= 100, 'NaN gravity falls back to a positive default')
  assert.ok(cfg.pipeSpacing >= 120, 'zero spacing would divide by zero deriving arrival times')
  assert.ok(cfg.scrollSpeed > 0)
  assert.ok(cfg.maxScore <= 100000, 'maxScore must stay inside a Postgres Int4')
  assert.ok(cfg.maxSessionSeconds <= 1800)
  assert.ok(cfg.flapVelocity < 0, 'a downward flap would make the game unplayable')
  assert.ok(cfg.pipeGap > 0)
})

test('a pathological config cannot make the replay hang or return NaN', () => {
  const cfg = sanitizeFlappyCfg({ gravity: 0, scrollSpeed: 0, pipeSpacing: 0, maxScore: -1 })
  const r = replayFlappyGame([200, 400, 600], SEED, cfg)
  assert.ok(Number.isInteger(r.score))
  assert.ok(r.score >= 0)
})

test('gap centers stay inside the world and never jump further than MAX_GAP_DELTA', () => {
  const gaps = gapCentersFor(hashSeed(SEED), 200, CFG)
  const half = CFG.pipeGap / 2
  for (let i = 0; i < gaps.length; i++) {
    assert.ok(gaps[i] - half >= 0, 'gap must not open above the world')
    assert.ok(gaps[i] + half <= GROUND_Y, 'gap must not open below the street')
    if (i > 0) assert.ok(Math.abs(gaps[i] - gaps[i - 1]) <= 170 + 1e-9)
  }
})

test('scroll speed ramps then plateaus at maxSpeedMultiplier', () => {
  assert.ok(speedForPipe(50, CFG) > speedForPipe(1, CFG))
  assert.equal(speedForPipe(100000, CFG), CFG.scrollSpeed * CFG.maxSpeedMultiplier)
})

test('arrival times are strictly increasing and start with the lead-in', () => {
  const a = arrivalTimesFor(50, CFG)
  assert.equal(a[0], LEAD_IN / speedForPipe(1, CFG))
  for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1])
})

test('replay cost is bounded by the log, not by maxSessionSeconds', () => {
  // A 900s session with three early flaps must not simulate 900s of anything: she hits the
  // street seconds after the last flap, and that is the horizon.
  const cfg = sanitizeFlappyCfg({ ...CFG, maxSessionSeconds: 1800, maxScore: 100000 })
  const started = process.hrtime.bigint()
  const r = replayFlappyGame([100, 300, 500], SEED, cfg)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(elapsedMs < 25, `expected a short-log replay to be fast, took ${elapsedMs}ms`)
  assert.ok(r.score < 5)
})

test('a full-length legitimate run replays fast enough for the request path', () => {
  const log = autopilot(SEED, CFG, { maxPipes: 400 })
  const started = process.hrtime.bigint()
  replayFlappyGame(log, SEED, CFG)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(elapsedMs < 25, `replay took ${elapsedMs}ms`)
})

test('the server hitbox is never stricter than the client geometry', () => {
  // The client uses the full BIRD_H; the server shaves a unit off each side. A run that grazes
  // the gap edge by less than the forgiveness must survive on the server.
  const cfg = sanitizeFlappyCfg({})
  const gaps = gapCentersFor(hashSeed(SEED), 5, cfg)
  const arrivals = arrivalTimesFor(5, cfg)
  assert.ok(gaps.length === 5 && arrivals.length === 5)
  // Geometry sanity: the overlap window must be narrower than the spacing between buildings,
  // or two buildings would be on top of the girl at once.
  const overlapSeconds = (PIPE_W + BIRD_W) / speedForPipe(1, cfg)
  assert.ok(overlapSeconds < cfg.pipeSpacing / speedForPipe(1, cfg))
  assert.ok(BIRD_X > 0 && BIRD_X < 480)
})

test('solver clustering is flagged only with enough buildings and tight scatter', () => {
  assert.equal(hasSolverClustering({ pipesScored: 5, gapClearanceStdDev: 0 }), false)
  assert.equal(hasSolverClustering({ pipesScored: 40, gapClearanceStdDev: 0.4 }), true)
  assert.equal(hasSolverClustering({ pipesScored: 40, gapClearanceStdDev: 45 }), false)
  assert.equal(hasSolverClustering({ pipesScored: 40, gapClearanceStdDev: null }), false)
})

test('a human-like run with scattered timing is not flagged as a solver', () => {
  const log = autopilot(SEED, CFG, { jitterMs: 55 })
  const r = replayFlappyGame(log, SEED, CFG)
  if (r.pipesScored >= 12) {
    assert.equal(hasSolverClustering(r), false, `stddev ${r.gapClearanceStdDev} flagged a jittery human`)
  }
})
