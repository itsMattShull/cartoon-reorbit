// Server-only anti-cheat wrapper around the shared Fruit Samurai simulation.
// Never import this from pages/ or components/ — import lib/fruitSamuraiSim.js instead, which
// is the pure, secret-free simulation both sides run. The thresholds in THIS file are
// deliberately not shared: shipping them in the client bundle would tell a bot exactly which
// limits to stay under.
//
// ── THREAT MODEL ──────────────────────────────────────────────────────────────────────────
// The authoritative score is recomputed here by replaying the player's stroke log against the
// same deterministic simulation the browser ran. The client's reported score is display only
// and is never trusted. Same model as towerStackEngine.js and asteroidEngine.js.
//
// What that buys, and what it does NOT:
//
//  * A hand-edited score is worthless — /end ignores whatever the client claims.
//  * A previously "solved" stroke log cannot be replayed, because the world is generated from
//    a per-session `runSeed` that is fresh every /start and stored server-side.
//  * It does NOT stop a bot that derives a good stroke log from the /start response before
//    rendering a frame. That is the same ceiling Tower Stack, Asteroid and Flappy accept. What
//    narrows it is the wall-clock gate below: a run claiming N ticks must have taken at least
//    MIN_REALTIME_RATIO * N/60 seconds of real time since /start, so botting costs the same
//    wall-clock time as playing, which also removes the CPU-amplification angle.
//
// That ceiling is cheap to accept because points are FLAT per ranked play (see
// gamePoints.js / the /end handler): a perfect bot and a player who scores 30 earn identical
// points, so a forged score buys leaderboard vanity and nothing economic.
//
// ── Why the wall-clock gate needs an UPPER bound here, unlike Asteroid ────────────────────
// asteroidEngine.js:44 makes MIN_REALTIME_RATIO deliberately one-sided — too fast is rejected,
// too slow is always fine — because a player who backgrounds the tab or takes a phone call
// must never lose a legitimate run, and playing Asteroid in slow motion is self-defeating.
//
// Fruit Samurai breaks that second assumption. Slow motion is a DESIGNED mechanic here (the
// hourglass), implemented as renderer pacing, so a modified client can simply pace its
// accumulator at 6Hz and get ten real seconds of planning per tick with the one-sided gate
// waving it through. MAX_SESSION_SECONDS caps that: it bounds the achievable slowdown to
// roughly 3x rather than leaving it unbounded. It is a rail, not a scoring rule — an honest
// run cannot reach it, because MAX_TICKS ends the run first at normal pacing.
import {
  TICK_HZ,
  COORD_MARGIN,
  clampSampleX,
  clampSampleY,
  normalizeConfig,
  hashSeed,
  simulate
} from '../../lib/fruitSamuraiSim.js'

// A run is capped at 5 minutes of simulated time. This bounds the replay cost of one /end
// request and is an anti-abuse rail rather than the intended ending: the uncapped wave
// escalation in the sim means every honest run ends in a death well before this.
export const MAX_TICKS = 5 * 60 * TICK_HZ // 18,000

// One entry per pointer-down..pointer-up. Measured against simulated play, an aggressive
// player producing a stroke every ~6 ticks for a full five-minute run lands near 3,000.
export const MAX_STROKES = 3000

// Samples across ALL strokes. The client records at most one per tick, so a run that held the
// pointer down for every one of MAX_TICKS ticks would produce 18,000; 12,000 is the practical
// ceiling for a run that ever lifts a finger, and it bounds the request body.
export const MAX_SAMPLES = 12000

// COORD_MARGIN and the clamp helpers now live in lib/fruitSamuraiSim.js, because the client
// has to apply exactly the same bound as it records. Re-exported so existing importers of this
// module keep working.
export { COORD_MARGIN }

// A run claiming N ticks must have taken at least this fraction of N/60 seconds of real time.
// 0.75 leaves headroom for clock skew, a slow /start round trip, and rAF throttling.
export const MIN_REALTIME_RATIO = 0.75

// Upper bound on a session's real duration. See the note above on why this exists here and
// not in asteroidEngine.js.
export const MAX_SESSION_SECONDS = 900

/**
 * Re-normalize a config that has been round-tripped through Redis. The session blob is no more
 * trustworthy than the GameConfig row it was built from — an admin edit, a migration, a seed
 * or a psql session can all reach that row, and `typeof x === 'number'` passes NaN.
 */
export function sanitizeFruitSamuraiCfg(raw) {
  return normalizeConfig(raw)
}

/**
 * Validate the raw request body's stroke log. Throws on anything malformed — the replay must
 * never see attacker-shaped data. Returns a freshly-allocated log so that prototype pollution
 * or accessor properties on the parsed JSON cannot leak into the simulation.
 */
export function sanitizeStrokes(raw) {
  if (!Array.isArray(raw)) throw new Error('strokes must be an array')
  if (raw.length > MAX_STROKES) throw new Error('stroke count exceeds maximum')

  const out = []
  let totalSamples = 0
  let prevStrokeEnd = 0

  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]
    if (s === null || typeof s !== 'object' || Array.isArray(s)) {
      throw new Error(`strokes[${i}] is not an object`)
    }
    const t = s.t
    if (typeof t !== 'number' || !Number.isInteger(t)) throw new Error(`strokes[${i}].t must be an integer`)
    if (t < 1 || t > MAX_TICKS) throw new Error(`strokes[${i}].t out of range`)

    const p = s.p
    if (!Array.isArray(p)) throw new Error(`strokes[${i}].p must be an array`)
    if (p.length < 3 || p.length % 3 !== 0) throw new Error(`strokes[${i}].p has a bad length`)

    const samples = p.length / 3
    totalSamples += samples
    if (totalSamples > MAX_SAMPLES) throw new Error('sample count exceeds maximum')

    // Strokes must be disjoint and totally ordered. The client tracks a single active pointer
    // (a second finger is ignored until the first lifts), so overlapping strokes are not
    // something an honest client can produce — and allowing them would leave the order in
    // which two simultaneous blades resolve within a tick undefined, on top of doubling the
    // achievable combo rate.
    if (t <= prevStrokeEnd) throw new Error(`strokes[${i}] overlaps the previous stroke`)

    const cleanP = new Array(p.length)
    let lastDt = -1
    for (let j = 0; j < p.length; j += 3) {
      const dt = p[j]
      const x = p[j + 1]
      const y = p[j + 2]
      if (typeof dt !== 'number' || !Number.isInteger(dt)) throw new Error(`strokes[${i}].p dt must be an integer`)
      if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`strokes[${i}].p x must be an integer`)
      if (typeof y !== 'number' || !Number.isInteger(y)) throw new Error(`strokes[${i}].p y must be an integer`)
      if (j === 0 && dt !== 0) throw new Error(`strokes[${i}] must start at dt 0`)
      // Non-decreasing rather than strictly increasing: the client may record more than one
      // sample in a tick on a high-refresh display, and those resolve as consecutive segments
      // within that tick in array order.
      if (dt < lastDt) throw new Error(`strokes[${i}].p dt must not decrease`)
      if (dt < 0) throw new Error(`strokes[${i}].p dt must not be negative`)
      if (t + dt > MAX_TICKS) throw new Error(`strokes[${i}] runs past the tick limit`)
      lastDt = dt
      cleanP[j] = dt
      // Clamped, not rejected.
      //
      // This used to throw, and that was a bug with real teeth: following a swipe off the edge
      // of the board is ordinary play, the captured pointer keeps reporting positions far
      // outside the world, and one such sample failed the whole submission. The player lost an
      // entire run — and, because the play is recorded at /start, a ranked attempt with it.
      //
      // The client now clamps as it records, so for a current client this is a no-op. For a
      // client still running the old bundle it reconstructs the sample that a fixed client
      // would have sent, which is a far better answer than destroying the run. Rejection is
      // reserved for things no client should ever produce: non-integers, NaN, Infinity.
      cleanP[j + 1] = clampSampleX(x)
      cleanP[j + 2] = clampSampleY(y)
    }

    prevStrokeEnd = t + lastDt
    out.push({ t, p: cleanP })
  }

  return out
}

// ── Why there is no "that looks like a solver" heuristic here ─────────────────────────────
// Flappy scores a gap-clearance standard deviation and Tower Stack rejects suspiciously
// uniform tap intervals. The obvious analogue here would be blade-accuracy clustering: a
// solver drives through the exact centre of every fruit while a human scatters.
//
// It is not worth having. asteroidEngine.js:88-99 documents measuring exactly this class of
// check and finding no threshold that separates a bot from a human — its earlier 2.5-tick
// cadence floor flagged 40 out of 40 simulated human runs. The same trap applies here and
// worse: generous hitboxes (SLICE_FORGIVENESS) mean a competent human's cuts cluster near
// centre too, while a bot defeats the check by adding scatter in one line. A false positive
// costs a real player their run; the check catches nothing a determined attacker can't evade.
//
// The counters returned below (slices, misses, booms, strokeCount, ticks) are the honest
// signal: they are exact, they cost nothing, and admin tooling can look at the ratios without
// this file pretending they constitute proof of anything.

/**
 * Replay a run and return the authoritative result.
 *
 * `elapsedMs` is real wall-clock time between /start and /end, measured server-side from the
 * Redis session — the client has no say in it.
 *
 * Returns { score, ticks, lives, slices, misses, booms, tooFast, tooSlow }. Throws on
 * malformed input.
 */
export function replayFruitSamuraiGame({ runSeed, cfg, strokes, elapsedMs }) {
  const clean = sanitizeStrokes(strokes)
  const safeCfg = sanitizeFruitSamuraiCfg(cfg)

  const state = simulate(hashSeed(runSeed), safeCfg, clean, MAX_TICKS)

  const ticks = state.tick
  const requiredMs = (ticks / TICK_HZ) * 1000 * MIN_REALTIME_RATIO
  const tooFast = elapsedMs + 1000 < requiredMs
  const tooSlow = elapsedMs > MAX_SESSION_SECONDS * 1000

  let slices = 0
  let misses = 0
  let booms = 0
  for (let i = 0; i < state.events.length; i++) {
    const e = state.events[i]
    if (e.e === 'slice') slices++
    else if (e.e === 'miss') misses++
    else if (e.e === 'boom') booms++
  }

  return {
    score: state.score,
    ticks,
    lives: state.lives,
    over: state.over,
    slices,
    misses,
    booms,
    strokeCount: clean.length,
    tooFast,
    tooSlow
  }
}
