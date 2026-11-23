// Pure rules of the admin "Ban Trades/Auctions" tool (server/utils/tradeAuctionBanRules.js): the pair is stored once,
// smaller id first, so a ban reads the same whichever user is named first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  orderBanPair,
  banPairWhere,
  bansBetweenWhere,
  otherSideOf,
  normalizeBanReason,
  MAX_BAN_REASON_LENGTH,
  TRADE_BANNED_MESSAGE,
  BID_BANNED_MESSAGE
} from '../server/utils/tradeAuctionBanRules.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

test('orderBanPair puts the smaller id first, whichever order the users are picked in', () => {
  assert.deepEqual(orderBanPair(A, B), [A, B])
  assert.deepEqual(orderBanPair(B, A), [A, B])
  assert.deepEqual(banPairWhere(B, A), { userAId: A, userBId: B })
})

test('orderBanPair refuses a missing user or the same user twice', () => {
  for (const [a, b] of [[A, A], [A, null], [undefined, B], ['', B], [A, 5]]) {
    assert.throws(() => orderBanPair(a, b), (e) => e.statusCode === 400)
  }
})

test('bansBetweenWhere matches either side of the pair and ignores the user themselves', () => {
  const w = bansBetweenWhere(A, [B, A, B, null])
  assert.deepEqual(w, { OR: [{ userAId: A, userBId: { in: [B] } }, { userBId: A, userAId: { in: [B] } }] })
})

test('otherSideOf returns the id across the pair', () => {
  assert.equal(otherSideOf({ userAId: A, userBId: B }, A), B)
  assert.equal(otherSideOf({ userAId: A, userBId: B }, B), A)
})

test('normalizeBanReason trims, caps and turns blank into null', () => {
  assert.equal(normalizeBanReason(undefined), null)
  assert.equal(normalizeBanReason('   '), null)
  assert.equal(normalizeBanReason('  alt accounts  '), 'alt accounts')
  assert.equal(normalizeBanReason('x'.repeat(MAX_BAN_REASON_LENGTH + 50)).length, MAX_BAN_REASON_LENGTH)
})

test('the messages say only that they cannot trade or bid with that user', () => {
  for (const m of [TRADE_BANNED_MESSAGE, BID_BANNED_MESSAGE]) assert.doesNotMatch(m, /admin|ban/i)
})
