// server/utils/ogGtoonsTutorial.js
//
// The guided tutorial for original gToons (2002): a real, server-authoritative match against a
// scripted "Tutorial Bot", played with a fixed lent deck and walked through step by step by the
// client (components/oggtoons/OgGtoonTutorial.vue). Registered per-connection from
// socket-server.js right after registerOgGtoonsPractice.
//
// ── Why this is its own module ──────────────────────────────────────────────────────────────
// Same reasoning as ogGtoonsPractice.js: PvP's lobby, stakes and persistence assume two real
// players, so the tutorial keeps its own map keyed by user and is never added to PvP's
// `queue`/`challenges`/`matches`. Round/score/effect resolution is NOT duplicated: it calls the
// same ogGtoonMatchCore.js as PvP and practice, so the tutorial teaches the real rules.
//
// ── What is scripted (ogGtoonTutorialScript.js) ─────────────────────────────────────────────
// Both decks, the hands, the goal cards, every card the bot plays, the discard, the card the
// slot-7 swap draws and the Silver colour. The player can only make the scripted move: anything
// else is refused with `offScript`, so the lesson cannot be knocked off track even by a client
// that ignores the on-screen guide. The bot moves the instant the player commits (there is no
// bot timer), and the match has no phase clocks at all (`noTimers`): nobody is ever hurried.
//
// ── The tutorial never awards, spends or records points ─────────────────────────────────────
// Stake [0, 0]; the swap's 10-point penalty only touches the match score, in memory; nothing is
// persisted (so no OgGtoonMatch row, no leaderboard entry). This module does not import Prisma,
// gamePoints or any points/match-writing helper — the one database read is the injected
// `deps.loadDecks` — and tests/ogGtoonTutorial.test.js asserts that.

import { randomUUID } from 'crypto'
import { getOgGtoonsConfig, peekRevealTiming } from './ogGtoonsConfig.js'
import { loadTutorialDecks } from './ogGtoonTutorialDeck.js'
import {
  publicMatchView, initHands, revealPlacedCards, advanceRound, checkMatchEnd,
  placeCard, unplaceSlot, checkCommit, checkSwap, recordSwapChoice, resolveSwapPhase,
  submitDiscard, resolveDiscardPhase, markCommitted, enterColorPhase, submitColor, resolveColorPhase
} from './ogGtoonMatchCore.js'
import {
  TUTORIAL_PLAN, TUTORIAL_BOT_ID, TUTORIAL_BOT_USERNAME
} from './ogGtoonTutorialScript.js'
import { markPracticing, clearPracticing, isPracticing, isInPvp } from './ogGtoonPresence.js'

const EV = (name) => `oggtoons:tutorial:${name}`
// Outbound render events reuse PvP's names so the existing client handlers and board work unchanged.
const OUT = (name) => `oggtoons:${name}`

const START_COOLDOWN_MS = 2_000
const MAX_CONCURRENT = 300
// There are no clocks, so a player may sit on a step for a while; only truly abandoned matches go.
const IDLE_MAX_MS = 2 * 60 * 60 * 1000
const ORPHAN_MAX_MS = 10 * 60 * 1000
const SWEEP_MS = 60_000

const matches = new Map()       // userId -> tutorial match
const cooldownUntil = new Map() // userId -> ms epoch

const OFF_SCRIPT = 'Follow the tutorial: do the highlighted step.'

/* ── Helpers ──────────────────────────────────────────────────────────────────────────────── */

function emitToHuman(io, match, event, payload) {
  for (const sid of match.sockets) io.local.to(sid).emit(event, payload)
}

function destroyMatch(match) {
  if (matches.get(match.humanId) === match) matches.delete(match.humanId)
  clearPracticing(match.humanId)
}

function emitState(io, match, opts) {
  emitToHuman(io, match, OUT('state'), publicMatchView(match, match.humanId, opts))
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x))

/** The bot's scripted placements for the current round, committed. */
function botCommit(match) {
  const plan = TUTORIAL_PLAN.rounds[match.currentRound]
  match.placements[1] = []
  for (const pick of plan?.bot || []) placeCard(match, 1, pick)
  markCommitted(match, 1)
}

/** Builds the scripted match from the two lent decks (nothing random: see the script). */
export function createTutorialMatch({ userId, username, decks, socketId = null }) {
  const match = {
    id: randomUUID(),
    practice: true, // no points, nothing persisted: the same safety flag practice uses
    tutorial: true,
    noTimers: true,
    difficulty: 'tutorial',
    humanId: userId,
    players: [userId, TUTORIAL_BOT_ID],
    usernames: [username, TUTORIAL_BOT_USERNAME],
    sockets: new Set(socketId ? [socketId] : []),
    deckOrder: [decks.user, decks.bot],
    stake: [0, 0],
    ending: false,
    startedAt: Date.now(),
    lastActivity: Date.now()
  }
  match.goalCardIdx = [...TUTORIAL_PLAN.goalCardIdx]
  match.goalColor = match.deckOrder.map((deck, i) => deck[match.goalCardIdx[i]].color)
  initHands(match) // shuffles and deals; overwritten by the script just below
  match.hand = TUTORIAL_PLAN.hand.map(h => [...h])
  match.undealt = TUTORIAL_PLAN.undealt.map(u => [...u])
  return match
}

/* ── Resolution (mirrors practice, minus every timer) ───────────────────────────────────────── */

async function resolveRound(io, match) {
  if (match.ending || !match.ready[0] || !match.ready[1]) return
  const revealedRound = match.currentRound
  const { entries, order, steps, before } = revealPlacedCards(match)
  concludeStep(io, match, revealedRound, entries, order, { steps, before })
}

/** Shared tail of a step that puts cards on the board: end the match or advance a phase. */
function concludeStep(io, match, revealedRound, entries, order, { steps = [], before = null } = {}) {
  match.lastActivity = Date.now()
  const colorPhase = enterColorPhase(match)
  // The bot has no Silver in the script, but if it ever did it would pick the scripted colour.
  if (colorPhase && !match.colorReady[1]) submitColor(match, 1, { color: TUTORIAL_PLAN.silverColor.bot })
  const end = colorPhase ? null : checkMatchEnd(match)
  // Advance before emitting so the state the client receives already carries the NEXT round/phase.
  if (!end && !colorPhase) advanceRound(match)
  emitToHuman(io, match, OUT('reveal'), {
    ...publicMatchView(match, match.humanId),
    reveal: { round: revealedRound, order, you: entries[0], opponent: entries[1], steps, before, timing: peekRevealTiming() }
  })
  if (end) endMatch(io, match, end)
}

function settleDiscardPhase(io, match) {
  if (!resolveDiscardPhase(match)) return
  match.lastActivity = Date.now()
  emitState(io, match)
}

function settleSwap(io, match) {
  if (match.ending) return
  // The swap draws a RANDOM undealt card in a real match; here it is the scripted one.
  const pool = [...match.hand[0], ...match.undealt[0]]
  const at = Math.max(0, pool.indexOf(TUTORIAL_PLAN.swap.drawIdx))
  const res = resolveSwapPhase(match, () => (at + 0.5) / pool.length)
  if (!res) return
  concludeStep(io, match, match.currentRound, res.entries, res.order, { steps: res.steps, before: res.before })
}

function settleColor(io, match) {
  if (match.ending || !resolveColorPhase(match)) return
  concludeStep(io, match, match.currentRound, [[], []], [])
}

function endMatch(io, match, end) {
  if (match.ending) return
  match.ending = true
  emitToHuman(io, match, OUT('matchEnd'), {
    ...publicMatchView(match, match.humanId),
    over: true,
    outcome: end.outcome,
    won: end.winnerIdx === 0,
    endReason: 'natural',
    player1Score: end.player1Score,
    player2Score: end.player2Score,
    effectsResolved: end.effectsResolved || []
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
export function startOgGtoonsTutorialSweep() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep() } catch (err) { console.error('[ogGtoonsTutorial] sweep failed:', err) }
  }, SWEEP_MS)
  sweepTimer.unref?.()
}

/* ── Registration ────────────────────────────────────────────────────────────────────────── */

/**
 * @param deps  injectable for tests: { loadDecks, getConfig, isInPvp }
 */
export function registerOgGtoonsTutorial(io, socket, resolveSocketUser, deps = {}) {
  const d = {
    loadDecks: deps.loadDecks || loadTutorialDecks,
    getConfig: deps.getConfig || getOgGtoonsConfig,
    isInPvp: deps.isInPvp || isInPvp
  }
  const fail = (code, message) => socket.emit(OUT('error'), { code, message })

  const auth = async () => {
    const user = await resolveSocketUser(socket)
    if (!user) fail('unauth', 'Please sign in again to keep playing.')
    return user
  }

  socket.on(EV('start'), async () => {
    const user = await auth()
    if (!user) return

    // Needs live matches on (like practice), but not the practice switch: it is not a practice match.
    const { gameEnabled } = await d.getConfig()
    if (!gameEnabled) return fail('tutorialDisabled', 'The tutorial is currently unavailable.')
    // One live match per user: a practice match (marked in presence, but not ours) blocks it too.
    if (d.isInPvp(user.id) || (isPracticing(user.id) && !matches.has(user.id))) {
      return fail('inMatch', 'Finish or leave your current match or queue first.')
    }
    const now = Date.now()
    if ((cooldownUntil.get(user.id) || 0) > now) return fail('tooFast', 'Slow down — try again in a moment.')
    cooldownUntil.set(user.id, now + START_COOLDOWN_MS)

    // Starting over abandons any older tutorial match: no stakes, nothing to protect.
    const existing = matches.get(user.id)
    if (existing) destroyMatch(existing)
    if (matches.size >= MAX_CONCURRENT) return fail('busy', 'The tutorial is busy right now. Try again shortly.')

    const decks = await d.loadDecks()
    if (!decks) return fail('tutorialUnavailable', 'The tutorial cards are not available yet. Please try again later.')
    if (matches.has(user.id)) return fail('tooFast', 'Slow down — try again in a moment.')

    const match = createTutorialMatch({ userId: user.id, username: user.username, decks, socketId: socket.id })
    matches.set(user.id, match)
    markPracticing(user.id)
    socket.data.ogGtoonsTutorialUserId = user.id
    emitToHuman(io, match, OUT('matchStart'), publicMatchView(match, user.id))
  })

  // Page refresh / reconnect: re-send the live match to this socket.
  socket.on(EV('resume'), async () => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (!match || match.ending) return
    match.sockets.add(socket.id)
    socket.data.ogGtoonsTutorialUserId = user.id
    match.lastActivity = Date.now()
    socket.emit(OUT('matchStart'), publicMatchView(match, user.id))
  })

  const liveMatch = async () => {
    const user = await auth()
    if (!user) return null
    const match = matches.get(user.id)
    if (!match || match.ending) return null
    match.sockets.add(socket.id)
    return match
  }
  const settle = (res, match, opts) => {
    if (!res.ok) { fail(res.code, res.message); return false }
    match.lastActivity = Date.now()
    emitState(io, match, opts)
    return true
  }

  socket.on(EV('place'), async ({ cardIdx, slot } = {}) => {
    const match = await liveMatch()
    if (!match) return
    const scripted = TUTORIAL_PLAN.rounds[match.currentRound]?.user.some(p => p.cardIdx === cardIdx && p.slot === slot)
    if (!scripted) return fail('offScript', OFF_SCRIPT)
    settle(placeCard(match, 0, { cardIdx, slot }), match, { log: false })
  })

  socket.on(EV('unplace'), async ({ slot } = {}) => {
    const match = await liveMatch()
    if (match) settle(unplaceSlot(match, 0, { slot }), match, { log: false })
  })

  socket.on(EV('commit'), async ({ round } = {}) => {
    const match = await liveMatch()
    if (!match) return
    const check = checkCommit(match, 0, round)
    if (!check.ok) {
      if (check.code !== 'staleRound' && check.code !== 'already_committed') fail(check.code, check.message)
      return
    }
    markCommitted(match, 0)
    match.lastActivity = Date.now()
    socket.emit(OUT('committed'), { round: match.currentRound })
    botCommit(match)
    emitToHuman(io, match, OUT('opponentCommitted'), { round: match.currentRound })
    emitState(io, match)
    await resolveRound(io, match)
  })

  // Discard phase: the script has the player throw away one specific card.
  socket.on(EV('discard'), async ({ cardIdxs } = {}) => {
    const match = await liveMatch()
    if (!match) return
    if (!Array.isArray(cardIdxs) || !sameSet(cardIdxs, TUTORIAL_PLAN.discard.user)) return fail('offScript', OFF_SCRIPT)
    if (!settle(submitDiscard(match, 0, { cardIdxs }), match)) return
    submitDiscard(match, 1, { cardIdxs: TUTORIAL_PLAN.discard.bot })
    settleDiscardPhase(io, match)
  })

  // Round-3 slot-7 swap: the script has the player pay for it. The bot keeps its card.
  socket.on(EV('swap'), async () => {
    const match = await liveMatch()
    if (!match) return
    const check = checkSwap(match, 0)
    if (!check.ok) return fail(check.code, check.message)
    if (!settle(recordSwapChoice(match, 0, true), match)) return
    recordSwapChoice(match, 1, false)
    socket.emit(OUT('swapApplied'), { matchId: match.id })
    settleSwap(io, match)
  })

  socket.on(EV('swapSkip'), async () => {
    if (await liveMatch()) fail('offScript', OFF_SCRIPT)
  })

  // End-of-game Silver colour pick: the script names the colour.
  socket.on(EV('chooseColor'), async ({ color } = {}) => {
    const match = await liveMatch()
    if (!match) return
    if (color !== TUTORIAL_PLAN.silverColor.user) return fail('offScript', OFF_SCRIPT)
    if (settle(submitColor(match, 0, { color }), match)) settleColor(io, match)
  })

  socket.on(EV('leave'), async () => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (match) destroyMatch(match)
    socket.data.ogGtoonsTutorialUserId = null
  })

  socket.on('disconnecting', () => {
    const uid = socket.data?.ogGtoonsTutorialUserId
    const match = uid && matches.get(uid)
    if (match) {
      match.sockets.delete(socket.id)
      match.lastActivity = Date.now() // starts the orphan clock
    }
  })
}

/** Test/inspection helper. */
export function hasLiveTutorialMatch(userId) {
  return matches.has(userId)
}
