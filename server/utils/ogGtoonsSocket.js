// server/utils/ogGtoonsSocket.js
//
// Real-time runtime for original gToons (2002): random matchmaking queue, direct challenges,
// and the live 7-round (+ sudden death) match itself. Registered per-connection from
// socket-server.js exactly like registerEdRps/registerPokemonBattle:
//
//   import { registerOgGtoons } from './utils/ogGtoonsSocket.js'
//   ...
//   io.on('connection', socket => {
//     ...
//     registerOgGtoons(io, socket, resolveSocketUser)
//   })
//
// ── Security ────────────────────────────────────────────────────────────────────────────────
// Every handler resolves the acting user via `resolveSocketUser(socket)` (the same helper
// socket-server.js's own Clash handlers use) — never a client-supplied userId/side/opponent id.
// A committed-but-unrevealed card is NEVER sent to the opponent before both sides have
// committed for the round: which card each side will reveal is entirely server-determined by
// deck order (see below), so the client never even chooses a card, only whether to swap or
// commit. Swap/queue/challenge actions validate purely against server-held state (the match,
// queue entry, or challenge record) — a client never gets to assert its own stake, deck, or
// opponent. Deck ownership + isOgGtoon + exactly-12-unique-positions is re-verified against the
// database at match start, not trusted from the deck's last save. A user already in an active
// match cannot join the queue or accept/send a challenge. Effect resolution is wrapped in
// try/catch per round so one malformed admin-authored gtoonEffect cannot crash the shared
// socket process out from under every other game on it.
//
// ── Performance ─────────────────────────────────────────────────────────────────────────────
// player{1,2}DeckSnapshot is built ONCE at match start (one DB read) and embeds every field a
// round needs — including `characters`, for Slam gToon condition matching — so round resolution
// never touches Postgres. roundLog accumulates in memory (and is mirrored to Redis for restart
// survival) and OgGtoonMatch is written to Postgres exactly once, at match completion.
//
// ── Process locality ────────────────────────────────────────────────────────────────────────
// Like duelRuntime.js, match/queue/challenge state here is in-memory and single-process by
// design (see server/utils/redisState.js for the crash-survival story via ogGtoonsRedisState.js).
// Emits therefore use `io.local` — a plain io.to() would round-trip every payload through the
// Redis adapter for nothing, since nothing here is sharded across processes.

import { randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { deriveGoalColor, canSwap, applySwap, SWAP_COST } from './ogGtoonEngine.js'
import { publicMatchView, revealNextCards, checkMatchEnd, buildRoundLog } from './ogGtoonMatchCore.js'
import { loadVerifiedDeckSnapshot } from './ogGtoonDeck.js'
import { isPracticing, registerPvpProbe } from './ogGtoonPresence.js'
import * as ogRedis from './ogGtoonsRedisState.js'
import { getOgGtoonsConfig } from './ogGtoonsConfig.js'

const RECONNECT_GRACE_MS = 20_000
const MATCH_MAX_AGE_MS = 30 * 60 * 1000
const QUEUE_STALE_MS = 5 * 60 * 1000
const CHALLENGE_STALE_MS = 5 * 60 * 1000
const POINTS_METHOD = 'Game - gToons'

const EV = (name) => `oggtoons:${name}`
const userRoom = (userId) => `oggtoons:user:${userId}`

/* ── In-memory state (single-process — see header) ──────────────────────────────────────── */
const queue = []                 // [{ userId, username, deckId, socketId, stake, joinedAt }]
const queueByUser = new Map()    // userId -> queue entry
const challenges = new Map()     // challengeId -> { id, fromUserId, fromUsername, toUserId, toUsername, deckId, stake, createdAt }
const challengesByUser = new Map() // userId -> Set(challengeId) (both sent and received, for cleanup)
const matches = new Map()        // matchId -> match
const matchByUser = new Map()    // userId -> matchId

/* ── Helpers ──────────────────────────────────────────────────────────────────────────────── */

function fireSync(matchId, match) {
  ogRedis.setOgGtoonMatch(matchId, match).catch(e =>
    console.error('[ogGtoonsRedisState] setOgGtoonMatch:', e))
}
function fireDelete(matchId) {
  ogRedis.delOgGtoonMatch(matchId).catch(e =>
    console.error('[ogGtoonsRedisState] delOgGtoonMatch:', e))
}

function emitToPlayers(io, match, event, buildPayload) {
  for (const [i, uid] of match.players.entries()) {
    const payload = buildPayload ? buildPayload(uid, i) : publicMatchView(match, uid)
    for (const sid of match.sockets[i]) io.local.to(sid).emit(event, payload)
  }
}

function destroyMatch(matchId) {
  const match = matches.get(matchId)
  if (!match) return
  for (const t of Object.values(match.graceTimers)) if (t) clearTimeout(t)
  for (const uid of match.players) if (matchByUser.get(uid) === matchId) matchByUser.delete(uid)
  matches.delete(matchId)
  fireDelete(matchId)
}

/* ── Starting a match ────────────────────────────────────────────────────────────────────── */

async function startMatch(io, a, b, { isChallenge }) {
  // a, b: { userId, username, deckId, socket, stake }
  // Checked here, not just at queueJoin/challengeSend, because "Live Matches" (gameEnabled) is
  // independent of "Matchmaking" (matchmakingEnabled) — an admin can close live play while still
  // letting a queue/challenge exist, and this is the one choke point both flows share.
  const { gameEnabled } = await getOgGtoonsConfig()
  if (!gameEnabled) {
    for (const p of [a, b]) {
      p.socket.emit(EV('error'), { code: 'gameDisabled', message: 'gToons matches are currently unavailable.' })
    }
    return null
  }

  const [deckA, deckB] = await Promise.all([
    loadVerifiedDeckSnapshot(a.userId, a.deckId),
    loadVerifiedDeckSnapshot(b.userId, b.deckId)
  ])
  if (!deckA || !deckB) {
    const bad = !deckA ? a : b
    for (const p of [a, b]) {
      p.socket.emit(EV('error'), {
        code: 'badDeck',
        message: p === bad ? 'Your deck is no longer valid (cards sold/traded away?). Fix it and try again.'
          : "Your opponent's deck is no longer valid — try again."
      })
    }
    return null
  }

  const stake = Math.max(0, Math.min(Math.floor(a.stake || 0), Math.floor(b.stake || 0)))

  const matchId = randomUUID()
  const match = {
    id: matchId,
    players: [a.userId, b.userId],
    usernames: [a.username, b.username],
    sockets: [new Set([a.socket.id]), new Set([b.socket.id])],
    deckOrder: [deckA, deckB],
    remainingIdx: [[0,1,2,3,4,5,6,7,8,9,10,11], [0,1,2,3,4,5,6,7,8,9,10,11]],
    goalColor: [deriveGoalColor(deckA), deriveGoalColor(deckB)],
    swapUsed: [false, false],
    ready: [false, false],
    revealed: [[], []], // roundLog itself is built once, at match completion — see buildRoundLog
    stake: [stake, stake],
    currentRound: 1,
    isChallenge: !!isChallenge,
    ending: false,
    graceTimers: {},
    startedAt: Date.now(),
    lastActivity: Date.now()
  }

  // Debit stakes now (match really starts here) — mirrors Clash's startPvpMatch exactly:
  // verify balances and debit both inside one transaction, refusing to start if either is short.
  if (stake > 0) {
    try {
      await db.$transaction(async tx => {
        await tx.userPoints.upsert({ where: { userId: a.userId }, create: { userId: a.userId, points: 0 }, update: {} })
        await tx.userPoints.upsert({ where: { userId: b.userId }, create: { userId: b.userId, points: 0 }, update: {} })
        const pa = await tx.userPoints.findUnique({ where: { userId: a.userId } })
        const pb = await tx.userPoints.findUnique({ where: { userId: b.userId } })
        if ((pa?.points ?? 0) < stake || (pb?.points ?? 0) < stake) {
          throw new Error('INSUFFICIENT_STAKE_BALANCE')
        }
        const aAfter = await tx.userPoints.update({ where: { userId: a.userId }, data: { points: { decrement: stake } } })
        await tx.pointsLog.create({ data: { userId: a.userId, points: stake, total: aAfter.points, method: POINTS_METHOD, direction: 'decrease' } })
        const bAfter = await tx.userPoints.update({ where: { userId: b.userId }, data: { points: { decrement: stake } } })
        await tx.pointsLog.create({ data: { userId: b.userId, points: stake, total: bAfter.points, method: POINTS_METHOD, direction: 'decrease' } })
      })
    } catch (err) {
      if (String(err?.message) === 'INSUFFICIENT_STAKE_BALANCE') {
        for (const p of [a, b]) {
          p.socket.emit(EV('error'), { code: 'insufficientStake', message: 'One or both players lack enough points to stake.' })
        }
        return null
      }
      console.error('[ogGtoons] stake debit failed:', err)
      for (const p of [a, b]) p.socket.emit(EV('error'), { code: 'startFailed', message: 'Could not start the match.' })
      return null
    }
  }

  matches.set(matchId, match)
  matchByUser.set(a.userId, matchId)
  matchByUser.set(b.userId, matchId)
  fireSync(matchId, match)

  a.socket.join(matchId)
  b.socket.join(matchId)
  a.socket.data.ogGtoonsMatchId = matchId
  b.socket.data.ogGtoonsMatchId = matchId

  emitToPlayers(io, match, EV('matchStart'))
  return match
}

/* ── Round resolution ─────────────────────────────────────────────────────────────────────
 *
 * Effects are NOT applied per round anymore. Each round only reveals the two cards' BASE
 * values/color/type/group for the live board animation — matching the original 2002 game's UX
 * (cards flip and briefly show base values, then a single "Scoring..." step computes the real
 * totals). The one full-board effects pass happens in `runFinalBoardResolution` below, exactly
 * once, when the match is actually over (round 7 with no tie, or a sudden-death round that
 * breaks it). See server/utils/ogGtoonEffects.js's module header for the resolution order.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

async function resolveRound(io, match) {
  if (match.ending) return
  if (!match.ready[0] || !match.ready[1]) return

  const { entry1, entry2 } = revealNextCards(match)
  match.lastActivity = Date.now()

  emitToPlayers(io, match, EV('reveal'), (uid, i) => ({
    ...publicMatchView(match, uid),
    reveal: {
      round: match.currentRound,
      you: i === 0 ? entry1 : entry2,
      opponent: i === 0 ? entry2 : entry1
    }
  }))

  const end = checkMatchEnd(match)
  if (end) {
    await endMatch(io, match, {
      outcome: end.outcome,
      winnerUserId: end.winnerIdx === null ? null : match.players[end.winnerIdx],
      player1Score: end.player1Score,
      player2Score: end.player2Score,
      endReason: 'natural',
      effectsResolved: end.effectsResolved
    })
    return
  }

  match.currentRound += 1
  fireSync(match.id, match)
}

/* ── Ending a match + settling stakes ────────────────────────────────────────────────────── */

async function persistAndSettle(match, { outcome, winnerUserId, player1Score, player2Score, endReason, whoLeftUserId, effectsResolved }) {
  const [p1, p2] = match.players
  const s1 = match.stake[0] || 0
  const s2 = match.stake[1] || 0
  const pot = s1 + s2

  await db.$transaction(async tx => {
    await tx.ogGtoonMatch.create({
      data: {
        id: match.id,
        player1UserId: p1,
        player2UserId: p2,
        player1Points: s1,
        player2Points: s2,
        player1DeckSnapshot: match.deckOrder[0],
        player2DeckSnapshot: match.deckOrder[1],
        player1GoalColor: match.goalColor[0],
        player2GoalColor: match.goalColor[1],
        player1SwapUsed: match.swapUsed[0],
        player2SwapUsed: match.swapUsed[1],
        player1Score: player1Score ?? 0,
        player2Score: player2Score ?? 0,
        roundLog: buildRoundLog(match, effectsResolved),
        isChallenge: match.isChallenge,
        winnerUserId: winnerUserId || null,
        outcome,
        startedAt: new Date(match.startedAt),
        endedAt: new Date(),
        whoLeftUserId: whoLeftUserId || null
      }
    })

    if (pot <= 0) return
    if (outcome === 'TIE') {
      if (s1 > 0) {
        const a = await tx.userPoints.upsert({ where: { userId: p1 }, create: { userId: p1, points: s1 }, update: { points: { increment: s1 } } })
        await tx.pointsLog.create({ data: { userId: p1, points: s1, total: a.points, method: POINTS_METHOD, direction: 'increase' } })
      }
      if (s2 > 0) {
        const b = await tx.userPoints.upsert({ where: { userId: p2 }, create: { userId: p2, points: s2 }, update: { points: { increment: s2 } } })
        await tx.pointsLog.create({ data: { userId: p2, points: s2, total: b.points, method: POINTS_METHOD, direction: 'increase' } })
      }
    } else if (winnerUserId && pot > 0) {
      const w = await tx.userPoints.upsert({ where: { userId: winnerUserId }, create: { userId: winnerUserId, points: pot }, update: { points: { increment: pot } } })
      await tx.pointsLog.create({ data: { userId: winnerUserId, points: pot, total: w.points, method: POINTS_METHOD, direction: 'increase' } })
    }
  })
}

async function endMatch(io, match, params) {
  if (match.ending) return
  match.ending = true
  try {
    await persistAndSettle(match, params)
  } catch (err) {
    console.error(`[ogGtoons] failed to persist match ${match.id}:`, err)
  }

  emitToPlayers(io, match, EV('matchEnd'), (uid, i) => ({
    ...publicMatchView(match, uid),
    over: true,
    outcome: params.outcome,
    won: params.winnerUserId === uid,
    endReason: params.endReason,
    player1Score: params.player1Score,
    player2Score: params.player2Score,
    effectsResolved: params.effectsResolved || []
  }))

  destroyMatch(match.id)
}

/* ── Leaving / disconnect ────────────────────────────────────────────────────────────────── */

function handleLeave(io, { matchId, userId, socketId, immediate }) {
  const match = matches.get(matchId)
  if (!match || match.ending) return
  const idx = match.players.indexOf(userId)
  if (idx === -1) return

  if (socketId) match.sockets[idx].delete(socketId)
  if (!immediate && match.sockets[idx].size > 0) return

  const forfeit = () => {
    if (match.ending) return
    const oppIdx = idx === 0 ? 1 : 0
    endMatch(io, match, {
      outcome: idx === 0 ? 'PLAYER2' : 'PLAYER1',
      winnerUserId: match.players[oppIdx],
      player1Score: 0,
      player2Score: 0,
      endReason: 'forfeit',
      whoLeftUserId: userId
    }).catch(err => console.error('[ogGtoons] forfeit failed:', err))
  }

  if (immediate) { forfeit(); return }

  if (match.graceTimers[idx]) clearTimeout(match.graceTimers[idx])
  match.graceTimers[idx] = setTimeout(() => {
    if (match.sockets[idx].size === 0) forfeit()
  }, RECONNECT_GRACE_MS)

  const oppIdx = idx === 0 ? 1 : 0
  for (const sid of match.sockets[oppIdx]) {
    io.local.to(sid).emit(EV('opponentDropped'), { graceMs: RECONNECT_GRACE_MS })
  }
}

/* ── Queue pairing ───────────────────────────────────────────────────────────────────────── */

function removeFromQueue(userId) {
  const idx = queue.findIndex(e => e.userId === userId)
  if (idx !== -1) queue.splice(idx, 1)
  queueByUser.delete(userId)
}

async function tryPairQueue(io) {
  if (queue.length < 2) return
  const a = queue[0]
  const b = queue[1]
  removeFromQueue(a.userId)
  removeFromQueue(b.userId)
  const match = await startMatch(io, a, b, { isChallenge: false })
  if (!match) {
    // Either deck went stale or a stake mismatch happened between join and pairing — nothing
    // was debited, so just drop both back into "not queued" and let them re-join.
    return
  }
}

/* ── Challenge helpers ───────────────────────────────────────────────────────────────────── */

function trackChallenge(userId, challengeId) {
  if (!challengesByUser.has(userId)) challengesByUser.set(userId, new Set())
  challengesByUser.get(userId).add(challengeId)
}
function untrackChallenge(challenge) {
  challenges.delete(challenge.id)
  challengesByUser.get(challenge.fromUserId)?.delete(challenge.id)
  challengesByUser.get(challenge.toUserId)?.delete(challenge.id)
}

/* ── Sweep ───────────────────────────────────────────────────────────────────────────────── */

function sweep(io) {
  const now = Date.now()
  for (let i = queue.length - 1; i >= 0; i--) {
    if (now - queue[i].joinedAt > QUEUE_STALE_MS) removeFromQueue(queue[i].userId)
  }
  for (const c of challenges.values()) {
    if (now - c.createdAt > CHALLENGE_STALE_MS) untrackChallenge(c)
  }
  for (const [matchId, match] of matches.entries()) {
    if (match.ending) continue
    if (now - match.startedAt < MATCH_MAX_AGE_MS) continue
    endMatch(io, match, { outcome: 'TIE', winnerUserId: null, player1Score: 0, player2Score: 0, endReason: 'sweep' })
      .catch(err => console.error('[ogGtoons] sweep end failed:', err))
  }
}

let sweepTimer = null
export function startOgGtoonsSweep(io) {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep(io) } catch (err) { console.error('[ogGtoons] sweep failed:', err) }
  }, 60_000)
  sweepTimer.unref?.()
}

/**
 * Restores in-memory match state from Redis on boot (crash/restart survival — mirrors the
 * pattern in server/utils/redisState.js). Live matches are restored so players can reconnect
 * into them; the queue and challenges are intentionally NOT restored (they are short-lived and
 * a stale queue/challenge entry surviving a restart is far more confusing than losing it).
 */
export async function restoreOgGtoonsMatches() {
  const restored = await ogRedis.scanOgGtoonMatches()
  for (const [matchId, match] of restored.entries()) {
    match.sockets = [new Set(), new Set()]
    match.graceTimers = {}
    match.ending = false
    matches.set(matchId, match)
    matchByUser.set(match.players[0], matchId)
    matchByUser.set(match.players[1], matchId)
  }
  return restored.size
}

/* ── Registration ────────────────────────────────────────────────────────────────────────── */

export function registerOgGtoons(io, socket, resolveSocketUser) {
  const auth = async (errorEvent = EV('error')) => {
    const user = await resolveSocketUser(socket)
    if (!user) {
      socket.emit(errorEvent, { code: 'unauth', message: 'Please sign in again to keep playing.' })
      return null
    }
    socket.join(userRoom(user.id))
    reattach(user.id)
    return user
  }

  function reattach(userId) {
    const matchId = matchByUser.get(userId)
    if (!matchId) return
    const match = matches.get(matchId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(userId)
    if (idx === -1) return
    if (match.sockets[idx].has(socket.id)) return
    match.sockets[idx].add(socket.id)
    socket.join(matchId)
    socket.data.ogGtoonsMatchId = matchId
    if (match.graceTimers[idx]) { clearTimeout(match.graceTimers[idx]); match.graceTimers[idx] = null }
    socket.emit(EV('matchStart'), publicMatchView(match, userId))
    const oppIdx = idx === 0 ? 1 : 0
    for (const sid of match.sockets[oppIdx]) io.local.to(sid).emit(EV('opponentReturned'))
  }

  socket.on(EV('subscribe'), async () => {
    const user = await auth()
    if (!user) return
    const incoming = [...challenges.values()].filter(c => c.toUserId === user.id)
      .map(c => ({ id: c.id, fromUsername: c.fromUsername, stake: c.stake, createdAt: c.createdAt }))
    const sent = [...challenges.values()].filter(c => c.fromUserId === user.id)
      .map(c => ({ id: c.id, toUsername: c.toUsername, stake: c.stake, createdAt: c.createdAt }))
    socket.emit(EV('lobbyState'), {
      inQueue: queueByUser.has(user.id),
      inMatch: matchByUser.has(user.id),
      incomingChallenges: incoming,
      sentChallenges: sent
    })
  })

  socket.on(EV('queueJoin'), async ({ deckId, stake } = {}) => {
    const user = await auth()
    if (!user) return
    const { matchmakingEnabled } = await getOgGtoonsConfig()
    if (!matchmakingEnabled) {
      return socket.emit(EV('error'), { code: 'matchmakingDisabled', message: 'gToons matchmaking is currently unavailable.' })
    }
    if (matchByUser.has(user.id) || isPracticing(user.id)) {
      return socket.emit(EV('error'), { code: 'inMatch', message: 'You are already in a match.' })
    }
    if (queueByUser.has(user.id)) {
      return socket.emit(EV('error'), { code: 'inQueue', message: 'You are already in the queue.' })
    }
    const stakeAmt = Math.max(0, Math.floor(Number(stake) || 0))
    if (stakeAmt > 0) {
      const pts = await db.userPoints.findUnique({ where: { userId: user.id } })
      if ((pts?.points ?? 0) < stakeAmt) {
        return socket.emit(EV('error'), { code: 'insufficientStake', message: 'You do not have enough points for that stake.' })
      }
    }
    const deck = await loadVerifiedDeckSnapshot(user.id, deckId)
    if (!deck) {
      return socket.emit(EV('error'), { code: 'badDeck', message: 'That deck is not a valid 12-card gToons deck.' })
    }
    const entry = { userId: user.id, username: user.username, deckId, socket, stake: stakeAmt, joinedAt: Date.now() }
    queue.push(entry)
    queueByUser.set(user.id, entry)
    socket.emit(EV('queueJoined'))
    await tryPairQueue(io)
  })

  socket.on(EV('queueLeave'), async () => {
    const user = await auth()
    if (!user) return
    removeFromQueue(user.id)
    socket.emit(EV('queueLeft'))
  })

  socket.on(EV('challengeSend'), async ({ targetUsername, deckId, stake } = {}) => {
    const user = await auth()
    if (!user) return
    const { matchmakingEnabled } = await getOgGtoonsConfig()
    if (!matchmakingEnabled) {
      return socket.emit(EV('error'), { code: 'matchmakingDisabled', message: 'gToons matchmaking is currently unavailable.' })
    }
    if (matchByUser.has(user.id) || isPracticing(user.id)) {
      return socket.emit(EV('error'), { code: 'inMatch', message: 'You are already in a match.' })
    }
    if (typeof targetUsername !== 'string' || !targetUsername.trim()) {
      return socket.emit(EV('error'), { code: 'badTarget', message: 'Enter a username to challenge.' })
    }
    const target = await db.user.findUnique({ where: { username: targetUsername.trim() }, select: { id: true, username: true, banned: true } })
    if (!target || target.banned) {
      return socket.emit(EV('error'), { code: 'badTarget', message: 'That user could not be found.' })
    }
    if (target.id === user.id) {
      return socket.emit(EV('error'), { code: 'badTarget', message: "You can't challenge yourself." })
    }
    const stakeAmt = Math.max(0, Math.floor(Number(stake) || 0))
    if (stakeAmt > 0) {
      const pts = await db.userPoints.findUnique({ where: { userId: user.id } })
      if ((pts?.points ?? 0) < stakeAmt) {
        return socket.emit(EV('error'), { code: 'insufficientStake', message: 'You do not have enough points for that stake.' })
      }
    }
    const deck = await loadVerifiedDeckSnapshot(user.id, deckId)
    if (!deck) {
      return socket.emit(EV('error'), { code: 'badDeck', message: 'That deck is not a valid 12-card gToons deck.' })
    }
    const challengeId = randomUUID()
    const challenge = {
      id: challengeId,
      fromUserId: user.id, fromUsername: user.username,
      toUserId: target.id, toUsername: target.username,
      deckId, stake: stakeAmt, createdAt: Date.now()
    }
    challenges.set(challengeId, challenge)
    trackChallenge(user.id, challengeId)
    trackChallenge(target.id, challengeId)
    socket.emit(EV('challengeSent'), { id: challengeId, toUsername: target.username, stake: stakeAmt })
    io.local.to(userRoom(target.id)).emit(EV('challengeReceived'), {
      id: challengeId, fromUsername: user.username, stake: stakeAmt, createdAt: challenge.createdAt
    })
  })

  socket.on(EV('challengeAccept'), async ({ challengeId, deckId } = {}) => {
    const user = await auth()
    if (!user) return
    const challenge = challenges.get(challengeId)
    if (!challenge || challenge.toUserId !== user.id) {
      return socket.emit(EV('error'), { code: 'badChallenge', message: 'That challenge is no longer available.' })
    }
    if (matchByUser.has(user.id) || matchByUser.has(challenge.fromUserId) || isPracticing(user.id) || isPracticing(challenge.fromUserId)) {
      untrackChallenge(challenge)
      return socket.emit(EV('error'), { code: 'inMatch', message: 'One of you is already in a match.' })
    }
    // Stake is read from the STORED challenge record, never re-asserted by the accepting client.
    const stake = challenge.stake
    // Find the challenger's live socket via their user room membership rather than trusting a
    // stored reference that may be stale after a reconnect.
    const fromSockets = await io.in(userRoom(challenge.fromUserId)).local.fetchSockets()
    const challengerSocket = fromSockets[0]
    if (!challengerSocket) {
      untrackChallenge(challenge)
      return socket.emit(EV('error'), { code: 'challengerOffline', message: 'That player is no longer online.' })
    }
    untrackChallenge(challenge)
    const match = await startMatch(
      io,
      { userId: challenge.fromUserId, username: challenge.fromUsername, deckId: challenge.deckId, socket: challengerSocket, stake },
      { userId: user.id, username: user.username, deckId, socket, stake },
      { isChallenge: true }
    )
    if (!match) return // startMatch already emitted the specific error to both sockets
  })

  socket.on(EV('challengeDecline'), async ({ challengeId } = {}) => {
    const user = await auth()
    if (!user) return
    const challenge = challenges.get(challengeId)
    if (!challenge || challenge.toUserId !== user.id) return
    untrackChallenge(challenge)
    io.local.to(userRoom(challenge.fromUserId)).emit(EV('challengeDeclined'), { id: challengeId })
  })

  socket.on(EV('challengeCancel'), async ({ challengeId } = {}) => {
    const user = await auth()
    if (!user) return
    const challenge = challenges.get(challengeId)
    if (!challenge || challenge.fromUserId !== user.id) return
    untrackChallenge(challenge)
    io.local.to(userRoom(challenge.toUserId)).emit(EV('challengeCancelled'), { id: challengeId })
  })

  socket.on(EV('swap'), async ({ matchId, swapWithIndex } = {}) => {
    const user = await auth()
    if (!user) return
    const match = matches.get(matchId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(user.id)
    if (idx === -1) return
    // "Before revealing a round" — reject once this round's reveal has already broadcast, i.e.
    // once this side has already committed (ready) for the round that is about to resolve.
    const check = canSwap({
      swapUsed: match.swapUsed[idx],
      pointBalance: Infinity, // balance is checked against the live UserPoints row below
      roundRevealed: match.ready[idx]
    })
    if (!check.ok) {
      return socket.emit(EV('error'), { code: check.reason, message: 'You cannot swap right now.' })
    }
    if (!Number.isInteger(swapWithIndex) || swapWithIndex <= 0 || swapWithIndex >= match.remainingIdx[idx].length) {
      return socket.emit(EV('error'), { code: 'badSwapTarget', message: 'Invalid swap target.' })
    }
    try {
      await db.$transaction(async tx => {
        const pts = await tx.userPoints.findUnique({ where: { userId: user.id } })
        if ((pts?.points ?? 0) < SWAP_COST) throw new Error('INSUFFICIENT_SWAP_BALANCE')
        const after = await tx.userPoints.update({ where: { userId: user.id }, data: { points: { decrement: SWAP_COST } } })
        await tx.pointsLog.create({ data: { userId: user.id, points: SWAP_COST, total: after.points, method: POINTS_METHOD, direction: 'decrease' } })
      })
    } catch (err) {
      if (String(err?.message) === 'INSUFFICIENT_SWAP_BALANCE') {
        return socket.emit(EV('error'), { code: 'insufficient_points', message: `You need ${SWAP_COST} points to swap.` })
      }
      console.error('[ogGtoons] swap debit failed:', err)
      return socket.emit(EV('error'), { code: 'swapFailed', message: 'Could not process the swap.' })
    }
    match.remainingIdx[idx] = applySwap(match.remainingIdx[idx], swapWithIndex)
    match.swapUsed[idx] = true
    match.lastActivity = Date.now()
    fireSync(match.id, match)
    socket.emit(EV('swapApplied'), { matchId: match.id })
  })

  socket.on(EV('commit'), async ({ matchId, round } = {}) => {
    const user = await auth()
    if (!user) return
    const match = matches.get(matchId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(user.id)
    if (idx === -1) return
    if (Number(round) !== match.currentRound) return
    if (match.ready[idx]) return
    if (match.remainingIdx[idx].length === 0) return

    match.ready[idx] = true
    match.sockets[idx].add(socket.id)
    match.lastActivity = Date.now()
    socket.emit(EV('committed'), { round: match.currentRound })
    const oppIdx = idx === 0 ? 1 : 0
    for (const sid of match.sockets[oppIdx]) io.local.to(sid).emit(EV('opponentCommitted'), { round: match.currentRound })

    await resolveRound(io, match)
  })

  socket.on(EV('leave'), async () => {
    const user = await auth()
    if (!user) return
    const matchId = socket.data.ogGtoonsMatchId || matchByUser.get(user.id)
    if (matchId) {
      socket.leave(matchId)
      socket.data.ogGtoonsMatchId = null
      handleLeave(io, { matchId, userId: user.id, socketId: socket.id, immediate: true })
    }
    removeFromQueue(user.id)
  })

  socket.on('disconnecting', () => {
    const userId = socket.data?.authUser?.id
    const matchId = socket.data?.ogGtoonsMatchId
    if (userId) removeFromQueue(userId)
    if (userId && matchId) handleLeave(io, { matchId, userId, socketId: socket.id, immediate: false })
  })
}

// Lets practice mode refuse to start while the user is in a live PvP match or the queue.
registerPvpProbe((userId) => matchByUser.has(userId) || queueByUser.has(userId))
