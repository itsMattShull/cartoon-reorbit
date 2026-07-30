// server/utils/economyFilters.js
// Query-param parsing and SQL fragments for the Economy page's sort/filter
// controls (components/newsite/Economy.vue).
//
// Deliberately imports nothing but @prisma/client: server/utils/economyValuation.js
// pulls in `@/server/prisma`, a Nuxt-only alias that bare Node can't resolve, which
// would make these helpers untestable under `npm test` (`node --test`).
//
// Security invariants this module exists to enforce:
//   * Nothing caller-supplied is ever concatenated into SQL. Sort keys select a
//     pre-built Prisma.sql fragment (ORDER BY cannot be a bind parameter, so a
//     whitelist is the only safe option); exclusions are booleans that pick
//     between constant fragments.
//   * Redis cache-key suffixes come from a frozen lookup table indexed by
//     booleans, so a request byte can never reach a key name. Economy shares a
//     Redis namespace with `economy:aggregate:fresh` and `economy:search-rl:*`;
//     an attacker-chosen key there would let them freeze price aggregation or
//     disable another user's rate limit.
import { Prisma } from '@prisma/client'

// Matches the app's existing flag convention (server/api/auctions/all.get.js).
export function isTruthy(value) {
  if (typeof value !== 'string') return false
  const v = value.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

// h3's getQuery returns an array when a param is repeated (?x=1&x=2).
export function firstQueryValue(query, key) {
  const raw = query?.[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : undefined
}

// `Ctoon.series` is nullable free text — the admin form is an <input> with a
// suggestion-only <datalist> (pages/admin/addCtoon.vue), and bulk edit writes it
// untrimmed (server/api/admin/ctoons/bulk-edit.post.js). Real rows therefore
// carry casing and whitespace drift, so match on a normalized alias list rather
// than `series = 'Pokemon'`.
export const POKEMON_SERIES_ALIASES = Object.freeze(['pokemon', 'pokémon'])

export function parseExclusions(query) {
  return {
    hideGtoons: isTruthy(firstQueryValue(query, 'hideGtoons')),
    hidePokemon: isTruthy(firstQueryValue(query, 'hidePokemon'))
  }
}

// Extra WHERE predicates for a query that aliases "Ctoon" as `c`. Returns
// Prisma.empty when nothing is excluded so callers can splice it in
// unconditionally. The alias is hardcoded on purpose: it would land in an
// identifier position, which can't be parameterised, so accepting it as an
// argument would be an injection hole waiting for its first caller.
export function buildExclusionSql(ex) {
  const parts = []
  if (ex.hideGtoons === true) {
    parts.push(Prisma.sql`c."isGtoon" = false`)
  }
  if (ex.hidePokemon === true) {
    // COALESCE keeps NULL-series cToons visible: `series <> 'Pokemon'` evaluates
    // to NULL for them, which SQL treats as not-true, silently hiding most of
    // the table.
    parts.push(Prisma.sql`
      COALESCE(LOWER(BTRIM(c."series")), '') <> ALL (ARRAY[${Prisma.join(POKEMON_SERIES_ALIASES)}])
    `)
  }
  if (!parts.length) return Prisma.empty
  return Prisma.sql` AND ${Prisma.join(parts, ' AND ')}`
}

// Frozen 2x2 table rather than a template string: the output is provably one of
// four constants, so no request value can shape a Redis key.
const EXCLUSION_KEYS = Object.freeze([
  Object.freeze(['g0p0', 'g0p1']),
  Object.freeze(['g1p0', 'g1p1'])
])

export function exclusionCacheKey(ex) {
  return EXCLUSION_KEYS[ex.hideGtoons === true ? 1 : 0][ex.hidePokemon === true ? 1 : 0]
}

export function hasExclusions(ex) {
  return ex.hideGtoons === true || ex.hidePokemon === true
}

// LIKE metacharacters in user input would otherwise stay live — Prisma's
// `contains` doesn't escape them either, so `q=%` currently matches every cToon.
// `!` is the escape char because a backslash's meaning depends on
// standard_conforming_strings. Escape AFTER the length cap so a trailing `!`
// can't be truncated away from the character it escapes.
export function buildNamePattern(q) {
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`
}

export function buildSearchWhereSql(q, exclusions) {
  const nameSql = q
    ? Prisma.sql` AND c."name" ILIKE ${buildNamePattern(q)} ESCAPE '!'`
    : Prisma.empty
  return Prisma.sql`WHERE TRUE${nameSql}${buildExclusionSql(exclusions)}`
}

export const DEFAULT_BROWSE_SORT = 'nameAsc'

// Every ORDER BY terminates in `c."id" ASC`. `Ctoon.name` is not unique (second
// editions, re-releases) and thousands of cToons tie at volume 0, so without a
// total order Postgres is free to return rows in a different arbitrary order per
// page and rows visibly repeat or vanish across Prev/Next.
//
// `effectiveRelease` mirrors what the endpoint actually returns to the client
// (`releaseDate || createdAt`). Ordering on `releaseDate` alone would clump every
// NULL-releaseDate cToon at one end instead of interleaving it by the date shown
// on screen — and Prisma's orderBy has no COALESCE, which is why this is raw SQL.
//
// Volume sorts are DESC-only by design: an ascending volume sort would put every
// cToon with a single transaction on page 1, which is exactly the
// de-anonymisation MIN_SAMPLE_SIZE exists to prevent. Do not add one.
const BROWSE_SORTS = Object.freeze({
  nameAsc: {
    orderBy: Prisma.sql`c."name" ASC, c."id" ASC`,
    volumeSource: null
  },
  nameDesc: {
    orderBy: Prisma.sql`c."name" DESC, c."id" ASC`,
    volumeSource: null
  },
  releaseDesc: {
    orderBy: Prisma.sql`COALESCE(c."releaseDate", c."createdAt") DESC, c."name" ASC, c."id" ASC`,
    volumeSource: null
  },
  releaseAsc: {
    orderBy: Prisma.sql`COALESCE(c."releaseDate", c."createdAt") ASC, c."name" ASC, c."id" ASC`,
    volumeSource: null
  },
  tradeVolume: {
    orderBy: Prisma.sql`"rankVolume" DESC, c."name" ASC, c."id" ASC`,
    volumeSource: 'TRADE'
  },
  auctionVolume: {
    orderBy: Prisma.sql`"rankVolume" DESC, c."name" ASC, c."id" ASC`,
    volumeSource: 'AUCTION'
  }
})

export const BROWSE_SORT_KEYS = Object.freeze(Object.keys(BROWSE_SORTS))

export function isValidBrowseSort(sort) {
  return Object.prototype.hasOwnProperty.call(BROWSE_SORTS, sort)
}

// Unknown sorts fall back to the default rather than 400ing, so a stale bookmark
// or a truncated share link degrades instead of breaking the page.
export function resolveBrowseSort(sort) {
  const key = isValidBrowseSort(sort) ? sort : DEFAULT_BROWSE_SORT
  return { key, ...BROWSE_SORTS[key] }
}

export function isVolumeSort(sort) {
  return resolveBrowseSort(sort).volumeSource !== null
}
