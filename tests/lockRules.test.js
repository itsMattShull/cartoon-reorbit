import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isLockedCopy,
  isActiveLock,
  lockWriteWhere,
  isUnavailableToOthers,
  lockedRequestedIds,
  disabledReasonFor,
  UNAVAILABLE_REQUEST_MESSAGE
} from '../server/utils/lockRules.js'

const ALICE = 'alice-id'
const BOB = 'bob-id'

// ── isLockedCopy ───────────────────────────────────────────────
// The whole design rests on this comparison. `lockedByUserId` is stored
// instead of a boolean so that the ~15 sites that rewrite UserCtoon.userId do
// not each have to remember to clear a lock; these tests are what make that
// claim enforced rather than a code-review promise.

test('a copy whose marker matches its owner is locked', () => {
  assert.equal(isLockedCopy({ userId: ALICE, lockedByUserId: ALICE }), true)
})

test('a marker left by a PREVIOUS owner reads as NOT locked', () => {
  // This is the entire justification for the column's shape. Alice locked it,
  // then it changed hands to Bob without anybody clearing the marker. A boolean
  // would still say `true` here and would silently make Bob's copy
  // un-requestable by everyone and un-auctionable by Bob.
  assert.equal(isLockedCopy({ userId: BOB, lockedByUserId: ALICE }), false)
})

test('an unset marker is not locked', () => {
  assert.equal(isLockedCopy({ userId: ALICE, lockedByUserId: null }), false)
  assert.equal(isLockedCopy({ userId: ALICE }), false)
})

test('two null-ish fields are never equal enough to count as locked', () => {
  // Guards the explicit null check: a bare `a === b` would report this as
  // locked, and a row mid-construction would then block trades.
  assert.equal(isLockedCopy({ userId: null, lockedByUserId: null }), false)
  assert.equal(isLockedCopy({ userId: undefined, lockedByUserId: undefined }), false)
  assert.equal(isLockedCopy({ userId: '', lockedByUserId: '' }), false)
})

test('isLockedCopy tolerates a missing row', () => {
  assert.equal(isLockedCopy(null), false)
  assert.equal(isLockedCopy(undefined), false)
})

// ── isActiveLock ──────────────────────────────────────────────

test('a burned copy is never reported as an active lock', () => {
  // holiday/redeem.post.js soft-locks the source row with burnedAt and can UNDO
  // that lock when the reward mint fails, so the marker is deliberately left
  // alone there. Filtering on read is therefore the only correct place, and
  // this pins it.
  assert.equal(isActiveLock({ userId: ALICE, lockedByUserId: ALICE, burnedAt: new Date() }), false)
  assert.equal(isActiveLock({ userId: ALICE, lockedByUserId: ALICE, burnedAt: null }), true)
})

// ── lockWriteWhere ────────────────────────────────────────────

test('lockWriteWhere always carries owner and burnedAt predicates', () => {
  // Dropping `userId` here is a full IDOR (anyone unlocks anyone's copy);
  // dropping `burnedAt` resurrects locks on destroyed copies. Both are one
  // careless edit away, so assert the exact shape.
  assert.deepEqual(lockWriteWhere('uc1', ALICE), { id: 'uc1', userId: ALICE, burnedAt: null })
})

// ── isUnavailableToOthers ─────────────────────────────────────────

test('every block collapses to the same flag for other users', () => {
  // Reporting these separately would isolate "locked" by subtraction, since
  // pending-trade state is returned honestly and auctions are public.
  assert.equal(isUnavailableToOthers({ inPendingTrade: true }), true)
  assert.equal(isUnavailableToOthers({ inAuction: true }), true)
  assert.equal(isUnavailableToOthers({ locked: true }), true)
  assert.equal(isUnavailableToOthers({}), false)
  assert.equal(isUnavailableToOthers(), false)
})

// ── lockedRequestedIds ─────────────────────────────────────────

test('requesting another user\'s lock is blocked', () => {
  const rows = [{ id: 'uc1', userId: BOB, lockedByUserId: BOB }]
  assert.deepEqual(lockedRequestedIds(rows, ['uc1']), ['uc1'])
})

test('offering your OWN lock is allowed', () => {
  // Requirement: locks shield you from OTHER people asking, they do not stop
  // you giving the cToon away yourself. Only ids on the REQUESTED side are
  // considered, so an offered lock never appears here. This asymmetry is the
  // rule most likely to be "tidied up" by a later refactor.
  const rows = [{ id: 'mine', userId: ALICE, lockedByUserId: ALICE }]
  assert.deepEqual(lockedRequestedIds(rows, []), [])
})

test('a stale marker on a requested copy does not block the trade', () => {
  const rows = [{ id: 'uc1', userId: BOB, lockedByUserId: ALICE }]
  assert.deepEqual(lockedRequestedIds(rows, ['uc1']), [])
})

test('cToons committed to the offer being countered are exempt', () => {
  // A counter re-proposes exactly the cToons in the offer it replaces. Without
  // the exemption, an initiator who locks one of their own offered cToons
  // while the offer is outstanding makes the counter permanently unsendable.
  const rows = [
    { id: 'uc1', userId: BOB, lockedByUserId: BOB },
    { id: 'uc2', userId: BOB, lockedByUserId: BOB }
  ]
  assert.deepEqual(lockedRequestedIds(rows, ['uc1', 'uc2'], ['uc1']), ['uc2'])
})

test('rows outside the requested set are ignored entirely', () => {
  const rows = [{ id: 'other', userId: BOB, lockedByUserId: BOB }]
  assert.deepEqual(lockedRequestedIds(rows, ['uc1']), [])
})

// ── the rejection message ─────────────────────────────────────────

test('the rejection message names no cToon, mint, owner or reason', () => {
  // server/utils/tradeOffer.js documents in prose that its errors are generic to
  // avoid being an oracle for another user's holdings. This makes that enforced
  // for the lock case, and in particular stops the message from ever saying
  // the word "lock" — which would defeat isUnavailableToOthers().
  const msg = UNAVAILABLE_REQUEST_MESSAGE.toLowerCase()
  for (const leak of ['lock', 'locked', 'favorite', 'auction', 'pending', 'mint', '#']) {
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

test('your own lock is not a blocked card', () => {
  // Requirement 3 again, this time in the UI: your locks stay selectable on
  // your own side and only wear a lock icon.
  assert.equal(disabledReasonFor({ isOwnSide: true }), null)
  assert.equal(disabledReasonFor({ isOwnSide: true, unavailable: true }), null)
  assert.equal(disabledReasonFor({ isOwnSide: true, inPendingTrade: true }), 'In Trade')
  assert.equal(disabledReasonFor({ isOwnSide: true, atLimit: true }), 'Limit')
})

test('a pending trade outranks the per-side ceiling on your own side', () => {
  assert.equal(disabledReasonFor({ isOwnSide: true, inPendingTrade: true, atLimit: true }), 'In Trade')
})
