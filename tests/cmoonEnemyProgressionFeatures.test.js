// tests/cmoonEnemyProgressionFeatures.test.js
// Unit tests for the new pure logic added for this PR's cMoon enemy follow-ups: enemy aggression
// bias (attackChancePercent), the solo reward pity system, and the validators backing the new
// admin-configurable fields. See server/utils/cmoonEnemyBattle.js and server/utils/cmoonEnemy.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rollEnemyAction, shouldForcePityReward, forcePickOneReward, isValidBattleAction, grantSummaryIsEmpty,
  serializeEnemyForClient,
} from '../server/utils/cmoonEnemyBattle.js'
import {
  isValidAttackChance, isValidPityThreshold, isValidFirstWinBonusPoints,
  ATTACK_CHANCE_MIN, ATTACK_CHANCE_MAX, PITY_THRESHOLD_MIN, PITY_THRESHOLD_MAX,
  FIRST_WIN_BONUS_POINTS_MIN, FIRST_WIN_BONUS_POINTS_MAX,
} from '../server/utils/cmoonEnemy.js'
import { resolveRaidRound } from '../server/utils/cmoonEnemyRaid.js'

const baseEnemyMember = { critChanceAgainstPercent: 0, critChanceFromPercent: 0, maxHp: 5 }

// ── rollEnemyAction's new attackChancePercent bias ──────────────────────────────────────────

test('rollEnemyAction: always returns one of the 4 valid actions regardless of bias', () => {
  for (const pct of [0, 1, 25, 50, 75, 99, 100]) {
    for (let i = 0; i < 50; i++) assert.equal(isValidBattleAction(rollEnemyAction(pct)), true)
  }
})

test('rollEnemyAction: default (no argument) reproduces the old uniform 50/50 attack-vs-block behavior', () => {
  let attacks = 0
  const trials = 500
  for (let i = 0; i < trials; i++) {
    if (rollEnemyAction().startsWith('ATTACK')) attacks++
  }
  // Loose statistical band, not an exact 50% — this only needs to catch a badly broken default,
  // not flake on ordinary binomial variance (500 trials, p=0.5, sd≈11.2).
  assert.ok(attacks > trials * 0.35 && attacks < trials * 0.65, `expected roughly half attacks, got ${attacks}/${trials}`)
})

test('rollEnemyAction: 0% attack chance never rolls an attack', () => {
  for (let i = 0; i < 200; i++) assert.ok(rollEnemyAction(0).startsWith('BLOCK'))
})

test('rollEnemyAction: 100% attack chance always rolls an attack', () => {
  for (let i = 0; i < 200; i++) assert.ok(rollEnemyAction(100).startsWith('ATTACK'))
})

test('rollEnemyAction: still splits roughly evenly between the HIGH/LOW lane regardless of bias', () => {
  const seen = new Set()
  for (let i = 0; i < 200; i++) seen.add(rollEnemyAction(100))
  assert.deepEqual(seen, new Set(['ATTACK_HIGH', 'ATTACK_LOW']))
})

test('rollEnemyAction: an out-of-range or non-finite value falls back to the 50% default rather than throwing', () => {
  for (const bad of [-50, 500, NaN, undefined, null, 'oops']) {
    assert.doesNotThrow(() => rollEnemyAction(bad))
    assert.equal(isValidBattleAction(rollEnemyAction(bad)), true)
  }
})

// ── Reward pity system (shouldForcePityReward / forcePickOneReward) ────────────────────────

test('shouldForcePityReward: disabled (threshold 0, the "0 disables" convention) never forces, regardless of streak', () => {
  assert.equal(shouldForcePityReward(0, 0), false)
  assert.equal(shouldForcePityReward(999, 0), false)
})

test('shouldForcePityReward: forces once the streak reaches the threshold, not before', () => {
  assert.equal(shouldForcePityReward(2, 3), false)
  assert.equal(shouldForcePityReward(3, 3), true)
  assert.equal(shouldForcePityReward(4, 3), true) // stays true past the threshold too
})

test('shouldForcePityReward: coerces non-numeric/missing threshold or streak rather than throwing', () => {
  assert.equal(shouldForcePityReward(undefined, 3), false)
  assert.equal(shouldForcePityReward(5, undefined), false) // undefined threshold -> 0 -> disabled
  assert.equal(shouldForcePityReward(null, null), false)
})

test('forcePickOneReward: returns null for an empty or missing reward table', () => {
  assert.equal(forcePickOneReward([]), null)
  assert.equal(forcePickOneReward(null), null)
  assert.equal(forcePickOneReward(undefined), null)
})

test('forcePickOneReward: always returns one of the exact rows passed in, ignoring dropChancePercent', () => {
  const rows = [
    { id: 'r1', dropChancePercent: 0 },
    { id: 'r2', dropChancePercent: 0 },
    { id: 'r3', dropChancePercent: 0 },
  ]
  for (let i = 0; i < 50; i++) {
    const picked = forcePickOneReward(rows)
    assert.ok(rows.includes(picked))
  }
})

test('forcePickOneReward: a single-row table always returns that row', () => {
  const row = { id: 'only', dropChancePercent: 0 }
  for (let i = 0; i < 20; i++) assert.equal(forcePickOneReward([row]), row)
})

// ── New validators backing the admin-configurable fields ───────────────────────────────────

test('isValidAttackChance accepts the full 0-100 inclusive range and rejects outside it', () => {
  assert.equal(isValidAttackChance(ATTACK_CHANCE_MIN), true)
  assert.equal(isValidAttackChance(ATTACK_CHANCE_MAX), true)
  assert.equal(isValidAttackChance(50), true)
  assert.equal(isValidAttackChance(ATTACK_CHANCE_MIN - 1), false)
  assert.equal(isValidAttackChance(ATTACK_CHANCE_MAX + 1), false)
  assert.equal(isValidAttackChance(50.5), false) // whole numbers only
  assert.equal(isValidAttackChance('50'), false) // no string coercion
  assert.equal(isValidAttackChance(undefined), false)
})

test('isValidPityThreshold accepts the full 0-50 inclusive range (0 = disabled) and rejects outside it', () => {
  assert.equal(isValidPityThreshold(PITY_THRESHOLD_MIN), true)
  assert.equal(isValidPityThreshold(PITY_THRESHOLD_MAX), true)
  assert.equal(isValidPityThreshold(PITY_THRESHOLD_MIN - 1), false)
  assert.equal(isValidPityThreshold(PITY_THRESHOLD_MAX + 1), false)
  assert.equal(isValidPityThreshold(null), false)
})

test('isValidFirstWinBonusPoints accepts the full 0-5000 inclusive range and rejects outside it', () => {
  assert.equal(isValidFirstWinBonusPoints(FIRST_WIN_BONUS_POINTS_MIN), true)
  assert.equal(isValidFirstWinBonusPoints(FIRST_WIN_BONUS_POINTS_MAX), true)
  assert.equal(isValidFirstWinBonusPoints(FIRST_WIN_BONUS_POINTS_MIN - 1), false)
  assert.equal(isValidFirstWinBonusPoints(FIRST_WIN_BONUS_POINTS_MAX + 1), false)
})

// ── Raid parity: resolveRaidRound's playerDamage/enemyDamage display fields ─────────────────

test('resolveRaidRound: each participant carries its own playerDamage/enemyDamage display fields matching the real HP deltas', () => {
  const participants = [{ userId: 'u1', action: 'ATTACK_HIGH', hpRemaining: 5, maxHp: 5 }]
  for (let i = 0; i < 50; i++) {
    const result = resolveRaidRound({ enemyAction: 'ATTACK_LOW', enemyMember: baseEnemyMember, participants })
    const [p] = result.perParticipant
    // enemyDamage is damage THIS PARTICIPANT dealt to the enemy; summed across the whole round
    // this must equal result.enemyDamageDealt for a single-participant raid.
    assert.equal(p.enemyDamage, result.enemyDamageDealt)
    if (!p.enemyHit) assert.equal(p.enemyDamage, 0)
    // playerDamage is damage the enemy dealt TO THIS PARTICIPANT, reflected in their own hpRemaining.
    if (p.playerHit) assert.equal(p.playerDamage, 5 - p.hpRemaining)
    else assert.equal(p.playerDamage, 0)
  }
})

test('resolveRaidRound: playerDamage/enemyDamage are always non-negative and never undefined', () => {
  const participants = [
    { userId: 'u1', action: 'ATTACK_HIGH', hpRemaining: 5, maxHp: 5 },
    { userId: 'u2', action: 'BLOCK_LOW', hpRemaining: 5, maxHp: 5 },
  ]
  const result = resolveRaidRound({ enemyAction: 'ATTACK_HIGH', enemyMember: baseEnemyMember, participants })
  for (const p of result.perParticipant) {
    assert.equal(typeof p.playerDamage, 'number')
    assert.equal(typeof p.enemyDamage, 'number')
    assert.ok(p.playerDamage >= 0)
    assert.ok(p.enemyDamage >= 0)
  }
})

// ── grantSummaryIsEmpty — the fix for reward pity silently resetting on an already-owned
// avatar/background hit (see action.post.js's resolveWin, which now keys pity off this rather
// than the raw hitRewards roll). ────────────────────────────────────────────────────────────────

test('grantSummaryIsEmpty: true for a fully zeroed summary (nothing rolled, or everything rolled was a dead end)', () => {
  assert.equal(grantSummaryIsEmpty({ points: 0, backgrounds: 0, avatars: 0, border: false, glow: false, ctoonJobs: [] }), true)
})

test('grantSummaryIsEmpty: false the moment any one field is non-empty', () => {
  const base = { points: 0, backgrounds: 0, avatars: 0, border: false, glow: false, ctoonJobs: [] }
  assert.equal(grantSummaryIsEmpty({ ...base, points: 50 }), false)
  assert.equal(grantSummaryIsEmpty({ ...base, backgrounds: 1 }), false)
  assert.equal(grantSummaryIsEmpty({ ...base, avatars: 1 }), false)
  assert.equal(grantSummaryIsEmpty({ ...base, ctoonJobs: [{ ctoonId: 'c1', quantity: 1, name: 'Test' }] }), false)
})

test('grantSummaryIsEmpty: a hit that grantRewardInTx deduped away to 0 new avatars/backgrounds still reads as empty', () => {
  // This is exactly grantRewardInTx's own ownership-dedup outcome for an already-owned
  // avatar/background: the roll "hit", but newAvatarIds/newBgIds ended up empty, so the summary
  // it returns is indistinguishable from rolling nothing at all — which is the whole point.
  assert.equal(grantSummaryIsEmpty({ points: 0, backgrounds: 0, avatars: 0, border: false, glow: false, ctoonJobs: [] }), true)
})

test('grantSummaryIsEmpty: tolerates a missing/undefined summary without throwing', () => {
  assert.equal(grantSummaryIsEmpty(undefined), true)
  assert.equal(grantSummaryIsEmpty({}), true)
})

// ── serializeEnemyForClient's new pityProgress field — see that function's own comment on why
// only a caller that explicitly passes a streak (consider.post.js's OFFER roll) gets anything
// back. ──────────────────────────────────────────────────────────────────────────────────────

const baseMember = {
  id: 'm1', name: 'Test Enemy', battleMode: 'PER_PLAYER', rank: 'GOON', isRaidBoss: false, maxHp: 5,
  critChanceAgainstPercent: 0, critChanceFromPercent: 0, pityThreshold: 0,
}

test('serializeEnemyForClient: pityProgress is null when pity is disabled for this member (0)', () => {
  const result = serializeEnemyForClient({ ...baseMember, pityThreshold: 0 }, 2)
  assert.equal(result.pityProgress, null)
})

test('serializeEnemyForClient: pityProgress is null when the caller omits a streak, even with pity enabled', () => {
  const result = serializeEnemyForClient({ ...baseMember, pityThreshold: 3 })
  assert.equal(result.pityProgress, null)
})

test('serializeEnemyForClient: pityProgress carries the real streak/threshold when both are present', () => {
  const result = serializeEnemyForClient({ ...baseMember, pityThreshold: 3 }, 2)
  assert.deepEqual(result.pityProgress, { emptyWinStreak: 2, threshold: 3 })
})

test('serializeEnemyForClient: a streak of exactly 0 is NOT treated as "no streak passed" (0 !== null)', () => {
  // A player with no empty-win history yet still has a genuine 0/threshold to show — this must
  // not collapse into the same "nothing to show" case an omitted/null streak hits.
  const result = serializeEnemyForClient({ ...baseMember, pityThreshold: 5 }, 0)
  assert.deepEqual(result.pityProgress, { emptyWinStreak: 0, threshold: 5 })
})
