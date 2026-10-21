// server/utils/tradeOfferLimits.js
// The two numeric limits on a trade offer, in a module with no imports at all.
//
// Split out of tradeOfferRules.js so the client can import MAX_CTOONS_PER_SIDE
// to enforce the same ceiling at selection time (components/newsite/Trade.vue)
// without pulling h3 into the browser bundle, and so there is exactly one
// definition rather than a server constant and a hand-copied client literal
// that drift apart — see utils/formatQuantity.js's TIME_BASED_CAP, which has
// already drifted into six re-declarations across server routes.

/// Ceiling on how many cToons one side of an offer may contain.
///
/// Raised from 250 (a product-facing restriction players complained was
/// arbitrary) to a value no real trade will ever approach — this exists only
/// as a technical guardrail against a malformed or adversarial request, not
/// a limit on trade size. resolveUserCtoonIds resolves ids via a single
/// batched query (see server/utils/userCtoonId.js), and accept.post.js moves
/// both sides with two set-based updateMany calls rather than a per-cToon
/// loop, so cost scales with row count, not round trips. Its transaction
/// timeout was widened alongside this value — see the comment there before
/// raising this further.
export const MAX_CTOONS_PER_SIDE = 10000

/// How many counters deep one negotiation may go. A counter is cheap to send and
/// DMs the other party, so an unbounded chain is a notification-spam vector.
export const MAX_COUNTER_CHAIN_DEPTH = 20
