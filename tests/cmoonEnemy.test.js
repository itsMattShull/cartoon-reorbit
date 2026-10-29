import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMemberBody, parseRewardBody, isValidCritChance, isValidPointsAmount, isValidRank, isValidMinPriorDefeats,
  CRIT_CHANCE_MIN, CRIT_CHANCE_MAX, POINTS_REWARD_MIN, POINTS_REWARD_MAX, ENEMY_RANKS, RANK_DEFAULT,
  MIN_PRIOR_DEFEATS_MIN, MIN_PRIOR_DEFEATS_MAX, MIN_PRIOR_DEFEATS_DEFAULT,
  isValidOccurrencePercent, OCCURRENCE_PERCENT_MIN, OCCURRENCE_PERCENT_MAX, OCCURRENCE_PERCENT_DEFAULT,
  filterToHighestRank, pickWeightedEnemy, filterCappedNonRaidCandidates, countRecentSoloStarts, nextSoloSlotAt, resolveMemberSoundPaths,
  MEMBER_SOUND_SLOTS, FACTION_DEFAULT_SOUND_SLOTS,
  parseSpecialAttackBody, isValidSpecialAttackName, isValidSpecialAttackEffectType, isValidSpecialAttackAmount,
  SPECIAL_ATTACK_EFFECT_TYPES, SPECIAL_ATTACK_NAME_MAX_LENGTH, SPECIAL_ATTACK_AMOUNT_MIN, SPECIAL_ATTACK_AMOUNT_MAX,
  parseTauntBody, isValidTauntText, isValidTauntTrigger, TAUNT_TRIGGERS, TAUNT_TEXT_MAX_LENGTH,
  ATTACK_CHANCE_DEFAULT, PITY_THRESHOLD_DEFAULT, FIRST_WIN_BONUS_POINTS_DEFAULT,
  MAX_PARTICIPANTS_DEFAULT, MAX_PARTICIPANTS_MIN, MAX_PARTICIPANTS_MAX,
  RAID_ROUND_LIMIT_DEFAULT, RAID_ROUND_LIMIT_MIN, RAID_ROUND_LIMIT_MAX,
  parseWindUpMoveBody, WIND_UP_OCCURRENCE_PERCENT_DEFAULT, WIND_UP_DIRECTIONS, WIND_UP_BONUS_TYPES,
} from '../server/utils/cmoonEnemy.js'

const baseMemberBody = {
  factionId: 'f1', name: 'Test Enemy', battleMode: 'PER_PLAYER', maxHp: 5, cMoonPointsReward: 10, minPriorDefeats: 0,
  occurrencePercent: OCCURRENCE_PERCENT_DEFAULT,
  isRaidBoss: false, raidAnnouncementText: null, raidOneTime: false, raidCooldownMinutes: 0,
  attackChancePercent: ATTACK_CHANCE_DEFAULT, pityThreshold: PITY_THRESHOLD_DEFAULT, firstWinBonusPoints: FIRST_WIN_BONUS_POINTS_DEFAULT,
  maxParticipants: MAX_PARTICIPANTS_DEFAULT, raidRoundLimit: RAID_ROUND_LIMIT_DEFAULT, windUpEnabled: false,
}

test('isValidRank accepts every declared rank and rejects anything else', () => {
  for (const r of ENEMY_RANKS) assert.equal(isValidRank(r), true)
  assert.equal(isValidRank('BOSS'), false)
  assert.equal(isValidRank(''), false)
  assert.equal(isValidRank(undefined), false)
  assert.equal(isValidRank('goon'), false) // case-sensitive, matches the enum's own casing
})

test('parseMemberBody: rank defaults to GOON on create when omitted', () => {
  const result = parseMemberBody(baseMemberBody, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.rank, RANK_DEFAULT)
})

test('parseMemberBody: accepts an explicit rank', () => {
  const result = parseMemberBody({ ...baseMemberBody, rank: 'UNDERBOSS' }, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.rank, 'UNDERBOSS')
})

test('parseMemberBody: rejects an invalid rank', () => {
  assert.equal(parseMemberBody({ ...baseMemberBody, rank: 'BOSS' }, undefined).ok, false)
})

test('parseMemberBody: an update with no rank field in the body keeps the existing rank', () => {
  const existing = { ...baseMemberBody, rank: 'FINAL_BOSS', active: true, sortOrder: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0 }
  const result = parseMemberBody({ name: 'Renamed' }, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.rank, 'FINAL_BOSS')
})

test('parseMemberBody: rejects a rank change once the member has battle history', () => {
  const existing = { ...baseMemberBody, rank: 'GOON', active: true, sortOrder: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0, hasBattles: true }
  const result = parseMemberBody({ rank: 'FINAL_BOSS' }, existing)
  assert.equal(result.ok, false)
  assert.match(result.message, /rank cannot change/i)
})

test('parseMemberBody: allows a rank change on a member with no battle history yet', () => {
  const existing = { ...baseMemberBody, rank: 'GOON', active: true, sortOrder: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0, hasBattles: false }
  const result = parseMemberBody({ rank: 'FINAL_BOSS' }, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.rank, 'FINAL_BOSS')
})

test('parseMemberBody: re-saving the SAME rank is allowed even with battle history', () => {
  const existing = { ...baseMemberBody, rank: 'UNDERBOSS', active: true, sortOrder: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0, hasBattles: true }
  const result = parseMemberBody({ rank: 'UNDERBOSS', name: 'Renamed' }, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.rank, 'UNDERBOSS')
})

test('isValidMinPriorDefeats accepts the full range and rejects outside it', () => {
  assert.equal(isValidMinPriorDefeats(MIN_PRIOR_DEFEATS_MIN), true)
  assert.equal(isValidMinPriorDefeats(MIN_PRIOR_DEFEATS_MAX), true)
  assert.equal(isValidMinPriorDefeats(5), true)
  assert.equal(isValidMinPriorDefeats(-1), false)
  assert.equal(isValidMinPriorDefeats(MIN_PRIOR_DEFEATS_MAX + 1), false)
  assert.equal(isValidMinPriorDefeats(2.5), false)
  assert.equal(isValidMinPriorDefeats(NaN), false)
})

test('parseMemberBody: minPriorDefeats defaults to 0 on create when omitted', () => {
  const result = parseMemberBody(baseMemberBody, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.minPriorDefeats, MIN_PRIOR_DEFEATS_DEFAULT)
})

test('parseMemberBody: accepts an explicit minPriorDefeats', () => {
  const result = parseMemberBody({ ...baseMemberBody, minPriorDefeats: 25 }, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.minPriorDefeats, 25)
})

test('parseMemberBody: rejects an out-of-range minPriorDefeats', () => {
  assert.equal(parseMemberBody({ ...baseMemberBody, minPriorDefeats: -1 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, minPriorDefeats: 100001 }, undefined).ok, false)
})

test('parseMemberBody: minPriorDefeats can change freely even with battle history (no lock, unlike rank/battleMode)', () => {
  const existing = { ...baseMemberBody, rank: 'GOON', minPriorDefeats: 3, active: true, sortOrder: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0, hasBattles: true }
  const result = parseMemberBody({ minPriorDefeats: 50 }, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.minPriorDefeats, 50)
})

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
  const existing = { ...baseMemberBody, rank: 'GOON', active: true, sortOrder: 0, critChanceAgainstPercent: 40, critChanceFromPercent: 15, hasBattles: false }
  const result = parseMemberBody({}, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.critChanceAgainstPercent, 40)
  assert.equal(result.data.critChanceFromPercent, 15)
})

test('parseMemberBody: raidOneTime and raidCooldownMinutes default to false/0 on create when omitted', () => {
  const result = parseMemberBody({ ...baseMemberBody, rank: 'FINAL_BOSS', isRaidBoss: true }, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.raidOneTime, false)
  assert.equal(result.data.raidCooldownMinutes, 0)
})

test('parseMemberBody: accepts an explicit raidOneTime and raidCooldownMinutes', () => {
  const result = parseMemberBody(
    { ...baseMemberBody, rank: 'FINAL_BOSS', isRaidBoss: true, raidOneTime: true, raidCooldownMinutes: 1440 },
    undefined,
  )
  assert.equal(result.ok, true)
  assert.equal(result.data.raidOneTime, true)
  assert.equal(result.data.raidCooldownMinutes, 1440)
})

test('parseMemberBody: rejects an out-of-range raidCooldownMinutes', () => {
  assert.equal(parseMemberBody({ ...baseMemberBody, rank: 'FINAL_BOSS', isRaidBoss: true, raidCooldownMinutes: -1 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, rank: 'FINAL_BOSS', isRaidBoss: true, raidCooldownMinutes: 43201 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, rank: 'FINAL_BOSS', isRaidBoss: true, raidCooldownMinutes: 1.5 }, undefined).ok, false)
})

test('parseMemberBody: rejects a non-boolean raidOneTime', () => {
  const result = parseMemberBody({ ...baseMemberBody, rank: 'FINAL_BOSS', isRaidBoss: true, raidOneTime: 'yes' }, undefined)
  assert.equal(result.ok, false)
})

test('parseMemberBody: an update with no raid fields in the body keeps the existing raidOneTime/raidCooldownMinutes', () => {
  const existing = {
    ...baseMemberBody, rank: 'FINAL_BOSS', isRaidBoss: true, active: true, sortOrder: 0,
    critChanceAgainstPercent: 0, critChanceFromPercent: 0, hasBattles: false,
    raidOneTime: true, raidCooldownMinutes: 720,
  }
  const result = parseMemberBody({}, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.raidOneTime, true)
  assert.equal(result.data.raidCooldownMinutes, 720)
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

// ── occurrencePercent ────────────────────────────────────────────────────

test('isValidOccurrencePercent accepts the full range and rejects outside it', () => {
  assert.equal(isValidOccurrencePercent(OCCURRENCE_PERCENT_MIN), true)
  assert.equal(isValidOccurrencePercent(OCCURRENCE_PERCENT_MAX), true)
  assert.equal(isValidOccurrencePercent(OCCURRENCE_PERCENT_MIN - 1), false)
  assert.equal(isValidOccurrencePercent(OCCURRENCE_PERCENT_MAX + 1), false)
  assert.equal(isValidOccurrencePercent(0), false) // 0 would zero out a candidate's own chance entirely
  assert.equal(isValidOccurrencePercent(50.5), false)
  assert.equal(isValidOccurrencePercent('50'), false)
})

test('parseMemberBody: occurrencePercent defaults to OCCURRENCE_PERCENT_DEFAULT on create when omitted', () => {
  const result = parseMemberBody(baseMemberBody, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.occurrencePercent, OCCURRENCE_PERCENT_DEFAULT)
})

test('parseMemberBody: accepts an explicit occurrencePercent', () => {
  const result = parseMemberBody({ ...baseMemberBody, occurrencePercent: 90 }, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.occurrencePercent, 90)
})

test('parseMemberBody: rejects an out-of-range occurrencePercent', () => {
  assert.equal(parseMemberBody({ ...baseMemberBody, occurrencePercent: 0 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, occurrencePercent: 101 }, undefined).ok, false)
})

test('parseMemberBody: an update with no occurrencePercent field in the body keeps the existing value', () => {
  const existing = {
    ...baseMemberBody, id: 'm1', rank: 'GOON', active: true, sortOrder: 0,
    critChanceAgainstPercent: 0, critChanceFromPercent: 0, occurrencePercent: 15, hasBattles: false,
  }
  const result = parseMemberBody({}, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.occurrencePercent, 15)
})

// ── filterToHighestRank ──────────────────────────────────────────────────

test('filterToHighestRank: off (false) returns the list unchanged', () => {
  const candidates = [{ rank: 'GOON' }, { rank: 'FINAL_BOSS' }]
  assert.deepEqual(filterToHighestRank(candidates, false), candidates)
})

test('filterToHighestRank: on narrows to only the highest rank actually present', () => {
  const goon = { id: 1, rank: 'GOON' }
  const underboss = { id: 2, rank: 'UNDERBOSS' }
  const enforcer = { id: 3, rank: 'ENFORCER' }
  const result = filterToHighestRank([goon, underboss, enforcer], true)
  assert.deepEqual(result, [underboss])
})

test('filterToHighestRank: on with every candidate at the same rank keeps them all', () => {
  const a = { id: 1, rank: 'GOON' }
  const b = { id: 2, rank: 'GOON' }
  assert.deepEqual(filterToHighestRank([a, b], true), [a, b])
})

test('filterToHighestRank: an empty list is returned unchanged either way', () => {
  assert.deepEqual(filterToHighestRank([], true), [])
  assert.deepEqual(filterToHighestRank([], false), [])
})

// ── pickWeightedEnemy ────────────────────────────────────────────────────

test('pickWeightedEnemy: returns null for an empty list', () => {
  assert.equal(pickWeightedEnemy([]), null)
})

test('pickWeightedEnemy: a single candidate is always picked regardless of its weight', () => {
  const only = { id: 1, occurrencePercent: 1 }
  for (let i = 0; i < 5; i++) assert.equal(pickWeightedEnemy([only]), only)
})

test('pickWeightedEnemy: a 0-weight roll picks the first candidate, a near-total roll picks the last', () => {
  const low = { id: 'low', occurrencePercent: 10 }
  const high = { id: 'high', occurrencePercent: 90 }
  const realRandom = Math.random
  try {
    Math.random = () => 0 // roll = 0 * 100 = 0 -> falls in low's [0, 10) slice
    assert.equal(pickWeightedEnemy([low, high]), low)
    Math.random = () => 0.999999 // roll ~= 99.9999 -> falls in high's [10, 100) slice
    assert.equal(pickWeightedEnemy([low, high]), high)
  } finally {
    Math.random = realRandom
  }
})

test('pickWeightedEnemy: a missing or invalid weight is clamped to the minimum, never treated as 0', () => {
  const broken = { id: 'broken', occurrencePercent: undefined }
  const realRandom = Math.random
  try {
    Math.random = () => 0 // the only candidate, should still be reachable despite the bad weight
    assert.equal(pickWeightedEnemy([broken]), broken)
  } finally {
    Math.random = realRandom
  }
})

test('pickWeightedEnemy: heavily favors a much higher weight over many rolls (statistical sanity check)', () => {
  const low = { id: 'low', occurrencePercent: 1 }
  const high = { id: 'high', occurrencePercent: 99 }
  let highCount = 0
  const trials = 2000
  for (let i = 0; i < trials; i++) {
    if (pickWeightedEnemy([low, high]) === high) highCount++
  }
  // Expected ~99%; a wide tolerance band keeps this non-flaky while still catching a broken roll
  // (e.g. a regression back to uniform random, which would land this near 50%).
  assert.ok(highCount > trials * 0.9, `expected 'high' to win the vast majority of rolls, got ${highCount}/${trials}`)
})

// ── filterCappedNonRaidCandidates ─────────────────────────────────────────

test('filterCappedNonRaidCandidates: cap of 0 (disabled) returns the list unchanged regardless of recent count', () => {
  const candidates = [{ id: 'a', isRaidBoss: false }, { id: 'b', isRaidBoss: true }]
  assert.deepEqual(filterCappedNonRaidCandidates(candidates, 999, 0), candidates)
})

test('filterCappedNonRaidCandidates: a negative cap is treated the same as 0 (disabled)', () => {
  const candidates = [{ id: 'a', isRaidBoss: false }]
  assert.deepEqual(filterCappedNonRaidCandidates(candidates, 999, -1), candidates)
})

test('filterCappedNonRaidCandidates: under the cap returns the list unchanged', () => {
  const candidates = [{ id: 'a', isRaidBoss: false }, { id: 'b', isRaidBoss: true }]
  assert.deepEqual(filterCappedNonRaidCandidates(candidates, 3, 4), candidates)
})

test('filterCappedNonRaidCandidates: at or above the cap narrows to raid bosses only', () => {
  const nonRaid = { id: 'a', isRaidBoss: false }
  const raid = { id: 'b', isRaidBoss: true }
  assert.deepEqual(filterCappedNonRaidCandidates([nonRaid, raid], 4, 4), [raid])
  assert.deepEqual(filterCappedNonRaidCandidates([nonRaid, raid], 5, 4), [raid])
})

test('filterCappedNonRaidCandidates: capped out with no raid boss candidates empties the list', () => {
  const nonRaid = { id: 'a', isRaidBoss: false }
  assert.deepEqual(filterCappedNonRaidCandidates([nonRaid], 4, 4), [])
})

// ── resolveMemberSoundPaths ──────────────────────────────────────────────

test('resolveMemberSoundPaths: MEMBER_SOUND_SLOTS and FACTION_DEFAULT_SOUND_SLOTS stay index-aligned', () => {
  assert.equal(MEMBER_SOUND_SLOTS.length, FACTION_DEFAULT_SOUND_SLOTS.length)
})

test("resolveMemberSoundPaths: a member's own sound always wins over the faction default", () => {
  const member = { appearSoundPath: '/member-appear.mp3' }
  const faction = { defaultAppearSoundPath: '/faction-appear.mp3' }
  assert.equal(resolveMemberSoundPaths(member, faction).appearSoundPath, '/member-appear.mp3')
})

test('resolveMemberSoundPaths: falls back to the faction default when the member has none', () => {
  const member = { appearSoundPath: null }
  const faction = { defaultAppearSoundPath: '/faction-appear.mp3' }
  assert.equal(resolveMemberSoundPaths(member, faction).appearSoundPath, '/faction-appear.mp3')
})

test('resolveMemberSoundPaths: null when neither the member nor its faction has one', () => {
  const member = { appearSoundPath: null }
  assert.equal(resolveMemberSoundPaths(member, null).appearSoundPath, null)
  assert.equal(resolveMemberSoundPaths(member, undefined).appearSoundPath, null)
})

test('resolveMemberSoundPaths: resolves all six slots independently', () => {
  const member = { appearSoundPath: 'm-appear', damageTakenSoundPath: null, victorySoundPath: null }
  const faction = { defaultDamageTakenSoundPath: 'f-damage-taken', defaultVictorySoundPath: 'f-victory' }
  const resolved = resolveMemberSoundPaths(member, faction)
  assert.equal(resolved.appearSoundPath, 'm-appear')
  assert.equal(resolved.damageTakenSoundPath, 'f-damage-taken')
  assert.equal(resolved.damageAvoidedSoundPath, null)
  assert.equal(resolved.attackingSoundPath, null)
  assert.equal(resolved.victorySoundPath, 'f-victory')
  assert.equal(resolved.defeatSoundPath, null)
})

// ── Special attacks (CMoonSpecialAttack) ────────────────────────────────────────────────────
const baseSpecialAttackBody = { name: 'Toxic Bite', description: null, effectType: 'DAMAGE_OPPONENT', amount: 10 }

test('isValidSpecialAttackName: non-empty up to the max length, rejects blank/too-long/non-string', () => {
  assert.equal(isValidSpecialAttackName('Toxic Bite'), true)
  assert.equal(isValidSpecialAttackName('x'.repeat(SPECIAL_ATTACK_NAME_MAX_LENGTH)), true)
  assert.equal(isValidSpecialAttackName('x'.repeat(SPECIAL_ATTACK_NAME_MAX_LENGTH + 1)), false)
  assert.equal(isValidSpecialAttackName(''), false)
  assert.equal(isValidSpecialAttackName('   '), false)
  assert.equal(isValidSpecialAttackName(null), false)
  assert.equal(isValidSpecialAttackName(123), false)
})

test('isValidSpecialAttackEffectType accepts every declared type and rejects anything else', () => {
  for (const t of SPECIAL_ATTACK_EFFECT_TYPES) assert.equal(isValidSpecialAttackEffectType(t), true)
  assert.equal(isValidSpecialAttackEffectType('DAMAGE_SELF'), false)
  assert.equal(isValidSpecialAttackEffectType(''), false)
  assert.equal(isValidSpecialAttackEffectType(null), false)
})

test('isValidSpecialAttackAmount: whole numbers within [MIN, MAX], rejects out-of-range/fractional/non-numeric', () => {
  assert.equal(isValidSpecialAttackAmount(SPECIAL_ATTACK_AMOUNT_MIN), true)
  assert.equal(isValidSpecialAttackAmount(SPECIAL_ATTACK_AMOUNT_MAX), true)
  assert.equal(isValidSpecialAttackAmount(SPECIAL_ATTACK_AMOUNT_MIN - 1), false)
  assert.equal(isValidSpecialAttackAmount(SPECIAL_ATTACK_AMOUNT_MAX + 1), false)
  assert.equal(isValidSpecialAttackAmount(5.5), false)
  assert.equal(isValidSpecialAttackAmount(NaN), false)
  assert.equal(isValidSpecialAttackAmount(undefined), false)
})

test('parseSpecialAttackBody: a valid create body parses with trimmed name and the given fields', () => {
  const result = parseSpecialAttackBody({ ...baseSpecialAttackBody, name: '  Toxic Bite  ' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { name: 'Toxic Bite', description: null, effectType: 'DAMAGE_OPPONENT', amount: 10, healsAllies: false, playerChoice: false })
})

test('parseSpecialAttackBody: rejects a missing/blank name', () => {
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, name: '' }).ok, false)
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, name: undefined }).ok, false)
})

test('parseSpecialAttackBody: rejects an invalid effectType or amount', () => {
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, effectType: 'NOT_REAL' }).ok, false)
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, amount: 0 }).ok, false)
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, amount: 1000 }).ok, false)
})

test('parseSpecialAttackBody: a blank/null description normalizes to null, a real one is trimmed', () => {
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, description: '' }).data.description, null)
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, description: null }).data.description, null)
  assert.equal(parseSpecialAttackBody({ ...baseSpecialAttackBody, description: '  A nasty bite.  ' }).data.description, 'A nasty bite.')
})

test('parseSpecialAttackBody: on update, an omitted field falls back to the existing row, not a bare default', () => {
  const existing = { name: 'Old Name', description: 'Old desc', effectType: 'HEAL_SELF', amount: 7, healsAllies: true, playerChoice: true }
  const result = parseSpecialAttackBody({ amount: 20 }, existing)
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { name: 'Old Name', description: 'Old desc', effectType: 'HEAL_SELF', amount: 20, healsAllies: true, playerChoice: true })
})

test('parseSpecialAttackBody: healsAllies is only ever stored true when effectType is HEAL_SELF', () => {
  // A truthy healsAllies sent alongside any other effectType is silently normalized to false —
  // see that field's own schema comment on why this is never trusted to the client/admin UI alone.
  const result = parseSpecialAttackBody({ ...baseSpecialAttackBody, effectType: 'DAMAGE_OPPONENT', healsAllies: true })
  assert.equal(result.ok, true)
  assert.equal(result.data.healsAllies, false)

  const healResult = parseSpecialAttackBody({ ...baseSpecialAttackBody, effectType: 'HEAL_SELF', healsAllies: true })
  assert.equal(healResult.ok, true)
  assert.equal(healResult.data.healsAllies, true)
})

test('parseSpecialAttackBody: an omitted healsAllies defaults to false on create', () => {
  const result = parseSpecialAttackBody({ ...baseSpecialAttackBody, effectType: 'HEAL_SELF' })
  assert.equal(result.ok, true)
  assert.equal(result.data.healsAllies, false)
})

// ── Enemy taunts (CMoonEnemyTaunt) ──────────────────────────────────────────────────────────
test('isValidTauntText accepts non-blank text within the length cap, rejects blank/overlong/non-string', () => {
  assert.equal(isValidTauntText('You call that a punch?'), true)
  assert.equal(isValidTauntText(''), false)
  assert.equal(isValidTauntText('   '), false)
  assert.equal(isValidTauntText('x'.repeat(TAUNT_TEXT_MAX_LENGTH)), true)
  assert.equal(isValidTauntText('x'.repeat(TAUNT_TEXT_MAX_LENGTH + 1)), false)
  assert.equal(isValidTauntText(undefined), false)
  assert.equal(isValidTauntText(42), false)
})

test('isValidTauntTrigger only accepts APPEAR/CRIT', () => {
  assert.equal(isValidTauntTrigger('APPEAR'), true)
  assert.equal(isValidTauntTrigger('CRIT'), true)
  assert.equal(isValidTauntTrigger('WIN'), false)
  assert.equal(isValidTauntTrigger(undefined), false)
  assert.deepEqual(TAUNT_TRIGGERS, ['APPEAR', 'CRIT'])
})

test('parseTauntBody: a valid create body parses with trimmed text and the given trigger', () => {
  const result = parseTauntBody({ trigger: 'APPEAR', text: '  Fresh meat!  ' }, undefined)
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { trigger: 'APPEAR', text: 'Fresh meat!', active: true, sortOrder: 0 })
})

test('parseTauntBody: rejects a missing/blank text or an invalid trigger on create', () => {
  assert.equal(parseTauntBody({ trigger: 'APPEAR', text: '' }, undefined).ok, false)
  assert.equal(parseTauntBody({ trigger: 'APPEAR', text: undefined }, undefined).ok, false)
  assert.equal(parseTauntBody({ trigger: 'NOT_REAL', text: 'Hi' }, undefined).ok, false)
  assert.equal(parseTauntBody({ text: 'Hi' }, undefined).ok, false)
})

test('parseTauntBody: on update, trigger is locked to the existing row even if the body sends a different one', () => {
  const existing = { trigger: 'APPEAR', text: 'Old line', active: true, sortOrder: 0 }
  const result = parseTauntBody({ trigger: 'CRIT', text: 'New line' }, existing)
  assert.equal(result.ok, true)
  // trigger is NOT part of the returned data on update at all — see parseTauntBody's own comment
  // on why only text/active/sortOrder are ever written back.
  assert.deepEqual(result.data, { text: 'New line', active: true, sortOrder: 0 })
})

test('parseTauntBody: on update, an omitted field falls back to the existing row, not a bare default', () => {
  const existing = { trigger: 'CRIT', text: 'Old line', active: false, sortOrder: 5 }
  const result = parseTauntBody({}, existing)
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, { text: 'Old line', active: false, sortOrder: 5 })
})

test('parseTauntBody: rejects a non-boolean active and an out-of-range sortOrder', () => {
  assert.equal(parseTauntBody({ trigger: 'APPEAR', text: 'Hi', active: 'yes' }, undefined).ok, false)
  assert.equal(parseTauntBody({ trigger: 'APPEAR', text: 'Hi', sortOrder: 99999 }, undefined).ok, false)
})

// ── countRecentSoloStarts ─────────────────────────────────────────────────

function fakeDb() {
  const calls = []
  return { calls, cMoonEnemyBattle: { count: async (args) => { calls.push(args); return 7 } } }
}

test('countRecentSoloStarts: counts only this player\'s non-raid battles started inside the window', async () => {
  const db = fakeDb()
  const before = Date.now()
  assert.equal(await countRecentSoloStarts(db, 'u1', 12), 7)
  const { where } = db.calls[0]
  assert.equal(where.userId, 'u1')
  assert.equal(where.raidId, null)
  const expected = before - 12 * 60 * 60 * 1000
  assert.ok(Math.abs(where.startedAt.gte.getTime() - expected) < 1000)
})

test('countRecentSoloStarts: a missing or invalid window falls back to 4 hours', async () => {
  const db = fakeDb()
  const before = Date.now()
  await countRecentSoloStarts(db, 'u1', 0)
  assert.ok(Math.abs(db.calls[0].where.startedAt.gte.getTime() - (before - 4 * 60 * 60 * 1000)) < 1000)
})

// ── nextSoloSlotAt ────────────────────────────────────────────────────────

test('nextSoloSlotAt: null when the cap is off or the player is under it', () => {
  const t = [new Date('2026-10-26T10:00:00Z')]
  assert.equal(nextSoloSlotAt(t, 0, 12), null)
  assert.equal(nextSoloSlotAt(t, 4, 12), null)
})

test('nextSoloSlotAt: at the cap, the slot frees when the oldest start leaves the window', () => {
  const t = ['2026-10-26T13:00:00Z', '2026-10-26T10:00:00Z', '2026-10-26T12:00:00Z', '2026-10-26T11:00:00Z']
  assert.equal(nextSoloSlotAt(t, 4, 12).toISOString(), '2026-10-26T22:00:00.000Z')
})

test('nextSoloSlotAt: over the cap, waits until enough starts age out to drop below it', () => {
  const t = ['2026-10-26T09:00:00Z', '2026-10-26T10:00:00Z', '2026-10-26T11:00:00Z', '2026-10-26T12:00:00Z', '2026-10-26T13:00:00Z']
  assert.equal(nextSoloSlotAt(t, 4, 12).toISOString(), '2026-10-26T22:00:00.000Z')
})

// ── maxParticipants (up-to-8 raid parties) ───────────────────────────────

test('parseMemberBody: maxParticipants defaults to MAX_PARTICIPANTS_DEFAULT on create when omitted', () => {
  const result = parseMemberBody(baseMemberBody, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.maxParticipants, MAX_PARTICIPANTS_DEFAULT)
})

test('parseMemberBody: accepts the full maxParticipants range and rejects outside it', () => {
  assert.equal(parseMemberBody({ ...baseMemberBody, maxParticipants: MAX_PARTICIPANTS_MIN }, undefined).ok, true)
  assert.equal(parseMemberBody({ ...baseMemberBody, maxParticipants: MAX_PARTICIPANTS_MAX }, undefined).ok, true)
  assert.equal(parseMemberBody({ ...baseMemberBody, maxParticipants: MAX_PARTICIPANTS_MIN - 1 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, maxParticipants: MAX_PARTICIPANTS_MAX + 1 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, maxParticipants: 4.5 }, undefined).ok, false)
})

test('parseMemberBody: an update with no maxParticipants/windUpEnabled fields keeps the existing values', () => {
  const existing = {
    ...baseMemberBody, rank: 'GOON', active: true, sortOrder: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0,
    maxParticipants: 8, windUpEnabled: true,
  }
  const result = parseMemberBody({ name: 'Renamed' }, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.maxParticipants, 8)
  assert.equal(result.data.windUpEnabled, true)
})

// ── raidRoundLimit (raid round-count safety valve, default 300, up to 400) ──────────────

test('parseMemberBody: raidRoundLimit defaults to RAID_ROUND_LIMIT_DEFAULT on create when omitted', () => {
  const result = parseMemberBody(baseMemberBody, undefined)
  assert.equal(result.ok, true)
  assert.equal(result.data.raidRoundLimit, RAID_ROUND_LIMIT_DEFAULT)
})

test('parseMemberBody: accepts the full raidRoundLimit range and rejects outside it', () => {
  assert.equal(parseMemberBody({ ...baseMemberBody, raidRoundLimit: RAID_ROUND_LIMIT_MIN }, undefined).ok, true)
  assert.equal(parseMemberBody({ ...baseMemberBody, raidRoundLimit: RAID_ROUND_LIMIT_MAX }, undefined).ok, true)
  assert.equal(parseMemberBody({ ...baseMemberBody, raidRoundLimit: RAID_ROUND_LIMIT_MIN - 1 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, raidRoundLimit: RAID_ROUND_LIMIT_MAX + 1 }, undefined).ok, false)
  assert.equal(parseMemberBody({ ...baseMemberBody, raidRoundLimit: 300.5 }, undefined).ok, false)
})

test('parseMemberBody: an update with no raidRoundLimit field in the body keeps the existing value', () => {
  const existing = {
    ...baseMemberBody, rank: 'GOON', active: true, sortOrder: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0,
    raidRoundLimit: 400,
  }
  const result = parseMemberBody({ name: 'Renamed' }, existing)
  assert.equal(result.ok, true)
  assert.equal(result.data.raidRoundLimit, 400)
})

// ── Wind-up/telegraph moves ───────────────────────────────────────────────

const baseWindUpBody = {
  telegraphMessage: 'The boss rears back!', direction: 'HIGH', occurrencePercent: WIND_UP_OCCURRENCE_PERCENT_DEFAULT,
  bonusType: 'HEAL_PARTY', bonusAmount: 2,
}

test('parseWindUpMoveBody: a valid body parses with every field intact', () => {
  const result = parseWindUpMoveBody(baseWindUpBody)
  assert.equal(result.ok, true)
  assert.deepEqual(result.data, baseWindUpBody)
})

test('parseWindUpMoveBody: rejects a missing/blank/too-long telegraph message', () => {
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, telegraphMessage: '' }).ok, false)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, telegraphMessage: 'x'.repeat(301) }).ok, false)
})

test('parseWindUpMoveBody: direction must be one of WIND_UP_DIRECTIONS', () => {
  for (const d of WIND_UP_DIRECTIONS) assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, direction: d }).ok, true)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, direction: 'SIDEWAYS' }).ok, false)
})

test('parseWindUpMoveBody: bonusType must be one of WIND_UP_BONUS_TYPES', () => {
  for (const b of WIND_UP_BONUS_TYPES) assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, bonusType: b }).ok, true)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, bonusType: 'CONFUSE' }).ok, false)
})

test('parseWindUpMoveBody: occurrencePercent accepts the full 0-100 range (a flat per-round chance, not a weight) and rejects outside it', () => {
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, occurrencePercent: 0 }).ok, true)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, occurrencePercent: 100 }).ok, true)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, occurrencePercent: -1 }).ok, false)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, occurrencePercent: 101 }).ok, false)
})

test('parseWindUpMoveBody: rejects a non-integer or out-of-range bonusAmount', () => {
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, bonusAmount: 0 }).ok, false)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, bonusAmount: 1000 }).ok, false)
  assert.equal(parseWindUpMoveBody({ ...baseWindUpBody, bonusAmount: 2.5 }).ok, false)
})
