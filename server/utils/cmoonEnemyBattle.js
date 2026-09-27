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
export function resolveBattleRound(playerAction, enemyAction) {
  if (!isValidBattleAction(playerAction)) throw new Error(`Invalid player action: ${playerAction}`)
  if (!isValidBattleAction(enemyAction)) throw new Error(`Invalid enemy action: ${enemyAction}`)
  return {
    playerHit: attackLands(enemyAction, playerAction),
    enemyHit: attackLands(playerAction, enemyAction),
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
export function serializeEnemyForClient(member) {
  const hp = member.battleMode === 'SHARED_POOL' ? member.currentHp : member.maxHp
  return {
    id: member.id,
    name: member.name,
    imagePath: member.imagePath || null,
    battleMode: member.battleMode,
    maxHp: member.maxHp,
    hp,
    faction: member.faction
      ? { id: member.faction.id, name: member.faction.name, bannerImagePath: member.faction.bannerImagePath || null }
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
  for (const row of hitRewardRows) {
    if (row.rewardType === 'BACKGROUND' && row.backgroundId) backgrounds.push({ backgroundId: row.backgroundId })
    else if (row.rewardType === 'AVATAR' && row.avatarId) avatars.push({ avatarId: row.avatarId })
    else if (row.rewardType === 'CTOON' && row.ctoonId) {
      ctoons.push({
        ctoonId: row.ctoonId,
        quantity: Math.max(1, Number(row.quantity) || 1),
        ctoon: row.ctoon ? { quantity: row.ctoon.quantity, name: row.ctoon.name } : undefined,
      })
    }
  }
  return { backgrounds, avatars, ctoons }
}
