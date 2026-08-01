// Server-only anti-cheat wrapper around the shared Operation A.S.T.E.R.O.I.D. simulation.
// Never import this from pages/ or components/ — import lib/asteroidSim.js instead, which is
// the pure, secret-free simulation both sides run.
//
// ── THREAT MODEL ────────────────────────────────────────────────────────────────────────────
// The authoritative score is recomputed HERE by replaying the player's input log against the
// exact same deterministic simulation the browser ran. The client's reported score is display
// only and is never trusted. This is the same model as towerStackEngine.js, extended to a
// continuous-physics game.
//
// What that buys, and what it does NOT:
//
//  * A hand-edited score is worthless — /end ignores whatever the client claims.
//  * A previously "solved" input log cannot be replayed, because the world is generated from a
//    per-session `runSeed` that is fresh every /start and stored server-side.
//  * It does NOT stop a bot that re-derives a good input log offline from the /start response
//    before rendering a frame. That is the same ceiling Tower Stack and ReOrbit Match already
//    accept. What narrows it here is the wall-clock gate below: a submitted run claiming N
//    simulated ticks must have taken at least MIN_REALTIME_RATIO * N ticks of REAL time since
//    /start. A bot cannot compress a five-minute run into a five-second request, so botting
//    costs the same wall-clock time as playing — which also removes the CPU-amplification
//    angle, since each ~130ms replay requires minutes of real waiting to trigger.
//
// The wall-clock gate is deliberately one-sided (too fast is rejected, too slow is fine): a
// player who backgrounds the tab, takes a phone call, or plays on a device that throttles
// rAF must never lose a legitimate run.

import { WORLD_W, WORLD_H, TICK_HZ, IN_LEFT, IN_RIGHT, IN_THRUST, simulate } from '../../lib/asteroidSim.js'

// A run is capped at 5 minutes of simulated time. This bounds the replay cost of a single
// /end request (~130ms worst case, measured with every difficulty knob maxed) and gives the
// game a natural "you survived the full mission" ending rather than an unbounded grind.
export const MAX_TICKS = 5 * 60 * TICK_HZ // 18,000

// One entry per change of the held input bitmask. Measured against simulated play, a fast
// player tapping ~8 times a second for a full five-minute run produces around 4,800 entries, so
// a cap anywhere near that would reject real experts. 12,000 leaves better than 2x headroom
// while still bounding the request body and the replay's cursor walk.
export const MAX_INPUT_EVENTS = 12000

// Ticks may not repeat or go backwards, and two changes cannot land on the same tick.
export const MIN_TICK_GAP = 1

// A run claiming N ticks must have taken at least this fraction of N/60 seconds of real time.
// 0.75 leaves generous headroom for clock skew, a slow /start round trip, and rAF throttling.
export const MIN_REALTIME_RATIO = 0.75

const VALID_MASK = IN_LEFT | IN_RIGHT | IN_THRUST

/**
 * Validates the raw request body's input log. Throws on anything malformed — the replay must
 * never see attacker-shaped data. Returns a clean, freshly-allocated log so that prototype
 * pollution or accessor properties on the parsed JSON cannot leak into the simulation.
 */
export function sanitizeInputLog(raw) {
  if (!Array.isArray(raw)) throw new Error('inputLog must be an array')
  if (raw.length > MAX_INPUT_EVENTS) throw new Error('inputLog exceeds maximum length')

  const out = []
  let lastTick = 0
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      throw new Error(`inputLog[${i}] is not an object`)
    }
    const t = e.t
    const a = e.a
    if (typeof t !== 'number' || !Number.isFinite(t) || !Number.isInteger(t)) {
      throw new Error(`inputLog[${i}].t must be an integer`)
    }
    if (typeof a !== 'number' || !Number.isFinite(a) || !Number.isInteger(a)) {
      throw new Error(`inputLog[${i}].a must be an integer`)
    }
    if (t < 1 || t > MAX_TICKS) throw new Error(`inputLog[${i}].t out of range`)
    if (t < lastTick + MIN_TICK_GAP) throw new Error(`inputLog[${i}].t must strictly increase`)
    // Reject unknown bits outright rather than masking them off, so a client sending garbage
    // is a hard error instead of a silently-different run than the one the player saw.
    if ((a & ~VALID_MASK) !== 0) throw new Error(`inputLog[${i}].a has unknown bits`)
    lastTick = t
    out.push({ t, a })
  }
  return out
}

/**
 * Descriptive statistics for a log's input cadence, reported alongside the score so admin
 * tooling can look for outliers. It is NOT a gate — see below.
 *
 * Tower Stack rejects runs whose tap intervals are suspiciously uniform. That check does not
 * transfer to this game, and measuring it showed why: input here is recorded in 60Hz TICKS, and
 * quantising to whole ticks injects roughly half a tick of variance into any cadence at all. A
 * perfect metronome at 8 presses/second measures a gap standard deviation of ~0.43 ticks, while
 * a human expert at the same rate measures ~0.59 and a relaxed human ~1.28 — the bot sits
 * comfortably inside the human range, so no threshold separates them. An earlier version of
 * this file used a 2.5-tick floor and flagged 40 out of 40 simulated human runs, including a
 * calm 1.5-presses-per-second player.
 *
 * Since a false positive destroys a legitimate player's score and the check cannot actually
 * identify a bot, it does not reject anything. The wall-clock gate in replayAsteroidGame is the
 * real constraint on automated play.
 */
export function inputCadenceStats(log) {
  if (!Array.isArray(log) || log.length < 2) return { samples: 0, meanGap: 0, stdDevGap: 0 }
  const gaps = []
  for (let i = 1; i < log.length; i++) gaps.push(log[i].t - log[i - 1].t)
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length
  return { samples: gaps.length, meanGap: mean, stdDevGap: Math.sqrt(variance) }
}

/**
 * Replays a run and returns the authoritative result.
 *
 * `elapsedMs` is real wall-clock time between /start and /end, measured server-side from the
 * Redis session — the client has no say in it.
 */
export function replayAsteroidGame({ seedInt, cfg, inputLog, elapsedMs }) {
  const log = sanitizeInputLog(inputLog)

  const state = simulate(seedInt, cfg, log, MAX_TICKS)

  // Wall-clock gate. `state.tick` is how many ticks the run actually lasted before the ship ran
  // out of lives (or hit MAX_TICKS), which is the honest measure of how long the player played.
  const simulatedMs = (state.tick / TICK_HZ) * 1000
  if (elapsedMs + 1500 < simulatedMs * MIN_REALTIME_RATIO) {
    throw new Error('Run submitted faster than it could have been played')
  }

  return {
    score: Math.max(0, Math.floor(state.score)),
    ticks: state.tick,
    wave: state.wave,
    finished: state.over,
    inputEvents: log.length,
    // Reported, never enforced — see inputCadenceStats for why.
    cadence: inputCadenceStats(log)
  }
}

export { WORLD_W, WORLD_H, TICK_HZ }
