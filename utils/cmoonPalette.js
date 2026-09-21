// utils/cmoonPalette.js
//
// Derives a full, readable UI palette from a single admin-chosen cMoon.color
// hex value, for the cMoon-themed cToon modal variant and the cMoon page.
//
// Deliberately cheap (a handful of HSL conversions + a bounded contrast-fix
// loop) — call it inline in a `computed()`, no memoization needed.
//
// Every text/background pairing below is nudged, via WCAG contrast math
// shared with utils/cmoonColor.js, until it clears a real contrast ratio —
// never picked by a fixed lightness threshold alone — so an admin can choose
// ANY hex (a pale pastel, a near-black, a saturated primary) and the modal
// stays legible. Consumers must bind the result through a `:style` object
// (never string-concatenate it into CSS), same rule utils/cmoonColor.js
// already follows, so a hex value can never smuggle extra CSS declarations.
import { isSafeCMoonColor, relativeLuminance, contrast } from './cmoonColor'

const FALLBACK_COLOR = '#3a4a63'
const BLACK = '#000000'
const WHITE = '#ffffff'

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
}

function rgbToHex(r, g, b) {
  const c = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0, s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60)       { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

function hexToHsl(hex) { return rgbToHsl(...hexToRgb(hex)) }
function hslToHex(h, s, l) { return rgbToHex(...hslToRgb(h, clamp(s, 0, 100), clamp(l, 0, 100))) }

// Finds a background lightness (same hue/saturation) that clears `min`
// contrast against a FIXED text color, nudging away from the seed lightness
// toward whichever extreme helps that text color.
function bgForFixedText(h, s, seedL, textHex, min, iterations = 8) {
  const towardLighter = textHex === BLACK
  let l = seedL
  let hex = hslToHex(h, s, l)
  for (let i = 0; i < iterations; i++) {
    const ratio = contrast(relativeLuminance(textHex), relativeLuminance(hex))
    if (ratio >= min) return hex
    l = towardLighter ? clamp(l + 6, 0, 98) : clamp(l - 6, 2, 100)
    hex = hslToHex(h, s, l)
  }
  return hex
}

// Finds a text lightness (same hue, usually desaturated) that clears `min`
// contrast against a FIXED background hex.
function textForFixedBg(h, s, seedL, bgHex, min, iterations = 8) {
  const bgIsLight = relativeLuminance(bgHex) > 0.5
  let l = seedL
  let hex = hslToHex(h, s, l)
  for (let i = 0; i < iterations; i++) {
    const ratio = contrast(relativeLuminance(hex), relativeLuminance(bgHex))
    if (ratio >= min) return hex
    l = bgIsLight ? clamp(l - 6, 0, 42) : clamp(l + 6, 58, 100)
    hex = hslToHex(h, s, l)
  }
  return hex
}

/**
 * Returns a plain object of hex/rgba strings — never a CSS string — meant to
 * be spread into a Vue `:style` object as `--cm-*` custom properties.
 *
 * `input` is either a bare hex string (legacy call shape — everything derives from that one
 * color, exactly as before) or an object `{ color, pageBgColor, accentColor, textColor,
 * cardBgColor }`. The four optional fields are per-role overrides an admin can set independently
 * instead of only ever picking one seed hex (see CMoon.pageBgColor/accentColor/textColor/
 * cardBgColor in prisma/schema.prisma) — `color` is still required and is what every field below
 * derives from whenever its own override is absent/invalid.
 *
 * An override, when present and a valid hex, ALWAYS wins outright — including when it breaks the
 * "never mix a light-text and a dark-text surface" invariant the auto-derivation otherwise
 * enforces (e.g. an admin sets both a light textColor and a light pageBgColor). This function
 * never rejects or silently clamps that combination; utils/cmoonColor.js's cMoonContrastRatio-
 * style check is how the admin UI warns about it (see AdminCMoon.vue), matching how a bad
 * single-color contrast has always been a warning here, never a hard block.
 */
export function cMoonPalette(input) {
  const opts = typeof input === 'string' ? { color: input } : (input || {})
  const base = isSafeCMoonColor(opts.color) ? opts.color : FALLBACK_COLOR
  const { h, s: rawS, l: baseL } = hexToHsl(base)
  const s = Math.min(rawS, 55)
  const isDarkBase = baseL < 50

  // Base slots: an explicit, validly-formatted override is used as-is; otherwise the same
  // auto-derivation as before, seeded from `color`.
  const text = isSafeCMoonColor(opts.textColor) ? opts.textColor : (isDarkBase ? WHITE : BLACK)
  const bg = isSafeCMoonColor(opts.pageBgColor)
    ? opts.pageBgColor
    : bgForFixedText(h, s, isDarkBase ? 15 : 94, text, 4.5)
  const tileBg = isSafeCMoonColor(opts.cardBgColor)
    ? opts.cardBgColor
    : bgForFixedText(h, s, isDarkBase ? 23 : 86, text, 4.5)

  // Secondary slots (never independently overridable — see this function's header comment on
  // why only a curated set of roles is exposed) always derive from whichever `bg`/`text` are
  // ACTUALLY in play above, not from the admin's raw base color — seeding their hue/saturation
  // from `bg` itself keeps them harmonious even when `bg` is an override unrelated to `color`'s
  // own hue.
  const bgIsLight = relativeLuminance(bg) > 0.5
  const { h: bgH, s: bgRawS } = hexToHsl(bg)
  const textMuted = textForFixedBg(bgH, Math.min(bgRawS, 30), bgIsLight ? 34 : 74, bg, 4.5)
  const border = textForFixedBg(bgH, Math.min(bgRawS, 40), bgIsLight ? 56 : 48, bg, 3)

  // A handful of hardcoded reds/greens in the modal (error text, sale-value
  // text) were tuned only for the old fixed dark-navy background. Once the
  // panel background itself can be an arbitrary light or dark tint, those
  // need their own contrast-verified, hue-locked (red/green) text colors
  // rather than inheriting a fixed hex that assumed a dark backdrop.
  const danger = textForFixedBg(4, 75, bgIsLight ? 38 : 74, bg, 4.5)
  const success = textForFixedBg(142, 55, bgIsLight ? 30 : 74, bg, 4.5)

  // Banner keeps its seed color's actual hue/saturation (it's the one place meant to look like
  // "their" color) — only lightness is nudged, and only if needed, so a hue that already clears
  // 4.5:1 is left untouched. accentColor (if set) is that seed instead of the raw base color.
  const accentSeed = isSafeCMoonColor(opts.accentColor) ? opts.accentColor : base
  const { h: bh, s: bRawS, l: bBaseL } = hexToHsl(accentSeed)
  let bannerL = bBaseL
  let banner = hslToHex(bh, bRawS, bannerL)
  // Pick whichever of black/white actually contrasts more against the raw accent seed.
  const pickBannerText = (hex) => {
    const lum = relativeLuminance(hex)
    const dark = contrast(relativeLuminance(BLACK), lum)
    const light = contrast(relativeLuminance(WHITE), lum)
    return dark >= light ? BLACK : WHITE
  }
  let bannerText = pickBannerText(banner)
  for (let i = 0; i < 6; i++) {
    const ratio = contrast(relativeLuminance(bannerText), relativeLuminance(banner))
    if (ratio >= 4.5) break
    bannerL = bannerText === BLACK ? clamp(bannerL + 5, 0, 90) : clamp(bannerL - 5, 10, 100)
    banner = hslToHex(bh, bRawS, bannerL)
  }

  return {
    bg,
    tileBg,
    text,
    textMuted,
    border,
    banner,
    bannerText,
    // Links/focus rings reuse `text`, which is already contrast-verified
    // against both `bg` and `tileBg` (both were solved for the same fixed
    // text color), so nothing further to check here.
    linkBg: tileBg,
    linkText: text,
    focusRing: text,
    hairline: bgIsLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)',
    thumbBg: tileBg,
    danger,
    success
  }
}

/** Converts a cMoonPalette() result into `--cm-*` CSS custom properties for `:style`. Takes the
 * same bare-hex-string-or-per-role-object `input` shape cMoonPalette() does. */
export function cMoonPaletteStyle(input) {
  const p = cMoonPalette(input)
  return {
    '--cm-bg': p.bg,
    '--cm-tile-bg': p.tileBg,
    '--cm-text': p.text,
    '--cm-text-muted': p.textMuted,
    '--cm-border': p.border,
    '--cm-banner': p.banner,
    '--cm-banner-text': p.bannerText,
    '--cm-link-bg': p.linkBg,
    '--cm-link-text': p.linkText,
    '--cm-focus-ring': p.focusRing,
    '--cm-hairline': p.hairline,
    '--cm-thumb-bg': p.thumbBg,
    '--cm-danger': p.danger,
    '--cm-success': p.success
  }
}
