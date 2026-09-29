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

export const PLAYER_MAX_HP = 5
export const MAX_ROUNDS_SAFETY = 100 // a battle can't loop forever even under a pathological RNG streak
export const ABANDON_AFTER_MINUTES = 10 // reclaim an IN_PROGRESS battle with no action in this long

export const NORMAL_HIT_DAMAGE = 1
export const CRITICAL_HIT_DAMAGE = 2
export const HEAL_ON_SUCCESSFUL_BLOCK = 1 // both sides use the same amount — see resolveBattleRound's playerBlocked/enemyBlocked

export const BATTLE_ACTIONS = ['ATTACK_HIGH', 'ATTACK_LOW', 'BLOCK_HIGH', 'BLOCK_LOW']

export function isValidBattleAction(action) {
  return BATTLE_ACTIONS.includes(action)
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
  if (!isValidBattleAction(playerAction)) throw new Error(`Invalid player action: ${playerAction}`)
  if (!isValidBattleAction(enemyAction)) throw new Error(`Invalid enemy action: ${enemyAction}`)
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
  return {
    id: member.id,
    name: member.name,
    imagePath: member.imagePath || null,
    battleMode: member.battleMode,
    maxHp: member.maxHp,
    hp,
    // Named from the enemy's own perspective — see the schema comment on these columns.
    appearSoundPath: member.appearSoundPath || null,
    damageTakenSoundPath: member.damageTakenSoundPath || null,
    damageAvoidedSoundPath: member.damageAvoidedSoundPath || null,
    attackingSoundPath: member.attackingSoundPath || null,
    victorySoundPath: member.victorySoundPath || null,
    defeatSoundPath: member.defeatSoundPath || null,
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
// `enemyMember` (with `enemyMember.faction`) relation included by the caller.
export function serializeBattleForClient(battle) {
  return {
    id: battle.id,
    status: battle.status,
    outcome: battle.outcome || null,
    roundNumber: battle.roundNumber,
    playerHpRemaining: battle.playerHpRemaining,
    enemyHpRemaining: battle.enemyHpRemaining,
    pointsAwarded: battle.pointsAwarded || 0,
    rewardsGranted: battle.rewardsGranted || null,
    enemy: serializeEnemyForClient(battle.enemyMember),
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
