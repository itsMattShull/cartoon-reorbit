import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMemberBody, parseRewardBody, isValidCritChance, isValidPointsAmount, isValidRank, isValidMinPriorDefeats,
  CRIT_CHANCE_MIN, CRIT_CHANCE_MAX, POINTS_REWARD_MIN, POINTS_REWARD_MAX, ENEMY_RANKS, RANK_DEFAULT,
  MIN_PRIOR_DEFEATS_MIN, MIN_PRIOR_DEFEATS_MAX, MIN_PRIOR_DEFEATS_DEFAULT,
  isValidOccurrencePercent, OCCURRENCE_PERCENT_MIN, OCCURRENCE_PERCENT_MAX, OCCURRENCE_PERCENT_DEFAULT,
  filterToHighestRank, pickWeightedEnemy, resolveMemberSoundPaths,
  MEMBER_SOUND_SLOTS, FACTION_DEFAULT_SOUND_SLOTS,
} from '../server/utils/cmoonEnemy.js'

const baseMemberBody = {
  factionId: 'f1', name: 'Test Enemy', battleMode: 'PER_PLAYER', maxHp: 5, cMoonPointsReward: 10, minPriorDefeats: 0,
  occurrencePercent: OCCURRENCE_PERCENT_DEFAULT,
  isRaidBoss: false, raidAnnouncementText: null, raidOneTime: false, raidCooldownMinutes: 0,
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
