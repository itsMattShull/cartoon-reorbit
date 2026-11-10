// server/utils/cmoonPvp.js
// Pure, DB-free combat math for cMoon PvP — the live team-vs-team sibling of
// server/utils/cmoonEnemyRaid.js (the raid-boss co-op mode). Adds nothing new to how a single hit/
// block resolves (still isAttack/isBlock/attackLands/rollHitDamage from cmoonEnemyBattle.js, reused
// unchanged) — what's new here is that PvP has no boss: every attacker on EITHER side is randomly
// assigned one currently-alive opponent each round (uniform random, not weighted toward low HP —
// keeps it feeling chaotic rather than mechanically "finish the weak one") before that per-pair hit
// math runs, instead of raid's one-shared-boss-action-vs-every-participant shape.
//
// Actual live state (who's connected, timers, DB writes, Discord/notifications) lives in
// server/utils/cmoonPvpSocket.js — same split cmoonEnemyRaid.js/cmoonRaidSocket.js already use.
//
// ── Why NOT resolveBattleRound for the per-attacker hit check ────────────────────────────────
// resolveBattleRound(playerAction, enemyAction) returns BOTH directions at once (did the player hit
// the enemy AND did the enemy hit the player back) — correct for raid, where "the enemy" really is
// one shared action every participant faces symmetrically. It is WRONG here: an attacker's randomly
// -assigned target may themselves be attacking a completely different third player this round, so
// "did my target's own action also land on me" is not a meaningful question — only the
// one-directional "did THIS attacker's hit land on THIS specific defender" is. attackLands (now
// exported from cmoonEnemyBattle.js for this reason) is the right primitive: called once per
// (attacker, assigned defender) pair.
//
// ── Special attacks in PvP (see CMoonSpecialAttack's own schema comment for the full effectType
// catalog) — same per-participant-vs-team-wide split raid already draws, mapped onto two symmetric
// sides instead of "the party" vs "the boss":
//   DAMAGE_OPPONENT, POISON_OPPONENT, SIPHON_HEALTH -> single random alive opponent, never AoE —
//     raid's AoE amounts were tuned for "boss vs. a scaled-up party," which would be absurdly
//     strong applied symmetrically at PvP's 1-of-N-vs-1-of-N scale. POISON_OPPONENT sets the
//     target's own per-participant poisonAmount/poisonTurnsRemaining — the exact field raid's party
//     side already carries, just genuinely symmetric now (both sides have it).
//   HEAL_SELF           -> caster only, or the caster's WHOLE TEAM if healsAllies.
//   PARALYZE_OPPONENT, LOWER_OPPONENT_ATTACK, RAISE_ALLY_ATTACK, SHIELD_PARTY -> team-wide, same
//     stacking rules raid already has (paralyze/raise non-stacking + one-shot-or-timed, lower-attack
//     permanent + stacking, shield one round) — just symmetric fields on BOTH sides now instead of
//     only "the party" having them.
//   REFLECT_DAMAGE, SIPHON_HEALTH -> ALWAYS deferred to "step 2.5" (unlike raid, where only a
//     PLAYER-side cast defers — raid's boss-cast applies immediately because step 3's boss auto-fire
//     already runs AFTER the round's real outcome exists). PvP has no such asymmetry: BOTH teams
//     cast in step 1, before the lane exchange, so EITHER side's reflect/siphon must wait for the
//     round's real outcome (and for a same-round PARALYZE_OPPONENT cast by the other side to have
//     already taken effect — see resolveRaidRound's own "effective enemy action" comment, which
//     applies here identically) before it can know what actually happened. roundGuards is keyed per
//     CASTER TEAM (not one shared slot) since both sides can cast the same round.
export {
  isAttack, isBlock, isKnownAction, attackLands, rollHitDamage,
  PLAYER_MAX_HP, HEAL_ON_SUCCESSFUL_BLOCK, HIT_STREAK_THRESHOLD, NORMAL_HIT_DAMAGE,
  PARALYZED_ACTION, SPECIAL_ACTION,
} from './cmoonEnemyBattle.js'
import {
  isAttack, isBlock, attackLands, rollHitDamage,
  PLAYER_MAX_HP, HEAL_ON_SUCCESSFUL_BLOCK, NORMAL_HIT_DAMAGE,
} from './cmoonEnemyBattle.js'
// Point-splitting is already a pure, ID-agnostic function — reused verbatim rather than forked
// (see this feature's own header comment on why team tournaments get a new parallel schema but
// NOT a new copy of logic that's already generic).
export { splitRaidPoints as splitPvpPoints } from './cmoonEnemyRaid.js'

// FORMING -> auto-starts whoever has joined. Only the hardcoded fallback — live code reads
// GlobalGameConfig.cMoonPvpJoinWindowSeconds instead (see cmoonpvp:start in cmoonPvpSocket.js).
export const JOIN_WINDOW_SECONDS = 60
// Same role as cmoonEnemyRaid.js's own ROUND_TIMEOUT_SECONDS.
export const ROUND_TIMEOUT_SECONDS = 15
// Fallback only — GlobalGameConfig.cMoonPvpMaxTeamSize (1-8) governs a live match's per-side cap.
export const MAX_TEAM_SIZE = 4
// Fallback only — GlobalGameConfig.cMoonPvpRoundLimit (default 300) governs a live match's round
// safety valve.
export const PVP_ROUND_LIMIT_SAFETY = 300

const TEAMS = ['A', 'B']
function otherTeam(team) { return team === 'A' ? 'B' : 'A' }

// Every living attacker's own randomly-assigned target this round, uniform-random among the
// OPPOSING team's currently-alive members (never self, never a teammate). `participants` is the
// alive-at-round-start snapshot: [{ userId, team, action }], action already paralysis-overridden
// by the caller (same "caller substitutes PARALYZED_ACTION before calling" contract
// resolveRaidRound's own header comment documents — a paralyzed attacker's action is never an
// attack, so isAttack already filters them out for free). A participant with no opposing-team
// survivor to target (shouldn't happen mid-round — a match resolves the instant one side hits
// zero survivors, checked at the END of closeRound, never mid-resolution) is defensively skipped
// rather than throwing. Returns Map<attackerUserId, targetUserId>.
export function assignPvpTargets(participants) {
  const byTeam = { A: [], B: [] }
  for (const p of participants) byTeam[p.team].push(p.userId)
  const targets = new Map()
  for (const p of participants) {
    if (!isAttack(p.action)) continue
    const pool = byTeam[otherTeam(p.team)]
    if (!pool.length) continue
    targets.set(p.userId, pool[Math.floor(Math.random() * pool.length)])
  }
  return targets
}

// One round's symmetric lane exchange — the PvP equivalent of resolveRaidRound, generalized from
// "one shared enemy action vs. every participant's own choice" to "every attacker vs. their own
// randomly-assigned opponent" (see this file's own header comment for why that can't reuse
// resolveBattleRound's bidirectional shape). `participants` is the alive-at-round-start snapshot:
// [{ userId, team, action, hpRemaining, maxHp }], action already paralysis-overridden.
// `targetsByUserId` comes from assignPvpTargets above. `teamAtkBonusByTeam`/`teamShieldedByTeam`
// are `{ A, B }` — the CALLER (cmoonPvpSocket.js) is responsible for combining each team's
// permanent atk-bonus accumulator with its currently-active atk-raise amount before calling, same
// "caller pre-combines" contract resolveRaidRound's own partyAtkBonus/enemyAtkBonus params take.
//
// Every attacker's hit is resolved against pre-round HP and accumulated into a per-defender damage
// map BEFORE any of it is applied — multiple attackers can land on the same defender in one round
// (emergent focus-fire, no extra rule needed), and applying damage pairing-by-pairing would make a
// defender's own fate depend on iteration order, which must never matter. A block that stops at
// least one incoming attack this round heals HEAL_ON_SUCCESSFUL_BLOCK once (not once per attack
// blocked) — the natural minimal generalization of raid's own "a block heals you once per round,"
// since raid never had more than one incoming attack per round to even raise the question.
export function resolvePvpRound({ participants, targetsByUserId, teamAtkBonusByTeam = { A: 0, B: 0 }, teamShieldedByTeam = { A: false, B: false } }) {
  const byId = new Map(participants.map(p => [p.userId, p]))
  const damageByDefenderId = new Map()
  const blockedByDefenderId = new Set()
  // defenderId -> [attackerId, ...] who actually landed damage on them THIS round — REFLECT_DAMAGE's
  // own "reflect onto one random attacker who hit me" target pool (see applyPvpReflectDamage).
  const hittersByDefenderId = new Map()
  const attackRowById = new Map()

  for (const p of participants) {
    if (!isAttack(p.action)) continue
    const targetId = targetsByUserId.get(p.userId)
    const target = targetId ? byId.get(targetId) : null
    if (!target) continue // no living opponent to target -- defensive, see this function's own header comment
    const hit = attackLands(p.action, target.action)
    if (!hit) {
      blockedByDefenderId.add(target.userId)
      attackRowById.set(p.userId, { targetUserId: target.userId, hit: false, damageDealt: 0 })
      continue
    }
    // Players' own damage is always flat (never crit, never admin-configurable) — the same
    // convention solo/raid already follow for PLAYER-dealt damage (rollHitDamage's own `baseDamage`
    // default): only a BOSS has a configurable baseDamage/crit chance anywhere in this engine, and
    // PvP has no boss on either side, so there is no admin-configured "this player's own crit
    // chance" stat to roll against. Specials remain the tactical damage swing, same as everywhere
    // else in this game.
    const damage = Math.max(0, NORMAL_HIT_DAMAGE + (teamAtkBonusByTeam[p.team] || 0))
    const applied = teamShieldedByTeam[target.team] ? 0 : damage
    if (applied > 0) {
      damageByDefenderId.set(target.userId, (damageByDefenderId.get(target.userId) || 0) + applied)
      if (!hittersByDefenderId.has(target.userId)) hittersByDefenderId.set(target.userId, [])
      hittersByDefenderId.get(target.userId).push(p.userId)
    }
    attackRowById.set(p.userId, { targetUserId: target.userId, hit: true, damageDealt: applied })
  }

  const perParticipant = participants.map(p => {
    const row = attackRowById.get(p.userId) || { targetUserId: null, hit: false, damageDealt: 0 }
    const damageTaken = damageByDefenderId.get(p.userId) || 0
    const blocked = blockedByDefenderId.has(p.userId)
    let newHp = Math.max(0, p.hpRemaining - damageTaken)
    if (blocked) newHp = Math.min(p.maxHp || PLAYER_MAX_HP, newHp + HEAL_ON_SUCCESSFUL_BLOCK)
    return {
      userId: p.userId, team: p.team, action: p.action, targetUserId: row.targetUserId,
      hit: row.hit, damageDealt: row.damageDealt, damageTaken, blocked,
      hpRemaining: newHp, knockedOut: newHp <= 0,
    }
  })

  return { perParticipant, hittersByDefenderId }
}

// Applies one fired special's non-deferred effect in place against the match's shared state — the
// PvP sibling of applyRaidSpecialAttack, same "mutate the live objects directly" convention
// (`aliveByTeam.A`/`.B` must be the SAME live participant objects cmoonPvpSocket.js's own
// `match.participants` Map holds, not copies). `caster` is `{ team, userId }`.
//
// `context`: `{ roundGuards, roundInfo, teamShieldedByTeam }` — see this file's header comment for
// why REFLECT_DAMAGE/SIPHON_HEALTH ALWAYS defer here (into `roundGuards`, keyed per caster TEAM)
// regardless of which side cast them, unlike raid's player-only deferral.
export function applyPvpSpecialAttack(match, aliveByTeam, attack, caster, specialEvents, context = {}) {
  const { roundGuards = null, teamShieldedByTeam = { A: false, B: false } } = context
  const team = caster.team
  const opposing = otherTeam(team)
  const event = {
    team, userId: caster.userId, name: attack.name, effectType: attack.effectType,
    amount: attack.amount, soundPath: attack.soundPath || null,
    username: match.participants.get(caster.userId)?.username || null,
  }
  specialEvents.push(event)
  // Accuracy rolls FIRST, before any effect branch — a miss is a miss regardless of what else
  // would have happened, same as raid. A missed REFLECT_DAMAGE/SIPHON_HEALTH is never even queued.
  const accuracy = Math.max(0, Math.min(100, Number(attack.accuracyPercent ?? 100)))
  if (Math.random() * 100 >= accuracy) { event.missed = true; return }

  if (attack.effectType === 'DAMAGE_OPPONENT') {
    if (teamShieldedByTeam[opposing]) { event.fizzled = true; return }
    const target = randomAlive(aliveByTeam[opposing])
    if (!target) { event.fizzled = true; return }
    event.targetUserId = target.userId
    target.hpRemaining = Math.max(0, target.hpRemaining - attack.amount)
    if (target.hpRemaining <= 0 && !target.knockedOutAt) target.knockedOutAt = Date.now()
  } else if (attack.effectType === 'POISON_OPPONENT') {
    if (teamShieldedByTeam[opposing]) { event.fizzled = true; return }
    const target = randomAlive(aliveByTeam[opposing])
    if (!target) { event.fizzled = true; return }
    event.targetUserId = target.userId
    // Refresh, not stack -- same convention as every other poison cast in this game.
    target.poisonAmount = attack.amount
    target.poisonTurnsRemaining = attack.poisonDurationRounds
  } else if (attack.effectType === 'HEAL_SELF') {
    if (attack.healsAllies) {
      // `aliveByTeam[team]` is a snapshot taken once before step 1's whole loop runs — a teammate
      // killed earlier THIS SAME round by an opposing DAMAGE_OPPONENT (processed first in join
      // order) is still in it. Without this check they'd get healed back to positive HP while
      // knockedOutAt stays set, leaving a knocked-out participant with a nonzero HP bar in the
      // match's own persisted/broadcast state — same guard SIPHON_HEALTH's own healsAllies branch
      // below already applies.
      for (const p of aliveByTeam[team]) { if (!p.knockedOutAt) p.hpRemaining = Math.min(p.maxHp, p.hpRemaining + attack.amount) }
    } else {
      const casterP = match.participants.get(caster.userId)
      if (casterP && !casterP.knockedOutAt) casterP.hpRemaining = Math.min(casterP.maxHp, casterP.hpRemaining + attack.amount)
    }
  } else if (attack.effectType === 'PARALYZE_OPPONENT') {
    // Non-stacking, same as raid: a cast landing while the opposing team is already paralyzed has
    // no additional effect — it never extends or layers a second paralysis.
    const key = `team${opposing}ParalyzedTurns`
    if ((match[key] || 0) <= 0) match[key] = attack.amount
  } else if (attack.effectType === 'LOWER_OPPONENT_ATTACK') {
    // Permanent, stacking across casts, same as raid's own non-duration effects.
    const key = `team${opposing}AtkBonus`
    match[key] = (match[key] || 0) - attack.amount
  } else if (attack.effectType === 'RAISE_ALLY_ATTACK') {
    // Non-stacking and time-limited, same as raid: a cast while one is already active is a no-op.
    const turnsKey = `team${team}AtkRaiseTurnsRemaining`
    if ((match[turnsKey] || 0) <= 0) {
      match[`team${team}AtkRaiseAmount`] = attack.amount
      match[turnsKey] = attack.raiseDurationRounds
    }
  } else if (attack.effectType === 'REFLECT_DAMAGE') {
    // Always deferred -- see this file's own header comment.
    if (roundGuards?.reflectUsedByTeam?.[team]) return
    if (roundGuards) {
      roundGuards.reflectUsedByTeam[team] = true
      roundGuards.pendingReflectByTeam[team] = { attack, caster, event }
    }
  } else if (attack.effectType === 'SIPHON_HEALTH') {
    if (roundGuards?.siphonUsedByTeam?.[team]) return
    if (roundGuards) {
      roundGuards.siphonUsedByTeam[team] = true
      roundGuards.pendingSiphonByTeam[team] = { attack, caster, event }
    }
  } else if (attack.effectType === 'CLEANSE_SELF') {
    // Cures the caster's own TEAM's shared paralysis (always the whole team, same "no per-player
    // partial cure" reasoning raid's own team-wide paralysis counter already has) and poison (self
    // only, unless healsAllies -- whole team), with an optional HP top-up on whoever's poison just
    // cleared.
    match[`team${team}ParalyzedTurns`] = 0
    if (attack.healsAllies) {
      // Same stale-snapshot guard as HEAL_SELF's own healsAllies branch above — a teammate already
      // knocked out earlier this same round must not get revived by the HP top-up.
      for (const p of aliveByTeam[team]) {
        if (p.knockedOutAt) continue
        p.poisonAmount = 0; p.poisonTurnsRemaining = 0
        if (attack.cleanseAlsoHeals) p.hpRemaining = Math.min(p.maxHp, p.hpRemaining + attack.amount)
      }
    } else {
      const casterP = match.participants.get(caster.userId)
      if (casterP && !casterP.knockedOutAt) {
        casterP.poisonAmount = 0; casterP.poisonTurnsRemaining = 0
        if (attack.cleanseAlsoHeals) casterP.hpRemaining = Math.min(casterP.maxHp, casterP.hpRemaining + attack.amount)
      }
    }
  } else if (attack.effectType === 'REVIVE_ALLY') {
    // Symmetric for either team, unlike raid's own PLAYER-only branch (PvP has no boss/enemy side
    // at all to exclude) — see CMoonSpecialAttackEffectType.REVIVE_ALLY's own schema comment.
    // Pulled from match.participants directly, NOT aliveByTeam[team] -- aliveByTeam is this
    // round's pre-step-1 ALIVE snapshot, which by definition excludes anyone knocked out, so it
    // can never contain a revive target.
    const knockedOut = Array.from(match.participants.values()).filter(p => p.team === team && p.knockedOutAt)
    if (!knockedOut.length) {
      event.fizzled = true
    } else {
      const targets = attack.healsAllies ? knockedOut : [knockedOut[Math.floor(Math.random() * knockedOut.length)]]
      for (const p of targets) {
        p.knockedOutAt = null
        p.hpRemaining = Math.max(1, Math.min(p.maxHp, attack.amount))
        // Clean slate, not a frozen-at-death snapshot -- same reasoning a freshly-joined
        // participant starts from.
        p.poisonAmount = 0; p.poisonTurnsRemaining = 0
        p.hitStreak = 0; p.specialCharged = false
        p.pendingAction = null
      }
      if (targets.length === 1) event.targetUserId = targets[0].userId
    }
  }
  // SHIELD_PARTY has no branch here at all -- the cast above already pushed/announced the event,
  // and that's everything this function needs to do. The actual effect (negating this round's
  // incoming damage for the caster's whole team) is read back out of `specialEvents` by
  // cmoonPvpSocket.js's own closeRound, same as raid's own partyShielded -- never persisted match
  // state, computed fresh every round.
}

// `pool` (an `aliveByTeam[...]` array) is a snapshot taken once before step 1's whole loop runs,
// so by the time a LATER special in that same loop calls this, an earlier special this same round
// may already have knocked someone in it out — re-filtered here rather than trusting membership,
// so DAMAGE_OPPONENT/POISON_OPPONENT/SIPHON_HEALTH can never target (and silently waste a special
// on) a corpse when a genuinely alive opponent exists.
function randomAlive(pool) {
  const candidates = (pool || []).filter(p => !p.knockedOutAt)
  if (!candidates.length) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// Applies one already-cast REFLECT_DAMAGE's numeric effect, given this round's REAL outcome
// (`roundInfo`, the exact shape resolvePvpRound returns, with the lane-exchange HP already applied
// onto the live participant objects by the caller -- see this file's header comment on deferral).
// Reflects `reflectPercent`% of the damage the CASTER personally took this round onto ONE randomly
// -chosen attacker who actually landed a hit on them (if nobody hit the caster this round, there's
// nothing to reflect). Exported separately so cmoonPvpSocket.js's own "step 2.5" can apply a queued
// cast without re-pushing its specialEvent a second time.
export function applyPvpReflectDamage(match, attack, caster, roundInfo, event = null) {
  const casterRow = roundInfo.perParticipant.find(r => r.userId === caster.userId)
  const incoming = casterRow?.damageTaken || 0
  const reflected = Math.round(incoming * attack.reflectPercent / 100)
  if (event) event.fizzled = reflected <= 0
  if (reflected <= 0) return
  const hitters = roundInfo.hittersByDefenderId.get(caster.userId) || []
  if (!hitters.length) { if (event) event.fizzled = true; return }
  const targetId = hitters[Math.floor(Math.random() * hitters.length)]
  const target = match.participants.get(targetId)
  if (!target) return
  if (event) event.targetUserId = targetId
  target.hpRemaining = Math.max(0, target.hpRemaining - reflected)
  if (target.hpRemaining <= 0 && !target.knockedOutAt) target.knockedOutAt = Date.now()
}

// Applies one already-cast SIPHON_HEALTH's numeric effect. Targets ONE random currently-alive
// opponent (same single-target convention as DAMAGE_OPPONENT/POISON_OPPONENT's own cast-time pick
// above) and fizzles outright if THAT specific target's own submitted action this round was a
// block -- the one effect in this game that a block can stop outright, same rule raid's own
// SIPHON_HEALTH already follows, just checked against one specific player instead of a shared boss
// action. `roundInfo` gives access to every participant's own effective action this round.
export function applyPvpSiphonHealth(match, aliveByTeam, attack, caster, roundInfo, event = null) {
  const opposing = otherTeam(caster.team)
  const target = randomAlive(aliveByTeam[opposing])
  if (!target) { if (event) event.fizzled = true; return }
  if (event) event.targetUserId = target.userId
  const targetRow = roundInfo.perParticipant.find(r => r.userId === target.userId)
  const blockedOutright = isBlock(targetRow?.action)
  if (event) event.fizzled = blockedOutright
  if (blockedOutright) return
  target.hpRemaining = Math.max(0, target.hpRemaining - attack.amount)
  if (target.hpRemaining <= 0 && !target.knockedOutAt) target.knockedOutAt = Date.now()
  const heal = Math.round(attack.amount * attack.siphonPercent / 100)
  if (heal <= 0) return
  if (attack.healsAllies) {
    for (const p of aliveByTeam[caster.team]) { if (!p.knockedOutAt) p.hpRemaining = Math.min(p.maxHp, p.hpRemaining + heal) }
  } else {
    const casterP = match.participants.get(caster.userId)
    if (casterP && !casterP.knockedOutAt) casterP.hpRemaining = Math.min(casterP.maxHp, casterP.hpRemaining + heal)
  }
}

// One open PvP match as the lobby shows it — named after whoever started it. Only public display
// data, mirroring buildRaidLobbyEntry's own scope.
export function buildPvpLobbyEntry(match) {
  const participants = Array.from(match.participants.values())
  const initiator = participants.find(p => p.isInitiator) || participants[0] || null
  return {
    id: match.id,
    status: match.status,
    name: `${match.initiatorUsername || initiator?.username || 'Someone'}'s PvP Match`,
    initiatorUsername: match.initiatorUsername || initiator?.username || null,
    joinDeadlineAt: match.joinDeadlineAt,
    roundNumber: match.roundNumber,
    maxTeamSize: match.maxTeamSize || MAX_TEAM_SIZE,
    teamASize: participants.filter(p => p.team === 'A').length,
    teamBSize: participants.filter(p => p.team === 'B').length,
    teamACMoonId: match.teamACMoonId || null,
    teamBCMoonId: match.teamBCMoonId || null,
    leaderKeepOpen: !!match.leaderKeepOpen,
  }
}

// The lobby list: FORMING matches with an open slot on either side first (soonest-closing first),
// then matches already in combat as non-joinable context. A PRIVATE match is never listed here —
// same discoverability-only semantics as CMoonEnemyRaid.isPrivate.
export function buildPvpLobby(matches) {
  const list = Array.from(matches).filter(m => !m.isPrivate && (m.status === 'FORMING' || m.status === 'IN_PROGRESS'))
  const joinable = list.filter(m => {
    if (m.status !== 'FORMING') return false
    const cap = m.maxTeamSize || MAX_TEAM_SIZE
    const participants = Array.from(m.participants.values())
    return participants.filter(p => p.team === 'A').length < cap || participants.filter(p => p.team === 'B').length < cap
  }).sort((a, b) => a.joinDeadlineAt - b.joinDeadlineAt)
  const rest = list.filter(m => !joinable.includes(m)).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  return [...joinable, ...rest].map(buildPvpLobbyEntry)
}

export { TEAMS }
