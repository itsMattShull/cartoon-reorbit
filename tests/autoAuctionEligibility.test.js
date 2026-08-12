import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTO_AUCTION_EXCLUDED_RARITIES,
  isAutoAuctionEligibleRarity
} from '../server/utils/autoAuctionEligibility.js'
import { RARITY_FLOORS, rarityFloor, DEFAULT_RARITY_FLOOR } from '../server/utils/auctionPriceSuggestion.js'

test('the ordinary drop rarities stay auto-auctionable', () => {
  // These are what the featured-auction cron is actually for; excluding them
  // would silently switch the feature off.
  for (const rarity of ['Common', 'Uncommon', 'Rare', 'Very Rare']) {
    assert.equal(isAutoAuctionEligibleRarity(rarity), true, rarity)
  }
})

test('deliberate-release rarities are never drawn at random', () => {
  // The incident this guards: a "Gold Edition Edd" (Auction Only) scheduled to
  // release in mint order at 1500 pts was drawn at random and listed at 50.
  for (const rarity of ['Auction Only', 'Prize Only', 'Code Only']) {
    assert.equal(isAutoAuctionEligibleRarity(rarity), false, rarity)
  }
})

test('Crazy Rare stays excluded, as it was before', () => {
  assert.equal(isAutoAuctionEligibleRarity('Crazy Rare'), false)
})

test('every declared exclusion is actually rejected', () => {
  for (const rarity of AUTO_AUCTION_EXCLUDED_RARITIES) {
    assert.equal(isAutoAuctionEligibleRarity(rarity), false, rarity)
  }
})

test('matching is case- and whitespace-tolerant', () => {
  // The database filter matches these strings exactly, so this predicate is the
  // backstop for a stored value that differs only by case or padding.
  assert.equal(isAutoAuctionEligibleRarity('  auction only  '), false)
  assert.equal(isAutoAuctionEligibleRarity('AUCTION ONLY'), false)
  assert.equal(isAutoAuctionEligibleRarity('  common  '), true)
  assert.equal(isAutoAuctionEligibleRarity('COMMON'), true)
})

test('a rarity with no explicit floor is refused rather than priced at the fallback', () => {
  // rarityFloor answers 50 for anything it does not recognise. That is a guess,
  // not a price, and listing a collectible at a guessed 50 pts is the failure
  // this whole change is about.
  assert.equal(rarityFloor('Mythic'), DEFAULT_RARITY_FLOOR)
  assert.equal(isAutoAuctionEligibleRarity('Mythic'), false)
})

test('missing rarity is refused', () => {
  // Also preserves prior behaviour: the old `rarity: { not: "Crazy Rare" }`
  // filter already dropped NULL rarities, because NOT IN/<> against NULL is
  // never true in Postgres.
  assert.equal(isAutoAuctionEligibleRarity(null), false)
  assert.equal(isAutoAuctionEligibleRarity(undefined), false)
  assert.equal(isAutoAuctionEligibleRarity(''), false)
  assert.equal(isAutoAuctionEligibleRarity('   '), false)
})

test('an eligible rarity always has a real floor to price from', () => {
  // The invariant the cron depends on: anything it may list has an explicit
  // floor, so it never falls through to DEFAULT_RARITY_FLOOR.
  for (const rarity of Object.keys(RARITY_FLOORS)) {
    if (!isAutoAuctionEligibleRarity(rarity)) continue
    assert.ok(
      Object.prototype.hasOwnProperty.call(RARITY_FLOORS, rarity.toLowerCase()),
      `${rarity} is auto-auctionable but has no explicit floor`
    )
  }
})
