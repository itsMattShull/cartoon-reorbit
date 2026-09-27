import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveBattleRound, rollEnemyAction, rollEnemyRewards, buildGrantableReward,
  isValidBattleAction, BATTLE_ACTIONS, PLAYER_MAX_HP,
} from '../server/utils/cmoonEnemyBattle.js'

test('resolveBattleRound: matching block cancels the matching-lane attack', () => {
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'BLOCK_HIGH'), { playerHit: false, enemyHit: false })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'BLOCK_LOW'), { playerHit: false, enemyHit: false })
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'ATTACK_HIGH'), { playerHit: false, enemyHit: false })
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'ATTACK_LOW'), { playerHit: false, enemyHit: false })
})

test('resolveBattleRound: wrong-lane block does not cancel the attack', () => {
  // player attacks high, enemy blocks low -> enemy still gets hit
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'BLOCK_LOW'), { playerHit: false, enemyHit: true })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'BLOCK_HIGH'), { playerHit: false, enemyHit: true })
  // player blocks low, enemy attacks high -> player still gets hit
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'ATTACK_HIGH'), { playerHit: true, enemyHit: false })
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'ATTACK_LOW'), { playerHit: true, enemyHit: false })
})

test('resolveBattleRound: mutual attack lands on both sides regardless of lane', () => {
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'ATTACK_HIGH'), { playerHit: true, enemyHit: true })
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'ATTACK_LOW'), { playerHit: true, enemyHit: true })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'ATTACK_HIGH'), { playerHit: true, enemyHit: true })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'ATTACK_LOW'), { playerHit: true, enemyHit: true })
})

test('resolveBattleRound: mutual block is a no-op regardless of lane', () => {
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'BLOCK_HIGH'), { playerHit: false, enemyHit: false })
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'BLOCK_LOW'), { playerHit: false, enemyHit: false })
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'BLOCK_HIGH'), { playerHit: false, enemyHit: false })
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'BLOCK_LOW'), { playerHit: false, enemyHit: false })
})

test('resolveBattleRound: exhaustively covers every 4x4 combination with no exceptions', () => {
  for (const a of BATTLE_ACTIONS) {
    for (const b of BATTLE_ACTIONS) {
      const result = resolveBattleRound(a, b)
      assert.equal(typeof result.playerHit, 'boolean')
      assert.equal(typeof result.enemyHit, 'boolean')
    }
  }
})

test('resolveBattleRound: rejects an invalid action rather than silently resolving one', () => {
  assert.throws(() => resolveBattleRound('NOT_A_REAL_ACTION', 'BLOCK_HIGH'))
  assert.throws(() => resolveBattleRound('ATTACK_HIGH', 'NOT_A_REAL_ACTION'))
  assert.throws(() => resolveBattleRound(undefined, 'BLOCK_HIGH'))
  assert.throws(() => resolveBattleRound('ATTACK_HIGH', null))
})

test('isValidBattleAction only accepts the 4 real actions', () => {
  for (const a of BATTLE_ACTIONS) assert.equal(isValidBattleAction(a), true)
  assert.equal(isValidBattleAction('attack_high'), false) // case-sensitive, no normalization
  assert.equal(isValidBattleAction(''), false)
  assert.equal(isValidBattleAction(null), false)
  assert.equal(isValidBattleAction(undefined), false)
  assert.equal(isValidBattleAction(123), false)
})

test('rollEnemyAction always returns one of the 4 valid actions', () => {
  for (let i = 0; i < 200; i++) {
    assert.equal(isValidBattleAction(rollEnemyAction()), true)
  }
})

test('rollEnemyAction is not always the same action across many rolls', () => {
  const seen = new Set()
  for (let i = 0; i < 200; i++) seen.add(rollEnemyAction())
  // With 200 uniform-random draws from 4 options, seeing only 1 distinct value has probability
  // 4 * (1/4)^200 — astronomically unlikely unless the RNG is broken/hardcoded.
  assert.ok(seen.size > 1, `expected more than one distinct action across 200 rolls, got: ${[...seen]}`)
})

test('rollEnemyRewards: a 100% chance row always hits, a 0% row never does', () => {
  const rows = [
    { rewardType: 'CTOON', ctoonId: 'c1', dropChancePercent: 100, quantity: 1 },
    { rewardType: 'AVATAR', avatarId: 'a1', dropChancePercent: 0, quantity: 1 },
  ]
  for (let i = 0; i < 50; i++) {
    const hits = rollEnemyRewards(rows)
    assert.ok(hits.some(r => r.ctoonId === 'c1'))
    assert.ok(!hits.some(r => r.avatarId === 'a1'))
  }
})

test('rollEnemyRewards: rows are rolled independently, not as a normalized pool', () => {
  // Two rows both at 100% should BOTH hit on the same call — a normalized weighted pool would
  // only ever pick one.
  const rows = [
    { rewardType: 'CTOON', ctoonId: 'c1', dropChancePercent: 100, quantity: 1 },
    { rewardType: 'CTOON', ctoonId: 'c2', dropChancePercent: 100, quantity: 1 },
  ]
  const hits = rollEnemyRewards(rows)
  assert.equal(hits.length, 2)
})

test('rollEnemyRewards: handles empty/missing input without throwing', () => {
  assert.deepEqual(rollEnemyRewards([]), [])
  assert.deepEqual(rollEnemyRewards(null), [])
  assert.deepEqual(rollEnemyRewards(undefined), [])
})

test('rollEnemyRewards: a non-finite or negative chance never hits', () => {
  const rows = [
    { rewardType: 'CTOON', ctoonId: 'c1', dropChancePercent: NaN, quantity: 1 },
    { rewardType: 'CTOON', ctoonId: 'c2', dropChancePercent: -5, quantity: 1 },
  ]
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(rollEnemyRewards(rows), [])
  }
})

test('buildGrantableReward maps hit rows into grantRewardInTx\'s expected shape', () => {
  const hits = [
    { rewardType: 'BACKGROUND', backgroundId: 'bg1' },
    { rewardType: 'AVATAR', avatarId: 'av1' },
    { rewardType: 'CTOON', ctoonId: 'c1', quantity: 3, ctoon: { quantity: 100, name: 'Test cToon' } },
  ]
  const reward = buildGrantableReward(hits)
  assert.deepEqual(reward.backgrounds, [{ backgroundId: 'bg1' }])
  assert.deepEqual(reward.avatars, [{ avatarId: 'av1' }])
  assert.deepEqual(reward.ctoons, [{ ctoonId: 'c1', quantity: 3, ctoon: { quantity: 100, name: 'Test cToon' } }])
})

test('buildGrantableReward defaults a missing/invalid cToon quantity to 1', () => {
  const hits = [{ rewardType: 'CTOON', ctoonId: 'c1', quantity: 0 }]
  assert.equal(buildGrantableReward(hits).ctoons[0].quantity, 1)
  const hits2 = [{ rewardType: 'CTOON', ctoonId: 'c1', quantity: null }]
  assert.equal(buildGrantableReward(hits2).ctoons[0].quantity, 1)
})

test('buildGrantableReward ignores a row whose id field is missing for its declared type', () => {
  // e.g. a CTOON-type row with no ctoonId (shouldn't happen given API validation, but the
  // mapping itself must not silently grant a malformed entry either)
  const hits = [{ rewardType: 'CTOON', ctoonId: null, quantity: 1 }]
  assert.deepEqual(buildGrantableReward(hits), { backgrounds: [], avatars: [], ctoons: [] })
})

test('PLAYER_MAX_HP is the 5 hits specified by the feature', () => {
  assert.equal(PLAYER_MAX_HP, 5)
})
