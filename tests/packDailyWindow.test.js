import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveEffectiveWindowStart, getPackDailyWindowStart } from '../server/utils/packDailyWindow.js'

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

// ── getPackDailyWindowStart(now): the 8pm–7:59pm America/Chicago window ─────────────────────────────────────────────
// Injectable `now` so the OG gToons PvP reward can attribute a match to the window it ENDED in, and so the DST
// transitions (which happen at 2am local, never inside the 8pm boundary) are pinned down.
const at = (iso) => getPackDailyWindowStart(new Date(iso)).toISOString()

test('window: the last second before 8pm Central still belongs to the previous day window (CST, winter)', () => {
  assert.equal(at('2026-01-16T01:59:59Z'), '2026-01-15T02:00:00.000Z') // 19:59:59 CST on Jan 15
})

test('window: 8pm Central exactly starts a new window (CST)', () => {
  assert.equal(at('2026-01-16T02:00:00Z'), '2026-01-16T02:00:00.000Z')
})

test('window: 8pm boundary in summer (CDT) is 01:00Z', () => {
  assert.equal(at('2026-07-16T00:59:59Z'), '2026-07-15T01:00:00.000Z')
  assert.equal(at('2026-07-16T01:00:00Z'), '2026-07-16T01:00:00.000Z')
})

test('window: fall-back day (2026-11-01, 25-hour day) still resolves to 8pm local', () => {
  assert.equal(at('2026-11-02T01:59:59Z'), '2026-11-01T01:00:00.000Z') // 19:59:59 CST Nov 1 -> window began 8pm CDT Oct 31
  assert.equal(at('2026-11-02T02:00:00Z'), '2026-11-02T02:00:00.000Z') // 20:00 CST Nov 1
})

test('window: spring-forward day (2026-03-08, 23-hour day) still resolves to 8pm local', () => {
  assert.equal(at('2026-03-09T00:59:59Z'), '2026-03-08T02:00:00.000Z') // 19:59:59 CDT Mar 8 -> window began 8pm CST Mar 7
  assert.equal(at('2026-03-09T01:00:00Z'), '2026-03-09T01:00:00.000Z') // 20:00 CDT Mar 8
})

test('window: with no argument it still uses the current time (existing callers)', () => {
  const w = getPackDailyWindowStart()
  assert.ok(w instanceof Date && w.getTime() <= Date.now() && Date.now() - w.getTime() < 25 * 3600 * 1000)
})
