// server/utils/ogGtoonsSocket.js
//
// Real-time runtime for original gToons (2002): random matchmaking queue, direct challenges,
// and the live 7-slot / 3-round (+ sudden death) match itself. Registered per-connection from
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
// A player's hand, undealt cards and placed-but-unrevealed cards are NEVER sent to the opponent:
// the opponent only learns WHICH slots a player has committed (rendered face down), and only once
// they commit; the card identities are revealed together, in slot order, when both have committed.
// Card choice is client-driven (place/unplace/discard/swap) but every action is validated against
// server-held state (the hand, this round's open slots, the phase) — a client can never place a
// card it does not hold, in a slot that is not open, or after committing. Swap/queue/challenge actions validate purely against server-held state (the match,
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

import { randomUUID, randomInt } from 'crypto'
import { prisma as db } from '../prisma.js'
import { assignRandomGoals } from './ogGtoonEngine.js'
import {
  publicMatchView, initHands, revealPlacedCards, advanceRound, checkMatchEnd, buildRoundLog,
  placeCard, unplaceSlot, checkCommit, checkSwap, recordSwapChoice, resolveSwapPhase, expirePhase,
  submitDiscard, resolveDiscardPhase, enterColorPhase, submitColor, resolveColorPhase, startPhaseClock, markCommitted, logAbnormalEnd, extendDeadlineForReveal
} from './ogGtoonMatchCore.js'
import { loadVerifiedDeckSnapshot } from './ogGtoonDeck.js'
import { isPracticing, registerPvpProbe, onPresenceChange } from './ogGtoonPresence.js'
import * as ogRedis from './ogGtoonsRedisState.js'
import { getOgGtoonsConfig, peekRevealTiming } from './ogGtoonsConfig.js'
import { clearLive, isPairingClosed, flagNeedsAdmin } from './ogGtoonTournamentLive.js'
import { enqueueOgTournamentJob } from './queues.js'
import { registerOgGtoonsTournament } from './ogGtoonsTournamentSocket.js'

const RECONNECT_GRACE_MS = 20_000
// A dropped connection costs a game of a best-of-3 that is played for a prize, so tournament games
// give a backgrounded phone tab much longer to come back.
const TOURNAMENT_RECONNECT_GRACE_MS = 90_000
const MATCH_MAX_AGE_MS = 30 * 60 * 1000
const QUEUE_STALE_MS = 5 * 60 * 1000
const CHALLENGE_STALE_MS = 5 * 60 * 1000
const POINTS_METHOD = 'Game - gToons'

const EV = (name) => `oggtoons:${name}`
// Shuffles/deals must not be guessable from Math.random's state.
const secureRng = () => randomInt(0, 0x100000000) / 0x100000000
const userRoom = (userId) => `oggtoons:user:${userId}`

/* ── In-memory state (single-process — see header) ──────────────────────────────────────── */
const queue = []                 // [{ userId, username, deckId, socketId, stake, joinedAt }]
const queueByUser = new Map()    // userId -> queue entry
const challenges = new Map()     // challengeId -> { id, fromUserId, fromUsername, toUserId, toUsername, deckId, stake, createdAt }
const challengesByUser = new Map() // userId -> Set(challengeId) (both sent and received, for cleanup)
const matches = new Map()        // matchId -> match
const matchByUser = new Map()    // userId -> matchId
// Players currently looking at the Matchmaking tab (they populate everyone's "Challenge a Player" dropdown).
const lobby = new Map()          // userId -> { username, sockets: Set<socketId> }

/* ── Lobby: who can be challenged ─────────────────────────────────────────────────────────── */

let lobbyIo = null
let lobbyTimer = null

/** Why this user can't be offered a challenge right now, or null when they can. */
function busyReason(userId) {
  if (matchByUser.has(userId) || isPracticing(userId)) return 'in a match'
  if (queueByUser.has(userId)) return 'searching for a match'
  if (challengesByUser.get(userId)?.size) return 'already handling a match request'
  return null
}

/** Lobby usernames a challenge could go to right now (everyone but `exceptUserId`), sorted. */
function availableLobbyUsers(exceptUserId) {
  const out = []
  for (const [uid, entry] of lobby) {
    if (uid !== exceptUserId && !busyReason(uid)) out.push(entry.username)
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** Pushes each lobby member their own dropdown list. Debounced — state changes tend to arrive in bursts. */
function scheduleLobbyBroadcast() {
  if (!lobbyIo || lobbyTimer) return
  lobbyTimer = setTimeout(() => {
    lobbyTimer = null
    for (const [uid, entry] of lobby) {
      const users = availableLobbyUsers(uid)
      for (const sid of entry.sockets) lobbyIo.local.to(sid).emit(EV('lobbyUsers'), { users })
    }
  }, 150)
  lobbyTimer.unref?.()
}

function lobbyLeaveSocket(userId, socketId) {
  const entry = lobby.get(userId)
  if (!entry) return
  entry.sockets.delete(socketId)
  if (!entry.sockets.size) lobby.delete(userId)
  scheduleLobbyBroadcast()
}

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

/** Pushes one player's own full view (hand, placements, ...) to all of their sockets. */
function emitStateTo(io, match, idx, withLog = false) {
  // Placing/unplacing is frequent and never changes the game log, so it is left out by default.
  const payload = publicMatchView(match, match.players[idx], withLog ? {} : { log: false })
  for (const sid of match.sockets[idx]) io.local.to(sid).emit(EV('state'), payload)
}

function destroyMatch(matchId) {
  const match = matches.get(matchId)
  if (!match) return
  for (const t of Object.values(match.graceTimers)) if (t) clearTimeout(t)
  if (match.phaseTimer) clearTimeout(match.phaseTimer)
  match.phaseTimer = null
  for (const uid of match.players) if (matchByUser.get(uid) === matchId) matchByUser.delete(uid)
  matches.delete(matchId)
  fireDelete(matchId)
  scheduleLobbyBroadcast()
}

/* ── Starting a match ────────────────────────────────────────────────────────────────────── */

async function startMatch(io, a, b, { isChallenge, tournament = null, matchId: forcedMatchId = null }) {
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

  // A tournament game plays each player's LOCKED deck, already verified by the caller.
  const [deckA, deckB] = tournament
    ? [a.deckSnapshot || null, b.deckSnapshot || null]
    : await Promise.all([
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

  // Tournament games never carry a stake.
  const stake = tournament ? 0 : Math.max(0, Math.min(Math.floor(a.stake || 0), Math.floor(b.stake || 0)))

  const matchId = forcedMatchId || randomUUID()
  const match = {
    id: matchId,
    players: [a.userId, b.userId],
    usernames: [a.username, b.username],
    sockets: [new Set([a.socket.id]), new Set([b.socket.id])],
    deckOrder: [deckA, deckB],
    stake: [stake, stake],
    isChallenge: !!isChallenge,
    tournament: tournament || null,
    ending: false,
    graceTimers: {},
    startedAt: Date.now(),
    lastActivity: Date.now()
  }
  // Shuffle both decks and deal the opening hands (also sets ready/revealed/swapUsed/round 1).
  initHands(match, secureRng)
  // Goal colors come from one random card out of each player's chosen deck.
  assignRandomGoals(match, secureRng)

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
  // Anything either player still had pending (other challenges they sent or were sent) is moot now.
  dropChallengesFor(io, a.userId)
  dropChallengesFor(io, b.userId)
  scheduleLobbyBroadcast()

  a.socket.join(matchId)
  b.socket.join(matchId)
  a.socket.data.ogGtoonsMatchId = matchId
  b.socket.data.ogGtoonsMatchId = matchId

  emitToPlayers(io, match, EV('matchStart'))
  armPhaseTimer(io, match)
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

  const revealedRound = match.currentRound
  const { entries, order, steps, before } = revealPlacedCards(match)
  await concludeStep(io, match, revealedRound, entries, order, { steps, before })
}

/**
 * Shared tail of every step that puts cards on the board (a placing round, or the slot-7 swap):
 * decide whether the match is over, otherwise advance into the next phase, tell both players, and
 * start the next phase's clock.
 */
async function concludeStep(io, match, revealedRound, entries, order, { steps = [], before = null } = {}) {
  match.lastActivity = Date.now()
  // Admin-tunable pace of the card-by-card reveal; sent with the payload so clients animate with the same numbers.
  const timing = peekRevealTiming()

  // Once the board is complete, players with a Silver card pick its colour before anything is scored.
  const colorPhase = enterColorPhase(match)
  const end = colorPhase ? null : checkMatchEnd(match)
  // Advance before emitting so the state each client receives already carries the NEXT round
  // and phase (round 2 opens with the discard phase) — an action sent for a stale round is dropped.
  if (!end) {
    if (!colorPhase) advanceRound(match)
    // The cards reveal one at a time on the clients; don't let that animation eat into the next phase's clock.
    extendDeadlineForReveal(match, steps, timing)
  }

  emitToPlayers(io, match, EV('reveal'), (uid, i) => ({
    ...publicMatchView(match, uid),
    reveal: {
      round: revealedRound,
      order,
      you: entries[i],
      opponent: entries[i === 0 ? 1 : 0],
      // One card at a time: player 1's slot 1, player 2's slot 1, player 1's slot 2, ... (see ogGtoonMatchCore.buildRevealSteps)
      steps,
      before,
      timing
    }
  }))

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

  fireSync(match.id, match)
  armPhaseTimer(io, match)
  // Nobody can be offered a swap (no undealt cards): settle the swap phase straight away.
  await settleSwap(io, match)
}

/** Applies the slot-7 swaps once both players have chosen, then scores the board. */
async function settleSwap(io, match) {
  if (match.ending) return
  const res = resolveSwapPhase(match, secureRng)
  if (!res) return
  await concludeStep(io, match, match.currentRound, res.entries, res.order, { steps: res.steps, before: res.before })
}

/** Applies the Silver colour picks once both players are done, then scores the board. */
async function settleColor(io, match) {
  if (match.ending) return
  if (!resolveColorPhase(match)) return
  await concludeStep(io, match, match.currentRound, [[], []], [])
}

/* ── Phase clock ─────────────────────────────────────────────────────────────────────────────
 * Every phase has a deadline (match.deadline, stamped by the match core). When it passes, the
 * server plays the default for whoever has not acted: random cards fill their empty slots, no
 * discards, no swap — then carries on exactly as if they had acted. */

function armPhaseTimer(io, match) {
  if (match.phaseTimer) clearTimeout(match.phaseTimer)
  match.phaseTimer = null
  if (match.ending || !match.deadline) return
  const delay = Math.max(0, match.deadline - Date.now())
  match.phaseTimer = setTimeout(() => {
    match.phaseTimer = null
    onPhaseExpired(io, match).catch(err => console.error('[ogGtoons] phase timeout failed:', err))
  }, delay)
  match.phaseTimer.unref?.()
}

async function onPhaseExpired(io, match) {
  if (match.ending) return
  const phase = match.phase
  const acted = expirePhase(match, secureRng)
  if (!acted.length) return
  match.lastActivity = Date.now()

  if (phase === 'play') {
    for (const idx of acted) {
      const oppIdx = idx === 0 ? 1 : 0
      for (const sid of match.sockets[idx]) io.local.to(sid).emit(EV('committed'), { round: match.currentRound })
      for (const sid of match.sockets[oppIdx]) io.local.to(sid).emit(EV('opponentCommitted'), { round: match.currentRound })
    }
    emitToPlayers(io, match, EV('state'))
    await resolveRound(io, match)
  } else if (phase === 'discard') {
    if (resolveDiscardPhase(match)) armPhaseTimer(io, match)
    fireSync(match.id, match)
    emitToPlayers(io, match, EV('state'))
  } else if (phase === 'swap') {
    await settleSwap(io, match)
  } else if (phase === 'color') {
    emitToPlayers(io, match, EV('state'))
    await settleColor(io, match)
  }
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
        whoLeftUserId: whoLeftUserId || null,
        tournamentMatchId: match.tournament?.matchId || null
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

/**
 * A tournament game that did not finish normally (stale sweep, or its pairing was decided while it
 * was running) is saved as INCOMPLETE: it never counts toward the series and is simply replayed.
 */
function tournamentEndParams(match, params) {
  if (!match.tournament) return params
  if (params.endReason === 'sweep' || params.endReason === 'closed') {
    return { ...params, outcome: 'INCOMPLETE', winnerUserId: null }
  }
  return params
}

/** Saves a finished game; tournament games retry, because losing one would lose a series game. */
async function persistFinishedGame(match, params) {
  const attempts = match.tournament ? 3 : 1
  let lastErr
  for (let i = 0; i < attempts; i += 1) {
    try {
      await persistAndSettle(match, params)
      return true
    } catch (err) {
      lastErr = err
      console.error(`[ogGtoons] failed to persist match ${match.id} (attempt ${i + 1}/${attempts}):`, err)
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)))
    }
  }
  if (match.tournament) {
    flagNeedsAdmin(match.tournament.matchId, 'A game result could not be saved — check the match and set the result').catch(() => {})
  }
  return lastErr ? false : true
}

/** After a tournament game: free the pairing and ask the worker to score it and build the next round. */
async function afterTournamentGame(match) {
  const t = match.tournament
  if (!t) return
  try {
    await clearLive(t.matchId, match.id)
    await enqueueOgTournamentJob('ogTournamentAdvance', { tournamentId: t.tournamentId, matchId: t.matchId }, { key: t.matchId })
  } catch (err) {
    // The tournament cron scores any unscored game and clears stale live markers, so this is only a delay.
    console.error('[ogGtoons] could not queue tournament advance:', err?.message || err)
  }
}

async function endMatch(io, match, params) {
  if (match.ending) return
  match.ending = true
  params = tournamentEndParams(match, params)
  if (params.endReason === 'forfeit') {
    logAbnormalEnd(match, `${match.usernames[match.players.indexOf(params.whoLeftUserId)] ?? 'A player'} left the match — their opponent wins by forfeit.`)
  } else if (params.endReason === 'sweep') {
    logAbnormalEnd(match, match.tournament ? 'The game timed out and will be replayed.' : 'The match timed out and ended in a tie.')
  } else if (params.endReason === 'closed') {
    logAbnormalEnd(match, 'This tournament match was decided, so the game was ended.')
  }
  await persistFinishedGame(match, params)

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
  afterTournamentGame(match).catch(() => {})
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
  const graceMs = match.tournament ? TOURNAMENT_RECONNECT_GRACE_MS : RECONNECT_GRACE_MS
  match.graceTimers[idx] = setTimeout(() => {
    if (match.sockets[idx].size === 0) forfeit()
  }, graceMs)

  const oppIdx = idx === 0 ? 1 : 0
  for (const sid of match.sockets[oppIdx]) {
    io.local.to(sid).emit(EV('opponentDropped'), { graceMs })
  }
}

/* ── Queue pairing ───────────────────────────────────────────────────────────────────────── */

function removeFromQueue(userId) {
  const idx = queue.findIndex(e => e.userId === userId)
  if (idx !== -1) queue.splice(idx, 1)
  queueByUser.delete(userId)
  scheduleLobbyBroadcast()
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
  scheduleLobbyBroadcast()
}

/** Withdraws every challenge `userId` sent or was sent, telling the player on the other end. */
function dropChallengesFor(io, userId) {
  for (const c of [...challenges.values()]) {
    if (c.fromUserId === userId) {
      untrackChallenge(c)
      io.local.to(userRoom(c.toUserId)).emit(EV('challengeCancelled'), { id: c.id })
    } else if (c.toUserId === userId) {
      untrackChallenge(c)
      io.local.to(userRoom(c.fromUserId)).emit(EV('challengeDeclined'), { id: c.id, toUsername: c.toUsername, reason: 'busy' })
    }
  }
}

/* ── Sweep ───────────────────────────────────────────────────────────────────────────────── */

function sweep(io) {
  const now = Date.now()
  for (let i = queue.length - 1; i >= 0; i--) {
    if (now - queue[i].joinedAt > QUEUE_STALE_MS) removeFromQueue(queue[i].userId)
  }
  for (const c of [...challenges.values()]) {
    if (now - c.createdAt <= CHALLENGE_STALE_MS) continue
    untrackChallenge(c)
    io.local.to(userRoom(c.toUserId)).emit(EV('challengeCancelled'), { id: c.id })
    io.local.to(userRoom(c.fromUserId)).emit(EV('challengeDeclined'), { id: c.id, toUsername: c.toUsername, reason: 'expired' })
  }
  for (const [matchId, match] of matches.entries()) {
    if (match.ending) continue
    if (now - match.startedAt < MATCH_MAX_AGE_MS) continue
    endMatch(io, match, { outcome: 'TIE', winnerUserId: null, player1Score: 0, player2Score: 0, endReason: 'sweep' })
      .catch(err => console.error('[ogGtoons] sweep end failed:', err))
  }
  reconcileTournamentGames(io).catch(err => console.error('[ogGtoons] tournament reconcile failed:', err))
}

/**
 * Ends any live tournament game whose pairing has since been decided (an admin set the result, the
 * deadline passed, a player was disqualified, the tournament was cancelled). One cheap query per
 * live tournament game per minute. The game is saved as INCOMPLETE and does not count.
 */
async function reconcileTournamentGames(io) {
  for (const match of [...matches.values()]) {
    if (match.ending || !match.tournament) continue
    if (!(await isPairingClosed(match.tournament.matchId))) continue
    for (const uid of match.players) {
      io.local.to(userRoom(uid)).emit(EV('error'), { code: 'tournamentClosed', message: 'This tournament match was decided by an admin or the deadline, so this game was ended.' })
    }
    await endMatch(io, match, { outcome: 'INCOMPLETE', winnerUserId: null, player1Score: 0, player2Score: 0, endReason: 'closed' })
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
export async function restoreOgGtoonsMatches(io) {
  const restored = await ogRedis.scanOgGtoonMatches()
  for (const [matchId, match] of restored.entries()) {
    match.sockets = [new Set(), new Set()]
    match.graceTimers = {}
    match.ending = false
    // A match saved before hands/slots existed (fixed deck order) can't be resumed under the new
    // rules; restart it from a fresh deal so players keep their stake instead of losing the match.
    // Same for a match saved before the 4/3 layout and the swap phase (no swapReady): its rounds
    // no longer line up with the board.
    if (!Array.isArray(match.hand) || !Array.isArray(match.swapReady)) initHands(match, secureRng)
    if (!Array.isArray(match.held)) match.held = [null, null]
    if (!Array.isArray(match.colorReady)) {
      match.colorReady = [false, false]
      match.pendingColor = [null, null]
      match.silverColor = [null, null]
      match.colorDone = match.currentRound > 3
    }
    if (!match.deadline) startPhaseClock(match)
    match.phaseTimer = null
    matches.set(matchId, match)
    if (io) armPhaseTimer(io, match)
    matchByUser.set(match.players[0], matchId)
    matchByUser.set(match.players[1], matchId)
  }
  return restored.size
}

/* ── Registration ────────────────────────────────────────────────────────────────────────── */

export function registerOgGtoons(io, socket, resolveSocketUser) {
  lobbyIo = io
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

  // Tournament ready-up / start. Lives in its own file; it borrows the runtime's internals here.
  registerOgGtoonsTournament(io, socket, {
    auth, startMatch, matchByUser, queueByUser, removeFromQueue, userRoom, isPracticing, EV
  })

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

  // The Matchmaking tab being open is what puts a player in everyone's "Challenge a Player" dropdown.
  socket.on(EV('lobbyJoin'), async () => {
    const user = await auth()
    if (!user) return
    const entry = lobby.get(user.id) || { username: user.username, sockets: new Set() }
    entry.username = user.username
    entry.sockets.add(socket.id)
    lobby.set(user.id, entry)
    socket.data.ogGtoonsLobbyUserId = user.id
    // The newcomer gets their list right away; everyone else's refreshes on the debounce.
    socket.emit(EV('lobbyUsers'), { users: availableLobbyUsers(user.id) })
    scheduleLobbyBroadcast()
  })

  socket.on(EV('lobbyLeave'), async () => {
    const userId = socket.data.ogGtoonsLobbyUserId
    const lobbyUserId = socket.data?.ogGtoonsLobbyUserId
    if (lobbyUserId) lobbyLeaveSocket(lobbyUserId, socket.id)
    socket.data.ogGtoonsLobbyUserId = null
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
    scheduleLobbyBroadcast()
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
    const busy = busyReason(target.id)
    if (busy) {
      return socket.emit(EV('error'), { code: 'targetBusy', message: `${target.username} is ${busy} right now.` })
    }
    if (!(await io.in(userRoom(target.id)).local.fetchSockets()).length) {
      return socket.emit(EV('error'), { code: 'targetOffline', message: `${target.username} is no longer online.` })
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
    scheduleLobbyBroadcast()
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
    // Accepting is a choice of THIS match over any random search either player had going.
    for (const uid of [challenge.fromUserId, user.id]) {
      if (!queueByUser.has(uid)) continue
      removeFromQueue(uid)
      io.local.to(userRoom(uid)).emit(EV('queueLeft'))
    }
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
    io.local.to(userRoom(challenge.fromUserId)).emit(EV('challengeDeclined'), { id: challengeId, toUsername: challenge.toUsername, reason: 'declined' })
  })

  socket.on(EV('challengeCancel'), async ({ challengeId } = {}) => {
    const user = await auth()
    if (!user) return
    const challenge = challenges.get(challengeId)
    if (!challenge || challenge.fromUserId !== user.id) return
    untrackChallenge(challenge)
    io.local.to(userRoom(challenge.toUserId)).emit(EV('challengeCancelled'), { id: challengeId })
  })

  // Resolves the acting player's live match + side, or null (and nothing is sent).
  const liveSide = async () => {
    const user = await auth()
    if (!user) return null
    const matchId = matchByUser.get(user.id)
    const match = matchId && matches.get(matchId)
    if (!match || match.ending) return null
    const idx = match.players.indexOf(user.id)
    if (idx === -1) return null
    match.sockets[idx].add(socket.id)
    return { user, match, idx }
  }
  const reject = (res) => socket.emit(EV('error'), { code: res.code, message: res.message })

  // Placing/unplacing only changes this player's private view; nothing is sent to the opponent
  // until they commit.
  socket.on(EV('place'), async ({ cardIdx, slot } = {}) => {
    const side = await liveSide()
    if (!side) return
    const res = placeCard(side.match, side.idx, { cardIdx, slot })
    if (!res.ok) return reject(res)
    side.match.lastActivity = Date.now()
    fireSync(side.match.id, side.match)
    emitStateTo(io, side.match, side.idx)
  })

  socket.on(EV('unplace'), async ({ slot } = {}) => {
    const side = await liveSide()
    if (!side) return
    const res = unplaceSlot(side.match, side.idx, { slot })
    if (!res.ok) return reject(res)
    side.match.lastActivity = Date.now()
    fireSync(side.match.id, side.match)
    emitStateTo(io, side.match, side.idx)
  })

  // Round-3 swap: replace the card in slot 7 with a random undealt one. The 10-point fee comes off the
  // match score at scoring (never the points balance). The choice is held
  // until both players have made theirs, so neither sees the other's result first.
  socket.on(EV('swap'), async () => {
    const side = await liveSide()
    if (!side) return
    const { user, match, idx } = side
    const check = checkSwap(match, idx)
    if (!check.ok) return reject(check)
    const res = recordSwapChoice(match, idx, true)
    if (!res.ok) return reject(res)
    match.lastActivity = Date.now()
    fireSync(match.id, match)
    socket.emit(EV('swapApplied'), { matchId: match.id })
    emitToPlayers(io, match, EV('state'))
    await settleSwap(io, match)
  })

  socket.on(EV('swapSkip'), async () => {
    const side = await liveSide()
    if (!side) return
    const { match, idx } = side
    const res = recordSwapChoice(match, idx, false)
    if (!res.ok) return reject(res)
    match.lastActivity = Date.now()
    fireSync(match.id, match)
    emitToPlayers(io, match, EV('state'))
    await settleSwap(io, match)
  })

  // End-of-game Silver colour: secretly pick the colour your Silver cards count as. Held until
  // both players have picked, then revealed together and the board is scored.
  socket.on(EV('chooseColor'), async ({ color } = {}) => {
    const side = await liveSide()
    if (!side) return
    const { match, idx } = side
    const res = submitColor(match, idx, { color })
    if (!res.ok) return reject(res)
    match.lastActivity = Date.now()
    fireSync(match.id, match)
    emitToPlayers(io, match, EV('state'))
    await settleColor(io, match)
  })

  socket.on(EV('commit'), async ({ matchId, round } = {}) => {
    const side = await liveSide()
    if (!side) return
    const { match, idx } = side
    if (matchId && matchId !== match.id) return
    const check = checkCommit(match, idx, round)
    if (!check.ok) {
      if (check.code !== 'staleRound' && check.code !== 'already_committed') reject(check)
      return
    }

    markCommitted(match, idx)
    match.lastActivity = Date.now()
    socket.emit(EV('committed'), { round: match.currentRound })
    const oppIdx = idx === 0 ? 1 : 0
    for (const sid of match.sockets[oppIdx]) io.local.to(sid).emit(EV('opponentCommitted'), { round: match.currentRound })
    // The opponent also learns which slots are now face down (never which cards).
    emitStateTo(io, match, oppIdx, true)
    emitStateTo(io, match, idx, true)

    await resolveRound(io, match)
  })

  // Discard phase (after round 1): drop any hand cards, then both hands refill together.
  socket.on(EV('discard'), async ({ cardIdxs } = {}) => {
    const side = await liveSide()
    if (!side) return
    const { match, idx } = side
    const res = submitDiscard(match, idx, { cardIdxs })
    if (!res.ok) return reject(res)
    match.lastActivity = Date.now()
    if (resolveDiscardPhase(match)) armPhaseTimer(io, match)
    fireSync(match.id, match)
    emitToPlayers(io, match, EV('state'))
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
    const lobbyUserId = socket.data?.ogGtoonsLobbyUserId
    if (lobbyUserId) lobbyLeaveSocket(lobbyUserId, socket.id)
    if (userId && matchId) handleLeave(io, { matchId, userId, socketId: socket.id, immediate: false })
  })
}

// Lets practice mode refuse to start while the user is in a live PvP match or the queue.
registerPvpProbe((userId) => matchByUser.has(userId) || queueByUser.has(userId))
// Practice / tutorial matches take a player out of the lobby's challengeable list, too.
onPresenceChange(scheduleLobbyBroadcast)
