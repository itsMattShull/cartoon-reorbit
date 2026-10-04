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

import {
  resolveBattleRound, rollHitDamage, rollEnemyAction, rollEnemyRewards,
  isValidBattleAction, PLAYER_MAX_HP, HEAL_ON_SUCCESSFUL_BLOCK,
} from './cmoonEnemyBattle.js'

export { rollEnemyAction, rollEnemyRewards, isValidBattleAction, PLAYER_MAX_HP }

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
export function checkRaidBossAvailability({ raidOneTime, raidCooldownMinutes, raidDefeatedAt }, now = Date.now()) {
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
export function resolveRaidRound({ enemyAction, enemyMember, participants }) {
  if (!isValidBattleAction(enemyAction)) throw new Error(`Invalid enemy action: ${enemyAction}`)

  let enemyDamageDealt = 0
  const perParticipant = participants.map(({ userId, action, hpRemaining, maxHp }) => {
    if (!isValidBattleAction(action)) throw new Error(`Invalid action for ${userId}: ${action}`)
    const { playerHit, enemyHit, playerBlocked, enemyBlocked } = resolveBattleRound(action, enemyAction)
    // critChanceFromPercent is the enemy's own attack landing critically against A player;
    // critChanceAgainstPercent is a player's attack landing critically against the enemy — same
    // naming as the solo battle, see CMoonEnemyMember's own schema comment on these columns.
    const { damage: playerDamage, isCrit: playerCrit } = rollHitDamage(playerHit, enemyMember.critChanceFromPercent)
    const { damage: enemyDamage, isCrit: enemyCrit } = rollHitDamage(enemyHit, enemyMember.critChanceAgainstPercent)

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
