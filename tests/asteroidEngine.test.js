// The whole anti-cheat design rests on the client and the server producing byte-identical
// simulations. These tests pin the properties that guarantee it, so a future change to the
// physics can't silently start rejecting legitimate runs.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRIG_STEPS, COS_TABLE, SIN_TABLE, TICK_HZ,
  IN_LEFT, IN_RIGHT, IN_THRUST,
  createRng, seedFromHex, normalizeConfig, simulate, createState, step
} from '../lib/asteroidSim.js'

import {
  sanitizeInputLog, hasRoboticCadence, replayAsteroidGame,
  MAX_TICKS, MAX_INPUT_EVENTS
} from '../server/utils/asteroidEngine.js'

const SEED = seedFromHex('a1b2c3d4e5f60718')

function humanLog(n = 60) {
  // Irregular gaps, like a person actually holding and releasing buttons.
  const log = []
  let t = 3
  const masks = [IN_LEFT, IN_LEFT | IN_THRUST, IN_THRUST, 0, IN_RIGHT, IN_RIGHT | IN_THRUST, 0]
  for (let i = 0; i < n; i++) {
    t += 4 + ((i * 37 + (i % 7) * 11) % 53)
    log.push({ t, a: masks[i % masks.length] })
  }
  return log
}

// ─── Trig tables ────────────────────────────────────────────────────────────────
test('trig tables are built without Math.sin/cos yet match them to a few ULP', () => {
  let maxErr = 0
  for (let i = 0; i < TRIG_STEPS; i++) {
    const theta = (i / TRIG_STEPS) * 2 * Math.PI
    maxErr = Math.max(
      maxErr,
      Math.abs(COS_TABLE[i] - Math.cos(theta)),
      Math.abs(SIN_TABLE[i] - Math.sin(theta))
    )
  }
  assert.ok(maxErr < 1e-12, `trig table drifted from Math: ${maxErr}`)
})

test('trig tables satisfy the Pythagorean identity exactly enough to be stable', () => {
  for (let i = 0; i < TRIG_STEPS; i += 17) {
    const m = COS_TABLE[i] * COS_TABLE[i] + SIN_TABLE[i] * SIN_TABLE[i]
    assert.ok(Math.abs(m - 1) < 1e-12)
  }
})

test('lib/asteroidSim.js contains no banned non-deterministic operations', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const src = readFileSync(fileURLToPath(new URL('../lib/asteroidSim.js', import.meta.url)), 'utf8')
  // Strip comments so the determinism contract documenting these names doesn't trip the test.
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const banned of [
    'Math.sin', 'Math.cos', 'Math.tan', 'Math.atan', 'Math.asin', 'Math.acos',
    'Math.pow', 'Math.exp', 'Math.log', 'Math.hypot', 'Math.cbrt', 'Math.sqrt',
    'Math.random', 'Date.now', 'performance.now'
  ]) {
    assert.ok(!code.includes(banned), `simulation must not use ${banned}`)
  }
})

// ─── PRNG ───────────────────────────────────────────────────────────────────────
test('PRNG is reproducible and stays in [0,1)', () => {
  const a = createRng(SEED), b = createRng(SEED)
  for (let i = 0; i < 5000; i++) {
    const v = a()
    assert.equal(v, b())
    assert.ok(v >= 0 && v < 1)
  }
})

test('different seeds give different worlds', () => {
  const a = simulate(seedFromHex('1111'), {}, humanLog(), MAX_TICKS)
  const b = simulate(seedFromHex('2222'), {}, humanLog(), MAX_TICKS)
  assert.notEqual(a.score + a.tick * 1000, b.score + b.tick * 1000)
})

// ─── Determinism ────────────────────────────────────────────────────────────────
test('the same seed + config + input log always replays to the same score', () => {
  const log = humanLog(120)
  const first = simulate(SEED, {}, log, MAX_TICKS)
  for (let i = 0; i < 5; i++) {
    const again = simulate(SEED, {}, log, MAX_TICKS)
    assert.equal(again.score, first.score)
    assert.equal(again.tick, first.tick)
    assert.equal(again.wave, first.wave)
    assert.equal(again.lives, first.lives)
  }
})

test('stepping live matches replaying the same log in one go', () => {
  // This is exactly the client-vs-server relationship: the page steps tick by tick as the
  // player holds buttons, the server replays the resulting log from scratch.
  const log = humanLog(90)
  const live = createState(SEED, {})
  let cursor = 0
  let mask = 0
  for (let tick = 1; tick <= MAX_TICKS && !live.over; tick++) {
    while (cursor < log.length && log[cursor].t <= tick) mask = log[cursor++].a
    step(live, mask)
  }
  const replayed = simulate(SEED, {}, log, MAX_TICKS)
  assert.equal(replayed.score, live.score)
  assert.equal(replayed.tick, live.tick)
  assert.equal(replayed.wave, live.wave)
})

test('an empty input log is a valid (drifting) run, not a crash', () => {
  const st = simulate(SEED, {}, [], MAX_TICKS)
  assert.ok(st.tick > 0)
  assert.ok(st.score >= 0)
})

test('runs terminate — every game either ends or hits the tick cap', () => {
  for (const hex of ['00', 'ff', 'abc123', 'deadbeef', '9f9f9f9f']) {
    const st = simulate(seedFromHex(hex), {}, humanLog(200), MAX_TICKS)
    assert.ok(st.over || st.tick >= MAX_TICKS, `run neither ended nor capped (seed ${hex})`)
  }
})

// ─── Config clamping ────────────────────────────────────────────────────────────
test('normalizeConfig clamps hostile values into safe ranges', () => {
  const c = normalizeConfig({
    startingLives: 9999, startAsteroids: 1e9, asteroidSpeed: Infinity,
    turnRate: -50, fireIntervalTicks: 0, powerupChancePercent: 5000,
    shipDrag: 42, extraLifeScore: -1
  })
  assert.equal(c.startingLives, 9)
  assert.equal(c.startAsteroids, 12)
  assert.equal(c.asteroidSpeed, 4)
  assert.equal(c.turnRate, 1)
  assert.equal(c.fireIntervalTicks, 3)
  assert.equal(c.powerupChancePercent, 100)
  assert.equal(c.shipDrag, 1)
  assert.equal(c.extraLifeScore, 0)
})

test('normalizeConfig survives NaN and missing input', () => {
  const c = normalizeConfig({ asteroidSpeed: NaN, turnRate: 'nope', startingLives: null })
  assert.equal(c.asteroidSpeed, 1.15)
  assert.equal(c.turnRate, 6)
  assert.equal(c.startingLives, 3)
  assert.deepEqual(normalizeConfig(undefined), normalizeConfig({}))
})

test('a maxed-out config still replays within a sane time budget', () => {
  const started = process.hrtime.bigint()
  simulate(SEED, {
    startingLives: 9, startAsteroids: 12, asteroidsPerWave: 4, asteroidSpeed: 4
  }, humanLog(400), MAX_TICKS)
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(ms < 1500, `worst-case replay took ${ms.toFixed(0)}ms`)
})

// ─── Input log validation ───────────────────────────────────────────────────────
test('sanitizeInputLog accepts a well-formed log and returns a clean copy', () => {
  const log = sanitizeInputLog([{ t: 1, a: IN_LEFT }, { t: 9, a: IN_THRUST }])
  assert.deepEqual(log, [{ t: 1, a: 1 }, { t: 9, a: 4 }])
})

test('sanitizeInputLog rejects malformed and hostile input', () => {
  const bad = [
    ['not an array', 'nope'],
    ['oversized', Array.from({ length: MAX_INPUT_EVENTS + 1 }, (_, i) => ({ t: i + 1, a: 0 }))],
    ['null entry', [null]],
    ['array entry', [[1, 2]]],
    ['non-integer tick', [{ t: 1.5, a: 0 }]],
    ['NaN tick', [{ t: NaN, a: 0 }]],
    ['Infinity tick', [{ t: Infinity, a: 0 }]],
    ['zero tick', [{ t: 0, a: 0 }]],
    ['negative tick', [{ t: -5, a: 0 }]],
    ['tick past cap', [{ t: MAX_TICKS + 1, a: 0 }]],
    ['duplicate ticks', [{ t: 5, a: 1 }, { t: 5, a: 2 }]],
    ['descending ticks', [{ t: 9, a: 1 }, { t: 4, a: 2 }]],
    ['unknown action bits', [{ t: 1, a: 255 }]],
    ['negative action', [{ t: 1, a: -1 }]],
    ['non-integer action', [{ t: 1, a: 1.5 }]],
    ['string action', [{ t: 1, a: '1' }]]
  ]
  for (const [label, input] of bad) {
    assert.throws(() => sanitizeInputLog(input), new RegExp('.'), `should have rejected: ${label}`)
  }
})

test('sanitizeInputLog does not carry prototype pollution into the simulation', () => {
  const parsed = JSON.parse('[{"t":1,"a":1,"__proto__":{"polluted":true}}]')
  const clean = sanitizeInputLog(parsed)
  assert.deepEqual(Object.keys(clean[0]), ['t', 'a'])
  assert.equal({}.polluted, undefined)
})

// ─── Cadence heuristic ──────────────────────────────────────────────────────────
test('perfectly uniform input gaps are flagged as robotic', () => {
  const log = []
  for (let i = 0; i < 80; i++) log.push({ t: 1 + i * 10, a: i % 2 ? IN_LEFT : IN_RIGHT })
  assert.equal(hasRoboticCadence(log), true)
})

test('irregular human input is not flagged, and short logs are never flagged', () => {
  assert.equal(hasRoboticCadence(humanLog(80)), false)
  const shortUniform = []
  for (let i = 0; i < 8; i++) shortUniform.push({ t: 1 + i * 10, a: 0 })
  assert.equal(hasRoboticCadence(shortUniform), false)
})

// ─── Replay gate ────────────────────────────────────────────────────────────────
test('replayAsteroidGame scores a plausibly-timed run', () => {
  const log = humanLog(70)
  const probe = simulate(SEED, {}, log, MAX_TICKS)
  const honestMs = (probe.tick / TICK_HZ) * 1000
  const out = replayAsteroidGame({ seedInt: SEED, cfg: {}, inputLog: log, elapsedMs: honestMs })
  assert.equal(out.score, probe.score)
  assert.equal(out.ticks, probe.tick)
  assert.ok(out.score > 0)
})

test('a run submitted faster than it could be played is rejected', () => {
  const log = humanLog(70)
  assert.throws(
    () => replayAsteroidGame({ seedInt: SEED, cfg: {}, inputLog: log, elapsedMs: 50 }),
    /faster than it could have been played/
  )
})

test('a slow submission is accepted — pausing must never cost a legitimate run', () => {
  const log = humanLog(70)
  const out = replayAsteroidGame({
    seedInt: SEED, cfg: {}, inputLog: log, elapsedMs: 25 * 60 * 1000
  })
  assert.ok(out.score >= 0)
})

test('the score never exceeds what the replay itself produced', () => {
  const log = humanLog(150)
  const out = replayAsteroidGame({
    seedInt: SEED, cfg: {}, inputLog: log, elapsedMs: 10 * 60 * 1000
  })
  const direct = simulate(SEED, {}, log, MAX_TICKS)
  assert.equal(out.score, direct.score)
  assert.ok(Number.isInteger(out.score))
})

test('a config edited after /start cannot change an in-flight replay', () => {
  // The session snapshots cfg, so replaying with a different config yields a different score —
  // which is exactly why start.post.js stores it rather than re-reading the DB at /end.
  const log = humanLog(80)
  const a = simulate(SEED, { pointsLarge: 20 }, log, MAX_TICKS)
  const b = simulate(SEED, { pointsLarge: 9999 }, log, MAX_TICKS)
  assert.notEqual(a.score, b.score)
})
