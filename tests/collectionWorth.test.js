import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeCollectionWorth, MIN_SAMPLE_SIZE } from '../server/utils/collectionWorth.js'

test('computeCollectionWorth sums face value straightforwardly', () => {
  const ctoons = new Map([
    ['a', { quantity: 2, facePrice: 100, lastAuctionSoldPrice: null }],
    ['b', { quantity: 1, facePrice: 50, lastAuctionSoldPrice: null }]
  ])
  const { totals, itemCount, distinctCount } = computeCollectionWorth(ctoons, new Map(), new Map())
  assert.equal(totals.faceValue, 250)
  assert.equal(itemCount, 3)
  assert.equal(distinctCount, 2)
})

test('avg auction/trade fall back to face price below MIN_SAMPLE_SIZE', () => {
  const ctoons = new Map([
    ['a', { quantity: 1, facePrice: 100, lastAuctionSoldPrice: null }]
  ])
  const thinAuction = new Map([['a', { avgPrice: 999, pricedVolume: MIN_SAMPLE_SIZE - 1 }]])
  const { totals, priced } = computeCollectionWorth(ctoons, thinAuction, new Map())
  assert.equal(totals.avgAuctionSold, 100, 'thin sample falls back to face price')
  assert.equal(priced.avgAuctionSold, 0)
})

test('avg auction/trade use the real average once MIN_SAMPLE_SIZE is met', () => {
  const ctoons = new Map([
    ['a', { quantity: 2, facePrice: 100, lastAuctionSoldPrice: null }]
  ])
  const auctionRefs = new Map([['a', { avgPrice: 300, pricedVolume: MIN_SAMPLE_SIZE }]])
  const tradeRefs = new Map([['a', { avgPrice: 150, pricedVolume: MIN_SAMPLE_SIZE }]])
  const { totals, priced } = computeCollectionWorth(ctoons, auctionRefs, tradeRefs)
  assert.equal(totals.avgAuctionSold, 600)
  assert.equal(totals.avgTraded, 300)
  assert.equal(priced.avgAuctionSold, 2)
  assert.equal(priced.avgTraded, 2)
})

test('last auction sold uses the snapshot price when present, else face price', () => {
  const ctoons = new Map([
    ['sold', { quantity: 1, facePrice: 40, lastAuctionSoldPrice: 500 }],
    ['unsold', { quantity: 1, facePrice: 40, lastAuctionSoldPrice: null }]
  ])
  const { totals, priced } = computeCollectionWorth(ctoons, new Map(), new Map())
  assert.equal(totals.lastAuctionSold, 540)
  assert.equal(priced.lastAuctionSold, 1)
})

test('a cToon with no face price and no sales contributes 0, not NaN', () => {
  const ctoons = new Map([
    ['mystery', { quantity: 3, facePrice: null, lastAuctionSoldPrice: null }]
  ])
  const { totals } = computeCollectionWorth(ctoons, new Map(), new Map())
  assert.equal(totals.faceValue, 0)
  assert.equal(totals.avgAuctionSold, 0)
  assert.equal(totals.avgTraded, 0)
  assert.equal(totals.lastAuctionSold, 0)
})

test('zero-quantity entries are skipped without corrupting distinctCount', () => {
  const ctoons = new Map([
    ['a', { quantity: 0, facePrice: 100, lastAuctionSoldPrice: null }],
    ['b', { quantity: 1, facePrice: 50, lastAuctionSoldPrice: null }]
  ])
  const { distinctCount, totals } = computeCollectionWorth(ctoons, new Map(), new Map())
  assert.equal(distinctCount, 1)
  assert.equal(totals.faceValue, 50)
})
