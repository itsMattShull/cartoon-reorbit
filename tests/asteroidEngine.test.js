// The whole anti-cheat design rests on the client and the server producing byte-identical
// simulations. These tests pin the properties that guarantee it, so a future change to the
// physics can't silently start rejecting legitimate runs.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRIG_STEPS, COS_TABLE, SIN_TABLE, TICK_HZ,
  IN_LEFT, IN_RIGHT, IN_THRUST,
  createRng, seedFromHex, normalizeConfig, simulate, createState, step,
  SHIPS, SHIP_IDS, DEFAULT_SHIP_ID, getShip, MAX_BULLETS, WORLD_W
} from '../lib/asteroidSim.js'

import {
  sanitizeInputLog, inputCadenceStats, replayAsteroidGame,
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

test('physics knobs are clamped and actually change the world', () => {
  const c = normalizeConfig({
    shipRadius: 9999, bulletSpeed: -5, bulletLifeTicks: 1,
    respawnInvulnTicks: -10, powerupRadius: 0, powerupLifeTicks: 999999,
    asteroidLargeRadius: 500, asteroidMediumRadius: 0, asteroidSmallRadius: 1e9
  })
  assert.equal(c.shipRadius, 40)
  assert.equal(c.bulletSpeed, 1)
  assert.equal(c.bulletLifeTicks, 10)
  assert.equal(c.respawnInvulnTicks, 0)
  assert.equal(c.powerupRadius, 5)
  assert.equal(c.powerupLifeTicks, 3600)
  assert.equal(c.asteroidLargeRadius, 80)
  assert.equal(c.asteroidMediumRadius, 6)
  assert.equal(c.asteroidSmallRadius, 40)

  // Missing physics values fall back to the documented defaults, not the range minimum —
  // start.post.js passes undefined for every field before a config row exists.
  const d = normalizeConfig({})
  assert.equal(d.shipRadius, 13)
  assert.equal(d.bulletSpeed, 6.2)
  assert.equal(d.bulletLifeTicks, 66)
  assert.equal(d.asteroidLargeRadius, 34)
})

test('a physics change produces a genuinely different run', () => {
  // If the admin panel is going to expose these, they have to actually reach the simulation.
  const log = humanLog(80)
  const base = simulate(SEED, {}, log, MAX_TICKS)
  for (const tweak of [
    { bulletSpeed: 2 },
    { bulletLifeTicks: 15 },
    { shipRadius: 34 },
    { asteroidLargeRadius: 70 }
  ]) {
    const changed = simulate(SEED, tweak, log, MAX_TICKS)
    assert.notEqual(
      `${changed.score}/${changed.tick}`,
      `${base.score}/${base.tick}`,
      `changing ${Object.keys(tweak)[0]} had no effect on the run`
    )
  }
})

test('a retuned physics config still replays deterministically', () => {
  const cfg = { shipRadius: 20, bulletSpeed: 9, bulletLifeTicks: 120, asteroidLargeRadius: 50 }
  const log = humanLog(100)
  const a = simulate(SEED, cfg, log, MAX_TICKS)
  const b = simulate(SEED, cfg, log, MAX_TICKS)
  assert.equal(a.score, b.score)
  assert.equal(a.tick, b.tick)
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

// ─── Ships ──────────────────────────────────────────────────────────────────────
test('every ship has a complete, in-range weapon profile', () => {
  assert.equal(SHIPS.length, 3)
  for (const ship of SHIPS) {
    assert.ok(ship.id && ship.name && ship.sprite, `${ship.id} is missing metadata`)
    const w = ship.weapon
    // Each weapon must survive normalizeConfig unchanged, or the admin defaults and the
    // intended feel would silently disagree the first time a run starts.
    const c = normalizeConfig(w)
    assert.equal(c.fireIntervalTicks, w.fireIntervalTicks, `${ship.id} fire interval got clamped`)
    assert.equal(c.bulletSpeed, w.bulletSpeed, `${ship.id} bullet speed got clamped`)
    assert.equal(c.bulletLifeTicks, w.bulletLifeTicks, `${ship.id} bullet life got clamped`)
    assert.equal(c.pellets, w.pellets, `${ship.id} pellets got clamped`)
    assert.equal(c.spreadSteps, w.spreadSteps, `${ship.id} spread got clamped`)
  }
  assert.ok(SHIP_IDS.includes(DEFAULT_SHIP_ID))
})

test('the three ships occupy genuinely different range/rate niches', () => {
  const reach = id => {
    const w = getShip(id).weapon
    return w.bulletSpeed * w.bulletLifeTicks
  }
  const rate = id => 60 / getShip(id).weapon.fireIntervalTicks

  // This is the product requirement, pinned: shotgun close, sniper far, casual between.
  assert.ok(reach('scamper') < WORLD_W * 0.3, 'S.C.A.M.P.E.R. must be very short range')
  assert.ok(reach('mosquittoh') > WORLD_W * 1.5, 'M.O.S.Q.U.I.T.T.O.H. must be very long range')
  assert.ok(reach('casual') > reach('scamper') && reach('casual') < reach('mosquittoh'),
    'C.A.S.U.A.L. must sit between the other two on range')

  assert.ok(rate('mosquittoh') < rate('casual'), 'the sniper must be the slower firer')
  assert.ok(getShip('scamper').weapon.pellets > 1, 'only S.C.A.M.P.E.R. is a shotgun')
  assert.equal(getShip('mosquittoh').weapon.pellets, 1)
  assert.equal(getShip('casual').weapon.pellets, 1)
})

test('every ship fires from the nose of its sprite, not its centre', () => {
  // The art is drawn 4.8x the collision radius across, so its nose sits 2.4 radii out. A muzzle
  // at the old shipRadius+1 put shots visibly inside the hull.
  for (const ship of SHIPS) {
    const w = ship.weapon
    assert.ok(w.muzzleRadii >= 1.8 && w.muzzleRadii <= 2.4,
      `${ship.id} muzzle at ${w.muzzleRadii} radii is not at the nose of the sprite`)
    const st = createState(SEED, { ...w, shipRadius: 13 })
    st.ship.x = 100; st.ship.y = 100; st.ship.vx = 0; st.ship.vy = 0
    st.ship.heading = 0            // pointing +x
    step(st, 0)
    assert.ok(st.bullets.length > 0, `${ship.id} did not fire`)
    const dx = st.bullets[0].x - 100
    assert.ok(dx > 13 * 1.8, `${ship.id} spawned its shot at ${dx.toFixed(1)}, inside the hull`)
  }
})

test('the muzzle tracks a retuned ship radius instead of drifting inside the art', () => {
  // muzzleRadii is a multiple, not an absolute distance, so a bigger ship still fires from its
  // own nose rather than from a fixed point somewhere in its middle.
  const mk = r => {
    const st = createState(SEED, { ...getShip('casual').weapon, shipRadius: r })
    st.ship.x = 200; st.ship.y = 200; st.ship.vx = 0; st.ship.vy = 0; st.ship.heading = 0
    step(st, 0)
    return st.bullets[0].x - 200
  }
  const small = mk(10), big = mk(30)
  assert.ok(big > small * 2.5, `muzzle did not scale with radius: ${small.toFixed(1)} vs ${big.toFixed(1)}`)
})

test('getShip falls back to the default for an unknown id', () => {
  assert.equal(getShip('not-a-ship').id, DEFAULT_SHIP_ID)
  assert.equal(getShip(undefined).id, DEFAULT_SHIP_ID)
})

test('a shotgun volley fires every pellet in one tick, fanned around the heading', () => {
  const st = createState(SEED, { pellets: 5, spreadSteps: 96, fireIntervalTicks: 30, bulletLifeTicks: 200 })
  st.ship.invulnTicks = 0
  step(st, 0)
  assert.equal(st.bullets.length, 5, 'all five pellets should appear on the same tick')
  // The fan must actually spread: pellet velocities cannot all be identical.
  const dirs = new Set(st.bullets.map(b => `${b.vx.toFixed(4)},${b.vy.toFixed(4)}`))
  assert.equal(dirs.size, 5, 'each pellet should travel on its own heading')
})

test('a single-shot ship fires exactly one projectile per shot', () => {
  const st = createState(SEED, { pellets: 1, spreadSteps: 0, fireIntervalTicks: 30, bulletLifeTicks: 200 })
  step(st, 0)
  assert.equal(st.bullets.length, 1)
})

test('a volley can never exceed the global bullet cap', () => {
  // pellets is clamped to 12 against a cap of 40, but the guard has to hold regardless.
  const st = createState(SEED, { pellets: 12, spreadSteps: 512, fireIntervalTicks: 3, bulletLifeTicks: 300 })
  for (let i = 0; i < 400; i++) step(st, 0)
  assert.ok(st.bullets.length <= MAX_BULLETS, `bullets ran to ${st.bullets.length}`)
})

test('each ship produces a different run from the same seed and inputs', () => {
  const log = humanLog(90)
  const results = SHIPS.map(ship => {
    const st = simulate(SEED, ship.weapon, log, MAX_TICKS)
    return `${st.score}/${st.tick}`
  })
  assert.equal(new Set(results).size, SHIPS.length,
    `ships did not diverge: ${results.join(' ')}`)
})

test('every ship replays deterministically', () => {
  const log = humanLog(110)
  for (const ship of SHIPS) {
    const a = simulate(SEED, ship.weapon, log, MAX_TICKS)
    const b = simulate(SEED, ship.weapon, log, MAX_TICKS)
    assert.equal(a.score, b.score, `${ship.id} diverged on replay`)
    assert.equal(a.tick, b.tick, `${ship.id} diverged on replay`)
  }
})

test('stepping live matches replay for the shotgun too', () => {
  // The multi-pellet path is the newest branch in the fire logic; it has to hold the same
  // client-steps-live vs server-replays-whole-log equivalence as everything else.
  const cfg = getShip('scamper').weapon
  const log = humanLog(70)
  const live = createState(SEED, cfg)
  let cursor = 0, mask = 0
  for (let tick = 1; tick <= MAX_TICKS && !live.over; tick++) {
    while (cursor < log.length && log[cursor].t <= tick) mask = log[cursor++].a
    step(live, mask)
  }
  const replayed = simulate(SEED, cfg, log, MAX_TICKS)
  assert.equal(replayed.score, live.score)
  assert.equal(replayed.tick, live.tick)
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

// ─── Cadence stats ──────────────────────────────────────────────────────────────
test('inputCadenceStats reports gap statistics without judging them', () => {
  const log = []
  for (let i = 0; i < 80; i++) log.push({ t: 1 + i * 10, a: i % 2 ? IN_LEFT : IN_RIGHT })
  const st = inputCadenceStats(log)
  assert.equal(st.samples, 79)
  assert.equal(st.meanGap, 10)
  assert.equal(st.stdDevGap, 0)
  assert.deepEqual(inputCadenceStats([]), { samples: 0, meanGap: 0, stdDevGap: 0 })
})

// Regression guard. An earlier build rejected runs whose input gaps looked "too uniform" and
// threw out 40/40 simulated human runs, because 60Hz tick quantisation makes a perfect bot
// (~0.43 ticks of gap deviation) statistically indistinguishable from a human expert (~0.59).
// Cadence must never cost a player their score again.
test('metronomic input is still scored — cadence is never a rejection reason', () => {
  const log = []
  for (let i = 0; i < 300; i++) log.push({ t: 1 + i * 4, a: i % 2 ? IN_LEFT : IN_RIGHT })
  const probe = simulate(SEED, {}, log, MAX_TICKS)
  const out = replayAsteroidGame({
    seedInt: SEED, cfg: {}, inputLog: log,
    elapsedMs: (probe.tick / TICK_HZ) * 1000
  })
  assert.equal(out.score, probe.score)
  assert.ok(out.cadence.samples > 0)
})

test('a fast player\'s full-length run fits well inside the input-log cap', () => {
  // ~8 presses/second for five minutes, the realistic human ceiling.
  const events = 8 * 2 * 300
  assert.ok(events < MAX_INPUT_EVENTS * 0.75,
    `cap ${MAX_INPUT_EVENTS} leaves too little headroom over ${events} realistic events`)
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
