import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveEffectiveWindowStart } from '../server/utils/packDailyWindow.js'

// resolveEffectiveWindowStart is what an admin "Reset Pack Limit" actually
// changes at purchase time — see server/api/cmart/packs/buy.post.js and
// server/api/admin/users/[id]/reset-pack-limit.post.js.

test('with no reset, the natural window start is used', () => {
  const windowStart = new Date('2026-09-20T20:00:00Z')
  assert.equal(resolveEffectiveWindowStart(windowStart, null).getTime(), windowStart.getTime())
  assert.equal(resolveEffectiveWindowStart(windowStart, undefined).getTime(), windowStart.getTime())
})

test('a reset made after the window started moves the effective start forward', () => {
  const windowStart = new Date('2026-09-20T20:00:00Z')
  const resetAt = new Date('2026-09-21T02:00:00Z') // 6h into today's window
  assert.equal(resolveEffectiveWindowStart(windowStart, resetAt).getTime(), resetAt.getTime())
})

test('a stale reset from before the window started is ignored', () => {
  // A reset issued during yesterday's window (or earlier) must never keep
  // suppressing today's real purchases once the window has rolled over.
  const windowStart = new Date('2026-09-20T20:00:00Z')
  const staleResetAt = new Date('2026-09-19T10:00:00Z')
  assert.equal(resolveEffectiveWindowStart(windowStart, staleResetAt).getTime(), windowStart.getTime())
})

test('a reset exactly at the window start is not treated as "after" it', () => {
  const windowStart = new Date('2026-09-20T20:00:00Z')
  assert.equal(resolveEffectiveWindowStart(windowStart, new Date(windowStart)).getTime(), windowStart.getTime())
})
