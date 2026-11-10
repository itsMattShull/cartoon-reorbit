import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRaidRound, checkRaidBossAvailability, nextRaidBossSlotAt,
  JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_PARTY_SIZE,
  effectiveHitStreakThreshold, applyRaidSpecialAttack,
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

test('resolveRaidRound: a custom enemyMember.baseDamage sets the enemy\'s landed-hit damage against every participant (crit deals double it), never affecting a participant\'s own damage against the enemy', () => {
  const heavyEnemy = { ...baseEnemyMember, baseDamage: 40, critChanceFromPercent: 100 }
  const bigHp = 1000
  const participants = [
    { userId: 'a', action: 'BLOCK_HIGH', hpRemaining: bigHp, maxHp: bigHp },
    { userId: 'b', action: 'ATTACK_HIGH', hpRemaining: bigHp, maxHp: bigHp },
  ]
  // The enemy attacks LOW, so BLOCK_HIGH does not cancel it — both participants take the hit.
  const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: heavyEnemy, participants })
  for (const p of result.perParticipant) {
    assert.equal(p.playerHit, true)
    assert.equal(bigHp - p.hpRemaining, 80) // crit: 40 * 2
  }
  // Participant 'b' attacked HIGH against an enemy attacking LOW — their own attack lands on the
  // enemy, and that damage is unaffected by the enemy's own baseDamage.
  const b = result.perParticipant.find(p => p.userId === 'b')
  assert.equal(b.enemyHit, true)
  assert.equal(b.enemyDamage, NORMAL_HIT_DAMAGE)
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

// ── nextRaidBossSlotAt (the /api/onboarding/events.get.js raid-boss countdown's own combining
// logic — never calls checkRaidBossAvailability's real-time Date.now() default so every case here
// is deterministic) ──────────────────────────────────────────────────────────────────────────
test('nextRaidBossSlotAt: no raid bosses at all -> noneAvailable', () => {
  const result = nextRaidBossSlotAt({ bosses: [], personalSoloWinCount: 0 }, Date.now())
  assert.deepEqual(result, { noneAvailable: true, availableNow: false, nextAvailableAt: null })
})

test('nextRaidBossSlotAt: a never-defeated boss and no popup cooldown -> available now', () => {
  const bosses = [{ id: 'a', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: null }]
  const result = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0 }, Date.now())
  assert.equal(result.availableNow, true)
  assert.equal(result.nextAvailableAt, null)
})

test('nextRaidBossSlotAt: boss off cooldown but the shared popup cooldown is still active -> waits on the popup cooldown', () => {
  const bosses = [{ id: 'a', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: null }]
  const popupNextAvailableAt = new Date('2026-01-01T02:00:00Z')
  const result = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0, popupNextAvailableAt }, new Date('2026-01-01T00:00:00Z').getTime())
  assert.equal(result.availableNow, false)
  assert.equal(result.nextAvailableAt.getTime(), popupNextAvailableAt.getTime())
})

test('nextRaidBossSlotAt: boss still on its own cooldown with no popup cooldown -> waits on the boss', () => {
  const defeatedAt = new Date('2026-01-01T00:00:00Z')
  const bosses = [{ id: 'a', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: defeatedAt }]
  const result = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0 }, new Date('2026-01-01T00:30:00Z').getTime())
  assert.equal(result.availableNow, false)
  assert.equal(result.nextAvailableAt.getTime(), new Date('2026-01-01T01:00:00Z').getTime())
})

test('nextRaidBossSlotAt: both gates active -> the LATER of the two wins, whichever that is', () => {
  const defeatedAt = new Date('2026-01-01T00:00:00Z')
  const bosses = [{ id: 'a', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: defeatedAt }]
  const now = new Date('2026-01-01T00:30:00Z').getTime()
  // Boss clears at 01:00; popup clears at 00:45 — boss is later, so boss wins.
  const bossLater = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0, popupNextAvailableAt: new Date('2026-01-01T00:45:00Z') }, now)
  assert.equal(bossLater.nextAvailableAt.getTime(), new Date('2026-01-01T01:00:00Z').getTime())
  // Boss clears at 01:00; popup clears at 02:00 — popup is later, so popup wins.
  const popupLater = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0, popupNextAvailableAt: new Date('2026-01-01T02:00:00Z') }, now)
  assert.equal(popupLater.nextAvailableAt.getTime(), new Date('2026-01-01T02:00:00Z').getTime())
})

test('nextRaidBossSlotAt: a candidate whose minPriorDefeats this player has not met is never counted', () => {
  const bosses = [{ id: 'a', minPriorDefeats: 10, raidOneTime: false, raidCooldownMinutes: 0, raidDefeatedAt: null }]
  const result = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0 }, Date.now())
  assert.deepEqual(result, { noneAvailable: true, availableNow: false, nextAvailableAt: null })
})

test('nextRaidBossSlotAt: a one-time boss already defeated contributes nothing (permanently locked, not a future slot)', () => {
  const bosses = [{ id: 'a', minPriorDefeats: 0, raidOneTime: true, raidCooldownMinutes: 0, raidDefeatedAt: new Date() }]
  const result = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0 }, Date.now())
  assert.deepEqual(result, { noneAvailable: true, availableNow: false, nextAvailableAt: null })
})

test('nextRaidBossSlotAt: a riddle-locked boss contributes nothing until solved', () => {
  const bosses = [{ id: 'a', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 0, raidDefeatedAt: null }]
  const locked = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0, riddleSolvedByEnemyId: new Map([['a', false]]) }, Date.now())
  assert.deepEqual(locked, { noneAvailable: true, availableNow: false, nextAvailableAt: null })
  // A boss missing from the map defaults to solved/unlocked, same as consider.post.js's `?? true`.
  const unmapped = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0, riddleSolvedByEnemyId: new Map() }, Date.now())
  assert.equal(unmapped.availableNow, true)
})

test('nextRaidBossSlotAt: one permanently-locked boss plus one still-cooling-down boss -> the cooling-down one is the real answer, not noneAvailable', () => {
  const bosses = [
    { id: 'locked', minPriorDefeats: 0, raidOneTime: true, raidCooldownMinutes: 0, raidDefeatedAt: new Date('2020-01-01T00:00:00Z') },
    { id: 'cooling', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: new Date('2026-01-01T00:00:00Z') },
  ]
  const result = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0 }, new Date('2026-01-01T00:30:00Z').getTime())
  assert.equal(result.noneAvailable, false)
  assert.equal(result.nextAvailableAt.getTime(), new Date('2026-01-01T01:00:00Z').getTime())
})

test('nextRaidBossSlotAt: any eligible candidate already available short-circuits the earliest-cooldown search', () => {
  const bosses = [
    { id: 'cooling', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 60, raidDefeatedAt: new Date() },
    { id: 'free', minPriorDefeats: 0, raidOneTime: false, raidCooldownMinutes: 0, raidDefeatedAt: null },
  ]
  const result = nextRaidBossSlotAt({ bosses, personalSoloWinCount: 0 }, Date.now())
  assert.equal(result.availableNow, true)
  assert.equal(result.nextAvailableAt, null)
})

// ── Special attacks in a raid (see cmoonEnemyRaid.js's own header comment) ─────────────────────
test('re-exports the solo battle\'s special-attack constants unchanged', () => {
  assert.equal(SPECIAL_ACTION, 'SPECIAL_ATTACK')
  assert.equal(PARALYZED_ACTION, 'PARALYZED')
  assert.equal(HIT_STREAK_THRESHOLD, 3)
})

// ── Captain boost effect (GlobalGameConfig.cMoonCaptainBoostEnabled) ────────────────────────────
// Signature is now (baseThreshold, captainBoostEnabled, anyCaptainPresent) — baseThreshold is each
// attack's own requiredHitStreak (1-10, default 3) rather than a single hardcoded constant, so a
// captain's presence lowers WHATEVER threshold was passed in by 1 (floored at 1), not to a fixed 2.
test('effectiveHitStreakThreshold: only lowers the threshold when BOTH the toggle is on AND a captain is present', () => {
  assert.equal(effectiveHitStreakThreshold(HIT_STREAK_THRESHOLD, false, false), HIT_STREAK_THRESHOLD)
  assert.equal(effectiveHitStreakThreshold(HIT_STREAK_THRESHOLD, false, true), HIT_STREAK_THRESHOLD)
  assert.equal(effectiveHitStreakThreshold(HIT_STREAK_THRESHOLD, true, false), HIT_STREAK_THRESHOLD)
  assert.equal(effectiveHitStreakThreshold(HIT_STREAK_THRESHOLD, true, true), HIT_STREAK_THRESHOLD - 1)
})

test('effectiveHitStreakThreshold: applies to any attack-specific base, floored at 1', () => {
  assert.equal(effectiveHitStreakThreshold(4, true, true), 3)
  assert.equal(effectiveHitStreakThreshold(1, true, true), 1) // floored, never 0
  assert.equal(effectiveHitStreakThreshold(1, false, false), 1)
  // Missing/invalid base falls back to the plain HIT_STREAK_THRESHOLD constant.
  assert.equal(effectiveHitStreakThreshold(undefined, false, false), HIT_STREAK_THRESHOLD)
})

// ── Map effect: CMoonEnemyMap.specialThresholdReduction (4th param, additive with captain) ─────
test('effectiveHitStreakThreshold: a map reduction applies even with no captain boost at all', () => {
  assert.equal(effectiveHitStreakThreshold(4, false, false, 1), 3)
  assert.equal(effectiveHitStreakThreshold(4, false, false, 0), 4)
})

test('effectiveHitStreakThreshold: a map reduction stacks additively with an active captain boost', () => {
  assert.equal(effectiveHitStreakThreshold(5, true, true, 1), 3) // -1 captain, -1 map
  assert.equal(effectiveHitStreakThreshold(5, true, false, 1), 4) // captain inactive this round, -1 map only
})

test('effectiveHitStreakThreshold: the combined reduction is still floored at 1, never 0 or negative', () => {
  assert.equal(effectiveHitStreakThreshold(2, true, true, 5), 1)
  assert.equal(effectiveHitStreakThreshold(1, false, false, 10), 1)
})

test('effectiveHitStreakThreshold: an omitted map reduction defaults to 0 (no behavior change)', () => {
  assert.equal(effectiveHitStreakThreshold(4, true, true), effectiveHitStreakThreshold(4, true, true, 0))
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

// ── SHIELD_PARTY (resolveRaidRound's own partyShielded param) ──────────────────────────────────
test('resolveRaidRound: partyShielded negates incoming HP loss even when the boss lands a hit', () => {
  const participants = [{ userId: 'a', action: 'BLOCK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }]
  let sawAHit = false
  for (let i = 0; i < 50; i++) {
    const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants, partyShielded: true })
    const [p] = result.perParticipant
    if (p.playerHit) { sawAHit = true; assert.equal(p.hpRemaining, PLAYER_MAX_HP) }
  }
  assert.equal(sawAHit, true)
})

// ── enemyMember.attackAccuracyPercent (see that column's own schema comment) ───────────────────
test('resolveRaidRound: attackAccuracyPercent 0 means the boss\'s attack always misses a participant it would otherwise hit', () => {
  const participants = [{ userId: 'a', action: 'BLOCK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }] // wrong lane -- would land
  for (let i = 0; i < 20; i++) {
    const result = resolveRaidRound({
      enemyAction: 'ATTACK_HIGH', enemyMember: { ...baseEnemyMember, attackAccuracyPercent: 0 }, participants,
    })
    const [p] = result.perParticipant
    assert.equal(p.playerHit, false)
    assert.equal(p.enemyMissed, true)
    assert.equal(p.hpRemaining, PLAYER_MAX_HP)
  }
})

test('resolveRaidRound: attackAccuracyPercent is rolled INDEPENDENTLY per participant (not one shared outcome for the round)', () => {
  const participants = [
    { userId: 'a', action: 'BLOCK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b', action: 'BLOCK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'c', action: 'BLOCK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  let sawMixedOutcomeInOneRound = false
  for (let i = 0; i < 200 && !sawMixedOutcomeInOneRound; i++) {
    const result = resolveRaidRound({
      enemyAction: 'ATTACK_HIGH', enemyMember: { ...baseEnemyMember, attackAccuracyPercent: 50 }, participants,
    })
    const missedCount = result.perParticipant.filter(p => p.enemyMissed).length
    if (missedCount > 0 && missedCount < result.perParticipant.length) sawMixedOutcomeInOneRound = true
  }
  assert.equal(sawMixedOutcomeInOneRound, true)
})

test('resolveRaidRound: a participant\'s own correct block still stops the attack regardless of accuracy', () => {
  const participants = [{ userId: 'a', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP }]
  for (let i = 0; i < 20; i++) {
    const result = resolveRaidRound({
      enemyAction: 'ATTACK_HIGH', enemyMember: { ...baseEnemyMember, attackAccuracyPercent: 0 }, participants,
    })
    const [p] = result.perParticipant
    assert.equal(p.playerBlocked, true)
    assert.equal(p.enemyMissed, false)
  }
})

// ── New raid-only tactical effects (applyRaidSpecialAttack in cmoonEnemyRaid.js) ────────────────
// Minimal raid/alive fixtures — only the fields each effect branch actually touches.
function makeRaid(overrides = {}) {
  return {
    enemyHpRemaining: 50, enemyStats: { maxHp: 50 },
    enemyParalyzedTurns: 0, partyParalyzedTurns: 0,
    enemyPoisonAmount: 0, enemyPoisonTurnsRemaining: 0,
    participants: new Map(),
    ...overrides,
  }
}
function makeParticipant(userId, overrides = {}) {
  return { userId, hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, knockedOutAt: null, poisonAmount: 0, poisonTurnsRemaining: 0, ...overrides }
}
const baseAttack = { name: 'Test Attack', amount: 10, accuracyPercent: 100, soundPath: null }

test('applyRaidSpecialAttack: accuracyPercent 0 always misses and changes no state', () => {
  const raid = makeRaid()
  const events = []
  applyRaidSpecialAttack(raid, [], { ...baseAttack, effectType: 'DAMAGE_OPPONENT', accuracyPercent: 0 }, { side: 'PLAYER', userId: 'a' }, events, {})
  assert.equal(events.length, 1)
  assert.equal(events[0].missed, true)
  assert.equal(raid.enemyHpRemaining, 50) // untouched
})

test('applyRaidSpecialAttack: accuracyPercent 100 always lands', () => {
  for (let i = 0; i < 20; i++) {
    const raid = makeRaid()
    const events = []
    applyRaidSpecialAttack(raid, [], { ...baseAttack, effectType: 'DAMAGE_OPPONENT' }, { side: 'PLAYER', userId: 'a' }, events, {})
    assert.equal(events[0].missed, undefined)
    assert.equal(raid.enemyHpRemaining, 40)
  }
})

test('applyRaidSpecialAttack: POISON_OPPONENT player-cast sets the boss\'s shared poison state, refreshing (not stacking) on re-cast', () => {
  const raid = makeRaid()
  const attack = { ...baseAttack, effectType: 'POISON_OPPONENT', amount: 7, poisonDurationRounds: 3 }
  applyRaidSpecialAttack(raid, [], attack, { side: 'PLAYER', userId: 'a' }, [], {})
  assert.deepEqual([raid.enemyPoisonAmount, raid.enemyPoisonTurnsRemaining], [7, 3])
  // Re-cast with different numbers replaces, never adds.
  applyRaidSpecialAttack(raid, [], { ...attack, amount: 2, poisonDurationRounds: 1 }, { side: 'PLAYER', userId: 'a' }, [], {})
  assert.deepEqual([raid.enemyPoisonAmount, raid.enemyPoisonTurnsRemaining], [2, 1])
})

test('applyRaidSpecialAttack: POISON_OPPONENT boss-cast afflicts every alive participant individually', () => {
  const raid = makeRaid()
  const a = makeParticipant('a'); const b = makeParticipant('b')
  raid.participants.set('a', a); raid.participants.set('b', b)
  const attack = { ...baseAttack, effectType: 'POISON_OPPONENT', amount: 5, poisonDurationRounds: 4 }
  applyRaidSpecialAttack(raid, [a, b], attack, { side: 'ENEMY' }, [], {})
  assert.deepEqual([a.poisonAmount, a.poisonTurnsRemaining], [5, 4])
  assert.deepEqual([b.poisonAmount, b.poisonTurnsRemaining], [5, 4])
})

test('applyRaidSpecialAttack: POISON_OPPONENT boss-cast is fully negated (never applied) by partyShielded', () => {
  const raid = makeRaid()
  const a = makeParticipant('a')
  raid.participants.set('a', a)
  const attack = { ...baseAttack, effectType: 'POISON_OPPONENT', amount: 5, poisonDurationRounds: 4 }
  const events = []
  applyRaidSpecialAttack(raid, [a], attack, { side: 'ENEMY' }, events, { partyShielded: true })
  assert.deepEqual([a.poisonAmount, a.poisonTurnsRemaining], [0, 0])
  assert.equal(events[0].fizzled, true)
})

test('applyRaidSpecialAttack: SHIELD_PARTY player-cast only announces — no raid/participant state change', () => {
  const raid = makeRaid()
  const before = JSON.stringify(raid, (k, v) => (v instanceof Map ? Array.from(v.entries()) : v))
  const events = []
  applyRaidSpecialAttack(raid, [], { ...baseAttack, effectType: 'SHIELD_PARTY' }, { side: 'PLAYER', userId: 'a' }, events, {})
  const after = JSON.stringify(raid, (k, v) => (v instanceof Map ? Array.from(v.entries()) : v))
  assert.equal(events.length, 1)
  assert.equal(events[0].missed, undefined)
  assert.equal(before, after) // the real effect is read back out of specialEvents by closeRound, not applied here
})

test('applyRaidSpecialAttack: CLEANSE_SELF player-cast clears party paralysis (always) and the caster\'s own poison (self-only, healsAllies false)', () => {
  const raid = makeRaid({ partyParalyzedTurns: 3 })
  const caster = makeParticipant('a', { poisonAmount: 9, poisonTurnsRemaining: 2 })
  const ally = makeParticipant('b', { poisonAmount: 9, poisonTurnsRemaining: 2 })
  raid.participants.set('a', caster); raid.participants.set('b', ally)
  const attack = { ...baseAttack, effectType: 'CLEANSE_SELF', healsAllies: false, cleanseAlsoHeals: false }
  applyRaidSpecialAttack(raid, [caster, ally], attack, { side: 'PLAYER', userId: 'a' }, [], {})
  assert.equal(raid.partyParalyzedTurns, 0) // whole party, unconditional
  assert.deepEqual([caster.poisonAmount, caster.poisonTurnsRemaining], [0, 0]) // self cured
  assert.deepEqual([ally.poisonAmount, ally.poisonTurnsRemaining], [9, 2]) // ally untouched -- healsAllies off
})

test('applyRaidSpecialAttack: CLEANSE_SELF player-cast with healsAllies cures poison party-wide and applies cleanseAlsoHeals', () => {
  const raid = makeRaid({ partyParalyzedTurns: 1 })
  const caster = makeParticipant('a', { hpRemaining: 50, maxHp: 100, poisonAmount: 9, poisonTurnsRemaining: 2 })
  const ally = makeParticipant('b', { hpRemaining: 50, maxHp: 100, poisonAmount: 9, poisonTurnsRemaining: 2 })
  raid.participants.set('a', caster); raid.participants.set('b', ally)
  const attack = { ...baseAttack, effectType: 'CLEANSE_SELF', amount: 15, healsAllies: true, cleanseAlsoHeals: true }
  applyRaidSpecialAttack(raid, [caster, ally], attack, { side: 'PLAYER', userId: 'a' }, [], {})
  assert.deepEqual([caster.poisonAmount, caster.poisonTurnsRemaining], [0, 0])
  assert.deepEqual([ally.poisonAmount, ally.poisonTurnsRemaining], [0, 0])
  assert.equal(caster.hpRemaining, 65)
  assert.equal(ally.hpRemaining, 65)
})

test('applyRaidSpecialAttack: CLEANSE_SELF boss-cast cures the boss\'s own paralyze and shared poison', () => {
  const raid = makeRaid({ enemyParalyzedTurns: 2, enemyPoisonAmount: 8, enemyPoisonTurnsRemaining: 3, enemyHpRemaining: 20 })
  const attack = { ...baseAttack, effectType: 'CLEANSE_SELF', amount: 5, cleanseAlsoHeals: true }
  applyRaidSpecialAttack(raid, [], attack, { side: 'ENEMY' }, [], {})
  assert.equal(raid.enemyParalyzedTurns, 0)
  assert.equal(raid.enemyPoisonAmount, 0)
  assert.equal(raid.enemyPoisonTurnsRemaining, 0)
  assert.equal(raid.enemyHpRemaining, 25)
})
