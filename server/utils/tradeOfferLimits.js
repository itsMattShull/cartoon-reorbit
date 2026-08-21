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

/// Ceiling on pointsOffered and pointsRequested alike. pointsOffered is already
/// bounded in practice by the sender's real balance, but pointsRequested is not
/// checked against anyone's balance at creation on purpose (see the schema
/// comment on TradeOffer.pointsRequested) — nothing else stops a client sending
/// Number.MAX_SAFE_INTEGER. Well under Postgres' int4 max (2,147,483,647) so a
/// single offer can never get close to it on its own; accept.post.js still
/// checks the actual resulting balances before moving anything, since this
/// ceiling alone can't rule out overflow against a large existing balance.
export const MAX_TRADE_POINTS = 1_000_000_000

/// Cap on simultaneous PENDING offers from one initiator to one recipient.
/// A points-request offer costs the sender nothing to send — no cToon, no
/// locked points — so without this a recipient's incoming list is an
/// unbounded, free-to-fill mailbox for one attacker to spam.
export const MAX_PENDING_OFFERS_PER_PAIR = 5
