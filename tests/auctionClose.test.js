import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isConflictingSale,
  resolveAuctionCloseOutcome,
  AUCTION_CLOSE_SOLD,
  AUCTION_CLOSE_NO_SALE,
  AUCTION_CLOSE_DOUBLE_SALE
} from '../server/utils/auctionClose.js'

const LISTED = '2026-08-01T00:00:00.000Z'
const auction = { id: 'a1', createdAt: LISTED }
const bid = { userId: 'winner-1', amount: 500 }

const closedSale = (over = {}) => ({
  id: 'a2',
  status: 'CLOSED',
  winnerId: 'winner-2',
  winnerAt: '2026-08-01T06:00:00.000Z',
  ...over
})

test('a sale of the same cToon during this listing is a conflict', () => {
  assert.equal(isConflictingSale(auction, closedSale()), true)
})

test('the auction never conflicts with itself', () => {
  assert.equal(isConflictingSale(auction, closedSale({ id: 'a1' })), false)
})

test('a sale that closed before this listing began is not a conflict', () => {
  // The cToon was sold, then changed hands again, and the new owner re-listed
  // it. Sequential sales are the normal case and must settle.
  assert.equal(
    isConflictingSale(auction, closedSale({ winnerAt: '2026-07-30T00:00:00.000Z' })),
    false
  )
})

test('a still-running auction is not a conflict', () => {
  assert.equal(
    isConflictingSale(auction, closedSale({ status: 'ACTIVE', winnerId: null, winnerAt: null })),
    false
  )
})

test('an auction that closed with no winner is not a conflict', () => {
  // Nothing changed hands, so there is nothing to collide with.
  assert.equal(isConflictingSale(auction, closedSale({ winnerId: null })), false)
  assert.equal(isConflictingSale(auction, closedSale({ winnerAt: null })), false)
})

test('unparseable timestamps do not manufacture a conflict', () => {
  assert.equal(isConflictingSale(auction, closedSale({ winnerAt: 'not-a-date' })), false)
  assert.equal(isConflictingSale({ id: 'a1', createdAt: null }, closedSale()), false)
})

test('missing input is not a conflict', () => {
  assert.equal(isConflictingSale(auction, null), false)
  assert.equal(isConflictingSale(null, closedSale()), false)
})

test('a normal auction with a winner settles as sold', () => {
  assert.deepEqual(
    resolveAuctionCloseOutcome({ auction, winningBid: bid, otherAuctions: [] }),
    { outcome: AUCTION_CLOSE_SOLD, conflictingAuctionId: null }
  )
})

test('an auction with no bids settles as no sale', () => {
  assert.deepEqual(
    resolveAuctionCloseOutcome({ auction, winningBid: null, otherAuctions: [] }),
    { outcome: AUCTION_CLOSE_NO_SALE, conflictingAuctionId: null }
  )
})

test('a double sale is caught and names the auction it collided with', () => {
  assert.deepEqual(
    resolveAuctionCloseOutcome({ auction, winningBid: bid, otherAuctions: [closedSale()] }),
    { outcome: AUCTION_CLOSE_DOUBLE_SALE, conflictingAuctionId: 'a2' }
  )
})

test('a double sale outranks having no bids of our own', () => {
  // The cToon is gone either way, so this auction must not touch it.
  const { outcome } = resolveAuctionCloseOutcome({
    auction, winningBid: null, otherAuctions: [closedSale()]
  })
  assert.equal(outcome, AUCTION_CLOSE_DOUBLE_SALE)
})

test('prior sequential sales of the same cToon still settle normally', () => {
  const { outcome } = resolveAuctionCloseOutcome({
    auction,
    winningBid: bid,
    otherAuctions: [
      closedSale({ id: 'old-1', winnerAt: '2026-06-01T00:00:00.000Z' }),
      closedSale({ id: 'old-2', winnerAt: '2026-07-15T00:00:00.000Z' })
    ]
  })
  assert.equal(outcome, AUCTION_CLOSE_SOLD)
})

test('a dissolved seller does not look like a double sale', () => {
  // sync-guild-members reassigns creatorId to the official account for auctions
  // already running when an account is dissolved, without moving the cToon. An
  // ownership-based guard would abort these; this rule must not.
  const { outcome } = resolveAuctionCloseOutcome({
    auction,
    winningBid: bid,
    otherAuctions: [closedSale({ status: 'CANCELLED', winnerId: null, winnerAt: null })]
  })
  assert.equal(outcome, AUCTION_CLOSE_SOLD)
})
