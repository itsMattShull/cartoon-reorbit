// server/utils/cmoonRaidSocket.js
//
// Real-time runtime for cMoon Enemy Battles "raid boss" co-op fights: up to 4 cMoon members —
// from ANY cMoons, not just the initiator's — fighting a single CMoonEnemyMember (isRaidBoss =
// true) together, live, all facing the same rolled enemy action every round. Open raids are
// listed in the Raid Boss Lobby (cmoonraid:lobbySubscribe below; UI in
// components/newsite/CMoonRaidLobbyModal.vue on the cMoons nav page), and every cMoon member is
// notified when one opens. Each participant fights for, and is credited to, their OWN cMoon —
// see "Cross-cMoon raids" in cmoonEnemyRaid.js for the per-participant snapshot this relies on. Registered per-connection from socket-server.js exactly
// like registerOgGtoons/registerPokemonBattle:
//
//   import { registerCMoonRaid, startCMoonRaidSweep, restoreCMoonRaids } from './utils/cmoonRaidSocket.js'
//   ...
//   io.on('connection', socket => {
//     ...
//     registerCMoonRaid(io, socket, resolveSocketUser)
//   })
//   startCMoonRaidSweep(io)
//   restoreCMoonRaids()
//
// ── Why this lives outside the REST cMoon Enemy Battles endpoints ─────────────────────────────
// server/api/cmoon/battle/*.post.js (the solo 1v1 mode) is a stateless request/response cycle —
// each round is one HTTP call because there's no live opponent to coordinate with (see
// CMoonEnemyBattle's own schema comment). A raid has up to 4 real people who all need to see each
// other's moves land in the same instant, which a request/response API cannot do — hence this
// file, following the same Socket.IO pattern the rest of this codebase's other live multiplayer
// features (Clash, original gToons, Pokemon battles) already use. There is deliberately NO REST
// endpoint for starting, joining, or acting in a raid.
//
// ── Round model ("one shared boss move per round") ─────────────────────────────────────────────
// Every round the enemy rolls exactly ONE action (rollEnemyAction) and EVERY alive participant's
// own chosen action is resolved against that same value (resolveRaidRound in cmoonEnemyRaid.js) —
// a deliberate design choice so the party is genuinely facing one fight together, not four
// coincidentally-simultaneous 1v1s that happen to share an HP bar. The enemy's action for the
// round in progress is never sent to a client before the round resolves — same blind-pick
// discipline the solo battle already has ("the enemy's action is always rolled here, never
// revealed before the player's own is locked in").
//
// A round closes the moment every currently-alive participant has submitted an action, OR when
// its deadline passes (see ROUND_TIMEOUT_SECONDS) — whichever comes first. A participant who
// hasn't acted by the deadline is auto-filled with a uniform-random action (rollEnemyAction is
// reused for this — it is already exactly "pick 1 of 4 actions uniformly," it does not matter
// that its name says "enemy") so one AFK party member can never freeze the raid forever. A
// participant whose own HP reaches 0 is knocked out: they stop being asked for actions and no
// longer block a round from closing, but their CMoonEnemyRaidParticipant row is never removed —
// on a party WIN they still receive the shared reward (see resolveCMoonRaidOutcome), since the
// whole point of one shared roll is that nobody who showed up loses out to bad personal luck.
//
// ── Security ────────────────────────────────────────────────────────────────────────────────
// Every handler resolves the acting user via resolveSocketUser(socket) — the same helper every
// other socket feature in this codebase uses — never a client-supplied userId. Eligibility
// (in a cMoon, active, not banned, no other active raid or solo battle, personal win count
// against this member's minPriorDefeats) is re-checked fresh against the database on EVERY
// raid:start/raid:join, never trusted from a stale client-held snapshot. The enemy's own action
// and every OTHER participant's chosen action for the round in progress are never sent to a
// client before that round resolves.
//
// ── Process locality ────────────────────────────────────────────────────────────────────────
// Like ogGtoonsSocket.js, raid state here is in-memory and single-process by design (mirrored to
// Redis for restart survival — see cmoonRaidRedisState.js). Emits use io.local for the same
// reason: nothing here is sharded across processes, so a plain io.to() would round-trip every
// payload through the Redis adapter for nothing.
//
// ── Timers ──────────────────────────────────────────────────────────────────────────────────
// Rather than one setTimeout per raid per phase (join window, then one per round) — which would
// need careful clearTimeout bookkeeping and cannot survive a process restart without being
// reconstructed — a single periodic sweep (see startCMoonRaidSweep, every SWEEP_INTERVAL_MS)
// scans every in-memory raid and closes any join window or round whose deadline has passed. This
// also means a raid restored from Redis after a restart (see restoreCMoonRaids) needs no special
// timer-reconstruction logic at all: it simply gets caught by the next sweep tick once its
// deadline passes. The cost is a few seconds of extra latency on a deadline firing exactly on
// time, which is a fine trade for a mini-game with no competitive-precision requirement.

import { randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { getGlobalConfig, getPlayerCombatMaxHp, resolveEffectiveSpecialAttack, isCMoonCaptain, displayRankName } from './cmoon.js'
import { grantRewardInTx, enqueueCtoonJobs, processAchievementsForUser } from './achievements.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'
import { announceCMoonRaidBoss, resolveCMoonRaidDiscordChannelId, sendCMoonTeamUpdate, startThreadFromMessage } from './discord.js'
import { getActiveBossLoreRiddle } from './cmoonRiddle.js'
import { notifyCMoonRaidLobbyOpened } from './notifications.js'
import { pushUserNotifications } from './realtimeNotify.js'
import {
  buildGrantableReward, isValidPlayerSubmittedAction, rollEnemyAction, rollEnemyRewards, PLAYER_MAX_HP,
  SPECIAL_ACTION, PARALYZED_ACTION, HIT_STREAK_THRESHOLD, mergeTauntPools,
} from './cmoonEnemyBattle.js'
import { resolveMemberSoundPaths, RAID_ROUND_LIMIT_MIN, RAID_ROUND_LIMIT_MAX } from './cmoonEnemy.js'
import { markEnemyOfferAccepted } from './cmoonEnemyAnalytics.js'
import { announceTeamEnemiesMilestone, checkAndAnnounceSeasonGoalReached } from './cmoonDiscordEvents.js'
import {
  resolveRaidRound, JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_PARTY_SIZE, RAID_MAX_ROUNDS_SAFETY,
  checkRaidBossAvailability, applyRaidSpecialAttack, participantCMoonId, raidCMoonIds, raidPartyLabel,
  splitRaidPoints, rankTierLevel, publicParticipantTeam, buildRaidLobby, rollWindUpMove,
} from './cmoonEnemyRaid.js'
import * as raidRedis from './cmoonRaidRedisState.js'

const SWEEP_INTERVAL_MS = 2000
const EV = (name) => `cmoonraid:${name}`
const raidRoom = (raidId) => `cmoonraid:room:${raidId}`
// Every socket with the Raid Boss Lobby open (see cmoonraid:lobbySubscribe) — gets the full open
// raid list pushed whenever it changes.
const LOBBY_ROOM = 'cmoonraid:lobby'
const REWARD_METHOD = 'CMOON_ENEMY_RAID_WIN'

/* ── In-memory state (single-process — see header) ──────────────────────────────────────────
 * raid: {
 *   id, enemyMemberId, cMoonId, cMoonName, status: 'FORMING'|'IN_PROGRESS'|'RESOLVED',
 *   discordChannelId,                        // resolved once at creation, see resolveCMoonRaidDiscordChannelId
 *   discordThreadId,                         // set once the "call to arms" thread is created (may lag
 *                                             // the raid's own creation by a round trip) — null until
 *                                             // then, and forever if thread creation failed; see
 *                                             // raidDiscordPostTarget below for the fallback this implies
 *   enemyName, enemyImagePath,               // display snapshot, taken once at creation
 *   enemySounds: { appearSoundPath, damageTakenSoundPath, damageAvoidedSoundPath,
 *                  attackingSoundPath, victorySoundPath, defeatSoundPath },  // ditto
 *   battleMusicPath,                         // ditto — the faction's own looping battle music
 *   enemyStats: { maxHp, critChanceAgainstPercent, critChanceFromPercent, cMoonPointsReward },
 *   enemyHpRemaining, roundNumber, currentEnemyAction, roundDeadlineAt, joinDeadlineAt,
 *   participants: Map<userId, { userId, username, hpRemaining, maxHp, knockedOutAt, isInitiator,
 *                                pendingAction, joinedAt,
 *                                hitStreak,       // consecutive-landed-hit counter; firing a
 *                                specialCharged,  // charged special BANKS any amount over
 *                                                 // HIT_STREAK_THRESHOLD rather than zeroing it
 *                                                 // (5 hits, fire at 3 -> 2 banked toward the
 *                                                 // next charge) — see closeRound's own comment.
 *                                // per-participant snapshot taken at start/join — see
 *                                // "Cross-cMoon raids" in cmoonEnemyRaid.js:
 *                                cMoonId, cMoonName, cMoonColor, cMoonAvatarPath,
 *                                rankName, rankTierName, rankTierLevel, rankTierCount,
 *                                specialAttack,
 *                                isCaptain }>,   // whether THEY were a captain of THEIR OWN
 *                                                // cMoon at join time (CMoonCaptain — see
 *                                                // server/utils/cmoon.js's own comment) — purely
 *                                                // cosmetic (CMoonRaidFighter.vue's glow/badge,
 *                                                // the raid page's one-time entrance banner),
 *                                                // never a gameplay effect. A raid can have zero,
 *                                                // one, or several captains at once, from the
 *                                                // same or different cMoons.
 *   roundLog: [], startedAt, combatStartedAt, endedAt, outcome, resolving,
 *
 *   // ── Special attacks (see CMoonSpecialAttack's own schema comment and this file's sibling
 *   // cmoonEnemyRaid.js header comment for the full party-wide-vs-per-participant design) ────
 *   cMoonSpecialAttack,   // the INITIATOR's cMoon special, kept only so a participant restored
 *                         // from a pre-cross-cMoon Redis snapshot (no own `specialAttack` field)
 *                         // can still fire theirs — see restoreCMoonRaids. Live code reads each
 *                         // participant's OWN p.specialAttack instead: in a cross-cMoon party
 *                         // every member fires their own cMoon's special.
 *   enemySpecialAttack,   // same shape, from enemyMember.faction.specialAttack, or null — NEVER
 *                         // sent to a client in advance (see publicRaidView), same "don't spoil
 *                         // the enemy's kit" stance the solo battle already takes.
 *   enemyHitStreak,       // the boss's own SHARED streak — advances the instant its one rolled
 *                         // action lands on at least one alive participant, resets otherwise.
 *   partyAtkBonus,        // PERMANENT net damage modifier EVERY participant's own landed hit gets,
 *   enemyAtkBonus,        // for the rest of the fight — driven ONLY by LOWER_OPPONENT_ATTACK
 *                         // (lowered by the boss's own cast against the party -> partyAtkBonus;
 *                         // lowered by a player's cast against the boss -> enemyAtkBonus), and
 *                         // cumulative/stacking across casts, same as a solo battle. The OTHER
 *                         // contributor to each side's effective attack bonus is the time-limited,
 *                         // non-stacking raise pair just below — resolveRaidRound is always
 *                         // called with the SUM of this permanent value and whichever raise is
 *                         // currently active (see closeRound), never this field alone.
 *   partyAtkRaiseAmount,          // RAISE_ALLY_ATTACK's own non-stacking, time-limited pair — at
 *   partyAtkRaiseTurnsRemaining,  // most ONE attack-raise can be active for the party at once (a
 *   enemyAtkRaiseAmount,          // cast while turnsRemaining > 0 is a no-op, see
 *   enemyAtkRaiseTurnsRemaining,  // applyRaidSpecialAttack), amount/turnsRemaining set together
 *                                 // when one fires (from attack.amount/raiseDurationRounds) and
 *                                 // turnsRemaining decremented by 1 every round it's active — the
 *                                 // instant it hits 0, amount is zeroed too and a fresh raise can
 *                                 // fire again. The enemy pair is its own self-raise (meaningless
 *                                 // unless the faction's special is itself RAISE_ALLY_ATTACK,
 *                                 // since a solo boss has no real "allies" either).
 *   enemyParalyzedTurns,  // rounds left where the boss's one shared action whiffs for everyone —
 *   partyParalyzedTurns,  // set by a PLAYER's PARALYZE_OPPONENT. Rounds left where EVERY alive
 *                         // participant's own action whiffs that round regardless of what they
 *                         // chose/were auto-filled with — set by the boss's own auto-fired
 *                         // PARALYZE_OPPONENT (see this feature's "whole party" boss-target
 *                         // decision). Both decrement by 1 every round they're used, same
 *                         // "elapses the round it's consulted in" semantics as the solo battle —
 *                         // and, like the raise pair above, non-stacking: a cast while already
 *                         // > 0 is a no-op rather than adding to the remaining turns.
 *
 *   // ── Lobby controls / up to 8 players / private lobbies / wind-up telegraphs ──────────────
 *   maxParticipants,      // this party's own cap, 1-8, snapshotted from
 *                         // CMoonEnemyMember.maxParticipants at creation (see cmoonraid:start).
 *   roundLimit,           // this raid's own round-count safety valve, 50-400, snapshotted from
 *                         // CMoonEnemyMember.raidRoundLimit at creation — see closeRound's own
 *                         // ABANDONED branch.
 *   isPrivate,            // never listed in the site-wide lobby / notified / announced when true
 *                         // (see CMoonEnemyRaid.isPrivate) — still joinable by anyone with the URL.
 *   leaderKeepOpen,       // the initiator has paused sweep()'s join-window auto-start.
 *   speedVotes,           // Set<userId> of current participants who voted to cut the join window
 *                         // down to 5s (see maybeApplySpeedVote) — NOT JSON-serializable, stored
 *                         // as a plain array in Redis and rebuilt into a Set on restore.
 *   windUpMoves,          // this boss's own CMoonEnemyWindUpMove rows, snapshotted at creation —
 *                         // empty unless CMoonEnemyMember.windUpEnabled was true then.
 *   currentWindUp,        // { message, direction, bonusType, bonusAmount } for the round in
 *                         // progress if one of windUpMoves just fired (see openRound), else null —
 *                         // only message/direction are ever sent to a client (see publicRaidView).
 * }
 */
const raids = new Map()       // raidId -> raid
const raidByUser = new Map()  // userId -> raidId

function fireSync(raidId, raid) {
  raidRedis.setCMoonRaid(raidId, raid).catch(e => console.error('[cmoonRaidRedisState] setCMoonRaid:', e))
}
function fireDelete(raidId) {
  raidRedis.delCMoonRaid(raidId).catch(e => console.error('[cmoonRaidRedisState] delCMoonRaid:', e))
}

function destroyRaid(raidId) {
  const raid = raids.get(raidId)
  if (!raid) return
  for (const uid of raid.participants.keys()) {
    if (raidByUser.get(uid) === raidId) raidByUser.delete(uid)
  }
  raids.delete(raidId)
  fireDelete(raidId)
  broadcastLobby()
}

/* ── Raid Boss Lobby ──────────────────────────────────────────────────────────────────────────
 * The `io` the lobby pushes through — set by registerCMoonRaid/startCMoonRaidSweep (both run with
 * the one socket-server io), so lifecycle helpers without an io parameter (destroyRaid) can still
 * refresh the lobby. Coalesced to one push per tick: a burst of joins/leaves/starts in the same
 * tick sends the list once, not once per change.
 */
let lobbyIo = null
let lobbyPushQueued = false
function broadcastLobby() {
  if (!lobbyIo || lobbyPushQueued) return
  lobbyPushQueued = true
  setImmediate(() => {
    lobbyPushQueued = false
    try {
      lobbyIo.local.to(LOBBY_ROOM).emit(EV('lobby'), { raids: buildRaidLobby(raids.values()), serverNow: Date.now() })
    } catch (err) {
      console.error('[cmoonRaidSocket] lobby broadcast failed:', err?.message || err)
    }
  })
}

/* ── Serialization ────────────────────────────────────────────────────────────────────────── */

// Never includes currentEnemyAction (hidden until the round resolves) or any participant's
// pendingAction VALUE — only whether they've locked one in, so the room can see who's still
// deciding without seeing what anyone chose.
function publicRaidView(raid) {
  return {
    id: raid.id,
    enemyMemberId: raid.enemyMemberId,
    cMoonId: raid.cMoonId,
    status: raid.status,
    enemyName: raid.enemyName,
    enemyImagePath: raid.enemyImagePath,
    // Snapshotted once at creation (see the `raid` object's own shape comment below) — six
    // optional battle sounds (already resolved against the faction's own defaults, see
    // resolveMemberSoundPaths) plus the faction's looping battle music, so the raid page can give
    // this fight the same shake/sound/music "juice" components/CMoonBattlePopupHost.vue already
    // gives a solo battle. Null fields mean silent, not an error — same convention as the solo
    // battle's own enemy serialization.
    enemySounds: raid.enemySounds,
    battleMusicPath: raid.battleMusicPath,
    // Snapshotted once at creation, same as enemySounds/battleMusicPath above — the full active
    // taunt pool for each trigger moment (see CMoonEnemyTaunt's own schema comment), sent as a
    // list rather than one pre-picked line so the client does its own random pick at the actual
    // moment (appear once at FORMING, crit on a round where the boss lands one), mirroring the
    // solo popup's own useCMoonBattlePopup.js pickRandomTaunt. null when the faction has none
    // configured for either trigger, never an error.
    enemyTaunts: raid.enemyTaunts || null,
    enemyMaxHp: raid.enemyStats.maxHp,
    enemyHpRemaining: raid.enemyHpRemaining,
    roundNumber: raid.roundNumber,
    joinDeadlineAt: raid.joinDeadlineAt,
    roundDeadlineAt: raid.roundDeadlineAt,
    outcome: raid.outcome || null,
    // No party-wide special here any more: each participant carries their OWN cMoon's special
    // (participants[].specialAttack below), since a cross-cMoon party has one per team. Never
    // enemySpecialAttack: the boss's own kit stays unrevealed until it actually fires (see each
    // round's own `specials`, broadcast via cmoonraid:roundResolved), same as the solo battle.
    // The boss's own charge progress toward auto-firing its special — intentionally shown (unlike
    // its actual identity/effect) so the party gets some "it's about to do something" tension, the
    // same way a lot of boss fights telegraph an incoming attack without naming it outright.
    enemyHitStreak: raid.enemyHitStreak || 0,
    enemyParalyzedTurns: raid.enemyParalyzedTurns || 0,
    partyParalyzedTurns: raid.partyParalyzedTurns || 0,
    // Whether the party's one-at-a-time attack-raise buff is currently active, and for how many
    // more rounds — surfaced so the client can show why a second RAISE_ALLY_ATTACK cast had no
    // effect (see applyRaidSpecialAttack's own non-stacking comment), same spirit as the paralyze
    // counters just above. The enemy's own mirror is never sent, matching enemySpecialAttack's own
    // "don't reveal the boss's kit in advance" stance.
    partyAtkRaiseTurnsRemaining: raid.partyAtkRaiseTurnsRemaining || 0,
    // How many players this raid's party can hold — snapshotted from
    // CMoonEnemyMember.maxParticipants at creation (1-8); the client reads this instead of a
    // hardcoded "4" for slot counts/labels.
    maxParticipants: raid.maxParticipants || MAX_PARTY_SIZE,
    // Lobby controls (see cmoonraid:toggleKeepOpen/forceStart/voteSpeedUp below) — whether the
    // leader has paused the join-window countdown, and how many current participants have voted
    // to speed the countdown up to 5 seconds.
    leaderKeepOpen: !!raid.leaderKeepOpen,
    speedVoteCount: raid.speedVotes ? raid.speedVotes.size : 0,
    // Whether this raid is invite-only (see CMoonEnemyRaid.isPrivate) — display-only; the actual
    // discoverability/eligibility enforcement happens server-side (buildRaidLobby, the join
    // handler's notify/announce gating).
    isPrivate: !!raid.isPrivate,
    // The boss's current wind-up telegraph, if one fired this round — a DELIBERATE, narrow
    // exception to this function's usual "never reveal the enemy's action in advance" rule (see
    // this function's own header comment): a telegraph is SUPPOSED to be visible before it
    // resolves, so players can react. Only the public message/lane are ever exposed here — the
    // configured bonus amount/type stay server-side only (see raid.currentWindUp's own shape,
    // set in openRound) until it actually applies and shows up in a round's own broadcast.
    currentWindUp: raid.currentWindUp ? { message: raid.currentWindUp.message, direction: raid.currentWindUp.direction } : null,
    participants: Array.from(raid.participants.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      hpRemaining: p.hpRemaining,
      // Per-participant, not a single shared value — a party can genuinely have different max
      // HPs if members' cMoon ranks differ (see getPlayerCombatMaxHp() in server/utils/cmoon.js).
      // The client's own PLAYER_MAX_HP constant is gone; this is the only source of truth now.
      maxHp: p.maxHp,
      knockedOut: !!p.knockedOutAt,
      isInitiator: p.isInitiator,
      hasActed: raid.status === 'IN_PROGRESS' && !p.knockedOutAt ? !!p.pendingAction : false,
      // Shown to the WHOLE party, not just this participant themselves — seeing a teammate's
      // meter climb is part of the co-op "epic" feel this feature asked for, and it's no more
      // revealing than their own HP bar already is (unlike the enemy's own kit above, there's no
      // balance-sensitive secret here to protect).
      hitStreak: p.hitStreak || 0,
      specialCharged: !!p.specialCharged,
      // This participant's OWN cMoon special (their team's, not the initiator's) — public on
      // purpose: it's that team's kit, shown on their charge meter and their own fire button.
      specialAttack: p.specialAttack || null,
      // Team colors + rank to show off on the raid screen — see publicParticipantTeam.
      ...publicParticipantTeam(raid, p),
      // Both null/false until the raid actually resolves (see resolveCMoonRaidOutcome, which
      // mutates these directly onto this same in-memory participant object) — a reward
      // breakdown and first-victory flag for the RESOLVED screen, same shape/intent as the solo
      // battle's own rewardsGranted/isFirstWinAgainstThisEnemy.
      rewardsGranted: p.rewardsGranted || null,
      isFirstWinAgainstThisEnemy: !!p.isFirstWinAgainstThisEnemy,
    })),
  }
}

function broadcast(io, raid, event, extra) {
  io.local.to(raidRoom(raid.id)).emit(event, { ...publicRaidView(raid), ...extra })
}

/* ── Eligibility (re-checked fresh on every start/join — never trusted from a client) ───────── */

// `reservedForRaidId`: lets a caller that has already reserved this user's slot skip the
// "already in a raid" rejection for that one raid. cmoonraid:join no longer needs it — it now runs
// this BEFORE reserving (see its own comment) and re-checks raidByUser synchronously after.
async function loadEligibility({ userId, enemyMember, reservedForRaidId = null }) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, cMoonId: true, active: true, banned: true },
  })
  if (!user || !user.active || user.banned) return { ok: false, message: 'Not eligible to battle' }
  if (!user.cMoonId) return { ok: false, message: 'You must be in a cMoon to join a raid' }
  const activeRaidId = raidByUser.get(userId)
  if (activeRaidId && activeRaidId !== reservedForRaidId) return { ok: false, message: 'You are already in a raid' }
  const activeSolo = await db.cMoonEnemyBattle.findFirst({ where: { userId, status: 'IN_PROGRESS' }, select: { id: true } })
  if (activeSolo) return { ok: false, message: 'Finish your current battle before joining a raid' }
  if (enemyMember.minPriorDefeats > 0) {
    const wins = await db.cMoonEnemyBattle.count({ where: { userId, outcome: 'WIN' } })
    if (wins < enemyMember.minPriorDefeats) {
      return { ok: false, message: 'You have not defeated enough enemies to face this one yet' }
    }
  }
  return { ok: true, user }
}

/* ── Per-participant team/rank/special snapshot ──────────────────────────────────────────────
 * Taken once when a player starts or joins (see "Cross-cMoon raids" in cmoonEnemyRaid.js), never
 * re-read mid-fight: the raid credits and displays the team they joined as, even if they switch
 * cMoons before it resolves. Returns null if the cMoon no longer exists.
 */
let tierCache = { at: 0, tiers: [] }
const TIER_CACHE_MS = 5 * 60 * 1000
async function loadRankTiers() {
  if (Date.now() - tierCache.at < TIER_CACHE_MS) return tierCache.tiers
  const tiers = await db.cMoonRankTier.findMany({ select: { id: true, sortOrder: true } })
  tierCache = { at: Date.now(), tiers }
  return tiers
}

async function loadParticipantProfile(userId, cMoonId) {
  const [cMoon, user, tiers, isCaptain] = await Promise.all([
    db.cMoon.findUnique({
      where: { id: cMoonId },
      select: { id: true, name: true, color: true, avatarPath: true, specialAttack: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { currentCMoonRank: { select: { name: true, cMoonId: true, tierId: true, tier: { select: { name: true } } } } },
    }),
    loadRankTiers().catch(() => []),
    // Snapshotted once here, same as every other field in this profile — a captain demoted
    // mid-raid keeps the cosmetic treatment for that raid, same "settings persist independent of
    // live changes" stance the rest of this snapshot already takes (team colors, rank, special).
    isCMoonCaptain(cMoonId, userId),
  ])
  if (!cMoon) return null
  // A rank belongs to one cMoon; a leftover rank from a team they've since left isn't shown.
  const rank = user?.currentCMoonRank && user.currentCMoonRank.cMoonId === cMoon.id ? user.currentCMoonRank : null
  // This participant's EFFECTIVE special attack — their own chosen one (see
  // User.chosenSpecialAttackId) if it's still playerChoice-enabled, else their cMoon's own
  // assigned special, exactly like the solo battle now resolves it (see resolveEffectiveSpecialAttack
  // in server/utils/cmoon.js). Snapshotted once here, same as the rest of this profile.
  const specialAttack = await resolveEffectiveSpecialAttack(userId, cMoon.specialAttack)
  return {
    cMoonId: cMoon.id,
    cMoonName: cMoon.name,
    cMoonColor: cMoon.color || null,
    cMoonAvatarPath: cMoon.avatarPath || null,
    isCaptain,
    // Overrides the DISPLAYED rank name only, same "Captain" label swap every other surface
    // (cZone, standings, leaderboard) already applies — see displayRankName's own comment.
    // rankTierLevel/rankTierCount below are untouched, so the chevron insignia still reflects
    // their real earned tier underneath the label.
    rankName: displayRankName(rank?.name || null, isCaptain),
    rankTierName: rank?.tier?.name || null,
    rankTierLevel: rank ? rankTierLevel(tiers, rank.tierId) : 0,
    rankTierCount: tiers.length,
    specialAttack: specialAttack || null,
  }
}

/* ── Calling every cMoon to the Raid Boss Lobby at raid:start ─────────────────────────────────
 * Raids are cross-cMoon, so every eligible cMoon member hears about it, not just the
 * initiator's team: in a cMoon, active, not banned, not opted out of cMoon enemy popups (a player
 * who turned those off doesn't want raid interruptions either), and with enough personal wins for
 * this boss's minPriorDefeats. One batched write (notifyCMoonRaidLobbyOpened), collapsed into a
 * single unread "×N" alert per player. Fire-and-forget: a failed notification must never fail
 * or roll back the raid, same stance server/utils/discord.js's announce* functions take.
 */
async function notifyRaidLobbyOpened(io, { initiatorUserId, initiatorUsername, enemyMember, cMoonName }) {
  try {
    const candidates = await db.user.findMany({
      where: {
        cMoonId: { not: null }, id: { not: initiatorUserId },
        active: true, banned: false, allowCMoonEnemyPopups: true,
      },
      select: { id: true },
    })
    if (!candidates.length) return
    let eligibleIds = candidates.map(c => c.id)
    if (enemyMember.minPriorDefeats > 0) {
      const winCounts = await db.cMoonEnemyBattle.groupBy({
        by: ['userId'], where: { userId: { in: eligibleIds }, outcome: 'WIN' }, _count: { _all: true },
      })
      const winsById = new Map(winCounts.map(w => [w.userId, w._count._all]))
      eligibleIds = eligibleIds.filter(id => (winsById.get(id) || 0) >= enemyMember.minPriorDefeats)
    }
    const written = await notifyCMoonRaidLobbyOpened(db, {
      userIds: eligibleIds, enemyName: enemyMember.name, initiatorUsername, cMoonName,
    })
    // Live "go refetch" ping for whoever has a tab open; everyone else gets it on their next poll.
    pushUserNotifications(io, written)
  } catch (err) {
    console.error('[cmoonRaidSocket] notifyRaidLobbyOpened failed:', err?.message || err)
  }
}

/* ── Lifecycle ────────────────────────────────────────────────────────────────────────────── */

function addParticipant(raid, { userId, username, isInitiator, maxHp, profile = null, pendingJoin = false }) {
  raid.participants.set(userId, {
    userId, username, hpRemaining: maxHp, maxHp, knockedOutAt: null,
    // True only between cmoonraid:join's synchronous slot reservation and its DB confirmation —
    // no team snapshot yet, so publicParticipantTeam shows no team rather than guessing one.
    pendingJoin: !!pendingJoin,
    isInitiator: !!isInitiator, pendingAction: null, joinedAt: Date.now(),
    hitStreak: 0, specialCharged: false,
    cMoonId: null, cMoonName: null, cMoonColor: null, cMoonAvatarPath: null, isCaptain: false,
    rankName: null, rankTierName: null, rankTierLevel: 0, rankTierCount: 0,
    specialAttack: null,
    ...(profile || {}),
  })
  raidByUser.set(userId, raid.id)
}

// Undo a join reservation for THIS raid only. Never clears raidByUser if it points at a
// different raid — that's the player's real raid, and erasing it would switch off the
// "already in a raid" guard for them.
function releaseReservation(raid, userId) {
  if (raid.participants.get(userId)?.pendingJoin) raid.participants.delete(userId)
  if (raidByUser.get(userId) === raid.id) raidByUser.delete(userId)
  broadcastLobby()
}

function startCombat(io, raid) {
  raid.status = 'IN_PROGRESS'
  raid.combatStartedAt = Date.now()
  openRound(io, raid)
  broadcastLobby() // no longer joinable — the lobby moves it to "battle underway"
}

// ── Wind-up/telegraph moves (see CMoonEnemyWindUpMove's own schema comment) ───────────────────
// When a raid boss has any configured, each round independently rolls whether one fires INSTEAD
// of an ordinary rolled action (rollWindUpMove in cmoonEnemyRaid.js) — if one does, this round's
// enemy action is FORCED to the telegraphed lane (not rolled) so the party can see it coming and
// react, and raid.currentWindUp carries the full move (message/direction/bonus) for closeRound to
// check and apply once the round resolves. Cleared every round regardless, so a round that didn't
// roll one never carries a stale telegraph into the next.
function openRound(io, raid) {
  const windUp = rollWindUpMove(raid.windUpMoves)
  if (windUp) {
    raid.currentEnemyAction = windUp.direction === 'HIGH' ? 'ATTACK_HIGH' : 'ATTACK_LOW'
    raid.currentWindUp = {
      message: windUp.telegraphMessage, direction: windUp.direction,
      bonusType: windUp.bonusType, bonusAmount: windUp.bonusAmount,
    }
  } else {
    raid.currentEnemyAction = rollEnemyAction(raid.enemyStats.attackChancePercent)
    raid.currentWindUp = null
  }
  raid.roundDeadlineAt = Date.now() + ROUND_TIMEOUT_SECONDS * 1000
  for (const p of raid.participants.values()) {
    if (!p.knockedOutAt) p.pendingAction = null
  }
  fireSync(raid.id, raid)
  broadcast(io, raid, EV('roundOpened'))
}

// ── Lobby controls (see cmoonraid:toggleKeepOpen/forceStart/voteSpeedUp below) ─────────────────
// Re-evaluated after every vote AND after every join/leave (the denominator — current participant
// count — changes then too). Once every CURRENT participant has voted and the party isn't already
// full (a full party starts on its own via the join handler, with nothing left to "speed up"),
// clamps the join window down to 5 seconds from now and clears any leaderKeepOpen pause — a leader
// keeping the lobby open can still be overridden by a unanimous party vote.
function maybeApplySpeedVote(raid) {
  if (raid.status !== 'FORMING') return
  const size = raid.participants.size
  const maxParticipants = raid.maxParticipants || MAX_PARTY_SIZE
  if (size === 0 || size >= maxParticipants) return
  if (raid.speedVotes.size < size) return
  raid.joinDeadlineAt = Math.min(raid.joinDeadlineAt, Date.now() + 5000)
  raid.leaderKeepOpen = false
}

function aliveParticipants(raid) {
  return Array.from(raid.participants.values()).filter(p => !p.knockedOutAt)
}

function allActed(raid) {
  const alive = aliveParticipants(raid)
  return alive.length > 0 && alive.every(p => p.pendingAction)
}

// The call-to-arms thread (once created) is where every later raid post goes — keeps the
// per-round feed and recap out of the team's main channel. Falls back to the plain channel if
// the thread was never created (announcement failed, or the thread POST itself failed).
function raidDiscordPostTarget(raid) {
  return raid.discordThreadId || raid.discordChannelId
}

// `enemyHit`/`playerHit` here are named from resolveBattleRound's perspective (see that
// function's own comment): enemyHit = this participant's attack landed ON the enemy,
// playerHit = the enemy's attack landed ON this participant. Checked in priority order so a
// knockout always wins the headline even if it also carries a hit/crit flag.
function describeRaidParticipantResult(raid, result) {
  const name = raid.participants.get(result.userId)?.username || 'A player'
  if (result.knockedOut) return `💥 ${name} was knocked out!`
  if (result.enemyHit) return `⚔️ ${name} landed a hit${result.enemyCrit ? ' (CRIT!)' : ''}`
  if (result.enemyBlocked) return `🚫 ${name}'s attack was blocked`
  if (result.playerHit) return `🩸 ${name} got hit${result.playerCrit ? ' (CRIT!)' : ''}`
  if (result.playerBlocked) return `🛡️ ${name} blocked and healed`
  return `${name} held steady`
}

// A special firing, player-cast or the boss's own auto-fire — see this file's own `specialEvents`
// (built in closeRound) for the shape. Named generically ("unleashed", not "attacked/healed/...")
// since one line has to read naturally for all five effect types.
function describeRaidSpecialEvent(raid, s) {
  const who = s.side === 'PLAYER' ? (raid.participants.get(s.userId)?.username || 'A player') : raid.enemyName
  return `✨ ${who} unleashed **${s.name}**!`
}

// One short Discord message per round for team spectators — see this session's "separate
// message per round" decision (no message-editing support exists to update one in place).
function formatRaidRoundMessage(raid, { enemyDamageDealt, perParticipant, specialEvents }) {
  const header = `⚔️ **Round ${raid.roundNumber}** — ${raidPartyLabel(raid)} vs ${raid.enemyName}`
  const hpLine = `${raid.enemyName} HP: ${raid.enemyHpRemaining}/${raid.enemyStats.maxHp} (-${enemyDamageDealt})`
  const specialLines = (specialEvents || []).map(s => describeRaidSpecialEvent(raid, s))
  const lines = perParticipant.map(r => describeRaidParticipantResult(raid, r))
  return [header, hpLine, ...specialLines, ...lines].join('\n')
}

const RAID_RECAP_HEADLINES = {
  WIN: raid => `🏆 **Victory!** ${raidPartyLabel(raid)} defeated ${raid.enemyName} in ${raid.roundNumber} round${raid.roundNumber === 1 ? '' : 's'}!`,
  LOSS: raid => `💀 **Defeat.** ${raid.enemyName} was too much for ${raidPartyLabel(raid)} (${raid.enemyHpRemaining}/${raid.enemyStats.maxHp} HP left).`,
  ABANDONED: raid => `⌛ The raid against ${raid.enemyName} ran out of rounds and was abandoned.`,
}

// Posted once, right as the raid resolves — the "post-raid recap card" from the brainstorm,
// kept as plain text rather than an embed since every other Discord post in this feature is too.
function formatRaidRecapMessage(raid, { pointsAwarded }) {
  const headline = (RAID_RECAP_HEADLINES[raid.outcome] || (r => `The raid against ${r.enemyName} has ended.`))(raid)
  const lines = [headline]
  if (pointsAwarded > 0) {
    lines.push(raidCMoonIds(raid).length > 1
      ? `+${pointsAwarded} cMoon points earned, shared across every team`
      : `+${pointsAwarded} cMoon points earned`)
  }
  // Each fighter's team tag only when teams are mixed — a one-cMoon raid reads exactly as before.
  const mixed = raidCMoonIds(raid).length > 1
  lines.push(Array.from(raid.participants.values())
    .map(p => `${p.username}${mixed && p.cMoonName ? ` [${p.cMoonName}]` : ''}: ${p.knockedOutAt ? 'knocked out' : `survived (${p.hpRemaining}/${p.maxHp} HP)`}`)
    .join(' • '))
  return lines.join('\n')
}

// applyRaidSpecialAttack now lives in cmoonEnemyRaid.js (pure, unit-tested) — see its comment
// there for the cross-cMoon targeting rules.

async function closeRound(io, raid) {
  if (raid.status !== 'IN_PROGRESS' || raid.resolving) return
  raid.resolving = true
  try {
    const alive = aliveParticipants(raid)
    // A straggler who never acted before the deadline is auto-filled with a uniform-random
    // action (see this file's own header comment) so they can never freeze the round forever.
    // Never SPECIAL_ACTION — only an explicit cmoonraid:action submission can choose that.
    for (const p of alive) if (!p.pendingAction) p.pendingAction = rollEnemyAction()

    const specialEvents = []

    // ── 1. Any PLAYER specials chosen this round fire FIRST, in participant join order — same
    // ordering the solo battle uses (apply the special, THEN resolve the round's lane exchange),
    // so e.g. a freshly-cast PARALYZE_OPPONENT also stops the boss's action THIS round, not just
    // future ones. Each caster fires THEIR OWN cMoon's special (p.specialAttack) — in a
    // cross-cMoon party, teammates from different cMoons bring different kits. Re-checks
    // specialCharged/specialAttack defensively (already validated at submission time in the
    // cmoonraid:action handler below). A special that knocks the boss out early doesn't stop
    // later casters' specials or the lane exchange this round — same as before cross-cMoon. ────
    // Tracked here, applied in step 2 below — the streak itself isn't touched in this loop
    // (see that step's own comment for why: it's the one place that owns hitStreak/specialCharged
    // for the round, and it needs to know who fired to bank correctly rather than just zeroing).
    const firedSpecialUserIds = new Set()
    for (const p of alive) {
      if (p.pendingAction !== SPECIAL_ACTION) continue
      if (!p.specialCharged || !p.specialAttack) continue
      firedSpecialUserIds.add(p.userId)
      applyRaidSpecialAttack(raid, alive, p.specialAttack, { side: 'PLAYER', userId: p.userId }, specialEvents)
    }

    // ── 2. This round's lane exchange — every alive participant's OWN action (SPECIAL_ACTION
    // counts as neither attacking nor blocking, same as solo — see isAttack/isBlock in
    // cmoonEnemyBattle.js) against the ONE shared boss action, both substituted with
    // PARALYZED_ACTION if whichever side is currently stunned (set just above, or carried over
    // from an earlier round) — mirrors the solo battle's own paralysis override exactly, just
    // applied to "the boss" and "the whole party" instead of two individual sides. ─────────────
    const bossParalyzedThisRound = raid.enemyParalyzedTurns > 0
    const partyParalyzedThisRound = raid.partyParalyzedTurns > 0
    const effectiveEnemyAction = bossParalyzedThisRound ? PARALYZED_ACTION : raid.currentEnemyAction

    const { enemyAction, perParticipant, enemyDamageDealt } = resolveRaidRound({
      enemyAction: effectiveEnemyAction,
      enemyMember: raid.enemyStats,
      participants: alive.map(p => ({
        userId: p.userId,
        action: partyParalyzedThisRound ? PARALYZED_ACTION : p.pendingAction,
        hpRemaining: p.hpRemaining, maxHp: p.maxHp,
      })),
      // Effective bonus = the permanent component (LOWER_OPPONENT_ATTACK only, stacking) plus
      // whichever attack-raise buff is currently active (RAISE_ALLY_ATTACK, non-stacking, cleared
      // once its own turns-remaining counter below hits 0) — see raid.partyAtkRaiseAmount's own
      // shape comment for why these are tracked separately rather than folded into
      // partyAtkBonus/enemyAtkBonus directly.
      partyAtkBonus: raid.partyAtkBonus + (raid.partyAtkRaiseTurnsRemaining > 0 ? raid.partyAtkRaiseAmount : 0),
      enemyAtkBonus: raid.enemyAtkBonus + (raid.enemyAtkRaiseTurnsRemaining > 0 ? raid.enemyAtkRaiseAmount : 0),
    })

    for (const result of perParticipant) {
      const p = raid.participants.get(result.userId)
      p.hpRemaining = result.hpRemaining
      p.pendingAction = null
      if (result.knockedOut && !p.knockedOutAt) p.knockedOutAt = Date.now()
      // This participant's OWN streak — see CMoonEnemyRaidParticipant's in-memory shape comment
      // above for why this stays per-player even though every other new field here is shared.
      if (firedSpecialUserIds.has(result.userId)) {
        // Banks whatever they stacked past the 3 needed instead of discarding it — a player who
        // deliberately holds off firing while still landing hits (e.g. reaching 5/3 before using
        // it) keeps the leftover 2 toward their NEXT charge, rather than starting back at 0. The
        // same >= HIT_STREAK_THRESHOLD rule below re-applies here too, so hoarding enough for two
        // charges before firing once correctly leaves this player already charged again.
        p.hitStreak = Math.max(0, p.hitStreak - HIT_STREAK_THRESHOLD)
        p.specialCharged = p.hitStreak >= HIT_STREAK_THRESHOLD
      } else {
        p.hitStreak = result.enemyHit ? p.hitStreak + 1 : 0
        if (p.hitStreak >= HIT_STREAK_THRESHOLD) p.specialCharged = true
      }
    }
    raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - enemyDamageDealt)
    if (raid.enemyParalyzedTurns > 0) raid.enemyParalyzedTurns -= 1
    if (raid.partyParalyzedTurns > 0) raid.partyParalyzedTurns -= 1
    // Same "decrements the round it was just consulted in" semantics as the paralyze counters
    // just above — clearing the amount alongside turnsRemaining hitting 0 is cosmetic (every read
    // site already gates on turnsRemaining > 0 first) but keeps a stale nonzero amount from
    // lingering in Redis snapshots/debugging.
    if (raid.partyAtkRaiseTurnsRemaining > 0) {
      raid.partyAtkRaiseTurnsRemaining -= 1
      if (raid.partyAtkRaiseTurnsRemaining <= 0) raid.partyAtkRaiseAmount = 0
    }
    if (raid.enemyAtkRaiseTurnsRemaining > 0) {
      raid.enemyAtkRaiseTurnsRemaining -= 1
      if (raid.enemyAtkRaiseTurnsRemaining <= 0) raid.enemyAtkRaiseAmount = 0
    }

    // ── 3. The boss's own SHARED streak — advances the instant its one rolled action lands on at
    // least one alive participant this round (see this file's own header comment on why this is
    // one counter, not per-participant) — and its faction's special, if any, auto-fires the
    // moment that streak caps out, same "no choice to make, it just fires" shape the solo battle
    // already uses for the enemy side. ─────────────────────────────────────────────────────────
    const bossLandedAHit = perParticipant.some(r => r.playerHit)
    raid.enemyHitStreak = bossLandedAHit ? raid.enemyHitStreak + 1 : 0
    if (raid.enemyHitStreak >= HIT_STREAK_THRESHOLD && raid.enemySpecialAttack) {
      raid.enemyHitStreak = 0
      // Re-reads `alive` from the Map rather than the stale array captured above — a participant
      // this round's own DAMAGE_OPPONENT/lane exchange just knocked out must not also be hit by
      // the boss's bonus effect this same round (they're already down).
      applyRaidSpecialAttack(raid, aliveParticipants(raid), raid.enemySpecialAttack, { side: 'ENEMY' }, specialEvents)
    }

    // ── 4. Wind-up telegraph payoff — if this round telegraphed a lane (see openRound), check
    // whether EVERY participant who was alive when it opened blocked exactly that lane. `action`
    // on each perParticipant row is already whatever they actually resolved with this round
    // (PARALYZED_ACTION if the party was stunned, so a paralyzed party can never accidentally
    // "earn" this), so no separate re-check against pendingAction is needed. Cleared either way —
    // a telegraph only ever pays off for the one round it was shown on. ───────────────────────
    let windUpBonus = null
    if (raid.currentWindUp) {
      const requiredBlock = raid.currentWindUp.direction === 'HIGH' ? 'BLOCK_HIGH' : 'BLOCK_LOW'
      const everyoneBlocked = perParticipant.length > 0 && perParticipant.every(r => r.action === requiredBlock)
      if (everyoneBlocked) {
        const { bonusType, bonusAmount } = raid.currentWindUp
        if (bonusType === 'HEAL_PARTY') {
          for (const p of aliveParticipants(raid)) p.hpRemaining = Math.min(p.maxHp, p.hpRemaining + bonusAmount)
        } else if (bonusType === 'DAMAGE_ENEMY') {
          raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - bonusAmount)
        }
        windUpBonus = { bonusType, bonusAmount }
      }
      raid.currentWindUp = null
    }

    raid.roundLog.push({
      round: raid.roundNumber, enemyAction, enemyDamageDealt,
      enemyHpRemaining: raid.enemyHpRemaining,
      participants: perParticipant.map(({ userId, action, playerHit, enemyHit, playerBlocked, enemyBlocked, playerCrit, enemyCrit }) =>
        ({ userId, action, playerHit, enemyHit, playerBlocked, enemyBlocked, playerCrit, enemyCrit })),
      ...(specialEvents.length ? { specials: specialEvents } : {}),
      ...(windUpBonus ? { windUpBonus } : {}),
    })

    const everyoneDown = Array.from(raid.participants.values()).every(p => !!p.knockedOutAt)
    const nextRoundNumber = raid.roundNumber + 1

    broadcast(io, raid, EV('roundResolved'), {
      round: { roundNumber: raid.roundNumber, enemyAction, enemyDamageDealt, participants: perParticipant, specials: specialEvents, windUpBonus },
    })
    sendCMoonTeamUpdate(raidDiscordPostTarget(raid), formatRaidRoundMessage(raid, { enemyDamageDealt, perParticipant, specialEvents }))

    if (raid.enemyHpRemaining <= 0) {
      await resolveCMoonRaidOutcome(io, raid, 'WIN')
    } else if (everyoneDown) {
      await resolveCMoonRaidOutcome(io, raid, 'LOSS')
    } else if (nextRoundNumber >= (raid.roundLimit || RAID_MAX_ROUNDS_SAFETY)) {
      await resolveCMoonRaidOutcome(io, raid, 'ABANDONED')
    } else {
      raid.roundNumber = nextRoundNumber
      openRound(io, raid)
    }
  } finally {
    raid.resolving = false
  }
}

// The recap goes to the call-to-arms thread (initiator's team) AND to every other participating
// team's own raid channel, so each cMoon sees how its members did. Deduped: teams without their
// own channel all fall back to the same global raid channel, which should only get it once.
async function postRaidRecap(raid, { pointsAwarded }) {
  const message = formatRaidRecapMessage(raid, { pointsAwarded })
  const targets = new Set()
  const primary = raidDiscordPostTarget(raid)
  if (primary) targets.add(primary)
  const otherTeamIds = raidCMoonIds(raid).filter(id => id !== raid.cMoonId)
  if (otherTeamIds.length) {
    const teams = await db.cMoon.findMany({ where: { id: { in: otherTeamIds } }, select: { discordChannelId: true } })
    for (const t of teams) {
      const channelId = await resolveCMoonRaidDiscordChannelId(db, t.discordChannelId)
      // The initiator's thread lives inside its parent channel — don't post the recap to that
      // parent too when another team shares it.
      if (channelId && channelId !== raid.discordChannelId) targets.add(channelId)
    }
  }
  for (const target of targets) sendCMoonTeamUpdate(target, message)
}

/* ── Resolution: the one place a raid touches Postgres beyond its own create/resolve rows ───── */

async function resolveCMoonRaidOutcome(io, raid, outcome) {
  raid.status = 'RESOLVED'
  raid.outcome = outcome
  raid.endedAt = Date.now()

  // A joiner whose participant row is still being written (pendingJoin) has nothing to update yet;
  // including them would fail the transaction and roll back EVERY participant's rewards. Their own
  // join handler sees the raid is gone and releases the lock it just wrote.
  for (const [uid, p] of raid.participants) if (p.pendingJoin) raid.participants.delete(uid)
  const participantIds = Array.from(raid.participants.keys())
  let grantable = null
  let rewardsGranted = null
  if (outcome === 'WIN') {
    const rewardRows = await db.cMoonEnemyReward.findMany({
      where: { enemyMemberId: raid.enemyMemberId },
      include: { ctoon: { select: { quantity: true, name: true } } },
    })
    const hitRewards = rollEnemyRewards(rewardRows)
    grantable = buildGrantableReward(hitRewards)
  }
  let pointsAwarded = outcome === 'WIN' ? Math.max(0, Number(raid.enemyStats.cMoonPointsReward) || 0) : 0
  // A raid that resolved with exactly ONE participant (started solo and nobody joined in time, or
  // the leader force-started alone — see cmoonraid:forceStart) earns the admin-configured solo
  // bonus — see GlobalGameConfig.cMoonRaidSoloRewardMultiplierPercent's own schema comment. Points
  // only, computed here at resolution so it applies identically regardless of HOW the raid ended
  // up solo; item/cToon drop chances (rollEnemyRewards above) are untouched.
  if (pointsAwarded > 0 && participantIds.length === 1) {
    const config = await getGlobalConfig().catch(() => null)
    const multiplierPercent = Number.isInteger(config?.cMoonRaidSoloRewardMultiplierPercent) && config.cMoonRaidSoloRewardMultiplierPercent > 0
      ? config.cMoonRaidSoloRewardMultiplierPercent
      : 100
    pointsAwarded = Math.round(pointsAwarded * multiplierPercent / 100)
  }
  // Split evenly across the party (splitRaidPoints), each share credited to that participant's
  // OWN cMoon — so in a cross-cMoon raid every team earns its members' shares and the total
  // across all teams is still one win's worth. Rather than crediting each participant the full
  // amount — every
  // OTHER CMoonScoreLog writer in this codebase (solo battles, HIGH_SCORE, DAILY_TASK, TOP10)
  // attributes to one real user, and CMoon.teamScore is simply the SUM of every row for that
  // cMoon (see recomputeCMoonTeamScores) with no per-user dedup — crediting each participant the
  // full reward would silently multiply the team's total by party size for a single boss kill.
  // A null-userId row would dodge that multiplication but breaks something else: personal
  // cMoonPoints (recomputeCMoonPointsForUsers) and the per-user TOP10 leaderboard both join
  // CMoonScoreLog ON userId, so a null-userId row is invisible to a participant's own progress.
  // Splitting keeps the team total equal to one normal win's worth AND correctly credits each
  // participant's own rank/leaderboard/achievement progress. The remainder (if it doesn't divide
  // evenly) goes to the first few participants in join order so the split always sums back to
  // exactly pointsAwarded.
  const pointsShareByUser = splitRaidPoints(participantIds, pointsAwarded)

  // Every team in the party (initiator's first). Only cMoons that still exist get credited: a
  // cMoon an admin deleted mid-raid would otherwise fail its CMoonScoreLog/cMoon.update FK and
  // roll back the WHOLE transaction — every other participant's rewards with it. A participant
  // whose team is gone still gets their prizes and battle record (cMoonId null), just no team
  // credit. One query also gives the pre-increment battleWins for each team's milestone diff.
  const teamIds = raidCMoonIds(raid)
  const existingTeams = await db.cMoon.findMany({ where: { id: { in: teamIds } }, select: { id: true, battleWins: true } })
  const winsBeforeByTeam = new Map(existingTeams.map(c => [c.id, c.battleWins]))
  const creditedTeamIds = teamIds.filter(id => winsBeforeByTeam.has(id))
  const winsAfterByTeam = new Map()

  const ctoonJobsByUser = new Map()
  try {
    await db.$transaction(async tx => {
      const raidRow = await tx.cMoonEnemyRaid.update({
        where: { id: raid.id },
        data: {
          status: 'RESOLVED', outcome, enemyHpRemaining: raid.enemyHpRemaining,
          roundNumber: raid.roundNumber, roundLog: raid.roundLog, endedAt: new Date(raid.endedAt),
          combatStartedAt: raid.combatStartedAt ? new Date(raid.combatStartedAt) : null,
        },
      })

      // One shared roll granted to EVERY participant, knocked-out or not (see this file's own
      // header comment on why) — never re-rolled per player, matching "one shared party roll."
      for (const userId of participantIds) {
        let granted = null
        if (outcome === 'WIN' && grantable) {
          const summary = await grantRewardInTx(tx, userId, grantable, REWARD_METHOD)
          granted = [
            ...(summary.points ? [{ type: 'POINTS', quantity: summary.points }] : []),
            ...(summary.backgrounds ? [{ type: 'BACKGROUND', quantity: summary.backgrounds }] : []),
            ...(summary.avatars ? [{ type: 'AVATAR', quantity: summary.avatars }] : []),
            ...summary.ctoonJobs.map(j => ({ type: 'CTOON', name: j.name, quantity: j.quantity })),
          ]
          if (summary.ctoonJobs.length) ctoonJobsByUser.set(userId, summary.ctoonJobs)
        }
        const p = raid.participants.get(userId)
        await tx.cMoonEnemyRaidParticipant.update({
          where: { raidId_userId: { raidId: raid.id, userId } },
          data: {
            hpRemaining: p.hpRemaining,
            knockedOutAt: p.knockedOutAt ? new Date(p.knockedOutAt) : null,
            rewardsGranted: granted,
            activeUserId: null,
          },
        })

        // Whether THIS participant has ever beaten THIS SPECIFIC enemy member before — same
        // "read before this win's own synthetic row exists" off-by-one-free timing as the solo
        // battle's own isFirstWinAgainstThisEnemy (see action.post.js's resolveWin). Mutated
        // directly onto the live in-memory participant object (not a local-only variable) so
        // the next publicRaidView broadcast — the RESOLVED one the client actually reads — can
        // surface both this flag and the reward breakdown just granted above.
        p.rewardsGranted = granted
        p.isFirstWinAgainstThisEnemy = outcome === 'WIN'
          ? (await tx.cMoonEnemyBattle.count({ where: { userId, enemyMemberId: raid.enemyMemberId, outcome: 'WIN' } })) === 0
          : false

        // Synthetic per-participant CMoonEnemyBattle row — see CMoonEnemyBattle.raidId's own
        // schema comment for why: this is what makes minPriorDefeats and the rank-scoped
        // achievement criteria count a raid win/loss with zero changes to either system.
        // pointsAwarded is 0 here too — this row's own points are logged via CMoonScoreLog below,
        // same as every other CMoonEnemyBattle-adjacent write in this file.
        const teamId = participantCMoonId(raid, p)
        const teamExists = winsBeforeByTeam.has(teamId)
        await tx.cMoonEnemyBattle.create({
          data: {
            userId, enemyMemberId: raid.enemyMemberId, cMoonId: teamExists ? teamId : null,
            status: 'RESOLVED', outcome, roundNumber: raid.roundNumber,
            playerHpRemaining: p.hpRemaining, enemyHpRemaining: raid.enemyHpRemaining,
            roundLog: [], pointsAwarded: 0, rewardsGranted: granted,
            startedAt: new Date(raid.startedAt), endedAt: new Date(raid.endedAt), raidId: raid.id,
          },
        })

        const share = pointsShareByUser.get(userId) || 0
        if (share > 0 && teamExists) {
          await tx.cMoonScoreLog.create({
            data: {
              cMoonId: teamId, userId, category: 'ENEMY_RAID_WIN',
              detail: raid.id, points: share, weekStart: new Date(),
            },
          })
        }
      }

      // Every team that fought gets the win/loss — once per cMoon, never once per participant,
      // so a 3-member team in one raid still counts one victory.
      if (outcome === 'WIN') {
        for (const teamId of creditedTeamIds) {
          const after = await tx.cMoon.update({ where: { id: teamId }, data: { battleWins: { increment: 1 } } })
          winsAfterByTeam.set(teamId, after.battleWins)
        }
        // Drives checkRaidBossAvailability's raidOneTime/raidCooldownMinutes gate for the NEXT
        // encounter — never set on a LOSS/ABANDONED, since the boss wasn't actually defeated.
        await tx.cMoonEnemyMember.update({ where: { id: raid.enemyMemberId }, data: { raidDefeatedAt: new Date() } })
      } else if (outcome === 'LOSS') {
        for (const teamId of creditedTeamIds) {
          await tx.cMoon.update({ where: { id: teamId }, data: { battleLosses: { increment: 1 } } })
        }
      }

      return raidRow
    })
  } catch (err) {
    console.error('[cmoonRaidSocket] resolveCMoonRaidOutcome transaction failed:', err?.message || err)
  }

  for (const [userId, jobs] of ctoonJobsByUser.entries()) {
    enqueueCtoonJobs(userId, jobs, REWARD_METHOD).catch(() => {})
  }
  if (pointsAwarded > 0) recomputeCMoonPointsForUsers(participantIds).catch(() => {})
  for (const userId of participantIds) processAchievementsForUser(userId).catch(() => {})
  postRaidRecap(raid, { pointsAwarded }).catch(() => {})
  for (const [teamId, after] of winsAfterByTeam.entries()) {
    announceTeamEnemiesMilestone(teamId, winsBeforeByTeam.get(teamId), after).catch(() => {})
  }
  if (winsAfterByTeam.size) checkAndAnnounceSeasonGoalReached().catch(() => {})

  broadcast(io, raid, EV('ended'))
  destroyRaid(raid.id)
}

/* ── Sweep: the join-window and round-timeout clock (see header comment) ────────────────────── */

function sweep(io) {
  const now = Date.now()
  for (const raid of Array.from(raids.values())) {
    // A leader keeping the lobby open (see cmoonraid:toggleKeepOpen) pauses this clock entirely —
    // the raid only starts via an explicit cmoonraid:forceStart, filling the party, or the leader
    // turning keepOpen back off (which re-arms a fresh full window rather than expiring instantly).
    if (raid.status === 'FORMING' && !raid.leaderKeepOpen && now >= raid.joinDeadlineAt) {
      startCombat(io, raid)
    } else if (raid.status === 'IN_PROGRESS' && now >= raid.roundDeadlineAt) {
      closeRound(io, raid).catch(err => console.error('[cmoonRaidSocket] sweep closeRound failed:', err))
    }
  }
}

let sweepTimer = null
export function startCMoonRaidSweep(io) {
  lobbyIo = io
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep(io) } catch (err) { console.error('[cmoonRaidSocket] sweep failed:', err) }
  }, SWEEP_INTERVAL_MS)
  sweepTimer.unref?.()
}

/** Restores in-memory raid state from Redis on boot — mirrors restoreOgGtoonsMatches exactly. */
export async function restoreCMoonRaids() {
  const restored = await raidRedis.scanCMoonRaids()
  for (const [raidId, raid] of restored.entries()) {
    raid.participants = new Map(raid.participants.map(p => ([
      p.userId, {
        hitStreak: 0, specialCharged: false, isCaptain: false, ...p,
        // A snapshot from before cross-cMoon raids has no per-participant special; every member
        // was then on the initiator's cMoon, so theirs IS raid.cMoonSpecialAttack.
        specialAttack: 'specialAttack' in p ? p.specialAttack : (raid.cMoonSpecialAttack ?? null),
      },
    ])))
    raid.resolving = false
    // A join that was mid-write when the process went down: its row may or may not exist, and
    // nobody is waiting on it any more. Drop it, and release any lock row it managed to write.
    for (const [uid, p] of raid.participants) {
      if (!p.pendingJoin) continue
      raid.participants.delete(uid)
      db.cMoonEnemyRaidParticipant.updateMany({ where: { raidId, userId: uid }, data: { activeUserId: null } }).catch(() => {})
    }
    // Backfills a raid whose Redis snapshot predates special attacks (created on an older deploy,
    // restored after a restart mid-fight — a narrow window, but a missing numeric field here would
    // otherwise feed NaN straight into resolveRaidRound's arithmetic, silently corrupting combat
    // for the rest of the raid rather than just... not having specials).
    raid.cMoonSpecialAttack ??= null
    raid.enemySpecialAttack ??= null
    raid.enemyHitStreak ??= 0
    raid.partyAtkBonus ??= 0
    raid.enemyAtkBonus ??= 0
    raid.partyAtkRaiseAmount ??= 0
    raid.partyAtkRaiseTurnsRemaining ??= 0
    raid.enemyAtkRaiseAmount ??= 0
    raid.enemyAtkRaiseTurnsRemaining ??= 0
    raid.enemyParalyzedTurns ??= 0
    raid.partyParalyzedTurns ??= 0
    // Lobby controls / up-to-8 / wind-up / private — all added after this feature shipped, so a
    // snapshot from before any of them existed needs every one backfilled, same reasoning as the
    // special-attack fields above (a missing numeric/Set field here would otherwise feed
    // undefined straight into this round's own arithmetic/comparisons).
    raid.maxParticipants ??= MAX_PARTY_SIZE
    raid.roundLimit ??= RAID_MAX_ROUNDS_SAFETY
    raid.isPrivate ??= false
    raid.leaderKeepOpen ??= false
    raid.speedVotes = new Set(Array.isArray(raid.speedVotes) ? raid.speedVotes : [])
    raid.windUpMoves ??= []
    raid.currentWindUp ??= null
    raids.set(raidId, raid)
    for (const uid of raid.participants.keys()) raidByUser.set(uid, raidId)
  }
  return restored.size
}

/* ── Registration ─────────────────────────────────────────────────────────────────────────── */

export function registerCMoonRaid(io, socket, resolveSocketUser) {
  lobbyIo = io

  // ── Raid Boss Lobby: live list of open raids, any cMoon (see buildRaidLobby) ──
  socket.on(EV('lobbySubscribe'), async () => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    socket.join(LOBBY_ROOM)
    // serverNow lets the client count down joinDeadlineAt against the server's clock, not its own.
    socket.emit(EV('lobby'), { raids: buildRaidLobby(raids.values()), serverNow: Date.now() })
    // Per-viewer context the shared list can't carry: whether they can join at all (raids need
    // a cMoon to credit) and which raid, if any, they're already in. Display-only — join re-checks
    // everything against the database.
    try {
      const u = await db.user.findUnique({ where: { id: me.id }, select: { cMoonId: true } })
      socket.emit(EV('lobbyViewer'), { inCMoon: !!u?.cMoonId, currentRaidId: raidByUser.get(me.id) || null })
    } catch {
      socket.emit(EV('lobbyViewer'), { inCMoon: true, currentRaidId: raidByUser.get(me.id) || null })
    }
  })
  socket.on(EV('lobbyUnsubscribe'), () => { socket.leave(LOBBY_ROOM) })

  socket.on(EV('start'), async ({ enemyMemberId, isPrivate } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    try {
      const config = await getGlobalConfig()
      if (!config?.cMoonEnemyBattlesEnabled) {
        return socket.emit(EV('error'), { message: 'cMoon Enemy Battles is currently disabled' })
      }
      const enemyMember = await db.cMoonEnemyMember.findUnique({
        where: { id: enemyMemberId },
        include: {
          faction: {
            include: {
              specialAttack: true,
              taunts: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
          windUpMoves: true,
          // This member's OWN unique taunts (see CMoonEnemyMemberTaunt) — merged with the
          // faction's shared pool above by mergeTauntPools.
          taunts: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        },
      })
      if (!enemyMember || !enemyMember.active || !enemyMember.faction.active) {
        return socket.emit(EV('error'), { message: 'That enemy is no longer available' })
      }
      if (!enemyMember.isRaidBoss) {
        return socket.emit(EV('error'), { message: 'This enemy is not a raid boss' })
      }
      const bossLoreRiddle = await getActiveBossLoreRiddle(db, enemyMember.id)
      const availability = checkRaidBossAvailability({ ...enemyMember, riddleGateSolved: !bossLoreRiddle || !!bossLoreRiddle.solvedAt })
      if (!availability.available) return socket.emit(EV('error'), { message: availability.message })
      const elig = await loadEligibility({ userId: me.id, enemyMember })
      if (!elig.ok) return socket.emit(EV('error'), { message: elig.message })

      // raid.cMoonId is the INITIATOR's cMoon — where the Discord call-to-arms lives. Joiners
      // from other cMoons bring their own team/special snapshot (loadParticipantProfile).
      const cMoon = await db.cMoon.findUnique({
        where: { id: elig.user.cMoonId },
        select: { id: true, name: true, discordChannelId: true, specialAttack: true },
      })
      if (!cMoon) return socket.emit(EV('error'), { message: 'Your cMoon could not be found' })
      const initiatorProfile = await loadParticipantProfile(me.id, cMoon.id)
      if (!initiatorProfile) return socket.emit(EV('error'), { message: 'Your cMoon could not be found' })

      const initiatorMaxHp = await getPlayerCombatMaxHp(me.id, config)
      const discordChannelId = await resolveCMoonRaidDiscordChannelId(db, cMoon.discordChannelId)
      const raidId = randomUUID()
      const raid = {
        id: raidId, enemyMemberId, cMoonId: cMoon.id, cMoonName: cMoon.name, discordChannelId, discordThreadId: null,
        // The lobby names a raid after whoever started it — kept on the raid itself so the name
        // doesn't change if they leave during FORMING (see buildRaidLobbyEntry).
        initiatorUsername: elig.user.username,
        enemyName: enemyMember.name, enemyImagePath: enemyMember.imagePath || null,
        enemySounds: resolveMemberSoundPaths(enemyMember, enemyMember.faction),
        battleMusicPath: enemyMember.faction?.battleMusicPath || null,
        // Same shape useCMoonBattlePopup.js's solo flow already sends the client — see
        // publicRaidView's own comment on why this is a pool, not one pre-picked line. Merges
        // this member's own unique taunts with its faction's shared pool (see mergeTauntPools).
        enemyTaunts: mergeTauntPools(enemyMember.taunts, enemyMember.faction?.taunts),
        enemyStats: {
          maxHp: enemyMember.maxHp,
          critChanceAgainstPercent: enemyMember.critChanceAgainstPercent,
          critChanceFromPercent: enemyMember.critChanceFromPercent,
          cMoonPointsReward: enemyMember.cMoonPointsReward,
          attackChancePercent: enemyMember.attackChancePercent,
          // Display-only for the lobby ("requires N prior wins"); the real gate is re-checked
          // against the database in loadEligibility on every join.
          minPriorDefeats: enemyMember.minPriorDefeats || 0,
        },
        status: 'FORMING', enemyHpRemaining: enemyMember.maxHp, roundNumber: 1,
        currentEnemyAction: null, roundDeadlineAt: null,
        joinDeadlineAt: Date.now() + (
          Number.isInteger(config?.cMoonRaidJoinWindowSeconds) && config.cMoonRaidJoinWindowSeconds > 0
            ? config.cMoonRaidJoinWindowSeconds
            : JOIN_WINDOW_SECONDS
        ) * 1000,
        participants: new Map(), roundLog: [],
        startedAt: Date.now(), combatStartedAt: null, endedAt: null, outcome: null, resolving: false,
        // Special attacks — see the raid object's own shape comment up top for what each field
        // means and cmoonEnemyRaid.js's header comment for why every effect here is party-wide.
        cMoonSpecialAttack: cMoon.specialAttack || null,
        enemySpecialAttack: enemyMember.faction?.specialAttack || null,
        enemyHitStreak: 0, partyAtkBonus: 0, enemyAtkBonus: 0,
        partyAtkRaiseAmount: 0, partyAtkRaiseTurnsRemaining: 0,
        enemyAtkRaiseAmount: 0, enemyAtkRaiseTurnsRemaining: 0,
        enemyParalyzedTurns: 0, partyParalyzedTurns: 0,
        // How many players this party can hold — snapshotted now (1-8) so an admin edit mid-raid
        // never affects one already FORMING/IN_PROGRESS. See CMoonEnemyMember.maxParticipants.
        maxParticipants: Number.isInteger(enemyMember.maxParticipants) && enemyMember.maxParticipants >= 1 && enemyMember.maxParticipants <= 8
          ? enemyMember.maxParticipants
          : MAX_PARTY_SIZE,
        // Round-count safety valve, same "validate then snapshot, else fall back" shape as
        // maxParticipants just above — see CMoonEnemyMember.raidRoundLimit's own schema comment.
        roundLimit: Number.isInteger(enemyMember.raidRoundLimit) && enemyMember.raidRoundLimit >= RAID_ROUND_LIMIT_MIN && enemyMember.raidRoundLimit <= RAID_ROUND_LIMIT_MAX
          ? enemyMember.raidRoundLimit
          : RAID_MAX_ROUNDS_SAFETY,
        // Invite-only: never listed in the site-wide lobby, never notified/announced — see
        // CMoonEnemyRaid.isPrivate's own schema comment. Still joinable, cross-cMoon, by anyone
        // with the raid's own URL.
        isPrivate: !!isPrivate,
        // Lobby controls (see cmoonraid:toggleKeepOpen/forceStart/voteSpeedUp below) — nobody has
        // paused or voted yet on a freshly-created raid.
        leaderKeepOpen: false,
        speedVotes: new Set(),
        // Wind-up/telegraph moves — only snapshotted when the boss has them actually enabled, so
        // an inactive toggle costs nothing extra at runtime (openRound's roll is a no-op on an
        // empty list either way, but this also keeps the Redis snapshot smaller for every other
        // raid boss that doesn't use this mechanic).
        windUpMoves: enemyMember.windUpEnabled ? (enemyMember.windUpMoves || []) : [],
        currentWindUp: null,
      }
      addParticipant(raid, { userId: me.id, username: elig.user.username, isInitiator: true, maxHp: initiatorMaxHp, profile: initiatorProfile })
      raids.set(raidId, raid)

      try {
        // One transaction, not two independent creates: if the participant row failed after the
        // raid row alone succeeded, the raid would persist in Postgres as a permanent zero-
        // participant FORMING row with no way to ever resolve it.
        await db.$transaction([
          db.cMoonEnemyRaid.create({
            data: {
              id: raidId, enemyMemberId, cMoonId: cMoon.id, status: 'FORMING',
              enemyHpRemaining: enemyMember.maxHp, joinDeadlineAt: new Date(raid.joinDeadlineAt),
              isPrivate: raid.isPrivate,
            },
          }),
          db.cMoonEnemyRaidParticipant.create({
            data: { raidId, userId: me.id, hpRemaining: initiatorMaxHp, isInitiator: true, activeUserId: me.id },
          }),
          // Engagement signal for the INITIATOR's own popup cooldown — see
          // User.lastCMoonBattlePopupAt's own schema comment on why this only stamps on an actual
          // "Start Raid!", never on a merely-offered-then-declined popup. Never written to
          // CMoonEnemyPopupLog (the spawn-CAP counter): raid bosses have always been exempt from
          // that cap, only solo offers count against it — this is the cooldown timestamp alone.
          // A later JOINER's own cooldown is untouched here — they never saw this particular
          // offer; only the player who actually rolled and acted on it gets stamped.
          db.user.update({ where: { id: me.id }, data: { lastCMoonBattlePopupAt: new Date() } }),
        ])
      } catch (err) {
        // Roll back the in-memory registration too — otherwise this raid lives on with no
        // matching database rows, gets swept into combat once joinDeadlineAt passes, and can
        // never resolve cleanly (resolveCMoonRaidOutcome's own participant update would fail).
        destroyRaid(raidId)
        throw err
      }

      socket.join(raidRoom(raidId))
      fireSync(raidId, raid)
      socket.emit(EV('created'), publicRaidView(raid))
      broadcastLobby()
      // Admin analytics only (offer -> start rate); fire-and-forget, never blocks the raid.
      markEnemyOfferAccepted(db, { userId: me.id, enemyMemberId })

      // Both the Discord call-to-arms and the site-wide in-app notification are skipped for a
      // PRIVATE raid (see CMoonEnemyRaid.isPrivate's own schema comment) — it only reaches other
      // players via its own URL, shared by whoever started it. Everything else (join, cross-cMoon
      // eligibility, rewards) is unchanged either way.
      if (!raid.isPrivate) {
        announceCMoonRaidBoss(discordChannelId, {
          cMoonName: cMoon.name, enemyName: enemyMember.name,
          announcementTemplate: enemyMember.raidAnnouncementText,
        }).then(async messageId => {
          if (!messageId) return
          const threadId = await startThreadFromMessage(discordChannelId, messageId, `⚔️ ${enemyMember.name} raid`)
          // The raid may have already resolved and been destroyed by the time this round trip
          // finishes (two round-trip Discord calls, vs. a raid that can close in ~20s) — only
          // mutate/persist it if it's still the live instance for this id, never a stale one.
          if (threadId && raids.get(raidId) === raid) {
            raid.discordThreadId = threadId
            fireSync(raidId, raid)
          }
        }).catch(() => {})
        notifyRaidLobbyOpened(io, {
          initiatorUserId: me.id, initiatorUsername: elig.user.username, enemyMember, cMoonName: cMoon.name,
        }).catch(() => {})
      }
    } catch (err) {
      console.error('[cmoonraid:start] failed:', err)
      socket.emit(EV('error'), { message: 'Could not start a raid right now' })
    }
  })

  socket.on(EV('join'), async ({ raidId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This raid is no longer accepting joins' })
    if (raid.participants.has(me.id)) {
      socket.join(raidRoom(raidId))
      return socket.emit(EV('created'), publicRaidView(raid))
    }
    if (raid.participants.size >= (raid.maxParticipants || MAX_PARTY_SIZE)) return socket.emit(EV('error'), { message: 'This raid is full' })

    // ── 1. Every eligibility check and lookup BEFORE taking a slot. Raids are listed site-wide in
    // the lobby now, so anyone can try any raid: an ineligible player (no cMoon, too few wins,
    // already fighting elsewhere) must never hold a slot, even briefly — a held slot turns real
    // players away as "full", or counts toward maxParticipants and starts combat early. ─────────
    let elig, profile, joinerMaxHp
    try {
      const enemyMember = await db.cMoonEnemyMember.findUnique({
        where: { id: raid.enemyMemberId }, include: { faction: true },
      })
      if (!enemyMember || !enemyMember.active || !enemyMember.faction.active) {
        return socket.emit(EV('error'), { message: 'That enemy is no longer available' })
      }
      elig = await loadEligibility({ userId: me.id, enemyMember })
      if (!elig.ok) return socket.emit(EV('error'), { message: elig.message })
      // No same-cMoon check: raids are cross-cMoon. The joiner fights for (and is credited to)
      // their OWN cMoon, snapshotted here.
      profile = await loadParticipantProfile(me.id, elig.user.cMoonId)
      if (!profile) return socket.emit(EV('error'), { message: 'Your cMoon could not be found' })
      joinerMaxHp = await getPlayerCombatMaxHp(me.id)
    } catch (err) {
      console.error('[cmoonraid:join] eligibility failed:', err)
      return socket.emit(EV('error'), { message: 'Could not join this raid' })
    }

    // ── 2. Re-check and reserve SYNCHRONOUSLY — the awaits above may have let the window close,
    // the party fill, the raid end, or this same player get into another raid (a double click,
    // a second tab). Everything from here to addParticipant runs in one uninterrupted tick, so
    // two concurrent joins for the last slot can't both pass. ─────────────────────────────────
    if (raids.get(raidId) !== raid || raid.status !== 'FORMING') {
      return socket.emit(EV('error'), { message: 'This raid is no longer accepting joins' })
    }
    if (raid.participants.has(me.id)) {
      socket.join(raidRoom(raidId))
      return socket.emit(EV('created'), publicRaidView(raid))
    }
    const otherRaidId = raidByUser.get(me.id)
    if (otherRaidId && otherRaidId !== raidId) return socket.emit(EV('error'), { message: 'You are already in a raid' })
    if (raid.participants.size >= (raid.maxParticipants || MAX_PARTY_SIZE)) return socket.emit(EV('error'), { message: 'This raid is full' })
    addParticipant(raid, { userId: me.id, username: elig.user.username, isInitiator: false, maxHp: joinerMaxHp, profile, pendingJoin: true })

    // ── 3. The one write. Only a DB failure (e.g. P2002: an active raid/solo row the in-memory
    // maps didn't know about) can still turn this away, and the reservation is rolled back then.
    try {
      await db.cMoonEnemyRaidParticipant.create({
        data: { raidId, userId: me.id, hpRemaining: joinerMaxHp, isInitiator: false, activeUserId: me.id },
      })
    } catch (err) {
      releaseReservation(raid, me.id)
      if (err?.code === 'P2002') return socket.emit(EV('error'), { message: 'You are already in a raid' })
      console.error('[cmoonraid:join] failed:', err)
      return socket.emit(EV('error'), { message: 'Could not join this raid' })
    }

    // The raid can't resolve while still FORMING, but it can be torn down (every other member
    // left) during that write. Then the row just written would hold this player's active-raid
    // lock with nothing left to ever release it — release it now.
    if (raids.get(raidId) !== raid || raid.status === 'RESOLVED' || !raid.participants.has(me.id)) {
      releaseReservation(raid, me.id)
      await db.cMoonEnemyRaidParticipant.updateMany({ where: { raidId, userId: me.id }, data: { activeUserId: null } }).catch(() => {})
      return socket.emit(EV('error'), { message: 'This raid is no longer accepting joins' })
    }
    // (If the join window closed during the write, the reserved player is already in round 1 —
    // same as before cross-cMoon — and finishing the join is right.)
    raid.participants.get(me.id).pendingJoin = false
    socket.join(raidRoom(raidId))
    // A join changes the speed-vote denominator (one more current participant) — re-check in case
    // this join itself completes a unanimous vote.
    maybeApplySpeedVote(raid)
    fireSync(raidId, raid)
    broadcast(io, raid, EV('participantJoined'))
    broadcastLobby()
    if (raid.participants.size >= (raid.maxParticipants || MAX_PARTY_SIZE) && raid.status === 'FORMING') startCombat(io, raid)
  })

  socket.on(EV('leave'), async ({ raidId }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING' || !raid.participants.has(me.id)) return
    raid.participants.delete(me.id)
    raid.speedVotes.delete(me.id)
    raidByUser.delete(me.id)
    socket.leave(raidRoom(raidId))
    await db.cMoonEnemyRaidParticipant.updateMany({ where: { raidId, userId: me.id }, data: { activeUserId: null } }).catch(() => {})
    if (!raid.participants.size) { destroyRaid(raidId); return }
    // A leave shrinks the speed-vote denominator too — re-check for the same reason as a join.
    maybeApplySpeedVote(raid)
    fireSync(raidId, raid)
    broadcast(io, raid, EV('participantLeft'))
    broadcastLobby()
  })

  // ── Lobby controls (see maybeApplySpeedVote above and sweep's own leaderKeepOpen check) ──────
  // Initiator-only: pause/resume the join-window countdown. Turning it back OFF re-arms a FRESH
  // full window (the admin-configured default) rather than letting whatever time has silently
  // passed take effect instantly — a leader resuming the clock expects the full window back, not
  // an immediate close.
  socket.on(EV('toggleKeepOpen'), async ({ raidId, keepOpen } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This raid is not open for joining' })
    const p = raid.participants.get(me.id)
    if (!p?.isInitiator) return socket.emit(EV('error'), { message: 'Only the raid leader can do that' })
    raid.leaderKeepOpen = !!keepOpen
    if (!raid.leaderKeepOpen) {
      const config = await getGlobalConfig().catch(() => null)
      const seconds = Number.isInteger(config?.cMoonRaidJoinWindowSeconds) && config.cMoonRaidJoinWindowSeconds > 0
        ? config.cMoonRaidJoinWindowSeconds
        : JOIN_WINDOW_SECONDS
      raid.joinDeadlineAt = Date.now() + seconds * 1000
    }
    fireSync(raidId, raid)
    broadcast(io, raid, EV('state'))
    broadcastLobby()
  })

  // Initiator-only: start combat immediately with whoever has joined so far (including just
  // themselves — the solo-queue entry point, see GlobalGameConfig.cMoonRaidSoloRewardMultiplierPercent).
  socket.on(EV('forceStart'), async ({ raidId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This raid is not open for joining' })
    const p = raid.participants.get(me.id)
    if (!p?.isInitiator) return socket.emit(EV('error'), { message: 'Only the raid leader can do that' })
    startCombat(io, raid)
  })

  // Any current participant: vote to cut the join window down to 5 seconds. Re-votable (idempotent
  // — voting again while already counted is a no-op) but not revocable; resolves automatically via
  // maybeApplySpeedVote once every current participant has voted.
  socket.on(EV('voteSpeedUp'), async ({ raidId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING' || !raid.participants.has(me.id)) {
      return socket.emit(EV('error'), { message: 'You are not in this raid' })
    }
    raid.speedVotes.add(me.id)
    maybeApplySpeedVote(raid)
    fireSync(raidId, raid)
    broadcast(io, raid, EV('state'))
    broadcastLobby()
  })

  socket.on(EV('getState'), async ({ raidId }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const raid = raids.get(raidId)
    if (raid) {
      if (raid.participants.has(me.id)) socket.join(raidRoom(raidId))
      return socket.emit(EV('state'), publicRaidView(raid))
    }
    // Not in memory — either it never existed or it already resolved; fall back to a read-only
    // view of the permanent record so a late notification click still shows something.
    const row = await db.cMoonEnemyRaid.findUnique({
      where: { id: raidId },
      include: {
        enemyMember: { include: { faction: true } },
        participants: { include: { user: { select: { username: true } } } },
        // The per-participant synthetic battle rows carry the cMoon each fighter was credited
        // to — the accurate team for a resolved cross-cMoon raid, even if they've switched since.
        battles: { select: { userId: true, cMoonId: true } },
      },
    })
    if (!row) return socket.emit(EV('error'), { message: 'Raid not found' })
    const teamByUser = new Map(row.battles.map(b => [b.userId, b.cMoonId]))
    const teamIds = [...new Set([...teamByUser.values()].filter(Boolean))]
    const teams = teamIds.length
      ? await db.cMoon.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, color: true, avatarPath: true } })
      : []
    const teamById = new Map(teams.map(t => [t.id, t]))
    socket.emit(EV('state'), {
      id: row.id, enemyMemberId: row.enemyMemberId, cMoonId: row.cMoonId, status: row.status,
      enemyName: row.enemyMember.name, enemyImagePath: row.enemyMember.imagePath || null,
      enemySounds: resolveMemberSoundPaths(row.enemyMember, row.enemyMember.faction),
      battleMusicPath: row.enemyMember.faction?.battleMusicPath || null,
      enemyMaxHp: row.enemyMember.maxHp, enemyHpRemaining: row.enemyHpRemaining,
      roundNumber: row.roundNumber, joinDeadlineAt: row.joinDeadlineAt?.getTime() || null,
      roundDeadlineAt: null, outcome: row.outcome || null,
      participants: row.participants.map(p => ({
        userId: p.userId, username: p.user?.username || null, hpRemaining: p.hpRemaining,
        knockedOut: !!p.knockedOutAt, isInitiator: p.isInitiator, hasActed: false,
        rewardsGranted: p.rewardsGranted || null,
        // Rank isn't kept historically, so a resolved raid shows team colors only.
        cMoon: (() => {
          const t = teamById.get(teamByUser.get(p.userId))
          return t ? { id: t.id, name: t.name, color: t.color, avatarPath: t.avatarPath || null } : null
        })(),
        rank: null,
      })),
    })
  })

  socket.on(EV('action'), async ({ raidId, action, roundNumber }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    if (!isValidPlayerSubmittedAction(action)) return socket.emit(EV('error'), { message: 'Invalid action' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'IN_PROGRESS') return socket.emit(EV('error'), { message: 'This raid is not in combat' })
    if (Number(roundNumber) !== raid.roundNumber) return socket.emit(EV('error'), { message: 'Stale round — reload this raid' })
    const p = raid.participants.get(me.id)
    if (!p) return socket.emit(EV('error'), { message: 'You are not in this raid' })
    if (p.knockedOutAt) return socket.emit(EV('error'), { message: 'You have been knocked out of this raid' })
    if (p.pendingAction) return // already locked in this round — a duplicate click is a no-op, not an error
    if (action === SPECIAL_ACTION) {
      if (!p.specialCharged) return socket.emit(EV('error'), { message: 'Your special attack is not charged yet' })
      if (!p.specialAttack) return socket.emit(EV('error'), { message: 'Your cMoon has no special attack assigned' })
      // The whole party can't act at all this round (see raid.partyParalyzedTurns's own shape
      // comment) — including firing an already-charged special, same guard the solo battle has
      // for its own paralyzed player. The charge itself is untouched so it's still there once
      // paralysis wears off.
      if (raid.partyParalyzedTurns > 0) {
        return socket.emit(EV('error'), { message: `Your party is paralyzed and can't act for ${raid.partyParalyzedTurns} more round(s)` })
      }
    }
    p.pendingAction = action
    fireSync(raid.id, raid)
    broadcast(io, raid, EV('participantActed'), { actedUserId: me.id })
    if (allActed(raid)) await closeRound(io, raid)
  })
}
