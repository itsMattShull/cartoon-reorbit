import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRaidRound, JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_PARTY_SIZE } from '../server/utils/cmoonEnemyRaid.js'
import { PLAYER_MAX_HP, NORMAL_HIT_DAMAGE, CRITICAL_HIT_DAMAGE, HEAL_ON_SUCCESSFUL_BLOCK } from '../server/utils/cmoonEnemyBattle.js'

const baseEnemyMember = { critChanceAgainstPercent: 0, critChanceFromPercent: 0, maxHp: 20 }

test('constants: sane defaults for the join window, round timeout, and party size', () => {
  assert.equal(JOIN_WINDOW_SECONDS, 60)
  assert.equal(ROUND_TIMEOUT_SECONDS > 0, true)
  assert.equal(MAX_PARTY_SIZE, 4)
})

test('resolveRaidRound: every participant resolves against the SAME enemyAction', () => {
  const participants = [
    { userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP },
    { userId: 'b', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP },
    { userId: 'c', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP },
  ]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants })
  assert.equal(result.perParticipant.length, 3)
  for (const p of result.perParticipant) {
    assert.equal(p.enemyAction, 'ATTACK_HIGH')
  }
  // b blocked the exact lane the enemy attacked — a genuinely successful block, so they heal
  // rather than take damage (already at PLAYER_MAX_HP, so it just stays capped).
  const b = result.perParticipant.find(p => p.userId === 'b')
  assert.equal(b.playerBlocked, true)
  assert.equal(b.playerHit, false)
  assert.equal(b.hpRemaining, PLAYER_MAX_HP)
})

test('resolveRaidRound: enemyDamageDealt is the SUM of every participant landing a hit, not just one', () => {
  // Force every participant's attack to land: the enemy's action is ATTACK_LOW (an attack, not a
  // block), so attackLands(playerAction=ATTACK_HIGH, enemyAction=ATTACK_LOW) is always true
  // regardless of lane, since the enemy never blocks anything this round.
  const participants = [
    { userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP },
    { userId: 'b', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP },
    { userId: 'c', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP },
    { userId: 'd', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP },
  ]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: baseEnemyMember, participants })
  assert.equal(result.perParticipant.every(p => p.enemyHit), true)
  assert.equal(result.enemyDamageDealt, 4 * NORMAL_HIT_DAMAGE)
})

test('resolveRaidRound: a 100% crit-against enemy makes every landed player hit deal CRITICAL_HIT_DAMAGE', () => {
  const critEnemy = { ...baseEnemyMember, critChanceAgainstPercent: 100 }
  const participants = [
    { userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP },
    { userId: 'b', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP },
  ]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: critEnemy, participants })
  assert.equal(result.enemyDamageDealt, 2 * CRITICAL_HIT_DAMAGE)
  for (const p of result.perParticipant) assert.equal(p.enemyCrit, true)
})

test('resolveRaidRound: a 100% crit-from enemy deals CRITICAL_HIT_DAMAGE to every hit participant independently', () => {
  const critEnemy = { ...baseEnemyMember, critChanceFromPercent: 100 }
  const participants = [
    { userId: 'a', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP },
    { userId: 'b', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP },
  ]
  // The enemy attacks LOW, so BLOCK_HIGH does not cancel it — both participants take the hit.
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: critEnemy, participants })
  for (const p of result.perParticipant) {
    assert.equal(p.playerHit, true)
    assert.equal(PLAYER_MAX_HP - p.hpRemaining, CRITICAL_HIT_DAMAGE)
  }
})

test('resolveRaidRound: a knocked-out participant this round is flagged and floored at 0 HP', () => {
  const critEnemy = { ...baseEnemyMember, critChanceFromPercent: 100 }
  const participants = [{ userId: 'a', action: 'BLOCK_HIGH', hpRemaining: 1 }]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: critEnemy, participants })
  const [p] = result.perParticipant
  assert.equal(p.hpRemaining, 0)
  assert.equal(p.knockedOut, true)
})

test('resolveRaidRound: a successful block heals 1 HP capped at PLAYER_MAX_HP, independent per participant', () => {
  const participants = [{ userId: 'a', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP - 1 }]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants })
  const [p] = result.perParticipant
  assert.equal(p.playerBlocked, true)
  assert.equal(p.hpRemaining, PLAYER_MAX_HP)
  assert.equal(p.hpRemaining - (PLAYER_MAX_HP - 1), HEAL_ON_SUCCESSFUL_BLOCK)
})

test('resolveRaidRound: rejects an invalid enemy action', () => {
  assert.throws(() => resolveRaidRound({ enemyAction: 'NOT_REAL', enemyMember: baseEnemyMember, participants: [] }))
})

test('resolveRaidRound: rejects an invalid participant action', () => {
  assert.throws(() => resolveRaidRound({
    enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember,
    participants: [{ userId: 'a', action: 'NOT_REAL', hpRemaining: PLAYER_MAX_HP }],
  }))
})

test('resolveRaidRound: an empty participant list resolves with zero damage and an empty result', () => {
  const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants: [] })
  assert.deepEqual(result.perParticipant, [])
  assert.equal(result.enemyDamageDealt, 0)
})
