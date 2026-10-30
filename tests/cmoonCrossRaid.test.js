// Cross-cMoon raid boss parties: per-participant team credit, own-cMoon specials, party-wide
// heals that cross team lines, and the Raid Boss Lobby list. See "Cross-cMoon raids" in
// server/utils/cmoonEnemyRaid.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyRaidSpecialAttack, applyReflectDamage, applySiphonHealth, resolveRaidRound, participantCMoonId,
  raidCMoonIds, raidPartyLabel, splitRaidPoints, rankTierLevel, publicParticipantTeam,
  buildRaidLobbyEntry, buildRaidLobby, MAX_PARTY_SIZE, rollWindUpMove,
} from '../server/utils/cmoonEnemyRaid.js'
import { SPECIAL_ACTION } from '../server/utils/cmoonEnemyBattle.js'

function participant(userId, extra = {}) {
  return {
    userId, username: userId, hpRemaining: 5, maxHp: 10, knockedOutAt: null, isInitiator: false,
    pendingAction: null, hitStreak: 0, specialCharged: false, specialAttack: null, ...extra,
  }
}

function raidWith(parts, extra = {}) {
  return {
    id: 'r1', cMoonId: 'moonA', cMoonName: 'Moon A', status: 'FORMING', enemyName: 'Grim',
    enemyImagePath: '/g.png', enemyStats: { maxHp: 30, minPriorDefeats: 2 }, enemyHpRemaining: 30,
    joinDeadlineAt: 1000, startedAt: 1, roundNumber: 1,
    enemyParalyzedTurns: 0, partyParalyzedTurns: 0, partyAtkBonus: 0, enemyAtkBonus: 0,
    partyAtkRaiseAmount: 0, partyAtkRaiseTurnsRemaining: 0, enemyAtkRaiseAmount: 0, enemyAtkRaiseTurnsRemaining: 0,
    participants: new Map(parts.map(p => [p.userId, p])),
    ...extra,
  }
}

const healAll = { name: 'Group Hug', effectType: 'HEAL_SELF', amount: 3, healsAllies: true }
const healSelf = { name: 'Bandage', effectType: 'HEAL_SELF', amount: 3, healsAllies: false }

// ── Specials across teams ───────────────────────────────────────────────────────────────────

test('a heal-allies special heals every alive participant, whichever cMoon they are on', () => {
  const a = participant('a', { cMoonId: 'moonA', hpRemaining: 2 })
  const b = participant('b', { cMoonId: 'moonB', hpRemaining: 4 })
  const c = participant('c', { cMoonId: 'moonC', hpRemaining: 9 })
  const raid = raidWith([a, b, c])
  const events = []
  applyRaidSpecialAttack(raid, [a, b, c], healAll, { side: 'PLAYER', userId: 'a' }, events)
  assert.deepEqual([a.hpRemaining, b.hpRemaining, c.hpRemaining], [5, 7, 10]) // c capped at own maxHp
  assert.equal(events[0].userId, 'a')
  assert.equal(events[0].name, 'Group Hug')
})

test('a heal-allies special never revives a knocked-out participant', () => {
  const a = participant('a', { cMoonId: 'moonA' })
  const down = participant('down', { cMoonId: 'moonB', hpRemaining: 0, knockedOutAt: 5 })
  const raid = raidWith([a, down])
  applyRaidSpecialAttack(raid, [a], healAll, { side: 'PLAYER', userId: 'a' }, [])
  assert.equal(down.hpRemaining, 0)
})

test('a self-only heal heals just the caster, not teammates from other cMoons', () => {
  const a = participant('a', { cMoonId: 'moonA', hpRemaining: 2 })
  const b = participant('b', { cMoonId: 'moonB', hpRemaining: 2 })
  const raid = raidWith([a, b])
  applyRaidSpecialAttack(raid, [a, b], healSelf, { side: 'PLAYER', userId: 'b' }, [])
  assert.equal(a.hpRemaining, 2)
  assert.equal(b.hpRemaining, 5)
})

test('raise-ally-attack from any team boosts the whole party; a player damage special hits the boss', () => {
  const raid = raidWith([participant('a'), participant('b')])
  applyRaidSpecialAttack(raid, [], { name: 'Rally', effectType: 'RAISE_ALLY_ATTACK', amount: 1, raiseDurationRounds: 5 }, { side: 'PLAYER', userId: 'b' }, [])
  assert.equal(raid.partyAtkRaiseAmount, 1)
  assert.equal(raid.partyAtkRaiseTurnsRemaining, 5)
  assert.equal(raid.partyAtkBonus, 0) // the permanent field is untouched by a raise — see its own shape comment
  applyRaidSpecialAttack(raid, [], { name: 'Zap', effectType: 'DAMAGE_OPPONENT', amount: 4 }, { side: 'PLAYER', userId: 'a' }, [])
  assert.equal(raid.enemyHpRemaining, 26)
})

// ── Non-stacking paralyze/attack-raise (see applyRaidSpecialAttack's own comment) ────────────

test('a second PARALYZE_OPPONENT cast while the target is already paralyzed has no effect', () => {
  const raid = raidWith([participant('a'), participant('b')])
  applyRaidSpecialAttack(raid, [], { name: 'Stun', effectType: 'PARALYZE_OPPONENT', amount: 3 }, { side: 'PLAYER', userId: 'a' }, [])
  assert.equal(raid.enemyParalyzedTurns, 3)
  applyRaidSpecialAttack(raid, [], { name: 'Stun2', effectType: 'PARALYZE_OPPONENT', amount: 5 }, { side: 'PLAYER', userId: 'b' }, [])
  assert.equal(raid.enemyParalyzedTurns, 3) // not extended/replaced by the bigger amount
})

test('PARALYZE_OPPONENT can fire again once the active one has fully elapsed (turns at 0)', () => {
  const raid = raidWith([participant('a')])
  raid.enemyParalyzedTurns = 0
  applyRaidSpecialAttack(raid, [], { name: 'Stun', effectType: 'PARALYZE_OPPONENT', amount: 2 }, { side: 'PLAYER', userId: 'a' }, [])
  assert.equal(raid.enemyParalyzedTurns, 2)
})

test('the party and the boss paralyze independently — one being active does not block the other', () => {
  const raid = raidWith([participant('a')])
  applyRaidSpecialAttack(raid, [], { name: 'Stun', effectType: 'PARALYZE_OPPONENT', amount: 3 }, { side: 'PLAYER', userId: 'a' }, [])
  applyRaidSpecialAttack(raid, [], { name: 'Counter-stun', effectType: 'PARALYZE_OPPONENT', amount: 2 }, { side: 'ENEMY' }, [])
  assert.equal(raid.enemyParalyzedTurns, 3)
  assert.equal(raid.partyParalyzedTurns, 2)
})

test('a second RAISE_ALLY_ATTACK cast while one is already active has no effect', () => {
  const raid = raidWith([participant('a'), participant('b')])
  applyRaidSpecialAttack(raid, [], { name: 'Rally', effectType: 'RAISE_ALLY_ATTACK', amount: 2, raiseDurationRounds: 10 }, { side: 'PLAYER', userId: 'a' }, [])
  applyRaidSpecialAttack(raid, [], { name: 'Rally2', effectType: 'RAISE_ALLY_ATTACK', amount: 9, raiseDurationRounds: 300 }, { side: 'PLAYER', userId: 'b' }, [])
  assert.equal(raid.partyAtkRaiseAmount, 2)
  assert.equal(raid.partyAtkRaiseTurnsRemaining, 10)
})

test('RAISE_ALLY_ATTACK can fire again once the active raise has fully elapsed (turnsRemaining at 0)', () => {
  const raid = raidWith([participant('a')])
  raid.partyAtkRaiseTurnsRemaining = 0
  applyRaidSpecialAttack(raid, [], { name: 'Rally', effectType: 'RAISE_ALLY_ATTACK', amount: 4, raiseDurationRounds: 7 }, { side: 'PLAYER', userId: 'a' }, [])
  assert.equal(raid.partyAtkRaiseAmount, 4)
  assert.equal(raid.partyAtkRaiseTurnsRemaining, 7)
})

test('the party raise and the boss\'s own self-raise are tracked independently', () => {
  const raid = raidWith([participant('a')])
  applyRaidSpecialAttack(raid, [], { name: 'Rally', effectType: 'RAISE_ALLY_ATTACK', amount: 2, raiseDurationRounds: 5 }, { side: 'PLAYER', userId: 'a' }, [])
  applyRaidSpecialAttack(raid, [], { name: 'Enrage', effectType: 'RAISE_ALLY_ATTACK', amount: 3, raiseDurationRounds: 8 }, { side: 'ENEMY' }, [])
  assert.equal(raid.partyAtkRaiseAmount, 2)
  assert.equal(raid.partyAtkRaiseTurnsRemaining, 5)
  assert.equal(raid.enemyAtkRaiseAmount, 3)
  assert.equal(raid.enemyAtkRaiseTurnsRemaining, 8)
})

test('LOWER_OPPONENT_ATTACK is unaffected by the anti-stacking rule — still cumulative/permanent', () => {
  const raid = raidWith([participant('a')])
  applyRaidSpecialAttack(raid, [], { name: 'Weaken', effectType: 'LOWER_OPPONENT_ATTACK', amount: 2 }, { side: 'PLAYER', userId: 'a' }, [])
  applyRaidSpecialAttack(raid, [], { name: 'Weaken2', effectType: 'LOWER_OPPONENT_ATTACK', amount: 3 }, { side: 'PLAYER', userId: 'a' }, [])
  assert.equal(raid.enemyAtkBonus, -5) // stacks, unlike paralyze/raise
})

// ── REFLECT_DAMAGE / SIPHON_HEALTH (see applyRaidSpecialAttack's own comment) ────────────────

test('applyReflectDamage: a player cast reflects a percent of the REAL damage the boss dealt the party this round', () => {
  const raid = raidWith([participant('a'), participant('b')])
  const roundInfo = { enemyAction: 'ATTACK_HIGH', perParticipant: [{ userId: 'a', playerDamage: 2 }, { userId: 'b', playerDamage: 3 }], enemyDamageDealt: 0 }
  applyReflectDamage(raid, [], { name: 'Mirror', effectType: 'REFLECT_DAMAGE', reflectPercent: 100 }, { side: 'PLAYER', userId: 'a' }, roundInfo)
  assert.equal(raid.enemyHpRemaining, 30 - 5) // 2 + 3 = 5 total damage dealt to the party, reflected 100%
})

test('applyReflectDamage: if the boss blocked (dealt 0 real damage), nothing reflects', () => {
  const raid = raidWith([participant('a')])
  const roundInfo = { enemyAction: 'BLOCK_HIGH', perParticipant: [{ userId: 'a', playerDamage: 0 }], enemyDamageDealt: 0 }
  applyReflectDamage(raid, [], { name: 'Mirror', effectType: 'REFLECT_DAMAGE', reflectPercent: 500 }, { side: 'PLAYER', userId: 'a' }, roundInfo)
  assert.equal(raid.enemyHpRemaining, 30)
})

test('applyReflectDamage: reflectPercent can exceed 100%, and a boss cast is AoE at full amount per participant', () => {
  const a = participant('a', { hpRemaining: 10, maxHp: 10 })
  const b = participant('b', { hpRemaining: 10, maxHp: 10 })
  const raid = raidWith([a, b])
  const roundInfo = { enemyAction: 'ATTACK_HIGH', perParticipant: [], enemyDamageDealt: 4 }
  applyReflectDamage(raid, [a, b], { name: 'Counter', effectType: 'REFLECT_DAMAGE', reflectPercent: 200 }, { side: 'ENEMY' }, roundInfo)
  assert.deepEqual([a.hpRemaining, b.hpRemaining], [2, 2]) // 4 * 200% = 8 damage to EACH, not divided
})

test('applyRaidSpecialAttack: a player-cast REFLECT_DAMAGE is deferred (queued), not applied immediately', () => {
  const raid = raidWith([participant('a')])
  const roundGuards = { reflectUsed: false, siphonUsed: false, pendingReflect: null, pendingSiphon: null }
  const events = []
  applyRaidSpecialAttack(raid, [], { name: 'Mirror', effectType: 'REFLECT_DAMAGE', reflectPercent: 100 }, { side: 'PLAYER', userId: 'a' }, events, { roundGuards })
  assert.equal(raid.enemyHpRemaining, 30) // untouched -- nothing to reflect yet
  assert.equal(roundGuards.reflectUsed, true)
  assert.equal(roundGuards.pendingReflect.caster.userId, 'a')
  assert.equal(events.length, 1) // the cast is still announced immediately
})

test('applyRaidSpecialAttack: a second same-round player REFLECT_DAMAGE cast is a silent no-op (non-stacking)', () => {
  const raid = raidWith([participant('a'), participant('b')])
  const roundGuards = { reflectUsed: false, siphonUsed: false, pendingReflect: null, pendingSiphon: null }
  const events = []
  applyRaidSpecialAttack(raid, [], { name: 'Mirror', effectType: 'REFLECT_DAMAGE', reflectPercent: 100 }, { side: 'PLAYER', userId: 'a' }, events, { roundGuards })
  applyRaidSpecialAttack(raid, [], { name: 'Mirror2', effectType: 'REFLECT_DAMAGE', reflectPercent: 500 }, { side: 'PLAYER', userId: 'b' }, events, { roundGuards })
  assert.equal(roundGuards.pendingReflect.caster.userId, 'a') // first caster wins, second never overwrites it
  assert.equal(events.length, 2) // both casts are still announced
})

test('applyRaidSpecialAttack: a boss-cast REFLECT_DAMAGE applies immediately given roundInfo (no deferral)', () => {
  const a = participant('a', { hpRemaining: 10, maxHp: 10 })
  const raid = raidWith([a])
  const roundInfo = { enemyAction: 'ATTACK_HIGH', perParticipant: [], enemyDamageDealt: 3 }
  applyRaidSpecialAttack(raid, [a], { name: 'Counter', effectType: 'REFLECT_DAMAGE', reflectPercent: 100 }, { side: 'ENEMY' }, [], { roundInfo })
  assert.equal(a.hpRemaining, 7)
})

test('applySiphonHealth: a player cast deals Amount damage and heals the caster by siphonPercent% of it', () => {
  const a = participant('a', { hpRemaining: 2, maxHp: 10 })
  const raid = raidWith([a])
  const roundInfo = { enemyAction: 'ATTACK_HIGH', perParticipant: [], enemyDamageDealt: 0 }
  applySiphonHealth(raid, [a], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 6, siphonPercent: 50, healsAllies: false }, { side: 'PLAYER', userId: 'a' }, roundInfo)
  assert.equal(raid.enemyHpRemaining, 24) // 30 - 6
  assert.equal(a.hpRemaining, 5) // 2 + (6 * 50%) = 5
})

test('applySiphonHealth: a player cast fizzles entirely (no damage, no heal) if the boss blocked', () => {
  const a = participant('a', { hpRemaining: 2, maxHp: 10 })
  const raid = raidWith([a])
  const roundInfo = { enemyAction: 'BLOCK_LOW', perParticipant: [], enemyDamageDealt: 0 }
  applySiphonHealth(raid, [a], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 6, siphonPercent: 50, healsAllies: false }, { side: 'PLAYER', userId: 'a' }, roundInfo)
  assert.equal(raid.enemyHpRemaining, 30)
  assert.equal(a.hpRemaining, 2)
})

test('applySiphonHealth: player cast with healsAllies heals the whole party, not just the caster', () => {
  const a = participant('a', { hpRemaining: 2, maxHp: 10 })
  const b = participant('b', { hpRemaining: 3, maxHp: 10 })
  const raid = raidWith([a, b])
  const roundInfo = { enemyAction: 'ATTACK_HIGH', perParticipant: [], enemyDamageDealt: 0 }
  applySiphonHealth(raid, [a, b], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 10, siphonPercent: 50, healsAllies: true }, { side: 'PLAYER', userId: 'a' }, roundInfo)
  assert.deepEqual([a.hpRemaining, b.hpRemaining], [7, 8]) // both +5
})

test('applySiphonHealth: boss cast is AoE, but each alive participant who personally blocked is immune', () => {
  const a = participant('a', { hpRemaining: 10, maxHp: 10 })
  const b = participant('b', { hpRemaining: 10, maxHp: 10 })
  const raid = raidWith([a, b], { enemyHpRemaining: 20 }) // not already at max, so the heal is observable
  const roundInfo = {
    enemyAction: 'ATTACK_HIGH',
    perParticipant: [{ userId: 'a', action: 'ATTACK_HIGH' }, { userId: 'b', action: 'BLOCK_HIGH' }],
    enemyDamageDealt: 0,
  }
  applySiphonHealth(raid, [a, b], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 4, siphonPercent: 50, healsAllies: false }, { side: 'ENEMY' }, roundInfo)
  assert.equal(a.hpRemaining, 6) // hit
  assert.equal(b.hpRemaining, 10) // blocked, immune
  assert.equal(raid.enemyHpRemaining, 22) // 20 + (4 * 50%) from the one landed hit
})

test('applyRaidSpecialAttack: a second same-round player SIPHON_HEALTH cast is a silent no-op (non-stacking)', () => {
  const a = participant('a', { hpRemaining: 2, maxHp: 10 })
  const raid = raidWith([a])
  const roundGuards = { reflectUsed: false, siphonUsed: false, pendingReflect: null, pendingSiphon: null }
  const events = []
  applyRaidSpecialAttack(raid, [a], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 6, siphonPercent: 50 }, { side: 'PLAYER', userId: 'a' }, events, { roundGuards })
  applyRaidSpecialAttack(raid, [a], { name: 'Drain2', effectType: 'SIPHON_HEALTH', amount: 999, siphonPercent: 100 }, { side: 'PLAYER', userId: 'a' }, events, { roundGuards })
  assert.equal(roundGuards.pendingSiphon.attack.name, 'Drain') // first caster wins
  assert.equal(raid.enemyHpRemaining, 30) // still deferred -- neither applied yet
})

// Regression test for a real bug an adversarial review caught: cmoonRaidSocket.js's closeRound
// applies resolveRaidRound's per-participant HP OVERWRITE loop (`p.hpRemaining =
// result.hpRemaining`, from a snapshot taken BEFORE any heal) — a deferred siphon/reflect
// resolved before that loop runs would have its heal silently wiped out the instant it does.
// This reproduces closeRound's actual step order end-to-end (step 2's resolveRaidRound, the
// per-participant overwrite loop, THEN step 2.5's deferred resolution) to prove the fix holds.
test('a deferred player-cast SIPHON_HEALTH heal survives resolveRaidRound\'s own per-participant HP overwrite', () => {
  const a = participant('a', { hpRemaining: 2, maxHp: 10, pendingAction: SPECIAL_ACTION })
  const raid = raidWith([a])

  // Step 2: the normal lane exchange (the caster's own action is SPECIAL_ACTION, so it neither
  // attacks nor blocks). The boss's own action is an ATTACK here — not a block, since a blocking
  // boss would correctly make the siphon itself fizzle (that's SIPHON_HEALTH's own rule, a
  // different behavior than the one this test is isolating).
  const { enemyAction, perParticipant, enemyDamageDealt } = resolveRaidRound({
    enemyAction: 'ATTACK_HIGH', enemyMember: { attackChancePercent: 0, critChanceAgainstPercent: 0, critChanceFromPercent: 0 },
    participants: [{ userId: 'a', action: SPECIAL_ACTION, hpRemaining: a.hpRemaining, maxHp: a.maxHp }],
  })
  const roundInfo = { enemyAction, perParticipant, enemyDamageDealt }

  // closeRound's own per-participant overwrite loop, reproduced exactly — the boss's attack lands
  // on 'a' (SPECIAL_ACTION blocks nothing), so this overwrites her to 2 - 1 = 1 HP, still pre-heal.
  for (const result of perParticipant) {
    const p = raid.participants.get(result.userId)
    p.hpRemaining = result.hpRemaining
  }
  assert.equal(a.hpRemaining, 1)

  // Step 2.5: the deferred siphon resolves AFTER the overwrite loop above, per the fix.
  applySiphonHealth(raid, [a], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 6, siphonPercent: 50, healsAllies: false }, { side: 'PLAYER', userId: 'a' }, roundInfo)
  assert.equal(a.hpRemaining, 4, 'the heal (1 + 6*50%=3) must survive, not be wiped out by the earlier overwrite loop')
})

// Regression test for a real bug an adversarial review caught: a player-cast SIPHON_HEALTH with
// healsAllies: true looped over the raw `alive` array closeRound passes in, which is captured at
// the TOP of the round — before this round's own lane exchange could knock anyone out. Since the
// heal resolves in step 2.5 (AFTER that exchange), a teammate knocked out earlier the SAME round
// would get healed back to a positive hpRemaining while knockedOutAt stayed set: "dead" everywhere
// else in the engine, alive on their own HP bar.
test('a party-wide SIPHON_HEALTH heal never revives a participant knocked out earlier the same round', () => {
  const a = participant('a', { hpRemaining: 5, maxHp: 10 })
  const down = participant('down', { hpRemaining: 0, maxHp: 10, knockedOutAt: Date.now() }) // knocked out THIS round, before step 2.5
  const raid = raidWith([a, down])
  const roundInfo = { enemyAction: 'ATTACK_HIGH', perParticipant: [], enemyDamageDealt: 0 }
  applySiphonHealth(raid, [a, down], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 6, siphonPercent: 50, healsAllies: true }, { side: 'PLAYER', userId: 'a' }, roundInfo)
  assert.equal(a.hpRemaining, 8) // 5 + 3
  assert.equal(down.hpRemaining, 0, 'a knocked-out participant must not be healed back to a positive HP')
  assert.ok(down.knockedOutAt, 'knockedOutAt must stay set')
})

test('REFLECT_DAMAGE and SIPHON_HEALTH track their non-stacking slots independently of each other', () => {
  const raid = raidWith([participant('a'), participant('b')])
  const roundGuards = { reflectUsed: false, siphonUsed: false, pendingReflect: null, pendingSiphon: null }
  applyRaidSpecialAttack(raid, [], { name: 'Mirror', effectType: 'REFLECT_DAMAGE', reflectPercent: 100 }, { side: 'PLAYER', userId: 'a' }, [], { roundGuards })
  applyRaidSpecialAttack(raid, [], { name: 'Drain', effectType: 'SIPHON_HEALTH', amount: 5, siphonPercent: 50 }, { side: 'PLAYER', userId: 'b' }, [], { roundGuards })
  assert.ok(roundGuards.pendingReflect)
  assert.ok(roundGuards.pendingSiphon)
})

test('the boss\'s own damage special still hits every alive participant across teams', () => {
  const a = participant('a', { cMoonId: 'moonA', hpRemaining: 2 })
  const b = participant('b', { cMoonId: 'moonB', hpRemaining: 5 })
  const raid = raidWith([a, b])
  applyRaidSpecialAttack(raid, [a, b], { name: 'Quake', effectType: 'DAMAGE_OPPONENT', amount: 2 }, { side: 'ENEMY' }, [])
  assert.equal(a.hpRemaining, 0)
  assert.ok(a.knockedOutAt)
  assert.equal(b.hpRemaining, 3)
})

// ── Team credit ─────────────────────────────────────────────────────────────────────────────

test('each participant is credited to their own cMoon; legacy snapshots fall back to the raid\'s', () => {
  const raid = raidWith([participant('a', { cMoonId: 'moonA' }), participant('b', { cMoonId: 'moonB' }), participant('legacy')])
  assert.equal(participantCMoonId(raid, raid.participants.get('b')), 'moonB')
  assert.equal(participantCMoonId(raid, raid.participants.get('legacy')), 'moonA')
})

test('raidCMoonIds lists each team once, initiator\'s first', () => {
  const raid = raidWith([
    participant('a', { cMoonId: 'moonA', isInitiator: true }),
    participant('b', { cMoonId: 'moonB' }),
    participant('c', { cMoonId: 'moonA' }),
    participant('d', { cMoonId: 'moonC' }),
  ])
  assert.deepEqual(raidCMoonIds(raid), ['moonA', 'moonB', 'moonC'])
})

test('raidPartyLabel names one team plainly and joins mixed teams', () => {
  const single = raidWith([participant('a', { cMoonId: 'moonA', cMoonName: 'Moon A' }), participant('b', { cMoonId: 'moonA', cMoonName: 'Moon A' })])
  assert.equal(raidPartyLabel(single), 'Moon A')
  const mixed = raidWith([participant('a', { cMoonId: 'moonA', cMoonName: 'Moon A' }), participant('b', { cMoonId: 'moonB', cMoonName: 'Moon B' })])
  assert.equal(raidPartyLabel(mixed), 'Moon A + Moon B')
})

test('splitRaidPoints splits evenly, remainder to earliest joiners, and always sums to the reward', () => {
  const shares = splitRaidPoints(['a', 'b', 'c'], 10)
  assert.deepEqual([...shares.values()], [4, 3, 3])
  for (const [n, pts] of [[1, 7], [2, 7], [4, 0], [4, 1], [3, 100]]) {
    const ids = Array.from({ length: n }, (_, i) => `u${i}`)
    const sum = [...splitRaidPoints(ids, pts).values()].reduce((x, y) => x + y, 0)
    assert.equal(sum, pts)
  }
  assert.deepEqual([...splitRaidPoints(['a'], -5).values()], [0])
})

// ── Rank + team display ─────────────────────────────────────────────────────────────────────

test('rankTierLevel ranks by sortOrder even when sortOrder is not contiguous', () => {
  const tiers = [{ id: 'gold', sortOrder: 30 }, { id: 'bronze', sortOrder: 5 }, { id: 'silver', sortOrder: 12 }]
  assert.equal(rankTierLevel(tiers, 'bronze'), 1)
  assert.equal(rankTierLevel(tiers, 'gold'), 3)
  assert.equal(rankTierLevel(tiers, 'gone'), 0)
  assert.equal(rankTierLevel(tiers, null), 0)
})

test('publicParticipantTeam exposes team colors and rank, and nothing for a pending joiner', () => {
  const raid = raidWith([])
  const p = participant('b', {
    cMoonId: 'moonB', cMoonName: 'Moon B', cMoonColor: '#ff0000', cMoonAvatarPath: '/b.png',
    rankName: 'Captain', rankTierName: 'Gold', rankTierLevel: 3, rankTierCount: 5,
  })
  assert.deepEqual(publicParticipantTeam(raid, p), {
    cMoon: { id: 'moonB', name: 'Moon B', color: '#ff0000', avatarPath: '/b.png' },
    rank: { name: 'Captain', tierName: 'Gold', tierLevel: 3, tierCount: 5 },
    isCaptain: false,
  })
  assert.deepEqual(publicParticipantTeam(raid, participant('x', { pendingJoin: true })), { cMoon: null, rank: null, isCaptain: false })
  const legacy = publicParticipantTeam(raid, participant('old'))
  assert.equal(legacy.cMoon.name, 'Moon A')
  assert.equal(legacy.rank, null)
  assert.equal(legacy.isCaptain, false)
})

test('publicParticipantTeam exposes isCaptain (a cMoon captain\'s own cosmetic flag)', () => {
  const raid = raidWith([])
  const captainParticipant = participant('cap', { cMoonId: 'moonC', cMoonName: 'Moon C', isCaptain: true })
  const result = publicParticipantTeam(raid, captainParticipant)
  assert.equal(result.isCaptain, true)

  const regularParticipant = participant('reg', { cMoonId: 'moonC', cMoonName: 'Moon C', isCaptain: false })
  assert.equal(publicParticipantTeam(raid, regularParticipant).isCaptain, false)
})

// ── Lobby ───────────────────────────────────────────────────────────────────────────────────

test('a lobby entry is named after the initiator, even after they leave', () => {
  const raid = raidWith([participant('a', { isInitiator: true, cMoonId: 'moonA' }), participant('b', { cMoonId: 'moonB' })], { initiatorUsername: 'JanGloopManx' })
  assert.equal(buildRaidLobbyEntry(raid).name, "JanGloopManx's Raid")
  raid.participants.delete('a')
  assert.equal(buildRaidLobbyEntry(raid).name, "JanGloopManx's Raid")
})

test('a lobby entry carries only public data', () => {
  const p = participant('a', { isInitiator: true, cMoonId: 'moonA', pendingAction: 'ATTACK_HIGH', specialAttack: { name: 'secret' } })
  const entry = buildRaidLobbyEntry(raidWith([p], { currentEnemyAction: 'BLOCK_LOW', enemySpecialAttack: { name: 'boss' } }))
  const json = JSON.stringify(entry)
  for (const leaked of ['ATTACK_HIGH', 'BLOCK_LOW', 'boss', 'secret', 'hpRemaining']) {
    assert.ok(!json.includes(leaked), `lobby entry leaked ${leaked}`)
  }
  assert.equal(entry.minPriorDefeats, 2)
  assert.equal(entry.maxPartySize, MAX_PARTY_SIZE)
})

test('buildRaidLobby lists joinable raids first (closing soonest first), then full or in-combat raids', () => {
  const full = raidWith(['1', '2', '3', '4'].map(id => participant(id)), { id: 'full', joinDeadlineAt: 10, startedAt: 3 })
  const late = raidWith([participant('x')], { id: 'late', joinDeadlineAt: 500 })
  const soon = raidWith([participant('y')], { id: 'soon', joinDeadlineAt: 100 })
  const fighting = raidWith([participant('z')], { id: 'fighting', status: 'IN_PROGRESS', startedAt: 9 })
  const done = raidWith([participant('q')], { id: 'done', status: 'RESOLVED' })
  assert.deepEqual(buildRaidLobby([full, late, soon, fighting, done]).map(r => r.id), ['soon', 'late', 'fighting', 'full'])
})

// ── Up-to-8 parties (CMoonEnemyMember.maxParticipants) ──────────────────────────────────────

test('buildRaidLobbyEntry/buildRaidLobby honor a raid-specific maxParticipants over the MAX_PARTY_SIZE fallback', () => {
  const eight = raidWith(['1', '2', '3', '4', '5'].map(id => participant(id)), { id: 'eight', maxParticipants: 8, joinDeadlineAt: 50 })
  assert.equal(buildRaidLobbyEntry(eight).maxPartySize, 8)
  // 5/8 isn't full, so it's still joinable even though it exceeds the old MAX_PARTY_SIZE of 4.
  assert.deepEqual(buildRaidLobby([eight]).map(r => r.id), ['eight'])
})

// ── Private lobbies (CMoonEnemyRaid.isPrivate) ───────────────────────────────────────────────

test('buildRaidLobby never lists a private raid, even when it would otherwise be joinable', () => {
  const pub = raidWith([participant('a')], { id: 'pub', joinDeadlineAt: 10 })
  const priv = raidWith([participant('b')], { id: 'priv', joinDeadlineAt: 10, isPrivate: true })
  assert.deepEqual(buildRaidLobby([pub, priv]).map(r => r.id), ['pub'])
})

// ── Leader keep-open / speed vote (surfaced on the lobby entry, see cmoonRaidSocket.js) ──────

test('buildRaidLobbyEntry surfaces leaderKeepOpen for display', () => {
  const kept = raidWith([participant('a')], { leaderKeepOpen: true })
  const notKept = raidWith([participant('a')])
  assert.equal(buildRaidLobbyEntry(kept).leaderKeepOpen, true)
  assert.equal(buildRaidLobbyEntry(notKept).leaderKeepOpen, false)
})

// ── Wind-up/telegraph moves ───────────────────────────────────────────────────────────────────

test('rollWindUpMove returns null for an empty/missing move list', () => {
  assert.equal(rollWindUpMove([]), null)
  assert.equal(rollWindUpMove(undefined), null)
})

test('rollWindUpMove always fires a 100%-chance move', () => {
  const move = { telegraphMessage: 'Incoming!', direction: 'HIGH', occurrencePercent: 100, bonusType: 'HEAL_PARTY', bonusAmount: 2 }
  for (let i = 0; i < 20; i++) assert.equal(rollWindUpMove([move]), move)
})

test('rollWindUpMove never fires a 0%-chance move', () => {
  const move = { telegraphMessage: 'Never!', direction: 'LOW', occurrencePercent: 0, bonusType: 'DAMAGE_ENEMY', bonusAmount: 2 }
  for (let i = 0; i < 20; i++) assert.equal(rollWindUpMove([move]), null)
})

test('rollWindUpMove checks moves in order and stops at the first hit', () => {
  const first = { telegraphMessage: 'First', direction: 'HIGH', occurrencePercent: 100, bonusType: 'HEAL_PARTY', bonusAmount: 1 }
  const second = { telegraphMessage: 'Second', direction: 'LOW', occurrencePercent: 100, bonusType: 'DAMAGE_ENEMY', bonusAmount: 1 }
  assert.equal(rollWindUpMove([first, second]), first)
})
