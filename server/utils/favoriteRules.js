// server/utils/favoriteRules.js
// Pure rules for the "favorite cToons" feature, shared by the API routes, the
// trade-offer validator and the read paths that shape collection payloads.
//
// Deliberately imports nothing at all — not even h3. server/utils/tradeOffer.js
// pulls in `@/server/prisma`, a Nuxt-only alias bare Node cannot resolve, which
// is what makes the rules in server/utils/tradeOfferRules.js testable under
// `npm test` (`node --test`). Same reasoning here; see tests/favoriteRules.test.js.
//
// The invariant this module exists to protect:
//   A favorite is a statement by ONE user about ONE copy they own. It is stored
//   as the favoriting user's id rather than a boolean precisely so that it stops
//   meaning anything the moment the copy changes hands.

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * The favorites routes accept a real UserCtoon id and nothing else, so this is
 * the gate rather than server/utils/userCtoonId.js#resolveUserCtoonId. Duplicated
 * from tradeOfferRules.js rather than imported because that module pulls in h3,
 * and this one stays import-free so `node --test` can load it.
 *
 * Named distinctly rather than `isUuid`: Nuxt auto-imports every export under
 * server/utils into one flat registry, so a second `isUuid` would silently
 * shadow (or be shadowed by) tradeOfferRules'.
 */
export function isUserCtoonUuid (value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * A copy is favorited only when the marker names its CURRENT owner.
 *
 * This one comparison is why no ownership-transfer site in the repo has to know
 * favorites exist. `UserCtoon.userId` is rewritten by ~15 call sites (trade
 * accept, auction close, wishlist accept, dissolve, guild dormancy, the admin
 * cheating tools, and a pile of one-off prisma/ repair scripts). A boolean would
 * survive every one of them and read as a genuine favorite under the new owner;
 * a stale id simply stops matching.
 *
 * Written as an explicit null check rather than `a === b` alone so that a row
 * with neither field set — which `{ userId: null, favoritedByUserId: null }`
 * would satisfy — is never reported as favorited.
 */
export function isFavoritedCopy (userCtoon) {
  if (!userCtoon) return false
  const marker = userCtoon.favoritedByUserId
  if (!marker) return false
  return marker === userCtoon.userId
}

/**
 * Favoriting is a claim about a copy that still exists. A burned copy keeps
 * whatever marker it had (holiday redemption soft-locks the row and can undo
 * that lock on mint failure, so clearing the marker there would silently
 * destroy the user's favorite), which makes filtering on read the only correct
 * place to handle it.
 */
export function isActiveFavorite (userCtoon) {
  return isFavoritedCopy(userCtoon) && !userCtoon.burnedAt
}

/**
 * The `where` every favorite write must use.
 *
 * Ownership is expressed as a PREDICATE rather than a preceding `findFirst`, so
 * authorization and the write are one statement and there is no window between
 * them. It also forces `updateMany` at the call site: Prisma's `update` requires
 * a unique `where`, which cannot carry `userId`, and reaching for it is the one
 * change that would turn either endpoint into a full IDOR — any user could
 * favorite or unfavorite any copy in the game by naming its id.
 */
export function favoriteWriteWhere (userCtoonId, userId) {
  return { id: userCtoonId, userId, burnedAt: null }
}

/**
 * What a requester is allowed to know about somebody else's copy.
 *
 * Requirement: a favorited copy greys out for other users "similar to those
 * locked in auction or as if they are in a pending trade". Collapsing all three
 * states into one flag is what makes that literally true, and it is also the
 * only version that does not publish favorites.
 *
 * Reporting the three states separately would hand any logged-in account a
 * favorites map of the whole economy: pending-trade state is already returned
 * honestly and active auctions are public, so `unavailable AND NOT inPendingTrade
 * AND NOT inAuction` isolates "favorited" by subtraction, one cheap read per
 * copy. A favorite is the most personally revealing per-copy signal the game has
 * — a durable, self-declared "this is the one I care about" — and it is
 * inferable nowhere else. The rest of this codebase already refuses to be an
 * oracle for weaker signals (see the generic rejection messages in
 * server/utils/tradeOffer.js and the `cz:` tokens in server/api/czone).
 */
export function isUnavailableToOthers ({ inPendingTrade = false, inAuction = false, favorited = false } = {}) {
  return !!(inPendingTrade || inAuction || favorited)
}

/**
 * Rejection message for a requested cToon the requester may not have.
 *
 * One string for every reason, so the response cannot be used to tell a favorite
 * apart from a pending trade or a live auction. This is strictly weaker than it
 * looks — an attacker can still submit a single-cToon offer and learn that SOME
 * block applies — but combined with isUnavailableToOthers() above it means the
 * per-copy read path leaks nothing, so probing costs one offer submission per
 * copy instead of one cheap GET, which is rate-limitable and leaves a trail.
 */
export const UNAVAILABLE_REQUEST_MESSAGE =
  'One or more cToons in this trade are not available for trade right now.'

/**
 * Which requested copies block the offer.
 *
 * `exemptIds` carries the cToons already committed to the offer being countered.
 * A counter re-proposes exactly those copies, so an owner who favorites one of
 * their own offered cToons while the offer is outstanding would otherwise make
 * the counter permanently unsendable — the recipient could only accept or
 * reject. Scoped by offer, never by cToon id, for the same reason
 * pendingTradeGuardWhere is: a blanket per-cToon exemption would also excuse the
 * copy from unrelated offers.
 *
 * `rows` are {id, userId, favoritedByUserId} records; only ids present in
 * `requestedIds` are considered, so a user's own offered favorites pass — the
 * owner is always allowed to trade their own favorite away.
 */
export function favoritedRequestedIds (rows, requestedIds, exemptIds = []) {
  const requested = new Set(requestedIds)
  const exempt = new Set(exemptIds)
  const blocked = []
  for (const row of rows) {
    if (!requested.has(row.id)) continue
    if (exempt.has(row.id)) continue
    if (isFavoritedCopy(row)) blocked.push(row.id)
  }
  return blocked
}

/**
 * Precedence for the greyed-out card's label in the trade grid.
 *
 * Extracted so the target-side and self-side call sites in
 * components/newsite/Trade.vue share one implementation instead of two
 * hand-maintained ternaries that already disagree about ordering.
 *
 * On the target's side the reason is never named: "Unavailable" is the whole
 * vocabulary, matching isUnavailableToOthers(). On the user's OWN side a
 * favorite is not a block at all — it stays selectable and only wears a star —
 * so this returns null for it and the card is only ever disabled by the
 * per-side ceiling.
 */
export function disabledReasonFor ({ isOwnSide = false, unavailable = false, inPendingTrade = false, atLimit = false } = {}) {
  if (isOwnSide) {
    if (inPendingTrade) return 'In Trade'
    return atLimit ? 'Limit' : null
  }
  if (unavailable) return 'Unavailable'
  return atLimit ? 'Limit' : null
}
