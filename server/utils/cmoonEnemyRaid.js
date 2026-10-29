// server/utils/cmoonEnemyRaid.js
// Pure, DB-free combat math for the cMoon Enemy Battles "raid boss" co-op mode — see
// prisma/schema.prisma's CMoonEnemyRaid model comment for the full feature shape. This file adds
// nothing new to how a single hit/block/crit resolves (that's still resolveBattleRound/
// rollHitDamage from cmoonEnemyBattle.js, reused unchanged) — it only adds what's different about
// a PARTY fight: every alive participant resolves against the SAME rolled enemy action each
// round (an explicit design choice — see the session's own "one shared boss move" decision — so
// two players in the same raid are genuinely facing one fight, not two coincidentally-simultaneous
// ones), and their landed hits all come out of one shared boss HP pool together.
//
// Actual live state (who's connected, timers, DB writes, Discord/notifications) lives in
// server/utils/cmoonRaidSocket.js — this mirrors the existing split between
// monsterBattleEngine.js (pure state transitions) and socket-server.js (the stateful process
// that owns a Map of them) already used for 1v1 Monster Battles.
//
// ── Special attacks in a raid (see CMoonSpecialAttack's own schema comment) ──────────────────
// Reuses the exact same library/effect types the solo battle does, generalized for a live party
// fight — the actual charge/fire/bookkeeping lives in cmoonRaidSocket.js's closeRound() (the
// stateful side, same split as everything else in this file), this module only had to grow two
// things to make that possible:
//   - resolveRaidRound below accepts partyAtkBonus/enemyAtkBonus (mirrors solo's resolveRound)
//     and the action-shape check was loosened to isKnownAction so a participant's `action` can be
//     SPECIAL_ACTION (they chose to fire their special this round) or PARALYZED_ACTION (the
//     caller forced it — see below), not just the 4 lane moves.
//   - Every raid-specific effect is deliberately SHARED, never per-participant, because a raid
//     boss already has exactly one shared action/HP pool/crit roll per round — there was no
//     natural "pick one of four players" targeting rule to invent, so each effect just extends
//     the thing that's already shared:
//       DAMAGE_OPPONENT (player-cast)   -> raid.enemyHpRemaining (same as a landed hit already does)
//       DAMAGE_OPPONENT (boss auto-fire)-> every alive participant, same `amount` each (an AoE
//                                          moment, not a single-target pick — there's no "aggro"
//                                          concept anywhere else in this engine to hang one off of)
//       HEAL_SELF        -> the caster only, unless CMoonSpecialAttack.healsAllies is set, in
//                            which case every alive participant (caster included) — an admin's
//                            own per-attack choice, not an automatic solo-vs-raid behavior switch
//       PARALYZE_OPPONENT (player-cast) -> raid.enemyParalyzedTurns: the boss's one shared action
//                                          whiffs for everyone, for free, by construction
//       PARALYZE_OPPONENT (boss auto-fire)-> raid.partyParalyzedTurns: every alive participant's
//                                          action is forced to whiff that round, regardless of
//                                          what they chose/were auto-filled with
//       LOWER_OPPONENT_ATTACK/RAISE_ALLY_ATTACK -> raid.enemyAtkBonus/raid.partyAtkBonus, fed
//                                          into resolveRaidRound below exactly like the solo
//                                          battle's own playerAtkBonus/enemyAtkBonus
//   - Each participant's own hitStreak/specialCharged stays genuinely per-participant (see
//     CMoonEnemyRaidParticipant's own in-memory shape in cmoonRaidSocket.js) — "if a player lands
//     3 hits in a row" is unambiguous per-player, unlike anything above. The boss's own hit
//     streak, by contrast, is one shared counter (raid.enemyHitStreak): it advances the instant
//     its single rolled action lands on AT LEAST ONE alive participant, mirroring the shared HP
//     pool/shared action this engine already treats the boss as having.

import {
  resolveBattleRound, rollHitDamage, isKnownAction, PLAYER_MAX_HP, HEAL_ON_SUCCESSFUL_BLOCK,
} from './cmoonEnemyBattle.js'

// FORMING -> auto-starts combat, whoever has joined by then. Only the hardcoded fallback now —
// live code reads GlobalGameConfig.cMoonRaidJoinWindowSeconds instead (see cmoonraid:start),
// admin-configurable 15-120s; this constant is used only if that config row is ever unexpectedly
// missing.
export const JOIN_WINDOW_SECONDS = 60
// An alive participant who hasn't acted by this auto-acts. Lowered from 20 to 15 so a stalling
// player can't drag a round out as long — see the visible round countdown in
// pages/newsite/cmoon-raid/[id].vue, which now actually shows this ticking down.
export const ROUND_TIMEOUT_SECONDS = 15
// Only the hardcoded fallback/default now — live code reads each raid's own
// raid.maxParticipants (snapshotted from CMoonEnemyMember.maxParticipants, 1-8, at raid creation)
// instead. Kept exported since it's still this file's own "if nothing else says otherwise" value.
export const MAX_PARTY_SIZE = 4
export const RAID_MAX_ROUNDS_SAFETY = 150 // same runaway-RNG safety valve as a solo battle

// Whether a raid boss can be started right now, given its own admin-configured
// raidOneTime/raidCooldownMinutes and the raidDefeatedAt timestamp its last WIN set (see those
// columns' own schema comments) — shared by cmoonRaidSocket.js's cmoonraid:start handler (the
// authoritative check) and consider.post.js's popup candidate filter (so it isn't even offered),
// so the two can never drift apart on what "raidable right now" means. `now` is injectable for
// tests; every real caller just uses the default.
//
// raidDefeatedAt is only ever meaningful when raidOneTime is true OR raidCooldownMinutes > 0 —
// if an admin turns both off after a member was once defeated, a leftover raidDefeatedAt must not
// keep blocking it forever (see raidOneTime's own schema comment: "ignored while raidOneTime is
// false" — cooldown=0 is the equivalent no-op state for the cooldown side).
//
// `riddleGateSolved` defaults to true (no gate at all) so every existing caller/test that never
// passes it keeps its original behavior unchanged. A caller with a BOSS_LORE CMoonRiddle tied to
// this member (see getActiveBossLoreRiddle in server/utils/cmoonRiddle.js) passes
// `!!riddle.solvedAt` instead — checked FIRST and independent of raidOneTime/raidCooldownMinutes/
// raidDefeatedAt, since an unsolved lore riddle blocks the very first encounter, before this boss
// has ever had a raidDefeatedAt at all.
export function checkRaidBossAvailability({ raidOneTime, raidCooldownMinutes, raidDefeatedAt, riddleGateSolved = true }, now = Date.now()) {
  if (!riddleGateSolved) {
    return { available: false, message: 'This raid boss is locked behind a riddle — solve it in Discord with /riddle to unlock' }
  }
  if (!raidDefeatedAt) return { available: true }
  if (raidOneTime) {
    return { available: false, message: 'This raid boss has already been defeated and must be revived by an admin' }
  }
  const cooldownMs = Math.max(0, Number(raidCooldownMinutes) || 0) * 60 * 1000
  if (cooldownMs <= 0) return { available: true }
  const availableAt = new Date(new Date(raidDefeatedAt).getTime() + cooldownMs)
  if (now >= availableAt.getTime()) return { available: true }
  return { available: false, message: 'This raid boss is on cooldown', availableAt }
}

// One round, already collected. `participants` is the list of participants who were ALIVE when
// this round opened, each `{ userId, action, hpRemaining, maxHp }` — a knocked-out participant is
// never passed in at all (they stopped acting the moment they hit 0 HP, see cmoonRaidSocket.js).
// `maxHp` is each participant's OWN max HP (see getPlayerCombatMaxHp() in server/utils/cmoon.js)
// — a raid party can genuinely have different max HPs per member if their cMoon ranks differ, so
// this is never a single shared constant the way the enemy's stats are. `enemyAction` was rolled
// ONCE, server-side, when the round opened — passed in here rather than rolled inside this
// function so the caller can broadcast "round opened" before resolution without this function's
// own Math.random() call making that a second, different roll.
//
// Returns each participant's own hit/block/crit/new-HP plus the enemy's TOTAL damage taken this
// round (the sum of every participant's landed hit) — the caller applies that against the shared
// enemyHpRemaining, floored at 0, the same way the solo battle's SHARED_POOL branch already does
// in action.post.js.
//
// `partyAtkBonus`/`enemyAtkBonus` are this file's own version of the solo battle's
// playerAtkBonus/enemyAtkBonus (see resolveRound in cmoonEnemyBattle.js) — a single SHARED value
// applied to every participant's own damage roll this round, since this feature's raid design
// makes both the attack-boost and attack-lowering specials party-wide rather than per-player (see
// this file's own header comment). Floored at 0 per participant, same as solo. `enemyAction` and
// each participant's own `action` may be SPECIAL_ACTION or PARALYZED_ACTION (see isKnownAction) —
// the caller (cmoonRaidSocket.js's closeRound) is responsible for substituting PARALYZED_ACTION
// in for whichever side(s) are currently stunned BEFORE calling this, exactly mirroring how the
// solo battle's own resolveRound receives an already-paralysis-aware action; this function itself
// has no concept of "turns remaining," only "what action is this round's, whatever decided it."
export function resolveRaidRound({ enemyAction, enemyMember, participants, partyAtkBonus = 0, enemyAtkBonus = 0 }) {
  if (!isKnownAction(enemyAction)) throw new Error(`Invalid enemy action: ${enemyAction}`)

  let enemyDamageDealt = 0
  const perParticipant = participants.map(({ userId, action, hpRemaining, maxHp }) => {
    if (!isKnownAction(action)) throw new Error(`Invalid action for ${userId}: ${action}`)
    const { playerHit, enemyHit, playerBlocked, enemyBlocked } = resolveBattleRound(action, enemyAction)
    // critChanceFromPercent is the enemy's own attack landing critically against A player;
    // critChanceAgainstPercent is a player's attack landing critically against the enemy — same
    // naming as the solo battle, see CMoonEnemyMember's own schema comment on these columns.
    const { damage: playerDamageBase, isCrit: playerCrit } = rollHitDamage(playerHit, enemyMember.critChanceFromPercent)
    const { damage: enemyDamageBase, isCrit: enemyCrit } = rollHitDamage(enemyHit, enemyMember.critChanceAgainstPercent)
    // Named from each side's own perspective, same convention as the solo battle: enemyAtkBonus
    // changes what the ENEMY deals (to this participant); partyAtkBonus changes what the PARTY
    // (this participant included) deals back.
    const playerDamage = playerHit ? Math.max(0, playerDamageBase + enemyAtkBonus) : 0
    const enemyDamage = enemyHit ? Math.max(0, enemyDamageBase + partyAtkBonus) : 0

    let newHp = hpRemaining
    if (playerHit) newHp = Math.max(0, newHp - playerDamage)
    // `maxHp || PLAYER_MAX_HP`: a defensive fallback only, never expected to trigger in normal
    // operation — a raid restored from Redis across a deploy boundary that predates this
    // participant field existing would otherwise clamp against `undefined` here and produce NaN.
    else if (playerBlocked) newHp = Math.min(maxHp || PLAYER_MAX_HP, newHp + HEAL_ON_SUCCESSFUL_BLOCK)

    if (enemyHit) enemyDamageDealt += enemyDamage

    return {
      userId, action, enemyAction, playerHit, enemyHit, playerBlocked, enemyBlocked,
      playerCrit, enemyCrit, hpRemaining: newHp, knockedOut: newHp <= 0,
      // Display-only, same reasoning/shape as the solo battle's own roundEntry.playerDamage/
      // enemyDamage (see resolveRound's own comment) — the floating damage-number UI reads
      // these directly instead of re-deriving "1, or 2 on a crit" client-side. playerDamage is
      // damage dealt TO THIS PARTICIPANT (by the enemy); enemyDamage is damage THIS
      // PARTICIPANT dealt to the enemy — always 0 when that side didn't land a hit.
      playerDamage, enemyDamage,
    }
  })

  return { enemyAction, perParticipant, enemyDamageDealt }
}

// ── Cross-cMoon raids ──────────────────────────────────────────────────────────────────────────
// A raid party can mix members of DIFFERENT cMoons (see the "Raid Boss Lobby" in
// components/newsite/CMoonRaidLobbyModal.vue). Each participant carries their own snapshot, taken
// once when they start or join (see loadParticipantProfile in cmoonRaidSocket.js):
//   cMoonId/cMoonName/cMoonColor/cMoonAvatarPath  — the team they fight for and are credited to
//   rankName/rankTierName/rankTierLevel/rankTierCount — shown off on the raid screen
//   specialAttack — THEIR OWN cMoon's special (CMoonSpecialAttack shape) or null
// raid.cMoonId stays the INITIATOR's cMoon (CMoonEnemyRaid.cMoonId is required and is where the
// Discord call-to-arms thread lives); it is never assumed to be every participant's team.

// Applies one fired special's effect in place against the raid's shared state — shared by the
// player-cast branch (the caster's OWN cMoon special) and the boss's own auto-fire branch, since
// both read the same five effectType branches off the same CMoonSpecialAttack shape, just from
// opposite casters. `caster` is `{ side, userId? }` purely for the specialEvents entry pushed to the
// room/roundLog/Discord; it has no bearing on targeting. Party-wide effects (a healsAllies heal,
// RAISE_ALLY_ATTACK) deliberately reach EVERY alive participant regardless of which cMoon they
// belong to: the whole point of a cross-cMoon raid is that the party is one team for the fight.
// Knocked-out participants are never in `alive`, so a heal never revives anyone.
export function applyRaidSpecialAttack(raid, alive, attack, caster, specialEvents) {
  specialEvents.push({
    side: caster.side, userId: caster.userId || null, name: attack.name,
    effectType: attack.effectType, amount: attack.amount, soundPath: attack.soundPath || null,
  })
  if (attack.effectType === 'DAMAGE_OPPONENT') {
    if (caster.side === 'PLAYER') {
      raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - attack.amount)
    } else {
      for (const p of alive) {
        p.hpRemaining = Math.max(0, p.hpRemaining - attack.amount)
        if (p.hpRemaining <= 0 && !p.knockedOutAt) p.knockedOutAt = Date.now()
      }
    }
  } else if (attack.effectType === 'HEAL_SELF') {
    if (caster.side === 'PLAYER') {
      const casterParticipant = raid.participants.get(caster.userId)
      if (attack.healsAllies) {
        for (const p of alive) p.hpRemaining = Math.min(p.maxHp, p.hpRemaining + attack.amount)
      } else if (casterParticipant && !casterParticipant.knockedOutAt) {
        casterParticipant.hpRemaining = Math.min(casterParticipant.maxHp, casterParticipant.hpRemaining + attack.amount)
      }
    } else {
      raid.enemyHpRemaining = Math.min(raid.enemyStats.maxHp, raid.enemyHpRemaining + attack.amount)
    }
  } else if (attack.effectType === 'PARALYZE_OPPONENT') {
    if (caster.side === 'PLAYER') raid.enemyParalyzedTurns += attack.amount
    else raid.partyParalyzedTurns += attack.amount
  } else if (attack.effectType === 'LOWER_OPPONENT_ATTACK') {
    if (caster.side === 'PLAYER') raid.enemyAtkBonus -= attack.amount
    else raid.partyAtkBonus -= attack.amount
  } else if (attack.effectType === 'RAISE_ALLY_ATTACK') {
    if (caster.side === 'PLAYER') raid.partyAtkBonus += attack.amount
    else raid.enemyAtkBonus += attack.amount
  }
}

// The cMoon a participant is credited to: their own snapshot, falling back to the raid's
// (initiator's) cMoon only for a participant restored from a Redis snapshot taken before
// cross-cMoon raids existed, when every participant was necessarily on that same cMoon.
export function participantCMoonId(raid, p) {
  return p?.cMoonId || raid.cMoonId
}

// Every distinct cMoon represented in the party, in join order (initiator first).
export function raidCMoonIds(raid) {
  const ids = []
  for (const p of raid.participants.values()) {
    const id = participantCMoonId(raid, p)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

// Human label for the party in Discord posts: the one cMoon's name, or every team joined with
// " + " once more than one cMoon is fighting together.
export function raidPartyLabel(raid) {
  const names = []
  for (const p of raid.participants.values()) {
    const name = p.cMoonName || (participantCMoonId(raid, p) === raid.cMoonId ? raid.cMoonName : null)
    if (name && !names.includes(name)) names.push(name)
  }
  if (!names.length) return raid.cMoonName || 'The party'
  return names.join(' + ')
}

// Splits a raid's cMoon point reward evenly across the party (see resolveCMoonRaidOutcome's own
// comment for why it's split rather than multiplied). Each share is credited to that
// participant's OWN cMoon, so in a cross-cMoon raid every team earns exactly its members' shares
// and the total across all teams is still one win's worth. Remainder goes to the earliest joiners
// so the shares always sum back to exactly `pointsAwarded`.
export function splitRaidPoints(participantIds, pointsAwarded) {
  const n = participantIds.length || 1
  const total = Math.max(0, Math.floor(Number(pointsAwarded) || 0))
  const base = Math.floor(total / n)
  const remainder = total - base * participantIds.length
  return new Map(participantIds.map((userId, i) => [userId, base + (i < remainder ? 1 : 0)]))
}

// Where a participant's rank sits on the global tier ladder (1-based), from the full tier list
// ({ id, sortOrder }). Tiers are ordered by sortOrder, which need not be contiguous. Returns 0
// when the tier isn't found (no rank yet, or a tier deleted since).
export function rankTierLevel(tiers, tierId) {
  if (!tierId || !Array.isArray(tiers)) return 0
  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder)
  return sorted.findIndex(t => t.id === tierId) + 1
}

// Public, per-participant team/rank badge data for the raid screen and lobby — never anything
// combat-sensitive. `fallbackCMoon` covers a legacy participant with no snapshot of their own.
export function publicParticipantTeam(raid, p) {
  // A reservation made without a team snapshot (shouldn't happen since joins snapshot before
  // reserving, but never guess) shows no team rather than borrowing the initiator's.
  if (p.pendingJoin && !p.cMoonId) return { cMoon: null, rank: null }
  const legacy = !p.cMoonId && participantCMoonId(raid, p) === raid.cMoonId
  return {
    cMoon: {
      id: participantCMoonId(raid, p) || null,
      name: p.cMoonName || (legacy ? raid.cMoonName : null) || null,
      color: p.cMoonColor || null,
      avatarPath: p.cMoonAvatarPath || null,
    },
    rank: p.rankName
      ? { name: p.rankName, tierName: p.rankTierName || null, tierLevel: p.rankTierLevel || 0, tierCount: p.rankTierCount || 0 }
      : null,
  }
}

// One open raid as the Raid Boss Lobby shows it — named after whoever started it. Only public
// display data: no pending actions, no enemy kit, no HP beyond what the raid page already shows.
export function buildRaidLobbyEntry(raid) {
  const participants = Array.from(raid.participants.values())
  const initiator = participants.find(p => p.isInitiator) || participants[0] || null
  return {
    id: raid.id,
    status: raid.status,
    name: `${raid.initiatorUsername || initiator?.username || 'Someone'}'s Raid`,
    initiatorUsername: raid.initiatorUsername || initiator?.username || null,
    enemyName: raid.enemyName,
    enemyImagePath: raid.enemyImagePath || null,
    enemyMaxHp: raid.enemyStats?.maxHp ?? null,
    minPriorDefeats: raid.enemyStats?.minPriorDefeats || 0,
    joinDeadlineAt: raid.joinDeadlineAt,
    roundNumber: raid.roundNumber,
    partySize: participants.length,
    maxPartySize: raid.maxParticipants || MAX_PARTY_SIZE,
    // The leader's "keep lobby open" choice, display-only here — see leaderKeepOpen's own shape
    // comment in cmoonRaidSocket.js. A lobby card shows it so a browsing player isn't misled by a
    // soon-looking countdown that the leader has actually paused.
    leaderKeepOpen: !!raid.leaderKeepOpen,
    participants: participants.map(p => ({
      userId: p.userId,
      username: p.username,
      isInitiator: !!p.isInitiator,
      ...publicParticipantTeam(raid, p),
    })),
  }
}

// The lobby list: FORMING raids with an open slot first (soonest-closing first, so the one about
// to start is on top), then raids already in combat as non-joinable context. A PRIVATE raid is
// never listed here at all — it only reaches players via its own URL (see CMoonEnemyRaid.isPrivate
// and this file's "Cross-cMoon raids" header comment's sibling, the private-raid comment in
// cmoonRaidSocket.js).
export function buildRaidLobby(raids) {
  const list = Array.from(raids).filter(r => !r.isPrivate && (r.status === 'FORMING' || r.status === 'IN_PROGRESS'))
  const joinable = list.filter(r => r.status === 'FORMING' && r.participants.size < (r.maxParticipants || MAX_PARTY_SIZE))
    .sort((a, b) => a.joinDeadlineAt - b.joinDeadlineAt)
  const rest = list.filter(r => !joinable.includes(r))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  return [...joinable, ...rest].map(buildRaidLobbyEntry)
}

// Rolls which (if any) of a raid boss's configured wind-up moves fires THIS round — each move's
// own occurrencePercent is an INDEPENDENT per-round chance (a different convention from
// CMoonEnemyMember.occurrencePercent's relative weight — see CMoonEnemyWindUpMove's own schema
// comment), checked in list order, first match wins, so overlapping percentages never need to sum
// to 100 and a later move's own roll never runs once an earlier one already hit. Returns null if
// none fire, meaning an ordinary round proceeds.
export function rollWindUpMove(moves) {
  if (!Array.isArray(moves) || !moves.length) return null
  for (const move of moves) {
    const chance = Math.max(0, Math.min(100, Number(move.occurrencePercent) || 0))
    if (chance > 0 && Math.random() * 100 < chance) return move
  }
  return null
}
