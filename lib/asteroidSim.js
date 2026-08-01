// Operation A.S.T.E.R.O.I.D. — shared deterministic simulation.
//
// This module is imported by BOTH the browser (pages/newsite/asteroid.vue, for rendering) and
// the server (server/utils/asteroidEngine.js, for authoritative replay at /end). It lives in
// utils/ rather than server/utils/ precisely so there is ONE copy: Tower Stack duplicates its
// math between towerStackEngine.js and tower.vue, and any drift between those two copies would
// silently reject legitimate runs. With a simulation this size (ships, asteroids, bullets,
// power-ups, waves) that duplication is not survivable, so the two sides share this file and
// only the anti-cheat wrapper is server-only.
//
// It contains NO secrets. The seed and config are handed to the client at /start anyway,
// because the client must reproduce the exact same world in order to draw it.
//
// ── DETERMINISM CONTRACT ──────────────────────────────────────────────────────────────────
// The server replays the player's input log tick-for-tick and takes ITS score as authoritative.
// If the browser and Node ever compute a different number, the run diverges and a legitimate
// player loses their score. So every arithmetic operation in this file must be bit-identical
// on every JS engine and CPU. That means:
//
//   ALLOWED  + - * / % and comparisons on doubles (IEEE-754, exactly specified by ECMA-262),
//            Math.floor / ceil / abs / min / max / trunc / sign (all exactly specified),
//            integer bitwise ops, and array indexing.
//
//   BANNED   Math.sin, cos, tan, atan2, pow, exp, log, hypot, cbrt — ECMA-262 explicitly
//            allows these to be "implementation-approximated", and they DO differ by an ULP
//            between V8 versions, between V8 and JavaScriptCore, and sometimes between CPUs.
//            Math.sqrt is correctly-rounded in practice but is spec'd as approximated too, so
//            it is banned here as well and all distance tests use SQUARED distances instead.
//            Math.random is obviously banned — all randomness comes from the seeded PRNG below.
//
// Trig is therefore served from a lookup table (TRIG_STEPS entries) that is itself built with
// only + - * / — see buildTrigTables(). Headings are stored as an INTEGER index into that
// table rather than as a float angle, so heading arithmetic is exact integer modular
// arithmetic and cannot accumulate float error over a ten-thousand-tick run.

// ─── World constants ────────────────────────────────────────────────────────────────────────
// A fixed logical playfield, identical for every player on every device. The canvas letterboxes
// this into whatever space it has; the simulation NEVER depends on the viewport, so a phone and
// a desktop replay identically. 640x480 is also the classic Flash-game box the art is aping.
export const WORLD_W = 640
export const WORLD_H = 480

export const TICK_HZ = 60
export const MS_PER_TICK = 1000 / TICK_HZ

// Heading is an integer in [0, TRIG_STEPS). A power of two so wrapping is a mask.
export const TRIG_STEPS = 1024
const TRIG_MASK = TRIG_STEPS - 1

// Input bitmask (what the client records on change).
export const IN_LEFT   = 1
export const IN_RIGHT  = 2
export const IN_THRUST = 4

// Power-up colors. Order matters — the PRNG picks by index.
export const PU_BLUE  = 0 // 2x fire rate
export const PU_RED   = 1 // temporary invincibility
export const PU_GREEN = 2 // ship at half size
export const PU_COLORS = [PU_BLUE, PU_RED, PU_GREEN]

// Asteroid size tiers. Index is the tier; 0 = large, 1 = medium, 2 = small.
export const AST_LARGE = 0
export const AST_MED   = 1
export const AST_SMALL = 2
// Defaults only — the live radii come from the session config so an admin can retune them.
export const AST_RADII = [34, 20, 11]

// Hard entity caps. These bound the server's replay cost (see asteroidEngine.js) and are not
// admin-tunable — an admin who set "startAsteroids: 500" would otherwise be handing every
// player a way to make /end burn CPU.
export const MAX_ASTEROIDS = 44
// Raised from 24 for the shotgun ship: a volley is several pellets at once, and a cap that
// truncated one mid-fan would make the weapon feel broken. Still bounded, still deterministic.
export const MAX_BULLETS   = 40
export const MAX_POWERUPS  = 3

// ─── Ships ──────────────────────────────────────────────────────────────────────────────────
// The player picks one at /start. A ship is purely a WEAPON profile plus art: the server
// resolves the chosen ship's five weapon numbers into the flat cfg fields below and snapshots
// them into the session, so the simulation itself never needs to know which ship is flying —
// it just reads cfg.pellets / cfg.spreadSteps / cfg.fireIntervalTicks / etc. That keeps the
// replay path identical no matter what the player chose, and means a ship added later costs
// the simulation nothing.
//
// `id` is the wire value. It is validated server-side against this list, so a forged shipId
// cannot smuggle in a made-up weapon.
export const SHIP_MOSQUITTOH = 'mosquittoh'
export const SHIP_SCAMPER    = 'scamper'
export const SHIP_CASUAL     = 'casual'

export const SHIPS = [
  {
    id: SHIP_MOSQUITTOH,
    name: 'M.O.S.Q.U.I.T.T.O.H.',
    tagline: 'Sniper',
    blurb: 'One long-range shot at a time. Patient and precise — line it up and it reaches clear across the field.',
    sprite: '/asteroid/mosquittoh.png',
    // The source art faces left, so the sprite is rotated by PI to point along the heading.
    spriteTurns: 0.5,
    weapon: { fireIntervalTicks: 26, bulletSpeed: 7.6, bulletLifeTicks: 300, pellets: 1, spreadSteps: 0 }
  },
  {
    id: SHIP_SCAMPER,
    name: 'S.C.A.M.P.E.R.',
    tagline: 'Shotgun',
    blurb: 'A wide spray of pellets that drop off fast. Devastating up close, useless at a distance.',
    sprite: '/asteroid/scamper.png',
    spriteTurns: 0.5,
    weapon: { fireIntervalTicks: 21, bulletSpeed: 5.6, bulletLifeTicks: 15, pellets: 5, spreadSteps: 96 }
  },
  {
    id: SHIP_CASUAL,
    name: 'C.A.S.U.A.L.',
    tagline: 'All-rounder',
    blurb: 'Middling range, middling rate of fire, no surprises. The one to learn the field with.',
    sprite: '/asteroid/casual.png',
    spriteTurns: 0.5,
    weapon: { fireIntervalTicks: 13, bulletSpeed: 6.2, bulletLifeTicks: 66, pellets: 1, spreadSteps: 0 }
  }
]

export const SHIP_IDS = SHIPS.map(s => s.id)
export const DEFAULT_SHIP_ID = SHIP_CASUAL

export function getShip(id) {
  return SHIPS.find(s => s.id === id) || SHIPS.find(s => s.id === DEFAULT_SHIP_ID)
}

// Respawn clearance is a safety mechanic rather than a difficulty knob — if an admin set it to
// zero the ship would rematerialise inside an asteroid and burn every remaining life instantly,
// so it stays fixed.
const SAFE_SPAWN_R2 = 90 * 90 // don't respawn if an asteroid is within this squared distance

// ─── Deterministic trig tables ──────────────────────────────────────────────────────────────
// Built with ONLY + - * / so both engines produce bit-identical tables. Using Math.sin here —
// even rounded — would reintroduce the cross-engine ULP difference this file exists to avoid.
//
// sin(x) for x in [0, PI/4] via its Taylor series, which converges fast enough on that range
// that 8 terms are exact to the last double bit; the rest of the circle is filled in by the
// symmetry identities, which are pure negation and index reflection.
const PI     = 3.141592653589793
const HALF_PI = PI / 2

function taylorSin(x) {
  // x in [-PI/4, PI/4]. Horner-style evaluation of x - x^3/3! + x^5/5! - ...
  const x2 = x * x
  let term = x
  let sum = x
  for (let n = 1; n <= 8; n++) {
    const d = (2 * n) * (2 * n + 1)
    term = -term * x2 / d
    sum = sum + term
  }
  return sum
}

function taylorCos(x) {
  const x2 = x * x
  let term = 1
  let sum = 1
  for (let n = 1; n <= 8; n++) {
    const d = (2 * n - 1) * (2 * n)
    term = -term * x2 / d
    sum = sum + term
  }
  return sum
}

function buildTrigTables() {
  const cos = new Float64Array(TRIG_STEPS)
  const sin = new Float64Array(TRIG_STEPS)
  const quarter = TRIG_STEPS / 4
  const eighth  = TRIG_STEPS / 8
  for (let i = 0; i < TRIG_STEPS; i++) {
    // Reduce i to the first octant, where the Taylor series is at its most accurate, then
    // rebuild the full circle from sign/swap symmetries (exact integer index math).
    const q = Math.floor(i / quarter)      // quadrant 0..3
    const r = i - q * quarter              // 0..quarter-1
    let c, s
    if (r <= eighth) {
      const a = (r / TRIG_STEPS) * (2 * PI)
      c = taylorCos(a); s = taylorSin(a)
    } else {
      // Mirror across 45°: sin(x) = cos(PI/2 - x)
      const a = HALF_PI - (r / TRIG_STEPS) * (2 * PI)
      c = taylorSin(a); s = taylorCos(a)
    }
    switch (q) {
      case 0: cos[i] =  c; sin[i] =  s; break
      case 1: cos[i] = -s; sin[i] =  c; break
      case 2: cos[i] = -c; sin[i] = -s; break
      default: cos[i] = s; sin[i] = -c; break
    }
  }
  return { cos, sin }
}

const TRIG = buildTrigTables()
export const COS_TABLE = TRIG.cos
export const SIN_TABLE = TRIG.sin

export function headingCos(h) { return COS_TABLE[h & TRIG_MASK] }
export function headingSin(h) { return SIN_TABLE[h & TRIG_MASK] }

// ─── Seeded PRNG ────────────────────────────────────────────────────────────────────────────
// mulberry32: 32-bit integer state, all-integer arithmetic via Math.imul, so it is exactly
// reproducible everywhere. The seed is a per-session random value from /start, which is what
// stops a solved input log from being replayed against a different session (same trust model
// as Tower Stack's jitterSeed — see server/utils/towerStackEngine.js).
export function createRng(seedInt) {
  let a = seedInt >>> 0
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fold a hex session seed into a 32-bit int (FNV-1a, integer-only).
export function seedFromHex(hex) {
  let h = 0x811c9dc5
  const s = String(hex)
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// ─── Config ─────────────────────────────────────────────────────────────────────────────────
// Every knob the admin panel exposes. Snapshotted into the Redis session at /start so an admin
// edit mid-run can never desync the replay at /end.
export const DEFAULT_CONFIG = {
  // difficulty
  startingLives: 3,
  startAsteroids: 4,
  asteroidsPerWave: 1,          // added each wave
  asteroidSpeed: 1.15,          // world units per tick, large tier
  waveSpeedGrowth: 0.06,        // +6% asteroid speed per wave
  maxSpeedMultiplier: 2.2,
  turnRate: 6,                  // heading steps per tick (of TRIG_STEPS)
  thrustAccel: 0.145,
  maxShipSpeed: 5.6,
  shipDrag: 0.992,              // per-tick velocity retention
  fireIntervalTicks: 13,
  extraLifeScore: 10000,        // 0 disables
  // physics / geometry — world units, and ticks for durations
  shipRadius: 13,               // collision radius; the Green power-up halves it
  bulletSpeed: 6.2,             // world units per tick, added to the ship's own velocity
  bulletLifeTicks: 66,          // how far a shot carries before it fizzles
  pellets: 1,                   // projectiles per shot — >1 is the shotgun profile
  spreadSteps: 0,               // total fan width in heading steps (1024 = full circle)
  respawnInvulnTicks: 96,       // grace period after respawning
  powerupRadius: 13,            // pickup radius
  powerupLifeTicks: 600,        // how long an uncollected power-up sits before despawning
  asteroidLargeRadius: 34,
  asteroidMediumRadius: 20,
  asteroidSmallRadius: 11,
  // scoring
  pointsLarge: 20,
  pointsMedium: 50,
  pointsSmall: 100,
  waveClearBonus: 250,
  // power-ups
  powerupsEnabled: true,
  powerupBlueEnabled: true,
  powerupRedEnabled: true,
  powerupGreenEnabled: true,
  powerupIntervalTicks: 900,    // ~15s between spawn attempts
  powerupChancePercent: 65,     // chance a given attempt actually spawns one
  powerupBlueTicks: 600,        // 10s
  powerupRedTicks: 420,         // 7s
  powerupGreenTicks: 720        // 12s
}

// Clamp an admin-supplied config into ranges the simulation is known to be stable in. Applied
// on BOTH sides so a hand-edited config in a forged session can't produce a different world
// than the one the server validated.
export function normalizeConfig(raw) {
  const c = { ...DEFAULT_CONFIG, ...(raw || {}) }
  const num = (v, lo, hi, dflt) => {
    // A missing value must fall back to the DEFAULT, not to the range minimum. Number(null) is
    // 0 and Number('') is 0, so a plain Number() + clamp would silently turn "no config row
    // yet" into "1 life, slowest everything" instead of the intended defaults.
    if (v === null || v === undefined || v === '') return dflt
    const n = Number(v)
    if (Number.isNaN(n)) return dflt
    // ±Infinity is hostile rather than missing, so it clamps to the edge of the range.
    return Math.min(hi, Math.max(lo, n))
  }
  const int = (v, lo, hi, dflt) => Math.floor(num(v, lo, hi, dflt))
  return {
    startingLives:        int(c.startingLives, 1, 9, 3),
    startAsteroids:       int(c.startAsteroids, 1, 12, 4),
    asteroidsPerWave:     int(c.asteroidsPerWave, 0, 4, 1),
    asteroidSpeed:        num(c.asteroidSpeed, 0.2, 4, 1.15),
    waveSpeedGrowth:      num(c.waveSpeedGrowth, 0, 0.5, 0.06),
    maxSpeedMultiplier:   num(c.maxSpeedMultiplier, 1, 5, 2.2),
    turnRate:             int(c.turnRate, 1, 24, 6),
    thrustAccel:          num(c.thrustAccel, 0.02, 1, 0.145),
    maxShipSpeed:         num(c.maxShipSpeed, 1, 16, 5.6),
    shipDrag:             num(c.shipDrag, 0.9, 1, 0.992),
    fireIntervalTicks:    int(c.fireIntervalTicks, 3, 60, 13),
    extraLifeScore:       int(c.extraLifeScore, 0, 1000000, 10000),
    shipRadius:           num(c.shipRadius, 4, 40, 13),
    bulletSpeed:          num(c.bulletSpeed, 1, 20, 6.2),
    bulletLifeTicks:      int(c.bulletLifeTicks, 10, 300, 66),
    // Capped at 12 so one volley can never exhaust MAX_BULLETS on its own.
    pellets:              int(c.pellets, 1, 12, 1),
    spreadSteps:          int(c.spreadSteps, 0, 512, 0),
    respawnInvulnTicks:   int(c.respawnInvulnTicks, 0, 600, 96),
    powerupRadius:        num(c.powerupRadius, 5, 40, 13),
    powerupLifeTicks:     int(c.powerupLifeTicks, 60, 3600, 600),
    asteroidLargeRadius:  num(c.asteroidLargeRadius, 10, 80, 34),
    asteroidMediumRadius: num(c.asteroidMediumRadius, 6, 60, 20),
    asteroidSmallRadius:  num(c.asteroidSmallRadius, 3, 40, 11),
    pointsLarge:          int(c.pointsLarge, 0, 10000, 20),
    pointsMedium:         int(c.pointsMedium, 0, 10000, 50),
    pointsSmall:          int(c.pointsSmall, 0, 10000, 100),
    waveClearBonus:       int(c.waveClearBonus, 0, 100000, 250),
    powerupsEnabled:      !!c.powerupsEnabled,
    powerupBlueEnabled:   !!c.powerupBlueEnabled,
    powerupRedEnabled:    !!c.powerupRedEnabled,
    powerupGreenEnabled:  !!c.powerupGreenEnabled,
    powerupIntervalTicks: int(c.powerupIntervalTicks, 60, 36000, 900),
    powerupChancePercent: int(c.powerupChancePercent, 0, 100, 65),
    powerupBlueTicks:     int(c.powerupBlueTicks, 0, 7200, 600),
    powerupRedTicks:      int(c.powerupRedTicks, 0, 7200, 420),
    powerupGreenTicks:    int(c.powerupGreenTicks, 0, 7200, 720)
  }
}

// ─── State ──────────────────────────────────────────────────────────────────────────────────
// Plain objects in preallocated-ish arrays. The renderer reads this directly; the server throws
// it away after computing the score.
export function createState(seedInt, cfg) {
  const c = normalizeConfig(cfg)
  const st = {
    cfg: c,
    rng: createRng(seedInt),
    tick: 0,
    score: 0,
    lives: c.startingLives,
    wave: 0,
    over: false,
    ship: {
      x: WORLD_W / 2, y: WORLD_H / 2, vx: 0, vy: 0,
      heading: TRIG_STEPS * 3 / 4, // pointing "up" the screen
      alive: true,
      invulnTicks: c.respawnInvulnTicks,
      respawnTicks: 0,
      cooldown: 0
    },
    asteroids: [],
    bullets: [],
    powerups: [],
    // active power-up timers, indexed by PU_* — independent so they stack
    puTicks: [0, 0, 0],
    nextPowerupTick: c.powerupIntervalTicks,
    nextExtraLifeAt: c.extraLifeScore > 0 ? c.extraLifeScore : 0,
    // render-only signals (never affect the simulation, safe to ignore server-side)
    events: []
  }
  startWave(st)
  return st
}

function rndRange(st, lo, hi) { return lo + st.rng() * (hi - lo) }

function waveSpeedMult(st) {
  const m = 1 + st.wave * st.cfg.waveSpeedGrowth
  return m < st.cfg.maxSpeedMultiplier ? m : st.cfg.maxSpeedMultiplier
}

// Radius for an asteroid tier, from the session config.
function tierRadius(cfg, tier) {
  return tier === AST_LARGE ? cfg.asteroidLargeRadius
       : tier === AST_MED   ? cfg.asteroidMediumRadius
       : cfg.asteroidSmallRadius
}

function spawnAsteroid(st, tier, x, y) {
  if (st.asteroids.length >= MAX_ASTEROIDS) return
  const speed = st.cfg.asteroidSpeed * waveSpeedMult(st) * (1 + tier * 0.28)
  const h = Math.floor(st.rng() * TRIG_STEPS) & TRIG_MASK
  st.asteroids.push({
    x, y,
    vx: headingCos(h) * speed,
    vy: headingSin(h) * speed,
    tier,
    r: tierRadius(st.cfg, tier),
    // purely cosmetic, but derived from the shared PRNG so both sides stay in lockstep
    spin: Math.floor(rndRange(st, -3, 3)),
    rot: Math.floor(st.rng() * TRIG_STEPS) & TRIG_MASK,
    shape: Math.floor(st.rng() * 4)
  })
}

function startWave(st) {
  st.wave++
  const count = Math.min(
    MAX_ASTEROIDS,
    st.cfg.startAsteroids + (st.wave - 1) * st.cfg.asteroidsPerWave
  )
  for (let i = 0; i < count; i++) {
    // Spawn along the edges so nothing materialises on top of the ship.
    const edge = Math.floor(st.rng() * 4)
    let x, y
    if (edge === 0)      { x = rndRange(st, 0, WORLD_W); y = 0 }
    else if (edge === 1) { x = rndRange(st, 0, WORLD_W); y = WORLD_H }
    else if (edge === 2) { x = 0;                        y = rndRange(st, 0, WORLD_H) }
    else                 { x = WORLD_W;                  y = rndRange(st, 0, WORLD_H) }
    spawnAsteroid(st, AST_LARGE, x, y)
  }
}

function wrap(o) {
  if (o.x < 0) o.x += WORLD_W
  else if (o.x >= WORLD_W) o.x -= WORLD_W
  if (o.y < 0) o.y += WORLD_H
  else if (o.y >= WORLD_H) o.y -= WORLD_H
}

// Shortest wrapped delta on one axis — needed so a collision still registers across the seam.
function wrapDelta(d, span) {
  const half = span / 2
  if (d > half) return d - span
  if (d < -half) return d + span
  return d
}

function hits(ax, ay, ar, bx, by, br) {
  const dx = wrapDelta(ax - bx, WORLD_W)
  const dy = wrapDelta(ay - by, WORLD_H)
  const rr = ar + br
  return dx * dx + dy * dy <= rr * rr // squared — no Math.sqrt, see determinism contract
}

function addScore(st, n) {
  st.score += n
  if (st.nextExtraLifeAt > 0 && st.score >= st.nextExtraLifeAt) {
    st.lives++
    st.events.push({ t: 'life' })
    st.nextExtraLifeAt += st.cfg.extraLifeScore
  }
}

function destroyAsteroid(st, idx) {
  const a = st.asteroids[idx]
  const pts = a.tier === AST_LARGE ? st.cfg.pointsLarge
            : a.tier === AST_MED   ? st.cfg.pointsMedium
            : st.cfg.pointsSmall
  addScore(st, pts)
  st.events.push({ t: 'boom', x: a.x, y: a.y, tier: a.tier })
  st.asteroids.splice(idx, 1)
  if (a.tier < AST_SMALL) {
    spawnAsteroid(st, a.tier + 1, a.x, a.y)
    spawnAsteroid(st, a.tier + 1, a.x, a.y)
  }
}

function killShip(st) {
  const s = st.ship
  st.events.push({ t: 'shipboom', x: s.x, y: s.y })
  st.lives--
  // Losing a life clears every active power-up — otherwise Red invincibility would let a
  // player tank hits for free and the death would carry no cost at all.
  st.puTicks[PU_BLUE] = 0
  st.puTicks[PU_RED] = 0
  st.puTicks[PU_GREEN] = 0
  if (st.lives <= 0) {
    st.over = true
    s.alive = false
    return
  }
  s.alive = false
  s.respawnTicks = 40
}

function tryRespawn(st) {
  const s = st.ship
  s.respawnTicks--
  if (s.respawnTicks > 0) return
  // Only come back when the middle of the board is clear, otherwise the player dies instantly.
  for (let i = 0; i < st.asteroids.length; i++) {
    const a = st.asteroids[i]
    const dx = wrapDelta(a.x - WORLD_W / 2, WORLD_W)
    const dy = wrapDelta(a.y - WORLD_H / 2, WORLD_H)
    if (dx * dx + dy * dy < SAFE_SPAWN_R2) return // wait another tick
  }
  s.x = WORLD_W / 2; s.y = WORLD_H / 2
  s.vx = 0; s.vy = 0
  s.heading = TRIG_STEPS * 3 / 4
  s.alive = true
  s.invulnTicks = st.cfg.respawnInvulnTicks
  s.cooldown = 0
}

function maybeSpawnPowerup(st) {
  const c = st.cfg
  if (!c.powerupsEnabled) return
  if (st.tick < st.nextPowerupTick) return
  st.nextPowerupTick = st.tick + c.powerupIntervalTicks

  const enabled = []
  if (c.powerupBlueEnabled)  enabled.push(PU_BLUE)
  if (c.powerupRedEnabled)   enabled.push(PU_RED)
  if (c.powerupGreenEnabled) enabled.push(PU_GREEN)
  // Draw both randoms unconditionally so the PRNG stream advances identically whether or not
  // a power-up actually appears. Conditional draws are the classic way replay determinism dies.
  const roll = st.rng()
  const pick = st.rng()
  if (enabled.length === 0) return
  if (roll * 100 >= c.powerupChancePercent) return
  if (st.powerups.length >= MAX_POWERUPS) return

  const kind = enabled[Math.min(enabled.length - 1, Math.floor(pick * enabled.length))]
  st.powerups.push({
    x: rndRange(st, 60, WORLD_W - 60),
    y: rndRange(st, 60, WORLD_H - 60),
    kind,
    life: c.powerupLifeTicks
  })
}

function grantPowerup(st, kind) {
  const c = st.cfg
  const dur = kind === PU_BLUE ? c.powerupBlueTicks
            : kind === PU_RED  ? c.powerupRedTicks
            : c.powerupGreenTicks
  // Stack independently: each color keeps its own timer, and re-grabbing a color you already
  // have refreshes it to full rather than extending it without bound.
  st.puTicks[kind] = dur
  st.events.push({ t: 'pickup', kind })
}

export function shipRadius(st) {
  // Green shrinks the ship's collision radius as well as its sprite — that IS the power-up.
  const r = st.cfg.shipRadius
  return st.puTicks[PU_GREEN] > 0 ? r / 2 : r
}

export function fireInterval(st) {
  const base = st.cfg.fireIntervalTicks
  if (st.puTicks[PU_BLUE] <= 0) return base
  const half = Math.floor(base / 2)
  return half < 2 ? 2 : half
}

export function isInvulnerable(st) {
  return st.ship.invulnTicks > 0 || st.puTicks[PU_RED] > 0
}

// Fire one shot. For a single-pellet ship that is one bullet along the heading; for the shotgun
// it is an evenly-spaced fan of `pellets` bullets covering `spreadSteps` of arc, centred on the
// heading.
//
// The fan offsets are computed in INTEGER heading steps and floored, so the pattern is exactly
// reproducible — the same reason headings are table indices rather than float angles. A negative
// offset wraps correctly through the mask (two's complement: -5 & 1023 === 1019).
function fireVolley(st) {
  const c = st.cfg
  const s = st.ship
  const n = c.pellets
  const spread = c.spreadSteps
  const muzzle = c.shipRadius + 1

  for (let i = 0; i < n; i++) {
    // A volley can be clipped by the global bullet cap. That is deterministic (it depends only
    // on the array length, which both sides compute identically), and pellets is clamped to 12
    // against a cap of 40 so it should never bite in practice.
    if (st.bullets.length >= MAX_BULLETS) break

    const offset = n > 1 ? Math.floor(-spread / 2 + (spread * i) / (n - 1)) : 0
    const h = (s.heading + offset) & TRIG_MASK
    const ca = headingCos(h), sa = headingSin(h)

    st.bullets.push({
      x: s.x + ca * muzzle, y: s.y + sa * muzzle,
      vx: s.vx + ca * c.bulletSpeed,
      vy: s.vy + sa * c.bulletSpeed,
      life: c.bulletLifeTicks
    })
  }

  s.cooldown = fireInterval(st)
  st.events.push({ t: 'shoot', pellets: n })
}

// ─── One simulation tick ────────────────────────────────────────────────────────────────────
// `input` is the bitmask held during THIS tick. Called exactly once per tick by both sides.
export function step(st, input) {
  if (st.over) return
  st.events.length = 0
  st.tick++

  const c = st.cfg
  const s = st.ship

  // power-up timers
  for (let i = 0; i < 3; i++) if (st.puTicks[i] > 0) st.puTicks[i]--

  if (!s.alive) {
    if (st.lives > 0) tryRespawn(st)
  } else {
    if (s.invulnTicks > 0) s.invulnTicks--

    if (input & IN_LEFT)  s.heading = (s.heading - c.turnRate) & TRIG_MASK
    if (input & IN_RIGHT) s.heading = (s.heading + c.turnRate) & TRIG_MASK

    if (input & IN_THRUST) {
      s.vx += headingCos(s.heading) * c.thrustAccel
      s.vy += headingSin(s.heading) * c.thrustAccel
      st.events.push({ t: 'thrust' })
    }
    s.vx *= c.shipDrag
    s.vy *= c.shipDrag

    // Clamp speed without sqrt: compare squared magnitude, then scale by a ratio derived from
    // a few Newton iterations — all + - * /, so it stays inside the determinism contract.
    const sp2 = s.vx * s.vx + s.vy * s.vy
    const max2 = c.maxShipSpeed * c.maxShipSpeed
    if (sp2 > max2) {
      const ratio2 = max2 / sp2
      let r = ratio2       // approximate sqrt(ratio2) by Newton's method on r^2 = ratio2
      r = 0.5 * (r + ratio2 / r)
      r = 0.5 * (r + ratio2 / r)
      r = 0.5 * (r + ratio2 / r)
      r = 0.5 * (r + ratio2 / r)
      s.vx *= r
      s.vy *= r
    }

    s.x += s.vx; s.y += s.vy
    wrap(s)

    // Auto-fire: the player steers, the ship shoots on its own cadence. Blue halves the gap.
    if (s.cooldown > 0) s.cooldown--
    if (s.cooldown === 0 && st.bullets.length < MAX_BULLETS) {
      fireVolley(st)
    }
  }

  // bullets
  for (let i = st.bullets.length - 1; i >= 0; i--) {
    const b = st.bullets[i]
    b.x += b.vx; b.y += b.vy
    wrap(b)
    if (--b.life <= 0) st.bullets.splice(i, 1)
  }

  // asteroids
  for (let i = 0; i < st.asteroids.length; i++) {
    const a = st.asteroids[i]
    a.x += a.vx; a.y += a.vy
    a.rot = (a.rot + a.spin) & TRIG_MASK
    wrap(a)
  }

  // bullet -> asteroid. Iterate bullets outer, asteroids inner, both descending, so the
  // splice order is identical on both sides.
  for (let bi = st.bullets.length - 1; bi >= 0; bi--) {
    const b = st.bullets[bi]
    for (let ai = st.asteroids.length - 1; ai >= 0; ai--) {
      const a = st.asteroids[ai]
      if (hits(b.x, b.y, 1.5, a.x, a.y, a.r)) {
        st.bullets.splice(bi, 1)
        destroyAsteroid(st, ai)
        break
      }
    }
  }

  // power-ups
  maybeSpawnPowerup(st)
  for (let i = st.powerups.length - 1; i >= 0; i--) {
    const p = st.powerups[i]
    if (--p.life <= 0) { st.powerups.splice(i, 1); continue }
    if (s.alive && hits(s.x, s.y, shipRadius(st), p.x, p.y, c.powerupRadius)) {
      grantPowerup(st, p.kind)
      st.powerups.splice(i, 1)
    }
  }

  // asteroid -> ship
  if (s.alive && !isInvulnerable(st)) {
    const sr = shipRadius(st)
    for (let ai = st.asteroids.length - 1; ai >= 0; ai--) {
      const a = st.asteroids[ai]
      if (hits(s.x, s.y, sr, a.x, a.y, a.r)) {
        destroyAsteroid(st, ai)
        killShip(st)
        break
      }
    }
  }

  // wave cleared
  if (!st.over && st.asteroids.length === 0) {
    addScore(st, c.waveClearBonus)
    st.events.push({ t: 'wave', n: st.wave + 1 })
    startWave(st)
  }
}

// ─── Input log ──────────────────────────────────────────────────────────────────────────────
// The client records one entry per CHANGE of the held input bitmask: { t: tick, a: mask }.
// Holding "rotate right" for 4 seconds is two entries, not 240. Expanding the log back into a
// per-tick mask is what the server replays against.
export function inputAtTick(log, cursor, tick) {
  // `cursor` is {i, mask} carried between calls so a replay is O(ticks + log), not O(n*m).
  while (cursor.i < log.length && log[cursor.i].t <= tick) {
    cursor.mask = log[cursor.i].a
    cursor.i++
  }
  return cursor.mask
}

// Run a whole game from an input log and return the final state. Used verbatim by the server;
// the client uses step() live and only calls this in tests.
export function simulate(seedInt, cfg, log, maxTicks) {
  const st = createState(seedInt, cfg)
  const cursor = { i: 0, mask: 0 }
  for (let tick = 1; tick <= maxTicks && !st.over; tick++) {
    step(st, inputAtTick(log, cursor, tick))
  }
  return st
}
