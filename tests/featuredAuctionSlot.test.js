import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dueFeaturedSlot, chicagoParts } from '../server/utils/featuredAuctionSlot.js'
import { CRON_JOBS_BY_NAME } from '../server/cron/jobs.js'

const ALL_HOURS = Array.from({ length: 24 }, (_, h) => h)
// 2026-11-23 is CST (UTC-6), so 14:00Z is 08:00 Chicago.
const at = iso => new Date(iso)

test('chicagoParts reads the Chicago wall clock, including across DST', () => {
  assert.deepEqual(chicagoParts(at('2026-11-23T14:00:00Z')), { year: 2026, month: 11, day: 23, hour: 8 })
  assert.deepEqual(chicagoParts(at('2026-07-01T13:00:00Z')), { year: 2026, month: 7, day: 1, hour: 8 }) // CDT
  assert.deepEqual(chicagoParts(at('2026-11-24T05:30:00Z')), { year: 2026, month: 11, day: 23, hour: 23 })
  assert.deepEqual(chicagoParts(at('2026-11-24T06:00:00Z')), { year: 2026, month: 11, day: 24, hour: 0 })
})

test('every hour selected at 2 per slot fires 24 slots a day, 48 auctions', () => {
  const config = { featuredAuctionHours: ALL_HOURS, featuredAuctionsPerSlot: 2, featuredAuctionIntervalDays: 1 }
  const keys = new Set()
  let auctions = 0
  for (let h = 0; h < 24; h++) {
    const slot = dueFeaturedSlot(config, new Date(Date.UTC(2026, 10, 23, 6 + h, 0, 5))) // Chicago midnight onward
    assert.ok(slot, `hour ${h} should fire`)
    keys.add(slot.slotKey)
    auctions += slot.perSlot
  }
  assert.equal(keys.size, 24)
  assert.equal(auctions, 48)
})

test('only the selected hours fire, keyed by Chicago date and hour', () => {
  const config = { featuredAuctionHours: [8, 20], featuredAuctionsPerSlot: 1 }
  assert.deepEqual(dueFeaturedSlot(config, at('2026-11-23T14:00:00Z')), { slotKey: '2026-11-23-08', perSlot: 1 })
  assert.equal(dueFeaturedSlot(config, at('2026-11-23T15:00:00Z')), null)
  assert.deepEqual(dueFeaturedSlot(config, at('2026-11-24T02:59:00Z')), { slotKey: '2026-11-23-20', perSlot: 1 })
})

test('nothing fires with no hours, or with 0 per slot', () => {
  assert.equal(dueFeaturedSlot({ featuredAuctionHours: [], featuredAuctionsPerSlot: 2 }, at('2026-11-23T14:00:00Z')), null)
  assert.equal(dueFeaturedSlot({ featuredAuctionHours: ALL_HOURS, featuredAuctionsPerSlot: 0 }, at('2026-11-23T14:00:00Z')), null)
  assert.equal(dueFeaturedSlot(null, at('2026-11-23T14:00:00Z')), null)
})

test('every-N-days fires on day 0 of the cycle (2025-01-01) and every Nth day after', () => {
  const config = { featuredAuctionHours: [8], featuredAuctionsPerSlot: 1, featuredAuctionIntervalDays: 2 }
  assert.ok(dueFeaturedSlot(config, at('2025-01-01T14:00:00Z')))
  assert.equal(dueFeaturedSlot(config, at('2025-01-02T14:00:00Z')), null)
  assert.ok(dueFeaturedSlot(config, at('2025-01-03T14:00:00Z')))
  // An interval below 1 is treated as every day.
  assert.ok(dueFeaturedSlot({ ...config, featuredAuctionIntervalDays: 0 }, at('2025-01-02T14:00:00Z')))
})

test('the schedule runs at the top of every Chicago hour', () => {
  const job = CRON_JOBS_BY_NAME.runFeaturedAuctionSchedule
  assert.ok(job, 'runFeaturedAuctionSchedule is not registered in server/cron/jobs.js')
  assert.equal(job.pattern, '0 * * * *')
  assert.equal(job.tz, 'America/Chicago')
})

test('the featured schedule leaves dissolve-queue and pending Auction Only cToons alone', () => {
  const src = readFileSync(new URL('../server/utils/featuredAuctionSchedule.js', import.meta.url), 'utf8')
  assert.match(src, /dissolveAuctionQueue:\s*null/)
  assert.match(src, /auctionOnlyListings:\s*\{\s*none:\s*\{\s*isStarted:\s*false\s*\}\s*\}/)
  // The slot is claimed atomically before anything is created, so it can never fire twice.
  assert.ok(src.indexOf('featuredAuctionLastFiredSlot: due.slotKey') < src.indexOf('tx.auction.create'))
})
