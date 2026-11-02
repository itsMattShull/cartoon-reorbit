// Pure rules for sealed-pack state (server/utils/userPackState.js). The locking itself is covered against a real
// database in tests/packLockState.db.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  packBlockReason, packBlockError, normalizePackIdList, assertNoPackCrossSideOverlap,
  PACK_BLOCK, PACK_UNAVAILABLE_MESSAGE, MAX_PACKS_PER_SIDE
} from '../server/utils/userPackState.js'

const U = '11111111-1111-4111-8111-111111111111'
const P = '22222222-2222-4222-8222-222222222222'
const free = { inActiveAuction: false, inPendingTrade: false }
const mk = (over = {}) => ({ id: P, userId: U, opened: false, ...over })

test('a sealed pack you own that is in nothing is usable', () => {
  assert.equal(packBlockReason(mk(), free, U), null)
})

test('missing, someone else\'s, and opened packs are blocked, in that precedence', () => {
  assert.equal(packBlockReason(null, free, U), PACK_BLOCK.NOT_FOUND)
  assert.equal(packBlockReason(mk({ userId: 'other' }), free, U), PACK_BLOCK.NOT_OWNER)
  assert.equal(packBlockReason(mk({ opened: true }), free, U), PACK_BLOCK.OPENED)
})

test('a pack in an active auction is blocked (cannot be opened or traded)', () => {
  assert.equal(packBlockReason(mk(), { inActiveAuction: true, inPendingTrade: false }, U), PACK_BLOCK.IN_AUCTION)
})

test('a pack in a pending trade is blocked (cannot be opened or auctioned)', () => {
  assert.equal(packBlockReason(mk(), { inActiveAuction: false, inPendingTrade: true }, U), PACK_BLOCK.IN_TRADE)
})

test('ownership is checked before lock state, so a stranger learns nothing about someone else\'s pack', () => {
  assert.equal(packBlockReason(mk({ userId: 'other' }), { inActiveAuction: true, inPendingTrade: true }, U), PACK_BLOCK.NOT_OWNER)
})

test('generic errors are identical for every reason; specific ones are not', () => {
  const reasons = Object.values(PACK_BLOCK)
  const generic = new Set(reasons.map(r => packBlockError(r, { generic: true }).statusMessage))
  assert.deepEqual([...generic], [PACK_UNAVAILABLE_MESSAGE])
  assert.ok(!/lock/i.test(PACK_UNAVAILABLE_MESSAGE), 'must never say "lock"')
  const specific = new Set(reasons.map(r => packBlockError(r).statusMessage))
  assert.ok(specific.size > 1)
})

test('normalizePackIdList: accepts UUIDs, lowercases, dedupes; rejects junk and oversize', () => {
  assert.deepEqual(normalizePackIdList(undefined), [])
  assert.deepEqual(normalizePackIdList([P, P.toUpperCase()]), [P])
  assert.throws(() => normalizePackIdList('x'), /must be an array/)
  assert.throws(() => normalizePackIdList(['not-a-uuid']), /invalid pack reference/)
  assert.throws(() => normalizePackIdList([{}]), /invalid pack reference/)
  const many = Array.from({ length: MAX_PACKS_PER_SIDE + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
  assert.throws(() => normalizePackIdList(many), /at most/)
  assert.equal(normalizePackIdList(many.slice(0, MAX_PACKS_PER_SIDE)).length, MAX_PACKS_PER_SIDE)
})

test('a pack cannot be on both sides of one offer', () => {
  assert.throws(() => assertNoPackCrossSideOverlap([P], [P]), /both offered and requested/)
  assert.doesNotThrow(() => assertNoPackCrossSideOverlap([P], [U]))
})
