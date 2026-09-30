import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isStaleDissolveLaunchJob } from '../server/utils/dissolveAuctionLaunchStaleness.js'

// This is what closes issue #1135: a dissolve-auction-launch job whose delay
// already elapsed (BullMQ marked it `active`) right as an admin rescheduled
// that entry can't be cancelled/replaced by scheduleDissolveAuctionLaunch, so
// it was running against the OLD target time and clobbering the admin's
// fresh reschedule (nulling scheduledFor, which then sorted the entry to the
// end of the queue and displayed "Not scheduled"). The worker now checks this
// before acting on an entry.

const NOW = new Date('2026-09-24T09:00:00Z')
const LATER = new Date('2026-09-24T12:00:00Z')

test('a job whose scheduledForMs matches the entry is not stale', () => {
  assert.equal(isStaleDissolveLaunchJob(NOW.getTime(), NOW), false)
  assert.equal(isStaleDissolveLaunchJob(NOW.getTime(), NOW.toISOString()), false)
})

test('a job whose scheduledForMs no longer matches a rescheduled entry is stale', () => {
  assert.equal(isStaleDissolveLaunchJob(NOW.getTime(), LATER), true)
})

test('a job is stale when the entry has since been unscheduled (scheduledFor: null)', () => {
  assert.equal(isStaleDissolveLaunchJob(NOW.getTime(), null), true)
})

test('a job with no stamped scheduledForMs (enqueued before this field existed) is never stale', () => {
  assert.equal(isStaleDissolveLaunchJob(undefined, LATER), false)
  assert.equal(isStaleDissolveLaunchJob(undefined, null), false)
})
