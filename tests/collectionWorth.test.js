import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mintAdjustedValue, computeCollectionWorth } from '../server/utils/collectionWorth.js'

test('mintAdjustedValue reproduces the Owners tab premium', () => {
  // Same numbers CtoonInfoCard.vue's getMintAdjustedValue doc comment uses.
  assert.ok(Math.abs(mintAdjustedValue(100, 1, 500) - 199.8) < 0.001)
  assert.equal(mintAdjustedValue(100, 250, 500), 150)
  assert.equal(mintAdjustedValue(100, 500, 500), 100)
})

test('mintAdjustedValue skips the premium when it would be meaningless', () => {
  assert.equal(mintAdjustedValue(100, null, 500), 100, 'no mint number')
  assert.equal(mintAdjustedValue(100, 1, 1), 100, 'single mint in existence')
  assert.equal(mintAdjustedValue(100, 1, null), 100, 'unknown highest mint')
  assert.equal(mintAdjustedValue(0, 1, 500), 0, 'no base value at all')
})

test('computeCollectionWorth prefers avg auction sale over face price', () => {
  const owned = [{ ctoonId: 'a', mintNumber: 500 }]
  const avgSale = new Map([['a', { avgPrice: 300, count: 1 }]])
  const face = new Map([['a', 100]])
  const highestMint = new Map([['a', 500]])
  const { total, itemCount, distinctCount } = computeCollectionWorth(owned, avgSale, face, highestMint)
  assert.equal(total, 300)
  assert.equal(itemCount, 1)
  assert.equal(distinctCount, 1)
})

test('computeCollectionWorth falls back to face price with no auction history, even one sale is enough to use it', () => {
  const owned = [
    { ctoonId: 'never-sold', mintNumber: 1 },
    { ctoonId: 'sold-once', mintNumber: 1 }
  ]
  const avgSale = new Map([['sold-once', { avgPrice: 40, count: 1 }]]) // no MIN_SAMPLE_SIZE gate
  const face = new Map([['never-sold', 25], ['sold-once', 10]])
  const highestMint = new Map([['never-sold', 1], ['sold-once', 1]])
  const { total } = computeCollectionWorth(owned, avgSale, face, highestMint)
  // single mint in existence for both -> no premium
  assert.equal(total, 25 + 40)
})

test('computeCollectionWorth applies the mint premium per owned copy, not per type', () => {
  const owned = [
    { ctoonId: 'a', mintNumber: 1 },
    { ctoonId: 'a', mintNumber: 500 }
  ]
  const avgSale = new Map([['a', { avgPrice: 100, count: 5 }]])
  const face = new Map()
  const highestMint = new Map([['a', 500]])
  const { total, itemCount, distinctCount } = computeCollectionWorth(owned, avgSale, face, highestMint)
  assert.equal(itemCount, 2)
  assert.equal(distinctCount, 1)
  assert.ok(Math.abs(total - (199.8 + 100)) < 1)
})

test('an item with neither sales nor a face price contributes 0, not NaN', () => {
  const owned = [{ ctoonId: 'mystery', mintNumber: 3 }]
  const { total } = computeCollectionWorth(owned, new Map(), new Map(), new Map([['mystery', 10]]))
  assert.equal(total, 0)
})
