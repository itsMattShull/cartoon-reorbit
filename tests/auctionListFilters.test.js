import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePriceBound, parseListFilterQuery, auctionFilterPrice, matchesPriceAndEdition, priceRangeWhere
} from '../server/utils/auctionListFilters.js'

test('parsePriceBound treats blank and junk as no bound', () => {
  assert.equal(parsePriceBound(''), null)
  assert.equal(parsePriceBound(undefined), null)
  assert.equal(parsePriceBound('abc'), null)
  assert.equal(parsePriceBound('-5'), null)
  assert.equal(parsePriceBound('0'), 0)
  assert.equal(parsePriceBound('250'), 250)
})

test('parseListFilterQuery reads the Auction House query params', () => {
  assert.deepEqual(parseListFilterQuery({ priceMin: '10', priceMax: '', excludeSecondEditions: '1' }),
    { priceMin: 10, priceMax: null, excludeSecondEditions: true })
  assert.deepEqual(parseListFilterQuery({}),
    { priceMin: null, priceMax: null, excludeSecondEditions: false })
})

test('auctionFilterPrice uses the highest bid, falling back to the opening bid', () => {
  assert.equal(auctionFilterPrice({ highestBid: 120, initialBid: 50 }), 120)
  assert.equal(auctionFilterPrice({ highestBid: null, initialBid: 50 }), 50)
  assert.equal(auctionFilterPrice({ highestBid: 0, initialBid: 50 }), 50)
})

test('matchesPriceAndEdition mirrors the Current tab rules', () => {
  const item = { highestBid: null, initialBid: 100, isSecondEdition: false }
  assert.equal(matchesPriceAndEdition(item, {}), true)
  assert.equal(matchesPriceAndEdition(item, { priceMin: 100 }), true)
  assert.equal(matchesPriceAndEdition(item, { priceMin: 101 }), false)
  assert.equal(matchesPriceAndEdition(item, { priceMax: 99 }), false)
  assert.equal(matchesPriceAndEdition({ ...item, isSecondEdition: true }, { excludeSecondEditions: true }), false)
  // Packs have no edition, so the second-edition toggle keeps them.
  assert.equal(matchesPriceAndEdition({ kind: 'PACK', initialBid: 10 }, { excludeSecondEditions: true }), true)
})

test('priceRangeWhere covers bid and no-bid auctions', () => {
  assert.equal(priceRangeWhere(null, null), null)
  assert.deepEqual(priceRangeWhere(10, 50), {
    OR: [
      { highestBid: { gt: 0, gte: 10, lte: 50 } },
      { highestBid: { lte: 0 }, initialBet: { gte: 10, lte: 50 } }
    ]
  })
})
