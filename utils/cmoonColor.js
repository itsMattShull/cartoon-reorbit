// utils/cmoonColor.js
// cMoon colors are admin-chosen hex values with no guaranteed contrast against
// any particular background. Render them as a small pill (color as background,
// not text) with black/white text picked by whichever actually contrasts more,
// so an arbitrarily dark or light admin choice always stays readable.
const HEX_RE = /^#[0-9a-fA-F]{6}$/

const DARK_TEXT = '#000000'
const LIGHT_TEXT = '#ffffff'
const FALLBACK_BG = '#3a4a63'

export function isSafeCMoonColor(color) {
  return typeof color === 'string' && HEX_RE.test(color)
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const [r, g, b] = channels.map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(l1, l2) {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// Compare both candidates rather than guessing from a luminance threshold. A
// fixed threshold mispicks across a wide band of ordinary mid-tone colors —
// e.g. #b8860b and #808080 got white text at ~3.3:1 and ~3.9:1.
function contrastTextColor(hex) {
  const bg = relativeLuminance(hex)
  const dark = contrast(relativeLuminance(DARK_TEXT), bg)
  const light = contrast(relativeLuminance(LIGHT_TEXT), bg)
  return dark >= light ? DARK_TEXT : LIGHT_TEXT
}

// Contrast ratio the pill will actually render at, so the admin form can warn
// before an unreadable color reaches leaderboards and cZones.
export function cMoonContrastRatio(color) {
  const hex = isSafeCMoonColor(color) ? color : FALLBACK_BG
  const bg = relativeLuminance(hex)
  return Math.max(
    contrast(relativeLuminance(DARK_TEXT), bg),
    contrast(relativeLuminance(LIGHT_TEXT), bg),
  )
}

// Returns a style object safe to bind with :style — never a raw string, so an
// admin-entered value can't smuggle extra CSS declarations.
export function cMoonPillStyle(color) {
  if (!isSafeCMoonColor(color)) return { background: FALLBACK_BG, color: LIGHT_TEXT }
  return { background: color, color: contrastTextColor(color) }
}
