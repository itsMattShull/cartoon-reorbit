import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoopGovernor } from '../lib/gtoonLoopGovernor.js'

const make = (opts = {}) => {
  const log = []
  const g = createLoopGovernor({ ...opts, onPause: c => log.push(`pause ${c}`), onResume: c => log.push(`resume ${c}`) })
  return { g, log }
}

test('every card may loop while the device keeps up', () => {
  const { g, log } = make({ initialBudget: 16 })
  for (let i = 0; i < 14; i++) g.add(`c${i}`)
  for (let i = 0; i < 10; i++) g.tick(60)
  assert.equal(g.runningCount, 14)
  assert.equal(g.pausedCount, 0)
  assert.deepEqual(log, [])
})

test('a struggling frame rate pauses the OLDEST cards first and keeps the newest looping', () => {
  const { g, log } = make({ initialBudget: 16 })
  for (let i = 0; i < 10; i++) g.add(`c${i}`)
  g.tick(12)                                       // 10 running -> budget 7: c0,c1,c2 pause
  assert.deepEqual(log, ['pause c0', 'pause c1', 'pause c2'])
  assert.equal(g.runningCount, 7)
  g.tick(12)                                       // still struggling: 7 -> 4
  assert.equal(g.runningCount, 4)
  assert.equal(log.at(-1), 'pause c5')
})

test('it never pauses below the minimum', () => {
  const { g } = make({ minBudget: 2 })
  for (let i = 0; i < 6; i++) g.add(`c${i}`)
  for (let i = 0; i < 20; i++) g.tick(1)
  assert.equal(g.runningCount, 2)
})

test('recovery is gradual: needs consecutive healthy windows, then resumes a couple of cards at a time', () => {
  const { g, log } = make({ initialBudget: 16, goodWindows: 3, step: 2, backoff: false })
  for (let i = 0; i < 10; i++) g.add(`c${i}`)
  g.tick(10); g.tick(10)                           // down to 4 running, 6 paused
  log.length = 0
  g.tick(60); g.tick(60)
  assert.deepEqual(log, [], 'not yet — two good windows only')
  g.tick(60)
  assert.equal(log.length, 2)
  assert.equal(g.runningCount, 6)
  g.tick(30)                                       // a middling window resets the streak
  g.tick(60); g.tick(60)
  assert.equal(g.runningCount, 6)
  g.tick(60)
  assert.equal(g.runningCount, 8)
})

test('a new card starting past the budget evicts the oldest; removed cards leave both lists', () => {
  const { g, log } = make({ initialBudget: 3 })
  g.add('a'); g.add('b'); g.add('c'); g.add('d')
  assert.deepEqual(log, ['pause a'])
  assert.equal(g.runningCount, 3)
  g.remove('a')                                    // gone for good (e.g. unmounted) — must not come back
  for (let i = 0; i < 6; i++) g.tick(60)
  assert.equal(log.filter(l => l === 'resume a').length, 0)
  g.remove('b')
  assert.equal(g.runningCount, 2)
})

test('resume never exceeds the initial budget', () => {
  const { g } = make({ initialBudget: 4, goodWindows: 1, step: 10, backoff: false })
  for (let i = 0; i < 4; i++) g.add(`c${i}`)
  g.tick(5)
  for (let i = 0; i < 8; i++) g.tick(60)
  assert.ok(g.runningCount <= 4)
  assert.ok(g.budget <= 4)
})

test('backoff: each cut doubles the wait before loops come back, up to a cap, and it eases off when healthy', () => {
  const { g } = make({ initialBudget: 16, goodWindows: 3, maxGoodWindows: 12 })
  for (let i = 0; i < 10; i++) g.add(`c${i}`)
  assert.equal(g.recoveryWindows, 3)
  g.tick(10); assert.equal(g.recoveryWindows, 6)
  g.tick(10); assert.equal(g.recoveryWindows, 12)
  g.tick(10); assert.equal(g.recoveryWindows, 12, 'capped')
  const before = g.runningCount
  for (let i = 0; i < 11; i++) g.tick(60)
  assert.equal(g.runningCount, before, 'still waiting out the backoff')
  g.tick(60)
  assert.ok(g.runningCount > before, 'resumes after the longer wait')
})

test('the default thresholds treat ~45fps as healthy and ~20fps as struggling', () => {
  const { g } = make({ initialBudget: 8 })
  for (let i = 0; i < 8; i++) g.add(`c${i}`)
  g.tick(30)
  assert.equal(g.runningCount, 8, '30fps is neither struggling nor headroom')
  g.tick(20)
  assert.ok(g.runningCount < 8)
})
