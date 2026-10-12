import test from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { queueStatus, summarizeFinished, BACKLOG_AGE_SEC, BACKLOG_COUNT } = await import(join(root, 'server/utils/queueHealth.js'))

test('queueStatus priority: paused > no-workers > backed-up > failures > ok', () => {
  const c = (o) => ({ waiting: 0, active: 0, delayed: 0, failed: 0, ...o })
  assert.equal(queueStatus({ counts: c({ waiting: 5 }), isPaused: true, workers: 0 }), 'paused')
  assert.equal(queueStatus({ counts: c({ waiting: 1 }), workers: 0 }), 'no-workers')
  assert.equal(queueStatus({ counts: c({ active: 1 }), workers: 0 }), 'no-workers')
  // unknown worker count (null) never claims "no workers"
  assert.equal(queueStatus({ counts: c({ waiting: 1 }), workers: null, oldestWaitingAgeSec: 5 }), 'ok')
  assert.equal(queueStatus({ counts: c({ waiting: 2 }), workers: 1, oldestWaitingAgeSec: BACKLOG_AGE_SEC + 1 }), 'backed-up')
  assert.equal(queueStatus({ counts: c({ waiting: BACKLOG_COUNT + 1 }), workers: 1, oldestWaitingAgeSec: 1 }), 'backed-up')
  assert.equal(queueStatus({ counts: c({ failed: 3 }), workers: 1 }), 'failures')
  // delayed jobs are future work, not a backlog; an idle queue with no workers is fine
  assert.equal(queueStatus({ counts: c({ delayed: 500 }), workers: 0 }), 'ok')
})

test('summarizeFinished buckets by hour/day and computes timings', () => {
  const now = 10_000_000_000
  const jobs = [
    { timestamp: now - 3000, processedOn: now - 2000, finishedOn: now - 1000 }, // wait 1000, proc 1000, last hour
    { timestamp: now - 5000_000 + 100, processedOn: now - 5000_000 + 300, finishedOn: now - 5000_000 + 500 }, // ~83 min ago: day only
    { timestamp: now - 90_000_000, processedOn: now - 89_999_000, finishedOn: now - 89_998_000 }, // >24h
  ]
  const s = summarizeFinished(jobs, now)
  assert.equal(s.sampled, 3)
  assert.equal(s.lastHour, 1)
  assert.equal(s.lastDay, 2)
  assert.equal(s.avgWaitMs, Math.round((1000 + 200 + 1000) / 3))
  assert.equal(summarizeFinished([], now).avgProcessMs, null)
})
