import { test } from 'node:test'
import assert from 'node:assert/strict'

import { byMintThenAge, selectAuctionOnlyBatch } from '../server/utils/auctionOnlySchedule.js'

const selectBatch = (pool, count, pickedId) =>
  selectAuctionOnlyBatch(pool, count, pickedId).map(a => a.mintNumber)

const poolOf = (from, to) => {
  const out = []
  for (let m = from; m <= to; m++) out.push({ id: `uc-${m}`, mintNumber: m, createdAt: '2026-08-01' })
  return out
}

test('a batch is released in mint order whichever copy the admin picked', () => {
  const pool = poolOf(41, 60)
  // The client always sends a userCtoonId, so every one of these is a real case.
  for (const pick of [41, 42, 50, 57, 60]) {
    assert.deepEqual(
      selectBatch(pool, 20, `uc-${pick}`),
      pool.map(p => p.mintNumber),
      `picking #${pick} must not reorder the release schedule`
    )
  }
})

test('the picked copy no longer jumps ahead of lower mints', () => {
  const pool = poolOf(41, 60)
  // The regression: picking #57 used to put #57 first, before #41.
  const order = selectBatch(pool, 20, 'uc-57')
  assert.equal(order[0], 41)
  assert.ok(order.indexOf(57) > order.indexOf(41))
})

test('the picked copy is still guaranteed a place in the batch', () => {
  const pool = poolOf(41, 60)
  // #60 is outside the lowest 17, so including it must displace the last one.
  const order = selectBatch(pool, 17, 'uc-60')
  assert.ok(order.includes(60), 'the explicitly picked copy must be scheduled')
  assert.equal(order.length, 17)
  assert.ok(!order.includes(57), '#57 is displaced to make room')
  // ...and the batch is still in mint order despite the displacement.
  assert.deepEqual(order, [...order].sort((a, b) => a - b))
})

test('a single auction schedules exactly the copy the admin picked', () => {
  const pool = poolOf(41, 60)
  assert.deepEqual(selectBatch(pool, 1, 'uc-57'), [57])
  assert.deepEqual(selectBatch(pool, 1, 'uc-41'), [41])
})

test('with no picked copy the lowest mints are taken, in order', () => {
  assert.deepEqual(selectBatch(poolOf(41, 60), 3, null), [41, 42, 43])
})

test('asking for more than exists schedules everything, in order', () => {
  assert.deepEqual(selectBatch(poolOf(41, 43), 99, 'uc-43'), [41, 42, 43])
})

test('copies with no mint number sort last, oldest first', () => {
  const pool = [
    { id: 'b', mintNumber: null, createdAt: '2026-08-02' },
    { id: 'a', mintNumber: null, createdAt: '2026-08-01' },
    { id: 'm', mintNumber: 7, createdAt: '2026-08-03' }
  ]
  assert.deepEqual([...pool].sort(byMintThenAge).map(x => x.id), ['m', 'a', 'b'])
})
