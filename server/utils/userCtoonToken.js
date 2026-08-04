// server/utils/userCtoonToken.js
// Pure parsing and keying for the synthetic `uc|userId|ctoonId|mint` cToon
// reference that the collection/search/owners endpoints hand to the client.
//
// Deliberately imports nothing: server/utils/userCtoonId.js pulls in
// `@/server/prisma`, a Nuxt-only alias that bare Node can't resolve, which would
// make these helpers untestable under `npm test` (`node --test`). Same split as
// tradeOfferRules.js / tradeOffer.js — see tests/userCtoonToken.test.js.

/**
 * A token segment has to be a plausible id and nothing else.
 *
 * This is the guard that keeps a malformed token from widening a batched query.
 * Resolution used to run one findFirst per token, so a token that parsed to
 * `undefined` produced one broken query and nothing more. Batched, every token
 * contributes a branch to a single `where`, and Prisma STRIPS undefined-valued
 * keys from a where object — so a branch built from `{ userId: undefined,
 * ctoonId: undefined }` collapses to `{}` and matches every row in the table.
 * One junk token would then resolve every other token in the batch to an
 * arbitrary stranger's cToon. Segments are validated before they are ever
 * allowed to become a predicate.
 */
const SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/

/// Mint numbers are `Int?` in the schema. Anchored, digits-only, and no leading
/// zeros on purpose: parseInt would happily read '01', '1e5', '1.9', '+1' and
/// ' 1' as 1, giving five spellings of one cToon that survive the string-level
/// dedupe in normalizeCtoonIdList and collide only at the unique constraint.
/// encodeUserCtoonId never emits a leading zero, so accepting one is pure
/// attack surface.
const MINT_RE = /^(0|[1-9]\d{0,8})$/

export function encodeUserCtoonId (userId, ctoonId, mintNumber) {
  const m = mintNumber == null ? 'x' : String(mintNumber)
  return `uc|${userId}|${ctoonId}|${m}`
}

export function isSyntheticUserCtoonId (id) {
  return typeof id === 'string' && id.startsWith('uc|')
}

/**
 * Parses a synthetic token into `{ userId, ctoonId, mintNumber }`, or returns
 * null for anything malformed. Never throws and never returns a partial object:
 * callers turn a null into "unresolvable", which every call site already
 * handles, rather than into a query predicate.
 */
export function parseUserCtoonToken (input) {
  if (!isSyntheticUserCtoonId(input)) return null
  const parts = input.split('|')
  // Exactly four parts. `'uc|a|b'` would otherwise leave the mint undefined and
  // `'uc|a|b|1|2'` would silently discard the tail.
  if (parts.length !== 4) return null
  const [, userId, ctoonId, mintStr] = parts
  if (!SEGMENT_RE.test(userId) || !SEGMENT_RE.test(ctoonId)) return null
  if (mintStr !== 'x' && !MINT_RE.test(mintStr)) return null
  return { userId, ctoonId, mintNumber: mintStr === 'x' ? null : Number(mintStr) }
}

/**
 * The key a resolved row is looked up by. Includes the userId on purpose:
 * `@@unique([ctoonId, mintNumber])` makes the pair globally unique, so keying
 * on it alone would work — and would silently drop the only part of the token
 * that ties it to a claimed owner, which is the one thing callers without an
 * ownership check (valuations, modal) rely on.
 */
export function userCtoonRowKey (userId, ctoonId, mintNumber) {
  return `${userId}|${ctoonId}|${mintNumber == null ? 'x' : mintNumber}`
}

/**
 * Collapses parsed tokens into one bucket per owner, so the batched lookup is
 * an OR of `{ userId, ctoonId IN (…) }` branches.
 *
 * One branch per distinct owner rather than one per token: a trade names at
 * most two owners, so 250 cToons a side becomes two index-driven branches
 * instead of 250. Grouping this way also avoids the cross-product over-fetch
 * that a flat `userId IN (…) AND ctoonId IN (…)` would produce for callers like
 * the owners list, where every token names a different user.
 */
export function groupTokensByUser (tokens) {
  const byUser = new Map()
  for (const t of tokens) {
    let set = byUser.get(t.userId)
    if (!set) { set = new Set(); byUser.set(t.userId, set) }
    set.add(t.ctoonId)
  }
  return [...byUser].map(([userId, ctoonIds]) => ({ userId, ctoonIds: [...ctoonIds] }))
}
