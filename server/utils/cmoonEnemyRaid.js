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
//       REFLECT_DAMAGE (either side)   -> reflects reflectPercent% of whatever REAL damage the
//                                          opposing side dealt to the caster's side THIS round
//                                          back onto that opponent (player-cast -> raid.
//                                          enemyHpRemaining; boss-cast -> AoE on every alive
//                                          participant, same "full amount each" convention
//                                          DAMAGE_OPPONENT already uses). "If the enemy blocks,
//                                          nothing is reflected" falls out for free: the real
//                                          damage dealt is already 0 whenever the opponent's own
//                                          round action was a block rather than an attack — no
//                                          extra rule needed. A boss-cast reflect already fires
//                                          AFTER the round resolves (same timing as every other
//                                          boss auto-fire effect) so it applies immediately; a
//                                          PLAYER cast fires in step 1, BEFORE that round's real
//                                          outcome exists, so it's queued and applied in a new
//                                          "step 2.5" in closeRound, right after the lane
//                                          exchange resolves — see applyReflectDamage below.
//       SIPHON_HEALTH (either side)    -> unlike every other special, this one CAN be blocked:
//                                          deals its own flat `amount` (same convention as
//                                          DAMAGE_OPPONENT) and heals the caster's side by
//                                          siphonPercent% of it, UNLESS the intended target's own
//                                          action that round was a block, in which case it fizzles
//                                          entirely (no damage, no heal). Boss-cast is AoE, each
//                                          alive participant checked independently against their
//                                          OWN action — some can block it while others can't.
//                                          Player-cast targets the boss's one shared action. Same
//                                          deferred-to-step-2.5 timing as REFLECT_DAMAGE for a
//                                          player cast, for the same reason (the action being
//                                          checked, post-paralysis-override, isn't settled as
//                                          this round's EFFECTIVE action until resolveRaidRound
//                                          runs) — see applySiphonHealth below. `healsAllies`
//                                          governs the heal exactly like HEAL_SELF's own field.
//   - REFLECT_DAMAGE and SIPHON_HEALTH do NOT stack within the same round on the PLAYER side
//     either (see roundGuards in closeRound) — if several party members all cast the same one in
//     one round, only the FIRST to be processed takes effect; the rest are no-ops (still announce
//     via specialEvents, same "silent no-op, not an error" shape PARALYZE_OPPONENT/
//     RAISE_ALLY_ATTACK already use). Unlike those two, there's no multi-round "already active"
//     state to track — these are instant, one-shot effects — so the guard is a plain object
//     closeRound creates fresh every round, never persisted on `raid` or serialized to Redis.
//       POISON_OPPONENT (player-cast)   -> raid.enemyPoisonAmount/enemyPoisonTurnsRemaining: ONE
//                                          shared DoT on the boss, same "shared enemy-side state"
//                                          convention PARALYZE_OPPONENT's own player-cast branch
//                                          already uses. Refreshes (never stacks) on a re-cast.
//       POISON_OPPONENT (boss auto-fire)-> every alive participant gets their OWN
//                                          p.poisonAmount/p.poisonTurnsRemaining (unlike every
//                                          other boss-cast AoE above, the party's HP is genuinely
//                                          per-participant, so there's no single shared pool to
//                                          hang one DoT off of the way the boss's own HP allows).
//                                          Also refreshes per-participant on a re-cast. Actually
//                                          ticking (the damage itself) happens once per round in
//                                          closeRound, at the same point the paralyze/raise
//                                          counters already elapse — see that function's own
//                                          poison-tick comment for the exact timing.
//       CLEANSE_SELF                   -> cures the CASTER'S OWN SIDE's active paralyze (always
//                                          the whole side at once — there's no per-player paralysis
//                                          state to partially clear) and poison (self only, unless
//                                          healsAllies, exactly like HEAL_SELF's own choice),
//                                          with an optional HP top-up (cleanseAlsoHeals) on
//                                          whoever's poison just got cleared. A player/boss cured
//                                          of either condition can be re-paralyzed/re-poisoned
//                                          again immediately after — this is a one-shot cure, not
//                                          a temporary immunity.
//       SHIELD_PARTY (player-cast only)-> negates ALL damage the party would otherwise take THIS
//                                          round — the normal lane-exchange hit AND any same-round
//                                          boss-cast damaging special (DAMAGE_OPPONENT/
//                                          SIPHON_HEALTH/REFLECT_DAMAGE/POISON_OPPONENT's own
//                                          application, not just that round's tick). Threaded
//                                          through as a `partyShielded` context flag rather than a
//                                          persisted raid field — see closeRound's own comment for
//                                          why reading it back out of `specialEvents` after step 1
//                                          is enough, with no new raid-level state needed at all.
//                                          Non-stacking in the sense that matters: it's a boolean
//                                          "is anyone's cast active this round," not a counter, so
//                                          several party members casting it the same round changes
//                                          nothing beyond extra announcements. A boss-cast
//                                          SHIELD_PARTY is a documented no-op — see
//                                          applyRaidSpecialAttack's own comment for why the boss's
//                                          auto-fire timing (step 3) always comes too late to
//                                          protect anything.
//   - Every effect above (including the five original ones) now rolls CMoonSpecialAttack.
//     accuracyPercent BEFORE doing anything else — see applyRaidSpecialAttack's own comment. A
//     miss still announces the cast (so the party sees their special attack actually fire) but
//     changes no state at all, including never queuing a REFLECT_DAMAGE/SIPHON_HEALTH player cast
//     into roundGuards.
//   - Each participant's own hitStreak/specialCharged stays genuinely per-participant (see
//     CMoonEnemyRaidParticipant's own in-memory shape in cmoonRaidSocket.js) — "if a player lands
//     3 hits in a row" is unambiguous per-player, unlike anything above. The boss's own hit
//     streak, by contrast, is one shared counter (raid.enemyHitStreak): it advances the instant
//     its single rolled action lands on AT LEAST ONE alive participant, mirroring the shared HP
//     pool/shared action this engine already treats the boss as having.

import {
  resolveBattleRound, rollHitDamage, isKnownAction, isBlock, PLAYER_MAX_HP, HEAL_ON_SUCCESSFUL_BLOCK,
  HIT_STREAK_THRESHOLD,
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
// Fallback only — CMoonEnemyMember.raidRoundLimit (50-500, default 300) is what actually governs
// a given raid boss's round cap now, same "constant stays only as the if-nothing-else-says-
// otherwise value" role MAX_PARTY_SIZE plays above for maxParticipants.
export const RAID_MAX_ROUNDS_SAFETY = 300

// `anyCaptainPresent` must be recomputed live each time this is called (participants can change
// while a raid is still FORMING — a captain could join the lobby after someone else started it),
// never snapshotted once like `captainBoostEnabled` itself is at raid creation. `baseThreshold` is
// now each ATTACK's own CMoonSpecialAttack.requiredHitStreak (1-10, default 3 — see that column's
// own schema comment) rather than the old one-size-fits-all HIT_STREAK_THRESHOLD constant, which
// now only matters as the fallback a caller passes when an attack's own value can't be resolved
// (e.g. no special assigned at all). A captain's presence still lowers whatever threshold was
// passed in by exactly 1 (floored at 1) — the same relationship the old fixed 3->2 reduction had,
// rather than a flat override that would make every attack equally cheap regardless of its own
// configured cost. `mapReduction` is the raid/match's own snapshotted
// CMoonEnemyMap.specialThresholdReduction (0 for an ordinary match/raid, or when this helper is
// called from a context with no map concept) — applied additively with the captain reduction,
// symmetric for every side (unlike the captain boost, which only ever applies to the raid
// party), still floored at 1 overall. Returns `baseThreshold` unchanged whenever the toggle is
// off, no captain is present, and no map reduction applies.
export function effectiveHitStreakThreshold(baseThreshold, captainBoostEnabled, anyCaptainPresent, mapReduction = 0) {
  const base = Number(baseThreshold) || HIT_STREAK_THRESHOLD
  const captainReduction = (captainBoostEnabled && anyCaptainPresent) ? 1 : 0
  const totalReduction = captainReduction + (Number(mapReduction) || 0)
  return totalReduction > 0 ? Math.max(1, base - totalReduction) : base
}

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

// Computes when the NEXT raid boss could plausibly become available to a given player — the
// raid-boss counterpart of nextSoloSlotAt in cmoonEnemy.js, used by
// /api/onboarding/events.get.js's own cMoonRaidCountdown so that display can never drift from the
// real gate. Combines two independent gates, same as consider.post.js itself does: the shared
// popup cooldown every offer (solo or raid) goes through, and each ELIGIBLE candidate's own
// availability (see checkRaidBossAvailability) — "eligible" meaning this player's own SOLO win
// count already clears that candidate's minPriorDefeats, same solo-only gate every other raid-boss
// minPriorDefeats check uses.
//   bosses: [{ id, minPriorDefeats, raidOneTime, raidCooldownMinutes, raidDefeatedAt }]
//   personalSoloWinCount: this player's own solo (raidId: null) win count.
//   riddleSolvedByEnemyId: Map<enemyMemberId, boolean> — BOSS_LORE riddle solved state; a boss
//     missing from the map defaults to solved/unlocked, same as consider.post.js's own `?? true`.
//   popupNextAvailableAt: Date|null — the shared popup cooldown's own next-available time, or null
//     once that cooldown has already cleared.
// Returns { noneAvailable, availableNow, nextAvailableAt }: `noneAvailable` when every eligible
// candidate is permanently locked (one-time-defeated with no revival yet, or riddle-locked) with
// nothing left to count down to; otherwise exactly one of `availableNow`/`nextAvailableAt` applies.
export function nextRaidBossSlotAt({ bosses, personalSoloWinCount, riddleSolvedByEnemyId = new Map(), popupNextAvailableAt = null }, now = Date.now()) {
  const eligible = bosses.filter(m => m.minPriorDefeats <= personalSoloWinCount)
  let anyAvailableNow = false
  let earliestAt = null
  for (const m of eligible) {
    const riddleGateSolved = riddleSolvedByEnemyId.get(m.id) ?? true
    const result = checkRaidBossAvailability({ ...m, riddleGateSolved }, now)
    if (result.available) { anyAvailableNow = true; break }
    if (result.availableAt && (!earliestAt || result.availableAt < earliestAt)) earliestAt = result.availableAt
  }
  if (!anyAvailableNow && !earliestAt) return { noneAvailable: true, availableNow: false, nextAvailableAt: null }
  if (anyAvailableNow) return { noneAvailable: false, availableNow: !popupNextAvailableAt, nextAvailableAt: popupNextAvailableAt }
  const combined = (popupNextAvailableAt && popupNextAvailableAt > earliestAt) ? popupNextAvailableAt : earliestAt
  return { noneAvailable: false, availableNow: false, nextAvailableAt: combined }
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
// `partyShielded` (see SHIELD_PARTY's own schema/applyRaidSpecialAttack comment) zeroes every
// participant's INCOMING damage this round — `playerHit`/`playerCrit` stay exactly as rolled (so
// the UI can still show "the enemy's attack connected, but your shield absorbed it" rather than a
// plain miss) but `playerDamage` and the resulting `newHp` are left untouched. A successful BLOCK
// still heals normally even while shielded — the two are unrelated (shield protects against a HIT,
// a block is a separate action the player themselves chose) and stacking them is harmless.
// `enemyMember.attackAccuracyPercent` (see that column's own schema comment) can also make the
// boss's one shared action whiff against a given participant even when they didn't block it —
// see resolveBattleRound's own comment for why that's distinct from a block (`playerBlocked`
// stays false on a miss) and each participant's own independent roll.
export function resolveRaidRound({ enemyAction, enemyMember, participants, partyAtkBonus = 0, enemyAtkBonus = 0, partyShielded = false }) {
  if (!isKnownAction(enemyAction)) throw new Error(`Invalid enemy action: ${enemyAction}`)

  let enemyDamageDealt = 0
  const perParticipant = participants.map(({ userId, action, hpRemaining, maxHp }) => {
    if (!isKnownAction(action)) throw new Error(`Invalid action for ${userId}: ${action}`)
    // enemyMember.attackAccuracyPercent (see that column's own schema comment) is rolled
    // INDEPENDENTLY per participant here — the boss's one shared action this round can land on
    // some party members and whiff on others, rather than one shared hit/miss outcome for the
    // whole party.
    const { playerHit, enemyHit, playerBlocked, enemyBlocked, enemyMissed } = resolveBattleRound(action, enemyAction, enemyMember.attackAccuracyPercent)
    // critChanceFromPercent is the enemy's own attack landing critically against A player;
    // critChanceAgainstPercent is a player's attack landing critically against the enemy — same
    // naming as the solo battle, see CMoonEnemyMember's own schema comment on these columns.
    const { damage: playerDamageBase, isCrit: playerCrit } = rollHitDamage(playerHit, enemyMember.critChanceFromPercent, enemyMember.baseDamage)
    const { damage: enemyDamageBase, isCrit: enemyCrit } = rollHitDamage(enemyHit, enemyMember.critChanceAgainstPercent)
    // Named from each side's own perspective, same convention as the solo battle: enemyAtkBonus
    // changes what the ENEMY deals (to this participant); partyAtkBonus changes what the PARTY
    // (this participant included) deals back.
    const playerDamage = (playerHit && !partyShielded) ? Math.max(0, playerDamageBase + enemyAtkBonus) : 0
    const enemyDamage = enemyHit ? Math.max(0, enemyDamageBase + partyAtkBonus) : 0

    let newHp = hpRemaining
    if (playerHit && !partyShielded) newHp = Math.max(0, newHp - playerDamage)
    // `maxHp || PLAYER_MAX_HP`: a defensive fallback only, never expected to trigger in normal
    // operation — a raid restored from Redis across a deploy boundary that predates this
    // participant field existing would otherwise clamp against `undefined` here and produce NaN.
    else if (playerBlocked) newHp = Math.min(maxHp || PLAYER_MAX_HP, newHp + HEAL_ON_SUCCESSFUL_BLOCK)

    if (enemyHit) enemyDamageDealt += enemyDamage

    return {
      userId, action, enemyAction, playerHit, enemyHit, playerBlocked, enemyBlocked,
      playerCrit, enemyCrit, hpRemaining: newHp, knockedOut: newHp <= 0,
      // True when the boss's own attack would have landed on THIS participant but missed
      // outright (see CMoonEnemyMember.attackAccuracyPercent/resolveBattleRound's own comment).
      enemyMissed,
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
//
// PARALYZE_OPPONENT and RAISE_ALLY_ATTACK do NOT stack in a raid (unlike every other effect type,
// and unlike a solo battle's own identically-named effects in action.post.js/cmoonEnemyBattle.js,
// which are untouched by this): at most one paralyze and one attack-raise can be active against/
// for a given side at once. A cast of either while one is already active is a complete no-op —
// pushed to specialEvents (so the UI/Discord still announce the attempt) but changes no state.
//
// `context` is only ever populated by closeRound, for the two newest effect types:
//   - `roundGuards` (step 1 only): `{ reflectUsed, siphonUsed, pendingReflect, pendingSiphon }` —
//     see this file's header comment on why a PLAYER cast of either effect always defers here.
//   - `roundInfo` (step 2.5's deferred re-resolution, and step 3's boss auto-fire, which already
//     has it the first time): `{ enemyAction, perParticipant, enemyDamageDealt }`, the exact
//     shape resolveRaidRound returns — the real outcome either effect needs.
// Every other effect type ignores `context` entirely; it costs them nothing.
export function applyRaidSpecialAttack(raid, alive, attack, caster, specialEvents, context = {}) {
  const { roundGuards = null, roundInfo = null, partyShielded = false } = context
  // Retained by reference below for REFLECT_DAMAGE/SIPHON_HEALTH so a later fizzle (the opponent's
  // block made it do nothing — a normal, frequent outcome for these two effect types alone, see
  // applyReflectDamage/applySiphonHealth) can be flagged on this SAME event object the client/
  // Discord already render, rather than silently landing as a no-op announcement.
  const event = {
    side: caster.side, userId: caster.userId || null, name: attack.name,
    effectType: attack.effectType, amount: attack.amount, soundPath: attack.soundPath || null,
    // Embedded here, from the authoritative raid.participants Map, same reasoning as
    // perParticipant's own `username` in closeRound — a PLAYER-side cast carries the caster's
    // name directly on the event instead of making the client re-derive it later against a
    // separately-updating participants list. Always null for an ENEMY-side cast (the client
    // already uses raid.enemyName for those).
    username: caster.side === 'PLAYER' ? (raid.participants.get(caster.userId)?.username || null) : null,
  }
  specialEvents.push(event)
  // Accuracy roll (see CMoonSpecialAttack.accuracyPercent's own schema comment) — runs FIRST,
  // before any effect-specific branch or fizzle check below, so a miss is a miss regardless of
  // what the opponent did that round. The cast still announces (the push above) with `missed`
  // flagged on the SAME event, same "don't silently drop the attempt" stance fizzled already
  // takes — describeRaidSpecialEvent/the client render this instead of implying the attack landed.
  // A REFLECT_DAMAGE/SIPHON_HEALTH player cast that misses is never even deferred into roundGuards
  // — there's nothing to resolve later once it's already failed here.
  const accuracy = Math.max(0, Math.min(100, Number(attack.accuracyPercent ?? 100)))
  if (Math.random() * 100 >= accuracy) { event.missed = true; return }
  if (attack.effectType === 'DAMAGE_OPPONENT') {
    if (caster.side === 'PLAYER') {
      raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - attack.amount)
    } else if (partyShielded) {
      // Negated by SHIELD_PARTY (see that effectType's own branch below) — same "blocked, no
      // effect" announcement reflect/siphon already use for their own block-based fizzles.
      event.fizzled = true
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
    // Non-stacking in a raid (unlike solo, see this function's own callers' comments): a cast
    // that lands while the target side is ALREADY paralyzed has no additional effect — it never
    // extends the remaining turns or layers a second paralysis on top. Once the active one
    // decrements to 0 (see closeRound in cmoonRaidSocket.js), a later cast can trigger a fresh one.
    if (caster.side === 'PLAYER') {
      if (raid.enemyParalyzedTurns <= 0) raid.enemyParalyzedTurns = attack.amount
    } else if (raid.partyParalyzedTurns <= 0) {
      raid.partyParalyzedTurns = attack.amount
    }
  } else if (attack.effectType === 'LOWER_OPPONENT_ATTACK') {
    // Unaffected by the anti-stacking request — still permanent-for-the-fight and cumulative
    // across casts, same as every other non-duration effect type.
    if (caster.side === 'PLAYER') raid.enemyAtkBonus -= attack.amount
    else raid.partyAtkBonus -= attack.amount
  } else if (attack.effectType === 'RAISE_ALLY_ATTACK') {
    // Non-stacking and now time-limited in a raid, same "no-op while one is already active" shape
    // as PARALYZE_OPPONENT just above — tracked in a pair of fields SEPARATE from
    // partyAtkBonus/enemyAtkBonus (which stay LOWER_OPPONENT_ATTACK's own permanent, stacking
    // accumulator) so closeRound can let this raise expire on its own schedule without touching
    // any permanent debuff already banked on that side. See raid.partyAtkRaiseAmount/
    // partyAtkRaiseTurnsRemaining's own shape comment in cmoonRaidSocket.js.
    if (caster.side === 'PLAYER') {
      if (raid.partyAtkRaiseTurnsRemaining <= 0) {
        raid.partyAtkRaiseAmount = attack.amount
        raid.partyAtkRaiseTurnsRemaining = attack.raiseDurationRounds
      }
    } else if (raid.enemyAtkRaiseTurnsRemaining <= 0) {
      raid.enemyAtkRaiseAmount = attack.amount
      raid.enemyAtkRaiseTurnsRemaining = attack.raiseDurationRounds
    }
  } else if (attack.effectType === 'REFLECT_DAMAGE') {
    if (caster.side === 'PLAYER') {
      // Non-stacking within the round, same spirit as PARALYZE_OPPONENT/RAISE_ALLY_ATTACK above
      // but scoped to ONE round rather than a multi-round duration (see this file's header
      // comment) — the first player-side cast to reach here each round claims the slot; later
      // ones this same round are silent no-ops. Always deferred for a player cast (no roundInfo
      // yet at step 1) — closeRound re-invokes applyReflectDamage directly, not this function,
      // once the real round outcome is known, so the specialEvent above is never pushed twice.
      if (roundGuards?.reflectUsed) return
      if (roundGuards) { roundGuards.reflectUsed = true; roundGuards.pendingReflect = { attack, caster, event } }
      return
    }
    applyReflectDamage(raid, alive, attack, caster, roundInfo, event, partyShielded)
  } else if (attack.effectType === 'SIPHON_HEALTH') {
    if (caster.side === 'PLAYER') {
      if (roundGuards?.siphonUsed) return
      if (roundGuards) { roundGuards.siphonUsed = true; roundGuards.pendingSiphon = { attack, caster, event } }
      return
    }
    applySiphonHealth(raid, alive, attack, caster, roundInfo, event, partyShielded)
  } else if (attack.effectType === 'POISON_OPPONENT') {
    // Refresh, not stack (see poisonDurationRounds' own schema comment): a re-cast on an already-
    // poisoned target replaces its amount/remaining-rounds with this cast's own values rather than
    // layering a second independent tick on top. Player-cast targets the boss's ONE shared poison
    // state (mirroring every other player-cast effect's shared-enemy-side target); boss-cast is
    // AoE, individually onto every alive participant (closeRound's own per-round tick walks these
    // the same way it already walks hitStreak) — unlike every flat-amount effect above, this one
    // SETS UP future damage rather than dealing any right now; see closeRound's own poison-tick
    // comment for when it actually ticks.
    if (caster.side === 'PLAYER') {
      raid.enemyPoisonAmount = attack.amount
      raid.enemyPoisonTurnsRemaining = attack.poisonDurationRounds
    } else if (partyShielded) {
      // Shield blocks the APPLICATION itself, not just one round's tick — a boss-cast poison that
      // lands while the party is shielded is wasted entirely, never queued to tick later once the
      // shield itself has worn off; "negate all damage taken... for that turn" extends to a status
      // whose entire purpose is future damage, same spirit as the DAMAGE_OPPONENT branch above.
      event.fizzled = true
    } else {
      for (const p of alive) { p.poisonAmount = attack.amount; p.poisonTurnsRemaining = attack.poisonDurationRounds }
    }
  } else if (attack.effectType === 'CLEANSE_SELF') {
    // Cures the CASTER'S OWN SIDE's active afflictions — paralyze (always the whole side, see
    // healsAllies' own schema comment on why that can't be partial) and poison (self only, unless
    // healsAllies, exactly like HEAL_SELF's own self-vs-party choice above), with an optional HP
    // top-up (cleanseAlsoHeals) on whoever's poison just got cleared. Both sides get a symmetric
    // cast here (unlike SHIELD_PARTY, this has no round-ordering quirk to work around — clearing a
    // counter is instant and correct regardless of which step cast it).
    if (caster.side === 'PLAYER') {
      raid.partyParalyzedTurns = 0
      if (attack.healsAllies) {
        for (const p of alive) {
          p.poisonAmount = 0; p.poisonTurnsRemaining = 0
          if (attack.cleanseAlsoHeals) p.hpRemaining = Math.min(p.maxHp, p.hpRemaining + attack.amount)
        }
      } else {
        const casterParticipant = raid.participants.get(caster.userId)
        if (casterParticipant && !casterParticipant.knockedOutAt) {
          casterParticipant.poisonAmount = 0; casterParticipant.poisonTurnsRemaining = 0
          if (attack.cleanseAlsoHeals) casterParticipant.hpRemaining = Math.min(casterParticipant.maxHp, casterParticipant.hpRemaining + attack.amount)
        }
      }
    } else {
      raid.enemyParalyzedTurns = 0
      raid.enemyPoisonAmount = 0
      raid.enemyPoisonTurnsRemaining = 0
      if (attack.cleanseAlsoHeals) raid.enemyHpRemaining = Math.min(raid.enemyStats.maxHp, raid.enemyHpRemaining + attack.amount)
    }
  }
  // SHIELD_PARTY has no branch here at all when caster.side === 'PLAYER' — the cast above already
  // pushed/announced the event, and that's everything applyRaidSpecialAttack itself needs to do.
  // The actual effect (negating this round's incoming damage) is read back out of `specialEvents`
  // by closeRound itself (see its own `partyShielded` comment) — not applied here, because this
  // function runs BEFORE resolveRaidRound's lane exchange (step 2) even for a step-1 player cast,
  // so there's nothing yet to negate at the moment this function would otherwise act. A boss-cast
  // SHIELD_PARTY (caster.side === 'ENEMY') is a deliberate no-op beyond its announcement: by the
  // time the boss's own auto-fire runs (step 3), this round's lane-exchange damage TO the enemy
  // already happened in step 2 — there's no sensible "shield the boss" moment left for it to
  // protect, so assigning this effect to a faction's own special simply announces and does nothing
  // further, the same "fires and announces, no mechanical effect" fallback this file's header
  // comment already documents for solo battles.
}

// Applies one already-cast REFLECT_DAMAGE's numeric effect, given this round's REAL outcome
// (`roundInfo`, the exact shape resolveRaidRound returns — never available until that call has
// run). Exported separately from applyRaidSpecialAttack (rather than folded back into it) so
// closeRound's deferred "step 2.5" can apply a queued player cast WITHOUT re-pushing its
// specialEvent a second time — that already happened in step 1, the instant it was cast.
export function applyReflectDamage(raid, alive, attack, caster, roundInfo, event = null, partyShielded = false) {
  const incoming = caster.side === 'PLAYER'
    // Total damage the boss's one shared action actually dealt across the whole party this
    // round — not raid.enemyHpRemaining-adjacent at all, purely "how much did the party just get
    // hit for," which is already 0 whenever the boss's own action that round was a block.
    ? roundInfo.perParticipant.reduce((sum, r) => sum + (r.playerDamage || 0), 0)
    // Total damage the party actually dealt to the boss this round (already 0 if every
    // participant missed/was blocked).
    : roundInfo.enemyDamageDealt
  const reflected = Math.round(incoming * attack.reflectPercent / 100)
  // Flags the SAME specialEvents entry the cast already announced (see applyRaidSpecialAttack)
  // so describeRaidSpecialEvent/the client can say it fizzled instead of implying it did
  // something — there was simply no incoming/outgoing damage this round to reflect, OR (enemy-cast
  // only) the party's own SHIELD_PARTY is up this round, same as every other boss-cast damaging
  // effect's own partyShielded check.
  if (caster.side !== 'PLAYER' && partyShielded) { if (event) event.fizzled = true; return }
  if (event) event.fizzled = reflected <= 0
  if (reflected <= 0) return
  if (caster.side === 'PLAYER') {
    raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - reflected)
  } else {
    // Same "full amount to every alive participant" AoE convention DAMAGE_OPPONENT's own
    // boss-cast branch already uses above — not divided among the party.
    for (const p of alive) {
      p.hpRemaining = Math.max(0, p.hpRemaining - reflected)
      if (p.hpRemaining <= 0 && !p.knockedOutAt) p.knockedOutAt = Date.now()
    }
  }
}

// Applies one already-cast SIPHON_HEALTH's numeric effect. `roundInfo.enemyAction` is this
// round's EFFECTIVE boss action (post-paralysis-override, exactly as resolveRaidRound used it) —
// a player-cast siphon fizzles outright if that was a block, the one way this effect (and
// REFLECT_DAMAGE) differs from every flat-amount effect above, which always lands regardless of
// what the opponent chose. A boss-cast siphon instead checks EACH alive participant's own
// `roundInfo.perParticipant[].action` independently — some can block it while others can't, same
// "no shared lane, no shared fate" AoE shape SIPHON_HEALTH shares with DAMAGE_OPPONENT's own
// boss-cast branch, just with the added per-target block check neither of those needs.
export function applySiphonHealth(raid, alive, attack, caster, roundInfo, event = null, partyShielded = false) {
  if (caster.side !== 'PLAYER' && partyShielded) {
    // Same partyShielded short-circuit every other boss-cast damaging effect now has — checked
    // before the per-target block check below so a shielded party never even gets asked whether
    // they individually blocked; the shield already settled it for everyone this round.
    if (event) event.fizzled = true
    return
  }
  if (caster.side === 'PLAYER') {
    // Flags the SAME specialEvents entry the cast already announced (see
    // applyRaidSpecialAttack) so describeRaidSpecialEvent/the client can say it was blocked
    // instead of implying it landed — this is the one outcome, by design, where casting this
    // effect does nothing at all.
    const blockedOutright = isBlock(roundInfo.enemyAction)
    if (event) event.fizzled = blockedOutright
    if (blockedOutright) return
    raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - attack.amount)
    const heal = Math.round(attack.amount * attack.siphonPercent / 100)
    if (heal <= 0) return
    const casterParticipant = raid.participants.get(caster.userId)
    if (attack.healsAllies) {
      // `alive` here is the snapshot closeRound captured at the TOP of the round, before this
      // round's lane exchange could knock anyone out — unlike HEAL_SELF's own healsAllies branch
      // above (which only ever fires in step 1, before any of this round's knockouts happen),
      // this one resolves in step 2.5, AFTER them. Without this guard, a party member knocked out
      // earlier this very round would get healed back to a positive hpRemaining while
      // knockedOutAt stays set — alive everywhere else in the engine, dead on the HP bar. Same
      // defensive check the boss-cast AoE branch below already uses.
      for (const p of alive) { if (!p.knockedOutAt) p.hpRemaining = Math.min(p.maxHp, p.hpRemaining + heal) }
    } else if (casterParticipant && !casterParticipant.knockedOutAt) {
      casterParticipant.hpRemaining = Math.min(casterParticipant.maxHp, casterParticipant.hpRemaining + heal)
    }
  } else {
    let totalDealt = 0
    for (const row of roundInfo.perParticipant) {
      if (isBlock(row.action)) continue // this participant personally blocked -- immune
      const p = raid.participants.get(row.userId)
      if (!p || p.knockedOutAt) continue
      p.hpRemaining = Math.max(0, p.hpRemaining - attack.amount)
      if (p.hpRemaining <= 0 && !p.knockedOutAt) p.knockedOutAt = Date.now()
      totalDealt += attack.amount
    }
    // AoE, not single-lane: "fizzled" here means EVERY alive participant blocked it, not that one
    // of several did — unlike the player-cast branch above, which has only one shared boss action
    // to check against.
    if (event) event.fizzled = totalDealt <= 0
    if (totalDealt > 0) {
      raid.enemyHpRemaining = Math.min(raid.enemyStats.maxHp, raid.enemyHpRemaining + Math.round(totalDealt * attack.siphonPercent / 100))
    }
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
  if (p.pendingJoin && !p.cMoonId) return { cMoon: null, rank: null, isCaptain: false, prestigeLevel: 0 }
  const legacy = !p.cMoonId && participantCMoonId(raid, p) === raid.cMoonId
  return {
    cMoon: {
      id: participantCMoonId(raid, p) || null,
      name: p.cMoonName || (legacy ? raid.cMoonName : null) || null,
      color: p.cMoonColor || null,
      avatarPath: p.cMoonAvatarPath || null,
      // Whether the TEAM itself is a prestige cMoon — drives CMoonRaidFighter.vue's holographic
      // shimmer treatment. Snapshotted once at join, same as every other field here; a legacy
      // participant predates that snapshot field, so it falls back to the raid's own cMoon flag
      // exactly like name above falls back to raid.cMoonName.
      isPrestigeCMoon: !!(p.cMoonIsPrestige ?? (legacy ? raid.cMoonIsPrestige : false)),
    },
    rank: p.rankName
      ? { name: p.rankName, tierName: p.rankTierName || null, tierLevel: p.rankTierLevel || 0, tierCount: p.rankTierCount || 0 }
      : null,
    // Snapshotted once at join, same as every other field here — see loadParticipantProfile in
    // cmoonRaidSocket.js. Purely cosmetic (CMoonRaidFighter.vue's own captain glow/badge, and the
    // one-time "a captain has entered the battle" banner on the raid page) — no gameplay effect,
    // same "a leadership title overriding the shown label only" stance CAPTAIN_DISPLAY_RANK_NAME
    // already takes everywhere else a cMoon captain is surfaced (cZone, standings, leaderboard).
    // Sent to both the in-raid roster AND the Raid Boss Lobby listing (buildRaidLobbyEntry also
    // spreads this) — a captain in the party is exactly the kind of thing that should make a
    // browsing player want to join, not just something shown once they're already in.
    isCaptain: !!p.isCaptain,
    // This PLAYER's own prestige level (not the team's) — the "✦ Prestige N" badge. Also sent to
    // the lobby listing for the same "worth joining" reasoning as isCaptain above.
    prestigeLevel: p.prestigeLevel || 0,
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
