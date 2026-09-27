// utils/encyclopediaSlug.js
// Single source of truth for the Encyclopedia slug shape, shared between the admin editor
// (components/newsite/AdminManageEncyclopedia.vue, for the live title→slug preview) and the
// server-side validator (server/utils/encyclopedia.js, imported via a relative path per this
// codebase's own convention for a root utils/ file needed from inside server/utils/ — see
// server/utils/cmoon.js's own import of utils/cmoonEffectTypes.js for the precedent) — so the
// two can never quietly drift apart into "the client suggests a slug the server then rejects."
// server/utils/sanitizeEncyclopediaHtml.js keeps its own copy of the shape as a literal regex
// rather than importing this file — see that file's header comment for why.

export const SLUG_MAX_LENGTH = 96
export const SLUG_RE = /^[a-z0-9-]{1,96}$/

export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
}

export function isValidSlug(value) {
  return typeof value === 'string' && SLUG_RE.test(value)
}
