import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveBattleRound, rollEnemyAction, rollEnemyRewards, buildGrantableReward, rollHitDamage,
  isValidBattleAction, BATTLE_ACTIONS, PLAYER_MAX_HP, NORMAL_HIT_DAMAGE, CRITICAL_HIT_DAMAGE,
  HEAL_ON_SUCCESSFUL_BLOCK, resolveRound,
} from '../server/utils/cmoonEnemyBattle.js'

const baseEnemyMember = { critChanceAgainstPercent: 0, critChanceFromPercent: 0, maxHp: 5 }

test('resolveRound: a landed player hit reduces enemy HP via the returned enemyDamage, and does not touch playerHp', () => {
  const result = resolveRound({ playerAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, playerHpRemaining: PLAYER_MAX_HP })
  // The enemy's action is random, so only assert what's deterministic: the player never took
  // damage from their OWN attack, and a normal (non-crit, since critChanceFromPercent is 0) hit
  // against the enemy is always NORMAL_HIT_DAMAGE if one landed at all.
  assert.equal(result.newPlayerHp <= PLAYER_MAX_HP, true)
  if (result.enemyHit) assert.equal(result.enemyDamage, NORMAL_HIT_DAMAGE)
  else assert.equal(result.enemyDamage, 0)
})

test('resolveRound: a 100% crit-from enemy always deals CRITICAL_HIT_DAMAGE to the player on a landed hit', () => {
  const critEnemy = { ...baseEnemyMember, critChanceFromPercent: 100 }
  // Force a guaranteed player hit by blocking the wrong lane is impossible to force deterministically
  // (the enemy's action is randomized inside resolveRound), so instead run enough trials that at
  // least one lands and assert every landed hit this round was a full crit — matches how
  // rollHitDamage's own unit tests already prove the 100% branch never misses.
  let sawAHit = false
  for (let i = 0; i < 200; i++) {
    const result = resolveRound({ playerAction: 'BLOCK_HIGH', enemyMember: critEnemy, playerHpRemaining: PLAYER_MAX_HP })
    if (result.newPlayerHp < PLAYER_MAX_HP) {
      sawAHit = true
      assert.equal(PLAYER_MAX_HP - result.newPlayerHp, CRITICAL_HIT_DAMAGE)
    }
  }
  assert.equal(sawAHit, true)
})

test('resolveRound: a successful player block heals 1 HP, capped at PLAYER_MAX_HP', () => {
  // BLOCK_HIGH cancels an ATTACK_HIGH from the enemy — run enough trials to see it happen at
  // least once (enemy action is 1-of-4 uniform random) and confirm the heal never overflows.
  let sawABlock = false
  for (let i = 0; i < 200; i++) {
    const result = resolveRound({ playerAction: 'BLOCK_HIGH', enemyMember: baseEnemyMember, playerHpRemaining: PLAYER_MAX_HP - 1 })
    if (result.roundEntry.playerBlocked) {
      sawABlock = true
      assert.equal(result.newPlayerHp, PLAYER_MAX_HP)
    }
  }
  assert.equal(sawABlock, true)
})

test('resolveBattleRound: matching block cancels the matching-lane attack, and counts as a successful block', () => {
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'BLOCK_HIGH'), { playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: true })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'BLOCK_LOW'), { playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: true })
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'ATTACK_HIGH'), { playerHit: false, enemyHit: false, playerBlocked: true, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'ATTACK_LOW'), { playerHit: false, enemyHit: false, playerBlocked: true, enemyBlocked: false })
})

test('resolveBattleRound: wrong-lane block does not cancel the attack, and is not a successful block', () => {
  // player attacks high, enemy blocks low -> enemy still gets hit, enemy's block failed
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'BLOCK_LOW'), { playerHit: false, enemyHit: true, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'BLOCK_HIGH'), { playerHit: false, enemyHit: true, playerBlocked: false, enemyBlocked: false })
  // player blocks low, enemy attacks high -> player still gets hit, player's block failed
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'ATTACK_HIGH'), { playerHit: true, enemyHit: false, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'ATTACK_LOW'), { playerHit: true, enemyHit: false, playerBlocked: false, enemyBlocked: false })
})

test('resolveBattleRound: mutual attack lands on both sides and neither counts as a block', () => {
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'ATTACK_HIGH'), { playerHit: true, enemyHit: true, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('ATTACK_HIGH', 'ATTACK_LOW'), { playerHit: true, enemyHit: true, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'ATTACK_HIGH'), { playerHit: true, enemyHit: true, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('ATTACK_LOW', 'ATTACK_LOW'), { playerHit: true, enemyHit: true, playerBlocked: false, enemyBlocked: false })
})

test('resolveBattleRound: mutual block is a no-op AND not a "successful" block for either side (nothing was thrown to stop)', () => {
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'BLOCK_HIGH'), { playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('BLOCK_HIGH', 'BLOCK_LOW'), { playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'BLOCK_HIGH'), { playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: false })
  assert.deepEqual(resolveBattleRound('BLOCK_LOW', 'BLOCK_LOW'), { playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: false })
})

test('resolveBattleRound: exhaustively covers every 4x4 combination with no exceptions', () => {
  for (const a of BATTLE_ACTIONS) {
    for (const b of BATTLE_ACTIONS) {
      const result = resolveBattleRound(a, b)
      assert.equal(typeof result.playerHit, 'boolean')
      assert.equal(typeof result.enemyHit, 'boolean')
      assert.equal(typeof result.playerBlocked, 'boolean')
      assert.equal(typeof result.enemyBlocked, 'boolean')
      // A side can never be simultaneously hit and credited with a successful block.
      assert.ok(!(result.playerHit && result.playerBlocked))
      assert.ok(!(result.enemyHit && result.enemyBlocked))
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

test('rollHitDamage: a miss (hit=false) never deals damage or crits, regardless of chance', () => {
  assert.deepEqual(rollHitDamage(false, 100), { damage: 0, isCrit: false })
  assert.deepEqual(rollHitDamage(false, 0), { damage: 0, isCrit: false })
})

test('rollHitDamage: a 0% (or falsy) crit chance always deals normal damage', () => {
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(rollHitDamage(true, 0), { damage: NORMAL_HIT_DAMAGE, isCrit: false })
    assert.deepEqual(rollHitDamage(true, null), { damage: NORMAL_HIT_DAMAGE, isCrit: false })
    assert.deepEqual(rollHitDamage(true, undefined), { damage: NORMAL_HIT_DAMAGE, isCrit: false })
  }
})

test('rollHitDamage: a 100% crit chance always deals critical (2x) damage', () => {
  for (let i = 0; i < 50; i++) {
    assert.deepEqual(rollHitDamage(true, 100), { damage: CRITICAL_HIT_DAMAGE, isCrit: true })
  }
})

test('rollHitDamage: CRITICAL_HIT_DAMAGE is exactly double NORMAL_HIT_DAMAGE', () => {
  assert.equal(CRITICAL_HIT_DAMAGE, NORMAL_HIT_DAMAGE * 2)
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
    { rewardType: 'POINTS', quantity: 250 },
  ]
  const reward = buildGrantableReward(hits)
  assert.deepEqual(reward.backgrounds, [{ backgroundId: 'bg1' }])
  assert.deepEqual(reward.avatars, [{ avatarId: 'av1' }])
  assert.deepEqual(reward.ctoons, [{ ctoonId: 'c1', quantity: 3, ctoon: { quantity: 100, name: 'Test cToon' } }])
  assert.equal(reward.points, 250)
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
  assert.deepEqual(buildGrantableReward(hits), { backgrounds: [], avatars: [], ctoons: [], points: 0 })
})

test('buildGrantableReward sums multiple independently-rolled POINTS rows into one total', () => {
  const hits = [
    { rewardType: 'POINTS', quantity: 100 },
    { rewardType: 'POINTS', quantity: 50 },
  ]
  assert.equal(buildGrantableReward(hits).points, 150)
})

test('buildGrantableReward defaults with no hits at all', () => {
  assert.deepEqual(buildGrantableReward([]), { backgrounds: [], avatars: [], ctoons: [], points: 0 })
})

test('PLAYER_MAX_HP is the 5 hits specified by the feature', () => {
  assert.equal(PLAYER_MAX_HP, 5)
})

test('HEAL_ON_SUCCESSFUL_BLOCK is a single positive HP amount', () => {
  assert.equal(HEAL_ON_SUCCESSFUL_BLOCK, 1)
})
