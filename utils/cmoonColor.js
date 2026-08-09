// utils/cmoonColor.js
// cMoon colors are admin-chosen hex values with no guaranteed contrast against
// any particular background. Render them as a small pill (color as background,
// not text) with black/white text picked by relative luminance, so an
// arbitrarily dark or light admin choice always stays readable.
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isSafeCMoonColor(color) {
  return typeof color === 'string' && HEX_RE.test(color)
}

function contrastTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.5 ? '#0a1830' : '#ffffff'
}

// Returns a style object safe to bind with :style — never a raw string, so an
// admin-entered value can't smuggle extra CSS declarations.
export function cMoonPillStyle(color) {
  if (!isSafeCMoonColor(color)) return { background: '#3a4a63', color: '#ffffff' }
  return { background: color, color: contrastTextColor(color) }
}
