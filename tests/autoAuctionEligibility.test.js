import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAutoAuctionEligibleRarity } from '../server/utils/autoAuctionEligibility.js'

test('isAutoAuctionEligibleRarity allows priced, non-excluded rarities', () => {
  assert.equal(isAutoAuctionEligibleRarity('Common'), true)
  assert.equal(isAutoAuctionEligibleRarity('uncommon'), true)
  assert.equal(isAutoAuctionEligibleRarity('  Rare  '), true)
  assert.equal(isAutoAuctionEligibleRarity('Very Rare'), true)
})

test('isAutoAuctionEligibleRarity excludes Auction/Prize/Code Only and Crazy Rare', () => {
  assert.equal(isAutoAuctionEligibleRarity('Auction Only'), false)
  assert.equal(isAutoAuctionEligibleRarity('Prize Only'), false)
  assert.equal(isAutoAuctionEligibleRarity('Code Only'), false)
  assert.equal(isAutoAuctionEligibleRarity('Crazy Rare'), false)
  assert.equal(isAutoAuctionEligibleRarity('crazy rare'), false)
})

test('isAutoAuctionEligibleRarity refuses to guess a floor for unknown/missing rarities', () => {
  assert.equal(isAutoAuctionEligibleRarity('Some New Rarity'), false)
  assert.equal(isAutoAuctionEligibleRarity(''), false)
  assert.equal(isAutoAuctionEligibleRarity(null), false)
  assert.equal(isAutoAuctionEligibleRarity(undefined), false)
})
