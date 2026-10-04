// server/utils/ogGtoonsPractice.js
//
// Practice mode for original gToons (2002): a server-authoritative single-player match against a
// bot that plays a shuffled copy of the player's own deck. Registered per-connection from
// socket-server.js right after registerOgGtoons.
//
// ── Why this is NOT a branch inside ogGtoonsSocket.js ───────────────────────────────────────
// Same reasoning as server/utils/edRpsAiMatch.js: PvP's lobby, queue, stakes, swap debit,
// forfeit-on-disconnect and persistence all assume two real players. Keeping practice in its own
// module — with its own map keyed by user, never added to PvP's `queue`/`challenges`/`matches` —
// means a second socket can never be attached to a bot match, and nothing here can reach PvP's
// money paths. Round/score/effect resolution is NOT duplicated: both modes call the same
// ogGtoonMatchCore.js.
//
// ── Practice never awards, spends or records points ─────────────────────────────────────────
//   • No stake: the match is created with stake [0, 0]; there is no stake input at all.
//   • Swap is free and handled purely in memory — PvP's debit path is not reachable from here.
//   • Nothing is persisted. In particular no OgGtoonMatch row is written, which is also what keeps
//     practice out of the leaderboard (it is computed from that table).
//   • This module deliberately does not import Prisma, gamePoints or any points/match-writing
//     helper; tests/ogGtoonsPractice.test.js asserts that, so a future edit can't quietly add it.
// The only database access is the deck read, injected as `deps.loadDeck`.
//
// ── Process locality / resources ────────────────────────────────────────────────────────────
// In-memory and single-process like PvP, not mirrored to Redis: a server restart simply ends a
// practice match. A cooldown, one-live-match-per-user, a global concurrency cap, and an idle/
// orphan sweep bound what one user (or a script) can hold open.

import { randomUUID } from 'crypto'
import { getOgGtoonsConfig } from './ogGtoonsConfig.js'
import { loadVerifiedDeckSnapshot } from './ogGtoonDeck.js'
import { deriveGoalColor, applySwap } from './ogGtoonEngine.js'
import { publicMatchView, revealNextCards, checkMatchEnd } from './ogGtoonMatchCore.js'
import {
  BOT_ID, BOT_USERNAME, buildBotDeck, chooseBotSwap, botCommitDelayMs, normalizeDifficulty
} from './ogGtoonBot.js'
import { markPracticing, clearPracticing, isInPvp } from './ogGtoonPresence.js'

const EV = (name) => `oggtoons:practice:${name}`
// Outbound render events deliberately reuse PvP's names so the existing client handlers and
// board component work unchanged; the payload carries `practice: true`.
const OUT = (name) => `oggtoons:${name}`

const START_COOLDOWN_MS = 2_000
const MAX_CONCURRENT = 300
const IDLE_MAX_MS = 15 * 60 * 1000
const ORPHAN_MAX_MS = 2 * 60 * 1000
const SWEEP_MS = 60_000

const matches = new Map()       // userId -> practice match
const cooldownUntil = new Map() // userId -> ms epoch

/* ── Helpers ──────────────────────────────────────────────────────────────────────────────── */

function emitToHuman(io, match, event, payload) {
  for (const sid of match.sockets) io.local.to(sid).emit(event, payload)
}

function destroyMatch(match) {
  if (match.botTimer) clearTimeout(match.botTimer)
  match.botTimer = null
  if (matches.get(match.humanId) === match) matches.delete(match.humanId)
  clearPracticing(match.humanId)
}

/** The bot's own unrevealed cards, up-next first — its swap input (never the human's order). */
function botRemaining(match) {
  return match.remainingIdx[1].map(i => match.deckOrder[1][i])
}

function scheduleBot(io, match, deps) {
  if (match.botTimer) clearTimeout(match.botTimer)
  match.botTimer = setTimeout(() => {
    match.botTimer = null
    botAct(io, match, deps).catch(err => console.error('[ogGtoonsPractice] bot turn failed:', err))
  }, deps.botDelay())
  match.botTimer.unref?.()
}

async function botAct(io, match, deps) {
  if (match.ending || match.ready[1]) return
  const swapWith = chooseBotSwap({
    difficulty: match.difficulty,
    swapUsed: match.swapUsed[1],
    round: match.currentRound,
    remaining: botRemaining(match),
    goalColor: match.goalColor[1]
  })
  if (swapWith !== null) {
    match.remainingIdx[1] = applySwap(match.remainingIdx[1], swapWith)
    match.swapUsed[1] = true
  }
  match.ready[1] = true
  match.lastActivity = Date.now()
  emitToHuman(io, match, OUT('opponentCommitted'), { round: match.currentRound })
  await resolveRound(io, match, deps)
}

async function resolveRound(io, match, deps) {
  if (match.ending) return
  if (!match.ready[0] || !match.ready[1]) return

  const { entry1, entry2 } = revealNextCards(match)
  match.lastActivity = Date.now()
  const revealedRound = match.currentRound

  const end = checkMatchEnd(match)
  // Advance before emitting so the state the client receives carries the NEXT round number;
  // otherwise its next commit sends the stale round and the server silently drops it.
  if (!end) match.currentRound += 1
  emitToHuman(io, match, OUT('reveal'), {
    ...publicMatchView(match, match.humanId),
    reveal: { round: revealedRound, you: entry1, opponent: entry2 }
  })

  if (end) {
    endMatch(io, match, {
      outcome: end.outcome,
      won: end.winnerIdx === 0,
      player1Score: end.player1Score,
      player2Score: end.player2Score,
      endReason: 'natural',
      effectsResolved: end.effectsResolved
    })
    return
  }
  scheduleBot(io, match, deps)
}

/** Nothing is persisted or paid here — see the header. */
function endMatch(io, match, params) {
  if (match.ending) return
  match.ending = true
  emitToHuman(io, match, OUT('matchEnd'), {
    ...publicMatchView(match, match.humanId),
    over: true,
    outcome: params.outcome,
    won: params.won,
    endReason: params.endReason,
    player1Score: params.player1Score,
    player2Score: params.player2Score,
    effectsResolved: params.effectsResolved || []
  })
  destroyMatch(match)
}

/* ── Sweep ───────────────────────────────────────────────────────────────────────────────── */

function sweep() {
  const now = Date.now()
  for (const match of [...matches.values()]) {
    const orphaned = match.sockets.size === 0 && now - match.lastActivity > ORPHAN_MAX_MS
    if (orphaned || now - match.lastActivity > IDLE_MAX_MS) destroyMatch(match)
  }
  for (const [uid, until] of cooldownUntil) if (until <= now) cooldownUntil.delete(uid)
}

let sweepTimer = null
export function startOgGtoonsPracticeSweep() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep() } catch (err) { console.error('[ogGtoonsPractice] sweep failed:', err) }
  }, SWEEP_MS)
  sweepTimer.unref?.()
}

/* ── Registration ────────────────────────────────────────────────────────────────────────── */

/**
 * @param deps  injectable for tests: { loadDeck, getConfig, botDelay, rng, isInPvp }
 */
export function registerOgGtoonsPractice(io, socket, resolveSocketUser, deps = {}) {
  const d = {
    loadDeck: deps.loadDeck || loadVerifiedDeckSnapshot,
    getConfig: deps.getConfig || getOgGtoonsConfig,
    botDelay: deps.botDelay || (() => botCommitDelayMs()),
    rng: deps.rng || Math.random,
    isInPvp: deps.isInPvp || isInPvp
  }
  const fail = (code, message) => socket.emit(OUT('error'), { code, message })

  const auth = async () => {
    const user = await resolveSocketUser(socket)
    if (!user) fail('unauth', 'Please sign in again to keep playing.')
    return user
  }

  socket.on(EV('start'), async ({ deckId, difficulty } = {}) => {
    const user = await auth()
    if (!user) return

    const { gameEnabled, practiceEnabled } = await d.getConfig()
    if (!gameEnabled || !practiceEnabled) {
      return fail('practiceDisabled', 'Practice mode is currently unavailable.')
    }
    if (d.isInPvp(user.id)) {
      return fail('inMatch', 'Finish or leave your current match or queue first.')
    }
    const now = Date.now()
    if ((cooldownUntil.get(user.id) || 0) > now) {
      return fail('tooFast', 'Slow down — try again in a moment.')
    }
    cooldownUntil.set(user.id, now + START_COOLDOWN_MS)

    // Starting a new practice match abandons any older one: no stakes, nothing to protect.
    const existing = matches.get(user.id)
    if (existing) destroyMatch(existing)
    if (matches.size >= MAX_CONCURRENT) {
      return fail('busy', 'Practice is busy right now. Try again shortly.')
    }

    const userDeck = await d.loadDeck(user.id, deckId)
    if (!userDeck) {
      return fail('badDeck', 'That deck is not a valid 12-card gToons deck.')
    }
    // The user may have started another practice match while the deck was loading.
    if (matches.has(user.id)) return fail('tooFast', 'Slow down — try again in a moment.')

    const level = normalizeDifficulty(difficulty)
    const botDeck = buildBotDeck(userDeck, level, d.rng)
    const match = {
      id: randomUUID(),
      practice: true,
      difficulty: level,
      humanId: user.id,
      players: [user.id, BOT_ID],
      usernames: [user.username, BOT_USERNAME],
      sockets: new Set([socket.id]),
      deckOrder: [userDeck, botDeck],
      remainingIdx: [[0,1,2,3,4,5,6,7,8,9,10,11], [0,1,2,3,4,5,6,7,8,9,10,11]],
      goalColor: [deriveGoalColor(userDeck), deriveGoalColor(botDeck)],
      swapUsed: [false, false],
      ready: [false, false],
      revealed: [[], []],
      stake: [0, 0],
      currentRound: 1,
      ending: false,
      botTimer: null,
      startedAt: Date.now(),
      lastActivity: Date.now()
    }
    matches.set(user.id, match)
    markPracticing(user.id)
    socket.data.ogGtoonsPracticeUserId = user.id

    emitToHuman(io, match, OUT('matchStart'), publicMatchView(match, user.id))
    scheduleBot(io, match, d)
  })

  // Page refresh / reconnect: re-send the live match to this socket.
  socket.on(EV('resume'), async () => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (!match || match.ending) return
    match.sockets.add(socket.id)
    socket.data.ogGtoonsPracticeUserId = user.id
    match.lastActivity = Date.now()
    socket.emit(OUT('matchStart'), publicMatchView(match, user.id))
  })

  socket.on(EV('commit'), async ({ round } = {}) => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (!match || match.ending) return
    if (Number(round) !== match.currentRound) return
    if (match.ready[0]) return
    if (match.remainingIdx[0].length === 0) return

    match.ready[0] = true
    match.sockets.add(socket.id)
    match.lastActivity = Date.now()
    socket.emit(OUT('committed'), { round: match.currentRound })
    await resolveRound(io, match, d)
  })

  // Free in practice. Same rules as PvP (once per match, before committing, valid target) but
  // there is no balance check and no debit — the PvP debit path is not reachable from here.
  socket.on(EV('swap'), async ({ swapWithIndex } = {}) => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (!match || match.ending) return
    if (match.swapUsed[0] || match.ready[0]) {
      return fail(match.swapUsed[0] ? 'swap_used' : 'already_revealed', 'You cannot swap right now.')
    }
    if (!Number.isInteger(swapWithIndex) || swapWithIndex <= 0 || swapWithIndex >= match.remainingIdx[0].length) {
      return fail('badSwapTarget', 'Invalid swap target.')
    }
    match.remainingIdx[0] = applySwap(match.remainingIdx[0], swapWithIndex)
    match.swapUsed[0] = true
    match.lastActivity = Date.now()
    socket.emit(OUT('swapApplied'), { matchId: match.id })
  })

  socket.on(EV('leave'), async () => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (match) destroyMatch(match)
    socket.data.ogGtoonsPracticeUserId = null
  })

  socket.on('disconnecting', () => {
    const uid = socket.data?.ogGtoonsPracticeUserId
    const match = uid && matches.get(uid)
    if (match) {
      match.sockets.delete(socket.id)
      match.lastActivity = Date.now() // starts the orphan clock
    }
  })
}

/** Test/inspection helper. */
export function hasLivePracticeMatch(userId) {
  return matches.has(userId)
}
