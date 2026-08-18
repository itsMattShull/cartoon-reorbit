import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isFavoritedCopy,
  isActiveFavorite,
  favoriteWriteWhere,
  isUnavailableToOthers,
  favoritedRequestedIds,
  disabledReasonFor,
  UNAVAILABLE_REQUEST_MESSAGE
} from '../server/utils/favoriteRules.js'

const ALICE = 'alice-id'
const BOB = 'bob-id'

// ── isFavoritedCopy ───────────────────────────────────────────────
// The whole design rests on this comparison. `favoritedByUserId` is stored
// instead of a boolean so that the ~15 sites that rewrite UserCtoon.userId do
// not each have to remember to clear a favorite; these tests are what make that
// claim enforced rather than a code-review promise.

test('a copy whose marker matches its owner is favorited', () => {
  assert.equal(isFavoritedCopy({ userId: ALICE, favoritedByUserId: ALICE }), true)
})

test('a marker left by a PREVIOUS owner reads as NOT favorited', () => {
  // This is the entire justification for the column's shape. Alice favorited it,
  // then it changed hands to Bob without anybody clearing the marker. A boolean
  // would still say `true` here and would silently make Bob's copy
  // un-requestable by everyone and un-auctionable by Bob.
  assert.equal(isFavoritedCopy({ userId: BOB, favoritedByUserId: ALICE }), false)
})

test('an unset marker is not favorited', () => {
  assert.equal(isFavoritedCopy({ userId: ALICE, favoritedByUserId: null }), false)
  assert.equal(isFavoritedCopy({ userId: ALICE }), false)
})

test('two null-ish fields are never equal enough to count as favorited', () => {
  // Guards the explicit null check: a bare `a === b` would report this as
  // favorited, and a row mid-construction would then block trades.
  assert.equal(isFavoritedCopy({ userId: null, favoritedByUserId: null }), false)
  assert.equal(isFavoritedCopy({ userId: undefined, favoritedByUserId: undefined }), false)
  assert.equal(isFavoritedCopy({ userId: '', favoritedByUserId: '' }), false)
})

test('isFavoritedCopy tolerates a missing row', () => {
  assert.equal(isFavoritedCopy(null), false)
  assert.equal(isFavoritedCopy(undefined), false)
})

// ── isActiveFavorite ──────────────────────────────────────────────

test('a burned copy is never reported as an active favorite', () => {
  // holiday/redeem.post.js soft-locks the source row with burnedAt and can UNDO
  // that lock when the reward mint fails, so the marker is deliberately left
  // alone there. Filtering on read is therefore the only correct place, and
  // this pins it.
  assert.equal(isActiveFavorite({ userId: ALICE, favoritedByUserId: ALICE, burnedAt: new Date() }), false)
  assert.equal(isActiveFavorite({ userId: ALICE, favoritedByUserId: ALICE, burnedAt: null }), true)
})

// ── favoriteWriteWhere ────────────────────────────────────────────

test('favoriteWriteWhere always carries owner and burnedAt predicates', () => {
  // Dropping `userId` here is a full IDOR (anyone unfavorites anyone's copy);
  // dropping `burnedAt` resurrects favorites on destroyed copies. Both are one
  // careless edit away, so assert the exact shape.
  assert.deepEqual(favoriteWriteWhere('uc1', ALICE), { id: 'uc1', userId: ALICE, burnedAt: null })
})

// ── isUnavailableToOthers ─────────────────────────────────────────

test('every block collapses to the same flag for other users', () => {
  // Reporting these separately would isolate "favorited" by subtraction, since
  // pending-trade state is returned honestly and auctions are public.
  assert.equal(isUnavailableToOthers({ inPendingTrade: true }), true)
  assert.equal(isUnavailableToOthers({ inAuction: true }), true)
  assert.equal(isUnavailableToOthers({ favorited: true }), true)
  assert.equal(isUnavailableToOthers({}), false)
  assert.equal(isUnavailableToOthers(), false)
})

// ── favoritedRequestedIds ─────────────────────────────────────────

test('requesting another user\'s favorite is blocked', () => {
  const rows = [{ id: 'uc1', userId: BOB, favoritedByUserId: BOB }]
  assert.deepEqual(favoritedRequestedIds(rows, ['uc1']), ['uc1'])
})

test('offering your OWN favorite is allowed', () => {
  // Requirement: favorites shield you from OTHER people asking, they do not stop
  // you giving the cToon away yourself. Only ids on the REQUESTED side are
  // considered, so an offered favorite never appears here. This asymmetry is the
  // rule most likely to be "tidied up" by a later refactor.
  const rows = [{ id: 'mine', userId: ALICE, favoritedByUserId: ALICE }]
  assert.deepEqual(favoritedRequestedIds(rows, []), [])
})

test('a stale marker on a requested copy does not block the trade', () => {
  const rows = [{ id: 'uc1', userId: BOB, favoritedByUserId: ALICE }]
  assert.deepEqual(favoritedRequestedIds(rows, ['uc1']), [])
})

test('cToons committed to the offer being countered are exempt', () => {
  // A counter re-proposes exactly the cToons in the offer it replaces. Without
  // the exemption, an initiator who favorites one of their own offered cToons
  // while the offer is outstanding makes the counter permanently unsendable.
  const rows = [
    { id: 'uc1', userId: BOB, favoritedByUserId: BOB },
    { id: 'uc2', userId: BOB, favoritedByUserId: BOB }
  ]
  assert.deepEqual(favoritedRequestedIds(rows, ['uc1', 'uc2'], ['uc1']), ['uc2'])
})

test('rows outside the requested set are ignored entirely', () => {
  const rows = [{ id: 'other', userId: BOB, favoritedByUserId: BOB }]
  assert.deepEqual(favoritedRequestedIds(rows, ['uc1']), [])
})

// ── the rejection message ─────────────────────────────────────────

test('the rejection message names no cToon, mint, owner or reason', () => {
  // server/utils/tradeOffer.js documents in prose that its errors are generic to
  // avoid being an oracle for another user's holdings. This makes that enforced
  // for the favorite case, and in particular stops the message from ever saying
  // the word "favorite" — which would defeat isUnavailableToOthers().
  const msg = UNAVAILABLE_REQUEST_MESSAGE.toLowerCase()
  for (const leak of ['favorite', 'favourite', 'auction', 'pending', 'mint', '#']) {
    assert.equal(msg.includes(leak), false, `rejection message leaks "${leak}"`)
  }
})

// ── disabledReasonFor ─────────────────────────────────────────────

test('the target side never names why a card is blocked', () => {
  assert.equal(disabledReasonFor({ unavailable: true }), 'Unavailable')
  assert.equal(disabledReasonFor({ unavailable: true, atLimit: true }), 'Unavailable')
  assert.equal(disabledReasonFor({ atLimit: true }), 'Limit')
  assert.equal(disabledReasonFor({}), null)
})

test('your own favorite is not a blocked card', () => {
  // Requirement 3 again, this time in the UI: your favorites stay selectable on
  // your own side and only wear a star.
  assert.equal(disabledReasonFor({ isOwnSide: true }), null)
  assert.equal(disabledReasonFor({ isOwnSide: true, unavailable: true }), null)
  assert.equal(disabledReasonFor({ isOwnSide: true, inPendingTrade: true }), 'In Trade')
  assert.equal(disabledReasonFor({ isOwnSide: true, atLimit: true }), 'Limit')
})

test('a pending trade outranks the per-side ceiling on your own side', () => {
  assert.equal(disabledReasonFor({ isOwnSide: true, inPendingTrade: true, atLimit: true }), 'In Trade')
})
