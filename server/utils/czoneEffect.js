// server/utils/czoneEffect.js
// Validation for admin-authored CZoneEffect rows — customizable cZone border/glow visuals
// assignable to a CMoonAffinityLevel (see prisma/schema.prisma). Mirrors
// server/utils/cmoonJoinEffect.js's shape/convention.
import { isValidHexColor } from '@/server/utils/cmoon'

export const NAME_MAX_LENGTH = 60

export const KINDS = ['BORDER', 'GLOW']

// Capped well below the topbar/bottombar's own fixed heights (34px/35px — see TOPBAR_H/
// BOTTOMBAR_H in components/newsite/MyCzone.vue) rather than at some larger "looks cool in
// isolation" number: the border/glow is an inset effect eating into the frame from all four
// edges at once, so an unbounded thickness/radius can visually bury the topbar's buttons and the
// bottombar's nav controls under solid color long before it looks like a design choice — verified
// against the real bar heights via an isolated Playwright render at these exact maximums.
export const THICKNESS_MIN = 1
export const THICKNESS_MAX = 14

export const GLOW_RADIUS_MIN = 0
export const GLOW_RADIUS_MAX = 30

export const OPACITY_MIN = 0.1
export const OPACITY_MAX = 1

// Seconds per pulse cycle. Floored above zero-ish to keep the fastest setting a lively pulse
// rather than a rapid strobe — a fast full-field brightness flicker is a photosensitive-seizure
// risk (WCAG 2.3.1's three-flashes-per-second threshold), so 0.6s (< ~1.7Hz) stays well clear of
// it while still reading as "fast".
export const SPEED_MIN = 0.6
export const SPEED_MAX = 10

export function isValidCZoneEffectName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= NAME_MAX_LENGTH
}

export function isValidCZoneEffectKind(value) {
  return KINDS.includes(value)
}

export function isValidCZoneEffectThickness(value) {
  return Number.isInteger(value) && value >= THICKNESS_MIN && value <= THICKNESS_MAX
}

export function isValidCZoneEffectGlowRadius(value) {
  return Number.isInteger(value) && value >= GLOW_RADIUS_MIN && value <= GLOW_RADIUS_MAX
}

export function isValidCZoneEffectOpacity(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= OPACITY_MIN && value <= OPACITY_MAX
}

export function isValidCZoneEffectSpeed(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= SPEED_MIN && value <= SPEED_MAX
}

// Shared by the create/update admin endpoints — five numeric fields is enough surface that
// duplicating the parse-and-validate logic across both risks the two drifting apart (unlike the
// two-color-field CMoonJoinEffect endpoints this otherwise mirrors). `existing` is the current row
// on an update (undefined on create), used the same way the join-effect PUT endpoint keeps
// unspecified fields: `body.field === undefined` means "leave unchanged".
// Defaults applied when a UserCMoonBorder/UserCMoonGlow row has no effectId. The migration that
// introduced CZoneEffect backfilled effectId on every pre-existing grant it could (pointing each
// at that cMoon's seeded "legacy" effect — see that migration's own comment), so this null case is
// now the narrow leftover: a grant whose cMoon had no grantsBorder/grantsGlow=true level left to
// seed a legacy effect from at migration time. These constants exist so even that edge case
// renders the exact pre-CZoneEffect hardcoded look (a flat 10px border / a 6px-16px pulsing glow
// at a 2.4s cycle) rather than silently jumping to whatever this file's CZoneEffect model defaults
// happen to be. Deletion of an in-use effect is blocked, so null can never mean "the effect it
// pointed at was deleted" either.
export const LEGACY_BORDER_THICKNESS = 10
export const LEGACY_GLOW_THICKNESS = 6
export const LEGACY_GLOW_RADIUS = 16
export const LEGACY_OPACITY = 1
export const LEGACY_GLOW_SPEED = 2.4

// Resolves a UserCMoonBorder row (with its `effect` and `cMoon` relations loaded) into the flat
// shape the client renders from — one place for the "effect if present, else legacy cMoon-color
// fallback" logic so server/api/auth/me.get.js and server/api/czone/[username].get.js can't drift
// from each other.
export function resolveBorderStyle(row) {
  if (!row) return null
  return {
    cMoonId: row.cMoonId,
    name: row.cMoon?.name || '',
    color: row.effect?.color || row.cMoon?.color || '#888888',
    thickness: row.effect?.thickness ?? LEGACY_BORDER_THICKNESS,
    opacity: row.effect?.opacity ?? LEGACY_OPACITY,
  }
}

// Same as resolveBorderStyle but for UserCMoonGlow, including the GLOW-only glowRadius/speed
// fields.
export function resolveGlowStyle(row) {
  if (!row) return null
  return {
    cMoonId: row.cMoonId,
    name: row.cMoon?.name || '',
    color: row.effect?.color || row.cMoon?.color || '#888888',
    thickness: row.effect?.thickness ?? LEGACY_GLOW_THICKNESS,
    glowRadius: row.effect?.glowRadius ?? LEGACY_GLOW_RADIUS,
    opacity: row.effect?.opacity ?? LEGACY_OPACITY,
    speed: row.effect?.speed ?? LEGACY_GLOW_SPEED,
  }
}

export function parseCZoneEffectBody(body, existing) {
  const name = body?.name === undefined
    ? (existing ? existing.name : '')
    : String(body.name).trim()
  const kind = body?.kind === undefined
    ? (existing ? existing.kind : '')
    : String(body.kind).trim()
  const color = body?.color === undefined
    ? (existing ? existing.color : '')
    : String(body.color).trim()
  // Number(body.field) on an already-numeric value is a no-op; on a string it parses; on
  // anything else (object, array, malformed) it yields NaN, which every isValid*() check below
  // correctly rejects rather than silently coercing to 0.
  const thickness = body?.thickness === undefined
    ? (existing ? existing.thickness : NaN)
    : Math.round(Number(body.thickness))
  const glowRadius = body?.glowRadius === undefined
    ? (existing ? existing.glowRadius : NaN)
    : Math.round(Number(body.glowRadius))
  const opacity = body?.opacity === undefined
    ? (existing ? existing.opacity : NaN)
    : Number(body.opacity)
  const speed = body?.speed === undefined
    ? (existing ? existing.speed : NaN)
    : Number(body.speed)

  if (!isValidCZoneEffectName(name)) {
    return { ok: false, message: `Name is required (max ${NAME_MAX_LENGTH} characters)` }
  }
  if (!isValidCZoneEffectKind(kind)) {
    return { ok: false, message: 'Kind must be BORDER or GLOW' }
  }
  if (existing && existing.kind !== kind) {
    // Changing kind out from under existing affinity-level assignments/grants would silently
    // repurpose e.g. a GLOW pick into a static BORDER (or vice versa) without anyone re-reviewing
    // those assignments — force creating a new effect instead.
    return { ok: false, message: 'Kind cannot be changed after creation — create a new effect instead' }
  }
  if (!isValidHexColor(color)) {
    return { ok: false, message: 'Color must be a hex value like #3366ff' }
  }
  if (!isValidCZoneEffectThickness(thickness)) {
    return { ok: false, message: `Thickness must be a whole number between ${THICKNESS_MIN} and ${THICKNESS_MAX}` }
  }
  if (!isValidCZoneEffectGlowRadius(glowRadius)) {
    return { ok: false, message: `Glow radius must be a whole number between ${GLOW_RADIUS_MIN} and ${GLOW_RADIUS_MAX}` }
  }
  if (!isValidCZoneEffectOpacity(opacity)) {
    return { ok: false, message: `Opacity must be a number between ${OPACITY_MIN} and ${OPACITY_MAX}` }
  }
  if (!isValidCZoneEffectSpeed(speed)) {
    return { ok: false, message: `Speed must be a number between ${SPEED_MIN} and ${SPEED_MAX} seconds` }
  }

  return { ok: true, data: { name, kind, color, thickness, glowRadius, opacity, speed } }
}
