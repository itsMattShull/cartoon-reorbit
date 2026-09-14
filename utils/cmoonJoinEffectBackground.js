// utils/cmoonJoinEffectBackground.js
// Computes the CSS `:style` background value for a CMoonJoinEffect config — either a flat fill,
// or (when `vignette` is set) a radial gradient derived from that same backgroundColor, matching
// the look several built-in effects hand-author with their own fixed colors (see the
// radial-gradient backgrounds in components/effects/FrogEffect.vue, FireworksEffect.vue,
// SlimeFloodEffect.vue). Shared by CustomJoinEffect.vue (the effect itself) and
// FullscreenEffectHost.vue (the overlay's own background during the exit fade, so that fade is a
// continuation of whichever style was already showing, not a cut to a flat color).
//
// Always returns an object for Vue's object-syntax `:style` binding — never a string to
// concatenate — same rule as every other cMoon color reaching a `:style` (see utils/cmoonColor.js
// and the security review this feature went through).
const HEX_RE = /^#([0-9a-fA-F]{6})$/

function hexToRgb(hex) {
  const m = HEX_RE.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function toHex2(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

// factor in (-1, 1): positive mixes toward white (lighten), negative toward black (darken).
function shade(hex, factor) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const target = factor > 0 ? 255 : 0
  const amount = Math.abs(factor)
  const mix = (c) => c + (target - c) * amount
  return `#${toHex2(mix(rgb.r))}${toHex2(mix(rgb.g))}${toHex2(mix(rgb.b))}`
}

export function cmoonJoinEffectBackgroundStyle(config) {
  const color = config?.backgroundColor
  if (!HEX_RE.test(color || '')) return {}
  if (!config?.vignette) return { background: color }
  const light = shade(color, 0.2)
  const dark = shade(color, -0.45)
  return { background: `radial-gradient(circle at 50% 45%, ${light} 0%, ${color} 55%, ${dark} 100%)` }
}
