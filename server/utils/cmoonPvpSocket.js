// server/utils/cmoonPvpSocket.js
//
// Real-time runtime for cMoon PvP: two teams (A/B) of up to GlobalGameConfig.cMoonPvpMaxTeamSize
// players each, fighting live — the team-vs-team sibling of cmoonRaidSocket.js. Structurally a
// close port of that file (lobby, join window, round-by-round resolution via a sweep rather than
// per-match timers, Redis restart survival), generalized from "one party vs one shared-HP boss" to
// "two symmetric sides, both acting every round, individual HP on both sides, no shared pool." See
// server/utils/cmoonPvp.js for the pure combat math (targeting/round-resolution/special-attack
// mapping) this file drives, and that file's own header comment for why a PvP round can't reuse
// resolveBattleRound/resolveRaidRound's bidirectional shape. Registered exactly like
// registerCMoonRaid:
//
//   import { registerCMoonPvp, startCMoonPvpSweep, restoreCMoonPvpMatches } from './utils/cmoonPvpSocket.js'
//   ...
//   io.on('connection', socket => {
//     ...
//     registerCMoonPvp(io, socket, resolveSocketUser)
//   })
//   startCMoonPvpSweep(io)
//   restoreCMoonPvpMatches()
//
// ── Cross-exclusivity (the single highest-risk area — see activeUserId's own schema comment) ──
// CMoonPvpParticipant.activeUserId mirrors CMoonEnemyRaidParticipant's own "at most one active
// thing per user" sentinel. Raid had a real historical production bug from a missed exit path
// (an AFK-kicked participant's row kept the lock forever); every exit path here — win, loss,
// abandon, leave, cancel, AFK-kick — clears it the same way applyAfkKicks in cmoonRaidSocket.js
// does. On top of that, a player may never be in a PvP match AND a raid AND a solo battle at
// once: loadPvpEligibility below checks both of the other two features' own activeUserId/status
// sentinels, and (see the matching edits in cmoonRaidSocket.js's loadEligibility and
// server/api/cmoon/battle/{start,consider}.post.js) those two features check back for an active
// PvP lock in return — a fully symmetric four-site guard.
//
// ── Team formation / teammates-only ────────────────────────────────────────────────────────────
// A FORMING match has two sides; the host lands on whichever team they chose, anyone else can
// join either side up to maxTeamSize. When GlobalGameConfig.cMoonPvpTeammatesOnlyEnabled was on at
// creation (snapshotted onto match.teammatesOnlyEnabled, never retroactive mid-match — same
// discipline as every other admin-configured value here), the FIRST joiner on a side locks that
// side's own cMoon (match.teamACMoonId/teamBCMoonId); every later joiner for that side must share
// it, and the two sides must resolve to different cMoons. The lock releases itself if that side's
// last member leaves while still FORMING (see cmoonpvp:leave), so an abandoned side can be claimed
// by a different cMoon rather than permanently stuck. When the toggle is off, both fields stay
// null for the match's whole life — a mixed-cMoon (or cMoonless) side earns no team credit at
// resolution, same "a participant whose team doesn't exist still gets their own prize, just no
// team credit" fallback cmoonRaidSocket.js's own resolveCMoonRaidOutcome already uses.
//
// ── Rewards ─────────────────────────────────────────────────────────────────────────────────────
// MATCH_WIN rolls for the winning side, MATCH_PARTICIPATION (a smaller consolation pool) for the
// losing side — "competitive but also fun," not a total dead end for whoever loses. An ABANDONED
// match (round-limit safety valve, or both sides wiped the same round) grants neither, same stance
// CMoonEnemyRaid's own ABANDONED outcome already takes.
//
// ── V1 scope ────────────────────────────────────────────────────────────────────────────────────
// No wind-up telegraphs, no faction taunts (both raid-boss-specific, no PvP analog), no Discord
// announcements (PvP has no single-cMoon "home channel" to post into the way a raid boss does —
// the live lobby list below is this feature's own discoverability mechanism). Tournament-match
// linkage (tournamentMatchId) is wired in Phase 5 (server/utils/cmoonPvpTournament.js).

import { randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { getGlobalConfig, getPlayerCombatMaxHp, isCMoonCaptain, displayRankName } from './cmoon.js'
import { grantRewardInTx, enqueueCtoonJobs, processAchievementsForUser } from './achievements.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'
import {
  isValidPlayerSubmittedAction, rollEnemyAction, rollEnemyRewards, buildGrantableReward,
  SPECIAL_ATTACK_SELECT, pickEffectiveSpecialAttack,
} from './cmoonEnemyBattle.js'
import {
  assignPvpTargets, resolvePvpRound, applyPvpSpecialAttack, applyPvpReflectDamage, applyPvpSiphonHealth,
  splitPvpPoints, buildPvpLobby, JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_TEAM_SIZE,
  PVP_ROUND_LIMIT_SAFETY, PLAYER_MAX_HP, HIT_STREAK_THRESHOLD, SPECIAL_ACTION, PARALYZED_ACTION, TEAMS,
} from './cmoonPvp.js'
import { rankTierLevel } from './cmoonEnemyRaid.js'
import * as pvpRedis from './cmoonPvpRedisState.js'
import { buildPvpBattleReport } from './cmoonPvpBattleReport.js'

const SWEEP_INTERVAL_MS = 2000
// Safety valve for a FORMING match stuck without both sides filled — the IN_PROGRESS equivalent of
// PVP_ROUND_LIMIT_SAFETY/roundLimit. Same 30-minute grace as cmoonRaidSocket.js's own
// SOLO_FORMING_ABANDON_MS, for the same reason (a leader who stepped away briefly shouldn't be
// punished for it).
const SOLO_FORMING_ABANDON_MS = 30 * 60 * 1000
const EV = (name) => `cmoonpvp:${name}`
const matchRoom = (matchId) => `cmoonpvp:room:${matchId}`
const LOBBY_ROOM = 'cmoonpvp:lobby'
const REWARD_METHOD_WIN = 'CMOON_PVP_MATCH_WIN'
const REWARD_METHOD_PARTICIPATION = 'CMOON_PVP_MATCH_PARTICIPATION'
// Same AFK-kick threshold raid uses — consecutive ROUNDS auto-filled, not consecutive actions.
const AFK_KICK_ROUNDS = 4

/* ── In-memory state (single-process, mirrored to Redis — see header) ──────────────────────────
 * match: {
 *   id, status: 'FORMING'|'IN_PROGRESS'|'RESOLVED', outcome: null|'TEAM_A_WIN'|'TEAM_B_WIN'|'ABANDONED',
 *   initiatorUsername,
 *   teamACMoonId, teamBCMoonId,      // locked only when teammatesOnlyEnabled — see header comment
 *   teammatesOnlyEnabled, maxTeamSize, equalizeHpEnabled, equalizeHpAmount, pointsPerWin, roundLimit,
 *                                     // all admin-configured, snapshotted once at creation, never
 *                                     // retroactive mid-match — same discipline as every raid field.
 *   roundNumber, roundDeadlineAt, joinDeadlineAt, joinWindowMs,
 *   participants: Map<userId, { userId, username, team: 'A'|'B', hpRemaining, maxHp, knockedOutAt,
 *                                isInitiator, pendingAction, pendingJoin, joinedAt,
 *                                consecutiveAfkRounds, hitStreak, specialCharged,
 *                                poisonAmount, poisonTurnsRemaining,
 *                                cMoonId, cMoonName, cMoonColor, cMoonAvatarPath, cMoonIsPrestige,
 *                                prestigeLevel, isCaptain,
 *                                rankName, rankTierName, rankTierLevel, rankTierCount,
 *                                specialAttack, rewardsGranted }>,
 *   roundLog: [], startedAt, combatStartedAt, endedAt, resolving,
 *   tournamentMatchId,                // set only when spawned from a tournament round — Phase 5.
 *
 *   // ── Team-wide combat status — see cmoonPvp.js's applyPvpSpecialAttack for the dynamic
 *   // `team${X}...` keys these are read/written through. Both sides have the identical set of
 *   // fields (unlike raid's party-vs-enemy asymmetric pair), since PvP is fully symmetric. ──────
 *   teamAAtkBonus, teamBAtkBonus,                         // LOWER_OPPONENT_ATTACK, permanent/stacking
 *   teamAAtkRaiseAmount, teamAAtkRaiseTurnsRemaining,     // RAISE_ALLY_ATTACK, non-stacking/timed
 *   teamBAtkRaiseAmount, teamBAtkRaiseTurnsRemaining,
 *   teamAParalyzedTurns, teamBParalyzedTurns,             // PARALYZE_OPPONENT, non-stacking
 *
 *   // ── Lobby controls — identical semantics to cmoonRaidSocket.js's own fields ────────────────
 *   isPrivate, leaderKeepOpen, keepOpenExtensionUsed, speedVotes: Set<userId>, originalInitiatorUserId,
 * }
 */
const matches = new Map()      // matchId -> match
const matchByUser = new Map()  // userId -> matchId

function fireSync(matchId, match) {
  pvpRedis.setCMoonPvpMatch(matchId, match).catch(e => console.error('[cmoonPvpRedisState] setCMoonPvpMatch:', e))
}
function fireDelete(matchId) {
  pvpRedis.delCMoonPvpMatch(matchId).catch(e => console.error('[cmoonPvpRedisState] delCMoonPvpMatch:', e))
}

function destroyMatch(matchId) {
  const match = matches.get(matchId)
  if (!match) return
  for (const uid of match.participants.keys()) {
    if (matchByUser.get(uid) === matchId) matchByUser.delete(uid)
  }
  matches.delete(matchId)
  fireDelete(matchId)
  broadcastLobby()
}

/* ── PvP Lobby — same coalesced-push pattern as cmoonRaidSocket.js's Raid Boss Lobby ──────────── */
let lobbyIo = null
let lobbyPushQueued = false
function broadcastLobby() {
  if (!lobbyIo || lobbyPushQueued) return
  lobbyPushQueued = true
  setImmediate(() => {
    lobbyPushQueued = false
    try {
      lobbyIo.local.to(LOBBY_ROOM).emit(EV('lobby'), { matches: buildPvpLobby(matches.values()), serverNow: Date.now() })
    } catch (err) {
      console.error('[cmoonPvpSocket] lobby broadcast failed:', err?.message || err)
    }
  })
}

function teamCounts(match) {
  let a = 0, b = 0
  for (const p of match.participants.values()) { if (p.team === 'A') a++; else b++ }
  return { a, b }
}
function bothTeamsFull(match) {
  const cap = match.maxTeamSize || MAX_TEAM_SIZE
  const { a, b } = teamCounts(match)
  return a >= cap && b >= cap
}
function bothTeamsReady(match) {
  const { a, b } = teamCounts(match)
  return a >= 1 && b >= 1
}

/* ── Serialization ────────────────────────────────────────────────────────────────────────────
 * Never includes any participant's pendingAction VALUE — only whether they've locked one in, same
 * "the room can see who's deciding, not what they chose" discipline publicRaidView already keeps.
 * Unlike raid there's no "enemy kit" to hide — both sides are players with their own public
 * special attacks, so team-wide status (paralyze/raise) is safe to reveal on both sides here.
 */
function publicPvpMatchView(match) {
  return {
    id: match.id,
    status: match.status,
    startedAt: match.startedAt,
    initiatorUsername: match.initiatorUsername,
    teamACMoonId: match.teamACMoonId || null,
    teamBCMoonId: match.teamBCMoonId || null,
    teammatesOnlyEnabled: !!match.teammatesOnlyEnabled,
    roundNumber: match.roundNumber,
    joinDeadlineAt: match.joinDeadlineAt,
    roundDeadlineAt: match.roundDeadlineAt,
    outcome: match.outcome || null,
    maxTeamSize: match.maxTeamSize || MAX_TEAM_SIZE,
    equalizeHpEnabled: !!match.equalizeHpEnabled,
    teamAParalyzedTurns: match.teamAParalyzedTurns || 0,
    teamBParalyzedTurns: match.teamBParalyzedTurns || 0,
    teamAAtkRaiseTurnsRemaining: match.teamAAtkRaiseTurnsRemaining || 0,
    teamBAtkRaiseTurnsRemaining: match.teamBAtkRaiseTurnsRemaining || 0,
    leaderKeepOpen: !!match.leaderKeepOpen,
    speedVoteCount: match.speedVotes ? match.speedVotes.size : 0,
    speedVoteRequired: requiredSpeedVotes(match),
    isPrivate: !!match.isPrivate,
    participants: Array.from(match.participants.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      team: p.team,
      hpRemaining: p.hpRemaining,
      maxHp: p.maxHp,
      knockedOut: !!p.knockedOutAt,
      isInitiator: p.isInitiator,
      hasActed: match.status === 'IN_PROGRESS' && !p.knockedOutAt ? !!p.pendingAction : false,
      hitStreak: p.hitStreak || 0,
      specialCharged: !!p.specialCharged,
      hitStreakThreshold: p.specialAttack?.requiredHitStreak || HIT_STREAK_THRESHOLD,
      specialAttack: p.specialAttack || null,
      poisonAmount: !p.knockedOutAt && p.poisonTurnsRemaining > 0 ? p.poisonAmount : 0,
      poisonTurnsRemaining: p.knockedOutAt ? 0 : (p.poisonTurnsRemaining || 0),
      cMoon: p.pendingJoin && !p.cMoonId ? null : {
        id: p.cMoonId || null, name: p.cMoonName || null, color: p.cMoonColor || null,
        avatarPath: p.cMoonAvatarPath || null, isPrestigeCMoon: !!p.cMoonIsPrestige,
      },
      rank: p.rankName
        ? { name: p.rankName, tierName: p.rankTierName || null, tierLevel: p.rankTierLevel || 0, tierCount: p.rankTierCount || 0 }
        : null,
      isCaptain: !!p.isCaptain,
      prestigeLevel: p.prestigeLevel || 0,
      rewardsGranted: p.rewardsGranted || null,
    })),
    battleReport: match.status === 'RESOLVED' ? buildPvpBattleReport({
      roundLog: match.roundLog,
      participants: Array.from(match.participants.values()).map(p => ({
        userId: p.userId, username: p.username, team: p.team, hpRemaining: p.hpRemaining, maxHp: p.maxHp,
        knockedOut: !!p.knockedOutAt, isInitiator: p.isInitiator,
      })),
      outcome: match.outcome,
    }) : null,
  }
}

function broadcast(io, match, event, extra) {
  io.local.to(matchRoom(match.id)).emit(event, { ...publicPvpMatchView(match), ...extra })
}

/* ── Eligibility (re-checked fresh on every start/join — never trusted from a client) ───────────
 * The reverse of this feature's own cross-exclusivity checks lives in cmoonRaidSocket.js's
 * loadEligibility and server/api/cmoon/battle/{start,consider}.post.js — see this file's own
 * header comment.
 */
async function loadPvpEligibility({ userId, team, match = null, config }) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, cMoonId: true, active: true, banned: true },
  })
  if (!user || !user.active || user.banned) return { ok: false, message: 'Not eligible to battle' }
  const activeMatchId = matchByUser.get(userId)
  if (activeMatchId && activeMatchId !== match?.id) return { ok: false, message: 'You are already in a PvP match' }
  const activeRaid = await db.cMoonEnemyRaidParticipant.findFirst({ where: { userId, activeUserId: userId }, select: { id: true } })
  if (activeRaid) return { ok: false, message: 'Finish your current raid before joining a PvP match' }
  const activeSolo = await db.cMoonEnemyBattle.findFirst({ where: { userId, status: 'IN_PROGRESS' }, select: { id: true } })
  if (activeSolo) return { ok: false, message: 'Finish your current battle before joining a PvP match' }

  const teammatesOnly = match ? match.teammatesOnlyEnabled : !!config?.cMoonPvpTeammatesOnlyEnabled
  if (teammatesOnly) {
    if (!user.cMoonId) return { ok: false, message: 'You must be in a cMoon to join this match' }
    if (match) {
      const lockedCMoonId = team === 'A' ? match.teamACMoonId : match.teamBCMoonId
      if (lockedCMoonId && lockedCMoonId !== user.cMoonId) return { ok: false, message: "This team is restricted to one cMoon's members" }
      const otherCMoonId = team === 'A' ? match.teamBCMoonId : match.teamACMoonId
      if (otherCMoonId && otherCMoonId === user.cMoonId) return { ok: false, message: 'The two teams must be different cMoons' }
    }
  }
  return { ok: true, user }
}

/* ── Per-participant team/rank/special snapshot — same shape loadParticipantProfile in
 * cmoonRaidSocket.js builds, minus the cMoon requirement (a PvP player with no cMoon at all can
 * still fight when teammates-only is off — see this file's own header comment). */
let tierCache = { at: 0, tiers: [] }
const TIER_CACHE_MS = 5 * 60 * 1000
async function loadRankTiers() {
  if (Date.now() - tierCache.at < TIER_CACHE_MS) return tierCache.tiers
  const tiers = await db.cMoonRankTier.findMany({ select: { id: true, sortOrder: true } })
  tierCache = { at: Date.now(), tiers }
  return tiers
}

async function loadPvpParticipantProfile(userId) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      cMoonId: true,
      currentCMoonRank: { select: { name: true, cMoonId: true, tierId: true, tier: { select: { name: true } } } },
      chosenSpecialAttack: { select: SPECIAL_ATTACK_SELECT },
      prestigeLevel: true,
    },
  })
  if (!user) return null
  let cMoon = null
  let isCaptain = false
  if (user.cMoonId) {
    [cMoon, isCaptain] = await Promise.all([
      db.cMoon.findUnique({
        where: { id: user.cMoonId },
        select: { id: true, name: true, color: true, avatarPath: true, specialAttack: true, isPrestigeCMoon: true },
      }),
      isCMoonCaptain(user.cMoonId, userId),
    ])
  }
  const tiers = await loadRankTiers().catch(() => [])
  const rank = user.currentCMoonRank && cMoon && user.currentCMoonRank.cMoonId === cMoon.id ? user.currentCMoonRank : null
  const specialAttack = pickEffectiveSpecialAttack(user.chosenSpecialAttack, cMoon?.specialAttack)
  return {
    cMoonId: cMoon?.id || null,
    cMoonName: cMoon?.name || null,
    cMoonColor: cMoon?.color || null,
    cMoonAvatarPath: cMoon?.avatarPath || null,
    cMoonIsPrestige: !!cMoon?.isPrestigeCMoon,
    prestigeLevel: user.prestigeLevel || 0,
    isCaptain,
    rankName: displayRankName(rank?.name || null, isCaptain),
    rankTierName: rank?.tier?.name || null,
    rankTierLevel: rank ? rankTierLevel(tiers, rank.tierId) : 0,
    rankTierCount: tiers.length,
    specialAttack: specialAttack || null,
  }
}

/* ── Lifecycle ────────────────────────────────────────────────────────────────────────────────── */

function addParticipant(match, { userId, username, team, isInitiator, maxHp, profile = null, pendingJoin = false }) {
  match.participants.set(userId, {
    userId, username, team, hpRemaining: maxHp, maxHp, knockedOutAt: null,
    pendingJoin: !!pendingJoin,
    isInitiator: !!isInitiator, pendingAction: null, joinedAt: Date.now(),
    consecutiveAfkRounds: 0,
    hitStreak: 0, specialCharged: false,
    poisonAmount: 0, poisonTurnsRemaining: 0,
    cMoonId: null, cMoonName: null, cMoonColor: null, cMoonAvatarPath: null, isCaptain: false,
    cMoonIsPrestige: false, prestigeLevel: 0,
    rankName: null, rankTierName: null, rankTierLevel: 0, rankTierCount: 0,
    specialAttack: null, rewardsGranted: null,
    ...(profile || {}),
  })
  matchByUser.set(userId, match.id)
}

function releaseReservation(match, userId) {
  if (match.participants.get(userId)?.pendingJoin) match.participants.delete(userId)
  if (matchByUser.get(userId) === match.id) matchByUser.delete(userId)
  broadcastLobby()
}

function startCombat(io, match) {
  match.status = 'IN_PROGRESS'
  match.combatStartedAt = Date.now()
  openRound(io, match)
  broadcastLobby()
}

function openRound(io, match) {
  match.roundDeadlineAt = Date.now() + ROUND_TIMEOUT_SECONDS * 1000
  for (const p of match.participants.values()) {
    if (!p.knockedOutAt) p.pendingAction = null
  }
  fireSync(match.id, match)
  broadcast(io, match, EV('roundOpened'))
}

// Minimum votes needed to speed-start a FORMING match's join window down to 5s — same 2/3-of-
// non-leader-participants-with-a-3-minimum floor as cmoonRaidSocket.js's own requiredSpeedVotes,
// just denominated over BOTH teams' combined headcount rather than one party.
function requiredSpeedVotes(match) {
  const size = match.participants.size
  if (size < 3 || bothTeamsFull(match)) return null
  const voterCount = size - 1
  return Math.ceil(voterCount * 2 / 3)
}
function maybeApplySpeedVote(match) {
  if (match.status !== 'FORMING') return
  const required = requiredSpeedVotes(match)
  if (required === null || match.speedVotes.size < required) return
  match.joinDeadlineAt = Math.min(match.joinDeadlineAt, Date.now() + 5000)
  match.leaderKeepOpen = false
}

function aliveParticipants(match) {
  return Array.from(match.participants.values()).filter(p => !p.knockedOutAt)
}
function allActed(match) {
  const alive = aliveParticipants(match)
  return alive.length > 0 && alive.every(p => p.pendingAction)
}

// Same "4 consecutive AFK rounds -> kicked, no rewards" discipline as cmoonRaidSocket.js's own
// applyAfkKicks — see that function's own comment for why the DB activeUserId release here is the
// one exit path raid's own history shows is easy to miss.
async function applyAfkKicks(io, match) {
  const kicked = aliveParticipants(match).filter(p => (p.consecutiveAfkRounds || 0) >= AFK_KICK_ROUNDS)
  if (!kicked.length) return

  for (const p of kicked) {
    match.participants.delete(p.userId)
    if (matchByUser.get(p.userId) === match.id) matchByUser.delete(p.userId)
    if (p.isInitiator && match.participants.size) {
      const successor = Array.from(match.participants.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0]
      successor.isInitiator = true
      match.initiatorUsername = successor.username
    }
  }

  const kickedIds = kicked.map(p => p.userId)
  try {
    await db.cMoonPvpParticipant.updateMany({
      where: { matchId: match.id, userId: { in: kickedIds } }, data: { activeUserId: null },
    })
  } catch (err) {
    console.error('[cmoonPvpSocket] applyAfkKicks activeUserId release failed:', err)
  }

  const kickedPayload = kicked.map(p => ({ userId: p.userId, username: p.username }))
  for (const p of kicked) {
    io.local.to(`user:${p.userId}`).emit(EV('kicked'), { matchId: match.id, reason: 'AFK' })
    io.in(`user:${p.userId}`).socketsLeave(matchRoom(match.id))
  }
  broadcast(io, match, EV('participantKicked'), { kicked: kickedPayload })
  fireSync(match.id, match)
}

/* ── Round resolution — symmetric generalization of cmoonRaidSocket.js's own closeRound. See
 * cmoonPvp.js's header comment for the full special-attack effect-type mapping each step below
 * drives. ──────────────────────────────────────────────────────────────────────────────────── */
async function closeRound(io, match) {
  if (match.status !== 'IN_PROGRESS' || match.resolving) return
  match.resolving = true
  try {
    const alive = aliveParticipants(match)
    const afkThisRound = new Set()
    for (const p of alive) {
      if (!p.pendingAction) {
        p.pendingAction = rollEnemyAction()
        afkThisRound.add(p.userId)
      }
    }
    for (const p of alive) {
      p.consecutiveAfkRounds = afkThisRound.has(p.userId) ? (p.consecutiveAfkRounds || 0) + 1 : 0
    }

    const specialEvents = []
    // Keyed per CASTER TEAM (not one shared slot like raid) — see cmoonPvp.js's own header
    // comment on why PvP's reflect/siphon deferral can't reuse raid's single-slot shape (both
    // sides cast in step 1 here, never just one).
    const roundGuards = {
      reflectUsedByTeam: { A: false, B: false }, siphonUsedByTeam: { A: false, B: false },
      pendingReflectByTeam: { A: null, B: null }, pendingSiphonByTeam: { A: null, B: null },
    }
    const aliveByTeam = { A: alive.filter(p => p.team === 'A'), B: alive.filter(p => p.team === 'B') }

    // ── 1. Specials chosen this round fire first, in join order — each caster fires THEIR OWN
    // special against the OTHER side (or their own team, for the team-wide effects). ───────────
    const firedSpecialUserIds = new Set()
    for (const p of alive) {
      if (p.pendingAction !== SPECIAL_ACTION) continue
      if (!p.specialCharged || !p.specialAttack) continue
      firedSpecialUserIds.add(p.userId)
      applyPvpSpecialAttack(match, aliveByTeam, p.specialAttack, { team: p.team, userId: p.userId }, specialEvents, { roundGuards })
    }
    // Whether each team's SHIELD_PARTY is active THIS round — read back from the events step 1
    // just pushed (never persisted match state — see SHIELD_PARTY's own comment in cmoonPvp.js).
    const teamShieldedByTeam = {
      A: specialEvents.some(s => s.effectType === 'SHIELD_PARTY' && s.team === 'A' && !s.missed),
      B: specialEvents.some(s => s.effectType === 'SHIELD_PARTY' && s.team === 'B' && !s.missed),
    }

    // ── 2. The round's symmetric lane exchange — every attacker vs. their own randomly-assigned
    // opponent, both substituted with PARALYZED_ACTION if their whole TEAM is currently stunned. ─
    const teamAParalyzedThisRound = (match.teamAParalyzedTurns || 0) > 0
    const teamBParalyzedThisRound = (match.teamBParalyzedTurns || 0) > 0
    const roundParticipants = alive.map(p => ({
      userId: p.userId, team: p.team,
      action: (p.team === 'A' ? teamAParalyzedThisRound : teamBParalyzedThisRound) ? PARALYZED_ACTION : p.pendingAction,
      hpRemaining: p.hpRemaining, maxHp: p.maxHp,
    }))
    const targetsByUserId = assignPvpTargets(roundParticipants)
    const teamAtkBonusByTeam = {
      A: (match.teamAAtkBonus || 0) + ((match.teamAAtkRaiseTurnsRemaining || 0) > 0 ? match.teamAAtkRaiseAmount : 0),
      B: (match.teamBAtkBonus || 0) + ((match.teamBAtkRaiseTurnsRemaining || 0) > 0 ? match.teamBAtkRaiseAmount : 0),
    }
    const { perParticipant, hittersByDefenderId } = resolvePvpRound({
      participants: roundParticipants, targetsByUserId, teamAtkBonusByTeam, teamShieldedByTeam,
    })
    const roundInfo = { perParticipant, hittersByDefenderId }

    for (const result of perParticipant) {
      const p = match.participants.get(result.userId)
      result.username = p.username
      p.hpRemaining = result.hpRemaining
      p.pendingAction = null
      if (result.knockedOut && !p.knockedOutAt) p.knockedOutAt = Date.now()
      // No captain-boost mechanic in PvP (raid's cMoonCaptainBoostEnabled never applies here — see
      // this feature's own plan on captain glow being purely cosmetic in PvP); just the attack's
      // own requiredHitStreak, same "bank leftover hits past threshold" rule raid already uses.
      const hitStreakThreshold = p.specialAttack?.requiredHitStreak || HIT_STREAK_THRESHOLD
      if (firedSpecialUserIds.has(result.userId)) {
        p.hitStreak = Math.max(0, p.hitStreak - hitStreakThreshold)
        p.specialCharged = p.hitStreak >= hitStreakThreshold
      } else {
        const maxBankedStreak = hitStreakThreshold * 2 - 1
        p.hitStreak = result.hit ? Math.min(p.hitStreak + 1, maxBankedStreak) : 0
        if (p.hitStreak >= hitStreakThreshold) p.specialCharged = true
      }
    }

    // Poison ticks — after the HP overwrite loop above, same ordering cmoonRaidSocket.js's own
    // closeRound uses and for the same reason (a tick's damage must never be clobbered by the
    // overwrite). A team's shield blocks only this round's tick damage for ITS OWN side.
    for (const p of alive) {
      if (p.knockedOutAt) continue
      if (p.poisonTurnsRemaining > 0) {
        if (!teamShieldedByTeam[p.team]) {
          p.hpRemaining = Math.max(0, p.hpRemaining - p.poisonAmount)
          if (p.hpRemaining <= 0) p.knockedOutAt = Date.now()
        }
        p.poisonTurnsRemaining -= 1
        if (p.poisonTurnsRemaining <= 0) p.poisonAmount = 0
      }
    }
    if (match.teamAParalyzedTurns > 0) match.teamAParalyzedTurns -= 1
    if (match.teamBParalyzedTurns > 0) match.teamBParalyzedTurns -= 1
    if (match.teamAAtkRaiseTurnsRemaining > 0) {
      match.teamAAtkRaiseTurnsRemaining -= 1
      if (match.teamAAtkRaiseTurnsRemaining <= 0) match.teamAAtkRaiseAmount = 0
    }
    if (match.teamBAtkRaiseTurnsRemaining > 0) {
      match.teamBAtkRaiseTurnsRemaining -= 1
      if (match.teamBAtkRaiseTurnsRemaining <= 0) match.teamBAtkRaiseAmount = 0
    }

    // ── 2.5. Resolve any queued REFLECT_DAMAGE/SIPHON_HEALTH now that this round's real outcome
    // is known — one per TEAM (either or both sides may have one pending), never re-pushing the
    // specialEvents entry (already pushed in step 1 when it was cast). ────────────────────────
    for (const team of TEAMS) {
      const pending = roundGuards.pendingReflectByTeam[team]
      if (pending) applyPvpReflectDamage(match, pending.attack, pending.caster, roundInfo, pending.event)
    }
    for (const team of TEAMS) {
      const pending = roundGuards.pendingSiphonByTeam[team]
      if (pending) applyPvpSiphonHealth(match, aliveByTeam, pending.attack, pending.caster, roundInfo, pending.event)
    }

    match.roundLog.push({
      round: match.roundNumber,
      participants: perParticipant.map(({ userId, team, action, targetUserId, hit, damageDealt, damageTaken, blocked, hpRemaining, knockedOut }) =>
        ({ userId, team, action, targetUserId, hit, damageDealt, damageTaken, blocked, hpRemaining, knockedOut })),
      ...(specialEvents.length ? { specials: specialEvents } : {}),
    })

    // AFK kicks happen after this round's own log/broadcast data is built but before the win/loss
    // check below — same ordering cmoonRaidSocket.js's own closeRound uses.
    await applyAfkKicks(io, match)

    const { a: aliveA, b: aliveB } = teamCounts2(match)
    const nextRoundNumber = match.roundNumber + 1

    broadcast(io, match, EV('roundResolved'), {
      round: { roundNumber: match.roundNumber, participants: perParticipant, specials: specialEvents },
    })

    if (aliveA === 0 && aliveB === 0) {
      await resolveCMoonPvpOutcome(io, match, 'ABANDONED')
    } else if (aliveA === 0) {
      await resolveCMoonPvpOutcome(io, match, 'TEAM_B_WIN')
    } else if (aliveB === 0) {
      await resolveCMoonPvpOutcome(io, match, 'TEAM_A_WIN')
    } else if (nextRoundNumber >= (match.roundLimit || PVP_ROUND_LIMIT_SAFETY)) {
      await resolveCMoonPvpOutcome(io, match, 'ABANDONED')
    } else {
      match.roundNumber = nextRoundNumber
      openRound(io, match)
    }
  } finally {
    match.resolving = false
  }
}

// Alive headcount per team — distinct from teamCounts() above (which counts EVERY participant,
// knocked out or not, for lobby/full-party display); the win/loss check needs the ALIVE count,
// since a team present-but-entirely-knocked-out must lose exactly like a team that's empty
// outright (an AFK-kicked-to-zero side).
function teamCounts2(match) {
  const alive = aliveParticipants(match)
  let a = 0, b = 0
  for (const p of alive) { if (p.team === 'A') a++; else b++ }
  return { a, b }
}

function mergeGrantSummaries(summaries) {
  const merged = { points: 0, backgrounds: 0, avatars: 0, ctoonJobs: [], packGrants: [] }
  for (const s of summaries) {
    if (!s) continue
    merged.points += s.points || 0
    merged.backgrounds += s.backgrounds || 0
    merged.avatars += s.avatars || 0
    merged.ctoonJobs.push(...(s.ctoonJobs || []))
    merged.packGrants.push(...(s.packGrants || []))
  }
  return merged
}
function grantedDisplayList(merged) {
  return [
    ...(merged.points ? [{ type: 'POINTS', quantity: merged.points }] : []),
    ...(merged.backgrounds ? [{ type: 'BACKGROUND', quantity: merged.backgrounds }] : []),
    ...(merged.avatars ? [{ type: 'AVATAR', quantity: merged.avatars }] : []),
    ...merged.ctoonJobs.map(j => ({ type: 'CTOON', name: j.name, quantity: j.quantity })),
    ...merged.packGrants.map(p => ({ type: 'PACK', name: p.name, quantity: p.quantity })),
  ]
}

/* ── Resolution: the one place a PvP match touches Postgres beyond its own create/resolve rows ── */
async function resolveCMoonPvpOutcome(io, match, outcome) {
  match.status = 'RESOLVED'
  match.outcome = outcome
  match.endedAt = Date.now()

  // A joiner whose participant row is still being written has nothing to update yet — same
  // "exclude pendingJoin before resolution" rule cmoonRaidSocket.js's own resolveCMoonRaidOutcome
  // follows, for the identical reason (including them would fail the transaction for everyone).
  for (const [uid, p] of match.participants) if (p.pendingJoin) match.participants.delete(uid)
  const allParticipantIds = Array.from(match.participants.keys())
  const winningTeam = outcome === 'TEAM_A_WIN' ? 'A' : outcome === 'TEAM_B_WIN' ? 'B' : null

  let winGrantable = null
  let participationGrantable = null
  if (winningTeam) {
    const [winRows, partRows] = await Promise.all([
      db.cMoonPvpReward.findMany({ where: { context: 'MATCH_WIN' }, include: { ctoon: { select: { quantity: true, name: true } } } }),
      db.cMoonPvpReward.findMany({ where: { context: 'MATCH_PARTICIPATION' }, include: { ctoon: { select: { quantity: true, name: true } } } }),
    ])
    winGrantable = buildGrantableReward(rollEnemyRewards(winRows))
    participationGrantable = buildGrantableReward(rollEnemyRewards(partRows))
  }
  const pointsAwarded = winningTeam ? Math.max(0, Number(match.pointsPerWin) || 0) : 0
  const winnerIds = winningTeam ? Array.from(match.participants.values()).filter(p => p.team === winningTeam).map(p => p.userId) : []
  const pointsShareByUser = splitPvpPoints(winnerIds, pointsAwarded)

  // Only cMoons that still exist get credited — an admin-deleted cMoon mid-match would otherwise
  // fail the whole transaction's FK writes, same "don't let a vanished team sink everyone else's
  // rewards" stance cmoonRaidSocket.js's own resolveCMoonRaidOutcome already takes.
  const teamIds = [match.teamACMoonId, match.teamBCMoonId].filter(Boolean)
  const existingTeams = teamIds.length ? await db.cMoon.findMany({ where: { id: { in: teamIds } }, select: { id: true } }) : []
  const existingTeamIds = new Set(existingTeams.map(c => c.id))

  const ctoonJobsByUser = new Map()
  const ctoonJobMethodByUser = new Map()
  try {
    await db.$transaction(async tx => {
      await tx.cMoonPvpMatch.update({
        where: { id: match.id },
        data: {
          status: 'RESOLVED', outcome, roundNumber: match.roundNumber, roundLog: match.roundLog,
          endedAt: new Date(match.endedAt),
          combatStartedAt: match.combatStartedAt ? new Date(match.combatStartedAt) : null,
          teamACMoonId: match.teamACMoonId || null, teamBCMoonId: match.teamBCMoonId || null,
        },
      })

      for (const userId of allParticipantIds) {
        const p = match.participants.get(userId)
        let granted = null
        if (winningTeam) {
          const isWinner = p.team === winningTeam
          const summaries = []
          if (isWinner && winGrantable) summaries.push(await grantRewardInTx(tx, userId, winGrantable, REWARD_METHOD_WIN))
          if (!isWinner && participationGrantable) summaries.push(await grantRewardInTx(tx, userId, participationGrantable, REWARD_METHOD_PARTICIPATION))
          if (summaries.length) {
            const merged = mergeGrantSummaries(summaries)
            granted = grantedDisplayList(merged)
            if (merged.ctoonJobs.length) {
              ctoonJobsByUser.set(userId, merged.ctoonJobs)
              ctoonJobMethodByUser.set(userId, isWinner ? REWARD_METHOD_WIN : REWARD_METHOD_PARTICIPATION)
            }
          }
        }
        await tx.cMoonPvpParticipant.update({
          where: { matchId_userId: { matchId: match.id, userId } },
          data: {
            hpRemaining: p.hpRemaining,
            knockedOutAt: p.knockedOutAt ? new Date(p.knockedOutAt) : null,
            rewardsGranted: granted,
            activeUserId: null,
          },
        })
        p.rewardsGranted = granted

        const share = pointsShareByUser.get(userId) || 0
        if (share > 0 && p.cMoonId && existingTeamIds.has(p.cMoonId)) {
          await tx.cMoonScoreLog.create({
            data: { cMoonId: p.cMoonId, userId, category: 'PVP_MATCH_WIN', detail: match.id, points: share, weekStart: new Date() },
          })
        }
      }

      // Each team gets the win/loss once, never once per participant — same "one team result per
      // fight" rule raid's own battleWins/battleLosses crediting follows.
      if (winningTeam && match.teamACMoonId && existingTeamIds.has(match.teamACMoonId)) {
        await tx.cMoon.update({
          where: { id: match.teamACMoonId },
          data: winningTeam === 'A' ? { battleWins: { increment: 1 } } : { battleLosses: { increment: 1 } },
        })
      }
      if (winningTeam && match.teamBCMoonId && existingTeamIds.has(match.teamBCMoonId)) {
        await tx.cMoon.update({
          where: { id: match.teamBCMoonId },
          data: winningTeam === 'B' ? { battleWins: { increment: 1 } } : { battleLosses: { increment: 1 } },
        })
      }
    })
  } catch (err) {
    console.error('[cmoonPvpSocket] resolveCMoonPvpOutcome transaction failed:', err?.message || err)
  }

  for (const [userId, jobs] of ctoonJobsByUser.entries()) {
    enqueueCtoonJobs(userId, jobs, ctoonJobMethodByUser.get(userId) || REWARD_METHOD_WIN).catch(() => {})
  }
  if (pointsAwarded > 0) recomputeCMoonPointsForUsers(winnerIds).catch(() => {})
  for (const userId of allParticipantIds) processAchievementsForUser(userId).catch(() => {})

  broadcast(io, match, EV('ended'))
  destroyMatch(match.id)
}

// A FORMING match abandoned without both sides ever filling, past SOLO_FORMING_ABANDON_MS — same
// shape as cmoonRaidSocket.js's own destroySoloAbandonedRaid, awaited before destroyMatch for the
// same reason (so activeUserId is actually cleared before a same-tick rejoin could race it).
async function destroyAbandonedMatch(io, match) {
  const participantIds = Array.from(match.participants.keys())
  broadcast(io, match, EV('cancelled'), { message: 'This match was cancelled — not enough players joined in time.' })
  try {
    await db.cMoonPvpParticipant.updateMany({
      where: { matchId: match.id, userId: { in: participantIds } }, data: { activeUserId: null },
    })
  } catch (err) {
    console.error('[cmoonPvpSocket] abandon activeUserId release failed:', err)
  }
  destroyMatch(match.id)
}

/* ── Sweep: the join-window and round-timeout clock ─────────────────────────────────────────── */
function sweep(io) {
  const now = Date.now()
  for (const match of Array.from(matches.values())) {
    if (match.status === 'FORMING' && !match.leaderKeepOpen && now >= match.joinDeadlineAt) {
      if (!bothTeamsReady(match)) {
        if (now - match.startedAt >= SOLO_FORMING_ABANDON_MS) {
          destroyAbandonedMatch(io, match).catch(err => console.error('[cmoonPvpSocket] sweep abandon failed:', err))
          continue
        }
        match.joinDeadlineAt = now + (match.joinWindowMs || JOIN_WINDOW_SECONDS * 1000)
        fireSync(match.id, match)
        broadcast(io, match, EV('state'))
        broadcastLobby()
        continue
      }
      startCombat(io, match)
    } else if (match.status === 'IN_PROGRESS' && now >= match.roundDeadlineAt) {
      closeRound(io, match).catch(err => console.error('[cmoonPvpSocket] sweep closeRound failed:', err))
    }
  }
}

let sweepTimer = null
export function startCMoonPvpSweep(io) {
  lobbyIo = io
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep(io) } catch (err) { console.error('[cmoonPvpSocket] sweep failed:', err) }
  }, SWEEP_INTERVAL_MS)
  sweepTimer.unref?.()
}

/** Restores in-memory match state from Redis on boot — mirrors restoreCMoonRaids exactly. */
export async function restoreCMoonPvpMatches() {
  const restored = await pvpRedis.scanCMoonPvpMatches()
  for (const [matchId, match] of restored.entries()) {
    match.participants = new Map(match.participants.map(p => ([
      p.userId, {
        hitStreak: 0, specialCharged: false, isCaptain: false, poisonAmount: 0, poisonTurnsRemaining: 0,
        consecutiveAfkRounds: 0, ...p,
      },
    ])))
    match.resolving = false
    // A join that was mid-write when the process went down — drop it, and release any lock row it
    // managed to write, same handling restoreCMoonRaids gives a stale pendingJoin.
    for (const [uid, p] of match.participants) {
      if (!p.pendingJoin) continue
      match.participants.delete(uid)
      db.cMoonPvpParticipant.deleteMany({ where: { matchId, userId: uid } }).catch(() => {})
    }
    match.teamAAtkBonus ??= 0
    match.teamBAtkBonus ??= 0
    match.teamAAtkRaiseAmount ??= 0
    match.teamAAtkRaiseTurnsRemaining ??= 0
    match.teamBAtkRaiseAmount ??= 0
    match.teamBAtkRaiseTurnsRemaining ??= 0
    match.teamAParalyzedTurns ??= 0
    match.teamBParalyzedTurns ??= 0
    match.leaderKeepOpen ??= false
    match.keepOpenExtensionUsed ??= false
    match.speedVotes = new Set(Array.isArray(match.speedVotes) ? match.speedVotes : [])
    match.joinWindowMs ??= JOIN_WINDOW_SECONDS * 1000
    match.roundLimit ??= PVP_ROUND_LIMIT_SAFETY
    match.isPrivate ??= false
    match.teammatesOnlyEnabled ??= false
    match.equalizeHpEnabled ??= false
    match.pointsPerWin ??= 0
    match.tournamentMatchId ??= null
    match.originalInitiatorUserId ??= Array.from(match.participants.values()).find(p => p.isInitiator)?.userId ?? null
    matches.set(matchId, match)
    for (const uid of match.participants.keys()) matchByUser.set(uid, matchId)
  }
  return restored.size
}

/* ── Registration ─────────────────────────────────────────────────────────────────────────────── */
export function registerCMoonPvp(io, socket, resolveSocketUser) {
  lobbyIo = io

  socket.on(EV('lobbySubscribe'), async () => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    socket.join(LOBBY_ROOM)
    socket.emit(EV('lobby'), { matches: buildPvpLobby(matches.values()), serverNow: Date.now() })
    socket.emit(EV('lobbyViewer'), { currentMatchId: matchByUser.get(me.id) || null })
  })
  socket.on(EV('lobbyUnsubscribe'), () => { socket.leave(LOBBY_ROOM) })

  socket.on(EV('start'), async ({ team, isPrivate } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    try {
      const config = await getGlobalConfig()
      if (!config?.cMoonPvpEnabled) return socket.emit(EV('error'), { message: 'cMoon PvP is currently disabled' })
      const chosenTeam = team === 'B' ? 'B' : 'A'
      const elig = await loadPvpEligibility({ userId: me.id, team: chosenTeam, match: null, config })
      if (!elig.ok) return socket.emit(EV('error'), { message: elig.message })

      const teammatesOnlyEnabled = !!config.cMoonPvpTeammatesOnlyEnabled
      const equalizeHpEnabled = !!config.cMoonPvpEqualizeHpEnabled
      const equalizeHpAmount = equalizeHpEnabled
        ? (Number.isInteger(config.cMoonPvpEqualizeHpAmount) && config.cMoonPvpEqualizeHpAmount > 0 ? config.cMoonPvpEqualizeHpAmount : PLAYER_MAX_HP)
        : null
      const initiatorMaxHp = equalizeHpEnabled ? equalizeHpAmount : await getPlayerCombatMaxHp(me.id, config)
      const profile = await loadPvpParticipantProfile(me.id)
      if (!profile) return socket.emit(EV('error'), { message: 'Your profile could not be loaded' })

      const maxTeamSize = Number.isInteger(config.cMoonPvpMaxTeamSize) && config.cMoonPvpMaxTeamSize >= 1 && config.cMoonPvpMaxTeamSize <= 8
        ? config.cMoonPvpMaxTeamSize : MAX_TEAM_SIZE
      const joinWindowMs = (Number.isInteger(config.cMoonPvpJoinWindowSeconds) && config.cMoonPvpJoinWindowSeconds > 0
        ? config.cMoonPvpJoinWindowSeconds : JOIN_WINDOW_SECONDS) * 1000
      const roundLimit = Number.isInteger(config.cMoonPvpRoundLimit) && config.cMoonPvpRoundLimit > 0
        ? config.cMoonPvpRoundLimit : PVP_ROUND_LIMIT_SAFETY
      const pointsPerWin = Math.max(0, Number(config.cMoonPvpPointsPerWin) || 0)

      const matchId = randomUUID()
      const match = {
        id: matchId, status: 'FORMING', outcome: null,
        initiatorUsername: elig.user.username,
        teamACMoonId: teammatesOnlyEnabled && chosenTeam === 'A' ? (elig.user.cMoonId || null) : null,
        teamBCMoonId: teammatesOnlyEnabled && chosenTeam === 'B' ? (elig.user.cMoonId || null) : null,
        teammatesOnlyEnabled, maxTeamSize, equalizeHpEnabled, equalizeHpAmount, pointsPerWin,
        roundNumber: 1, roundDeadlineAt: null,
        joinDeadlineAt: Date.now() + joinWindowMs, joinWindowMs,
        participants: new Map(), roundLog: [],
        startedAt: Date.now(), combatStartedAt: null, endedAt: null, resolving: false,
        teamAAtkBonus: 0, teamBAtkBonus: 0,
        teamAAtkRaiseAmount: 0, teamAAtkRaiseTurnsRemaining: 0,
        teamBAtkRaiseAmount: 0, teamBAtkRaiseTurnsRemaining: 0,
        teamAParalyzedTurns: 0, teamBParalyzedTurns: 0,
        isPrivate: config.cMoonPvpPrivateLobbiesEnabled !== false ? !!isPrivate : false,
        originalInitiatorUserId: me.id,
        leaderKeepOpen: false, keepOpenExtensionUsed: false, speedVotes: new Set(),
        roundLimit, tournamentMatchId: null,
      }
      addParticipant(match, { userId: me.id, username: elig.user.username, team: chosenTeam, isInitiator: true, maxHp: initiatorMaxHp, profile })
      matches.set(matchId, match)

      try {
        await db.$transaction([
          db.cMoonPvpMatch.create({
            data: {
              id: matchId, status: 'FORMING', teamACMoonId: match.teamACMoonId, teamBCMoonId: match.teamBCMoonId,
              maxTeamSize, equalizeHpEnabled, equalizeHpAmount, joinDeadlineAt: new Date(match.joinDeadlineAt),
              isPrivate: match.isPrivate,
            },
          }),
          db.cMoonPvpParticipant.create({
            data: { matchId, userId: me.id, team: chosenTeam, hpRemaining: initiatorMaxHp, isInitiator: true, activeUserId: me.id },
          }),
        ])
      } catch (err) {
        destroyMatch(matchId)
        throw err
      }

      socket.join(matchRoom(matchId))
      fireSync(matchId, match)
      socket.emit(EV('created'), publicPvpMatchView(match))
      broadcastLobby()
    } catch (err) {
      console.error('[cmoonpvp:start] failed:', err)
      socket.emit(EV('error'), { message: 'Could not start a PvP match right now' })
    }
  })

  socket.on(EV('join'), async ({ matchId, team } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const chosenTeam = team === 'A' || team === 'B' ? team : null
    if (!chosenTeam) return socket.emit(EV('error'), { message: 'Choose a team to join' })
    const match = matches.get(matchId)
    if (!match || match.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This match is no longer accepting joins' })
    if (match.participants.has(me.id)) {
      socket.join(matchRoom(matchId))
      return socket.emit(EV('created'), publicPvpMatchView(match))
    }
    if (teamCounts(match)[chosenTeam === 'A' ? 'a' : 'b'] >= (match.maxTeamSize || MAX_TEAM_SIZE)) {
      return socket.emit(EV('error'), { message: 'That team is full' })
    }

    let elig, profile, joinerMaxHp
    try {
      const config = await getGlobalConfig()
      elig = await loadPvpEligibility({ userId: me.id, team: chosenTeam, match, config })
      if (!elig.ok) return socket.emit(EV('error'), { message: elig.message })
      profile = await loadPvpParticipantProfile(me.id)
      if (!profile) return socket.emit(EV('error'), { message: 'Your profile could not be loaded' })
      joinerMaxHp = match.equalizeHpEnabled ? (match.equalizeHpAmount || PLAYER_MAX_HP) : await getPlayerCombatMaxHp(me.id)
    } catch (err) {
      console.error('[cmoonpvp:join] eligibility failed:', err)
      return socket.emit(EV('error'), { message: 'Could not join this match' })
    }

    // Re-check and reserve SYNCHRONOUSLY — same "the awaits above may have let the window close,
    // the team fill, or this player get into another match" race guard as cmoonraid:join.
    if (matches.get(matchId) !== match || match.status !== 'FORMING') {
      return socket.emit(EV('error'), { message: 'This match is no longer accepting joins' })
    }
    if (match.participants.has(me.id)) {
      socket.join(matchRoom(matchId))
      return socket.emit(EV('created'), publicPvpMatchView(match))
    }
    const otherMatchId = matchByUser.get(me.id)
    if (otherMatchId && otherMatchId !== matchId) return socket.emit(EV('error'), { message: 'You are already in a PvP match' })
    if (teamCounts(match)[chosenTeam === 'A' ? 'a' : 'b'] >= (match.maxTeamSize || MAX_TEAM_SIZE)) {
      return socket.emit(EV('error'), { message: 'That team is full' })
    }
    if (match.teammatesOnlyEnabled) {
      const key = chosenTeam === 'A' ? 'teamACMoonId' : 'teamBCMoonId'
      if (!match[key]) match[key] = elig.user.cMoonId
    }
    addParticipant(match, { userId: me.id, username: elig.user.username, team: chosenTeam, isInitiator: false, maxHp: joinerMaxHp, profile, pendingJoin: true })

    try {
      await db.cMoonPvpParticipant.upsert({
        where: { matchId_userId: { matchId, userId: me.id } },
        create: { matchId, userId: me.id, team: chosenTeam, hpRemaining: joinerMaxHp, isInitiator: false, activeUserId: me.id },
        update: { team: chosenTeam, hpRemaining: joinerMaxHp, isInitiator: false, activeUserId: me.id, knockedOutAt: null, rewardsGranted: null, joinedAt: new Date() },
      })
    } catch (err) {
      releaseReservation(match, me.id)
      if (err?.code === 'P2002') return socket.emit(EV('error'), { message: 'You are already in a PvP match' })
      console.error('[cmoonpvp:join] failed:', err)
      return socket.emit(EV('error'), { message: 'Could not join this match' })
    }

    if (matches.get(matchId) !== match || match.status === 'RESOLVED' || !match.participants.has(me.id)) {
      releaseReservation(match, me.id)
      await db.cMoonPvpParticipant.updateMany({ where: { matchId, userId: me.id }, data: { activeUserId: null } }).catch(() => {})
      return socket.emit(EV('error'), { message: 'This match is no longer accepting joins' })
    }
    match.participants.get(me.id).pendingJoin = false
    socket.join(matchRoom(matchId))
    maybeApplySpeedVote(match)
    fireSync(matchId, match)
    broadcast(io, match, EV('participantJoined'))
    broadcastLobby()
    if (bothTeamsFull(match) && match.status === 'FORMING') startCombat(io, match)
  })

  socket.on(EV('leave'), async ({ matchId }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const match = matches.get(matchId)
    if (!match || match.status !== 'FORMING' || !match.participants.has(me.id)) return
    const leavingParticipant = match.participants.get(me.id)
    match.participants.delete(me.id)
    match.speedVotes.delete(me.id)
    matchByUser.delete(me.id)
    socket.leave(matchRoom(matchId))
    socket.emit(EV('leftMatch'), { matchId })
    await db.cMoonPvpParticipant.deleteMany({ where: { matchId, userId: me.id } }).catch(() => {})
    // If that was the last member of their side, release the teammates-only lock on it — an
    // abandoned side should be claimable by a different cMoon, not stuck forever (see this file's
    // own header comment on teammates-only).
    if (match.teammatesOnlyEnabled) {
      const stillOnTeam = Array.from(match.participants.values()).some(p => p.team === leavingParticipant.team)
      if (!stillOnTeam) {
        if (leavingParticipant.team === 'A') match.teamACMoonId = null
        else match.teamBCMoonId = null
      }
    }
    if (!match.participants.size) { destroyMatch(matchId); return }
    if (leavingParticipant?.isInitiator) {
      const successor = Array.from(match.participants.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0]
      successor.isInitiator = true
      match.initiatorUsername = successor.username
      match.speedVotes.delete(successor.userId)
    }
    maybeApplySpeedVote(match)
    fireSync(matchId, match)
    broadcast(io, match, EV('participantLeft'))
    broadcastLobby()
  })

  socket.on(EV('toggleKeepOpen'), async ({ matchId, keepOpen } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const match = matches.get(matchId)
    if (!match || match.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This match is not open for joining' })
    const p = match.participants.get(me.id)
    if (!p?.isInitiator) return socket.emit(EV('error'), { message: 'Only the match leader can do that' })
    match.leaderKeepOpen = !!keepOpen
    if (!match.leaderKeepOpen) {
      if (!match.keepOpenExtensionUsed) {
        match.keepOpenExtensionUsed = true
        const config = await getGlobalConfig().catch(() => null)
        const seconds = Number.isInteger(config?.cMoonPvpJoinWindowSeconds) && config.cMoonPvpJoinWindowSeconds > 0
          ? config.cMoonPvpJoinWindowSeconds : JOIN_WINDOW_SECONDS
        match.joinDeadlineAt = Date.now() + seconds * 1000
      } else if (match.joinDeadlineAt <= Date.now()) {
        match.joinDeadlineAt = Date.now() + SWEEP_INTERVAL_MS
      }
    }
    fireSync(matchId, match)
    broadcast(io, match, EV('state'))
    broadcastLobby()
  })

  socket.on(EV('forceStart'), async ({ matchId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const match = matches.get(matchId)
    if (!match || match.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This match is not open for joining' })
    const p = match.participants.get(me.id)
    if (!p?.isInitiator) return socket.emit(EV('error'), { message: 'Only the match leader can do that' })
    if (!bothTeamsReady(match)) return socket.emit(EV('error'), { message: 'Both teams need at least one player to start' })
    startCombat(io, match)
  })

  socket.on(EV('cancelMatch'), async ({ matchId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const match = matches.get(matchId)
    if (!match || match.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This match can no longer be cancelled' })
    const p = match.participants.get(me.id)
    if (!p?.isInitiator) return socket.emit(EV('error'), { message: 'Only the match leader can do that' })
    const participantIds = Array.from(match.participants.keys())
    broadcast(io, match, EV('cancelled'), { message: 'The match leader cancelled this match.' })
    await db.cMoonPvpParticipant.updateMany({
      where: { matchId, userId: { in: participantIds } }, data: { activeUserId: null },
    }).catch(() => {})
    destroyMatch(matchId)
  })

  socket.on(EV('voteSpeedUp'), async ({ matchId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const match = matches.get(matchId)
    if (!match || match.status !== 'FORMING' || !match.participants.has(me.id)) {
      return socket.emit(EV('error'), { message: 'You are not in this match' })
    }
    if (match.participants.get(me.id)?.isInitiator) {
      return socket.emit(EV('error'), { message: 'The match leader cannot vote — use Start now instead' })
    }
    match.speedVotes.add(me.id)
    maybeApplySpeedVote(match)
    fireSync(matchId, match)
    broadcast(io, match, EV('state'))
    broadcastLobby()
  })

  socket.on(EV('getState'), async ({ matchId }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const match = matches.get(matchId)
    if (match) {
      if (match.participants.has(me.id)) socket.join(matchRoom(matchId))
      return socket.emit(EV('state'), publicPvpMatchView(match))
    }
    // Not in memory — either it never existed or it already resolved; fall back to a read-only
    // view of the permanent record so a late notification click still shows something.
    const row = await db.cMoonPvpMatch.findUnique({
      where: { id: matchId },
      include: {
        participants: { include: { user: { select: { username: true } } } },
        teamA: { select: { id: true, name: true, color: true, avatarPath: true } },
        teamB: { select: { id: true, name: true, color: true, avatarPath: true } },
      },
    })
    if (!row) return socket.emit(EV('error'), { message: 'Match not found' })
    socket.emit(EV('state'), {
      id: row.id, status: row.status, outcome: row.outcome || null,
      teamACMoonId: row.teamACMoonId, teamBCMoonId: row.teamBCMoonId,
      roundNumber: row.roundNumber, joinDeadlineAt: row.joinDeadlineAt?.getTime() || null,
      roundDeadlineAt: null, maxTeamSize: row.maxTeamSize,
      participants: row.participants.map(p => ({
        userId: p.userId, username: p.user?.username || null, team: p.team,
        hpRemaining: p.hpRemaining, knockedOut: !!p.knockedOutAt, isInitiator: p.isInitiator,
        rewardsGranted: p.rewardsGranted || null,
        cMoon: p.team === 'A' ? row.teamA : row.teamB,
      })),
      battleReport: row.outcome ? buildPvpBattleReport({
        roundLog: row.roundLog,
        participants: row.participants.map(p => ({
          userId: p.userId, username: p.user?.username || null, team: p.team,
          hpRemaining: p.hpRemaining, knockedOut: !!p.knockedOutAt, isInitiator: p.isInitiator,
        })),
        outcome: row.outcome,
      }) : null,
    })
  })

  socket.on(EV('action'), async ({ matchId, action, roundNumber }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    if (!isValidPlayerSubmittedAction(action)) return socket.emit(EV('error'), { message: 'Invalid action' })
    const match = matches.get(matchId)
    if (!match || match.status !== 'IN_PROGRESS') return socket.emit(EV('error'), { message: 'This match is not in combat' })
    if (Number(roundNumber) !== match.roundNumber) return socket.emit(EV('error'), { message: 'Stale round — reload this match' })
    const p = match.participants.get(me.id)
    if (!p) return socket.emit(EV('error'), { message: 'You are not in this match' })
    if (p.knockedOutAt) return socket.emit(EV('error'), { message: 'You have been knocked out of this match' })
    if (p.pendingAction) return // already locked in this round — a duplicate click is a no-op
    if (action === SPECIAL_ACTION) {
      if (!p.specialCharged) return socket.emit(EV('error'), { message: 'Your special attack is not charged yet' })
      if (!p.specialAttack) return socket.emit(EV('error'), { message: 'You have no special attack assigned' })
      const teamParalyzedTurns = match[`team${p.team}ParalyzedTurns`] || 0
      if (teamParalyzedTurns > 0 && p.specialAttack?.effectType !== 'CLEANSE_SELF') {
        return socket.emit(EV('error'), { message: `Your team is paralyzed and can't act for ${teamParalyzedTurns} more round(s)` })
      }
    }
    p.pendingAction = action
    fireSync(match.id, match)
    broadcast(io, match, EV('participantActed'), { actedUserId: me.id })
    if (allActed(match)) await closeRound(io, match)
  })
}
