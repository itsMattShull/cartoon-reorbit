// server/utils/cmoonRaidPreviewSocket.js
//
// Admin-only "raid boss preview": lets an admin actually live-test the real co-op raid experience
// (server/utils/cmoonRaidSocket.js) — join window, live HP bars, one-shared-boss-move-per-round
// combat, a shared result screen — with other admins able to join in exactly like a real party,
// but with ZERO consequences: no CMoonEnemyRaid/CMoonEnemyRaidParticipant/CMoonEnemyBattle rows,
// no rewards actually granted, no cMoon points, no Discord announcement, and — critically — no
// write to the boss's own raidDefeatedAt, so previewing a one-time or on-cooldown raid boss can
// never burn its real one-time-use or cooldown against production. This mirrors the exact same
// "stateless, consequence-free" stance server/api/admin/cmoon-enemy-members/[id]/preview.post.js
// already takes for the solo 1v1 preview, just extended to a live multiplayer fight.
//
// Deliberately its OWN module rather than an `isPreview` flag threaded through cmoonRaidSocket.js:
// that file's resolution transaction is the most fragile, most-audited part of the whole raid
// feature (see its own header comment and this session's own bug history), and conditionalizing
// every one of its DB writes on a flag would risk a preview accidentally taking a real side effect
// — or a real raid accidentally skipping one — far more than duplicating the small, low-risk
// state-machine shell here does. The one thing that MUST stay identical between the two — the
// actual combat math — is not duplicated: both import resolveRaidRound/rollEnemyAction/
// rollEnemyRewards from cmoonEnemyRaid.js, so a preview always plays out exactly like the real
// fight it's standing in for.
//
// Simplifications a real raid can't afford but a preview can:
//   - No Redis mirror / restart survival (cmoonRaidRedisState.js). A preview losing its state to a
//     socket-server restart just means an admin starts a new one; there is no player-facing
//     consequence worth the extra module and migration surface.
//   - No cMoon/minPriorDefeats/active-battle eligibility checks — any active admin can join.
//   - No CMoonEnemyRaid row at all, so raid.cMoonId doesn't need to exist — previews aren't scoped
//     to any particular cMoon.
//
// Events are namespaced `cmoonraidpreview:*`, entirely distinct from the real `cmoonraid:*`
// events, so the two can never be confused client- or server-side.

import { randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { notifyCMoonRaidPreviewStarted } from './notifications.js'
import {
  resolveRaidRound, rollEnemyAction, rollEnemyRewards, isValidBattleAction, PLAYER_MAX_HP,
  JOIN_WINDOW_SECONDS, ROUND_TIMEOUT_SECONDS, MAX_PARTY_SIZE, MAX_ROUNDS_SAFETY,
} from './cmoonEnemyRaid.js'

const SWEEP_INTERVAL_MS = 2000
const EV = (name) => `cmoonraidpreview:${name}`
const raidRoom = (raidId) => `cmoonraidpreview:room:${raidId}`

/* ── In-memory state only (see header — no Redis mirror) ─────────────────────────────────────
 * raid: {
 *   id, enemyMemberId, status: 'FORMING'|'IN_PROGRESS'|'RESOLVED',
 *   enemyName, enemyImagePath,
 *   enemyStats: { maxHp, critChanceAgainstPercent, critChanceFromPercent, cMoonPointsReward },
 *   enemyHpRemaining, roundNumber, currentEnemyAction, roundDeadlineAt, joinDeadlineAt,
 *   participants: Map<userId, { userId, username, hpRemaining, knockedOutAt, isInitiator,
 *                                pendingAction, joinedAt }>,
 *   roundLog: [], startedAt, combatStartedAt, endedAt, outcome, resolving, wouldGrant,
 * }
 */
const raids = new Map()
const raidByUser = new Map()

function destroyRaid(raidId) {
  const raid = raids.get(raidId)
  if (!raid) return
  for (const uid of raid.participants.keys()) {
    if (raidByUser.get(uid) === raidId) raidByUser.delete(uid)
  }
  raids.delete(raidId)
}

/* ── Serialization (mirrors cmoonRaidSocket.js's publicRaidView, plus wouldGrant on the end) ── */
function publicRaidView(raid) {
  return {
    id: raid.id,
    isPreview: true,
    enemyMemberId: raid.enemyMemberId,
    status: raid.status,
    enemyName: raid.enemyName,
    enemyImagePath: raid.enemyImagePath,
    enemyMaxHp: raid.enemyStats.maxHp,
    enemyHpRemaining: raid.enemyHpRemaining,
    roundNumber: raid.roundNumber,
    joinDeadlineAt: raid.joinDeadlineAt,
    roundDeadlineAt: raid.roundDeadlineAt,
    outcome: raid.outcome || null,
    wouldGrant: raid.wouldGrant || null,
    participants: Array.from(raid.participants.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      hpRemaining: p.hpRemaining,
      knockedOut: !!p.knockedOutAt,
      isInitiator: p.isInitiator,
      hasActed: raid.status === 'IN_PROGRESS' && !p.knockedOutAt ? !!p.pendingAction : false,
    })),
  }
}

function broadcast(io, raid, event, extra) {
  io.local.to(raidRoom(raid.id)).emit(event, { ...publicRaidView(raid), ...extra })
}

// Re-checked fresh on every handler call — never trusted from resolveSocketUser's cached
// {id, username} shape, which does not carry isAdmin (see server/socket-server.js's own
// resolveSocketUser). Mirrors requireAdmin's own banned/active checks.
async function requireAdminUser(userId) {
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isAdmin: true, banned: true, active: true },
  })
  if (!me?.isAdmin || me.banned || me.active === false) return null
  return me
}

function addParticipant(raid, { userId, username, isInitiator }) {
  raid.participants.set(userId, {
    userId, username, hpRemaining: PLAYER_MAX_HP, knockedOutAt: null,
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
    for (const p of alive) if (!p.pendingAction) p.pendingAction = rollEnemyAction()

    const { enemyAction, perParticipant, enemyDamageDealt } = resolveRaidRound({
      enemyAction: raid.currentEnemyAction,
      enemyMember: raid.enemyStats,
      participants: alive.map(p => ({ userId: p.userId, action: p.pendingAction, hpRemaining: p.hpRemaining })),
    })

    for (const result of perParticipant) {
      const p = raid.participants.get(result.userId)
      p.hpRemaining = result.hpRemaining
      p.pendingAction = null
      if (result.knockedOut && !p.knockedOutAt) p.knockedOutAt = Date.now()
    }
    raid.enemyHpRemaining = Math.max(0, raid.enemyHpRemaining - enemyDamageDealt)
    raid.roundLog.push({ round: raid.roundNumber, enemyAction, enemyDamageDealt, enemyHpRemaining: raid.enemyHpRemaining })

    const everyoneDown = Array.from(raid.participants.values()).every(p => !!p.knockedOutAt)
    const nextRoundNumber = raid.roundNumber + 1

    broadcast(io, raid, EV('roundResolved'), {
      round: { roundNumber: raid.roundNumber, enemyAction, enemyDamageDealt, participants: perParticipant },
    })

    if (raid.enemyHpRemaining <= 0) {
      await resolvePreviewOutcome(io, raid, 'WIN')
    } else if (everyoneDown) {
      await resolvePreviewOutcome(io, raid, 'LOSS')
    } else if (nextRoundNumber >= MAX_ROUNDS_SAFETY) {
      await resolvePreviewOutcome(io, raid, 'ABANDONED')
    } else {
      raid.roundNumber = nextRoundNumber
      openRound(io, raid)
    }
  } finally {
    raid.resolving = false
  }
}

// The ONLY place this file touches Postgres beyond read-only lookups (enemy member config,
// rewards table for the wouldGrant preview) — and even here, never a write. See header comment
// for the full list of real-raid side effects deliberately never reproduced here.
async function resolvePreviewOutcome(io, raid, outcome) {
  raid.status = 'RESOLVED'
  raid.outcome = outcome
  raid.endedAt = Date.now()

  if (outcome === 'WIN') {
    try {
      const rewardRows = await db.cMoonEnemyReward.findMany({
        where: { enemyMemberId: raid.enemyMemberId },
        include: {
          ctoon: { select: { name: true } },
          avatar: { select: { label: true } },
          background: { select: { label: true } },
        },
      })
      const hitRewards = rollEnemyRewards(rewardRows)
      const participantCount = raid.participants.size || 1
      const pointsAwarded = Math.max(0, Number(raid.enemyStats.cMoonPointsReward) || 0)
      raid.wouldGrant = {
        cMoonPointsTotal: pointsAwarded,
        cMoonPointsPerParticipant: Math.floor(pointsAwarded / participantCount),
        items: hitRewards.map(r => {
          if (r.rewardType === 'CTOON') return { type: 'CTOON', label: r.ctoon?.name || 'cToon', quantity: r.quantity }
          if (r.rewardType === 'AVATAR') return { type: 'AVATAR', label: r.avatar?.label || 'Avatar' }
          if (r.rewardType === 'BACKGROUND') return { type: 'BACKGROUND', label: r.background?.label || 'Background' }
          if (r.rewardType === 'POINTS') return { type: 'POINTS', quantity: r.quantity }
          return null
        }).filter(Boolean),
      }
    } catch (err) {
      console.error('[cmoonRaidPreviewSocket] wouldGrant lookup failed:', err?.message || err)
    }
  }

  broadcast(io, raid, EV('ended'))
  destroyRaid(raid.id)
}

function sweep(io) {
  const now = Date.now()
  for (const raid of Array.from(raids.values())) {
    if (raid.status === 'FORMING' && now >= raid.joinDeadlineAt) {
      startCombat(io, raid)
    } else if (raid.status === 'IN_PROGRESS' && now >= raid.roundDeadlineAt) {
      closeRound(io, raid).catch(err => console.error('[cmoonRaidPreviewSocket] sweep closeRound failed:', err))
    }
  }
}

let sweepTimer = null
export function startCMoonRaidPreviewSweep(io) {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep(io) } catch (err) { console.error('[cmoonRaidPreviewSocket] sweep failed:', err) }
  }, SWEEP_INTERVAL_MS)
  sweepTimer.unref?.()
}

export function registerCMoonRaidPreview(io, socket, resolveSocketUser) {
  socket.on(EV('start'), async ({ enemyMemberId }) => {
    const authed = await resolveSocketUser(socket)
    if (!authed) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const me = await requireAdminUser(authed.id)
    if (!me) return socket.emit(EV('error'), { message: 'Admins only' })
    try {
      const enemyMember = await db.cMoonEnemyMember.findUnique({ where: { id: enemyMemberId } })
      if (!enemyMember) return socket.emit(EV('error'), { message: 'Enemy member not found' })
      if (!enemyMember.isRaidBoss) return socket.emit(EV('error'), { message: 'This enemy is not a raid boss' })
      if (raidByUser.has(me.id)) return socket.emit(EV('error'), { message: 'You are already in a raid preview' })

      const raidId = randomUUID()
      const raid = {
        id: raidId, enemyMemberId,
        enemyName: enemyMember.name, enemyImagePath: enemyMember.imagePath || null,
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
        startedAt: Date.now(), combatStartedAt: null, endedAt: null, outcome: null,
        resolving: false, wouldGrant: null,
      }
      addParticipant(raid, { userId: me.id, username: me.username, isInitiator: true })
      raids.set(raidId, raid)

      socket.join(raidRoom(raidId))
      socket.emit(EV('created'), publicRaidView(raid))

      notifyOtherAdmins({ initiatorUserId: me.id, initiatorUsername: me.username, enemyMember, raidId })
        .catch(err => console.error('[cmoonRaidPreviewSocket] notifyOtherAdmins failed:', err?.message || err))
    } catch (err) {
      console.error('[cmoonraidpreview:start] failed:', err)
      socket.emit(EV('error'), { message: 'Could not start a raid preview right now' })
    }
  })

  socket.on(EV('join'), async ({ raidId }) => {
    const authed = await resolveSocketUser(socket)
    if (!authed) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const me = await requireAdminUser(authed.id)
    if (!me) return socket.emit(EV('error'), { message: 'Admins only' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING') return socket.emit(EV('error'), { message: 'This raid preview is no longer accepting joins' })
    if (raid.participants.has(me.id)) {
      socket.join(raidRoom(raidId))
      return socket.emit(EV('created'), publicRaidView(raid))
    }
    if (raidByUser.has(me.id)) return socket.emit(EV('error'), { message: 'You are already in a raid preview' })
    if (raid.participants.size >= MAX_PARTY_SIZE) return socket.emit(EV('error'), { message: 'This raid preview is full' })
    addParticipant(raid, { userId: me.id, username: me.username, isInitiator: false })
    socket.join(raidRoom(raidId))
    broadcast(io, raid, EV('participantJoined'))
    if (raid.participants.size >= MAX_PARTY_SIZE && raid.status === 'FORMING') startCombat(io, raid)
  })

  socket.on(EV('leave'), async ({ raidId }) => {
    const authed = await resolveSocketUser(socket)
    if (!authed) return
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'FORMING' || !raid.participants.has(authed.id)) return
    raid.participants.delete(authed.id)
    raidByUser.delete(authed.id)
    socket.leave(raidRoom(raidId))
    if (!raid.participants.size) { destroyRaid(raidId); return }
    broadcast(io, raid, EV('participantLeft'))
  })

  socket.on(EV('getState'), async ({ raidId }) => {
    const authed = await resolveSocketUser(socket)
    if (!authed) return socket.emit(EV('error'), { message: 'Not authenticated' })
    const me = await requireAdminUser(authed.id)
    if (!me) return socket.emit(EV('error'), { message: 'Admins only' })
    const raid = raids.get(raidId)
    if (!raid) return socket.emit(EV('error'), { message: 'Raid preview not found — it may have ended' })
    if (raid.participants.has(me.id)) socket.join(raidRoom(raidId))
    socket.emit(EV('state'), publicRaidView(raid))
  })

  socket.on(EV('action'), async ({ raidId, action, roundNumber }) => {
    const authed = await resolveSocketUser(socket)
    if (!authed) return socket.emit(EV('error'), { message: 'Not authenticated' })
    if (!isValidBattleAction(action)) return socket.emit(EV('error'), { message: 'Invalid action' })
    const raid = raids.get(raidId)
    if (!raid || raid.status !== 'IN_PROGRESS') return socket.emit(EV('error'), { message: 'This raid preview is not in combat' })
    if (Number(roundNumber) !== raid.roundNumber) return socket.emit(EV('error'), { message: 'Stale round — reload this preview' })
    const p = raid.participants.get(authed.id)
    if (!p) return socket.emit(EV('error'), { message: 'You are not in this raid preview' })
    if (p.knockedOutAt) return socket.emit(EV('error'), { message: 'You have been knocked out of this raid preview' })
    if (p.pendingAction) return
    p.pendingAction = action
    broadcast(io, raid, EV('participantActed'), { actedUserId: authed.id })
    if (allActed(raid)) await closeRound(io, raid)
  })
}

/* ── Notifying other admins at preview start ─────────────────────────────────────────────────
 * Fire-and-forget — a failed notification write must never fail the preview itself, same stance
 * cmoonRaidSocket.js's own notifyEligibleCMoonMembers takes.
 */
async function notifyOtherAdmins({ initiatorUserId, initiatorUsername, enemyMember, raidId }) {
  const admins = await db.user.findMany({
    where: { isAdmin: true, id: { not: initiatorUserId }, active: true, banned: false },
    select: { id: true },
  })
  await Promise.all(admins.map(a => notifyCMoonRaidPreviewStarted(db, {
    userId: a.id, raidId, enemyName: enemyMember.name, startedByUsername: initiatorUsername,
  })))
}
