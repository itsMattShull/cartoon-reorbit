import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rate, summarizeOffers, summarizeSoloBattles, logEnemyOffer, markEnemyOfferAccepted, OFFER_ACCEPT_WINDOW_MINUTES,
} from '../server/utils/cmoonEnemyAnalytics.js'

test('rate: one-decimal percentage, null when there is nothing to divide by', () => {
  assert.equal(rate(1, 3), 33.3)
  assert.equal(rate(2, 2), 100)
  assert.equal(rate(0, 5), 0)
  assert.equal(rate(0, 0), null)
})

test('summarizeOffers: splits solo and raid and computes each start rate', () => {
  const out = summarizeOffers([
    { isRaidBoss: false, offered: 8, accepted: 2 },
    { isRaidBoss: false, offered: 2, accepted: 1 },
    { isRaidBoss: true, offered: 4, accepted: 1 },
  ])
  assert.deepEqual(out.solo, { offered: 10, accepted: 3, startRate: 30 })
  assert.deepEqual(out.raid, { offered: 4, accepted: 1, startRate: 25 })
})

test('summarizeOffers: no offers gives null rates, not 0%', () => {
  const out = summarizeOffers([])
  assert.equal(out.solo.startRate, null)
  assert.equal(out.raid.startRate, null)
})

test('summarizeSoloBattles: win, loss and sniped count as finished; stale in-progress counts as abandoned', () => {
  const out = summarizeSoloBattles([
    { status: 'RESOLVED', outcome: 'WIN', count: 5 },
    { status: 'RESOLVED', outcome: 'LOSS', count: 2 },
    { status: 'RESOLVED', outcome: 'UNCREDITED', count: 1 },
    { status: 'RESOLVED', outcome: 'ABANDONED', count: 1 },
    { status: 'IN_PROGRESS', outcome: null, stale: true, count: 1 },
    { status: 'IN_PROGRESS', outcome: null, stale: false, count: 3 },
  ])
  assert.equal(out.started, 13)
  assert.equal(out.completed, 8)
  assert.equal(out.abandoned, 2)
  assert.equal(out.inProgress, 3)
  // Live battles are excluded from the denominator: 8 / (8 + 2)
  assert.equal(out.completionRate, 80)
})

test('summarizeSoloBattles: only live battles means no rate yet', () => {
  const out = summarizeSoloBattles([{ status: 'IN_PROGRESS', outcome: null, stale: false, count: 2 }])
  assert.equal(out.completionRate, null)
})

test('logEnemyOffer: writes the offer and swallows a failure', async () => {
  const created = []
  await logEnemyOffer({ cMoonEnemyOffer: { create: async (a) => { created.push(a.data) } } },
    { userId: 'u1', enemyMemberId: 'e1', isRaidBoss: undefined })
  assert.deepEqual(created, [{ userId: 'u1', enemyMemberId: 'e1', isRaidBoss: false }])

  const orig = console.error
  console.error = () => {}
  try {
    await logEnemyOffer({ cMoonEnemyOffer: { create: async () => { throw new Error('db down') } } },
      { userId: 'u1', enemyMemberId: 'e1', isRaidBoss: true })
  } finally {
    console.error = orig
  }
})

test('markEnemyOfferAccepted: stamps the latest unaccepted offer of that enemy inside the window', async () => {
  const calls = { findFirst: null, update: null }
  const db = {
    cMoonEnemyOffer: {
      findFirst: async (a) => { calls.findFirst = a; return { id: 'o9' } },
      update: async (a) => { calls.update = a },
    },
  }
  const before = Date.now()
  await markEnemyOfferAccepted(db, { userId: 'u1', enemyMemberId: 'e1' })
  const w = calls.findFirst.where
  assert.equal(w.userId, 'u1')
  assert.equal(w.enemyMemberId, 'e1')
  assert.equal(w.acceptedAt, null)
  assert.ok(Math.abs(w.offeredAt.gte.getTime() - (before - OFFER_ACCEPT_WINDOW_MINUTES * 60 * 1000)) < 1000)
  assert.deepEqual(calls.findFirst.orderBy, { offeredAt: 'desc' })
  assert.equal(calls.update.where.id, 'o9')
  assert.ok(calls.update.data.acceptedAt instanceof Date)
})

test('markEnemyOfferAccepted: no matching offer means no update', async () => {
  let updated = false
  await markEnemyOfferAccepted({
    cMoonEnemyOffer: { findFirst: async () => null, update: async () => { updated = true } },
  }, { userId: 'u1', enemyMemberId: 'e1' })
  assert.equal(updated, false)
})
