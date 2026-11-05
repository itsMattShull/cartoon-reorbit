import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRaidBattleReport } from '../server/utils/cmoonRaidBattleReport.js'

function makeRaid(overrides = {}) {
  return {
    outcome: 'WIN',
    enemyName: 'Big Wig',
    enemyMaxHp: 175,
    enemyHpRemaining: 0,
    participants: [
      { userId: 'u1', username: 'Alice', hpRemaining: 5, maxHp: 10, knockedOut: false, isInitiator: true },
      { userId: 'u2', username: 'Bob', hpRemaining: 0, maxHp: 10, knockedOut: true, isInitiator: false },
    ],
    roundLog: [],
    ...overrides,
  }
}

test('sums damage dealt/taken per participant across rounds', () => {
  const raid = makeRaid({
    roundLog: [
      {
        round: 1, enemyAction: 'ATTACK_HIGH', enemyDamageDealt: 3,
        participants: [
          { userId: 'u1', action: 'ATTACK_HIGH', playerHit: true, enemyHit: true, playerBlocked: false, enemyBlocked: false, playerCrit: false, enemyCrit: false, enemyMissed: false, playerDamage: 1, enemyDamage: 2 },
          { userId: 'u2', action: 'BLOCK_HIGH', playerHit: false, enemyHit: false, playerBlocked: true, enemyBlocked: true, playerCrit: false, enemyCrit: false, enemyMissed: false, playerDamage: 0, enemyDamage: 0 },
        ],
      },
      {
        round: 2, enemyAction: 'ATTACK_LOW', enemyDamageDealt: 1,
        participants: [
          { userId: 'u1', action: 'ATTACK_LOW', playerHit: false, enemyHit: true, playerBlocked: false, enemyBlocked: false, playerCrit: false, enemyCrit: true, enemyMissed: false, playerDamage: 0, enemyDamage: 1 },
        ],
      },
    ],
  })
  const report = buildRaidBattleReport(raid)
  assert.equal(report.rounds, 2)
  const alice = report.leaderboard.find(r => r.userId === 'u1')
  const bob = report.leaderboard.find(r => r.userId === 'u2')
  assert.equal(alice.damageDealt, 3)
  assert.equal(alice.damageTaken, 1)
  assert.equal(alice.hitsLanded, 2)
  assert.equal(alice.critsDealt, 1)
  assert.equal(bob.hitsBlocked, 1)
  assert.equal(bob.damageDealt, 0)
  assert.equal(report.boss.damageDealt, 1) // total playerDamage across all rows
  assert.equal(report.boss.damageTaken, 3) // total enemyDamage across all rows
})

test('counts specials used per player and per side, regardless of miss/fizzle', () => {
  const raid = makeRaid({
    roundLog: [
      {
        round: 1, enemyAction: 'ATTACK_HIGH', enemyDamageDealt: 0,
        participants: [
          { userId: 'u1', action: 'SPECIAL_ACTION', playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: false, playerCrit: false, enemyCrit: false, enemyMissed: false, playerDamage: 0, enemyDamage: 0 },
        ],
        specials: [
          { side: 'PLAYER', userId: 'u1', name: 'Heal', effectType: 'HEAL_SELF', amount: 5, missed: true },
          { side: 'ENEMY', userId: null, name: 'Smash', effectType: 'DAMAGE_OPPONENT', amount: 3 },
        ],
      },
    ],
  })
  const report = buildRaidBattleReport(raid)
  const alice = report.leaderboard.find(r => r.userId === 'u1')
  assert.equal(alice.specialsUsed, 1)
  assert.equal(report.boss.specialsUsed, 1)
  assert.equal(report.playerSpecialsUsed, 1)
})

test('ranks the leaderboard by score (damage dealt + special/block bonus), descending', () => {
  const raid = makeRaid({
    participants: [
      { userId: 'u1', username: 'Alice', hpRemaining: 5, maxHp: 10, knockedOut: false, isInitiator: true },
      { userId: 'u2', username: 'Bob', hpRemaining: 10, maxHp: 10, knockedOut: false, isInitiator: false },
    ],
    roundLog: [
      {
        round: 1, enemyAction: 'ATTACK_HIGH', enemyDamageDealt: 10,
        participants: [
          { userId: 'u1', action: 'ATTACK_HIGH', playerHit: false, enemyHit: true, playerBlocked: false, enemyBlocked: false, playerCrit: false, enemyCrit: false, enemyMissed: false, playerDamage: 0, enemyDamage: 10 },
          { userId: 'u2', action: 'SPECIAL_ACTION', playerHit: false, enemyHit: false, playerBlocked: false, enemyBlocked: false, playerCrit: false, enemyCrit: false, enemyMissed: false, playerDamage: 0, enemyDamage: 0 },
        ],
        specials: [{ side: 'PLAYER', userId: 'u2', name: 'Blast', effectType: 'DAMAGE_OPPONENT', amount: 50 }],
      },
    ],
  })
  const report = buildRaidBattleReport(raid)
  // Bob's special bonus (15) still trails Alice's 10 raw damage only if his own damageDealt stays
  // 0 here (the special's own `amount` isn't auto-added as enemyDamage by this aggregator — the
  // boss's enemyHpRemaining delta already accounts for it elsewhere), so this just pins today's
  // known ordering rather than re-deriving special damage attribution.
  assert.equal(report.leaderboard[0].userId, 'u2')
  assert.equal(report.leaderboard[0].score, 15)
  assert.equal(report.leaderboard[1].userId, 'u1')
  assert.equal(report.leaderboard[1].score, 10)
})

test('legacy round rows missing playerDamage/enemyDamage are treated as zero, not NaN', () => {
  const raid = makeRaid({
    roundLog: [
      {
        round: 1, enemyAction: 'ATTACK_HIGH', enemyDamageDealt: 0,
        participants: [
          { userId: 'u1', action: 'ATTACK_HIGH', playerHit: true, enemyHit: true, playerBlocked: false, enemyBlocked: false, playerCrit: false, enemyCrit: false, enemyMissed: false },
        ],
      },
    ],
  })
  const report = buildRaidBattleReport(raid)
  const alice = report.leaderboard.find(r => r.userId === 'u1')
  assert.equal(alice.damageDealt, 0)
  assert.equal(alice.damageTaken, 0)
  assert.equal(Number.isNaN(alice.score), false)
})

test('handles an empty roundLog (e.g. a raid that resolved before the first round closed)', () => {
  const report = buildRaidBattleReport(makeRaid({ roundLog: [] }))
  assert.equal(report.rounds, 0)
  assert.equal(report.leaderboard.length, 2)
  for (const row of report.leaderboard) assert.equal(row.score, 0)
})
