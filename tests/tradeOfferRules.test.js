import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isUuid,
  normalizeCtoonIdList,
  assertOfferHasContent,
  assertNoCrossSideOverlap,
  pendingTradeGuardWhere,
  counterAuthorizationError,
  exceedsCounterChainDepth,
  MAX_CTOONS_PER_SIDE,
  MAX_COUNTER_CHAIN_DEPTH
} from '../server/utils/tradeOfferRules.js'

const OFFER_A = '11111111-1111-4111-8111-111111111111'
const OFFER_B = '22222222-2222-4222-8222-222222222222'
const ALICE = 'alice-id'
const BOB = 'bob-id'

function statusOf (fn) {
  try { fn(); return null } catch (e) { return e.statusCode }
}

// ── pendingTradeGuardWhere ────────────────────────────────────────
// This is the guard that stops one cToon being committed to two live trades.
// A counter has to be exempted from it, and the exemption is the single most
// dangerous thing in the feature — hence the disproportionate coverage.

test('pendingTradeGuardWhere without exclusions matches the pre-counter behavior', () => {
  const where = pendingTradeGuardWhere(['uc1', 'uc2'])
  assert.deepEqual(where, {
    userCtoonId: { in: ['uc1', 'uc2'] },
    tradeOffer: { status: 'PENDING' }
  })
  // No id predicate at all when nothing is excluded — a stray `notIn: []`
  // would be harmless here but is exactly the kind of thing that drifts.
  assert.equal('id' in where.tradeOffer, false)
})

test('pendingTradeGuardWhere narrows by OFFER id, never by cToon id', () => {
  const ctoonIds = ['uc1', 'uc2']
  const where = pendingTradeGuardWhere(ctoonIds, [OFFER_A])

  // The cToons being countered are still checked...
  assert.deepEqual(where.userCtoonId, { in: ['uc1', 'uc2'] })
  // ...they are simply not checked against the offer being replaced.
  assert.deepEqual(where.tradeOffer, { status: 'PENDING', id: { notIn: [OFFER_A] } })
})

test('pendingTradeGuardWhere still catches a cToon held by a DIFFERENT pending offer', () => {
  // The failure mode this guards against: exempting by cToon id would drop
  // 'uc1' from the query entirely, so a row tying 'uc1' to some unrelated
  // pending offer would no longer be found and the cToon could be committed
  // twice. Scoping by offer id keeps 'uc1' in the search.
  const where = pendingTradeGuardWhere(['uc1'], [OFFER_A])

  const rows = [
    { userCtoonId: 'uc1', tradeOfferId: OFFER_A, status: 'PENDING' }, // being countered
    { userCtoonId: 'uc1', tradeOfferId: OFFER_B, status: 'PENDING' }  // unrelated
  ]
  const matches = rows.filter(r =>
    where.userCtoonId.in.includes(r.userCtoonId) &&
    r.status === where.tradeOffer.status &&
    !where.tradeOffer.id.notIn.includes(r.tradeOfferId)
  )

  assert.equal(matches.length, 1)
  assert.equal(matches[0].tradeOfferId, OFFER_B)
})

test('pendingTradeGuardWhere copies the exclusion list rather than aliasing it', () => {
  const excluded = [OFFER_A]
  const where = pendingTradeGuardWhere(['uc1'], excluded)
  excluded.push(OFFER_B)
  assert.deepEqual(where.tradeOffer.id.notIn, [OFFER_A])
})

// ── counterAuthorizationError ─────────────────────────────────────

const pendingOffer = { status: 'PENDING', initiatorId: ALICE, recipientId: BOB }

test('the recipient may counter, addressing it back to the initiator', () => {
  assert.equal(
    counterAuthorizationError({ original: pendingOffer, callerId: BOB, newRecipientId: ALICE }),
    null
  )
})

test('the initiator may not counter their own offer', () => {
  // Copying reject.post.js's "either party" check would allow this, which
  // combined with the guard exemption lets someone release their own cToons
  // from pending state at will.
  assert.equal(
    counterAuthorizationError({ original: pendingOffer, callerId: ALICE, newRecipientId: ALICE }),
    'not-recipient'
  )
})

test('a third party may not counter', () => {
  assert.equal(
    counterAuthorizationError({ original: pendingOffer, callerId: 'mallory', newRecipientId: ALICE }),
    'not-recipient'
  )
})

test('a counter cannot be redirected away from the original initiator', () => {
  assert.equal(
    counterAuthorizationError({ original: pendingOffer, callerId: BOB, newRecipientId: 'mallory' }),
    'wrong-recipient'
  )
})

test('a settled offer cannot be countered', () => {
  for (const status of ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COUNTERED']) {
    assert.equal(
      counterAuthorizationError({
        original: { ...pendingOffer, status },
        callerId: BOB,
        newRecipientId: ALICE
      }),
      'not-pending',
      `expected ${status} to be uncounterable`
    )
  }
})

test('a missing offer is reported rather than dereferenced', () => {
  assert.equal(
    counterAuthorizationError({ original: null, callerId: BOB, newRecipientId: ALICE }),
    'not-found'
  )
  assert.equal(
    counterAuthorizationError({ original: undefined, callerId: BOB, newRecipientId: undefined }),
    'not-found'
  )
})

test('a self-addressed offer cannot be countered', () => {
  // A self-trade satisfies both the recipient and the initiator conditions, so
  // it has to be rejected explicitly or the points release and re-lock would
  // run against one balance inside a single transaction.
  assert.equal(
    counterAuthorizationError({
      original: { status: 'PENDING', initiatorId: ALICE, recipientId: ALICE },
      callerId: ALICE,
      newRecipientId: ALICE
    }),
    'self-trade'
  )
})

// ── normalizeCtoonIdList ──────────────────────────────────────────

test('normalizeCtoonIdList drops duplicates', () => {
  // Two spellings of one cToon resolve to the same UserCtoon and would emit two
  // rows violating @@unique([tradeOfferId, userCtoonId, role]), rolling back the
  // whole transaction with an opaque P2002.
  assert.deepEqual(normalizeCtoonIdList(['a', 'b', 'a'], 'x'), ['a', 'b'])
})

test('normalizeCtoonIdList rejects non-arrays and non-string members', () => {
  for (const bad of [undefined, null, 'abc', 42, {}]) {
    assert.equal(statusOf(() => normalizeCtoonIdList(bad, 'x')), 400)
  }
  for (const bad of [[{}], [null], [''], [42], [[]]]) {
    assert.equal(statusOf(() => normalizeCtoonIdList(bad, 'x')), 400)
  }
})

test('the per-side cap is the number the UI and the accept path were sized for', () => {
  // Pinned deliberately. The test below builds its fixture FROM the constant, so
  // it passes at any value — which is how this silently became 50 and started
  // rejecting the large trades the feature is for. Changing this number means
  // re-checking accept.post.js, whose transaction moves every cToon in the offer
  // (and whose $transaction timeout is sized off this same constant).
  assert.equal(MAX_CTOONS_PER_SIDE, 10000)
})

test('normalizeCtoonIdList caps list length', () => {
  const ok = Array.from({ length: MAX_CTOONS_PER_SIDE }, (_, i) => `id-${i}`)
  assert.equal(normalizeCtoonIdList(ok, 'x').length, MAX_CTOONS_PER_SIDE)
  assert.equal(statusOf(() => normalizeCtoonIdList([...ok, 'one-more'], 'x')), 400)
})

test('normalizeCtoonIdList accepts an empty list', () => {
  assert.deepEqual(normalizeCtoonIdList([], 'x'), [])
})

// ── content and overlap ───────────────────────────────────────────

test('an offer with nothing in it is rejected', () => {
  assert.equal(
    statusOf(() => assertOfferHasContent({ resolvedOffered: [], resolvedRequested: [], pointsOffered: 0 })),
    400
  )
})

test('any one of cToons, requests or points is enough content', () => {
  const cases = [
    { resolvedOffered: ['a'], resolvedRequested: [], pointsOffered: 0 },
    { resolvedOffered: [], resolvedRequested: ['a'], pointsOffered: 0 },
    { resolvedOffered: [], resolvedRequested: [], pointsOffered: 5 }
  ]
  for (const c of cases) assert.equal(statusOf(() => assertOfferHasContent(c)), null)
})

test('the same cToon cannot be on both sides of one offer', () => {
  assert.equal(statusOf(() => assertNoCrossSideOverlap(['a', 'b'], ['c', 'b'])), 400)
  assert.equal(statusOf(() => assertNoCrossSideOverlap(['a'], ['b'])), null)
  assert.equal(statusOf(() => assertNoCrossSideOverlap([], [])), null)
})

// ── misc guards ───────────────────────────────────────────────────

test('isUuid accepts real ids and rejects everything else', () => {
  assert.equal(isUuid(OFFER_A), true)
  for (const bad of ['', 'not-a-uuid', '../../etc/passwd', null, undefined, 42, {}, [OFFER_A],
    '11111111-1111-4111-8111-11111111111']) {
    assert.equal(isUuid(bad), false, `expected ${JSON.stringify(bad)} to be rejected`)
  }
})

test('counter chains are bounded', () => {
  assert.equal(exceedsCounterChainDepth(0), false)
  assert.equal(exceedsCounterChainDepth(MAX_COUNTER_CHAIN_DEPTH - 1), false)
  assert.equal(exceedsCounterChainDepth(MAX_COUNTER_CHAIN_DEPTH), true)
  assert.equal(exceedsCounterChainDepth(MAX_COUNTER_CHAIN_DEPTH + 1), true)
})
