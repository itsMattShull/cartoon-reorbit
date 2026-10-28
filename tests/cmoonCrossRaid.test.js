// Cross-cMoon raid boss parties: per-participant team credit, own-cMoon specials, party-wide
// heals that cross team lines, and the Raid Boss Lobby list. See "Cross-cMoon raids" in
// server/utils/cmoonEnemyRaid.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyRaidSpecialAttack, participantCMoonId, raidCMoonIds, raidPartyLabel, splitRaidPoints,
  rankTierLevel, publicParticipantTeam, buildRaidLobbyEntry, buildRaidLobby, MAX_PARTY_SIZE,
} from '../server/utils/cmoonEnemyRaid.js'

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
  applyRaidSpecialAttack(raid, [], { name: 'Rally', effectType: 'RAISE_ALLY_ATTACK', amount: 1 }, { side: 'PLAYER', userId: 'b' }, [])
  assert.equal(raid.partyAtkBonus, 1)
  applyRaidSpecialAttack(raid, [], { name: 'Zap', effectType: 'DAMAGE_OPPONENT', amount: 4 }, { side: 'PLAYER', userId: 'a' }, [])
  assert.equal(raid.enemyHpRemaining, 26)
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
  })
  assert.deepEqual(publicParticipantTeam(raid, participant('x', { pendingJoin: true })), { cMoon: null, rank: null })
  const legacy = publicParticipantTeam(raid, participant('old'))
  assert.equal(legacy.cMoon.name, 'Moon A')
  assert.equal(legacy.rank, null)
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
