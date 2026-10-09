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
  resolveBattleRound, rollHitDamage, rollEnemyAction, rollEnemyRewards,
  isValidBattleAction, isKnownAction, PLAYER_MAX_HP, HEAL_ON_SUCCESSFUL_BLOCK,
  SPECIAL_ACTION, PARALYZED_ACTION, HIT_STREAK_THRESHOLD,
} from './cmoonEnemyBattle.js'

export { rollEnemyAction, rollEnemyRewards, isValidBattleAction, PLAYER_MAX_HP, SPECIAL_ACTION, PARALYZED_ACTION, HIT_STREAK_THRESHOLD }

export const JOIN_WINDOW_SECONDS = 60 // FORMING -> auto-starts combat, whoever has joined by then
export const ROUND_TIMEOUT_SECONDS = 20 // an alive participant who hasn't acted by this auto-acts
export const MAX_PARTY_SIZE = 4 // initiator + up to 3 joiners
export const MAX_ROUNDS_SAFETY = 100 // same runaway-RNG safety valve as a solo battle

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
    }
  })

  return { enemyAction, perParticipant, enemyDamageDealt }
}
