// Dissolve queue listing rules — see server/utils/dissolveListing.js for why held entries exist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dissolveStartingBid, isDissolveListable, isSpecialDissolveRarity, minStartBidFor,
  parseStartBidsInput, pickOverdueLaunches, SPECIAL_RARITY_BID_FIELDS, MAX_DISSOLVE_START_BID,
} from '../server/utils/dissolveListing.js'
import { RARITY_FLOORS } from '../server/utils/auctionPriceSuggestion.js'

const NO_BIDS = { dissolveStartBidAuctionOnly: null, dissolveStartBidPrizeOnly: null, dissolveStartBidCodeOnly: null, dissolveStartBidCrazyRare: null }

test('regular rarities auction at their rarity floor, case-insensitively', () => {
  assert.equal(dissolveStartingBid('Common', NO_BIDS), RARITY_FLOORS.common)
  assert.equal(dissolveStartingBid('  very RARE ', NO_BIDS), RARITY_FLOORS['very rare'])
  assert.equal(isDissolveListable('Uncommon', NO_BIDS), true)
})

test('special rarities are held until an admin sets a starting bid', () => {
  for (const r of ['Auction Only', 'Prize Only', 'Code Only', 'Crazy Rare']) {
    assert.equal(isSpecialDissolveRarity(r), true)
    assert.equal(dissolveStartingBid(r, NO_BIDS), null, `${r} held with no bid`)
    assert.equal(dissolveStartingBid(r, {}), null)
    assert.equal(dissolveStartingBid(r, undefined), null)
  }
})

test('a special rarity with a bid auctions at exactly that bid', () => {
  const bids = { ...NO_BIDS, dissolveStartBidCodeOnly: 200, dissolveStartBidCrazyRare: 5000 }
  assert.equal(dissolveStartingBid('Code Only', bids), 200)
  assert.equal(dissolveStartingBid('code only', bids), 200)
  assert.equal(dissolveStartingBid('Crazy Rare', bids), 5000)
  assert.equal(dissolveStartingBid('Prize Only', bids), null, 'other special rarities stay held')
})

test('an invalid stored bid (below floor, fractional, absurd) keeps the rarity held rather than listing it', () => {
  assert.equal(dissolveStartingBid('Crazy Rare', { dissolveStartBidCrazyRare: 5 }), null)
  assert.equal(dissolveStartingBid('Code Only', { dissolveStartBidCodeOnly: 99.5 }), null)
  assert.equal(dissolveStartingBid('Code Only', { dissolveStartBidCodeOnly: MAX_DISSOLVE_START_BID + 1 }), null)
  assert.equal(dissolveStartingBid('Code Only', { dissolveStartBidCodeOnly: '200' }), 200, 'numeric strings are accepted')
})

test('unknown or blank rarities are never listed', () => {
  assert.equal(dissolveStartingBid('Mythic', NO_BIDS), null)
  assert.equal(dissolveStartingBid('', NO_BIDS), null)
  assert.equal(dissolveStartingBid(null, NO_BIDS), null)
})

test('parseStartBidsInput validates against each rarity\'s floor and allows clearing', () => {
  assert.deepEqual(parseStartBidsInput({ dissolveStartBidCodeOnly: 75, dissolveStartBidPrizeOnly: '' }).data,
    { dissolveStartBidCodeOnly: 75, dissolveStartBidPrizeOnly: null })
  assert.match(parseStartBidsInput({ dissolveStartBidCrazyRare: 100 }).error, /Crazy Rare starting bid must be a whole number from 312/)
  assert.match(parseStartBidsInput({ dissolveStartBidCodeOnly: 12.5 }).error, /Code Only/)
  assert.match(parseStartBidsInput({ dissolveStartBidCodeOnly: -1 }).error, /Code Only/)
  assert.deepEqual(parseStartBidsInput({ somethingElse: 5 }).data, {}, 'unknown fields ignored')
  assert.equal(minStartBidFor('Crazy Rare'), RARITY_FLOORS['crazy rare'])
  assert.deepEqual(Object.values(SPECIAL_RARITY_BID_FIELDS).sort(), Object.keys(NO_BIDS).sort())
})

test('pickOverdueLaunches requeues lost, completed and long-failed launches only', () => {
  const now = Date.parse('2026-10-28T12:00:00Z')
  const past = new Date(now - 30 * 60 * 1000)
  const entries = ['missing', 'completed', 'failedOld', 'failedRecent', 'delayed', 'waiting', 'active', 'withinGrace', 'unscheduled']
    .map(id => ({ id, scheduledFor: id === 'withinGrace' ? new Date(now - 60 * 1000) : id === 'unscheduled' ? null : past }))
  const jobs = new Map([
    ['completed', { state: 'completed' }],
    ['failedOld', { state: 'failed', finishedOn: now - 2 * 60 * 60 * 1000 }],
    ['failedRecent', { state: 'failed', finishedOn: now - 10 * 60 * 1000 }],
    ['delayed', { state: 'delayed' }],
    ['waiting', { state: 'waiting' }],
    ['active', { state: 'active' }],
  ])
  assert.deepEqual(pickOverdueLaunches(entries, jobs, { now }), ['missing', 'completed', 'failedOld'])
})
