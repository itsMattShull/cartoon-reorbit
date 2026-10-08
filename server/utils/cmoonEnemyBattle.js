// server/utils/cmoonEnemyBattle.js
// Pure, server-only logic for the cMoon Enemy Battles mini-game (see prisma/schema.prisma's
// "cMoon Enemy Battles feature" section). Deliberately has NO Prisma/DB access — every function
// here takes plain values in and returns plain values out, so the actual combat math can be
// unit-tested directly (see tests/cmoonEnemyBattle.test.js) without a database, and so the API
// endpoints that DO touch the DB stay thin wrappers around this.
//
// The client never submits or is trusted for an outcome — only which of the 4 buttons it
// pressed. The enemy's action is always rolled here, server-side, via Math.random(), matching
// this codebase's other server-authoritative combat (see server/utils/monsterBattleEngine.js).

import { resolveMemberSoundPaths } from './cmoonEnemy.js'

export const PLAYER_MAX_HP = 5
export const MAX_ROUNDS_SAFETY = 100 // a battle can't loop forever even under a pathological RNG streak
export const ABANDON_AFTER_MINUTES = 10 // reclaim an IN_PROGRESS battle with no action in this long

export const NORMAL_HIT_DAMAGE = 1
export const CRITICAL_HIT_DAMAGE = 2
export const HEAL_ON_SUCCESSFUL_BLOCK = 1 // both sides use the same amount — see resolveBattleRound's playerBlocked/enemyBlocked

export const BATTLE_ACTIONS = ['ATTACK_HIGH', 'ATTACK_LOW', 'BLOCK_HIGH', 'BLOCK_LOW']

// A player's 5th possible submitted action — "spend this round firing your cMoon's special
// attack instead of attacking/blocking" (see CMoonSpecialAttack's own schema comment). Never
// rolled for the enemy and never counted in BATTLE_ACTIONS (isValidBattleAction stays exactly
// the 4 lane moves, used for the plain attack/block buttons) — isAttack/isBlock below both
// naturally return false for it, which is exactly the desired "neither attacks nor blocks this
// round" lane behavior, so resolveBattleRound needs no special-casing beyond accepting it.
export const SPECIAL_ACTION = 'SPECIAL_ATTACK'
// A forced stand-in for whichever side is paralyzed this round (see
// CMoonEnemyBattle.playerParalyzedTurns/enemyParalyzedTurns) — same "neither attacks nor blocks"
// shape as SPECIAL_ACTION, just logged under a distinct label so the round log/UI can tell
// "chose to use their special" apart from "was stunned and couldn't act at all".
export const PARALYZED_ACTION = 'PARALYZED'

// How many consecutive landed hits charge up a side's special attack — see
// CMoonEnemyBattle.playerHitStreak/enemyHitStreak's own schema comment.
export const HIT_STREAK_THRESHOLD = 3

export function isValidBattleAction(action) {
  return BATTLE_ACTIONS.includes(action)
}

// What action.post.js actually accepts from the client as this round's player action — the 4
// lane moves, or SPECIAL_ACTION (gated separately on battle.playerSpecialCharged there; this is
// purely a shape check). PARALYZED_ACTION is never client-submittable — it's a server-only
// override applied inside resolveRound below.
export function isValidPlayerSubmittedAction(action) {
  return isValidBattleAction(action) || action === SPECIAL_ACTION
}

function isKnownAction(action) {
  return isValidBattleAction(action) || action === SPECIAL_ACTION || action === PARALYZED_ACTION
}

// Combines the admin-configured site-wide default (GlobalGameConfig.cMoonEnemyBattleDefaultHp)
// with a player's own cMoon-rank bonus (CMoonRankTier.cMoonEnemyBattleHpBonus) into their actual
// max HP for a cMoon Enemy Battle — pure arithmetic, kept here (rather than inline in
// getPlayerCombatMaxHp() in server/utils/cmoon.js, which does the actual DB lookups for both
// inputs) so the one piece of this genuinely worth unit-testing can be, without dragging in that
// file's BullMQ/Prisma side effects (see tests/cmoonBalanceNoPrizeGrant.test.js's own comment on
// why cmoon.js can't just be imported in a test). Floored at 1 so a misconfigured negative bonus
// can never leave a player unable to take a single hit.
export function combinePlayerMaxHp(defaultHp, bonus) {
  return Math.max(1, (Number(defaultHp) || 0) + (Number(bonus) || 0))
}

function isAttack(action) { return action === 'ATTACK_HIGH' || action === 'ATTACK_LOW' }
function isBlock(action) { return action === 'BLOCK_HIGH' || action === 'BLOCK_LOW' }
function lane(action) { return action.endsWith('_HIGH') ? 'HIGH' : 'LOW' }

// One side's attack lands on the other UNLESS the other blocked the exact same lane. This is
// symmetric and applied independently for each side, so a round can produce 0, 1, or 2 hits:
//   - both attack (any lanes)              -> both take a hit (nothing blocked either attack)
//   - both block (any lanes)               -> no hits (nobody attacked)
//   - one attacks, other blocks same lane  -> cancelled, no hit
//   - one attacks, other blocks other lane -> the attack lands (blocking the wrong lane doesn't help)
function attackLands(attackerAction, defenderAction) {
  if (!isAttack(attackerAction)) return false
  if (isBlock(defenderAction) && lane(defenderAction) === lane(attackerAction)) return false
  return true
}

// The heart of the mini-game. Resolves one round given both sides' already-committed actions —
// call this AFTER both actions are known, never before (there's no hidden-information handling
// here; the caller is responsible for not revealing the enemy's action to the client before the
// player has locked in their own, if that matters to the UI).
//
// playerBlocked/enemyBlocked identify a genuinely SUCCESSFUL block — the other side actually
// attacked and this side's block stopped it (not merely "wasn't hit because nobody attacked
// either way", which mutual-block already covers via both being false). This is the trigger for
// the heal-on-successful-block mechanic (see action.post.js) — a side only heals for stopping a
// real attack, never for a round where neither side threw one.
export function resolveBattleRound(playerAction, enemyAction) {
  if (!isKnownAction(playerAction)) throw new Error(`Invalid player action: ${playerAction}`)
  if (!isKnownAction(enemyAction)) throw new Error(`Invalid enemy action: ${enemyAction}`)
  const playerHit = attackLands(enemyAction, playerAction)
  const enemyHit = attackLands(playerAction, enemyAction)
  return {
    playerHit,
    enemyHit,
    playerBlocked: isAttack(enemyAction) && !playerHit,
    enemyBlocked: isAttack(playerAction) && !enemyHit,
  }
}

// Rolls whether a landed hit is critical (2x damage) against the given member-configured chance
// (0-100, see CMoonEnemyMember.critChanceAgainstPercent/critChanceFromPercent) and returns the
// actual damage to apply. `hit` must already be known true — this never rolls a hit itself, only
// how hard an already-landed one strikes. Kept as a pure function (Math.random() aside) so the
// crit roll and the hit roll stay two clearly separate steps, each independently testable.
export function rollHitDamage(hit, critChancePercent) {
  if (!hit) return { damage: 0, isCrit: false }
  const chance = Number(critChancePercent) || 0
  const isCrit = chance > 0 && Math.random() * 100 < chance
  return { damage: isCrit ? CRITICAL_HIT_DAMAGE : NORMAL_HIT_DAMAGE, isCrit }
}

// Composes resolveBattleRound + rollHitDamage (x2) + the player's own HP transition into one
// step — everything a round needs EXCEPT the enemy's new HP, which is left to the caller since
// that differs by battle mode: a PER_PLAYER battle (or a preview, which is always solo) applies
// enemyDamage directly against its own enemyHpRemaining, while a SHARED_POOL battle instead runs
// an atomic conditional UPDATE against the live CMoonEnemyMember.currentHp (see action.post.js) —
// that DB-specific branch can't live in this DB-free file. Used by both the real battle endpoint
// and the admin preview endpoint (server/api/admin/cmoon-enemy-members/[id]/preview-action.post.js)
// so the two can never drift out of sync on the actual combat math.
// `playerAtkBonus`/`enemyAtkBonus` are each side's net special-attack-driven damage modifier
// (see CMoonEnemyBattle.playerAtkBonus/enemyAtkBonus's own schema comment) added to that side's
// OWN landed-hit damage, floored at 0 so a heavy LOWER_OPPONENT_ATTACK stack can never flip a hit
// into healing. `playerParalyzedTurns`/`enemyParalyzedTurns` are each side's CURRENT remaining
// stun count going into this round (already including anything a special attack applied THIS
// round before this call — see action.post.js's ordering) — a side with turns > 0 has its
// action forced to PARALYZED_ACTION regardless of what was submitted/rolled, then that count is
// decremented by 1 in the returned new*ParalyzedTurns (floored at 0), same "however many turns
// were left, one just elapsed" semantics whether this round was the one the paralysis was cast
// in or a later one.
export function resolveRound({
  playerAction, enemyMember, playerHpRemaining, playerMaxHp,
  playerAtkBonus = 0, enemyAtkBonus = 0, playerParalyzedTurns = 0, enemyParalyzedTurns = 0,
}) {
  const rolledEnemyAction = rollEnemyAction()
  const effectivePlayerAction = playerParalyzedTurns > 0 ? PARALYZED_ACTION : playerAction
  const effectiveEnemyAction = enemyParalyzedTurns > 0 ? PARALYZED_ACTION : rolledEnemyAction
  const { playerHit, enemyHit, playerBlocked, enemyBlocked } = resolveBattleRound(effectivePlayerAction, effectiveEnemyAction)
  // critChanceFromPercent is this enemy's own attacks landing critically against the player;
  // critChanceAgainstPercent is the player's attacks landing critically against this enemy — see
  // those columns' own schema comments.
  const { damage: playerDamageBase, isCrit: playerCrit } = rollHitDamage(playerHit, enemyMember.critChanceFromPercent)
  const { damage: enemyDamageBase, isCrit: enemyCrit } = rollHitDamage(enemyHit, enemyMember.critChanceAgainstPercent)
  // The ENEMY's own attack bonus/penalty applies to damage it deals (landing on the player); the
  // PLAYER's own applies to damage the player deals (landing on the enemy) — named from each
  // side's own schema comment.
  const playerDamage = playerHit ? Math.max(0, playerDamageBase + enemyAtkBonus) : 0
  const enemyDamage = enemyHit ? Math.max(0, enemyDamageBase + playerAtkBonus) : 0

  let newPlayerHp = playerHpRemaining
  if (playerHit) newPlayerHp = Math.max(0, newPlayerHp - playerDamage)
  // Capped at THIS player's own max HP, not the bare PLAYER_MAX_HP constant — see
  // GlobalGameConfig.cMoonEnemyBattleDefaultHp/CMoonRankTier.cMoonEnemyBattleHpBonus and
  // getPlayerCombatMaxHp() in server/utils/cmoon.js, which is what every real caller now computes
  // this from. Required, no default, so a caller can never silently fall back to the wrong cap.
  else if (playerBlocked) newPlayerHp = Math.min(playerMaxHp, newPlayerHp + HEAL_ON_SUCCESSFUL_BLOCK)

  return {
    roundEntry: {
      playerAction: effectivePlayerAction, enemyAction: effectiveEnemyAction,
      playerHit, enemyHit, playerBlocked, enemyBlocked, playerCrit, enemyCrit,
    },
    newPlayerHp,
    enemyDamage,
    enemyHit,
    enemyBlocked,
    newPlayerParalyzedTurns: Math.max(0, playerParalyzedTurns - 1),
    newEnemyParalyzedTurns: Math.max(0, enemyParalyzedTurns - 1),
  }
}

// The NPC's move for this round — uniform random among all 4 actions. No difficulty/bias knob
// today; every enemy member plays identically regardless of its configured HP. (An admin-tunable
// "aggression" weighting would be a natural, low-risk future extension of just this function.)
export function rollEnemyAction() {
  return BATTLE_ACTIONS[Math.floor(Math.random() * BATTLE_ACTIONS.length)]
}

// Rolls each reward row's dropChancePercent INDEPENDENTLY (not a normalized weighted pick) —
// zero, one, or several rows can hit on the same call. `rewardRows` is the raw
// CMoonEnemyReward[] as read from the DB (rewardType/ctoonId/avatarId/backgroundId/
// dropChancePercent/quantity/ctoon (with its own quantity+name for the supply cap, only present
// on CTOON rows)). Returns the subset that hit, unchanged — the caller turns these into a
// grantRewardInTx-shaped `reward` object.
export function rollEnemyRewards(rewardRows) {
  return (rewardRows || []).filter(row => {
    const chance = Number(row.dropChancePercent)
    if (!Number.isFinite(chance) || chance <= 0) return false
    return Math.random() * 100 < chance
  })
}

// Turns the rolled reward rows above into the `reward` bundle grantRewardInTx expects (plus a
// `points` field the caller sets separately, since that comes from the enemy member's own
// cMoonPointsReward, not a CMoonEnemyReward row). Kept as a pure mapping, separate from the
// rolling above, so a caller can log/display "here's what was rolled" before deciding to grant it.
// Shape sent to the client for an enemy the popup is offering a fight against (before any battle
// row exists) — never includes admin-only fields (reward tables, exact drop chances) since this
// reaches every logged-in player, not just admins.
//
// `member.faction.appearEffect` (when the caller's query included it) is trimmed to exactly the
// fields useFullscreenEffect().play()'s CUSTOM config expects — the same shape
// utils/cmoonJoinEffectDescriptor.js builds from a CMoon's own customJoinEffect — never the raw
// Prisma row (no id/createdAt/etc leaking to every logged-in player).
export function serializeEnemyForClient(member) {
  const hp = member.battleMode === 'SHARED_POOL' ? member.currentHp : member.maxHp
  const fx = member.faction?.appearEffect
  // A member's own null sound slot falls back to its faction's matching default — see
  // CMoonEnemyFaction's default*SoundPath columns and resolveMemberSoundPaths' own comment.
  const sounds = resolveMemberSoundPaths(member, member.faction)
  return {
    id: member.id,
    name: member.name,
    imagePath: member.imagePath || null,
    battleMode: member.battleMode,
    rank: member.rank,
    isRaidBoss: !!member.isRaidBoss,
    maxHp: member.maxHp,
    hp,
    // Named from the enemy's own perspective — see the schema comment on these columns.
    appearSoundPath: sounds.appearSoundPath,
    damageTakenSoundPath: sounds.damageTakenSoundPath,
    damageAvoidedSoundPath: sounds.damageAvoidedSoundPath,
    attackingSoundPath: sounds.attackingSoundPath,
    victorySoundPath: sounds.victorySoundPath,
    defeatSoundPath: sounds.defeatSoundPath,
    faction: member.faction
      ? {
          id: member.faction.id,
          name: member.faction.name,
          bannerImagePath: member.faction.bannerImagePath || null,
          battleMusicPath: member.faction.battleMusicPath || null,
          appearEffect: fx
            ? {
                backgroundColor: fx.backgroundColor,
                vignette: fx.vignette,
                imagePath: fx.imagePath,
                text: fx.text,
                textColor: fx.textColor,
                textPosition: fx.textPosition,
              }
            : null,
        }
      : null,
  }
}

// Shape sent to the client for an in-progress or just-resolved battle. `battle` must have its
// `enemyMember` (with `enemyMember.faction`) relation included by the caller, and — to surface
// the player's own special-attack button at all — its `cMoon` (with `cMoon.specialAttack`)
// relation too (both nullable: a battle with no cMoon, or whose cMoon has no attack assigned,
// simply never offers the button; see CMoonBattlePopupHost.vue's own v-if on this field).
export function serializeBattleForClient(battle) {
  const specialAttack = battle.cMoon?.specialAttack
  return {
    id: battle.id,
    status: battle.status,
    outcome: battle.outcome || null,
    roundNumber: battle.roundNumber,
    playerHpRemaining: battle.playerHpRemaining,
    playerMaxHp: battle.playerMaxHp,
    enemyHpRemaining: battle.enemyHpRemaining,
    pointsAwarded: battle.pointsAwarded || 0,
    rewardsGranted: battle.rewardsGranted || null,
    enemy: serializeEnemyForClient(battle.enemyMember),
    // Meter/charge state for the special-attack button — see
    // CMoonEnemyBattle.playerHitStreak/playerSpecialCharged's own schema comment.
    playerHitStreak: battle.playerHitStreak || 0,
    playerSpecialCharged: !!battle.playerSpecialCharged,
    // Rounds left where the player can't act at all (set by the enemy's own PARALYZE_OPPONENT
    // special) — surfaced so the UI can explain why their moves (including an already-charged
    // special) are about to whiff, rather than that just appearing to happen with no warning.
    playerParalyzedTurns: battle.playerParalyzedTurns || 0,
    playerSpecialAttack: specialAttack
      ? {
          id: specialAttack.id,
          name: specialAttack.name,
          description: specialAttack.description || null,
          effectType: specialAttack.effectType,
          amount: specialAttack.amount,
          soundPath: specialAttack.soundPath || null,
        }
      : null,
  }
}

export function buildGrantableReward(hitRewardRows) {
  const backgrounds = []
  const avatars = []
  const ctoons = []
  let points = 0
  for (const row of hitRewardRows) {
    if (row.rewardType === 'BACKGROUND' && row.backgroundId) backgrounds.push({ backgroundId: row.backgroundId })
    else if (row.rewardType === 'AVATAR' && row.avatarId) avatars.push({ avatarId: row.avatarId })
    else if (row.rewardType === 'CTOON' && row.ctoonId) {
      ctoons.push({
        ctoonId: row.ctoonId,
        quantity: Math.max(1, Number(row.quantity) || 1),
        ctoon: row.ctoon ? { quantity: row.ctoon.quantity, name: row.ctoon.name } : undefined,
      })
    // Plain site points (User.points via grantRewardInTx, which already reads a bare `points`
    // number off this same bundle) — summed across every hit POINTS row into the one total
    // grantRewardInTx expects, same as several independent CTOON rows each contribute their own
    // entry to the `ctoons` list above.
    } else if (row.rewardType === 'POINTS') {
      points += Math.max(0, Number(row.quantity) || 0)
    }
  }
  return { backgrounds, avatars, ctoons, points }
}
