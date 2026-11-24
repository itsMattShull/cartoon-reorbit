import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDailyStreakRewardBody } from '../server/utils/dailyStreakReward.js'

test('requires a valid day between 1 and 3650', () => {
  assert.equal(parseDailyStreakRewardBody({ day: 0, rewardType: 'POINTS', amount: 100 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 3651, rewardType: 'POINTS', amount: 100 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1.5, rewardType: 'POINTS', amount: 100 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 25, rewardType: 'POINTS', amount: 100 }).ok, true)
})

test('rejects an unknown reward type', () => {
  const result = parseDailyStreakRewardBody({ day: 1, rewardType: 'AVATAR', amount: 1 })
  assert.equal(result.ok, false)
  assert.match(result.message, /Reward type/)
})

test('CTOON requires ctoonId and rejects packId', () => {
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'CTOON', amount: 1 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'CTOON', ctoonId: 'c1', packId: 'p1', amount: 1 }).ok, false)
  const ok = parseDailyStreakRewardBody({ day: 1, rewardType: 'CTOON', ctoonId: 'c1', amount: 2 })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.data, { day: 1, rewardType: 'CTOON', ctoonId: 'c1', packId: null, amount: 2 })
})

test('PACK requires packId and rejects ctoonId', () => {
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'PACK', amount: 1 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'PACK', ctoonId: 'c1', packId: 'p1', amount: 1 }).ok, false)
  const ok = parseDailyStreakRewardBody({ day: 1, rewardType: 'PACK', packId: 'p1', amount: 3 })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.data, { day: 1, rewardType: 'PACK', ctoonId: null, packId: 'p1', amount: 3 })
})

test('POINTS and CMOON_POINTS must not set ctoonId or packId', () => {
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'POINTS', ctoonId: 'c1', amount: 100 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'CMOON_POINTS', packId: 'p1', amount: 100 }).ok, false)
  const points = parseDailyStreakRewardBody({ day: 1, rewardType: 'POINTS', amount: 500 })
  assert.equal(points.ok, true)
  assert.deepEqual(points.data, { day: 1, rewardType: 'POINTS', ctoonId: null, packId: null, amount: 500 })
  const cmoon = parseDailyStreakRewardBody({ day: 1, rewardType: 'CMOON_POINTS', amount: 50 })
  assert.equal(cmoon.ok, true)
  assert.deepEqual(cmoon.data, { day: 1, rewardType: 'CMOON_POINTS', ctoonId: null, packId: null, amount: 50 })
})

test('amount is required and bounded, with no silent default', () => {
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'POINTS' }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'POINTS', amount: 0 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'POINTS', amount: 100001 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'POINTS', amount: 2.5 }).ok, false)
  assert.equal(parseDailyStreakRewardBody({ day: 1, rewardType: 'POINTS', amount: 100000 }).ok, true)
})

test('accepts numbers sent as multipart-style strings', () => {
  const result = parseDailyStreakRewardBody({ day: '10', rewardType: 'POINTS', amount: '250' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { day: 10, rewardType: 'POINTS', ctoonId: null, packId: null, amount: 250 })
})
