// Fruit Samurai — the pure, secret-free simulation that BOTH the browser and the server run.
//
// Import this from pages/ and from server/utils/fruitSamuraiEngine.js. It contains no
// anti-cheat thresholds and no admin-only knobs, so shipping it in the client bundle costs
// nothing; everything a bot could exploit lives in the server-only engine that wraps it.
//
// ── Why one shared module instead of two hand-written copies ───────────────────────────────
// Flappy Powerpuff duplicates its physics by hand (see the note at the top of
// server/utils/flappyPowerpuffEngine.js) and gets away with it because a disagreement there
// can only end the run early. This game cannot: a slice MUTATES shared world state. It removes
// an object, advances the stroke's combo counter, and changes what a dynamite blast two
// seconds later will catch. One borderline cut resolved differently on the two sides cascades
// into a score that differs by hundreds. So the two sides must run the same code, not merely
// equivalent code.
//
// That same argument is why this file does NOT copy flappyPowerpuffEngine's HITBOX_FORGIVENESS
// trick. There, the server deliberately uses a slightly kinder hitbox than the client, on the
// principle that the server may agree with the player or be generous but never stricter. That
// asymmetry is safe only because a Flappy collision is terminal — it can shorten a run, never
// fork it. Here an asymmetric hitbox is exactly how you get the unforgivable bug where a player
// watches their score reach 800 and is told 640. Hitboxes here are generous (SLICE_FORGIVENESS
// below) but IDENTICALLY generous on both sides. Do not add a server-side leniency margin.
//
// ── Float determinism ─────────────────────────────────────────────────────────────────────
// Every value that can affect the score is a JS integer, and every operation on one is
// +, -, *, /, %, <<, >>, comparison, Math.imul, Math.floor, Math.round or Math.min/max — all
// of which ECMA-262 specifies exactly, so every engine agrees bit for bit. In particular:
//
//   * Positions and velocities are FIXED-POINT integers in 1/256 of a world unit (FP below),
//     so `vy += g; y += vy` is exact integer arithmetic with zero accumulation drift.
//   * The segment/circle intersection test is cross-multiplied — no division, no Math.sqrt.
//     `Math.sqrt` is correctly rounded everywhere real, but there is no reason to depend on it.
//   * Distances are compared SQUARED (MIN_SLICE_DIST2, not MIN_SLICE_DISTANCE).
//   * Random draws take raw uint32s and use `%`, never `Math.floor(rng() * n)` on a float.
//
// Math.pow, Math.exp, Math.sin, and `**` with a non-integer exponent are "implementation-
// approximated" by the spec and MUST NOT be introduced here.
//
// ── Cosmetic randomness ───────────────────────────────────────────────────────────────────
// The juice splatter, blade shimmer and Jack's speech lines are client-only decoration. They
// MUST draw from their own Math.random(), never from st.rng. Every draw from st.rng advances a
// stream the server replays; one extra cosmetic draw on the client desynchronises every spawn
// that follows it. Nothing outside this file may touch st.rng.

// ── World geometry (a coordinate-system choice, not a difficulty knob — not admin-tunable) ──
// A FIXED 480x760 portrait world, letterboxed into whatever viewport the player has, for the
// same fairness reason flappyPowerpuffEngine.js documents: the visible world IS the reaction
// time and the reachable area, so if it varied by device a desktop player and a phone player
// would be playing measurably different games on one shared leaderboard.
export const WORLD_W = 480
export const WORLD_H = 760
export const TICK_HZ = 60

// Fixed-point scale for positions and velocities. A power of two so the conversion back to
// world units is an exact shift.
export const FP = 256
export const FP_SHIFT = 8

// Object kinds. Integers rather than strings so the sim never does string comparison in a hot
// loop and a forged value cannot smuggle a property name anywhere.
export const K_FRUIT = 0
export const K_PIGGY = 1
export const K_HOURGLASS = 2
export const K_DYNAMITE = 3

// ── Fruit table ───────────────────────────────────────────────────────────────────────────
// The invariant, deliberately: SMALLER and FASTER is worth MORE. `r` is the drawn radius;
// `hit` is r + SLICE_FORGIVENESS and is what the sim actually tests, on both sides.
//
// The point spread is intentionally narrow (10..28, not 10..50). A dragonfruit worth five
// watermelons sounds exciting but creates no decision — missing anything costs a life, so you
// can never choose to ignore the cheap fruit. All a wide spread does is let seed luck decide
// leaderboard placement. The differentiation the player actually controls is the combo, so
// that is where the scoring weight lives (see COMBO below).
//
// `speedPct` scales the launch velocity AND (as its square) the fruit's gravity, which keeps
// the apex identical and shortens the flight instead. Scaling velocity alone would throw fast
// fruit clean out of the top of the world.
export const FRUIT_TYPES = [
  { key: 'watermelon', points: 10, r: 36, weight: 26, speedPct: 90 },
  { key: 'apple', points: 12, r: 26, weight: 24, speedPct: 100 },
  { key: 'orange', points: 14, r: 24, weight: 20, speedPct: 105 },
  { key: 'banana', points: 16, r: 22, weight: 15, speedPct: 110 },
  { key: 'pineapple', points: 20, r: 20, weight: 10, speedPct: 120 },
  { key: 'dragonfruit', points: 28, r: 16, weight: 5, speedPct: 135 }
]
const FRUIT_WEIGHT_TOTAL = FRUIT_TYPES.reduce((a, t) => a + t.weight, 0) // 100

export const POWERUP_KINDS = [K_PIGGY, K_HOURGLASS, K_DYNAMITE]

// ── Slice geometry ────────────────────────────────────────────────────────────────────────
// Added to every drawn radius, identically on both sides. Generosity is invisible under a
// juice splatter; stinginess is infuriating, because the player watches the blade cross the
// fruit and nothing happens.
export const SLICE_FORGIVENESS = 6

// The blade must be MOVING to cut. Without this you could rest a finger on the screen and let
// fruit fall onto it. Squared, because distances are never square-rooted here.
export const MIN_SLICE_DIST2 = 36 // 6 world units

// A blade segment spanning more than this many ticks does not cut.
//
// This is the fix for a real exploit, not a tidiness rule. Press the finger down, background
// the tab (or let the phone lock, or eat a long GC pause), come back 30 seconds later and move
// — the stroke is still open, so the next sample joins to the last one and the connecting
// segment is a chord clean across the world that harvests everything on it. That is precisely
// the "lift and re-press somewhere else" attack that explicit stroke boundaries exist to
// prevent, sneaking back in through a stroke that never ended. Segments wider than this gap
// are skipped, and they break the combo, because they are not one continuous swipe.
export const MAX_SAMPLE_GAP_TICKS = 6

// How far below the bottom edge a fruit falls before it counts as missed. The client MUST draw
// this band; otherwise the player sees a fruit vanish and loses a life several ticks later.
export const MISS_MARGIN = 24

// Concurrency rails. NOT admin-tunable: they bound the server's replay cost and they are part
// of the fairness contract, so an admin cannot make one player's run cheaper or harder to
// replay than another's.
export const MAX_LIVE_FRUIT = 14
export const MAX_LIVE_POWERUPS = 1
export const MAX_MULTIPLIER = 8

// ── Combo ─────────────────────────────────────────────────────────────────────────────────
// Awarded PER SLICE, to the Nth object cut in a single stroke for N >= COMBO_MIN, rather than
// as a lump sum when the stroke ends. Three reasons: every point in the game is then
// attributable to one specific tick (so "which tick's multiplier applies" has an answer), a
// stroke still open when the run ends needs no special case, and the player sees +15/+30/+45
// pop as they cut instead of one delayed total.
export const COMBO_MIN = 3
export const COMBO_STEP = 15
export const COMBO_MAX_COUNT = 8

// ── Config ────────────────────────────────────────────────────────────────────────────────
// Everything here is admin-tunable and therefore everything here is clamped. The server clamps
// again on the way out of the Redis session (see fruitSamuraiEngine.js) — a session blob is no
// more trustworthy than the row it was built from.
//
// Note what is NOT here: any notion of a time scale. The hourglass power-up does not slow the
// simulation down. See HOURGLASS below.
export const CFG_BOUNDS = {
  startingLives: { min: 1, max: 5, def: 3 },
  gravity: { min: 40, max: 120, def: 70 },
  launchVyMin: { min: 3000, max: 6000, def: 4000 },
  launchVyMax: { min: 3000, max: 6000, def: 4900 },
  launchVxMax: { min: 0, max: 1200, def: 500 },
  graceTicks: { min: 0, max: 600, def: 90 },
  spawnIntervalStartTicks: { min: 30, max: 600, def: 150 },
  spawnIntervalMinTicks: { min: 20, max: 600, def: 60 },
  rampTicks: { min: 600, max: 36000, def: 9000 },
  waveTwoTicks: { min: 0, max: 36000, def: 2400 },
  waveThreeTicks: { min: 0, max: 36000, def: 6000 },
  escalationStartTicks: { min: 600, max: 36000, def: 9000 },
  escalationTicks: { min: 300, max: 36000, def: 1500 },
  speedStartPct: { min: 50, max: 200, def: 100 },
  speedMaxPct: { min: 50, max: 300, def: 128 },
  jitterTicks: { min: 0, max: 120, def: 20 },
  powerupIntervalTicks: { min: 120, max: 7200, def: 900 },
  powerupChancePercent: { min: 0, max: 100, def: 55 },
  powerupWeightPiggy: { min: 0, max: 100, def: 40 },
  powerupWeightHourglass: { min: 0, max: 100, def: 35 },
  powerupWeightDynamite: { min: 0, max: 100, def: 25 },
  powerupRadius: { min: 10, max: 48, def: 22 },
  powerupSpeedPct: { min: 50, max: 150, def: 85 },
  piggyMultiplier: { min: 1, max: 4, def: 2 },
  piggyTicks: { min: 60, max: 3600, def: 480 },
  hourglassScalePercent: { min: 20, max: 100, def: 45 },
  hourglassTicks: { min: 60, max: 3600, def: 240 },
  dynamiteFuseTicks: { min: 0, max: 300, def: 36 },
  dynamiteMultiplier: { min: 1, max: 6, def: 3 },
  dynamiteMaxTargets: { min: 1, max: 40, def: 24 }
}

function clampInt(value, { min, max, def }) {
  const n = Number(value)
  if (!Number.isFinite(n)) return def
  const i = Math.round(n)
  return i < min ? min : (i > max ? max : i)
}

/**
 * Normalize an admin-supplied (or Redis-round-tripped) config into something the sim can run.
 * Both sides call this, so both sides derive bit-identical numbers from the same row.
 */
export function normalizeConfig(raw) {
  const cfg = {}
  for (const key of Object.keys(CFG_BOUNDS)) cfg[key] = clampInt(raw?.[key], CFG_BOUNDS[key])

  // An admin who sets min > start would otherwise get an interval that ramps UPWARD.
  if (cfg.spawnIntervalMinTicks > cfg.spawnIntervalStartTicks) {
    cfg.spawnIntervalMinTicks = cfg.spawnIntervalStartTicks
  }
  if (cfg.launchVyMax < cfg.launchVyMin) {
    const t = cfg.launchVyMax
    cfg.launchVyMax = cfg.launchVyMin
    cfg.launchVyMin = t
  }
  if (cfg.speedMaxPct < cfg.speedStartPct) cfg.speedMaxPct = cfg.speedStartPct
  if (cfg.waveThreeTicks < cfg.waveTwoTicks) cfg.waveThreeTicks = cfg.waveTwoTicks

  // All three power-up weights at zero would make the roll below divide by nothing; fall back
  // to the defaults rather than silently never spawning a power-up.
  if (cfg.powerupWeightPiggy + cfg.powerupWeightHourglass + cfg.powerupWeightDynamite <= 0) {
    cfg.powerupWeightPiggy = CFG_BOUNDS.powerupWeightPiggy.def
    cfg.powerupWeightHourglass = CFG_BOUNDS.powerupWeightHourglass.def
    cfg.powerupWeightDynamite = CFG_BOUNDS.powerupWeightDynamite.def
  }
  return cfg
}

// ── PRNG ──────────────────────────────────────────────────────────────────────────────────
// mulberry32, the same generator lib/asteroidSim.js uses: 32-bit integer state, all arithmetic
// through Math.imul, so it is exactly reproducible in every engine. Copied rather than
// imported so this module has no dependency on the asteroid game.
//
// This variant returns the raw uint32. Callers take `% n` instead of multiplying a float, so
// no float ever enters a spawn decision.
export function createRng(seedInt) {
  let a = seedInt >>> 0
  return function nextU32() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0
    return (t ^ (t >>> 14)) >>> 0
  }
}

/** FNV-1a over the session seed string, so /start can hand out a UUID and both sides agree. */
export function hashSeed(seed) {
  let h = 0x811c9dc5
  const s = String(seed)
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// ── State ─────────────────────────────────────────────────────────────────────────────────

export function createState(seedInt, rawCfg) {
  const cfg = normalizeConfig(rawCfg)
  return {
    cfg,
    rng: createRng(seedInt),
    tick: 0,
    score: 0,
    lives: cfg.startingLives,
    over: false,

    // Every object carries a monotonically increasing id and is ALWAYS iterated in ascending
    // id order, never in array order. Array order changes with every removal, which would make
    // the result depend on the order things happened to be spliced out. Because objects are
    // only ever appended (ids ascend) and removals are deferred to one pass at the end of the
    // tick, the live array is always already in ascending id order.
    nextId: 1,
    objects: [],
    pending: [], // spawned but not yet launched (wave jitter)

    // Absolute expiry ticks, not countdown timers. A countdown makes "is the multiplier active
    // on the tick it expires" depend on where the decrement sits relative to the scoring code;
    // an absolute tick with an inclusive `<=` has exactly one answer and the player wins ties.
    piggyUntil: -1,
    hourglassUntil: -1,
    fuses: [], // ascending detonation ticks from lit dynamite

    nextSpawnTick: cfg.graceTicks,
    nextPowerupTick: cfg.graceTicks + cfg.powerupIntervalTicks,

    // Stroke-scoped combo. `curStroke` is the stroke index the combo belongs to.
    curStroke: -1,
    combo: 0,

    // Presentation-only feed the client drains for pop-ups and Jack's dialogue. The server
    // computes it too (it costs nothing) but ignores it. Nothing here feeds back into the sim.
    events: []
  }
}

// ── Difficulty ────────────────────────────────────────────────────────────────────────────
// Removing the bomb removes the restraint half of the genre: nothing punishes swiping wildly
// and forever. So the fail state rests entirely on this curve, and the axis that actually
// defeats a mindless figure-of-eight is SIMULTANEITY AND SPREAD — five fruit fanned across the
// full width arriving together demand route planning, where one fast fruit never does. Speed
// is a deliberately secondary axis.

function lerpInt(from, to, num, den) {
  if (den <= 0) return to
  const n = num < 0 ? 0 : (num > den ? den : num)
  return from + Math.floor((to - from) * n / den)
}

export function spawnIntervalAt(cfg, tick) {
  return lerpInt(cfg.spawnIntervalStartTicks, cfg.spawnIntervalMinTicks, tick, cfg.rampTicks)
}

export function speedPctAt(cfg, tick) {
  return lerpInt(cfg.speedStartPct, cfg.speedMaxPct, tick, cfg.rampTicks)
}

/**
 * Fruit launched per wave. Deliberately UNCAPPED after the plateau: +1 every escalationTicks,
 * forever. Without it a strong player stops missing, the run ends only at the engine's tick
 * rail, and the top of the leaderboard becomes a tie on RNG rather than skill. With it, every
 * run ends in a death — no human cuts fourteen simultaneous fruit — and the board has no
 * ceiling. MAX_LIVE_FRUIT is what keeps it bounded in practice.
 */
export function waveSizeAt(cfg, tick) {
  let n = 1
  if (tick >= cfg.waveTwoTicks) n = 2
  if (tick >= cfg.waveThreeTicks) n = 3
  if (tick >= cfg.escalationStartTicks) {
    n += 1 + Math.floor((tick - cfg.escalationStartTicks) / cfg.escalationTicks)
  }
  return n
}

// ── Spawning ──────────────────────────────────────────────────────────────────────────────

const LAUNCH_MARGIN = 56
const LAUNCH_Y = (WORLD_H + 30) * FP

function pickFruitType(roll) {
  const r = roll % FRUIT_WEIGHT_TOTAL
  let acc = 0
  for (let i = 0; i < FRUIT_TYPES.length; i++) {
    acc += FRUIT_TYPES[i].weight
    if (r < acc) return i
  }
  return FRUIT_TYPES.length - 1 // unreachable; a guard, not a branch
}

/**
 * Build one launched object. `pct` is the combined type/difficulty speed percentage: it scales
 * the launch velocity linearly and gravity quadratically, which holds the apex constant and
 * shortens the flight time instead. Scaling velocity alone sends fast fruit out of the world.
 */
function makeObject(st, { kind, typeIdx, x, vyMag, vx, pct, r }) {
  const g = Math.round(st.cfg.gravity * pct * pct / 10000)
  return {
    id: st.nextId++,
    kind,
    typeIdx,
    x: x * FP,
    y: LAUNCH_Y,
    vx,
    vy: -Math.round(vyMag * pct / 100),
    g: g < 1 ? 1 : g,
    r,
    hit: r + SLICE_FORGIVENESS,
    armed: false,
    sliced: false
  }
}

function liveFruitCount(st) {
  let n = 0
  for (let i = 0; i < st.objects.length; i++) if (st.objects[i].kind === K_FRUIT) n++
  for (let i = 0; i < st.pending.length; i++) if (st.pending[i].kind === K_FRUIT) n++
  return n
}

function spawnWave(st) {
  const cfg = st.cfg
  const size = waveSizeAt(cfg, st.tick)
  const diffPct = speedPctAt(cfg, st.tick)

  for (let i = 0; i < size; i++) {
    // Every roll is drawn UNCONDITIONALLY, before any decision that could skip this fruit.
    // Conditional draws are the classic way replay determinism dies: the moment one side
    // skips a draw the other takes, every subsequent spawn in the run differs.
    const typeRoll = st.rng()
    const xRoll = st.rng()
    const vyRoll = st.rng()
    const vxRoll = st.rng()
    const jitterRoll = st.rng()

    if (liveFruitCount(st) >= MAX_LIVE_FRUIT) continue

    const t = FRUIT_TYPES[pickFruitType(typeRoll)]
    const span = WORLD_W - LAUNCH_MARGIN * 2
    const x = LAUNCH_MARGIN + (xRoll % span)
    const vyMag = cfg.launchVyMin + (vyRoll % (cfg.launchVyMax - cfg.launchVyMin + 1))
    // Horizontal drift always points toward the middle, so nothing ever sails out of the side
    // of the world and becomes unslicable.
    const vxMag = cfg.launchVxMax === 0 ? 0 : (vxRoll % (cfg.launchVxMax + 1))
    const vx = x < WORLD_W / 2 ? vxMag : -vxMag
    const pct = Math.round(t.speedPct * diffPct / 100)

    const obj = makeObject(st, {
      kind: K_FRUIT,
      typeIdx: FRUIT_TYPES.indexOf(t),
      x,
      vyMag,
      vx,
      pct,
      r: t.r
    })
    obj.launchAt = st.tick + (cfg.jitterTicks === 0 ? 0 : (jitterRoll % (cfg.jitterTicks + 1)))
    st.pending.push(obj)
  }
}

function spawnPowerup(st) {
  const cfg = st.cfg
  // Unconditional draws again — all five, before the chance test.
  const chanceRoll = st.rng()
  const kindRoll = st.rng()
  const xRoll = st.rng()
  const vyRoll = st.rng()
  const vxRoll = st.rng()

  if (chanceRoll % 100 >= cfg.powerupChancePercent) return
  let live = 0
  for (let i = 0; i < st.objects.length; i++) if (st.objects[i].kind !== K_FRUIT) live++
  for (let i = 0; i < st.pending.length; i++) if (st.pending[i].kind !== K_FRUIT) live++
  if (live >= MAX_LIVE_POWERUPS) return

  const wTotal = cfg.powerupWeightPiggy + cfg.powerupWeightHourglass + cfg.powerupWeightDynamite
  const w = kindRoll % wTotal
  let kind = K_DYNAMITE
  if (w < cfg.powerupWeightPiggy) kind = K_PIGGY
  else if (w < cfg.powerupWeightPiggy + cfg.powerupWeightHourglass) kind = K_HOURGLASS

  const span = WORLD_W - LAUNCH_MARGIN * 2
  const x = LAUNCH_MARGIN + (xRoll % span)
  const vyMag = cfg.launchVyMin + (vyRoll % (cfg.launchVyMax - cfg.launchVyMin + 1))
  const vxMag = cfg.launchVxMax === 0 ? 0 : (vxRoll % (cfg.launchVxMax + 1))

  const obj = makeObject(st, {
    kind,
    typeIdx: -1,
    x,
    vyMag,
    vx: x < WORLD_W / 2 ? vxMag : -vxMag,
    // Power-ups hang longer than fruit so they are reliably catchable: missing one should feel
    // like a mistake, not like bad luck.
    pct: cfg.powerupSpeedPct,
    r: cfg.powerupRadius
  })
  obj.launchAt = st.tick
  st.pending.push(obj)
}

// ── Scoring ───────────────────────────────────────────────────────────────────────────────

function multiplierAt(st) {
  // Inclusive `<=`: a slice landing exactly on the expiry tick still counts. Ties go to the
  // player, and there is exactly one place this comparison is made.
  const m = st.tick <= st.piggyUntil ? st.cfg.piggyMultiplier : 1
  return m > MAX_MULTIPLIER ? MAX_MULTIPLIER : m
}

function award(st, base, extraMult) {
  let m = multiplierAt(st) * (extraMult || 1)
  if (m > MAX_MULTIPLIER) m = MAX_MULTIPLIER
  const pts = base * m
  st.score += pts
  return pts
}

function resolveSlice(st, o) {
  // Every directly-sliced object advances the stroke's combo — including a power-up, so cutting
  // a dynamite mid-sweep still builds the chain.
  st.combo++
  let comboBonus = 0
  if (st.combo >= COMBO_MIN) {
    const n = st.combo > COMBO_MAX_COUNT ? COMBO_MAX_COUNT : st.combo
    comboBonus = award(st, COMBO_STEP * (n - (COMBO_MIN - 1)), 1)
  }

  if (o.kind === K_FRUIT) {
    const pts = award(st, FRUIT_TYPES[o.typeIdx].points, 1)
    st.events.push({ t: st.tick, e: 'slice', id: o.id, kind: o.kind, typeIdx: o.typeIdx, pts, combo: st.combo, bonus: comboBonus })
    return
  }

  if (o.kind === K_PIGGY) {
    // Refresh to full, never extend. Re-grabbing an active power-up must not compound.
    st.piggyUntil = st.tick + st.cfg.piggyTicks
  } else if (o.kind === K_HOURGLASS) {
    // NOTE: this only ever reaches the RENDERER. See the HOURGLASS note at the bottom of the
    // file — the simulation itself has no concept of time passing more slowly.
    st.hourglassUntil = st.tick + st.cfg.hourglassTicks
  } else if (o.kind === K_DYNAMITE) {
    // The fuse is what turns dynamite from a no-brainer into a decision: light it early in a
    // wave and the blast catches more, light it late and it fizzles. It also guarantees
    // detonation lands on a strictly later tick than the slice that lit it, which is why the
    // tick order below has no same-tick interleave to resolve.
    st.fuses.push(st.tick + st.cfg.dynamiteFuseTicks + 1)
  }
  st.events.push({ t: st.tick, e: 'slice', id: o.id, kind: o.kind, typeIdx: -1, pts: 0, combo: st.combo, bonus: comboBonus })
}

function detonate(st) {
  if (st.fuses.length === 0) return
  let remaining = []
  let fired = false
  for (let i = 0; i < st.fuses.length; i++) {
    if (st.fuses[i] === st.tick) fired = true
    else if (st.fuses[i] > st.tick) remaining.push(st.fuses[i])
    // A fuse strictly in the past cannot happen (ticks advance by one) but dropping it is the
    // safe branch either way.
  }
  st.fuses = remaining
  if (!fired) return

  let hit = 0
  const caught = []
  for (let i = 0; i < st.objects.length; i++) {
    const o = st.objects[i]
    if (o.sliced || o.kind !== K_FRUIT || !o.armed) continue
    if (hit >= st.cfg.dynamiteMaxTargets) break
    o.sliced = true
    hit++
    // Paid at a multiplier rather than face value, so the blast is unambiguously better than
    // cutting the same fruit by hand — otherwise it is strictly worse than a swipe and feels
    // like a dud. It stacks with the piggy bank, and MAX_MULTIPLIER caps the total.
    const pts = award(st, FRUIT_TYPES[o.typeIdx].points, st.cfg.dynamiteMultiplier)
    caught.push({ id: o.id, typeIdx: o.typeIdx, pts })
  }
  // Collateral deliberately does NOT advance the combo counter. If it did, one dynamite would
  // hand out a maximum-length combo for free and dwarf everything the player does by hand.
  st.events.push({ t: st.tick, e: 'boom', count: caught.length, caught })
}

// ── Blade segments ────────────────────────────────────────────────────────────────────────

/**
 * Exact segment/circle overlap, cross-multiplied so there is no division and no square root.
 * All inputs are whole world units; every intermediate stays far inside 2^53.
 *   |cross| / |d| <= r   becomes   cross^2 <= r^2 * |d|^2
 */
export function segmentHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax
  const dy = by - ay
  const fx = cx - ax
  const fy = cy - ay
  const r2 = r * r
  const dot = fx * dx + fy * dy
  if (dot <= 0) return fx * fx + fy * fy <= r2 // closest point is A
  const len2 = dx * dx + dy * dy
  if (dot >= len2) {
    const gx = cx - bx
    const gy = cy - by
    return gx * gx + gy * gy <= r2 // closest point is B
  }
  const cross = fx * dy - fy * dx
  return cross * cross <= r2 * len2
}

/**
 * Walks a stroke log and hands the sim the blade segments belonging to each tick, in a stable
 * order, advancing monotonically. BOTH sides use this: the server builds one over the whole
 * submitted log, the client builds one over the log it is still appending to. Sharing the
 * cursor logic is the point — a client that assembled segments even slightly differently would
 * disagree about borderline cuts no matter how identical the physics was.
 *
 * Stroke shape: { t: <absolute start tick>, p: [dt, x, y, dt, x, y, ...] }.
 * The first sample of a stroke produces no segment: a tap does not cut, and slicing never
 * continues across a pointer-up.
 */
export function createSegmentFeeder(strokes) {
  let si = 0
  let pi = 3 // sample index within the current stroke, in flat-array units; starts at the 2nd
  return function forTick(tick) {
    const out = []
    while (si < strokes.length) {
      const s = strokes[si]
      const p = s.p
      if (pi >= p.length) {
        // Out of samples in this stroke. Only move on once a LATER stroke exists, which (since
        // strokes are disjoint and ordered) is the proof that this one is finished. The server
        // holds the whole log so it just runs off the end here; the client is still appending
        // to the open stroke, and advancing past it would strand every sample added after this
        // call — silently costing the player every cut in the stroke they are mid-way through.
        if (si + 1 >= strokes.length) break
        si++
        pi = 3
        continue
      }
      const dt = p[pi]
      if (s.t + dt > tick) break
      // A sample whose tick is already behind us can only happen if the caller skipped a tick;
      // emit it anyway rather than silently dropping input.
      out.push({
        s: si,
        gap: dt - p[pi - 3],
        x0: p[pi - 2],
        y0: p[pi - 1],
        x1: p[pi + 1],
        y1: p[pi + 2]
      })
      pi += 3
    }
    return out
  }
}

// ── The tick ──────────────────────────────────────────────────────────────────────────────
/**
 * Advance the simulation exactly one tick. `segs` is what the feeder returned for this tick.
 *
 * The ordering below is the contract, and it is deliberately explicit because every one of
 * these steps is a place where two reasonable implementations would disagree:
 *
 *   1. tick++
 *   2. DETONATE lit dynamite whose fuse lands on this tick — before anything moves, so a blast
 *      catches the board as the player saw it when the fuse ran out.
 *   3. INTEGRATE every object (ascending id) and arm it once it is fully inside the world.
 *   4. SLICE, walking segments in stroke-then-sample order and objects in ascending id.
 *   5. MISSES — after slicing, so a fruit cut on the exact tick it crosses the bottom edge
 *      SCORES and does not cost a life. The player expects that, and the other ordering is
 *      just as natural to write, which is exactly why it has to be stated.
 *   6. SPAWN (all random draws unconditional).
 *   7. END if out of lives.
 */
export function step(st, segs) {
  if (st.over) return st
  st.tick++

  // 2. Detonate
  detonate(st)

  // 3. Integrate
  const objs = st.objects
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    o.vy += o.g
    o.x += o.vx
    o.y += o.vy
    // A fruit launches from below the floor, so without an "armed" gate every one of them
    // would trip the miss test on its first tick and the player would lose three lives before
    // seeing anything.
    if (!o.armed && (o.y + o.r * FP) < WORLD_H * FP) o.armed = true
  }

  // 4. Slice
  if (segs && segs.length) {
    for (let k = 0; k < segs.length; k++) {
      const sg = segs[k]
      if (sg.s !== st.curStroke) {
        st.curStroke = sg.s
        st.combo = 0
      }
      if (sg.gap > MAX_SAMPLE_GAP_TICKS) {
        // Not one continuous swipe — see MAX_SAMPLE_GAP_TICKS. No cut, and the chain breaks.
        st.combo = 0
        continue
      }
      const dx = sg.x1 - sg.x0
      const dy = sg.y1 - sg.y0
      if (dx * dx + dy * dy < MIN_SLICE_DIST2) continue

      for (let i = 0; i < objs.length; i++) {
        const o = objs[i]
        if (o.sliced || !o.armed) continue
        if (segmentHitsCircle(sg.x0, sg.y0, sg.x1, sg.y1, o.x >> FP_SHIFT, o.y >> FP_SHIFT, o.hit)) {
          o.sliced = true
          resolveSlice(st, o)
        }
      }
    }
  }

  // 5. Misses and removal — one pass, so nothing is ever spliced mid-iteration.
  const keep = []
  const missFloor = (WORLD_H + MISS_MARGIN) * FP
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    if (o.sliced) continue
    if (o.armed && (o.y - o.r * FP) > missFloor) {
      if (o.kind === K_FRUIT) {
        st.lives--
        st.events.push({ t: st.tick, e: 'miss', typeIdx: o.typeIdx, lives: st.lives })
      }
      continue
    }
    keep.push(o)
  }
  st.objects = keep

  // 6. Spawn — launch anything whose jitter delay has elapsed, then schedule new waves.
  if (st.pending.length) {
    const stillPending = []
    for (let i = 0; i < st.pending.length; i++) {
      const o = st.pending[i]
      if (o.launchAt <= st.tick) st.objects.push(o)
      else stillPending.push(o)
    }
    st.pending = stillPending
  }
  if (st.tick >= st.cfg.graceTicks && st.tick >= st.nextSpawnTick) {
    st.nextSpawnTick = st.tick + spawnIntervalAt(st.cfg, st.tick)
    spawnWave(st)
  }
  if (st.tick >= st.cfg.graceTicks && st.tick >= st.nextPowerupTick) {
    st.nextPowerupTick = st.tick + st.cfg.powerupIntervalTicks
    spawnPowerup(st)
  }

  // 7. End
  if (st.lives <= 0) {
    st.over = true
    st.events.push({ t: st.tick, e: 'over', score: st.score })
  }
  return st
}

/**
 * Replay a whole run from a stroke log. Used by the server; the client steps interactively
 * instead, through exactly the same `step`.
 */
export function simulate(seedInt, cfg, strokes, maxTicks) {
  const st = createState(seedInt, cfg)
  const feeder = createSegmentFeeder(strokes)
  for (let t = 1; t <= maxTicks && !st.over; t++) step(st, feeder(t))
  return st
}

// ── HOURGLASS: why slow motion is not in this file ────────────────────────────────────────
// The hourglass grants slow motion, and the simulation has no idea. `st.hourglassUntil` is
// read by the RENDERER, which paces its accumulator at MS_PER_TICK * 100 / hourglassScalePercent
// (37ms instead of 16.67ms at the default 45%) while it is active. The sim still advances
// exactly one integer tick per step, every fruit follows the identical parabola over the
// identical number of ticks, and the server replays ticks 1..N without ever needing to know
// slow motion happened.
//
// Doing it the obvious way instead — a `timeScale` multiplying positions inside the sim —
// would have been three separate bugs:
//   * It puts a float in the physics, round-tripped through Redis JSON and an admin form. A
//     0.45 from one write path and a 0.45000000000000001 from another are two different
//     worlds grown from the same seed.
//   * Fruit would take 1/scale as many TICKS to fly, so the engine's tick rail would start
//     truncating runs mid-flight, and a player chaining hourglasses would hit a "5 minute" cap
//     after eleven real minutes.
//   * Written carelessly as `vy += g*ts; y += vy*ts` it scales gravity by ts², silently
//     changing apex heights and therefore the whole difficulty curve.
//
// It is also simply the better effect. In one real second the world advances 27 ticks instead
// of 60, but the player's finger still sweeps the full screen — so the blade moves 2.2x faster
// relative to the fruit. That is the genre-standard freeze, for free, with zero sim risk.
