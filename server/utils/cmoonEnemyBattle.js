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

// Hardcoded fallback for GlobalGameConfig.cMoonEnemyBattleStartingStamina, same role
// PLAYER_MAX_HP plays for cMoonEnemyBattleDefaultHp — only used if that config row is ever
// unexpectedly missing.
export const STARTING_STAMINA = 3

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

// Fields needed off a CMoonSpecialAttack to decide/serialize "which one applies" — shared by every
// Prisma `select`/`include` that loads a chosenSpecialAttack relation (action.post.js,
// cmoonRaidSocket.js's resolveEffectiveSpecialAttack) so they can't drift from
// pickEffectiveSpecialAttack's own expectations below.
export const SPECIAL_ATTACK_SELECT = {
  id: true, name: true, description: true, effectType: true, amount: true, raiseDurationRounds: true,
  reflectPercent: true, siphonPercent: true, soundPath: true, healsAllies: true, playerChoice: true,
  poisonDurationRounds: true, cleanseAlsoHeals: true, requiredHitStreak: true, accuracyPercent: true,
  pvpEligible: true,
}

// A player's EFFECTIVE special attack for a cMoon Enemy Battle (solo or raid): `chosenSpecialAttack`
// (their own User.chosenSpecialAttack, already loaded by the caller) if it still has
// CMoonSpecialAttack.playerChoice = true — re-checked HERE, never trusted from a stale FK alone,
// since an admin can flip playerChoice off (or delete/reassign the attack) at any time after a
// player chose it — else `cMoonSpecialAttack` (the team's own assigned special), same as before
// player-choice existed. Pure/synchronous and DB-free, matching this whole file's own discipline:
// both special attacks must already be loaded by the caller (one Prisma query with both relations
// included), so resolving this never costs an extra round-trip on a hot path like a solo battle's
// own serializeBattleForClient. server/utils/cmoon.js's resolveEffectiveSpecialAttack is the
// async wrapper for a caller that doesn't already have chosenSpecialAttack loaded.
export function pickEffectiveSpecialAttack(chosenSpecialAttack, cMoonSpecialAttack) {
  if (chosenSpecialAttack?.playerChoice) return chosenSpecialAttack
  return cMoonSpecialAttack || null
}

// Weighted random pick among a list of { ...CMoonSpecialAttack fields, usePercent } — same
// "relative weight, not a percent out of 100, never required to sum to 100" semantics as
// CMoonEnemyMember.occurrencePercent (see pickWeightedEnemy in cmoonEnemy.js, which this mirrors
// exactly for a different candidate shape). A non-positive/non-finite usePercent floors to 1
// rather than being excluded outright — a misconfigured 0 should still be reachable, just rare,
// not silently impossible to ever fire.
export function pickWeightedSpecialAttack(candidates) {
  if (!candidates?.length) return null
  const weights = candidates.map(c => {
    const w = Number(c.usePercent)
    return Number.isFinite(w) && w > 0 ? w : 1
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  let roll = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

// This enemy MEMBER's own configured special-attack overrides (CMoonEnemyMemberSpecialAttack),
// in the { ...attack, usePercent } shape pickWeightedSpecialAttack expects — `[]` when none are
// configured, which is every enemy that existed before this feature shipped and any new one an
// admin never touches, so neither helper below changes behavior for them.
function memberSpecialAttackCandidates(member) {
  const rows = member?.specialAttacks
  if (!Array.isArray(rows) || !rows.length) return []
  return rows
    .filter(r => r.specialAttack)
    .map(r => ({ ...r.specialAttack, usePercent: r.usePercent }))
}

// The attack that actually fires THIS time this member's hit-streak threshold is reached — a
// fresh weighted roll (pickWeightedSpecialAttack) among its own member-level overrides when any
// are configured ("any or multiple special attacks... regardless of their faction's special
// attack" — this member-level list always wins outright over the faction's single shared one when
// non-empty), falling back to the faction's shared CMoonEnemyFaction.specialAttack otherwise. Each
// call can return a DIFFERENT attack from the pool — that variance IS the feature (see
// enemySpecialAttackRequiredHitStreak below for how timing stays well-defined despite it).
export function pickEnemySpecialAttack(member) {
  const candidates = memberSpecialAttackCandidates(member)
  if (candidates.length) return pickWeightedSpecialAttack(candidates)
  return member?.faction?.specialAttack || null
}

// How long this member's hit-streak must run before pickEnemySpecialAttack above is even
// consulted. Deliberately NOT per-candidate: which attack in a member's pool fires is re-rolled
// every time (see pickEnemySpecialAttack), so gating readiness on any ONE candidate's own
// requiredHitStreak would make the roll's own `usePercent` weighting partly moot (whichever
// candidate happens to have the lowest threshold would dominate simply by being ready first,
// regardless of its configured weight). Using the LOWEST requiredHitStreak configured across the
// whole pool keeps "ready to fire" independent of which candidate eventually gets picked, while
// still respecting the fastest-charging attack an admin configured. Falls back to the faction's
// own single attack's threshold (or HIT_STREAK_THRESHOLD) when no member-level override exists —
// identical to this value's pre-feature computation for every untouched enemy.
export function enemySpecialAttackRequiredHitStreak(member) {
  const candidates = memberSpecialAttackCandidates(member)
  if (candidates.length) {
    return Math.min(...candidates.map(c => Number(c.requiredHitStreak) || HIT_STREAK_THRESHOLD))
  }
  return member?.faction?.specialAttack?.requiredHitStreak ?? HIT_STREAK_THRESHOLD
}

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

// Exported for server/utils/cmoonEnemyRaid.js's own resolveRaidRound, which needs the identical
// "4 lane moves, or one of the two server-only sentinels" shape check — never for client-facing
// input validation (that's isValidPlayerSubmittedAction above).
export function isKnownAction(action) {
  return isValidBattleAction(action) || action === SPECIAL_ACTION || action === PARALYZED_ACTION
}

// Combines the admin-configured site-wide default (GlobalGameConfig.cMoonEnemyBattleDefaultHp),
// a player's own cMoon-rank bonus (CMoonRankTier.cMoonEnemyBattleHpBonus), and any permanent,
// admin-set HP adjustment (User.cMoonHpAdjustment, from the "Manage User HP" admin tool) into
// their actual max HP for a cMoon Enemy Battle — pure arithmetic, kept here (rather than inline in
// getPlayerCombatMaxHp() in server/utils/cmoon.js, which does the actual DB lookups for both
// inputs) so the one piece of this genuinely worth unit-testing can be, without dragging in that
// file's BullMQ/Prisma side effects (see tests/cmoonBalanceNoPrizeGrant.test.js's own comment on
// why cmoon.js can't just be imported in a test). adjustment is additive, not an override — a
// player whose HP was hand-adjusted still gains further HP from a later rank-up, since the rank
// bonus term keeps growing independently. Floored at 1 so a misconfigured negative bonus/
// adjustment can never leave a player unable to take a single hit.
export function combinePlayerMaxHp(defaultHp, bonus, adjustment = 0) {
  return Math.max(1, (Number(defaultHp) || 0) + (Number(bonus) || 0) + (Number(adjustment) || 0))
}

// Pure helper for the "Manage User HP" admin tool (server/api/admin/users/[id]/hp*): given a
// user's current NATURAL max HP (defaultHp + rank-tier bonus, with zero adjustment — see
// getNaturalCombatMaxHp in server/utils/cmoon.js), returns the User.cMoonHpAdjustment value that
// makes their EFFECTIVE max HP equal exactly `targetHp` right now. Storing the adjustment this
// way instead of `targetHp` itself is what lets a later rank-up still add its own bonus on top —
// the adjustment is a fixed offset from "natural", not a floor/ceiling on the final result.
export function computeHpAdjustmentForTarget(naturalHp, targetHp) {
  return Math.round(Number(targetHp) || 0) - Math.round(Number(naturalHp) || 0)
}

// Same idea as combinePlayerMaxHp above, for the stamina mechanic (CMoonEnemyBattle.
// playerMaxStamina, solo battles only — see GlobalGameConfig.cMoonEnemyBattleStartingStamina's
// own schema comment) — but with no rank-bonus term, since stamina has no per-rank bonus concept
// at all: every player's NATURAL max stamina is simply the site-wide starting value. adjustment
// is User.cMoonStaminaAdjustment, from the "Manage User HP" admin tool's Stamina section.
// Floored at 0, not 1 like HP — 0 stamina is a legitimate, already-existing "mechanic off for
// this battle" state (see start.post.js), not a danger to guard against.
export function combinePlayerMaxStamina(defaultStamina, adjustment = 0) {
  return Math.max(0, (Number(defaultStamina) || 0) + (Number(adjustment) || 0))
}

// Mirrors computeHpAdjustmentForTarget above, for stamina.
export function computeStaminaAdjustmentForTarget(naturalStamina, targetStamina) {
  return Math.round(Number(targetStamina) || 0) - Math.round(Number(naturalStamina) || 0)
}

// Pure arithmetic for a SOLO CLEANSE_SELF cast (server/api/cmoon/battle/[id]/action.post.js's own
// CLEANSE_SELF branch) — pulled out here, same reasoning as every other pure-arithmetic helper in
// this file, specifically so this exact piece can carry a real regression test: this effect type
// was shipped raid-only at first, a solo fight silently firing-and-announcing it with no actual
// heal/cleanse, which is the precise bug this function's own test guards against recurring. Solo
// only ever cures the caster's own paralysis (done directly in action.post.js, not here — no
// arithmetic involved) plus this optional HP top-up; there's no poison state or allies to extend
// to in solo (see the effectType's own schema comment), so this is simpler than the raid-side
// CLEANSE_SELF handling in cmoonEnemyRaid.js on purpose, not a partial port of it.
export function applySoloCleanseSelfHeal(playerHp, playerMaxHp, cleanseAlsoHeals, amount) {
  if (!cleanseAlsoHeals) return Number(playerHp) || 0
  return Math.min(Number(playerMaxHp) || 0, (Number(playerHp) || 0) + (Number(amount) || 0))
}

// Exported for action.post.js's own stamina-cost gating (is the player's SUBMITTED action an
// attack?) and for resolveRound's own stamina cost/regen below (is the EFFECTIVE action, after
// any paralysis override, an attack or a block?) — same two predicates either caller needs,
// never duplicated.
export function isAttack(action) { return action === 'ATTACK_HIGH' || action === 'ATTACK_LOW' }
export function isBlock(action) { return action === 'BLOCK_HIGH' || action === 'BLOCK_LOW' }
function lane(action) { return action.endsWith('_HIGH') ? 'HIGH' : 'LOW' }

// One side's attack lands on the other UNLESS the other blocked the exact same lane. This is
// symmetric and applied independently for each side, so a round can produce 0, 1, or 2 hits:
//   - both attack (any lanes)              -> both take a hit (nothing blocked either attack)
//   - both block (any lanes)               -> no hits (nobody attacked)
//   - one attacks, other blocks same lane  -> cancelled, no hit
//   - one attacks, other blocks other lane -> the attack lands (blocking the wrong lane doesn't help)
// Exported (unlike `lane` above, which stays private) for cmoonPvp.js's own one-directional
// per-attacker-vs-randomly-assigned-defender resolution — a PvP round has no single shared
// "enemy action" the way solo/raid do, so resolveBattleRound's bidirectional return (which
// assumes the SAME two parties are attacking each other back) doesn't fit: an attacker's
// randomly-assigned target may themselves be attacking someone else entirely this round, so
// only the one-directional "did THIS attacker's hit land on THIS specific defender" question
// — this function, called once per (attacker, assigned defender) pair — is meaningful in that
// shape. See resolvePvpRound's own comment for the full reasoning.
export function attackLands(attackerAction, defenderAction) {
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
// `enemyAccuracyPercent` (0-100, default 100 — see CMoonEnemyMember.attackAccuracyPercent's own
// schema comment) rolls AFTER the lane match above decides the enemy's attack WOULD land — a
// correct block always stops it regardless of this value, same as before this parameter existed.
// Only the enemy's own NORMAL attack gets this miss chance; the player's own attacks landing on
// the enemy are ungated here (no equivalent "player accuracy" stat exists — a special attack's
// own miss chance is a separate mechanic entirely, see CMoonSpecialAttack.accuracyPercent). A
// miss is a different reason for "no damage" than a block: `enemyMissed` is its own flag so the
// caller/UI can tell "they missed outright" apart from "you blocked it" — `playerBlocked` is
// deliberately `false` on a miss (the player didn't block the right lane, the attack just whiffed
// on its own), so it never credits an undeserved block-heal.
export function resolveBattleRound(playerAction, enemyAction, enemyAccuracyPercent = 100) {
  if (!isKnownAction(playerAction)) throw new Error(`Invalid player action: ${playerAction}`)
  if (!isKnownAction(enemyAction)) throw new Error(`Invalid enemy action: ${enemyAction}`)
  const enemyWouldHit = attackLands(enemyAction, playerAction)
  const accuracy = Math.max(0, Math.min(100, Number(enemyAccuracyPercent ?? 100)))
  const enemyMissed = enemyWouldHit && Math.random() * 100 >= accuracy
  const playerHit = enemyWouldHit && !enemyMissed
  const enemyHit = attackLands(playerAction, enemyAction)
  return {
    playerHit,
    enemyHit,
    playerBlocked: isAttack(enemyAction) && !playerHit && !enemyMissed,
    enemyBlocked: isAttack(playerAction) && !enemyHit,
    enemyMissed,
  }
}

// Rolls whether a landed hit is critical (2x damage) against the given member-configured chance
// (0-100, see CMoonEnemyMember.critChanceAgainstPercent/critChanceFromPercent) and returns the
// actual damage to apply. `hit` must already be known true — this never rolls a hit itself, only
// how hard an already-landed one strikes. Kept as a pure function (Math.random() aside) so the
// crit roll and the hit roll stay two clearly separate steps, each independently testable.
// `baseDamage` defaults to NORMAL_HIT_DAMAGE (the player's own damage against the enemy is still
// always flat 1/2 — only the enemy's own attack, via CMoonEnemyMember.baseDamage, is ever
// configurable) — a crit always deals exactly double whatever base is passed in, preserving the
// same "crit = 2x normal" ratio either way.
export function rollHitDamage(hit, critChancePercent, baseDamage = NORMAL_HIT_DAMAGE) {
  if (!hit) return { damage: 0, isCrit: false }
  const chance = Number(critChancePercent) || 0
  const isCrit = chance > 0 && Math.random() * 100 < chance
  return { damage: isCrit ? baseDamage * 2 : baseDamage, isCrit }
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
// `playerStamina`/`playerMaxStamina`/`blockCounterDamage` drive the stamina mechanic (see
// GlobalGameConfig.cMoonEnemyBattleStartingStamina's own schema comment for why it exists) —
// `playerMaxStamina <= 0` (the default for every param here, and for a pre-feature battle row)
// fully disables it: newPlayerStamina always equals playerStamina unchanged, and a block never
// adds counter damage, reproducing the exact pre-this-feature math. The caller (action.post.js)
// is responsible for REJECTING an attack submission when playerStamina is already 0 — this
// function only applies cost/regen to an already-accepted effective action, it never blocks one.
export function resolveRound({
  playerAction, enemyMember, playerHpRemaining, playerMaxHp,
  playerAtkBonus = 0, enemyAtkBonus = 0, playerParalyzedTurns = 0, enemyParalyzedTurns = 0,
  playerStamina = 0, playerMaxStamina = 0, blockCounterDamage = 0,
}) {
  const rolledEnemyAction = rollEnemyAction(enemyMember.attackChancePercent)
  const effectivePlayerAction = playerParalyzedTurns > 0 ? PARALYZED_ACTION : playerAction
  const effectiveEnemyAction = enemyParalyzedTurns > 0 ? PARALYZED_ACTION : rolledEnemyAction
  const { playerHit, enemyHit, playerBlocked, enemyBlocked, enemyMissed } = resolveBattleRound(effectivePlayerAction, effectiveEnemyAction, enemyMember.attackAccuracyPercent)
  // critChanceFromPercent is this enemy's own attacks landing critically against the player;
  // critChanceAgainstPercent is the player's attacks landing critically against this enemy — see
  // those columns' own schema comments.
  const { damage: playerDamageBase, isCrit: playerCrit } = rollHitDamage(playerHit, enemyMember.critChanceFromPercent, enemyMember.baseDamage)
  const { damage: enemyDamageBase, isCrit: enemyCrit } = rollHitDamage(enemyHit, enemyMember.critChanceAgainstPercent)
  // The ENEMY's own attack bonus/penalty applies to damage it deals (landing on the player); the
  // PLAYER's own applies to damage the player deals (landing on the enemy) — named from each
  // side's own schema comment.
  const playerDamage = playerHit ? Math.max(0, playerDamageBase + enemyAtkBonus) : 0
  // A successful player block (playerBlocked) and a landed player attack (enemyHit) can never
  // both be true in the same round — playerBlocked requires the player's OWN action to be a
  // block, enemyHit requires it to be an attack, and a single action can't be both — so folding
  // the block-counter bonus into the same enemyDamage total a landed hit would have produced is
  // safe: whichever branch applies, the other is already guaranteed 0. This lets a counter-hit
  // reuse every existing "damage dealt to the enemy" code path (the SHARED_POOL atomic update,
  // CMoonEnemyBattle.damageDealt credit, the floating-damage-number UI) with zero new plumbing.
  const counterDamage = (playerBlocked && blockCounterDamage > 0) ? blockCounterDamage : 0
  const enemyDamage = enemyHit ? Math.max(0, enemyDamageBase + playerAtkBonus) : counterDamage

  let newPlayerHp = playerHpRemaining
  if (playerHit) newPlayerHp = Math.max(0, newPlayerHp - playerDamage)
  // Capped at THIS player's own max HP, not the bare PLAYER_MAX_HP constant — see
  // GlobalGameConfig.cMoonEnemyBattleDefaultHp/CMoonRankTier.cMoonEnemyBattleHpBonus and
  // getPlayerCombatMaxHp() in server/utils/cmoon.js, which is what every real caller now computes
  // this from. Required, no default, so a caller can never silently fall back to the wrong cap.
  else if (playerBlocked) newPlayerHp = Math.min(playerMaxHp, newPlayerHp + HEAL_ON_SUCCESSFUL_BLOCK)

  // Stamina cost/regen is keyed off the EFFECTIVE action (post-paralysis-override) — a round the
  // player spent paralyzed never costs stamina (they didn't choose to attack, they couldn't act
  // at all), and SPECIAL_ACTION touches neither (it's gated by its own separate hit-streak charge
  // resource, see playerSpecialCharged, deliberately kept independent of this one).
  let newPlayerStamina = playerStamina
  if (playerMaxStamina > 0) {
    if (isAttack(effectivePlayerAction)) newPlayerStamina = Math.max(0, playerStamina - 1)
    else if (isBlock(effectivePlayerAction)) newPlayerStamina = Math.min(playerMaxStamina, playerStamina + 1)
  }

  return {
    roundEntry: {
      playerAction: effectivePlayerAction, enemyAction: effectiveEnemyAction,
      playerHit, enemyHit, playerBlocked, enemyBlocked, playerCrit, enemyCrit,
      // Display-only — the floating damage-number UI in CMoonBattlePopupHost.vue reads these
      // straight off the round rather than re-deriving "1, or 2 on a crit" client-side, so a
      // future balance change here (e.g. a non-flat crit multiplier) stays correct for free.
      // Always 0 when that side didn't land a hit, same convention playerDamage/enemyDamage
      // themselves already follow below.
      playerDamage, enemyDamage,
      // Distinguishes "you blocked and your counter chipped them for N" from "you landed a
      // normal hit for N" — both already fold into the same enemyDamage above, this is purely so
      // the client's round-summary copy (CMoonBattlePopupHost.vue) can tell which happened.
      counterHit: counterDamage > 0,
      // True when the enemy's own attack would have landed (the player didn't block the right
      // lane) but missed outright due to CMoonEnemyMember.attackAccuracyPercent — see
      // resolveBattleRound's own comment. The client shows this with the same "MISS!" badge
      // treatment a landed critical hit already gets.
      enemyMissed,
    },
    newPlayerHp,
    enemyDamage,
    enemyHit,
    enemyBlocked,
    newPlayerParalyzedTurns: Math.max(0, playerParalyzedTurns - 1),
    newEnemyParalyzedTurns: Math.max(0, enemyParalyzedTurns - 1),
    newPlayerStamina,
  }
}

// The NPC's move for this round. `attackChancePercent` (CMoonEnemyMember.attackChancePercent,
// 0-100) biases attack vs block; whichever side wins that roll is then split evenly between its
// own HIGH/LOW lane, same as before this knob existed. The default (50, or no argument at all)
// reproduces the original plain-uniform-among-4-actions roll bit-for-bit, so every existing
// caller that doesn't pass a value — notably cmoonRaidSocket.js's straggler-participant
// autofill, which reuses this same function for an unrelated purpose (see its own comment) and
// must stay unbiased — is completely unaffected by this feature.
export function rollEnemyAction(attackChancePercent = 50) {
  const chance = Number(attackChancePercent)
  const pct = Number.isFinite(chance) ? Math.min(100, Math.max(0, chance)) : 50
  const isAttack = Math.random() * 100 < pct
  const isHigh = Math.random() < 0.5
  return isAttack ? (isHigh ? 'ATTACK_HIGH' : 'ATTACK_LOW') : (isHigh ? 'BLOCK_HIGH' : 'BLOCK_LOW')
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

// ── Reward pity (see CMoonEnemyMember.pityThreshold's own schema comment — SOLO BATTLES ONLY) ──

// Pure decision: has `emptyWinStreak` (the count AFTER this win, i.e. already incremented) hit
// the point where this win must force a reward? `pityThreshold <= 0` means the feature is off for
// this member and never forces anything, regardless of streak.
export function shouldForcePityReward(emptyWinStreak, pityThreshold) {
  const threshold = Number(pityThreshold) || 0
  if (threshold <= 0) return false
  return Number(emptyWinStreak) >= threshold
}

// Picks exactly one row uniformly at random from the member's configured reward table, ignoring
// each row's own dropChancePercent — this is the "guaranteed" pick a pity trigger forces, not
// another independent roll. Returns null for an empty table (nothing to force).
export function forcePickOneReward(rewardRows) {
  if (!rewardRows?.length) return null
  return rewardRows[Math.floor(Math.random() * rewardRows.length)]
}

// Whether a grantRewardInTx summary actually handed the player nothing tangible — the single
// source of truth action.post.js's resolveWin uses to decide reward pity, rather than the raw
// roll (rollEnemyRewards' own hitRewards). A roll CAN hit a row and still grant nothing: an
// AVATAR/BACKGROUND the player already owns is deduped away inside grantRewardInTx itself (see
// that function's own ownership check), so "something rolled" and "something was actually
// granted" are different facts — only the latter should ever reset an empty-win pity streak.
// border/glow aren't reachable from a cMoon enemy reward table (buildGrantableReward never sets
// borderCMoonId/glowCMoonId for this caller), so they're deliberately not checked here.
export function grantSummaryIsEmpty(summary) {
  return !summary?.points && !summary?.backgrounds && !summary?.avatars && !summary?.ctoonJobs?.length && !summary?.packs
}

// Merges a member's own unique taunts (CMoonEnemyMemberTaunt) with its faction's shared pool
// (CMoonEnemyTaunt) into one { appear, crit } shape — see CMoonEnemyMemberTaunt's own schema
// comment for why a member can have both a personal pool AND still draw from its faction's shared
// one; nothing forces an admin to pick one or the other. Member-specific lines are listed first,
// though the actual pick is uniform random either way (see useCMoonBattlePopup.js's own
// pickRandomTaunt), so the ordering has no gameplay effect — only display-list grouping.
export function mergeTauntPools(memberTaunts, factionTaunts) {
  const pool = (trigger) => [
    ...(memberTaunts || []).filter(t => t.trigger === trigger),
    ...(factionTaunts || []).filter(t => t.trigger === trigger),
  ].map(t => ({ text: t.text, soundPath: t.soundPath }))
  return { appear: pool('APPEAR'), crit: pool('CRIT') }
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
// `pityEmptyWinStreak` is this VIEWER's own current CMoonEnemyRewardPity.emptyWinStreak against
// this member (a DB read the caller does, if at all — this function stays pure/DB-free). Only
// consider.post.js's OFFER roll passes a real value today, specifically so a player deciding
// whether to fight can see "N more empty wins until a guaranteed drop" before committing — every
// other caller (a resumed/in-progress battle, the admin preview tool) omits it, which is also
// correct: the streak can't change mid-fight, so there's nothing new to show there anyway.
export function serializeEnemyForClient(member, pityEmptyWinStreak = null) {
  const hp = member.battleMode === 'SHARED_POOL' ? member.currentHp : member.maxHp
  const fx = member.faction?.appearEffect
  // A member's own null sound slot falls back to its faction's matching default — see
  // CMoonEnemyFaction's default*SoundPath columns and resolveMemberSoundPaths' own comment.
  const sounds = resolveMemberSoundPaths(member, member.faction)
  // The full active taunt pool for each trigger moment, merging this member's OWN unique lines
  // (CMoonEnemyMemberTaunt) with its faction's shared pool (CMoonEnemyTaunt) — see
  // mergeTauntPools' own comment. The caller must have included both `taunts` (on the member) and
  // `faction.taunts` filtered to active rows (every query that reaches here already does, see
  // consider.post.js/start.post.js/action.post.js/[id].get.js/preview.post.js). Sent as a full
  // small list rather than one pre-picked line: the client (CMoonBattlePopupHost.vue) does the
  // random pick itself at the actual moment, so a resumed battle or a re-fetch doesn't lock in
  // whichever line happened to be rolled first.
  const taunts = mergeTauntPools(member.taunts, member.faction?.taunts)
  return {
    id: member.id,
    name: member.name,
    imagePath: member.imagePath || null,
    battleMode: member.battleMode,
    rank: member.rank,
    isRaidBoss: !!member.isRaidBoss,
    maxHp: member.maxHp,
    hp,
    // Shown in the offer popup ("A win earns N cMoon points…") so a player can size up a fight
    // before committing, not just after winning it — not admin-only info, every other reward
    // detail (exact drop tables/chances) stays hidden, but the plain points-on-win number doesn't.
    cMoonPointsReward: member.cMoonPointsReward,
    // Null hides the UI entirely — pity disabled for this member, or the caller didn't pass a
    // streak (see this function's own comment on who does). Never sent for a raid boss (pity is
    // solo-only — see CMoonEnemyMember.pityThreshold's own schema comment).
    pityProgress: (member.pityThreshold > 0 && pityEmptyWinStreak != null)
      ? { emptyWinStreak: pityEmptyWinStreak, threshold: member.pityThreshold }
      : null,
    // Named from the enemy's own perspective — see the schema comment on these columns.
    appearSoundPath: sounds.appearSoundPath,
    damageTakenSoundPath: sounds.damageTakenSoundPath,
    damageAvoidedSoundPath: sounds.damageAvoidedSoundPath,
    attackingSoundPath: sounds.attackingSoundPath,
    victorySoundPath: sounds.victorySoundPath,
    defeatSoundPath: sounds.defeatSoundPath,
    taunts,
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
// the player's own special-attack button at all — its `cMoon` (with `cMoon.specialAttack`) AND
// `user` (with `user.chosenSpecialAttack`, using SPECIAL_ATTACK_SELECT) relations too (all
// nullable: a battle with no cMoon, whose cMoon has no attack assigned, and/or whose player has
// made no choice of their own, simply falls through to whichever of those still applies — see
// pickEffectiveSpecialAttack above — or offers no button at all if neither does; see
// CMoonBattlePopupHost.vue's own v-if on this field).
export function serializeBattleForClient(battle) {
  const specialAttack = pickEffectiveSpecialAttack(battle.user?.chosenSpecialAttack, battle.cMoon?.specialAttack)
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
    // The enemy's OWN consecutive-hit streak against the player (see
    // CMoonEnemyBattle.enemyHitStreak's own schema comment) — surfaced so the UI can telegraph an
    // incoming automatic special as it climbs toward HIT_STREAK_THRESHOLD, same spirit as
    // playerParalyzedTurns above. enemyHasSpecialAttack is a bare boolean, never the attack's own
    // name/effect/amount — those stay hidden until it actually fires (see action.post.js's
    // `specials` round events), this is only enough for a "something's coming" warning pulse.
    enemyHitStreak: battle.enemyHitStreak || 0,
    enemyHasSpecialAttack: !!(battle.enemyMember?.faction?.specialAttack || battle.enemyMember?.specialAttacks?.length),
    // The enemy's own current threshold (1-10, default 3) — safe to reveal despite
    // enemyHasSpecialAttack hiding everything else about that attack: this is purely "how close is
    // the telegraphed warning," the same spirit enemyHitStreak itself already has, never the
    // attack's own identity/effect. Lets the UI's "about to fire" pulse trigger at the right point.
    // See enemySpecialAttackRequiredHitStreak's own comment for why this stays independent of
    // WHICH of a member's several possible attacks eventually fires.
    enemyRequiredHitStreak: enemySpecialAttackRequiredHitStreak(battle.enemyMember),
    // Rounds left where the player can't act at all (set by the enemy's own PARALYZE_OPPONENT
    // special) — surfaced so the UI can explain why their moves (including an already-charged
    // special) are about to whiff, rather than that just appearing to happen with no warning.
    playerParalyzedTurns: battle.playerParalyzedTurns || 0,
    // See CMoonEnemyBattle.playerStamina/playerMaxStamina's own schema comment — playerMaxStamina
    // <= 0 means the mechanic is off for this battle (the UI shows nothing and never disables the
    // attack buttons), either an admin-disabled feature or a pre-this-feature historical row.
    playerStamina: battle.playerStamina || 0,
    playerMaxStamina: battle.playerMaxStamina || 0,
    playerSpecialAttack: specialAttack
      ? {
          id: specialAttack.id,
          name: specialAttack.name,
          description: specialAttack.description || null,
          effectType: specialAttack.effectType,
          amount: specialAttack.amount,
          soundPath: specialAttack.soundPath || null,
          // Replaces the client's old hardcoded "3" for the charge meter/tooltip — see that
          // column's own schema comment. accuracyPercent is likewise surfaced so the tooltip can
          // mention a miss chance instead of implying every cast always lands.
          requiredHitStreak: specialAttack.requiredHitStreak ?? HIT_STREAK_THRESHOLD,
          accuracyPercent: specialAttack.accuracyPercent ?? 100,
        }
      : null,
  }
}

export function buildGrantableReward(hitRewardRows) {
  const backgrounds = []
  const avatars = []
  const ctoons = []
  const packs = []
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
    // Sealed Packs — no supply cap to resolve here (unlike cToons' mint-limit math above), just
    // how many copies to grant. Granted synchronously in grantRewardInTx (tx.userPack.create),
    // not queued, since a pack has no mint/supply step of its own.
    } else if (row.rewardType === 'PACK' && row.packId) {
      packs.push({ packId: row.packId, quantity: Math.max(1, Number(row.quantity) || 1) })
    // Plain site points (User.points via grantRewardInTx, which already reads a bare `points`
    // number off this same bundle) — summed across every hit POINTS row into the one total
    // grantRewardInTx expects, same as several independent CTOON rows each contribute their own
    // entry to the `ctoons` list above.
    } else if (row.rewardType === 'POINTS') {
      points += Math.max(0, Number(row.quantity) || 0)
    }
  }
  return { backgrounds, avatars, ctoons, packs, points }
}
