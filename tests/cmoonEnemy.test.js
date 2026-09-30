import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMemberBody, parseRewardBody, isValidCritChance, isValidPointsAmount,
  CRIT_CHANCE_MIN, CRIT_CHANCE_MAX, POINTS_REWARD_MIN, POINTS_REWARD_MAX,
} from '../server/utils/cmoonEnemy.js'

const baseMemberBody = { factionId: 'f1', name: 'Test Enemy', battleMode: 'PER_PLAYER', maxHp: 5, cMoonPointsReward: 10 }

test('isValidCritChance accepts the full 0-100 range and rejects outside it', () => {
  assert.equal(isValidCritChance(CRIT_CHANCE_MIN), true)
  assert.equal(isValidCritChance(CRIT_CHANCE_MAX), true)
  assert.equal(isValidCritChance(50), true)
  assert.equal(isValidCritChance(-1), false)
  assert.equal(isValidCritChance(101), false)
  assert.equal(isValidCritChance(50.5), false)
  assert.equal(isValidCritChance(NaN), false)
})

test('parseMemberBody: crit chance fields default to 0 on create when omitted', () => {
  const result = parseMemberBody(baseMemberBody, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.critChanceAgainstPercent, 0)
  assert.equal(result.data.critChanceFromPercent, 0)
})

test('parseMemberBody: accepts explicit crit chance values within range', () => {
  const result = parseMemberBody({ ...baseMemberBody, critChanceAgainstPercent: 25, critChanceFromPercent: 10 }, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.critChanceAgainstPercent, 25)
  assert.equal(result.data.critChanceFromPercent, 10)
})

test('parseMemberBody: rejects an out-of-range crit chance', () => {
  assert.equal(parseMemberBody({ ...baseMemberBody, critChanceAgainstPercent: 101 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, critChanceAgainstPercent: -1 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, critChanceFromPercent: 200 }, undefined).ok, false)
})

test('parseMemberBody: an update with no crit chance fields in the body keeps the existing values', () => {
  const existing = { ...baseMemberBody, active: true, sortOrder: 0, critChanceAgainstPercent: 40, critChanceFromPercent: 15, hasBattles: false }
  const result = parseMemberBody({}, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.critChanceAgainstPercent, 40)
  assert.equal(result.data.critChanceFromPercent, 15)
})

test('isValidPointsAmount accepts the full range and rejects outside it', () => {
  assert.equal(isValidPointsAmount(POINTS_REWARD_MIN), true)
  assert.equal(isValidPointsAmount(POINTS_REWARD_MAX), true)
  assert.equal(isValidPointsAmount(0), false) // min is 1, not 0 — a 0-point reward isn't meaningful
  assert.equal(isValidPointsAmount(POINTS_REWARD_MAX + 1), false)
  assert.equal(isValidPointsAmount(NaN), false)
})

test('parseRewardBody: POINTS reward requires no id field and a valid points amount', () => {
  const result = parseRewardBody({ rewardType: 'POINTS', dropChancePercent: 10, quantity: 500 })
  assert.equal(result.ok, true)
  assert.equal(result.data.rewardType, 'POINTS')
  assert.equal(result.data.quantity, 500)
  assert.equal(result.data.ctoonId, null)
  assert.equal(result.data.avatarId, null)
  assert.equal(result.data.backgroundId, null)
})

test('parseRewardBody: POINTS reward rejects a missing/invalid quantity', () => {
  assert.equal(parseRewardBody({ rewardType: 'POINTS', dropChancePercent: 10 }).ok, false)
  assert.equal(parseRewardBody({ rewardType: 'POINTS', dropChancePercent: 10, quantity: 0 }).ok, false)
  assert.equal(parseRewardBody({ rewardType: 'POINTS', dropChancePercent: 10, quantity: 5001 }).ok, false)
})

test('parseRewardBody: POINTS reward rejects setting any id field', () => {
  const result = parseRewardBody({ rewardType: 'POINTS', dropChancePercent: 10, quantity: 100, ctoonId: 'c1' })
  assert.equal(result.ok, false)
})

test('parseRewardBody: CTOON/AVATAR/BACKGROUND reward types are unaffected by the POINTS addition', () => {
  assert.equal(parseRewardBody({ rewardType: 'CTOON', ctoonId: 'c1', dropChancePercent: 10, quantity: 2 }).ok, true)
  assert.equal(parseRewardBody({ rewardType: 'AVATAR', avatarId: 'a1', dropChancePercent: 10 }).ok, true)
  assert.equal(parseRewardBody({ rewardType: 'BACKGROUND', backgroundId: 'b1', dropChancePercent: 10 }).ok, true)
})

test('parseRewardBody: rejects an unknown reward type', () => {
  assert.equal(parseRewardBody({ rewardType: 'GOLD', dropChancePercent: 10, quantity: 100 }).ok, false)
})
