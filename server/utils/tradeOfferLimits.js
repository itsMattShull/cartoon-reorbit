// server/utils/tradeOfferLimits.js
// The two numeric limits on a trade offer, in a module with no imports at all.
//
// Split out of tradeOfferRules.js so the client can import MAX_CTOONS_PER_SIDE
// to enforce the same ceiling at selection time (components/newsite/Trade.vue)
// without pulling h3 into the browser bundle, and so there is exactly one
// definition rather than a server constant and a hand-copied client literal
// that drift apart — see utils/formatQuantity.js's TIME_BASED_CAP, which has
// already drifted into six re-declarations across server routes.

/// Hard ceiling on how many cToons one side of an offer may contain.
///
/// This bounds the work one request can ask for, not the fan-out that the
/// original 50 was written for — resolution is a single batched query now (see
/// server/utils/userCtoonId.js). What actually scales with this number is the
/// accepting user's transaction: accept.post.js moves every cToon in the offer,
/// so raising it means widening that transaction's row-lock window.
export const MAX_CTOONS_PER_SIDE = 250

/// How many counters deep one negotiation may go. A counter is cheap to send and
/// DMs the other party, so an unbounded chain is a notification-spam vector.
export const MAX_COUNTER_CHAIN_DEPTH = 20
