import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MIN_AUCTION_MINUTES,
  MAX_AUCTION_MINUTES,
  coerceDurationPart,
  resolveAuctionDuration,
  clampMsToAuctionMinutes,
  isListableMs,
  formatAuctionDuration,
  formatRemainingShort
} from '../server/utils/auctionDuration.js'

const ok = (input) => {
  const r = resolveAuctionDuration(input)
  assert.equal(r.ok, true, `expected ${JSON.stringify(input)} to be accepted, got: ${r.reason}`)
  return r.totalMinutes
}
const rejected = (input) => {
  const r = resolveAuctionDuration(input)
  assert.equal(r.ok, false, `expected ${JSON.stringify(input)} to be rejected`)
}

// ── Bounds ────────────────────────────────────────────────────────────────
test('the 3-minute floor and the 7-day ceiling are both inclusive', () => {
  assert.equal(ok({ durationMinutes: 3 }), 3)
  assert.equal(ok({ durationMinutes: MAX_AUCTION_MINUTES }), 10080)
  assert.equal(ok({ durationDays: 7 }), 10080)
})

test('anything shorter than 3 minutes or longer than 7 days is refused', () => {
  rejected({ durationMinutes: 2 })
  rejected({ durationMinutes: 0 })
  rejected({ durationDays: 0, durationMinutes: 0 })
  rejected({ durationMinutes: MAX_AUCTION_MINUTES + 1 })
  rejected({ durationDays: 8 })
})

test('the split between days and minutes is never load-bearing', () => {
  // These describe the same auction and must both be accepted, so that
  // simplifying the client later cannot break the endpoint.
  assert.equal(ok({ durationDays: 7, durationMinutes: 0 }), 10080)
  assert.equal(ok({ durationDays: 0, durationMinutes: 10080 }), 10080)
  assert.equal(ok({ durationDays: 6, durationMinutes: 1440 }), 10080)
})

test('parts summing over the ceiling are refused even when each part is legal', () => {
  rejected({ durationDays: 7, durationMinutes: 1 })
  rejected({ durationDays: 4, durationMinutes: 5000 })
})

// ── Hostile input ─────────────────────────────────────────────────────────
// Bounds-only tests pass against a broken implementation; these are the ones
// that pin the coercion. Number.isInteger(Number(x)) accepts every value below.
test('alternate numeric spellings are refused, not coerced', () => {
  for (const bad of ['0x1f4', '5e2', '+7', ' 7 ', '7.', '7.0', '-0', '1_0', '']) {
    assert.equal(coerceDurationPart(bad), null, `${JSON.stringify(bad)} should not coerce`)
  }
})

test('non-scalar and non-numeric types are refused', () => {
  for (const bad of [[7], [[7]], true, false, {}, { valueOf: () => 7 }, () => 7, NaN, Infinity, -Infinity]) {
    assert.equal(coerceDurationPart(bad), null)
  }
})

test('values above MAX_SAFE_INTEGER are refused', () => {
  // Number.isInteger(1e21) is true, which is exactly why isSafeInteger is used.
  assert.equal(coerceDurationPart(1e21), null)
  rejected({ durationMinutes: 1e21 })
  rejected({ durationDays: Number.MAX_SAFE_INTEGER })
})

test('negative parts are refused rather than cancelling out', () => {
  assert.equal(coerceDurationPart(-1), null)
  rejected({ durationDays: -1, durationMinutes: 2880 })
  rejected({ durationDays: 1, durationMinutes: -1 })
})

test('fractional parts are refused even when the sum is a whole number', () => {
  // A sum-only integer check accepts this pair; the per-part check is what stops it.
  rejected({ durationDays: 0.5, durationMinutes: 720 })
  rejected({ durationDays: 1.5, durationMinutes: 0 })
})

test('missing parts default to zero rather than throwing', () => {
  assert.equal(coerceDurationPart(undefined), 0)
  assert.equal(coerceDurationPart(null), 0)
  assert.equal(ok({ durationMinutes: 30 }), 30)
  rejected({})
})

test('plain digit strings are accepted, since that is what a form posts', () => {
  assert.equal(coerceDurationPart('30'), 30)
  assert.equal(ok({ durationDays: '2', durationMinutes: '30' }), 2910)
})

// ── Clamping ──────────────────────────────────────────────────────────────
test('clamping keeps a near-minimum pick inside the accepted range', () => {
  // "12:03" chosen at 12:00:45 is only 2.25 minutes out. Rounding or flooring
  // gives 2 and a 422 the player cannot understand; the clamp gives 3.
  assert.equal(clampMsToAuctionMinutes(2.25 * 60000), MIN_AUCTION_MINUTES)
  assert.equal(clampMsToAuctionMinutes(0), MIN_AUCTION_MINUTES)
  assert.equal(clampMsToAuctionMinutes(-5000), MIN_AUCTION_MINUTES)
})

test('clamping keeps a near-maximum pick inside the accepted range', () => {
  // Reachable when a client clock steps backward between picking and submitting.
  assert.equal(clampMsToAuctionMinutes(10080.6 * 60000), MAX_AUCTION_MINUTES)
  assert.equal(clampMsToAuctionMinutes(99999 * 60000), MAX_AUCTION_MINUTES)
})

test('a clamped value is always something the endpoint accepts', () => {
  for (const ms of [-1, 0, 1000, 2.25 * 60000, 10080.6 * 60000, 1e12, NaN, Infinity]) {
    const minutes = clampMsToAuctionMinutes(ms)
    assert.equal(resolveAuctionDuration({ durationMinutes: minutes }).ok, true,
      `clamp produced an unacceptable ${minutes} from ${ms}`)
  }
})

test('isListableMs reports the raw span, before any rounding', () => {
  assert.equal(isListableMs(3 * 60000), true)
  assert.equal(isListableMs(2.9 * 60000), false)
  assert.equal(isListableMs(MAX_AUCTION_MINUTES * 60000), true)
  assert.equal(isListableMs(MAX_AUCTION_MINUTES * 60000 + 1), false)
  assert.equal(isListableMs(NaN), false)
})

// ── DST ───────────────────────────────────────────────────────────────────
test('the ceiling is elapsed time, so a fall-back week is not listable end-to-end', () => {
  // "Same wall clock, seven days later" across a fall-back transition is 169
  // hours = 10140 minutes. The picker derives its max attribute from
  // now + MAX_AUCTION_MINUTES precisely so it can never offer this instant;
  // if one ever reaches the endpoint it must be refused, not silently accepted.
  const fallBackWeek = 169 * 60
  assert.equal(fallBackWeek > MAX_AUCTION_MINUTES, true)
  rejected({ durationMinutes: fallBackWeek })
  // A spring-forward week is 167 hours and is listable.
  assert.equal(ok({ durationMinutes: 167 * 60 }), 10020)
})

// ── Labels ────────────────────────────────────────────────────────────────
test('the duration label keeps the days when minutes are also present', () => {
  // The old formatDuration returned early on minutes > 0 and dropped the days,
  // so a 6d 3h listing announced "Duration: 3 hour(s)" to Discord.
  assert.equal(formatAuctionDuration(6 * 1440 + 180), '6 days, 3 hours')
  assert.equal(formatAuctionDuration(2 * 1440 + 330), '2 days, 5 hours, 30 minutes')
})

test('the duration label singularises and drops empty units', () => {
  assert.equal(formatAuctionDuration(3), '3 minutes')
  assert.equal(formatAuctionDuration(1), '1 minute')
  assert.equal(formatAuctionDuration(60), '1 hour')
  assert.equal(formatAuctionDuration(1440), '1 day')
  assert.equal(formatAuctionDuration(10080), '7 days')
  assert.equal(formatAuctionDuration(0), '0 minutes')
})

test('the countdown has a day tier', () => {
  // Without one a 7-day auction rendered as "167h 59m" in a nowrap card badge.
  assert.equal(formatRemainingShort(7 * 86400000), '7d 0h')
  assert.equal(formatRemainingShort(6 * 86400000 + 23 * 3600000), '6d 23h')
  assert.equal(formatRemainingShort(5 * 86400000), '5d 0h')
})

test('the countdown keeps its finer tiers under a day', () => {
  assert.equal(formatRemainingShort(4 * 3600000 + 12 * 60000), '4h 12m')
  assert.equal(formatRemainingShort(90 * 1000), '1m 30s')
  assert.equal(formatRemainingShort(45 * 1000), '45s')
  assert.equal(formatRemainingShort(0), 'ended')
  assert.equal(formatRemainingShort(-1), 'ended')
})
