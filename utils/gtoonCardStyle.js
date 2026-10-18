// utils/gtoonCardStyle.js
// Shared (client + server) definition of the cosmetic "round card" look for Original gToons.
// Saved per cToon in Ctoon.gtoonCardStyle (Json). Purely visual — game rules still read gtoonColor.

export const GTOON_THEMES = ['default', 'stellar', 'cosmic']

// One-shot effects play once (on reveal / click). Ambient effects loop until stopped.
export const GTOON_ONE_SHOT_FX = [
  { key: 'prismaFlare', label: 'Prisma Flare' },
  { key: 'lensFlare', label: 'Lens Flare' },
  { key: 'opticalFlare', label: 'Optical Flare' },
  { key: 'anamorphicFlare', label: 'Anamorphic Flare' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'gas', label: 'Gas' },
  { key: 'lensLeak', label: 'Lens Leak' },
  { key: 'blackHole', label: 'Black Hole' }
]
export const GTOON_AMBIENT_FX = [
  { key: 'lightning', label: 'Lightning' },
  { key: 'solar', label: 'Solar Flare' },
  { key: 'heatwave', label: 'Heatwave' },
  { key: 'plasma', label: 'Plasma' },
  { key: 'plasmaLite', label: 'Plasma Lite' },
  { key: 'fiery', label: 'Fiery Particles' },
  { key: 'starry', label: 'Starry Particles' }
]

export const GTOON_PARAM_LIMITS = {
  flareMs: { min: 300, max: 2500, step: 50, def: 900 },
  blackHoleMs: { min: 1200, max: 8000, step: 100, def: 3400 },
  lightningDelay: { min: 300, max: 4000, step: 100, def: 2000 }
}
export const GTOON_ROTATION_LIMITS = { min: -180, max: 180 }

// Card palette. Keys are Ctoon.gtoonColor enum values. wvring/wvStart/wvEnd come from the
// drawcard UFO_PALETTE; PINK is new (not on the original page).
export const GTOON_PALETTE = {
  RED: { wvStart: 'rgb(150, 10, 20)', wvEnd: 'rgb(255, 30, 40)', wvring: '#ff1a1a' },
  ORANGE: { wvStart: 'rgb(189, 106, 12)', wvEnd: 'rgb(253, 158, 33)', wvring: '#ff9900' },
  YELLOW: { wvStart: 'rgb(150, 140, 10)', wvEnd: 'rgb(230, 220, 40)', wvring: '#ffff00' },
  GREEN: { wvStart: 'rgb(40, 140, 50)', wvEnd: 'rgb(45, 215, 75)', wvring: '#05d659' },
  BLUE: { wvStart: 'rgb(30, 90, 190)', wvEnd: 'rgb(30, 195, 255)', wvring: '#0099ff' },
  PURPLE: { wvStart: 'rgb(110, 30, 140)', wvEnd: 'rgb(240, 60, 245)', wvring: '#ff00ff' },
  PINK: { wvStart: 'rgb(190, 50, 120)', wvEnd: 'rgb(255, 120, 190)', wvring: '#ff69b4' },
  BLACK: { wvStart: 'rgb(20, 20, 20)', wvEnd: 'rgb(50, 70, 80)', wvring: '#182228' },
  SILVER: { wvStart: 'rgb(140, 140, 140)', wvEnd: 'rgb(192, 192, 192)', wvring: '#c0c0c0' }
}
export const GTOON_COLOR_ORDER = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE', 'PINK', 'BLACK', 'SILVER']

export function defaultGtoonCardStyle() {
  return {
    rotation: 0,
    theme: 'default',
    signalNoise: true,
    oneShot: [],
    ambient: [],
    params: {
      flareMs: GTOON_PARAM_LIMITS.flareMs.def,
      blackHoleMs: GTOON_PARAM_LIMITS.blackHoleMs.def,
      lightningDelay: GTOON_PARAM_LIMITS.lightningDelay.def,
      pulseLoop: false
    }
  }
}

const clamp = (n, min, max, def) => {
  const v = Number(n)
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def
}

/** Accepts anything (object, JSON string, null) and returns a fully-populated, safe style. */
export function sanitizeGtoonCardStyle(raw) {
  const out = defaultGtoonCardStyle()
  let src = raw
  if (typeof src === 'string') {
    try { src = JSON.parse(src) } catch { src = null }
  }
  if (!src || typeof src !== 'object') return out

  out.rotation = Math.round(clamp(src.rotation, GTOON_ROTATION_LIMITS.min, GTOON_ROTATION_LIMITS.max, 0))
  out.theme = GTOON_THEMES.includes(src.theme) ? src.theme : 'default'
  out.signalNoise = src.signalNoise !== false

  const pick = (list, catalog) => {
    const allowed = new Set(catalog.map(f => f.key))
    return [...new Set((Array.isArray(list) ? list : []).filter(k => allowed.has(k)))]
  }
  out.oneShot = pick(src.oneShot, GTOON_ONE_SHOT_FX)
  out.ambient = pick(src.ambient, GTOON_AMBIENT_FX)

  const p = src.params && typeof src.params === 'object' ? src.params : {}
  const L = GTOON_PARAM_LIMITS
  out.params.flareMs = Math.round(clamp(p.flareMs, L.flareMs.min, L.flareMs.max, L.flareMs.def))
  out.params.blackHoleMs = Math.round(clamp(p.blackHoleMs, L.blackHoleMs.min, L.blackHoleMs.max, L.blackHoleMs.def))
  out.params.lightningDelay = Math.round(clamp(p.lightningDelay, L.lightningDelay.min, L.lightningDelay.max, L.lightningDelay.def))
  out.params.pulseLoop = p.pulseLoop === true
  return out
}
