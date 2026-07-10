// Server-only Tower Stack game engine. Never import this from pages/ or components/.
//
// Game model: classic "Stack"-style tapping game.
//  - Layer 0 is the fixed base block, centered at (x:0, z:0), width `baseWidth` on both axes.
//  - Each subsequent layer n>=1 has a block that slides back and forth along ONE axis —
//    alternating X/Z by parity of n (deterministic, not random, matching the reference game).
//  - The player taps to drop the moving block. The block's footprint on the trim axis is
//    intersected with the block below; anything hanging off is cut away. If there is no
//    overlap at all, the drop misses and the run ends.
//  - A near-perfect tap (within `perfectEpsilon` of dead center) is NOT trimmed at all, so
//    a precise player can hold a wide tower indefinitely — this is a stability mechanic,
//    not a scoring bonus (score is always +1 per successful drop; see product decision).
//  - Movement is pure deterministic math (no PRNG) EXCEPT for a per-session phase/speed jitter
//    derived from a per-session `jitterSeed` — see `deriveJitter`.
//
// Anti-cheat: the authoritative score is recomputed here by replaying the client's tap
// timestamps against the exact same deterministic physics, server-side. The client can draw
// whatever it wants; only a replay that survives `replayTowerGame` counts.
//
// On the jitter seed: the client MUST know the exact same phase/speed jitter the server uses
// in order to render the moving block's true motion in real time (same constraint as
// reorbitMatchEngine's fillSeed) — so it cannot be a secret withheld from the client. What it
// buys us instead is per-session uniqueness: `jitterSeed` is a fresh random value handed to
// the client at /start (like fillSeed) and stored in the session for replay at /end. This
// defeats a *static* exploit — solving the optimal tap sequence once from public GameConfig
// constants and replaying/sharing it forever across every session — because the jitter differs
// every game. It does NOT, on its own, stop a bot that re-derives the optimal sequence fresh
// each session from the /start response before ever rendering a frame; that ceiling is the
// same one ReOrbit Match already accepts (its board + fillSeed are equally solvable offline),
// and is further narrowed here by TOWER_MIN_MOVE_INTERVAL_MS and `hasRoboticCadence` below.

const TOWER_MIN_MOVE_INTERVAL_MS = 150 // no legitimate human sustains a faster tap-to-tap cadence
const MAX_LAYERS_HARD_CAP = 2000 // absolute DoS guard, independent of admin-configured towerMaxLayers

// Shared "world unit" constants — not admin-configurable (they're a coordinate-system choice,
// not a difficulty knob), so they live here rather than in GameConfig. The client uses the
// same values purely to scale its isometric rendering; the server never trusts anything the
// client says about them.
const BASE_WIDTH = 100
const BOARD_HALF_RANGE = 60

// Deterministic per-session jitter derived from `jitterSeed` (a random hex string generated
// fresh at /start and shared with the client, same trust model as fillSeed). Perturbs phase
// and speed slightly per session — see the file header for what this does and doesn't defend.
function deriveJitter(jitterSeed) {
  // FNV-1a style fold of the hex seed into two independent [0,1) floats.
  let h1 = 0x811c9dc5, h2 = 0x1000193
  for (let i = 0; i < jitterSeed.length; i++) {
    const c = jitterSeed.charCodeAt(i)
    h1 = (h1 ^ c) >>> 0; h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 = (h2 ^ c) >>> 0; h2 = Math.imul(h2, 0x85ebca6b) >>> 0
  }
  const phaseJitter = (h1 >>> 0) / 4294967296        // [0,1)
  const speedJitter  = (h2 >>> 0) / 4294967296        // [0,1)
  return {
    phaseFrac: phaseJitter,                            // fraction of one traversal period
    speedMult: 0.92 + speedJitter * 0.16                // ±8% speed multiplier
  }
}

// Deterministic speed for layer n, given base config + session jitter.
function layerSpeed(n, cfg, jitter) {
  const growth = Math.min(1 + n * cfg.speedGrowthPerLayer, cfg.maxSpeedMultiplier)
  return cfg.baseSpeed * growth * jitter.speedMult
}

// Triangle wave in [-amplitude, amplitude], deterministic function of elapsed seconds since
// the layer started. Reflects at the edges (constant-speed back-and-forth motion).
function triangleWave(tSeconds, speed, amplitude, phaseOffsetSeconds) {
  const period = (4 * amplitude) / speed // full back-and-forth cycle
  let phase = ((tSeconds + phaseOffsetSeconds) % period + period) % period
  const quarter = period / 4
  if (phase < quarter) return (phase / quarter) * amplitude
  // Middle leg spans 2*quarter (from +amplitude down to -amplitude), so the slope is
  // amplitude/quarter, not 2*amplitude/quarter -- the old extra "* 2" here made the block
  // swing past the board edge (up to 3x amplitude) before snapping back once phase crossed
  // into the next leg, which is what caused the visible "pull back" glitch on new blocks.
  if (phase < 3 * quarter) return amplitude - ((phase - quarter) / quarter) * amplitude
  return -amplitude + ((phase - 3 * quarter) / quarter) * amplitude
}

// Center position of the moving block for layer n at elapsed seconds `tSeconds` since that
// layer began. Axis alternates by parity of n. Each layer's block must ENTER already at the
// board edge and slide toward the opposite edge -- never drift outward first -- so the phase
// offset is anchored to a triangleWave turning point (quarter/3*quarter), not an arbitrary
// fraction of the period. Which edge it enters from alternates by layer parity (deterministic,
// matches the reference game's left/right/left/right entrance pattern); the per-session jitter
// only decides which side layer 1 starts from, preserving jitter's anti-cheat role (see file
// header) without letting it place the block mid-swing at the start of a layer.
function movingCenterAt(n, tSeconds, cfg, jitter) {
  const speed = layerSpeed(n, cfg, jitter)
  const amplitude = cfg.boardHalfRange
  const period = (4 * amplitude) / speed
  const quarter = period / 4
  const startsPositive = (jitter.phaseFrac < 0.5) === (n % 2 === 1)
  const phaseOffset = startsPositive ? quarter : 3 * quarter
  return triangleWave(tSeconds, speed, amplitude, phaseOffset)
}

function axisForLayer(n) { return n % 2 === 1 ? 'x' : 'z' }

// Apply one tap. `rect` is the current placed footprint {xCenter,xWidth,zCenter,zWidth}.
// Returns { hit:boolean, rect: newRect } — `hit:false` means the drop missed entirely.
function applyDrop(n, tSeconds, rect, cfg, jitter) {
  const axis = axisForLayer(n)
  const movingCenter = movingCenterAt(n, tSeconds, cfg, jitter)
  const prevCenter = axis === 'x' ? rect.xCenter : rect.zCenter
  const prevWidth   = axis === 'x' ? rect.xWidth  : rect.zWidth

  if (Math.abs(movingCenter - prevCenter) <= cfg.perfectEpsilon) {
    // Perfect: no trim, footprint unchanged.
    return { hit: true, rect: { ...rect } }
  }

  const prevMin = prevCenter - prevWidth / 2
  const prevMax = prevCenter + prevWidth / 2
  const curMin = movingCenter - prevWidth / 2
  const curMax = movingCenter + prevWidth / 2
  const overlapMin = Math.max(prevMin, curMin)
  const overlapMax = Math.min(prevMax, curMax)
  const overlapWidth = overlapMax - overlapMin

  if (overlapWidth <= 0) return { hit: false, rect }

  const newCenter = (overlapMin + overlapMax) / 2
  const newRect = { ...rect }
  if (axis === 'x') { newRect.xCenter = newCenter; newRect.xWidth = overlapWidth }
  else { newRect.zCenter = newCenter; newRect.zWidth = overlapWidth }
  return { hit: true, rect: newRect }
}

// Replay the entire game from a tap-timestamp log. `moveLog` is [{ ts }] — one entry per
// successful drop, in the order they happened. `jitterSeed` is the per-session seed handed to
// the client at /start (see file header). `cfg` are the physics constants snapshotted into the
// session at /start. Throws on malformed input. Returns the authoritative score (= number of
// successful, in-order, correctly-paced drops), stopping at (and not counting) the first miss
// it detects, exactly as a real run would.
function replayTowerGame(moveLog, jitterSeed, cfg) {
  if (!Array.isArray(moveLog)) throw new Error('moveLog must be an array')
  const maxLayers = Math.min(cfg.maxLayers ?? MAX_LAYERS_HARD_CAP, MAX_LAYERS_HARD_CAP)
  if (moveLog.length > maxLayers) throw new Error('Move log exceeds maximum layers')

  const jitter = deriveJitter(jitterSeed)
  let rect = {
    xCenter: 0, xWidth: cfg.baseWidth,
    zCenter: 0, zWidth: cfg.baseWidth
  }
  let lastTs = null
  let score = 0

  for (let i = 0; i < moveLog.length; i++) {
    const move = moveLog[i]
    const ts = move?.ts
    if (typeof ts !== 'number' || !Number.isFinite(ts)) throw new Error('Invalid move timestamp')
    if (lastTs !== null) {
      if (ts < lastTs) throw new Error('Move timestamps must be monotonically increasing')
      if (ts - lastTs < TOWER_MIN_MOVE_INTERVAL_MS) throw new Error('Moves submitted too fast')
    }
    lastTs = ts

    const n = i + 1 // layer index; layer 0 is the fixed base
    // Elapsed seconds since THIS layer began sliding: the layer starts the instant the
    // previous layer's drop resolved, i.e. at the previous move's ts (or game start for n=1).
    const layerStartTs = i === 0 ? 0 : moveLog[i - 1].ts
    const tSeconds = Math.max(0, ts - layerStartTs) / 1000

    const { hit, rect: newRect } = applyDrop(n, tSeconds, rect, cfg, jitter)
    if (!hit) break // miss ends the run; this tap does not score
    rect = newRect
    score++
  }

  return score
}

// Tap-cadence anomaly check: reject move logs whose inter-tap intervals are suspiciously
// uniform (near-zero variance), which is characteristic of a scripted/replayed log rather
// than human timing. Requires at least a handful of taps to be meaningful.
function hasRoboticCadence(moveLog, { minSamples = 6, stdDevFloorMs = 12 } = {}) {
  if (!Array.isArray(moveLog) || moveLog.length < minSamples) return false
  const intervals = []
  for (let i = 1; i < moveLog.length; i++) intervals.push(moveLog[i].ts - moveLog[i - 1].ts)
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
  const stdDev = Math.sqrt(variance)
  return stdDev < stdDevFloorMs
}

export {
  deriveJitter,
  layerSpeed,
  movingCenterAt,
  axisForLayer,
  applyDrop,
  replayTowerGame,
  hasRoboticCadence,
  TOWER_MIN_MOVE_INTERVAL_MS,
  MAX_LAYERS_HARD_CAP,
  BASE_WIDTH,
  BOARD_HALF_RANGE
}
