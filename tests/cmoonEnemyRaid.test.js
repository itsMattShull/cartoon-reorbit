import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRaidRound, checkRaidBossAvailability,
  JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_PARTY_SIZE,
} from '../server/utils/cmoonEnemyRaid.js'
import { PLAYER_MAX_HP, NORMAL_HIT_DAMAGE, CRITICAL_HIT_DAMAGE, HEAL_ON_SUCCESSFUL_BLOCK } from '../server/utils/cmoonEnemyBattle.js'

const baseEnemyMember = { critChanceAgainstPercent: 0, critChanceFromPercent: 0, maxHp: 20 }

test('constants: sane defaults for the join window, round timeout, and party size', () => {
  assert.equal(JOIN_WINDOW_SECONDS, 60)
  assert.equal(ROUND_TIMEOUT_SECONDS > 0, true)
  assert.equal(MAX_PARTY_SIZE, 4)
})

test('resolveRaidRound: every participant resolves against the SAME enemyAction', () => {
  const participants = [
    { userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'c', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
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
    { userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'c', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'd', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: baseEnemyMember, participants })
  assert.equal(result.perParticipant.every(p => p.enemyHit), true)
  assert.equal(result.enemyDamageDealt, 4 * NORMAL_HIT_DAMAGE)
})

test('resolveRaidRound: a 100% crit-against enemy makes every landed player hit deal CRITICAL_HIT_DAMAGE', () => {
  const critEnemy = { ...baseEnemyMember, critChanceAgainstPercent: 100 }
  const participants = [
    { userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: critEnemy, participants })
  assert.equal(result.enemyDamageDealt, 2 * CRITICAL_HIT_DAMAGE)
  for (const p of result.perParticipant) assert.equal(p.enemyCrit, true)
})

test('resolveRaidRound: a 100% crit-from enemy deals CRITICAL_HIT_DAMAGE to every hit participant independently', () => {
  const critEnemy = { ...baseEnemyMember, critChanceFromPercent: 100 }
  const participants = [
    { userId: 'a', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
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
  const participants = [{ userId: 'a', action: 'BLOCK_HIGH', hpRemaining: 1, maxHp: PLAYER_MAX_HP }]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: critEnemy, participants })
  const [p] = result.perParticipant
  assert.equal(p.hpRemaining, 0)
  assert.equal(p.knockedOut, true)
})

test('resolveRaidRound: a successful block heals 1 HP capped at PLAYER_MAX_HP, independent per participant', () => {
  const participants = [{ userId: 'a', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP - 1, maxHp: PLAYER_MAX_HP }]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants })
  const [p] = result.perParticipant
  assert.equal(p.playerBlocked, true)
  assert.equal(p.hpRemaining, PLAYER_MAX_HP)
  assert.equal(p.hpRemaining - (PLAYER_MAX_HP - 1), HEAL_ON_SUCCESSFUL_BLOCK)
})

test('resolveRaidRound: the heal-on-block cap follows each participant\'s OWN maxHp, not a shared constant', () => {
  // A raid party can genuinely have different max HPs per member (different cMoon ranks — see
  // getPlayerCombatMaxHp() in server/utils/cmoon.js), so this must never fall back to a single
  // shared PLAYER_MAX_HP for everyone.
  const boostedMaxHp = PLAYER_MAX_HP + 4
  const participants = [
    { userId: 'a', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP - 1, maxHp: PLAYER_MAX_HP },
    { userId: 'b', action: 'BLOCK_HIGH', hpRemaining: boostedMaxHp - 1, maxHp: boostedMaxHp },
  ]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants })
  const a = result.perParticipant.find(p => p.userId === 'a')
  const b = result.perParticipant.find(p => p.userId === 'b')
  assert.equal(a.hpRemaining, PLAYER_MAX_HP)
  assert.equal(b.hpRemaining, boostedMaxHp)
})

test('resolveRaidRound: rejects an invalid enemy action', () => {
  assert.throws(() => resolveRaidRound({ enemyAction: 'NOT_REAL', enemyMember: baseEnemyMember, participants: [] }))
})

test('resolveRaidRound: rejects an invalid participant action', () => {
  assert.throws(() => resolveRaidRound({
    enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember,
    participants: [{ userId: 'a', action: 'NOT_REAL', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }],
  }))
})

test('resolveRaidRound: an empty participant list resolves with zero damage and an empty result', () => {
  const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants: [] })
  assert.deepEqual(result.perParticipant, [])
  assert.equal(result.enemyDamageDealt, 0)
})

test('checkRaidBossAvailability: never defeated -> always available regardless of settings', () => {
  const result = checkRaidBossAvailability({ raidOneTime: true, raidCooldownMinutes: 999, raidDefeatedAt: null })
  assert.equal(result.available, true)
})

test('checkRaidBossAvailability: one-time boss stays unavailable forever after a defeat', () => {
  const result = checkRaidBossAvailability(
    { raidOneTime: true, raidCooldownMinutes: 0, raidDefeatedAt: new Date(0) },
    Date.now() + 1000 * 60 * 60 * 24 * 365, // a year later — still blocked, no auto-expiry
  )
  assert.equal(result.available, false)
  assert.match(result.message, /revived by an admin/i)
})

test('checkRaidBossAvailability: cooldown blocks until it elapses, then auto-clears with no admin action', () => {
  const defeatedAt = new Date('2026-01-01T00:00:00Z')
  const stillCoolingDown = checkRaidBossAvailability(
    { raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: defeatedAt },
    new Date('2026-01-01T00:30:00Z').getTime(),
  )
  assert.equal(stillCoolingDown.available, false)
  assert.equal(stillCoolingDown.availableAt.getTime(), new Date('2026-01-01T01:00:00Z').getTime())

  const afterCooldown = checkRaidBossAvailability(
    { raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: defeatedAt },
    new Date('2026-01-01T01:00:00Z').getTime(),
  )
  assert.equal(afterCooldown.available, true)
})

test('checkRaidBossAvailability: raidOneTime false and cooldown 0 ignores a leftover raidDefeatedAt entirely', () => {
  // An admin who previously set raidOneTime (or a cooldown) and later turned both back off must
  // not have the member stay stuck unavailable just because raidDefeatedAt is still set from
  // before — see raidOneTime's own schema comment.
  const result = checkRaidBossAvailability({ raidOneTime: false, raidCooldownMinutes: 0, raidDefeatedAt: new Date() })
  assert.equal(result.available, true)
})

test('checkRaidBossAvailability: raidOneTime takes precedence over a configured cooldown', () => {
  const result = checkRaidBossAvailability({ raidOneTime: true, raidCooldownMinutes: 5, raidDefeatedAt: new Date() })
  assert.equal(result.available, false)
  assert.match(result.message, /revived by an admin/i)
})

test('checkRaidBossAvailability: riddleGateSolved omitted (no gate) behaves exactly as before', () => {
  const result = checkRaidBossAvailability({ raidOneTime: false, raidCooldownMinutes: 0, raidDefeatedAt: null })
  assert.equal(result.available, true)
})

test('checkRaidBossAvailability: an unsolved riddle gate blocks even a never-defeated boss', () => {
  const result = checkRaidBossAvailability({ raidOneTime: false, raidCooldownMinutes: 0, raidDefeatedAt: null, riddleGateSolved: false })
  assert.equal(result.available, false)
  assert.match(result.message, /riddle/i)
})

test('checkRaidBossAvailability: a solved riddle gate falls through to the normal one-time/cooldown checks', () => {
  const result = checkRaidBossAvailability({ raidOneTime: true, raidCooldownMinutes: 0, raidDefeatedAt: new Date(), riddleGateSolved: true })
  assert.equal(result.available, false)
  assert.match(result.message, /revived by an admin/i)
})
