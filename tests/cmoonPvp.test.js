import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assignPvpTargets, resolvePvpRound, applyPvpSpecialAttack, applyPvpReflectDamage, applyPvpSiphonHealth,
  buildPvpLobby, buildPvpLobbyEntry, splitPvpPoints,
  JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_TEAM_SIZE,
} from '../server/utils/cmoonPvp.js'
import { PLAYER_MAX_HP, NORMAL_HIT_DAMAGE, HEAL_ON_SUCCESSFUL_BLOCK } from '../server/utils/cmoonEnemyBattle.js'

test('constants: sane defaults', () => {
  assert.equal(JOIN_WINDOW_SECONDS, 60)
  assert.equal(ROUND_TIMEOUT_SECONDS > 0, true)
  assert.equal(MAX_TEAM_SIZE, 4)
})

// ── assignPvpTargets ──────────────────────────────────────────────────────────────────────────
test('assignPvpTargets: attackers never target their own team or a non-attacker', () => {
  const participants = [
    { userId: 'a1', team: 'A', action: 'ATTACK_HIGH' },
    { userId: 'a2', team: 'A', action: 'ATTACK_LOW' },
    { userId: 'b1', team: 'B', action: 'BLOCK_HIGH' },
    { userId: 'b2', team: 'B', action: 'ATTACK_HIGH' },
  ]
  const teamById = new Map(participants.map(p => [p.userId, p.team]))
  for (let i = 0; i < 50; i++) {
    const targets = assignPvpTargets(participants)
    // Every attacker (a1, a2, b2) gets a target; b1 (blocking) never does.
    assert.equal(targets.has('b1'), false)
    for (const [attacker, target] of targets.entries()) {
      assert.notEqual(teamById.get(attacker), teamById.get(target))
    }
  }
})

test('assignPvpTargets: a non-attacking action gets no target entry at all', () => {
  const participants = [
    { userId: 'a1', team: 'A', action: 'BLOCK_HIGH' },
    { userId: 'b1', team: 'B', action: 'BLOCK_LOW' },
  ]
  const targets = assignPvpTargets(participants)
  assert.equal(targets.size, 0)
})

// ── resolvePvpRound ───────────────────────────────────────────────────────────────────────────
test('resolvePvpRound: a landed hit deals NORMAL_HIT_DAMAGE and knocks out at 0 HP', () => {
  const participants = [
    { userId: 'a1', team: 'A', action: 'ATTACK_HIGH', hpRemaining: 1, maxHp: PLAYER_MAX_HP },
    { userId: 'b1', team: 'B', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  const targets = new Map([['a1', 'b1'], ['b1', 'a1']])
  const result = resolvePvpRound({ participants, targetsByUserId: targets })
  const a1 = result.perParticipant.find(p => p.userId === 'a1')
  const b1 = result.perParticipant.find(p => p.userId === 'b1')
  // Both attacked a different lane than the other's own action, and neither blocked, so both land.
  assert.equal(a1.hit, true)
  assert.equal(a1.damageDealt, NORMAL_HIT_DAMAGE)
  assert.equal(b1.damageTaken, NORMAL_HIT_DAMAGE)
  assert.equal(b1.hpRemaining, PLAYER_MAX_HP - NORMAL_HIT_DAMAGE)
  assert.equal(a1.hpRemaining, 0)
  assert.equal(a1.knockedOut, true)
})

test('resolvePvpRound: multiple attackers landing on the SAME defender accumulate before applying', () => {
  const participants = [
    { userId: 'a1', team: 'A', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'a2', team: 'A', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b1', team: 'B', action: 'BLOCK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  // Force both A attackers onto the same lone B defender.
  const targets = new Map([['a1', 'b1'], ['a2', 'b1']])
  const result = resolvePvpRound({ participants, targetsByUserId: targets })
  const b1 = result.perParticipant.find(p => p.userId === 'b1')
  // a1's HIGH matches b1's block (no damage); a2's LOW does not (lands) -> net 1 hit landed, plus
  // the block itself succeeded against a1's attack, so b1 also heals once.
  const expectedHp = Math.min(PLAYER_MAX_HP, PLAYER_MAX_HP - NORMAL_HIT_DAMAGE + HEAL_ON_SUCCESSFUL_BLOCK)
  assert.equal(b1.hpRemaining, expectedHp)
  assert.equal(b1.blocked, true)
})

test('resolvePvpRound: a team-wide shield zeroes all incoming damage to that team', () => {
  const participants = [
    { userId: 'a1', team: 'A', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b1', team: 'B', action: 'ATTACK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  const targets = new Map([['a1', 'b1'], ['b1', 'a1']])
  const result = resolvePvpRound({ participants, targetsByUserId: targets, teamShieldedByTeam: { A: false, B: true } })
  const b1 = result.perParticipant.find(p => p.userId === 'b1')
  assert.equal(b1.hpRemaining, PLAYER_MAX_HP) // shielded -- a1's landed hit dealt 0
  const a1 = result.perParticipant.find(p => p.userId === 'a1')
  assert.equal(a1.hpRemaining, PLAYER_MAX_HP - NORMAL_HIT_DAMAGE) // A is not shielded
})

test('resolvePvpRound: team atk bonus adds to every landed hit from that team, floored at 0', () => {
  const participants = [
    { userId: 'a1', team: 'A', action: 'ATTACK_HIGH', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
    { userId: 'b1', team: 'B', action: 'BLOCK_LOW', hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP },
  ]
  const targets = new Map([['a1', 'b1']])
  const result = resolvePvpRound({ participants, targetsByUserId: targets, teamAtkBonusByTeam: { A: 3, B: 0 } })
  const b1 = result.perParticipant.find(p => p.userId === 'b1')
  assert.equal(b1.damageTaken, NORMAL_HIT_DAMAGE + 3)
  const heavilyNegative = resolvePvpRound({ participants, targetsByUserId: targets, teamAtkBonusByTeam: { A: -100, B: 0 } })
  assert.equal(heavilyNegative.perParticipant.find(p => p.userId === 'b1').damageTaken, 0)
})

// ── applyPvpSpecialAttack ─────────────────────────────────────────────────────────────────────
function makeMatch(overrides = {}) {
  return {
    teamAAtkBonus: 0, teamBAtkBonus: 0,
    teamAAtkRaiseAmount: 0, teamAAtkRaiseTurnsRemaining: 0,
    teamBAtkRaiseAmount: 0, teamBAtkRaiseTurnsRemaining: 0,
    teamAParalyzedTurns: 0, teamBParalyzedTurns: 0,
    participants: new Map(),
    ...overrides,
  }
}
function makeParticipant(userId, team, overrides = {}) {
  return { userId, team, username: userId, hpRemaining: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, knockedOutAt: null, poisonAmount: 0, poisonTurnsRemaining: 0, ...overrides }
}
const baseAttack = { name: 'Test Attack', amount: 10, accuracyPercent: 100, soundPath: null }

test('applyPvpSpecialAttack: accuracyPercent 0 always misses and changes no state', () => {
  const match = makeMatch()
  const events = []
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'DAMAGE_OPPONENT', accuracyPercent: 0 }, { team: 'A', userId: 'a1' }, events, {})
  assert.equal(events[0].missed, true)
  assert.equal(match.teamBAtkBonus, 0)
})

test('applyPvpSpecialAttack: DAMAGE_OPPONENT hits exactly ONE random opponent, never AoE', () => {
  const match = makeMatch()
  const b1 = makeParticipant('b1', 'B'); const b2 = makeParticipant('b2', 'B')
  match.participants.set('b1', b1); match.participants.set('b2', b2)
  const events = []
  applyPvpSpecialAttack(match, { A: [], B: [b1, b2] }, { ...baseAttack, effectType: 'DAMAGE_OPPONENT', amount: 3 }, { team: 'A', userId: 'a1' }, events, {})
  const hit = [b1, b2].filter(p => p.hpRemaining < PLAYER_MAX_HP)
  assert.equal(hit.length, 1)
  assert.equal(hit[0].hpRemaining, PLAYER_MAX_HP - 3)
  assert.equal(events[0].targetUserId, hit[0].userId)
})

test('applyPvpSpecialAttack: DAMAGE_OPPONENT is blocked entirely by the target team\'s shield', () => {
  const match = makeMatch()
  const b1 = makeParticipant('b1', 'B')
  match.participants.set('b1', b1)
  const events = []
  applyPvpSpecialAttack(match, { A: [], B: [b1] }, { ...baseAttack, effectType: 'DAMAGE_OPPONENT', amount: 3 }, { team: 'A', userId: 'a1' }, events, { teamShieldedByTeam: { A: false, B: true } })
  assert.equal(b1.hpRemaining, PLAYER_MAX_HP)
  assert.equal(events[0].fizzled, true)
})

test('applyPvpSpecialAttack: HEAL_SELF without healsAllies only heals the caster', () => {
  const match = makeMatch()
  const a1 = makeParticipant('a1', 'A', { hpRemaining: 1 }); const a2 = makeParticipant('a2', 'A', { hpRemaining: 1 })
  match.participants.set('a1', a1); match.participants.set('a2', a2)
  applyPvpSpecialAttack(match, { A: [a1, a2], B: [] }, { ...baseAttack, effectType: 'HEAL_SELF', amount: 2, healsAllies: false }, { team: 'A', userId: 'a1' }, [], {})
  assert.equal(a1.hpRemaining, 3)
  assert.equal(a2.hpRemaining, 1)
})

test('applyPvpSpecialAttack: HEAL_SELF with healsAllies heals the whole caster TEAM, capped at maxHp', () => {
  const match = makeMatch()
  const a1 = makeParticipant('a1', 'A', { hpRemaining: PLAYER_MAX_HP - 1 }); const a2 = makeParticipant('a2', 'A', { hpRemaining: 1 })
  match.participants.set('a1', a1); match.participants.set('a2', a2)
  applyPvpSpecialAttack(match, { A: [a1, a2], B: [] }, { ...baseAttack, effectType: 'HEAL_SELF', amount: 10, healsAllies: true }, { team: 'A', userId: 'a1' }, [], {})
  assert.equal(a1.hpRemaining, PLAYER_MAX_HP) // capped
  assert.equal(a2.hpRemaining, PLAYER_MAX_HP) // capped
})

test('applyPvpSpecialAttack: PARALYZE_OPPONENT is team-wide and non-stacking', () => {
  const match = makeMatch()
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'PARALYZE_OPPONENT', amount: 3 }, { team: 'A', userId: 'a1' }, [], {})
  assert.equal(match.teamBParalyzedTurns, 3)
  // Already paralyzed -- a second cast is a no-op, does not extend/overwrite.
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'PARALYZE_OPPONENT', amount: 9 }, { team: 'A', userId: 'a1' }, [], {})
  assert.equal(match.teamBParalyzedTurns, 3)
  assert.equal(match.teamAParalyzedTurns, 0) // only the OPPOSING team is affected
})

test('applyPvpSpecialAttack: LOWER_OPPONENT_ATTACK is permanent and stacks across casts', () => {
  const match = makeMatch()
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'LOWER_OPPONENT_ATTACK', amount: 2 }, { team: 'A', userId: 'a1' }, [], {})
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'LOWER_OPPONENT_ATTACK', amount: 3 }, { team: 'A', userId: 'a1' }, [], {})
  assert.equal(match.teamBAtkBonus, -5)
  assert.equal(match.teamAAtkBonus, 0)
})

test('applyPvpSpecialAttack: RAISE_ALLY_ATTACK is non-stacking and time-limited, own team only', () => {
  const match = makeMatch()
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'RAISE_ALLY_ATTACK', amount: 4, raiseDurationRounds: 5 }, { team: 'A', userId: 'a1' }, [], {})
  assert.deepEqual([match.teamAAtkRaiseAmount, match.teamAAtkRaiseTurnsRemaining], [4, 5])
  // Already active -- a second cast with a different amount is a no-op.
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'RAISE_ALLY_ATTACK', amount: 99, raiseDurationRounds: 99 }, { team: 'A', userId: 'a1' }, [], {})
  assert.deepEqual([match.teamAAtkRaiseAmount, match.teamAAtkRaiseTurnsRemaining], [4, 5])
  assert.equal(match.teamBAtkRaiseTurnsRemaining, 0)
})

test('applyPvpSpecialAttack: POISON_OPPONENT hits one random opponent and refreshes (not stacks)', () => {
  const match = makeMatch()
  const b1 = makeParticipant('b1', 'B', { poisonAmount: 2, poisonTurnsRemaining: 1 })
  match.participants.set('b1', b1)
  applyPvpSpecialAttack(match, { A: [], B: [b1] }, { ...baseAttack, effectType: 'POISON_OPPONENT', amount: 5, poisonDurationRounds: 4 }, { team: 'A', userId: 'a1' }, [], {})
  assert.deepEqual([b1.poisonAmount, b1.poisonTurnsRemaining], [5, 4])
})

test('applyPvpSpecialAttack: CLEANSE_SELF cures own team paralysis + self poison, optional heal', () => {
  const match = makeMatch({ teamAParalyzedTurns: 3 })
  const a1 = makeParticipant('a1', 'A', { hpRemaining: 2, poisonAmount: 5, poisonTurnsRemaining: 2 })
  const a2 = makeParticipant('a2', 'A', { poisonAmount: 5, poisonTurnsRemaining: 2 })
  match.participants.set('a1', a1); match.participants.set('a2', a2)
  applyPvpSpecialAttack(match, { A: [a1, a2], B: [] }, { ...baseAttack, effectType: 'CLEANSE_SELF', amount: 3, healsAllies: false, cleanseAlsoHeals: true }, { team: 'A', userId: 'a1' }, [], {})
  assert.equal(match.teamAParalyzedTurns, 0) // whole team, unconditional
  assert.deepEqual([a1.poisonAmount, a1.poisonTurnsRemaining], [0, 0]) // self cured
  assert.equal(a1.hpRemaining, 5) // cleanseAlsoHeals
  assert.deepEqual([a2.poisonAmount, a2.poisonTurnsRemaining], [5, 2]) // ally untouched -- healsAllies off
})

test('applyPvpSpecialAttack: SHIELD_PARTY only announces -- no match-state mutation', () => {
  const match = makeMatch()
  const before = JSON.stringify(match, (k, v) => k === 'participants' ? undefined : v)
  const events = []
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'SHIELD_PARTY' }, { team: 'A', userId: 'a1' }, events, {})
  const after = JSON.stringify(match, (k, v) => k === 'participants' ? undefined : v)
  assert.equal(before, after)
  assert.equal(events.length, 1)
})

test('applyPvpSpecialAttack: REFLECT_DAMAGE/SIPHON_HEALTH always defer, keyed per caster team', () => {
  const match = makeMatch()
  const roundGuards = { reflectUsedByTeam: { A: false, B: false }, pendingReflectByTeam: { A: null, B: null }, siphonUsedByTeam: { A: false, B: false }, pendingSiphonByTeam: { A: null, B: null } }
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'REFLECT_DAMAGE', reflectPercent: 100 }, { team: 'A', userId: 'a1' }, [], { roundGuards })
  assert.equal(roundGuards.reflectUsedByTeam.A, true)
  assert.ok(roundGuards.pendingReflectByTeam.A)
  // Team B's own cast the same round is independent -- not blocked by A's guard.
  applyPvpSpecialAttack(match, { A: [], B: [] }, { ...baseAttack, effectType: 'SIPHON_HEALTH', siphonPercent: 50 }, { team: 'B', userId: 'b1' }, [], { roundGuards })
  assert.equal(roundGuards.siphonUsedByTeam.B, true)
  assert.equal(roundGuards.siphonUsedByTeam.A, false)
})

// ── applyPvpReflectDamage / applyPvpSiphonHealth ─────────────────────────────────────────────
test('applyPvpReflectDamage: reflects a percent of damage the caster took onto a random hitter', () => {
  const match = makeMatch()
  const a1 = makeParticipant('a1', 'A')
  const b1 = makeParticipant('b1', 'B', { hpRemaining: 4 })
  match.participants.set('a1', a1); match.participants.set('b1', b1)
  const roundInfo = { perParticipant: [{ userId: 'a1', damageTaken: 2 }], hittersByDefenderId: new Map([['a1', ['b1']]]) }
  const event = {}
  applyPvpReflectDamage(match, { ...baseAttack, reflectPercent: 150 }, { team: 'A', userId: 'a1' }, roundInfo, event)
  assert.equal(b1.hpRemaining, 4 - 3) // round(2 * 1.5) = 3
  assert.equal(event.targetUserId, 'b1')
  assert.equal(event.fizzled, false)
})

test('applyPvpReflectDamage: fizzles when the caster took no damage this round', () => {
  const match = makeMatch()
  const roundInfo = { perParticipant: [{ userId: 'a1', damageTaken: 0 }], hittersByDefenderId: new Map() }
  const event = {}
  applyPvpReflectDamage(match, { ...baseAttack, reflectPercent: 100 }, { team: 'A', userId: 'a1' }, roundInfo, event)
  assert.equal(event.fizzled, true)
})

test('applyPvpSiphonHealth: fizzles when the specific random target blocked', () => {
  const match = makeMatch()
  const a1 = makeParticipant('a1', 'A')
  const b1 = makeParticipant('b1', 'B')
  match.participants.set('a1', a1); match.participants.set('b1', b1)
  const roundInfo = { perParticipant: [{ userId: 'b1', action: 'BLOCK_HIGH' }] }
  const event = {}
  applyPvpSiphonHealth(match, { A: [a1], B: [b1] }, { ...baseAttack, amount: 5, siphonPercent: 50 }, { team: 'A', userId: 'a1' }, roundInfo, event)
  assert.equal(b1.hpRemaining, PLAYER_MAX_HP) // fizzled, no damage
  assert.equal(event.fizzled, true)
})

test('applyPvpSiphonHealth: damages the target and heals the caster by siphonPercent%', () => {
  const match = makeMatch()
  const a1 = makeParticipant('a1', 'A', { hpRemaining: 1 })
  const b1 = makeParticipant('b1', 'B')
  match.participants.set('a1', a1); match.participants.set('b1', b1)
  const roundInfo = { perParticipant: [{ userId: 'b1', action: 'ATTACK_HIGH' }] }
  const event = {}
  applyPvpSiphonHealth(match, { A: [a1], B: [b1] }, { ...baseAttack, amount: 4, siphonPercent: 50 }, { team: 'A', userId: 'a1' }, roundInfo, event)
  assert.equal(b1.hpRemaining, PLAYER_MAX_HP - 4)
  assert.equal(a1.hpRemaining, 1 + 2) // round(4 * 0.5)
  assert.equal(event.fizzled, false)
})

// ── splitPvpPoints / buildPvpLobby ────────────────────────────────────────────────────────────
test('splitPvpPoints: splits evenly, remainder to earliest entries, re-exported from cmoonEnemyRaid.js', () => {
  const shares = splitPvpPoints(['a', 'b', 'c'], 10)
  assert.deepEqual([...shares.values()].sort((x, y) => y - x), [4, 3, 3])
})

test('buildPvpLobby: a FORMING match with an open slot on either side is joinable and listed first', () => {
  const full = {
    id: 'full', status: 'FORMING', isPrivate: false, maxTeamSize: 1, joinDeadlineAt: 2000, startedAt: 1,
    participants: new Map([['a1', { userId: 'a1', team: 'A', isInitiator: true, username: 'a1' }], ['b1', { userId: 'b1', team: 'B', username: 'b1' }]]),
  }
  const open = {
    id: 'open', status: 'FORMING', isPrivate: false, maxTeamSize: 2, joinDeadlineAt: 1000, startedAt: 1,
    participants: new Map([['a2', { userId: 'a2', team: 'A', isInitiator: true, username: 'a2' }]]),
  }
  const privateOne = { ...open, id: 'priv', isPrivate: true }
  const lobby = buildPvpLobby([full, open, privateOne])
  // `open` has a free slot (joinable, sorted first); `full` is still FORMING but has no open slot
  // on either side, so it's listed as non-joinable context, same as raid's own "already in combat"
  // rest-list behavior; the private match is never listed at all.
  assert.deepEqual(lobby.map(e => e.id), ['open', 'full'])
})

test('buildPvpLobbyEntry: reports each team\'s own size', () => {
  const match = {
    id: 'm1', status: 'IN_PROGRESS', initiatorUsername: 'host', joinDeadlineAt: 1, roundNumber: 2, maxTeamSize: 4,
    teamACMoonId: 'c1', teamBCMoonId: 'c2', leaderKeepOpen: false,
    participants: new Map([
      ['a1', { userId: 'a1', team: 'A', isInitiator: true, username: 'host' }],
      ['a2', { userId: 'a2', team: 'A', username: 'a2' }],
      ['b1', { userId: 'b1', team: 'B', username: 'b1' }],
    ]),
  }
  const entry = buildPvpLobbyEntry(match)
  assert.equal(entry.teamASize, 2)
  assert.equal(entry.teamBSize, 1)
  assert.equal(entry.name, "host's PvP Match")
})
