// server/utils/auctionDuration.js
// Everything that decides how long an auction may run, in a module with no
// imports at all.
//
// Lives here rather than in the root utils/ directory for three reasons:
//  1. server/utils/tradeOfferLimits.js already established this pattern — a
//     dependency-free constants module the client imports as
//     '~/server/utils/…' (see components/newsite/Trade.vue) so there is one
//     definition instead of a server constant and a hand-copied client literal.
//  2. No server file in this repo imports from the root utils/ directory, and
//     server/socket-server.js and server/workers/* are plain Node processes
//     where the '@/' alias does not resolve at all (see the note at the top of
//     socket-server.js). Those processes reach this file with a relative path.
//  3. The root utils/ directory is auto-imported into the client global scope,
//     so every export there has to fight for a globally unique name.
//
// No imports, so bare `node --test` can load it — same constraint documented in
// server/utils/userCtoonToken.js.

/// Shortest auction anyone may list. Matches the "3 min" quick preset.
export const MIN_AUCTION_MINUTES = 3

/// Longest auction anyone may list: 7 days.
///
/// This is a bound on ELAPSED time, not on calendar days, and the distinction
/// is load-bearing. In a fall-back week "same wall clock, seven days later" is
/// 169 hours, which is 10140 minutes — past this cap. The picker therefore
/// derives its latest selectable instant from `now + MAX_AUCTION_MINUTES`
/// rather than from "today's date + 7", so it can never offer a date that this
/// constant then rejects.
export const MAX_AUCTION_MINUTES = 7 * 24 * 60 // 10080

/// Hard ceiling on the initial bid.
///
/// Auction.initialBet is a Postgres int4. Without this, a bet of 3e9 passes a
/// positive-integer check and then fails at the DB, surfacing as a 500 instead
/// of a 422.
export const MAX_INITIAL_BET = 1_000_000_000

/// Absolute ceiling on the BullMQ close delay, as defence in depth.
///
/// BullMQ arms its delayed-set timer with setTimeout, whose ceiling is
/// 2,147,483,647 ms (~24.8 days); past that a job fires immediately. Seven days
/// is nowhere near it, but after this change MAX_AUCTION_MINUTES is the only
/// thing standing between a future config bump and an auction that closes the
/// instant it is created.
export const MAX_CLOSE_DELAY_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Coerce one duration part from a request body.
 *
 * Deliberately stricter than Number(): `Number.isInteger(Number(x))` accepts
 * "0x1f4", "5e2", "+7", " 7 ", "7.", [7], true and null, and is true for 1e21
 * because isInteger does not imply isSafeInteger. Every one of those reaching
 * the arithmetic below is a coercion bug waiting to be found by someone else.
 *
 * Returns null for anything not a plain non-negative integer.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function coerceDurationPart(value) {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  // Digits only: no sign, no whitespace, no exponent, no hex, no decimal point.
  if (typeof value === 'string' && /^\d{1,7}$/.test(value)) {
    const n = Number(value)
    return Number.isSafeInteger(n) ? n : null
  }
  return null
}

/**
 * Validate a {durationDays, durationMinutes} pair and reduce it to one number.
 *
 * The single returned `totalMinutes` is what the caller must use for every
 * subsequent decision — endAt, the stored columns, the Discord label. Keeping
 * days and minutes alive past this point means two arithmetic paths that have
 * to agree forever.
 *
 * Each part is bounded independently as well as in sum, so that the client's
 * choice of split is never load-bearing: {days:0, minutes:10080} and
 * {days:7, minutes:0} describe the same auction and both must be accepted.
 *
 * @param {{ durationDays?: unknown, durationMinutes?: unknown }} input
 * @returns {{ ok: true, totalMinutes: number } | { ok: false, reason: string }}
 */
export function resolveAuctionDuration({ durationDays, durationMinutes } = {}) {
  const days = coerceDurationPart(durationDays)
  const minutes = coerceDurationPart(durationMinutes)

  if (days === null || minutes === null) {
    return { ok: false, reason: 'Auction duration must be whole non-negative numbers' }
  }
  if (days > 7 || minutes > MAX_AUCTION_MINUTES) {
    return { ok: false, reason: 'Auction duration is too long' }
  }

  const totalMinutes = days * 1440 + minutes
  if (!Number.isSafeInteger(totalMinutes)) {
    return { ok: false, reason: 'Invalid auction duration' }
  }
  if (totalMinutes < MIN_AUCTION_MINUTES) {
    return { ok: false, reason: `Auctions must run for at least ${MIN_AUCTION_MINUTES} minutes` }
  }
  if (totalMinutes > MAX_AUCTION_MINUTES) {
    return { ok: false, reason: 'Auctions may run for at most 7 days' }
  }
  return { ok: true, totalMinutes }
}

/**
 * Clamp a raw millisecond span to a whole number of minutes the server accepts.
 *
 * The clamp is the point, not the rounding. No single rounding mode is safe at
 * both ends: a target 2.25 minutes out floors to 2 (below the minimum, because
 * "12:03" read at 12:00:45 is only 2.25 minutes away), and one landing at
 * 10080.6 rounds to 10081 (above the maximum, reachable when a client clock
 * steps backward between picking and submitting). Clamped rounding cannot
 * produce an out-of-range value at either end, which is what makes the 422
 * unreachable from the picker.
 *
 * @param {number} ms
 * @returns {number} whole minutes within [MIN_AUCTION_MINUTES, MAX_AUCTION_MINUTES]
 */
export function clampMsToAuctionMinutes(ms) {
  if (!Number.isFinite(ms)) return MIN_AUCTION_MINUTES
  const minutes = Math.round(ms / 60000)
  if (!Number.isFinite(minutes)) return MIN_AUCTION_MINUTES
  return Math.min(MAX_AUCTION_MINUTES, Math.max(MIN_AUCTION_MINUTES, minutes))
}

/**
 * Whether a raw millisecond span is inside the listable window, before any
 * rounding. The picker checks this so it can disable Submit with an
 * explanation rather than letting the server answer with a bare 422.
 *
 * @param {number} ms
 */
export function isListableMs(ms) {
  return Number.isFinite(ms) &&
    ms >= MIN_AUCTION_MINUTES * 60000 &&
    ms <= MAX_AUCTION_MINUTES * 60000
}

/**
 * Human-readable length, e.g. "2 days, 5 hours" / "45 minutes".
 *
 * Replaces the old formatDuration(days, minutes) in server/api/auctions.post.js,
 * which returned early on `minutes > 0` and so dropped the days entirely. That
 * was dormant while the UI only ever sent one or the other; a custom "6d 3h"
 * listing would have announced "Duration: 3 hour(s)" to Discord.
 *
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatAuctionDuration(totalMinutes) {
  const total = Math.max(0, Math.trunc(Number(totalMinutes) || 0))
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const mins = total % 60

  const parts = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (mins) parts.push(`${mins} minute${mins === 1 ? '' : 's'}`)
  return parts.length ? parts.join(', ') : '0 minutes'
}

/**
 * Compact countdown, e.g. "6d 23h" / "4h 12m" / "45s".
 *
 * Shared by the Auction House card badges and the auction detail page, which
 * each carried their own copy that topped out at hours — a 7-day auction
 * rendered as "167h 59m" in a nowrap badge sitting over the card art.
 *
 * @param {number} ms remaining
 * @returns {string}
 */
export function formatRemainingShort(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'ended'
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
