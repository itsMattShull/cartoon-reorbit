// Pure rules for sealed-pack state (server/utils/userPackState.js). The locking itself is covered against a real
// database in tests/packLockState.db.test.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  packBlockReason, packBlockError, normalizePackWants,
  PACK_BLOCK, PACK_UNAVAILABLE_MESSAGE, MAX_PACKS_PER_SIDE, MAX_PACK_TYPES_PER_SIDE
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

test('normalizePackWants: accepts {packId, quantity}, lowercases, merges duplicates, sorts', () => {
  assert.deepEqual(normalizePackWants(undefined), [])
  assert.deepEqual(normalizePackWants([]), [])
  assert.deepEqual(normalizePackWants([{ packId: P.toUpperCase(), quantity: 2 }, { packId: P, quantity: 3 }]), [{ packId: P, quantity: 5 }])
  const a = '00000000-0000-4000-8000-000000000001'; const b = '00000000-0000-4000-8000-000000000002'
  assert.deepEqual(normalizePackWants([{ packId: b, quantity: 1 }, { packId: a, quantity: 1 }]).map(w => w.packId), [a, b])
})

test('normalizePackWants: rejects junk, bad quantities, oversize', () => {
  assert.throws(() => normalizePackWants('x'), /must be an array/)
  assert.throws(() => normalizePackWants([{ packId: 'not-a-uuid', quantity: 1 }]), /invalid pack reference/)
  assert.throws(() => normalizePackWants([null]), /invalid pack reference/)
  assert.throws(() => normalizePackWants([{ packId: P, quantity: 0 }]), /quantity/)
  assert.throws(() => normalizePackWants([{ packId: P, quantity: 1.5 }]), /quantity/)
  assert.throws(() => normalizePackWants([{ packId: P, quantity: '2' }]), /quantity/)
  assert.throws(() => normalizePackWants([{ packId: P, quantity: MAX_PACKS_PER_SIDE + 1 }]), /quantity/)
  assert.throws(() => normalizePackWants([{ packId: P, quantity: 30 }, { packId: P, quantity: 30 }]), /at most/, 'merged total over the cap')
  const types = Array.from({ length: MAX_PACK_TYPES_PER_SIDE + 1 }, (_, i) => ({ packId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, quantity: 1 }))
  assert.throws(() => normalizePackWants(types), /different packs/)
  assert.equal(normalizePackWants([{ packId: P, quantity: MAX_PACKS_PER_SIDE }])[0].quantity, MAX_PACKS_PER_SIDE)
})
