import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clampSampleX,
  clampSampleY,
  createState,
  createSegmentFeeder,
  normalizeConfig,
  hashSeed,
  simulate,
  segmentHitsCircle,
  step,
  waveSizeAt,
  WORLD_W,
  WORLD_H,
  FP,
  K_FRUIT,
  MAX_SAMPLE_GAP_TICKS,
  MIN_SLICE_DIST2,
  COORD_MARGIN,
  MAX_LIVE_FRUIT
} from '../lib/fruitSamuraiSim.js'

import {
  sanitizeStrokes,
  sanitizeFruitSamuraiCfg,
  replayFruitSamuraiGame,
  MAX_TICKS,
  MAX_STROKES,
  MAX_SAMPLES,
  MAX_SESSION_SECONDS
} from '../server/utils/fruitSamuraiEngine.js'

const CFG = normalizeConfig({})

// Plays a run the way the CLIENT does — stepping tick by tick while appending to the stroke
// log — and returns both the resulting state and the log. `cadence` is ticks between cuts, so
// a larger number is a slower (more human) player.
function playInteractively(seedStr, cadence, maxTicks = MAX_TICKS) {
  const st = createState(hashSeed(seedStr), CFG)
  const strokes = []
  const feeder = createSegmentFeeder(strokes)
  let cur = null
  let last = -999
  for (let t = 1; t <= maxTicks && !st.over; t++) {
    const target = st.objects.find(o => !o.sliced && o.armed)
    if (target && t - last >= cadence) {
      const cx = target.x >> 8
      const cy = target.y >> 8
      if (cur === null) {
        cur = { t, p: [0, Math.max(0, cx - 40), cy] }
        strokes.push(cur)
      } else {
        cur.p.push(t - cur.t, Math.min(WORLD_W - 1, cx + 40), cy)
        cur = null
        last = t
      }
    } else if (cur !== null) {
      cur.p.push(t - cur.t, cur.p[1] + 10, cur.p[2])
      cur = null
    }
    step(st, feeder(t))
  }
  return { st, strokes }
}

test('the same seed and log always produce the same run', () => {
  const a = simulate(hashSeed('repeat'), CFG, [], 4000)
  const b = simulate(hashSeed('repeat'), CFG, [], 4000)
  assert.equal(a.score, b.score)
  assert.equal(a.tick, b.tick)
  assert.equal(a.lives, b.lives)
})

test('a different seed produces a different run', () => {
  const a = simulate(hashSeed('seed-one'), CFG, [], 4000)
  const b = simulate(hashSeed('seed-two'), CFG, [], 4000)
  assert.notEqual(a.tick + a.score, b.tick + b.score)
})

// The contract the whole design rests on: what the player watched and what the server
// recomputes must be the same number. A failure here is the "watched 800, told 640" bug.
test('stepping interactively matches replaying the log in one batch', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    for (const cadence of [4, 12, 25]) {
      const { st, strokes } = playInteractively(seed, cadence)
      const replay = simulate(hashSeed(seed), CFG, strokes, MAX_TICKS)
      assert.equal(replay.score, st.score, `score for seed=${seed} cadence=${cadence}`)
      assert.equal(replay.tick, st.tick, `tick for seed=${seed} cadence=${cadence}`)
      assert.equal(replay.lives, st.lives, `lives for seed=${seed} cadence=${cadence}`)
    }
  }
})

test('the engine replay agrees with the client for a full run', () => {
  const { st, strokes } = playInteractively('engine-agrees', 12)
  const result = replayFruitSamuraiGame({
    runSeed: 'engine-agrees',
    cfg: CFG,
    strokes,
    elapsedMs: Math.ceil((st.tick / 60) * 1000)
  })
  assert.equal(result.score, st.score)
  assert.equal(result.ticks, st.tick)
})

test('a feeder over a still-growing log does not strand an open stroke', () => {
  // The client appends to the log as it plays, so at the moment a stroke's first sample lands
  // there is no later stroke to prove it is finished. Advancing past it there would silently
  // discard every cut in the stroke the player is part-way through.
  const strokes = []
  const feeder = createSegmentFeeder(strokes)
  strokes.push({ t: 10, p: [0, 100, 100] })
  assert.deepEqual(feeder(10), [], 'first sample of a stroke makes no segment')
  strokes[0].p.push(1, 300, 100)
  const segs = feeder(11)
  assert.equal(segs.length, 1)
  assert.equal(segs[0].x0, 100)
  assert.equal(segs[0].x1, 300)
})

test('a tap does not cut, and cuts never continue across a pointer-up', () => {
  const strokes = [
    { t: 5, p: [0, 100, 100] }, // lone sample: a tap
    { t: 9, p: [0, 400, 700] } // a second tap far away
  ]
  const feeder = createSegmentFeeder(strokes)
  for (let t = 1; t <= 12; t++) assert.deepEqual(feeder(t), [], `tick ${t}`)
})

test('a stationary blade does not cut', () => {
  const st = createState(hashSeed('still'), CFG)
  const feeder = createSegmentFeeder([])
  // Run until a fruit is airborne, then hold the blade motionless on top of it.
  let target = null
  let t = 0
  while (!target && t < 600) { t++; step(st, feeder(t)); target = st.objects.find(o => o.armed) }
  assert.ok(target, 'a fruit should be airborne by now')
  const cx = target.x >> 8
  const cy = target.y >> 8
  const before = st.score
  // A segment shorter than the minimum slice distance, right through the centre.
  step(st, [{ s: 0, gap: 1, x0: cx, y0: cy, x1: cx + 1, y1: cy }])
  assert.equal(st.score, before, 'resting a finger on a fruit must not score')
})

test('a blade segment spanning a long gap does not cut and breaks the combo', () => {
  const st = createState(hashSeed('gap'), CFG)
  const feeder = createSegmentFeeder([])
  let target = null
  let t = 0
  while (!target && t < 600) { t++; step(st, feeder(t)); target = st.objects.find(o => o.armed) }
  const cx = target.x >> 8
  const cy = target.y >> 8
  const before = st.score
  st.combo = 5
  step(st, [{ s: 0, gap: MAX_SAMPLE_GAP_TICKS + 1, x0: cx - 60, y0: cy, x1: cx + 60, y1: cy }])
  assert.equal(st.score, before, 'a chord across a backgrounded tab must not harvest fruit')
  assert.equal(st.combo, 0, 'and it must break the chain')
})

test('a fruit cut on the tick it crosses the bottom edge scores instead of costing a life', () => {
  // Slices resolve before the miss check. Both orderings are natural to write, which is
  // exactly why the sim pins one down.
  const st = createState(hashSeed('edge'), CFG)
  const feeder = createSegmentFeeder([])
  let t = 0
  while (st.objects.length === 0 && t < 600) { t++; step(st, feeder(t)) }
  const o = st.objects[0]
  // Park it one tick from being missed.
  o.armed = true
  o.y = (WORLD_H + 24) * FP
  o.vy = 4 * FP
  const lives = st.lives
  const cx = o.x >> 8
  const cy = (o.y + o.vy) >> 8
  step(st, [{ s: 0, gap: 1, x0: cx - 60, y0: cy, x1: cx + 60, y1: cy }])
  assert.equal(st.lives, lives, 'no life lost')
  assert.ok(st.score > 0, 'and it scored')
})

test('missing a fruit costs a life; missing a power-up does not', () => {
  const idle = simulate(hashSeed('idle-run'), CFG, [], MAX_TICKS)
  assert.equal(idle.lives, 0)
  assert.equal(idle.over, true)
  const misses = idle.events.filter(e => e.e === 'miss')
  assert.equal(misses.length, CFG.startingLives)
  // Every miss event is a fruit; power-ups never emit one.
  for (const m of misses) assert.ok(m.typeIdx >= 0)
})

test('fruit never launch above the top of the world', () => {
  const st = createState(hashSeed('apex'), CFG)
  const feeder = createSegmentFeeder([])
  let minY = Infinity
  for (let t = 1; t <= 6000; t++) {
    step(st, feeder(t))
    for (const o of st.objects) minY = Math.min(minY, (o.y >> 8) - o.r)
  }
  assert.ok(minY >= 0, `fruit reached y=${minY}, which is off the top of the screen`)
})

test('live fruit stay under the concurrency rail', () => {
  const st = createState(hashSeed('rail'), CFG)
  const feeder = createSegmentFeeder([])
  let peak = 0
  st.lives = 9999 // never die, so the escalation curve runs to the end
  for (let t = 1; t <= MAX_TICKS; t++) {
    step(st, feeder(t))
    let n = 0
    for (const o of st.objects) if (o.kind === K_FRUIT) n++
    peak = Math.max(peak, n)
  }
  assert.ok(peak <= MAX_LIVE_FRUIT, `peak live fruit ${peak} exceeded the rail`)
})

test('waves escalate without a ceiling so a run always ends', () => {
  // Without this a strong player stops missing, the run ends only at the tick rail, and the
  // top of the leaderboard becomes a tie broken by RNG rather than skill.
  assert.ok(waveSizeAt(CFG, 18000) > waveSizeAt(CFG, 9000))
  assert.ok(waveSizeAt(CFG, 36000) > waveSizeAt(CFG, 18000))
})

test('segment/circle intersection is exact at the boundary', () => {
  // Perpendicular distance exactly r: touching counts.
  assert.equal(segmentHitsCircle(0, 10, 100, 10, 50, 0, 10), true)
  assert.equal(segmentHitsCircle(0, 10, 100, 10, 50, 0, 9), false)
  // Beyond both endpoints, the nearest point is an endpoint, not the infinite line.
  assert.equal(segmentHitsCircle(0, 0, 10, 0, 200, 0, 10), false)
  assert.equal(segmentHitsCircle(0, 0, 10, 0, 15, 0, 10), true)
})

test('the piggy bank multiplier includes the tick it expires on', () => {
  const st = createState(hashSeed('piggy'), CFG)
  st.tick = 100
  st.piggyUntil = 100
  const feeder = createSegmentFeeder([])
  // At tick 100 the multiplier is live; stepping to 101 drops it.
  assert.ok(st.tick <= st.piggyUntil)
  step(st, feeder(101))
  assert.ok(st.tick > st.piggyUntil)
})

test('config is clamped, and nonsense ranges are repaired rather than trusted', () => {
  const cfg = sanitizeFruitSamuraiCfg({
    startingLives: 999,
    gravity: NaN,
    spawnIntervalStartTicks: 60,
    spawnIntervalMinTicks: 600, // min above start would ramp the wrong way
    launchVyMin: 5000,
    launchVyMax: 3200, // inverted
    powerupWeightPiggy: 0,
    powerupWeightHourglass: 0,
    powerupWeightDynamite: 0 // would divide by nothing
  })
  assert.equal(cfg.startingLives, 5)
  assert.equal(cfg.gravity, 70, 'NaN falls back to the default, it does not pass through')
  assert.ok(cfg.spawnIntervalMinTicks <= cfg.spawnIntervalStartTicks)
  assert.ok(cfg.launchVyMin <= cfg.launchVyMax)
  assert.ok(cfg.powerupWeightPiggy + cfg.powerupWeightHourglass + cfg.powerupWeightDynamite > 0)
})

test('the sim has no notion of a time scale', () => {
  // Slow motion is renderer pacing only. If a timeScale ever lands in the config it would put
  // a float in the physics that round-trips through Redis JSON and an admin form.
  const cfg = sanitizeFruitSamuraiCfg({ timeScale: 0.45 })
  assert.equal(cfg.timeScale, undefined)
  for (const v of Object.values(cfg)) assert.ok(Number.isInteger(v), 'every config value is an integer')
})

// ── Sanitizer ─────────────────────────────────────────────────────────────────────────────

test('sanitizeStrokes accepts a well-formed log and returns fresh objects', () => {
  const raw = [{ t: 3, p: [0, 10, 10, 2, 60, 60] }]
  const out = sanitizeStrokes(raw)
  assert.notEqual(out[0], raw[0])
  assert.notEqual(out[0].p, raw[0].p)
  assert.deepEqual(out[0].p, [0, 10, 10, 2, 60, 60])
})

// This is the regression that shipped: swiping off the edge of the board is ordinary play, the
// captured pointer keeps reporting far outside the world, and the sanitizer used to throw —
// costing the player the whole run and the ranked attempt that went with it.
test('a swipe that leaves the board is clamped, not rejected', () => {
  const wild = [{ t: 5, p: [0, -4000, 400, 2, 9999, -8000, 4, 240, 380] }]
  const out = sanitizeStrokes(wild)
  assert.equal(out[0].p[1], -COORD_MARGIN)
  assert.equal(out[0].p[2], 400)
  assert.equal(out[0].p[4], WORLD_W + COORD_MARGIN)
  assert.equal(out[0].p[5], -COORD_MARGIN)
  assert.equal(out[0].p[7], 240, 'in-range samples are untouched')
  assert.equal(out[0].p[8], 380)
})

test('a full run containing off-board samples still submits', () => {
  const { st, strokes } = playInteractively('offboard', 12)
  // Push every stroke well outside the world, the way a followed-through swipe does.
  for (const s of strokes) {
    for (let j = 1; j < s.p.length; j += 3) {
      if (j % 2 === 1) { s.p[j] -= 3000; s.p[j + 1] += 5000 }
    }
  }
  const result = replayFruitSamuraiGame({
    runSeed: 'offboard',
    cfg: CFG,
    strokes,
    elapsedMs: Math.ceil((st.tick / 60) * 1000)
  })
  assert.ok(Number.isInteger(result.score), 'the run is scored rather than thrown out')
})

test('the client and the server clamp samples identically', () => {
  // The client clamps as it records and the server clamps as it validates. If those two ever
  // disagreed, the player would watch one score and be told another.
  for (const v of [-99999, -65, -64, -1, 0, 240, WORLD_W, WORLD_W + 64, WORLD_W + 65, 99999]) {
    const viaSanitizer = sanitizeStrokes([{ t: 1, p: [0, v, 10, 1, 10, v] }])[0].p
    assert.equal(viaSanitizer[1], clampSampleX(v))
    assert.equal(viaSanitizer[5], clampSampleY(v))
  }
})

test('sanitizeStrokes rejects malformed input', () => {
  const cases = {
    'not an array': 'nope',
    'stroke is not an object': [[0, 1, 1]],
    'null stroke': [null],
    'non-integer t': [{ t: 1.5, p: [0, 1, 1, 1, 2, 2] }],
    't below range': [{ t: 0, p: [0, 1, 1, 1, 2, 2] }],
    't above range': [{ t: MAX_TICKS + 1, p: [0, 1, 1, 1, 2, 2] }],
    'p not an array': [{ t: 1, p: 'x' }],
    'p length not a multiple of 3': [{ t: 1, p: [0, 1] }],
    'p empty': [{ t: 1, p: [] }],
    'first dt not zero': [{ t: 1, p: [3, 1, 1, 4, 2, 2] }],
    'dt decreasing': [{ t: 1, p: [0, 1, 1, -1, 2, 2] }],
    'NaN coordinate': [{ t: 1, p: [0, NaN, 1, 1, 2, 2] }],
    'Infinity coordinate': [{ t: 1, p: [0, Infinity, 1, 1, 2, 2] }],
    'non-integer coordinate': [{ t: 1, p: [0, 1.5, 1, 1, 2, 2] }],
    'runs past the tick cap': [{ t: MAX_TICKS - 1, p: [0, 1, 1, 50, 2, 2] }],
    'overlapping strokes': [{ t: 1, p: [0, 1, 1, 5, 2, 2] }, { t: 3, p: [0, 1, 1, 1, 2, 2] }],
    'strokes out of order': [{ t: 10, p: [0, 1, 1, 1, 2, 2] }, { t: 2, p: [0, 1, 1, 1, 2, 2] }]
  }
  for (const [name, value] of Object.entries(cases)) {
    assert.throws(() => sanitizeStrokes(value), new RegExp('.'), `should have rejected: ${name}`)
  }
})

test('sanitizeStrokes enforces the size rails', () => {
  const tooMany = []
  for (let i = 0; i < MAX_STROKES + 1; i++) tooMany.push({ t: i + 1, p: [0, 1, 1] })
  assert.throws(() => sanitizeStrokes(tooMany), /stroke count/)

  const p = [0, 1, 1]
  for (let i = 1; i <= MAX_SAMPLES + 1; i++) p.push(i, 1, 1)
  assert.throws(() => sanitizeStrokes([{ t: 1, p }]), /sample count/)
})

test('a __proto__ key in the payload cannot pollute anything', () => {
  const payload = JSON.parse('[{"t":1,"p":[0,10,10,2,60,60],"__proto__":{"polluted":1}}]')
  const out = sanitizeStrokes(payload)
  assert.equal(out[0].polluted, undefined)
  assert.equal({}.polluted, undefined)
})

test('accessor properties on the log never reach the sim', () => {
  const arr = [0, 10, 10, 2, 60, 60]
  let reads = 0
  Object.defineProperty(arr, 1, { get () { reads++; return 10 }, enumerable: true, configurable: true })
  const out = sanitizeStrokes([{ t: 1, p: arr }])
  const desc = Object.getOwnPropertyDescriptor(out[0].p, 1)
  assert.equal(typeof desc.value, 'number', 'the copy holds a plain value, not a getter')
})

// ── Wall-clock gates ──────────────────────────────────────────────────────────────────────

test('a run submitted faster than it could have been played is flagged', () => {
  const fast = replayFruitSamuraiGame({ runSeed: 's', cfg: CFG, strokes: [], elapsedMs: 0 })
  assert.equal(fast.tooFast, true)
  const honest = replayFruitSamuraiGame({
    runSeed: 's',
    cfg: CFG,
    strokes: [],
    elapsedMs: Math.ceil((fast.ticks / 60) * 1000)
  })
  assert.equal(honest.tooFast, false)
})

test('a run stretched far beyond the session cap is flagged', () => {
  // Unlike Asteroid, slow is not automatically fine here: slow motion is a designed mechanic,
  // so a client pacing itself at 6Hz would otherwise buy unlimited planning time per tick.
  const slow = replayFruitSamuraiGame({
    runSeed: 's',
    cfg: CFG,
    strokes: [],
    elapsedMs: MAX_SESSION_SECONDS * 1000 + 1
  })
  assert.equal(slow.tooSlow, true)
  const ok = replayFruitSamuraiGame({
    runSeed: 's',
    cfg: CFG,
    strokes: [],
    elapsedMs: MAX_SESSION_SECONDS * 1000 - 1
  })
  assert.equal(ok.tooSlow, false)
})

test('replaying a maximal log stays far inside the per-request budget', () => {
  const strokes = []
  let t = 1
  while (strokes.length < MAX_STROKES && t + 6 < MAX_TICKS) {
    strokes.push({ t, p: [0, 10, 10, 2, WORLD_W - 10, WORLD_H - 10, 4, 10, WORLD_H - 60] })
    t += 6
  }
  const started = process.hrtime.bigint()
  replayFruitSamuraiGame({ runSeed: 'budget', cfg: CFG, strokes, elapsedMs: 300000 })
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  assert.ok(ms < 120, `replay took ${ms.toFixed(1)}ms`)
})
