import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  RARITY_FLOORS,
  DEFAULT_RARITY_FLOOR,
  rarityFloor,
  mintMultiplier,
  isSystemSale,
  rangeFactor,
  computePriceSuggestion,
  MAX_SAMPLE_SIZE
} from '../server/utils/auctionPriceSuggestion.js'

test('rarityFloor matches the server-side minimums and is case/space tolerant', () => {
  assert.equal(rarityFloor('Common'), 25)
  assert.equal(rarityFloor('  crazy rare  '), 312)
  assert.equal(rarityFloor('Very Rare'), 187)
  assert.equal(rarityFloor('Auction Only'), 50)
  // Unknown or missing rarity falls back rather than throwing.
  assert.equal(rarityFloor('nonsense'), DEFAULT_RARITY_FLOOR)
  assert.equal(rarityFloor(null), DEFAULT_RARITY_FLOOR)
  assert.equal(rarityFloor(undefined), DEFAULT_RARITY_FLOOR)
  // Every declared floor is reachable through the lookup.
  for (const [rarity, floor] of Object.entries(RARITY_FLOORS)) {
    assert.equal(rarityFloor(rarity), floor)
  }
})

test('mintMultiplier reproduces the trade tool premium', () => {
  // Documented in components/newsite/Trade.vue: #1 of 500 ~= 1.998x, last = 1x.
  assert.ok(Math.abs(mintMultiplier(1, 500) - 1.998) < 0.001)
  assert.equal(mintMultiplier(250, 500), 1.5)
  assert.equal(mintMultiplier(500, 500), 1)
})

test('mintMultiplier declines to adjust where a premium would mislead', () => {
  assert.equal(mintMultiplier(null, 500), 1, 'no mint number')
  assert.equal(mintMultiplier(1, 1), 1, 'single mint in existence')
  assert.equal(mintMultiplier(1, 0), 1, 'unknown highest mint')
  assert.equal(mintMultiplier(1, null), 1, 'missing highest mint')
  assert.equal(mintMultiplier(5, 500, { isUnlimited: true }), 1, 'unlimited print run')
  assert.equal(mintMultiplier(5, 500, { isHolidayItem: true }), 1, 'hidden mint number')
  // Stale highestMint (mint above the known max) must not produce a <1 discount.
  assert.equal(mintMultiplier(600, 500), 1)
})

test('isSystemSale identifies auctions won by the system account', () => {
  const official = 'official-user-id'
  const dissolve = 'dissolve-account-id'

  assert.equal(isSystemSale({ winnerId: official }, official), true)
  // A player won it — a real sale, keep it.
  assert.equal(isSystemSale({ winnerId: 'someone-else' }, official), false)
  // Unsold auctions have no winner and never reach this filter.
  assert.equal(isSystemSale({ winnerId: null }, official), false)
  // No system account resolved: never filter anything out.
  assert.equal(isSystemSale({ winnerId: official }, null), false)

  // Accepts a list, since the app has more than one system-ish account.
  assert.equal(isSystemSale({ winnerId: dissolve }, [official, dissolve]), true)
  assert.equal(isSystemSale({ winnerId: 'player' }, [official, dissolve]), false)
  assert.equal(isSystemSale({ winnerId: 'player' }, [null, undefined]), false)
})

test('computePriceSuggestion uses the median so outliers cannot drag it', () => {
  // Four honest sales around 100 plus one absurd outlier.
  const withOutlier = computePriceSuggestion({
    sales: [
      { highestBid: 100 }, { highestBid: 105 },
      { highestBid: 95 },  { highestBid: 100 },
      { highestBid: 5000 }
    ],
    rarity: 'common'
  })
  // A mean would be ~1080 here.
  assert.equal(withOutlier.mid, 100)
  // The band still widens to reflect how noisy the sample is.
  assert.ok(withOutlier.high - withOutlier.low > 40)
})

test('rangeFactor widens for small and noisy samples, and stays clamped', () => {
  const oneSale = rangeFactor([100])
  assert.ok(Math.abs(oneSale - 0.40) < 0.001, 'n=1 gives +/-40%')

  const tenTight = rangeFactor(Array(10).fill(100))
  assert.ok(Math.abs(tenTight - 0.1265) < 0.01 || tenTight === 0.15)
  assert.ok(tenTight >= 0.15, 'never narrower than +/-15%')

  // More samples of the same data must never widen the band.
  assert.ok(rangeFactor(Array(10).fill(100)) <= rangeFactor([100]))

  // Wild variance is capped so the range stays meaningful.
  assert.ok(rangeFactor([10, 1000, 5, 2000, 8]) <= 0.60)
})

test('computePriceSuggestion averages sales and brackets them', () => {
  const res = computePriceSuggestion({
    sales: [{ highestBid: 100 }, { highestBid: 120 }, { highestBid: 110 }],
    rarity: 'common'
  })
  assert.equal(res.basis, 'recent')
  assert.equal(res.sampleSize, 3)
  assert.equal(res.mid, 110)
  assert.ok(res.low < res.mid && res.mid < res.high)
  assert.equal(res.mintAdjusted, false)
})

test('computePriceSuggestion does not double-count the mint premium', () => {
  // Sales evenly spread across the mint range of a 100-mint cToon whose true
  // base value is 100/mint-neutral. Under the naive formula (average x premium)
  // a mint #1 estimate comes out near 297; the correct answer is ~199.
  const highestMint = 100
  const sales = [1, 25, 50, 75, 100].map(m => ({
    highestBid: Math.round(100 * (1 + (highestMint - m) / highestMint)),
    mintNumber: m
  }))

  const forMint1 = computePriceSuggestion({
    sales, highestMint, mintNumber: 1, rarity: 'common'
  })
  assert.ok(
    Math.abs(forMint1.mid - 199) < 6,
    `mint #1 should land near 199, got ${forMint1.mid}`
  )
  assert.equal(forMint1.mintAdjusted, true)

  const forLastMint = computePriceSuggestion({
    sales, highestMint, mintNumber: 100, rarity: 'common'
  })
  assert.ok(
    Math.abs(forLastMint.mid - 100) < 5,
    `last mint should land near 100, got ${forLastMint.mid}`
  )

  // The relative premium between mints is preserved exactly.
  assert.ok(Math.abs(forMint1.mid / forLastMint.mid - 1.99) < 0.05)
})

test('computePriceSuggestion clamps the low end to the rarity floor', () => {
  const res = computePriceSuggestion({
    sales: [{ highestBid: 330 }, { highestBid: 320 }, { highestBid: 325 }],
    rarity: 'crazy rare' // floor 312
  })
  assert.equal(res.floor, 312)
  assert.equal(res.low, 312, 'low is lifted to the floor')
  assert.ok(res.high > 312, 'high is never pushed down')
})

test('computePriceSuggestion reports when the market is under the floor', () => {
  const res = computePriceSuggestion({
    sales: [{ highestBid: 60 }, { highestBid: 55 }, { highestBid: 58 }],
    rarity: 'crazy rare' // floor 312, way above these sales
  })
  assert.equal(res.basis, 'below_floor')
  assert.equal(res.low, 312)
  assert.equal(res.high, 312)
  assert.ok(res.mid < 312, 'the real market midpoint is still reported')
})

test('computePriceSuggestion falls back to the cMart price with no sales', () => {
  const res = computePriceSuggestion({
    sales: [],
    cMartPrice: 400,
    mintNumber: 1,
    highestMint: 500,
    rarity: 'rare'
  })
  assert.equal(res.basis, 'estimate')
  assert.equal(res.mid, 400)
  assert.equal(res.low, 400)
  assert.equal(res.high, 400)
  assert.equal(res.sampleSize, 0)
  assert.equal(res.mintAdjusted, false, 'a list price gets no mint premium')
})

test('computePriceSuggestion returns none when there is nothing to go on', () => {
  const res = computePriceSuggestion({ sales: [], cMartPrice: null, rarity: 'rare' })
  assert.equal(res.basis, 'none')
  assert.equal(res.low, null)
  assert.equal(res.high, null)
  assert.equal(res.mid, null)

  const zeroPriced = computePriceSuggestion({ sales: [], cMartPrice: 0, rarity: 'rare' })
  assert.equal(zeroPriced.basis, 'none')
})

test('computePriceSuggestion ignores junk sale rows', () => {
  const res = computePriceSuggestion({
    sales: [
      { highestBid: 100 },
      { highestBid: 0 },
      { highestBid: null },
      { highestBid: 'abc' },
      { highestBid: 120 }
    ],
    rarity: 'common'
  })
  assert.equal(res.sampleSize, 2)
  assert.equal(res.mid, 110)
})

test('computePriceSuggestion caps the sample and preserves the alltime basis', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ highestBid: 100 + i }))
  const res = computePriceSuggestion({ sales: many, rarity: 'common', basis: 'alltime' })
  assert.equal(res.sampleSize, MAX_SAMPLE_SIZE)
  assert.equal(res.basis, 'alltime')

  // Defaults to the recent basis when not told otherwise.
  assert.equal(computePriceSuggestion({ sales: many, rarity: 'common' }).basis, 'recent')
})

test('computePriceSuggestion handles an empty call without throwing', () => {
  const res = computePriceSuggestion()
  assert.equal(res.basis, 'none')
  assert.equal(res.floor, DEFAULT_RARITY_FLOOR)
})
