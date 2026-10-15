// utils/ogGtoonReveal.js
// Shared (client + server) timing for the one-card-at-a-time reveal of Original gToons.
// The server sends an ordered list of reveal `steps` (player 1's slot-1 card, player 2's slot-1 card,
// player 1's slot-2 card, ...), each carrying the resolved board AFTER that card landed. The client
// plays them back with these timings, and the server pushes the next phase's deadline out by the same
// amount so nobody loses clock time to the animation.
//
// The values are admin-tunable (Manage Games > gToons (Original)); the server reads them from
// GameConfig and stamps the ones in force onto every reveal payload as `reveal.timing`, so the
// animation and the clock extension always use the same numbers.

export const REVEAL_TIMING_DEFAULTS = Object.freeze({
  firstMs: 600,     // pause before the first card flips
  cardMs: 700,      // a freshly flipped card is shown with its printed value
  effectsMs: 900,   // then its effects land: values, colors, knock-outs and scores update
  quietMs: 300      // ...or a short beat when nothing else changed
})

export const REVEAL_TIMING_LIMITS = Object.freeze({
  firstMs: { min: 0, max: 5000 },
  cardMs: { min: 200, max: 5000 },
  effectsMs: { min: 0, max: 5000 },
  quietMs: { min: 0, max: 3000 }
})

// Back-compat names for the defaults.
export const REVEAL_FIRST_MS = REVEAL_TIMING_DEFAULTS.firstMs
export const REVEAL_CARD_MS = REVEAL_TIMING_DEFAULTS.cardMs
export const REVEAL_EFFECTS_MS = REVEAL_TIMING_DEFAULTS.effectsMs
export const REVEAL_QUIET_MS = REVEAL_TIMING_DEFAULTS.quietMs

/** Any input (null, partial, strings, junk) -> a complete, clamped { firstMs, cardMs, effectsMs, quietMs }. */
export function normalizeRevealTiming(raw) {
  const out = {}
  for (const key of Object.keys(REVEAL_TIMING_DEFAULTS)) {
    const { min, max } = REVEAL_TIMING_LIMITS[key]
    const v = raw && typeof raw === 'object' ? raw[key] : undefined
    const n = v === null || v === undefined || v === '' ? NaN : Number(v)
    out[key] = Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : REVEAL_TIMING_DEFAULTS[key]
  }
  return out
}

export function revealStepMs(step, timing) {
  const t = normalizeRevealTiming(timing)
  return t.cardMs + (step && step.changed ? t.effectsMs : t.quietMs)
}

export function revealDurationMs(steps, timing) {
  if (!Array.isArray(steps) || !steps.length) return 0
  const t = normalizeRevealTiming(timing)
  return t.firstMs + steps.reduce((sum, s) => sum + revealStepMs(s, t), 0)
}
