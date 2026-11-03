import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePrestigeRankTierBody } from '../server/utils/cmoonPrestigeRankValidation.js'

test('parsePrestigeRankTierBody requires a name', () => {
  const res = parsePrestigeRankTierBody({ sortOrder: 0, pointThreshold: 100, rewardType: 'POINTS', quantity: 10 })
  assert.equal(res.error, 'Name is required')
})

test('parsePrestigeRankTierBody accepts a valid POINTS reward', () => {
  const res = parsePrestigeRankTierBody({ name: 'Ascendant', sortOrder: 1, pointThreshold: 50000, rewardType: 'POINTS', quantity: 500 })
  assert.equal(res.error, undefined)
  assert.equal(res.name, 'Ascendant')
  assert.equal(res.sortOrder, 1)
  assert.equal(res.pointThreshold, 50000)
  assert.equal(res.rewardType, 'POINTS')
  assert.equal(res.quantity, 500)
  assert.equal(res.ctoonId, null)
  assert.equal(res.avatarId, null)
  assert.equal(res.backgroundId, null)
  assert.equal(res.packId, null)
})

test('parsePrestigeRankTierBody rejects an invalid reward type', () => {
  const res = parsePrestigeRankTierBody({ name: 'X', sortOrder: 0, pointThreshold: 0, rewardType: 'GOLD' })
  assert.match(res.error, /Reward type must be one of/)
})

test('parsePrestigeRankTierBody requires the matching id field for CTOON/AVATAR/BACKGROUND/PACK', () => {
  const ctoon = parsePrestigeRankTierBody({ name: 'X', sortOrder: 0, pointThreshold: 0, rewardType: 'CTOON', quantity: 1 })
  assert.match(ctoon.error, /ctoonId is required/)

  const avatar = parsePrestigeRankTierBody({ name: 'X', sortOrder: 0, pointThreshold: 0, rewardType: 'AVATAR' })
  assert.match(avatar.error, /avatarId is required/)
})

test('parsePrestigeRankTierBody rejects setting an id field that does not match the reward type', () => {
  const res = parsePrestigeRankTierBody({
    name: 'X', sortOrder: 0, pointThreshold: 0, rewardType: 'AVATAR', avatarId: 'a1', packId: 'p1',
  })
  assert.match(res.error, /must set only avatarId/)
})

test('parsePrestigeRankTierBody validates POINTS quantity bounds', () => {
  const tooLow = parsePrestigeRankTierBody({ name: 'X', sortOrder: 0, pointThreshold: 0, rewardType: 'POINTS', quantity: 0 })
  assert.match(tooLow.error, /Points amount must be/)
})

test('parsePrestigeRankTierBody validates CTOON/PACK quantity bounds', () => {
  const tooHigh = parsePrestigeRankTierBody({ name: 'X', sortOrder: 0, pointThreshold: 0, rewardType: 'PACK', packId: 'p1', quantity: 999 })
  assert.match(tooHigh.error, /Quantity must be a whole number/)
})

test('parsePrestigeRankTierBody falls back to `existing` for omitted fields on an edit', () => {
  const existing = { name: 'Old', sortOrder: 2, pointThreshold: 1000, rewardType: 'POINTS', quantity: 50, ctoonId: null, avatarId: null, backgroundId: null, packId: null }
  const res = parsePrestigeRankTierBody({ pointThreshold: 2000 }, existing)
  assert.equal(res.error, undefined)
  assert.equal(res.name, 'Old')
  assert.equal(res.sortOrder, 2)
  assert.equal(res.pointThreshold, 2000)
  assert.equal(res.quantity, 50)
})

test('parsePrestigeRankTierBody rejects a non-numeric sort order', () => {
  const res = parsePrestigeRankTierBody({ name: 'X', sortOrder: 'abc', pointThreshold: 0, rewardType: 'POINTS', quantity: 1 })
  assert.match(res.error, /Sort order must be/)
})

test('parsePrestigeRankTierBody rejects a point threshold above the ceiling', () => {
  const res = parsePrestigeRankTierBody({ name: 'X', sortOrder: 0, pointThreshold: 10_000_000, rewardType: 'POINTS', quantity: 1 })
  assert.match(res.error, /Point threshold must be/)
})
