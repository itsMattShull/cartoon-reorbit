// server/utils/cmoonRaidSocket.js
//
// Real-time runtime for cMoon Enemy Battles "raid boss" co-op fights: up to 4 members of ONE
// cMoon fighting a single CMoonEnemyMember (isRaidBoss = true) together, live, all facing the
// same rolled enemy action every round. Registered per-connection from socket-server.js exactly
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
// (same cMoon, active, not banned, no other active raid or solo battle, personal win count
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
import { getGlobalConfig, getPlayerCombatMaxHp } from './cmoon.js'
import { grantRewardInTx, enqueueCtoonJobs, processAchievementsForUser } from './achievements.js'
import { recomputeCMoonPointsForUsers } from '../cron/cmoon-points-aggregate.js'
import { announceCMoonRaidBoss } from './discord.js'
import { notifyCMoonRaidBossStarted } from './notifications.js'
import { pushUserNotification } from './realtimeNotify.js'
import { buildGrantableReward } from './cmoonEnemyBattle.js'
import { resolveMemberSoundPaths } from './cmoonEnemy.js'
import {
  resolveRaidRound, rollEnemyAction, rollEnemyRewards, isValidBattleAction, PLAYER_MAX_HP,
  JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_PARTY_SIZE, MAX_ROUNDS_SAFETY,
  checkRaidBossAvailability,
} from './cmoonEnemyRaid.js'
import * as raidRedis from './cmoonRaidRedisState.js'

const SWEEP_INTERVAL_MS = 2000
const EV = (name) => `cmoonraid:${name}`
const raidRoom = (raidId) => `cmoonraid:room:${raidId}`
const REWARD_METHOD = 'CMOON_ENEMY_RAID_WIN'

/* ── In-memory state (single-process — see header) ──────────────────────────────────────────
 * raid: {
 *   id, enemyMemberId, cMoonId, status: 'FORMING'|'IN_PROGRESS'|'RESOLVED',
 *   enemyName, enemyImagePath,               // display snapshot, taken once at creation
 *   enemySounds: { appearSoundPath, damageTakenSoundPath, damageAvoidedSoundPath,
 *                  attackingSoundPath, victorySoundPath, defeatSoundPath },  // ditto
 *   battleMusicPath,                         // ditto — the faction's own looping battle music
 *   enemyStats: { maxHp, critChanceAgainstPercent, critChanceFromPercent, cMoonPointsReward },
 *   enemyHpRemaining, roundNumber, currentEnemyAction, roundDeadlineAt, joinDeadlineAt,
 *   participants: Map<userId, { userId, username, hpRemaining, knockedOutAt, isInitiator,
 *                                pendingAction, joinedAt }>,
 *   roundLog: [], startedAt, combatStartedAt, endedAt, outcome, resolving,
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
    enemyMaxHp: raid.enemyStats.maxHp,
    enemyHpRemaining: raid.enemyHpRemaining,
    roundNumber: raid.roundNumber,
    joinDeadlineAt: raid.joinDeadlineAt,
    roundDeadlineAt: raid.roundDeadlineAt,
    outcome: raid.outcome || null,
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
    })),
  }
}

function broadcast(io, raid, event, extra) {
  io.local.to(raidRoom(raid.id)).emit(event, { ...publicRaidView(raid), ...extra })
}

/* ── Eligibility (re-checked fresh on every start/join — never trusted from a client) ───────── */

// `reservedForRaidId`: the join handler reserves this user's slot in `raid.participants`/
// `raidByUser` SYNCHRONOUSLY, before this function's own awaits, to close a join-race window
// (see cmoonraid:join's own comment) — so by the time this runs, raidByUser.has(userId) is
// always true for their OWN reservation. Passing the raid id being joined lets this only reject
// a genuinely different active raid, not the one currently being confirmed.
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

/* ── Notifying/announcing the rest of the cMoon at raid:start ────────────────────────────────
 * Fire-and-forget from the caller's point of view — a failed Discord post or notification write
 * must never fail or roll back the raid itself, same stance server/utils/discord.js's own
 * announce* functions already take (they never throw).
 */
async function notifyEligibleCMoonMembers(io, { cMoonId, initiatorUserId, enemyMember, raidId, cMoonName }) {
  try {
    const candidates = await db.user.findMany({
      where: { cMoonId, id: { not: initiatorUserId }, active: true, banned: false },
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
    await Promise.all(eligibleIds.map(async userId => {
      const wrote = await notifyCMoonRaidBossStarted(db, { userId, raidId, enemyName: enemyMember.name, cMoonName })
      // Live push on top of the DB write, not instead of it — see pushUserNotification's own
      // comment on why this is a bare "go refetch" ping. Only pushed when the write actually
      // happened (skipped for a banned/opted-out recipient, same gate notifyCMoonRaidBossStarted
      // itself already applies via isNotifiable), and only matters for whoever has a tab open
      // right now; everyone else still gets it from their next ordinary poll.
      if (wrote) pushUserNotification(io, userId)
    }))
  } catch (err) {
    console.error('[cmoonRaidSocket] notifyEligibleCMoonMembers failed:', err?.message || err)
  }
}

/* ── Lifecycle ────────────────────────────────────────────────────────────────────────────── */

function addParticipant(raid, { userId, username, isInitiator, maxHp }) {
  raid.participants.set(userId, {
    userId, username, hpRemaining: maxHp, maxHp, knockedOutAt: null,
    isInitiator: !!isInitiator, pendingAction: null, joinedAt: Date.now(),
  })
  raidByUser.set(userId, raid.id)
}

function startCombat(io, raid) {
  raid.status = 'IN_PROGRESS'
  raid.combatStartedAt = Date.now()
  openRound(io, raid)
}

function openRound(io, raid) {
  raid.currentEnemyAction = rollEnemyAction()
  raid.roundDeadlineAt = Date.now() + ROUND_TIMEOUT_SECONDS * 1000
  for (const p of raid.participants.values()) {
    if (!p.knockedOutAt) p.pendingAction = null
  }
  fireSync(raid.id, raid)
  broadcast(io, raid, EV('roundOpened'))
}

function aliveParticipants(raid) {
  return Array.from(raid.participants.values()).filter(p => !p.knockedOutAt)
}

function allActed(raid) {
  const alive = aliveParticipants(raid)
  return alive.length > 0 && alive.every(p => p.pendingAction)
}

async function closeRound(io, raid) {
  if (raid.status !== 'IN_PROGRESS' || raid.resolving) return
  raid.resolving = true
  try {
    const alive = aliveParticipants(raid)
    // A straggler who never acted before the deadline is auto-filled with a uniform-random
    // action (see this file's own header comment) so they can never freeze the round forever.
    for (const p of alive) if (!p.pendingAction) p.pendingAction = rollEnemyAction()

    const { enemyAction, perParticipant, enemyDamageDealt } = resolveRaidRound({
      enemyAction: raid.currentEnemyAction,
      enemyMember: raid.enemyStats,
      participants: alive.map(p => ({ userId: p.userId, action: p.pendingAction, hpRemaining: p.hpRemaining, maxHp: p.maxHp })),
    })

    for (const result of perParticipant) {
      const p = raid.participants.get(result.userId)
      p.hpRemaining = result.hpRemaining
      p.pendingAction = null
      if (result.knockedOut && !p.knockedOutAt) p.knockedOutAt = Date.now()
    }
    raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - enemyDamageDealt)
    raid.roundLog.push({
      round: raid.roundNumber, enemyAction, enemyDamageDealt,
      enemyHpRemaining: raid.enemyHpRemaining,
      participants: perParticipant.map(({ userId, action, playerHit, enemyHit, playerBlocked, enemyBlocked, playerCrit, enemyCrit }) =>
        ({ userId, action, playerHit, enemyHit, playerBlocked, enemyBlocked, playerCrit, enemyCrit })),
    })

    const everyoneDown = Array.from(raid.participants.values()).every(p => !!p.knockedOutAt)
    const nextRoundNumber = raid.roundNumber + 1

    broadcast(io, raid, EV('roundResolved'), {
      round: { roundNumber: raid.roundNumber, enemyAction, enemyDamageDealt, participants: perParticipant },
    })

    if (raid.enemyHpRemaining <= 0) {
      await resolveCMoonRaidOutcome(io, raid, 'WIN')
    } else if (everyoneDown) {
      await resolveCMoonRaidOutcome(io, raid, 'LOSS')
    } else if (nextRoundNumber >= MAX_ROUNDS_SAFETY) {
      await resolveCMoonRaidOutcome(io, raid, 'ABANDONED')
    } else {
      raid.roundNumber = nextRoundNumber
      openRound(io, raid)
    }
  } finally {
    raid.resolving = false
  }
}

/* ── Resolution: the one place a raid touches Postgres beyond its own create/resolve rows ───── */

async function resolveCMoonRaidOutcome(io, raid, outcome) {
  raid.status = 'RESOLVED'
  raid.outcome = outcome
  raid.endedAt = Date.now()

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
  const pointsAwarded = outcome === 'WIN' ? Math.max(0, Number(raid.enemyStats.cMoonPointsReward) || 0) : 0
  // Split evenly across the party rather than crediting each participant the full amount — every
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
  const baseShare = Math.floor(pointsAwarded / (participantIds.length || 1))
  const remainder = pointsAwarded - baseShare * participantIds.length
  const pointsShareByUser = new Map(participantIds.map((userId, i) =>
    [userId, baseShare + (i < remainder ? 1 : 0)]))

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

        // Synthetic per-participant CMoonEnemyBattle row — see CMoonEnemyBattle.raidId's own
        // schema comment for why: this is what makes minPriorDefeats and the rank-scoped
        // achievement criteria count a raid win/loss with zero changes to either system.
        // pointsAwarded is 0 here too — this row's own points are logged via CMoonScoreLog below,
        // same as every other CMoonEnemyBattle-adjacent write in this file.
        await tx.cMoonEnemyBattle.create({
          data: {
            userId, enemyMemberId: raid.enemyMemberId, cMoonId: raid.cMoonId,
            status: 'RESOLVED', outcome, roundNumber: raid.roundNumber,
            playerHpRemaining: p.hpRemaining, enemyHpRemaining: raid.enemyHpRemaining,
            roundLog: [], pointsAwarded: 0, rewardsGranted: granted,
            startedAt: new Date(raid.startedAt), endedAt: new Date(raid.endedAt), raidId: raid.id,
          },
        })

        const share = pointsShareByUser.get(userId) || 0
        if (share > 0) {
          await tx.cMoonScoreLog.create({
            data: {
              cMoonId: raid.cMoonId, userId, category: 'ENEMY_RAID_WIN',
              detail: raid.id, points: share, weekStart: new Date(),
            },
          })
        }
      }

      if (outcome === 'WIN') {
        await tx.cMoon.update({ where: { id: raid.cMoonId }, data: { battleWins: { increment: 1 } } })
        // Drives checkRaidBossAvailability's raidOneTime/raidCooldownMinutes gate for the NEXT
        // encounter — never set on a LOSS/ABANDONED, since the boss wasn't actually defeated.
        await tx.cMoonEnemyMember.update({ where: { id: raid.enemyMemberId }, data: { raidDefeatedAt: new Date() } })
      } else if (outcome === 'LOSS') {
        await tx.cMoon.update({ where: { id: raid.cMoonId }, data: { battleLosses: { increment: 1 } } })
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

  broadcast(io, raid, EV('ended'))
  destroyRaid(raid.id)
}

/* ── Sweep: the join-window and round-timeout clock (see header comment) ────────────────────── */

function sweep(io) {
  const now = Date.now()
  for (const raid of Array.from(raids.values())) {
    if (raid.status === 'FORMING' && now >= raid.joinDeadlineAt) {
      startCombat(io, raid)
    } else if (raid.status === 'IN_PROGRESS' && now >= raid.roundDeadlineAt) {
      closeRound(io, raid).catch(err => console.error('[cmoonRaidSocket] sweep closeRound failed:', err))
    }
  }
}

let sweepTimer = null
export function startCMoonRaidSweep(io) {
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
    raid.participants = new Map(raid.participants.map(p => [p.userId, p]))
    raid.resolving = false
    raids.set(raidId, raid)
    for (const uid of raid.participants.keys()) raidByUser.set(uid, raidId)
  }
  return restored.size
}

/* ── Registration ─────────────────────────────────────────────────────────────────────────── */

export function registerCMoonRaid(io, socket, resolveSocketUser) {
  socket.on(EV('start'), async ({ enemyMemberId }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    try {
      const config = await getGlobalConfig()
      if (!config?.cMoonEnemyBattlesEnabled) {
        return socket.emit(EV('error'), { message: 'cMoon Enemy Battles is currently disabled' })
      }
      const enemyMember = await db.cMoonEnemyMember.findUnique({
        where: { id: enemyMemberId }, include: { faction: true },
      })
      if (!enemyMember || !enemyMember.active || !enemyMember.faction.active) {
        return socket.emit(EV('error'), { message: 'That enemy is no longer available' })
      }
      if (!enemyMember.isRaidBoss) {
        return socket.emit(EV('error'), { message: 'This enemy is not a raid boss' })
      }
      const availability = checkRaidBossAvailability(enemyMember)
      if (!availability.available) return socket.emit(EV('error'), { message: availability.message })
      const elig = await loadEligibility({ userId: me.id, enemyMember })
      if (!elig.ok) return socket.emit(EV('error'), { message: elig.message })

      const cMoon = await db.cMoon.findUnique({ where: { id: elig.user.cMoonId }, select: { id: true, name: true } })
      if (!cMoon) return socket.emit(EV('error'), { message: 'Your cMoon could not be found' })

      const initiatorMaxHp = await getPlayerCombatMaxHp(me.id, config)
      const raidId = randomUUID()
      const raid = {
        id: raidId, enemyMemberId, cMoonId: cMoon.id,
        enemyName: enemyMember.name, enemyImagePath: enemyMember.imagePath || null,
        enemySounds: resolveMemberSoundPaths(enemyMember, enemyMember.faction),
        battleMusicPath: enemyMember.faction?.battleMusicPath || null,
        enemyStats: {
          maxHp: enemyMember.maxHp,
          critChanceAgainstPercent: enemyMember.critChanceAgainstPercent,
          critChanceFromPercent: enemyMember.critChanceFromPercent,
          cMoonPointsReward: enemyMember.cMoonPointsReward,
        },
        status: 'FORMING', enemyHpRemaining: enemyMember.maxHp, roundNumber: 1,
        currentEnemyAction: null, roundDeadlineAt: null,
        joinDeadlineAt: Date.now() + JOIN_WINDOW_SECONDS * 1000,
        participants: new Map(), roundLog: [],
        startedAt: Date.now(), combatStartedAt: null, endedAt: null, outcome: null, resolving: false,
      }
      addParticipant(raid, { userId: me.id, username: me.username, isInitiator: true, maxHp: initiatorMaxHp })
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
            },
          }),
          db.cMoonEnemyRaidParticipant.create({
            data: { raidId, userId: me.id, hpRemaining: initiatorMaxHp, isInitiator: true, activeUserId: me.id },
          }),
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

      announceCMoonRaidBoss(db, {
        cMoonName: cMoon.name, enemyName: enemyMember.name,
        announcementTemplate: enemyMember.raidAnnouncementText,
      }).catch(() => {})
      notifyEligibleCMoonMembers(io, {
        cMoonId: cMoon.id, initiatorUserId: me.id, enemyMember, raidId, cMoonName: cMoon.name,
      }).catch(() => {})
    } catch (err) {
      console.error('[cmoonraid:start] failed:', err)
      socket.emit(EV('error'), { message: 'Could not start a raid right now' })
    }
  })

  socket.on(EV('join'), async ({ raidId }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This raid is no longer accepting joins' })
    if (raid.participants.has(me.id)) {
      socket.join(raidRoom(raidId))
      return socket.emit(EV('created'), publicRaidView(raid))
    }
    // Reserve a slot SYNCHRONOUSLY, before any await, so a second concurrent join for the last
    // open slot sees this one already counted rather than both passing the size check and both
    // proceeding (which could over-fill the party past MAX_PARTY_SIZE and double-fire
    // startCombat). Everything from here to this call runs in one uninterrupted tick. Rolled
    // back in the catch block below if anything after this fails.
    if (raid.participants.size >= MAX_PARTY_SIZE) return socket.emit(EV('error'), { message: 'This raid is full' })
    // Placeholder maxHp here — this reservation must stay fully synchronous (see the comment
    // above), so the real value (which needs a DB lookup) is filled in below once the
    // post-reservation checks pass, same as `username` already is.
    addParticipant(raid, { userId: me.id, username: me.username, isInitiator: false, maxHp: PLAYER_MAX_HP })
    try {
      const enemyMember = await db.cMoonEnemyMember.findUnique({
        where: { id: raid.enemyMemberId }, include: { faction: true },
      })
      if (!enemyMember || !enemyMember.active || !enemyMember.faction.active) {
        throw { userMessage: 'That enemy is no longer available' }
      }
      const elig = await loadEligibility({ userId: me.id, enemyMember, reservedForRaidId: raidId })
      if (!elig.ok) throw { userMessage: elig.message }
      if (elig.user.cMoonId !== raid.cMoonId) throw { userMessage: 'This raid is for a different cMoon' }

      const joinerMaxHp = await getPlayerCombatMaxHp(me.id)
      await db.cMoonEnemyRaidParticipant.create({
        data: { raidId, userId: me.id, hpRemaining: joinerMaxHp, isInitiator: false, activeUserId: me.id },
      })
      const p = raid.participants.get(me.id)
      p.username = elig.user.username
      p.maxHp = joinerMaxHp
      p.hpRemaining = joinerMaxHp
      socket.join(raidRoom(raidId))
      fireSync(raidId, raid)
      broadcast(io, raid, EV('participantJoined'))
      if (raid.participants.size >= MAX_PARTY_SIZE && raid.status === 'FORMING') startCombat(io, raid)
    } catch (err) {
      raid.participants.delete(me.id)
      raidByUser.delete(me.id)
      if (err?.userMessage) return socket.emit(EV('error'), { message: err.userMessage })
      if (err?.code === 'P2002') return socket.emit(EV('error'), { message: 'You are already in a raid' })
      console.error('[cmoonraid:join] failed:', err)
      socket.emit(EV('error'), { message: 'Could not join this raid' })
    }
  })

  socket.on(EV('leave'), async ({ raidId }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING' || !raid.participants.has(me.id)) return
    raid.participants.delete(me.id)
    raidByUser.delete(me.id)
    socket.leave(raidRoom(raidId))
    await db.cMoonEnemyRaidParticipant.updateMany({ where: { raidId, userId: me.id }, data: { activeUserId: null } }).catch(() => {})
    if (!raid.participants.size) { destroyRaid(raidId); return }
    fireSync(raidId, raid)
    broadcast(io, raid, EV('participantLeft'))
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
      },
    })
    if (!row) return socket.emit(EV('error'), { message: 'Raid not found' })
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
      })),
    })
  })

  socket.on(EV('action'), async ({ raidId, action, roundNumber }) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    if (!isValidBattleAction(action)) return socket.emit(EV('error'), { message: 'Invalid action' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'IN_PROGRESS') return socket.emit(EV('error'), { message: 'This raid is not in combat' })
    if (Number(roundNumber) !== raid.roundNumber) return socket.emit(EV('error'), { message: 'Stale round — reload this raid' })
    const p = raid.participants.get(me.id)
    if (!p) return socket.emit(EV('error'), { message: 'You are not in this raid' })
    if (p.knockedOutAt) return socket.emit(EV('error'), { message: 'You have been knocked out of this raid' })
    if (p.pendingAction) return // already locked in this round — a duplicate click is a no-op, not an error
    p.pendingAction = action
    fireSync(raid.id, raid)
    broadcast(io, raid, EV('participantActed'), { actedUserId: me.id })
    if (allActed(raid)) await closeRound(io, raid)
  })
}
