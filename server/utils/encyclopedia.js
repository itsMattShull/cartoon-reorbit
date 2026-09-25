// server/utils/encyclopedia.js
// Validation + parsing for admin-authored Encyclopedia entries — mirrors
// server/utils/cmoonEnemy.js's shape/convention: pure functions, no DB access. Existence checks
// (slug uniqueness) are the calling endpoint's job, since that needs Prisma and this module
// deliberately doesn't.
import { sanitizeEncyclopediaHtml } from './sanitizeEncyclopediaHtml.js'

export const TITLE_MAX_LENGTH = 120
export const SLUG_MAX_LENGTH = 96
// Kept as a literal here (not imported from sanitizeEncyclopediaHtml.js) for the same reason
// that file gives for not importing this one back — see its own header comment.
export const SLUG_RE = /^[a-z0-9-]{1,96}$/

export const SORT_ORDER_MIN = -9999
export const SORT_ORDER_MAX = 9999

// Path segments already used as static routes under server/api/encyclopedia/ — Nitro/h3 matches a
// static route ahead of a dynamic [slug] one at the same depth, so an entry slugged "entries"
// would be permanently unreachable at GET /api/encyclopedia/entries (always shadowed by
// entries.get.js's own list handler) if this weren't blocked here.
const RESERVED_SLUGS = new Set(['entries'])

// Kebab-cases a title into a candidate slug: lowercase, non-alphanumeric runs collapsed to a
// single hyphen, leading/trailing hyphens trimmed, capped at SLUG_MAX_LENGTH. Purely a starting
// suggestion for a NEW entry — an admin can always override it, and editing the title later never
// re-derives or touches an existing slug (see parseEntryBody's own comment).
export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
}

export function isValidTitle(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= TITLE_MAX_LENGTH
}

export function isValidSlug(value) {
  return typeof value === 'string' && SLUG_RE.test(value)
}

export function isValidSortOrder(value) {
  return Number.isInteger(value) && value >= SORT_ORDER_MIN && value <= SORT_ORDER_MAX
}

function toNumber(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return NaN
}

function toBoolean(value, fallback) {
  if (value === undefined) return fallback
  return typeof value === 'boolean' ? value : null
}

// `existing` is the current row on an update (undefined on create), same convention as
// parseFactionBody/parseMemberBody in cmoonEnemy.js — `input.field === undefined` means "leave
// unchanged".
//
// Slug handling is deliberately asymmetric from every other field: on CREATE, an omitted/blank
// slug is auto-derived from the title (slugify), but on UPDATE an omitted slug keeps the
// EXISTING value untouched — it is never re-derived from an edited title. Encyclopedia entries
// are meant to be cross-linked by other entries' body text (see this feature's whole reason for
// existing); silently changing a slug whenever an admin tweaks a title would quietly break every
// inbound link. Changing the slug is still possible, just has to be explicit.
export function parseEntryBody(input, existing) {
  const title = input?.title === undefined
    ? (existing ? existing.title : '')
    : (typeof input.title === 'string' ? input.title.trim() : '')

  let slug
  if (input?.slug !== undefined) {
    slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  } else if (existing) {
    slug = existing.slug
  } else {
    slug = slugify(title)
  }

  const body = input?.body === undefined
    ? (existing ? existing.body : '')
    : (typeof input.body === 'string' ? sanitizeEncyclopediaHtml(input.body) : '')

  const active = toBoolean(input?.active, existing ? existing.active : true)
  const sortOrder = input?.sortOrder === undefined
    ? (existing ? existing.sortOrder : 0)
    : toNumber(input.sortOrder)

  if (!isValidTitle(title)) {
    return { ok: false, message: `Title is required (max ${TITLE_MAX_LENGTH} characters)` }
  }
  if (!isValidSlug(slug)) {
    return { ok: false, message: 'Slug must be lowercase letters, numbers, and hyphens only (no spaces)' }
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, message: `"${slug}" is reserved and can't be used as a slug` }
  }
  if (active === null) {
    return { ok: false, message: 'Active must be true or false' }
  }
  if (!isValidSortOrder(sortOrder)) {
    return { ok: false, message: `Sort order must be a whole number between ${SORT_ORDER_MIN} and ${SORT_ORDER_MAX}` }
  }

  return { ok: true, data: { title, slug, body, active, sortOrder } }
}
