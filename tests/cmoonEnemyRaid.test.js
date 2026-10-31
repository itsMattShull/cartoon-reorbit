import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRaidRound, checkRaidBossAvailability,
  JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_PARTY_SIZE,
  CAPTAIN_BOOST_HIT_STREAK_THRESHOLD, effectiveHitStreakThreshold,
} from '../server/utils/cmoonEnemyRaid.js'
import { SPECIAL_ACTION, PARALYZED_ACTION, HIT_STREAK_THRESHOLD, PLAYER_MAX_HP, NORMAL_HIT_DAMAGE, CRITICAL_HIT_DAMAGE, HEAL_ON_SUCCESSFUL_BLOCK } from '../server/utils/cmoonEnemyBattle.js'

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

// ── Special attacks in a raid (see cmoonEnemyRaid.js's own header comment) ─────────────────────
test('re-exports the solo battle\'s special-attack constants unchanged', () => {
  assert.equal(SPECIAL_ACTION, 'SPECIAL_ATTACK')
  assert.equal(PARALYZED_ACTION, 'PARALYZED')
  assert.equal(HIT_STREAK_THRESHOLD, 3)
})

// ── Captain boost effect (GlobalGameConfig.cMoonCaptainBoostEnabled) ────────────────────────────
test('effectiveHitStreakThreshold: only lowers the threshold when BOTH the toggle is on AND a captain is present', () => {
  assert.equal(CAPTAIN_BOOST_HIT_STREAK_THRESHOLD, 2)
  assert.equal(effectiveHitStreakThreshold(false, false), HIT_STREAK_THRESHOLD)
  assert.equal(effectiveHitStreakThreshold(false, true), HIT_STREAK_THRESHOLD)
  assert.equal(effectiveHitStreakThreshold(true, false), HIT_STREAK_THRESHOLD)
  assert.equal(effectiveHitStreakThreshold(true, true), CAPTAIN_BOOST_HIT_STREAK_THRESHOLD)
})

// ── Raid special-attack charge banking (closeRound in cmoonRaidSocket.js) ──────────────────────
// Regression test for a real "infinite special attacks" bug: closeRound's own banking math
// (`p.hitStreak = Math.max(0, p.hitStreak - hitStreakThreshold)`, done once per round, in the
// branch for whoever just fired) only ever discharges ONE threshold's worth per fire. Before this
// fix, the accumulate branch (`p.hitStreak = result.enemyHit ? p.hitStreak + 1 : 0`) never capped
// how high hitStreak could climb while a player simply held off firing — so an unbroken hit
// streak could bank arbitrarily many charges (hitStreak=30 at threshold=3 discharges to 27, still
// >= 3, so specialCharged stays true and the SAME charge can fire again next round, and again,
// ~9 more times from one streak). The fix caps accumulation at (2 * threshold - 1), so firing
// once always leaves a leftover strictly below threshold -- banking at most a partial head start
// toward the NEXT charge, never a second charge outright. These tests replicate closeRound's own
// two-branch formula exactly (mirroring this session's established pattern for testing logic
// embedded in that function, which isn't itself exported/unit-testable directly).
function replicateBankingRound({ hitStreak, specialCharged, threshold, fired, enemyHit }) {
  if (fired) {
    const newStreak = Math.max(0, hitStreak - threshold)
    return { hitStreak: newStreak, specialCharged: newStreak >= threshold }
  }
  const maxBankedStreak = threshold * 2 - 1
  const newStreak = enemyHit ? Math.min(hitStreak + 1, maxBankedStreak) : 0
  return { hitStreak: newStreak, specialCharged: specialCharged || newStreak >= threshold }
}

test('special-attack banking: firing at exactly the threshold discharges fully (3/3 -> 0/3, not charged)', () => {
  const result = replicateBankingRound({ hitStreak: 3, specialCharged: true, threshold: 3, fired: true })
  assert.deepEqual(result, { hitStreak: 0, specialCharged: false })
})

test('special-attack banking: firing with one extra landed hit banks that one hit, per the original "5/3 -> 2/3" design', () => {
  const result = replicateBankingRound({ hitStreak: 5, specialCharged: true, threshold: 3, fired: true })
  assert.deepEqual(result, { hitStreak: 2, specialCharged: false }) // 2 < 3 -- NOT immediately re-charged
})

test('special-attack banking: an unbroken hit streak is capped, never climbing past one hit short of a second charge', () => {
  let state = { hitStreak: 0, specialCharged: false }
  // 20 consecutive landed hits with no firing in between -- would reach hitStreak=20 uncapped.
  for (let i = 0; i < 20; i++) {
    state = replicateBankingRound({ ...state, threshold: 3, fired: false, enemyHit: true })
  }
  assert.equal(state.hitStreak, 5) // capped at 2*3 - 1 = 5, never 20
  assert.equal(state.specialCharged, true)
})

test('special-attack banking: firing from the capped streak always ends charged=false -- no free second fire', () => {
  // The exploit this regression guards against: before the fix, discharging from a long banked
  // streak could land ABOVE threshold again, letting the SAME banked streak fire for free on
  // several consecutive rounds with zero new hits landed in between.
  const state = replicateBankingRound({ hitStreak: 5, specialCharged: true, threshold: 3, fired: true }) // 5 = the cap
  assert.equal(state.specialCharged, false) // immediately dischargeable to false, not stuck >= threshold
  assert.equal(state.hitStreak < 3, true)
})

test('special-attack banking: the cap scales with a lowered captain-boost threshold too (2 -> max banked 3)', () => {
  let state = { hitStreak: 0, specialCharged: false }
  for (let i = 0; i < 10; i++) {
    state = replicateBankingRound({ ...state, threshold: 2, fired: false, enemyHit: true })
  }
  assert.equal(state.hitStreak, 3) // capped at 2*2 - 1 = 3, never 10
  state = replicateBankingRound({ ...state, threshold: 2, fired: true })
  assert.deepEqual(state, { hitStreak: 1, specialCharged: false }) // 1 < 2, not re-charged
})

test('resolveRaidRound: partyAtkBonus increases every participant\'s own landed-hit damage on the enemy', () => {
  let sawAHit = false
  for (let i = 0; i < 200; i++) {
    const participants = [{ userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }]
    const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants, partyAtkBonus: 6 })
    const [p] = result.perParticipant
    if (p.enemyHit) { sawAHit = true; assert.equal(result.enemyDamageDealt, NORMAL_HIT_DAMAGE + 6) }
  }
  assert.equal(sawAHit, true)
})

test('resolveRaidRound: enemyAtkBonus increases the damage the boss deals to every participant it hits, floored at 0', () => {
  // enemyAction is a fixed parameter here (never rolled internally, unlike the solo battle's own
  // resolveRound) — ATTACK_LOW against a BLOCK_HIGH (wrong-lane) participant always lands, no
  // trial loop needed to eventually see a hit. hpRemaining/maxHp are deliberately well above the
  // damage dealt so the floor-at-0 clamp in resolveRaidRound itself never masks the real number.
  const bigHp = PLAYER_MAX_HP + 100
  const participants = [{ userId: 'a', action: 'BLOCK_HIGH', hpRemaining: bigHp, maxHp: bigHp }]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: baseEnemyMember, participants, enemyAtkBonus: 5 })
  const [p] = result.perParticipant
  assert.equal(p.playerHit, true)
  assert.equal(bigHp - p.hpRemaining, NORMAL_HIT_DAMAGE + 5)

  // A heavy enough penalty floors the boss's dealt damage at 0 for every participant.
  const flooredResult = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: baseEnemyMember, participants, enemyAtkBonus: -999 })
  assert.equal(flooredResult.perParticipant[0].hpRemaining, bigHp)
})

test('resolveRaidRound: PARALYZED_ACTION as the enemyAction means the boss lands on nobody this round', () => {
  const participants = [
    { userId: 'a', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b', action: 'BLOCK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  const result = resolveRaidRound({ enemyAction: PARALYZED_ACTION, enemyMember: baseEnemyMember, participants })
  for (const p of result.perParticipant) assert.equal(p.playerHit, false)
})

test('resolveRaidRound: PARALYZED_ACTION as a participant\'s own action means they can never land a hit', () => {
  const participants = [{ userId: 'a', action: PARALYZED_ACTION, hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }]
  for (let i = 0; i < 100; i++) {
    const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants })
    assert.equal(result.perParticipant[0].enemyHit, false)
  }
})

test('resolveRaidRound: SPECIAL_ACTION as a participant\'s own action never lands a lane hit on the enemy', () => {
  const participants = [{ userId: 'a', action: SPECIAL_ACTION, hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }]
  for (let i = 0; i < 100; i++) {
    const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants })
    assert.equal(result.perParticipant[0].enemyHit, false)
    assert.equal(result.enemyDamageDealt, 0)
  }
})

test('resolveRaidRound: rejects an invalid participant action even with the new sentinels allowed', () => {
  assert.throws(() => resolveRaidRound({
    enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember,
    participants: [{ userId: 'a', action: 'NOT_REAL', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }],
  }))
})
