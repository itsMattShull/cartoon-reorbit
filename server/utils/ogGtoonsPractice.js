// server/utils/ogGtoonsPractice.js
//
// Practice mode for original gToons (2002): a server-authoritative single-player match against a
// bot that brings one of its own pre-defined decks for the chosen difficulty (see ogGtoonBotDecks.js;
// a copy of the player's deck only if those cards are not available). Registered per-connection from
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
//   • The round-3 slot-7 swap costs 10 points off the match score (as in PvP) but never touches the points balance; it is handled purely in memory.
//   • Nothing is persisted. In particular no OgGtoonMatch row is written, which is also what keeps
//     practice out of the leaderboard (it is computed from that table).
//   • This module deliberately does not import Prisma, gamePoints or any points/match-writing
//     helper; tests/ogGtoonsPractice.test.js asserts that, so a future edit can't quietly add it.
// The only database access is the deck reads, injected as `deps.loadDeck` and `deps.loadBotDeck`.
//
// ── Process locality / resources ────────────────────────────────────────────────────────────
// In-memory and single-process like PvP, not mirrored to Redis: a server restart simply ends a
// practice match. A cooldown, one-live-match-per-user, a global concurrency cap, and an idle/
// orphan sweep bound what one user (or a script) can hold open.

import { randomUUID } from 'crypto'
import { getOgGtoonsConfig, peekRevealTiming } from './ogGtoonsConfig.js'
import { loadVerifiedDeckSnapshot } from './ogGtoonDeck.js'
import { loadBotDeck } from './ogGtoonBotDeck.js'
import { assignRandomGoals, slotsForRound } from './ogGtoonEngine.js'
import {
  publicMatchView, initHands, revealPlacedCards, advanceRound, checkMatchEnd,
  placeCard, unplaceSlot, checkCommit, checkSwap, recordSwapChoice, resolveSwapPhase, expirePhase,
  submitDiscard, resolveDiscardPhase, markCommitted, extendDeadlineForReveal,
  enterColorPhase, submitColor, resolveColorPhase, autoSilverColor
} from './ogGtoonMatchCore.js'
import {
  BOT_ID, BOT_USERNAME, buildBotDeck, chooseBotPlacements, chooseBotDiscards, chooseBotSwap,
  botCommitDelayMs, normalizeDifficulty
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
  if (match.phaseTimer) clearTimeout(match.phaseTimer)
  match.phaseTimer = null
  if (matches.get(match.humanId) === match) matches.delete(match.humanId)
  clearPracticing(match.humanId)
}

/** Full-card objects (with their deck index as `idx`) for some of the bot's own deck indexes. */
function botCards(match, idxs) {
  return idxs.map(i => ({ idx: i, ...match.deckOrder[1][i] }))
}

function emitState(io, match, opts) {
  emitToHuman(io, match, OUT('state'), publicMatchView(match, match.humanId, opts))
}

function scheduleBot(io, match, deps) {
  if (match.botTimer) clearTimeout(match.botTimer)
  match.botTimer = setTimeout(() => {
    match.botTimer = null
    botAct(io, match, deps).catch(err => console.error('[ogGtoonsPractice] bot turn failed:', err))
  }, deps.botDelay())
  match.botTimer.unref?.()
}

/** The bot's turn: discards, the slot-7 swap, or placing and committing, depending on the phase. */
async function botAct(io, match, deps) {
  if (match.ending) return
  if (match.phase === 'discard') return botDiscard(io, match, deps)
  if (match.phase === 'swap') return botSwap(io, match, deps)
  if (match.phase === 'color') return botColor(io, match, deps)
  if (match.ready[1]) return

  const slots = slotsForRound(match.currentRound)
  const picks = chooseBotPlacements({
    difficulty: match.difficulty, slots, hand: botCards(match, match.hand[1]),
    goalColor: match.goalColor[1], rng: deps.rng
  })
  match.placements[1] = []
  for (const pick of picks) placeCard(match, 1, pick)

  markCommitted(match, 1)
  match.lastActivity = Date.now()
  emitToHuman(io, match, OUT('opponentCommitted'), { round: match.currentRound })
  emitState(io, match)
  await resolveRound(io, match, deps)
}

async function botDiscard(io, match, deps) {
  if (match.discardReady[1]) return
  submitDiscard(match, 1, {
    cardIdxs: chooseBotDiscards({
      difficulty: match.difficulty,
      hand: botCards(match, match.hand[1]),
      undealt: botCards(match, [...match.hand[1], ...match.undealt[1]]),
      goalColor: match.goalColor[1]
    })
  })
  match.lastActivity = Date.now()
  emitState(io, match)
  settleDiscardPhase(io, match, deps)
}

/** The bot picks the colour that serves it best (the board is public, so this is fair). */
async function botColor(io, match, deps) {
  // Already done (no Silver card to colour): the phase may still be waiting on nothing but a settle.
  if (!match.colorReady[1]) submitColor(match, 1, { color: autoSilverColor(match, 1) })
  match.lastActivity = Date.now()
  emitState(io, match)
  settleColor(io, match, deps)
}

async function botSwap(io, match, deps) {
  // Already done (nothing to swap) still falls through to settle: when neither side can be offered
  // a swap both start ready, and without this the phase would sit waiting until the timer died.
  if (!match.swapReady[1]) {
    const slotSeven = match.held?.[1] || null
    const doSwap = chooseBotSwap({
      difficulty: match.difficulty,
      slotCard: slotSeven ? { value: slotSeven.baseValue, color: slotSeven.color } : null,
      undealt: botCards(match, [...match.hand[1], ...match.undealt[1]]),
      goalColor: match.goalColor[1]
    })
    recordSwapChoice(match, 1, doSwap)
  }
  match.lastActivity = Date.now()
  emitState(io, match)
  await settleSwap(io, match, deps)
}

/** Once both sides have chosen their discards: deal, re-open placing and let the bot move. */
function settleDiscardPhase(io, match, deps) {
  if (!resolveDiscardPhase(match)) return
  match.lastActivity = Date.now()
  emitState(io, match)
  armPhaseTimer(io, match, deps)
  scheduleBot(io, match, deps)
}

async function resolveRound(io, match, deps) {
  if (match.ending) return
  if (!match.ready[0] || !match.ready[1]) return

  const revealedRound = match.currentRound
  const { entries, order, steps, before } = revealPlacedCards(match)
  concludeStep(io, match, deps, revealedRound, entries, order, { steps, before })
}

/** Shared tail of a step that puts cards on the board: end the match or advance a phase. */
function concludeStep(io, match, deps, revealedRound, entries, order, { steps = [], before = null } = {}) {
  match.lastActivity = Date.now()
  const timing = peekRevealTiming()

  // Once the board is complete, a side with a Silver card picks its colour before anything is scored.
  const colorPhase = enterColorPhase(match)
  const end = colorPhase ? null : checkMatchEnd(match)
  // Advance before emitting so the state the client receives already carries the NEXT round and
  // phase; otherwise its next action would send a stale round and be silently dropped.
  if (!end) {
    if (!colorPhase) advanceRound(match)
    // The cards reveal one at a time on the client; keep that animation off the next phase's clock.
    extendDeadlineForReveal(match, steps, timing)
  }
  emitToHuman(io, match, OUT('reveal'), {
    ...publicMatchView(match, match.humanId),
    reveal: { round: revealedRound, order, you: entries[0], opponent: entries[1], steps, before, timing }
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
  armPhaseTimer(io, match, deps)
  scheduleBot(io, match, deps)
}

/** Applies the slot-7 swaps once both sides have chosen, then scores the board. */
async function settleSwap(io, match, deps) {
  if (match.ending) return
  const res = resolveSwapPhase(match, deps.rng)
  if (!res) return
  concludeStep(io, match, deps, match.currentRound, res.entries, res.order, { steps: res.steps, before: res.before })
}

/** Applies the Silver colour picks once both sides are done, then scores the board. */
function settleColor(io, match, deps) {
  if (match.ending) return
  if (!resolveColorPhase(match)) return
  concludeStep(io, match, deps, match.currentRound, [[], []], [])
}

/* ── Phase clock ─────────────────────────────────────────────────────────────────────────────
 * Same defaults as PvP: when a phase's deadline passes, whoever has not acted gets random cards in
 * their empty slots / no discards / no swap, and the match carries on. */

function armPhaseTimer(io, match, deps) {
  if (match.phaseTimer) clearTimeout(match.phaseTimer)
  match.phaseTimer = null
  if (match.ending || !match.deadline) return
  match.phaseTimer = setTimeout(() => {
    match.phaseTimer = null
    onPhaseExpired(io, match, deps).catch(err => console.error('[ogGtoonsPractice] phase timeout failed:', err))
  }, Math.max(0, match.deadline - Date.now()))
  match.phaseTimer.unref?.()
}

async function onPhaseExpired(io, match, deps) {
  if (match.ending) return
  const phase = match.phase
  const acted = expirePhase(match, deps.rng)
  if (!acted.length) return
  match.lastActivity = Date.now()
  if (phase === 'play') {
    emitToHuman(io, match, OUT('committed'), { round: match.currentRound })
    emitState(io, match)
    await resolveRound(io, match, deps)
  } else if (phase === 'discard') {
    emitState(io, match)
    settleDiscardPhase(io, match, deps)
  } else if (phase === 'swap') {
    emitState(io, match)
    await settleSwap(io, match, deps)
  } else if (phase === 'color') {
    emitState(io, match)
    settleColor(io, match, deps)
  }
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
 * @param deps  injectable for tests: { loadDeck, loadBotDeck, getConfig, botDelay, rng, isInPvp }
 */
export function registerOgGtoonsPractice(io, socket, resolveSocketUser, deps = {}) {
  const d = {
    loadDeck: deps.loadDeck || loadVerifiedDeckSnapshot,
    loadBotDeck: deps.loadBotDeck || loadBotDeck,
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

    const level = normalizeDifficulty(difficulty)
    // Both reads run together; a bot deck that can't be loaded just means the fallback below.
    const [userDeck, botPick] = await Promise.all([
      d.loadDeck(user.id, deckId),
      (async () => d.loadBotDeck(level, d.rng))().catch((err) => {
        console.error('[ogGtoonsPractice] bot deck load failed:', err)
        return null
      })
    ])
    if (!userDeck) {
      return fail('badDeck', 'That deck is not a valid 12-card gToons deck.')
    }
    // The user may have started another practice match while the deck was loading.
    if (matches.has(user.id)) return fail('tooFast', 'Slow down — try again in a moment.')

    // The bot brings one of its pre-defined decks for this difficulty; if none can be built (the cards are
    // not imported), it plays a copy of the player's own deck as it used to.
    const botDeck = botPick?.cards ?? buildBotDeck(userDeck, level, d.rng)
    const match = {
      id: randomUUID(),
      practice: true,
      difficulty: level,
      humanId: user.id,
      players: [user.id, BOT_ID],
      usernames: [user.username, BOT_USERNAME],
      sockets: new Set([socket.id]),
      deckOrder: [userDeck, botDeck],
      stake: [0, 0],
      ending: false,
      botTimer: null,
      phaseTimer: null,
      startedAt: Date.now(),
      lastActivity: Date.now()
    }
    initHands(match, d.rng)
    assignRandomGoals(match, d.rng)
    matches.set(user.id, match)
    markPracticing(user.id)
    socket.data.ogGtoonsPracticeUserId = user.id

    emitToHuman(io, match, OUT('matchStart'), publicMatchView(match, user.id))
    armPhaseTimer(io, match, d)
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

  // The caller's live practice match, or null. Also re-attaches this socket to it.
  const liveMatch = async () => {
    const user = await auth()
    if (!user) return null
    const match = matches.get(user.id)
    if (!match || match.ending) return null
    match.sockets.add(socket.id)
    return match
  }
  // Reports a failed shared-core action; on success pushes the new state to the human.
  const settle = (res, match, opts) => {
    if (!res.ok) { fail(res.code, res.message); return false }
    match.lastActivity = Date.now()
    emitState(io, match, opts)
    return true
  }

  socket.on(EV('place'), async ({ cardIdx, slot } = {}) => {
    const match = await liveMatch()
    if (match) settle(placeCard(match, 0, { cardIdx, slot }), match, { log: false })
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
    emitState(io, match)
    await resolveRound(io, match, d)
  })

  // Round-3 slot-7 swap. Costs 10 off the match score like PvP, with no balance check or debit.
  // Held until the bot has chosen too, like PvP.
  socket.on(EV('swap'), async () => {
    const match = await liveMatch()
    if (!match) return
    const check = checkSwap(match, 0)
    if (!check.ok) return fail(check.code, check.message)
    if (settle(recordSwapChoice(match, 0, true), match)) {
      socket.emit(OUT('swapApplied'), { matchId: match.id })
      await settleSwap(io, match, d)
    }
  })

  // End-of-game Silver colour pick; held until the bot has picked too.
  socket.on(EV('chooseColor'), async ({ color } = {}) => {
    const match = await liveMatch()
    if (match && settle(submitColor(match, 0, { color }), match)) settleColor(io, match, d)
  })

  socket.on(EV('swapSkip'), async () => {
    const match = await liveMatch()
    if (match && settle(recordSwapChoice(match, 0, false), match)) await settleSwap(io, match, d)
  })

  // Discard phase (after round 1): drop any hand cards, then both hands refill together.
  socket.on(EV('discard'), async ({ cardIdxs } = {}) => {
    const match = await liveMatch()
    if (!match) return
    if (settle(submitDiscard(match, 0, { cardIdxs }), match)) settleDiscardPhase(io, match, d)
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
