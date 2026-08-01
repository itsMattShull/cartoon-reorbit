// Server-only Flappy Powerpuff game engine. Never import this from pages/ or components/.
// The pure physics below is duplicated (by hand) in pages/newsite/flappypowerpuff.vue so the
// client can render the same motion; the anti-cheat constants and thresholds in this file are
// deliberately NOT shared, because shipping them in the client bundle would tell a bot exactly
// which limits to stay under.
//
// Game model: classic "flappy" side-scroller in a FIXED 480x760 world.
//  - The girl's x is pinned at BIRD_X. The world scrolls left past her.
//  - Gravity pulls her down continuously; each flap RESETS her vertical velocity to
//    `flapVelocity` (it does not add to it — that's what makes the motion a clean sequence of
//    independent parabolas, and it's how the original game behaves).
//  - Skyscraper pairs arrive with a gap; touching a building or the street ends the run.
//    There is deliberately NO ceiling: the top building extends infinitely upward, so flying
//    over it is impossible, but flying off the top of the screen between buildings is legal
//    and self-correcting. That removes a boundary case rather than adding a frustrating one.
//  - Score = number of buildings fully passed before the first collision.
//
// ── Why this engine is closed-form instead of a fixed-timestep loop ────────────────────────
// Between two flaps the trajectory is EXACTLY a parabola and the scroll is EXACTLY piecewise
// linear, so stepping the simulation is not just slow, it's unnecessary. Stepping at 1/120s
// over the max session length would be ~108,000 iterations of synchronous work per /end, on
// the request event loop, with the expensive case (a crafted log that never collides) chosen
// by the attacker rather than by an honest player. Evaluating the closed form costs O(flaps +
// buildings) — benchmarked at ~0.04ms vs ~9.6ms — and, because the horizon is derived from
// when the girl must hit the street after her LAST flap, the cost is bounded by the submitted
// log rather than by the configured session length.
//
// It also makes the client framerate-independent for free: position is a pure function of
// (game time, flap timestamps), so a dropped frame or a GC pause cannot desync the client's
// prediction from this replay. A fixed-timestep client accumulator would have had to match
// this file's leftover-fraction and catch-up behavior bit-for-bit, and would not have.
//
// ── Float determinism ─────────────────────────────────────────────────────────────────────
// Only +, -, *, /, %, comparisons, Math.min/max/abs and Math.imul appear in the shared path.
// ECMA-262 mandates IEEE-754 binary64 with correct rounding for those, so every JS engine
// agrees bit-for-bit. Math.pow / exp / sin / ** with a non-integer exponent are explicitly
// "implementation-approximated" and MUST NOT be introduced here. Math.sqrt appears once, for
// the street-impact time; it is correctly rounded in every real engine and the result is only
// ever compared against times that carry a leniency margin far larger than an ULP.
//
// Where the client and server could still disagree by a hair, the server is deliberately the
// LENIENT one: HITBOX_FORGIVENESS shrinks the girl's hitbox here by 1 world unit per side
// (0.2% of the world). The asymmetry is the point — the server may agree with the client or
// be kinder to the player, never stricter. A player who watched "23" must never be told "17".
//
// ── Anti-cheat: what this does and does not defend ────────────────────────────────────────
// `pipeSeed` is handed to the client at /start because the client MUST know it to render the
// real buildings (same constraint as towerStackEngine's jitterSeed and reorbitMatchEngine's
// fillSeed). What it buys is per-session uniqueness: a flap sequence solved once cannot be
// replayed or shared across sessions. It does NOT stop a bot that re-solves the sequence from
// the /start response before rendering a frame — the same ceiling Tower Stack already accepts.
//
// That ceiling is cheap to accept here because points are FLAT per ranked play: a perfect bot
// and a player who scores 1 earn identical points, so a forged score has no direct economic
// value. It buys leaderboard vanity and score-threshold achievements, nothing else.
//
// `gapClearanceStdDev` (below) is a much better human tell than tap-cadence variance: a solver
// clusters its crossings near one offset from the gap center, while humans scatter widely.
// Faking it costs the bot real score. Like every heuristic of this kind it is defeated by an
// attacker who deliberately adds scatter — it catches lazy scripts and nothing else, and is
// reported for flagging rather than used to hard-reject.

// ── World geometry (a coordinate-system choice, not a difficulty knob, so not admin-tunable) ──
// The world is a FIXED 480x760 rectangle, letterboxed into whatever viewport the player has.
// The 0.63 aspect is chosen to match the canvas a real phone actually gets AFTER the site's
// adbar and nav (measured: iPhone 15 Pro 385x607, Pixel 7 401x692), so the letterbox bars are
// near zero on those and the play column stays as wide as possible. A taller world wasted
// ~21% of an iPhone 15 Pro's width and ~45% of an iPhone SE's.
// This is the fairness guarantee: the visible world width IS the reaction time, so if it
// varied by device, a desktop player would see ~3 buildings of look-ahead and a phone player
// ~1 — a 2.6x difficulty gap on a shared leaderboard.
const WORLD_W = 480
const WORLD_H = 760
const BIRD_X = 132
const BIRD_W = 52
const BIRD_H = 38
const PIPE_W = 84
const GROUND_H = 80
const GROUND_Y = WORLD_H - GROUND_H // 680 — street level
const START_Y = 300
const GAP_MARGIN_TOP = 70 // gap never opens tighter than this to the top of the world
const GAP_MARGIN_BOTTOM = 30 // ...nor to the street
const MAX_GAP_DELTA = 130 // cap the vertical jump between consecutive gaps, so a run stays humanly playable
const HITBOX_FORGIVENESS = 1 // world units shaved off each side of the girl's box, server-side only

// Half the distance at which the girl's box and a building's box start to overlap.
const OVERLAP_HALF_W = (PIPE_W + BIRD_W) / 2
// How far building 1 travels before it reaches her (it enters at the right edge of the world).
const LEAD_IN = WORLD_W - BIRD_X + PIPE_W / 2

// ── Server-only guards ────────────────────────────────────────────────────────────────────
const FLAPPY_MIN_FLAP_INTERVAL_MS = 45 // two thumbs alternating is legitimate; this only bars superhuman rates
const MAX_FLAPS_HARD_CAP = 3000 // a human flaps ~2/s; 3000 covers a 900s run with generous headroom
const MAX_PIPES_HARD_CAP = 5000 // absolute DoS guard, independent of admin-configured maxScore
const GAP_CLEARANCE_MIN_PIPES = 12 // below this the stddev tell is noise
const GAP_CLEARANCE_STDDEV_FLOOR = 6 // world units

// Hard bounds for every admin-tunable value. The admin endpoint validates too, but it is only
// ONE of the write paths (migrations, seeds, psql, and the tile-image upsert all reach this
// row), and its `typeof x === 'number'` checks pass NaN. Anything that reaches the engine gets
// clamped here as well, including on the way back OUT of the Redis session at /end — the
// session blob is not more trustworthy than the row it came from.
const CFG_BOUNDS = {
  gravity: { min: 100, max: 5000, def: 1500 },
  flapVelocity: { min: -1200, max: -50, def: -440 },
  scrollSpeed: { min: 20, max: 1000, def: 200 },
  pipeGap: { min: 60, max: 600, def: 215 },
  pipeSpacing: { min: 120, max: 2000, def: 330 },
  speedGrowthPerPipe: { min: 0, max: 0.5, def: 0.02 },
  maxSpeedMultiplier: { min: 1, max: 5, def: 2 },
  maxScore: { min: 1, max: 100000, def: 500 },
  maxSessionSeconds: { min: 30, max: 1800, def: 900 }
}

function clampNum(value, { min, max, def }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, n))
}

/**
 * Normalize an admin-supplied (or Redis-round-tripped) config into something the engine can
 * safely run. Every field is finite and within bounds afterwards, so the replay cannot be
 * driven into a non-terminating loop or a NaN score by a bad row.
 */
export function sanitizeFlappyCfg(raw) {
  const cfg = {}
  for (const key of Object.keys(CFG_BOUNDS)) cfg[key] = clampNum(raw?.[key], CFG_BOUNDS[key])
  // A gap that cannot fit between the margins would make every run unwinnable.
  const maxUsableGap = GROUND_Y - GAP_MARGIN_BOTTOM - GAP_MARGIN_TOP
  cfg.pipeGap = Math.min(cfg.pipeGap, maxUsableGap)
  return cfg
}

// ── Deterministic per-building gap placement ──────────────────────────────────────────────
// FNV-1a over the session seed, then an integer avalanche mixed with the building index.
// Integer ops only, so the client reproduces it exactly.
export function hashSeed(pipeSeed) {
  let h = 0x811c9dc5
  const s = String(pipeSeed)
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function randFor(seedHash, n) {
  let h = (seedHash ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

/** Scroll speed once `n` buildings have spawned — ramps up, then plateaus. */
export function speedForPipe(n, cfg) {
  const growth = 1 + n * cfg.speedGrowthPerPipe
  return cfg.scrollSpeed * Math.min(growth, cfg.maxSpeedMultiplier)
}

/**
 * Gap centers for buildings 1..count, as a flat array (index 0 = building 1).
 * Sequential because each gap is clamped to within MAX_GAP_DELTA of the previous one.
 */
export function gapCentersFor(seedHash, count, cfg) {
  const half = cfg.pipeGap / 2
  const lo = GAP_MARGIN_TOP + half
  const hi = GROUND_Y - GAP_MARGIN_BOTTOM - half
  const out = new Array(count)
  let prev = (lo + hi) / 2
  for (let n = 1; n <= count; n++) {
    const raw = lo + randFor(seedHash, n) * (hi - lo)
    const bounded = Math.min(prev + MAX_GAP_DELTA, Math.max(prev - MAX_GAP_DELTA, raw))
    const centre = Math.min(hi, Math.max(lo, bounded))
    out[n - 1] = centre
    prev = centre
  }
  return out
}

/**
 * Arrival times (seconds) at which each building's center reaches BIRD_X.
 * Forward recurrence over the building index only — no search, no stepping.
 */
export function arrivalTimesFor(count, cfg) {
  const out = new Array(count)
  let t = LEAD_IN / speedForPipe(1, cfg)
  out[0] = t
  for (let n = 2; n <= count; n++) {
    t += cfg.pipeSpacing / speedForPipe(n, cfg)
    out[n - 1] = t
  }
  return out
}

// ── Flight path ───────────────────────────────────────────────────────────────────────────
// The path is a list of parabolic segments. Segment k starts at flap k with velocity reset to
// cfg.flapVelocity; segment 0 starts at t=0 falling from rest.
export function buildSegments(flapTimes, cfg) {
  const segs = [{ t0: 0, y0: START_Y, v0: 0 }]
  for (let i = 0; i < flapTimes.length; i++) {
    const t = flapTimes[i]
    const prev = segs[segs.length - 1]
    const d = t - prev.t0
    const y = prev.y0 + prev.v0 * d + 0.5 * cfg.gravity * d * d
    segs.push({ t0: t, y0: y, v0: cfg.flapVelocity })
  }
  return segs
}

function evalY(seg, t, g) {
  const d = t - seg.t0
  return seg.y0 + seg.v0 * d + 0.5 * g * d * d
}

/**
 * Time (seconds, absolute) at which this segment's parabola first reaches `targetY` on the way
 * down, or Infinity if it never does within [seg.t0, tEnd].
 * Solves 0.5*g*d^2 + v0*d + (y0 - target) = 0 for the positive root.
 */
function downwardCrossTime(seg, targetY, tEnd, g) {
  const c = seg.y0 - targetY
  const disc = seg.v0 * seg.v0 - 2 * g * c
  if (disc < 0) return Infinity
  const d = (-seg.v0 + Math.sqrt(disc)) / g
  if (d < 0) return Infinity
  const t = seg.t0 + d
  return t <= tEnd ? t : Infinity
}

/** Min and max y over [ta, tb] within one segment. The vertex is the minimum (y grows down). */
function yRange(seg, ta, tb, g) {
  const ya = evalY(seg, ta, g)
  const yb = evalY(seg, tb, g)
  let min = Math.min(ya, yb)
  const max = Math.max(ya, yb)
  const tv = seg.t0 - seg.v0 / g // apex: where vertical velocity is zero
  if (tv > ta && tv < tb) min = Math.min(min, evalY(seg, tv, g))
  return { min, max }
}

/**
 * Replay a run and return the authoritative result.
 *
 * `flapLog` is an array of integer millisecond timestamps (game time, monotonically
 * increasing, pause-excluded by the client). `pipeSeed` is the per-session seed handed out at
 * /start. `rawCfg` is the config snapshotted into the session — re-sanitized here on principle.
 *
 * Returns { score, gapClearanceStdDev, pipesScored }. Throws on malformed input.
 */
export function replayFlappyGame(flapLog, pipeSeed, rawCfg) {
  if (!Array.isArray(flapLog)) throw new Error('flapLog must be an array')
  if (flapLog.length > MAX_FLAPS_HARD_CAP) throw new Error('Flap log exceeds maximum')

  const cfg = sanitizeFlappyCfg(rawCfg)
  const g = cfg.gravity

  // Validate + convert to seconds. Timestamps are integer ms so both sides divide identically.
  const flapTimes = new Array(flapLog.length)
  let lastTs = null
  for (let i = 0; i < flapLog.length; i++) {
    const ts = flapLog[i]
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts < 0) throw new Error('Invalid flap timestamp')
    if (ts !== Math.floor(ts)) throw new Error('Flap timestamps must be whole milliseconds')
    if (lastTs !== null) {
      if (ts < lastTs) throw new Error('Flap timestamps must be monotonically increasing')
      if (ts - lastTs < FLAPPY_MIN_FLAP_INTERVAL_MS) throw new Error('Flaps submitted too fast')
    }
    lastTs = ts
    flapTimes[i] = ts / 1000
  }

  const segs = buildSegments(flapTimes, cfg)
  const streetY = GROUND_Y - (BIRD_H / 2 - HITBOX_FORGIVENESS)

  // ── Horizon: after the last flap she is on a pure downward parabola and MUST reach the
  // street, so the run's length is bounded by the submitted log, not by maxSessionSeconds.
  let deathByStreet = Infinity
  for (let k = 0; k < segs.length; k++) {
    const segEnd = k + 1 < segs.length ? segs[k + 1].t0 : Infinity
    const t = downwardCrossTime(segs[k], streetY, segEnd, g)
    if (t !== Infinity) { deathByStreet = t; break }
  }
  // A finite result is guaranteed (gravity is clamped positive), but never trust that blindly.
  if (!Number.isFinite(deathByStreet)) {
    deathByStreet = (flapTimes.length ? flapTimes[flapTimes.length - 1] : 0) + cfg.maxSessionSeconds
  }

  // ── Buildings, only as far as the run could possibly have reached ──
  const maxPipes = Math.min(cfg.maxScore + 1, MAX_PIPES_HARD_CAP)
  const arrivals = arrivalTimesFor(maxPipes, cfg)
  const gapCentres = gapCentersFor(hashSeed(pipeSeed), maxPipes, cfg)
  const halfGap = cfg.pipeGap / 2
  const halfBird = BIRD_H / 2 - HITBOX_FORGIVENESS

  let score = 0
  const clearances = []
  let segIdx = 0

  for (let n = 1; n <= maxPipes; n++) {
    const speed = speedForPipe(n, cfg)
    const arrive = arrivals[n - 1]
    const enter = arrive - OVERLAP_HALF_W / speed
    const exit = arrive + OVERLAP_HALF_W / speed

    // She hit the street before this building ever reached her — the run is over.
    if (enter > deathByStreet) break

    const gapTop = gapCentres[n - 1] - halfGap
    const gapBottom = gapCentres[n - 1] + halfGap

    // Walk the segments overlapping [enter, exit]. segIdx only moves forward across the whole
    // loop, so this is a two-pointer walk: O(buildings + flaps) total, not a nested scan.
    while (segIdx + 1 < segs.length && segs[segIdx + 1].t0 <= enter) segIdx++

    let hit = false
    for (let k = segIdx; k < segs.length; k++) {
      const segStart = segs[k].t0
      const segEnd = k + 1 < segs.length ? segs[k + 1].t0 : Infinity
      if (segStart >= exit) break
      const ta = Math.max(enter, segStart)
      const tb = Math.min(exit, segEnd)
      if (tb <= ta) continue
      const { min, max } = yRange(segs[k], ta, tb, g)
      if (min < gapTop + halfBird || max > gapBottom - halfBird) { hit = true; break }
    }
    if (hit) break

    // Cleared it. Record how far off the gap center she was — the human tell.
    let cross = segs[segs.length - 1]
    for (let k = segIdx; k < segs.length; k++) {
      const segEnd = k + 1 < segs.length ? segs[k + 1].t0 : Infinity
      if (arrive >= segs[k].t0 && arrive < segEnd) { cross = segs[k]; break }
    }
    clearances.push(Math.abs(evalY(cross, arrive, g) - gapCentres[n - 1]))

    // ...but only if she was still airborne when it passed her.
    if (exit > deathByStreet) break
    score++
  }

  return {
    score: Math.min(score, cfg.maxScore),
    pipesScored: score,
    gapClearanceStdDev: stdDev(clearances)
  }
}

function stdDev(values) {
  if (values.length < 2) return null
  let sum = 0
  for (let i = 0; i < values.length; i++) sum += values[i]
  const mean = sum / values.length
  let acc = 0
  for (let i = 0; i < values.length; i++) acc += (values[i] - mean) * (values[i] - mean)
  return Math.sqrt(acc / values.length)
}

/**
 * True when the run's gap crossings cluster far more tightly than a human's would. Advisory —
 * callers flag rather than reject, since a bot that adds scatter defeats it (at the cost of
 * real score).
 */
export function hasSolverClustering(result) {
  if (result.pipesScored < GAP_CLEARANCE_MIN_PIPES) return false
  if (result.gapClearanceStdDev === null) return false
  return result.gapClearanceStdDev < GAP_CLEARANCE_STDDEV_FLOOR
}

export {
  WORLD_W,
  WORLD_H,
  BIRD_X,
  BIRD_W,
  BIRD_H,
  PIPE_W,
  GROUND_H,
  GROUND_Y,
  START_Y,
  GAP_MARGIN_TOP,
  GAP_MARGIN_BOTTOM,
  MAX_GAP_DELTA,
  LEAD_IN,
  FLAPPY_MIN_FLAP_INTERVAL_MS,
  MAX_FLAPS_HARD_CAP,
  MAX_PIPES_HARD_CAP
}
