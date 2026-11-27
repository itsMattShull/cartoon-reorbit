// utils/snow.js
//
// Pure helpers for the December snow effect (components/effects/SnowEffect.vue). Everything that
// can be decided without a DOM lives here so it is unit-testable (tests/snow.test.js) and so the
// component itself stays a thin canvas/animation shell.
import { GAME_ROUTE_PREFIXES } from './gameRoutePrefixes.js'

// ── When ────────────────────────────────────────────────────────────────────────────────────────
// December in the *visitor's* local time (Date#getMonth is 0-based, so 11 === December). Rolls over
// by itself every year — there is no year or date range to remember to update.
export function isSnowSeason(date = new Date()) {
  return date instanceof Date && date.getMonth() === 11
}

// A visitor-level override stored in localStorage under SNOW_PREF_KEY:
//   'off' → never show snow (the visitor's own kill switch)
//   'on'  → show snow even outside December (handy for QA in any other month)
//   anything else / unset → follow the calendar
export const SNOW_PREF_KEY = 'reorbitSnow'
export function resolveSnowEnabled(pref, date = new Date()) {
  if (pref === 'off') return false
  if (pref === 'on') return true
  return isSnowSeason(date)
}

// ── Where ───────────────────────────────────────────────────────────────────────────────────────
// Pages that never get snow: the admin console, both gToons games (Clash + OG gToons), every
// arcade-style game (reusing GAME_ROUTE_PREFIXES, the site's existing definition of "a game page"),
// and the cMoon PvP/raid battle screens, which are real-time and don't want a second animation
// competing with them. The Games hub itself (/Games) is a menu, not a game, so it keeps its snow.
export const SNOW_EXCLUDED_PREFIXES = [
  '/admin',
  '/gtoons',          // gToons Clash
  '/gtoons-classic',  // OG gToons hub, match board and tournaments
  '/cmoon-pvp',
  '/cmoon-raid',
  ...GAME_ROUTE_PREFIXES
]

export function isSnowRoute(path) {
  if (typeof path !== 'string') return false
  // Nuxt route paths are case-sensitive ('/Games', '/MyCollection') — compare lowercased so a
  // page renamed in casing can't slip past the exclusion list.
  const p = path.toLowerCase().split(/[?#]/)[0]
  // Same boundary rule as isGameRoute: '/gtoons' must not swallow a hypothetical '/gtoonsfaq'.
  return !SNOW_EXCLUDED_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))
}

// ── Accumulation model ──────────────────────────────────────────────────────────────────────────
// A "perch" is the top edge of a page element. Its snow is a row of PERCH_BINS height values (px),
// spread across the element's width regardless of how wide it currently is, so resizing/rotating
// keeps the same drift shape instead of resetting it.
export const PERCH_BINS = 32

// Tuned (see tests/snow.test.js "equilibrium") so a well-travelled perch settles around 2–3px and
// never reaches the cap while flakes keep falling, and melts away in well under a minute once they
// stop — noticeable, never a growing drift.
export const SNOW = {
  stickChance: 0.5,    // chance a flake crossing a perch edge lands, × the perch's own affinity
  mobileBoost: 2.5,    // phones run far fewer flakes, so each crossing is proportionally likelier to stick
  gain: 0.7,           // px added to the bin a flake lands in (neighbours get half)
  meltBase: 0.01,      // px/s every bin loses…
  meltProp: 0.03,      // …plus this fraction of its own height per second (tall bits melt faster)
  capDesktop: 5,       // hard ceiling, px
  capMobile: 3.5
}

export function createBins() {
  return new Float32Array(PERCH_BINS)
}

export function addSnow(bins, index, amount, cap) {
  const last = bins.length - 1
  const i = index < 0 ? 0 : index > last ? last : index
  bins[i] = Math.min(cap, bins[i] + amount)
  if (i > 0) bins[i - 1] = Math.min(cap, bins[i - 1] + amount * 0.5)
  if (i < last) bins[i + 1] = Math.min(cap, bins[i + 1] + amount * 0.5)
}

// Returns the tallest bin after melting so the caller can cheaply skip drawing empty perches.
export function meltSnow(bins, dt) {
  let max = 0
  for (let i = 0; i < bins.length; i++) {
    const h = bins[i]
    if (h <= 0) continue
    const next = h - (SNOW.meltBase + SNOW.meltProp * h) * dt
    bins[i] = next > 0.02 ? next : 0
    if (bins[i] > max) max = bins[i]
  }
  return max
}

// How many flakes to run. Scales with screen area and is deliberately low on phones and on
// low-end hardware: flakes are the only per-frame cost that grows with this number.
export function flakeCount({ width, height, mobile, lite }) {
  const base = (width * height) / 16000
  const n = mobile ? Math.min(36, Math.max(18, base * 0.8)) : Math.min(90, Math.max(30, base))
  return Math.round(lite ? Math.min(n, 16) : n)
}
