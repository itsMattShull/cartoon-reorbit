import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  STANDARDIZABLE_RARITIES,
  DEFAULT_PERCENTAGES,
  isStandardizableRarity,
  computeStandardizedQuantity
} from '../server/utils/cmartStandardizedMetrics.js'

test('isStandardizableRarity only allows the 5 rarities that actually appear in cMart', () => {
  for (const r of STANDARDIZABLE_RARITIES) assert.equal(isStandardizableRarity(r), true)
  assert.equal(isStandardizableRarity('Prize Only'), false)
  assert.equal(isStandardizableRarity('Code Only'), false)
  assert.equal(isStandardizableRarity('Auction Only'), false)
  assert.equal(isStandardizableRarity('Nonsense'), false)
  assert.equal(isStandardizableRarity(null), false)
})

test('computeStandardizedQuantity reproduces each default percentage against a representative active-player count', () => {
  const activePlayerCount = 1000
  assert.equal(computeStandardizedQuantity('Crazy Rare', activePlayerCount, DEFAULT_PERCENTAGES), 500)
  assert.equal(computeStandardizedQuantity('Very Rare', activePlayerCount, DEFAULT_PERCENTAGES), 750)
  assert.equal(computeStandardizedQuantity('Rare', activePlayerCount, DEFAULT_PERCENTAGES), 900)
  assert.equal(computeStandardizedQuantity('Uncommon', activePlayerCount, DEFAULT_PERCENTAGES), 1250)
  assert.equal(computeStandardizedQuantity('Common', activePlayerCount, DEFAULT_PERCENTAGES), 1500)
})

test('computeStandardizedQuantity rounds to the nearest integer', () => {
  // 333 * 0.5 = 166.5 -> rounds to 167 (round-half-up, per Math.round)
  assert.equal(computeStandardizedQuantity('Crazy Rare', 333, DEFAULT_PERCENTAGES), 167)
})

test('computeStandardizedQuantity returns null for a non-standardizable rarity', () => {
  assert.equal(computeStandardizedQuantity('Code Only', 1000, DEFAULT_PERCENTAGES), null)
  assert.equal(computeStandardizedQuantity('Prize Only', 1000, DEFAULT_PERCENTAGES), null)
})

test('computeStandardizedQuantity returns null when the percentage config is missing/invalid for that rarity', () => {
  assert.equal(computeStandardizedQuantity('Common', 1000, {}), null)
  assert.equal(computeStandardizedQuantity('Common', 1000, { Common: 'not a number' }), null)
})

test('computeStandardizedQuantity never goes below 1 even with zero active players', () => {
  assert.equal(computeStandardizedQuantity('Crazy Rare', 0, DEFAULT_PERCENTAGES), 1)
})

test('computeStandardizedQuantity floorAt clamps the result up, never down', () => {
  // Raw result (10 * 0.5 = 5) is below floorAt (200 already minted) -> clamps up to 200.
  assert.equal(computeStandardizedQuantity('Crazy Rare', 10, DEFAULT_PERCENTAGES, { floorAt: 200 }), 200)
  // Raw result (1000 * 0.5 = 500) is above floorAt (50) -> floorAt has no effect.
  assert.equal(computeStandardizedQuantity('Crazy Rare', 1000, DEFAULT_PERCENTAGES, { floorAt: 50 }), 500)
  // A non-finite floorAt (e.g. totalMinted undefined on create, no existing row) falls back to 1.
  assert.equal(computeStandardizedQuantity('Crazy Rare', 0, DEFAULT_PERCENTAGES, { floorAt: undefined }), 1)
})
