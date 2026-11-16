// server/utils/ogGtoonTournamentGames.js
//
// Async + live tournament games. A game of an async-rules pairing (OgGtoonTournamentMatch.asyncRules) is a ROW
// (OgGtoonTournamentGame), not an in-memory match: it has no clocks, nothing auto-plays for an idle player, and it can
// wait days for a move. Both players being on the board at once simply plays it live. This module is the DB-bound
// service the socket server (and the cron worker) use; the game rules themselves are ogGtoonMatchCore.js, untouched.
//
// ── Concurrency (the rules everything here follows) ─────────────────────────────────────────────────────────────
//   * Every change to a pairing or its game happens in ONE transaction that first takes a row lock on the
//     OgGtoonTournamentMatch (SELECT ... FOR UPDATE). Moves, Start presses, game creation, the end of a game and the
//     deadline decision all take that same lock, so none of them can interleave.
//   * "Now" is the DATABASE clock read AFTER the lock is held (clock_timestamp(), not now(): now() is frozen at the
//     start of the transaction, i.e. before a wait on the lock). A move and the deadline decision therefore agree on
//     which came first.
//   * The game logic runs on a fresh copy rebuilt from the stored state. If anything fails the transaction rolls back
//     and the stored game is exactly as it was; nothing is mutated in memory first.
//   * Hidden information (hands, undealt cards, placements, held cards) lives only in `state`. It leaves the server only
//     through publicMatchView, one player at a time.
//
// Imports are relative (not '@/...') because the socket server is a plain `node` process.
import { randomUUID, randomInt } from 'node:crypto'
import { prisma } from '../prisma.js'
import { assignRandomGoals } from './ogGtoonEngine.js'
import {
  initHands, publicMatchView, revealPlacedCards, advanceRound, checkMatchEnd, buildRoundLog, enterColorPhase,
  resolveSwapPhase, resolveColorPhase, resolveDiscardPhase, placeCard, unplaceSlot, checkCommit, markCommitted,
  submitDiscard, checkSwap, recordSwapChoice, submitColor, pendingStepBlocker
} from './ogGtoonMatchCore.js'
import { serializeMatch } from './ogGtoonsMatchSerialize.js'
import {
  BEST_OF, computeSeries, bracketRoundLabel, minPlayableMs, mayStartNewGame, extendOnPlay, decideAtDeadlineAsync
} from './tournamentCore.js'
import {
  ACTIVE_STATUSES, getPlayContext, loadLockedDeckForGame, loadSeriesGames, settleMatchInTx, lockMatchResult
} from './ogGtoonTournamentLive.js'
import { peekRevealTiming } from './ogGtoonsConfig.js'

// Shuffles and deals must not be guessable from Math.random's state.
export const secureRng = () => randomInt(0, 0x100000000) / 0x100000000

const bad = (code, message, extra = {}) => ({ ok: false, code, message, ...extra })

/* ═══ Part 1: the game itself (pure: no database, no sockets) ═══════════════════════════════════════════════════ */

/** A brand new game: goals drawn, decks shuffled, opening hands dealt. noTimers = no clock of any kind. */
export function newGameMatch({ gameId, players, tournament, rng = secureRng, now = Date.now() }) {
  const [a, b] = players
  const match = {
    id: gameId,
    players: [a.userId, b.userId],
    usernames: [a.username, b.username],
    deckOrder: [a.deck, b.deck],
    stake: [0, 0],
    isChallenge: false,
    tournament: { ...tournament, async: true },
    noTimers: true,
    manualCommits: [0, 0],
    ending: false,
    startedAt: now,
    lastActivity: now
  }
  assignRandomGoals(match, rng)
  initHands(match, rng)
  return match
}

/** The stored copy of a game as a fresh runtime match (never shares memory with anything). */
export function restoreMatch(state) {
  const m = JSON.parse(JSON.stringify(state))
  m.ending = false
  m.noTimers = true
  m.deadline = null
  m.graceTimers = {}
  if (!Array.isArray(m.held)) m.held = [null, null]
  if (!Array.isArray(m.swapPick)) m.swapPick = [null, null]
  if (!Array.isArray(m.acted)) m.acted = [false, false]
  return m
}

/** What is stored for a game. */
export const stateOf = (match) => serializeMatch(match)

/**
 * Settles whatever step is complete, in the same order the live runtime does (reveal the round, then the discard / swap /
 * colour steps for as long as both players are done), without any sockets or timers. Returns { reveals, end }:
 * `reveals` are the public reveal payloads produced (seat-neutral: entries[0] is player 1's), `end` is the end-of-game
 * result when the game finished.
 */
export function resolvePending(match, rng = secureRng) {
  const reveals = []
  let end = null
  const timing = peekRevealTiming()
  const conclude = (revealedRound, entries, order, extra = {}) => {
    // Once the board is complete, players with a Silver card pick its colour before anything is scored.
    const colorPhase = enterColorPhase(match)
    end = colorPhase ? null : checkMatchEnd(match)
    // Advance before recording so the state clients receive already carries the NEXT round and phase.
    if (!end && !colorPhase) advanceRound(match)
    // `views` = each player's own view of the game right after this reveal (their hand and all). It is what lets a returning
    // player replay the game step by step, seeing the board as it was then, not as it is now. Server-side only: a client is
    // only ever sent ITS OWN entry (revealForSeat).
    const views = match.players.map(uid => publicMatchView(match, uid, { log: false }))
    reveals.push({ round: revealedRound, order, entries, steps: extra.steps || [], before: extra.before || null, timing, logSeq: (match.gameLog || []).length, views })
  }

  if (match.phase === 'play' && match.ready[0] && match.ready[1]) {
    const revealedRound = match.currentRound
    const r = revealPlacedCards(match)
    conclude(revealedRound, r.entries, r.order, { steps: r.steps, before: r.before })
  }
  for (let guard = 0; guard < 8 && !end; guard += 1) {
    if (match.phase === 'discard') {
      if (!resolveDiscardPhase(match)) break
      continue
    }
    if (match.phase === 'swap') {
      const res = resolveSwapPhase(match, rng)
      if (!res) break
      conclude(match.currentRound, res.entries, res.order, { steps: res.steps, before: res.before })
      continue
    }
    if (match.phase === 'color') {
      if (!resolveColorPhase(match)) break
      conclude(match.currentRound, [[], []], [])
      continue
    }
    break
  }
  return { reveals, end }
}

/**
 * One explicit play by player `idx`. action: 'commit' | 'discard' | 'swap' | 'swapSkip' | 'chooseColor'.
 * Returns the core's own refusal ({ ok: false, code, message }) or { ok: true, reveals, end }.
 */
export function applyPlay(match, idx, action, payload = {}, rng = secureRng) {
  switch (action) {
    case 'commit': {
      const check = checkCommit(match, idx, payload.round)
      if (!check.ok) return check
      markCommitted(match, idx)
      ;(match.manualCommits ||= [0, 0])[idx] += 1
      break
    }
    case 'discard': {
      const res = submitDiscard(match, idx, { cardIdxs: payload.cardIdxs })
      if (!res.ok) return res
      break
    }
    case 'swap': {
      const check = checkSwap(match, idx)
      if (!check.ok) return check
      const res = recordSwapChoice(match, idx, true, Number.isInteger(payload.cardIdx) ? payload.cardIdx : null, { requireCard: true })
      if (!res.ok) return res
      break
    }
    case 'swapSkip': {
      const res = recordSwapChoice(match, idx, false)
      if (!res.ok) return res
      break
    }
    case 'chooseColor': {
      const res = submitColor(match, idx, { color: payload.color })
      if (!res.ok) return res
      break
    }
    default:
      return bad('badAction', 'Unknown action.')
  }
  match.lastActivity = Date.now()
  return { ok: true, ...resolvePending(match, rng) }
}

/** A tentative placement (never stored): validated by the same core rules as the live game. */
export function applyTentative(match, idx, kind, payload = {}) {
  if (kind === 'place') return placeCard(match, idx, { cardIdx: payload.cardIdx, slot: payload.slot })
  if (kind === 'unplace') return unplaceSlot(match, idx, { slot: payload.slot })
  return bad('badAction', 'Unknown action.')
}

/** Puts a player's not-yet-committed placements back onto a restored match, keeping only ones that are still legal. */
export function overlayTentative(match, idx, placements) {
  if (!Array.isArray(placements) || !placements.length || match.phase !== 'play' || match.ready[idx]) return match
  match.placements[idx] = []
  for (const p of placements) {
    if (!p || !Number.isInteger(p.cardIdx) || !Number.isInteger(p.slot)) continue
    applyTentative(match, idx, 'place', { cardIdx: p.cardIdx, slot: p.slot })
  }
  return match
}

/* ═══ Part 2: small DB helpers ══════════════════════════════════════════════════════════════════════════════════ */

/** The database's clock, read NOW (clock_timestamp, not now(): now() is frozen at the start of the transaction). */
export async function dbNow(tx) {
  // Ask for the UTC wall-clock time as a plain `timestamp` (the same shape as every DateTime column), so the result is the true
  // instant whatever time zone the database session is set to, instead of relying on how a bare timestamptz is decoded.
  const rows = await tx.$queryRaw`SELECT (clock_timestamp() AT TIME ZONE 'UTC') AS now`
  const v = rows[0].now
  // A `timestamp` may come back as a Date (read as UTC) or an ISO string without an offset; treat both as UTC.
  return v instanceof Date ? v : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? v : `${v}Z`)
}

/** The row lock every change to a pairing starts with. */
export async function lockPairing(tx, tournamentMatchId) {
  const rows = await tx.$queryRaw`SELECT id FROM "OgGtoonTournamentMatch" WHERE id = ${tournamentMatchId} FOR UPDATE`
  return rows.length > 0
}

class CasConflict extends Error {
  constructor() { super('game version changed'); this.code = 'CAS_CONFLICT' }
}

async function roundLabelFor(tx, m) {
  if (m.stage === 'SWISS') return `Swiss Round ${m.roundNumber}`
  const count = await tx.ogGtoonTournamentMatch.count({ where: { roundId: m.roundId } })
  return bracketRoundLabel(count)
}

/** Writes a game row's new state if (and only if) nobody changed it since it was read. */
async function saveGame(tx, game, data) {
  const r = await tx.ogGtoonTournamentGame.updateMany({
    where: { id: game.id, version: game.version },
    data: { ...data, version: { increment: 1 } }
  })
  if (r.count !== 1) throw new CasConflict()
}

/* ═══ Part 3: creating the next game ════════════════════════════════════════════════════════════════════════════ */

/**
 * Creates the next game of a pairing when everything allows it. The caller already holds the pairing's row lock (this is
 * called from the Start press, the end of a game, and the cron/admin paths), so two callers can never both create one; the
 * partial unique index is the backstop.
 *
 *   created: true  -> { gameId, gameNumber, match }
 *   created: false -> reason: 'notEligible' | 'inactive' | 'exists' | 'notBothStarted' | 'decided' | 'tooLate' |
 *                              'deckProblem' | 'needsAdmin'
 *   decided: true  -> the pairing was decided on the spot (a game ended with too little time left for another)
 */
export async function ensureNextGameInTx(tx, tournamentMatchId, { now, rng = secureRng } = {}) {
  const m = await tx.ogGtoonTournamentMatch.findUnique({ where: { id: tournamentMatchId }, include: { tournament: true } })
  if (!m || m.lockedAt || m.status === 'BYE' || !m.asyncRules) return { created: false, reason: 'notEligible' }
  if (!ACTIVE_STATUSES.includes(m.tournament.status)) return { created: false, reason: 'inactive' }
  if (m.needsAdmin) return { created: false, reason: 'needsAdmin' }
  if (await tx.ogGtoonTournamentGame.findFirst({ where: { tournamentMatchId, status: 'ACTIVE' }, select: { id: true } })) {
    return { created: false, reason: 'exists' }
  }
  if (!m.readyAAt || !m.readyBAt) return { created: false, reason: 'notBothStarted' }

  const loaded = await loadSeriesGames(m, tx)
  const series = computeSeries({
    games: loaded.games, stage: m.stage, requiresWinner: m.requiresWinner,
    maxExtraGames: m.tournament.maxExtraGames, bestOf: m.bestOf || BEST_OF
  })
  if (series.decided) return { created: false, reason: 'decided' }
  if (series.needsAdmin) return { created: false, reason: 'needsAdmin' }

  const minPlayable = minPlayableMs(m.tournament.roundWindowHours)
  const base = m.baseDueAt || m.dueAt
  if (!mayStartNewGame(now, base, minPlayable)) {
    // Too little of the ORIGINAL round is left for another game. If games have been played the pairing is decided right
    // now (nothing is pending, so there is nothing to wait for); if none has, the deadline decision handles it.
    if (loaded.games.length || m.gamesCounted > 0) {
      const decided = await decideSeriesNowInTx(tx, { ...m, winsA: series.winsA, winsB: series.winsB, ties: series.ties, gamesCounted: series.gamesCounted }, loaded, { now, base, minPlayable })
      return { created: false, reason: 'tooLate', decided: decided.decided }
    }
    return { created: false, reason: 'tooLate', decided: false }
  }

  const [optIns, users] = await Promise.all([
    tx.ogGtoonTournamentOptIn.findMany({ where: { tournamentId: m.tournamentId, userId: { in: [m.playerAUserId, m.playerBUserId] } } }),
    tx.user.findMany({ where: { id: { in: [m.playerAUserId, m.playerBUserId] } }, select: { id: true, username: true, banned: true } })
  ])
  const optA = optIns.find(o => o.userId === m.playerAUserId)
  const optB = optIns.find(o => o.userId === m.playerBUserId)
  const userA = users.find(u => u.id === m.playerAUserId)
  const userB = users.find(u => u.id === m.playerBUserId)
  if (!optA || !optB || optA.disqualified || optB.disqualified || userA?.banned || userB?.banned) {
    return { created: false, reason: 'notEligible' }
  }

  // Both locked decks are re-checked at the moment the game is created (a card that has left a collection flags the deck).
  const [deckA, deckB] = await Promise.all([
    loadLockedDeckForGame(m.playerAUserId, optA.deckSnapshotJson, tx),
    loadLockedDeckForGame(m.playerBUserId, optB.deckSnapshotJson, tx)
  ])
  const broken = [!deckA.valid && 'A', !deckB.valid && 'B'].filter(Boolean)
  if (broken.length) {
    const side = broken.length === 2 ? 'BOTH' : broken[0]
    if (m.deckProblemSide !== side) await tx.ogGtoonTournamentMatch.update({ where: { id: m.id }, data: { deckProblemSide: side } })
    const names = (d) => [...d.missing, ...d.moved].map(p => d.names[p]).filter(Boolean)
    return { created: false, reason: 'deckProblem', side, problems: { A: names(deckA), B: names(deckB) } }
  }

  const agg = await tx.ogGtoonTournamentGame.aggregate({ where: { tournamentMatchId }, _max: { gameNumber: true } })
  const gameNumber = (agg._max.gameNumber || 0) + 1
  const gameId = randomUUID()
  const match = newGameMatch({
    gameId, rng, now: now.getTime(),
    players: [
      { userId: m.playerAUserId, username: userA.username, deck: deckA.deck },
      { userId: m.playerBUserId, username: userB.username, deck: deckB.deck }
    ],
    tournament: {
      matchId: m.id, tournamentId: m.tournamentId, name: m.tournament.name, stage: m.stage,
      label: await roundLabelFor(tx, m), bestOf: m.bestOf, gameNumber
    }
  })
  await tx.ogGtoonTournamentGame.create({ data: { id: gameId, tournamentMatchId, gameNumber, state: stateOf(match), reveals: [] } })
  await tx.ogGtoonTournamentMatch.update({
    where: { id: m.id },
    data: { ...(m.status === 'PENDING' ? { status: 'IN_PROGRESS' } : {}), deckProblemSide: null }
  })
  return { created: true, gameId, gameNumber, match }
}

/** Decides a pairing on the spot from its series, when nothing is pending and no new game may start (see ensureNextGameInTx). */
async function decideSeriesNowInTx(tx, m, loaded, { now, base, minPlayable }) {
  const d = decideAtDeadlineAsync(m, { now: now.getTime(), baseDueAt: base, minPlayable, scoreA: loaded.scoreA, scoreB: loaded.scoreB, hasGame: true, blocker: null })
  if (d.kind === 'NEEDS_ADMIN') {
    await tx.ogGtoonTournamentMatch.updateMany({ where: { id: m.id, lockedAt: null }, data: { needsAdmin: true, needsAdminReason: d.reason } })
    return { decided: false }
  }
  const ok = await lockMatchResult(tx, m, { outcome: d.outcome, resolution: d.resolution, winsA: d.winsA, winsB: d.winsB, now })
  return { decided: ok }
}

/* ═══ Part 4: Start ═════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A player presses Start. Sticky: it never expires. When both players have pressed, game 1 is created (neither needs to be
 * online). Refused once the deadline has passed or too little of the round is left for a game to be worth starting.
 * Returns { ok, ready: {A,B}, game?: { gameId, gameNumber } } or { ok: false, code, message }.
 */
export async function pressStart({ tournamentMatchId, userId, db = prisma, rng = secureRng }) {
  return db.$transaction(async (tx) => {
    if (!(await lockPairing(tx, tournamentMatchId))) return bad('badMatch', 'That tournament match could not be found.')
    const now = await dbNow(tx)
    const ctx = await getPlayContext(userId, tournamentMatchId, tx)
    if (!ctx.ok) return bad(ctx.code, ctx.message)
    const m = ctx.match
    if (!m.asyncRules) return bad('notAsync', 'This match uses the older rules.')
    if (m.dueAt && now >= m.dueAt) return bad('deadlinePassed', 'The time for this match has run out.')
    const minPlayable = minPlayableMs(ctx.tournament.roundWindowHours)
    if (!mayStartNewGame(now, m.baseDueAt || m.dueAt, minPlayable)) {
      return bad('tooLate', 'There is too little time left in this round to start a game. The match will be decided when time runs out.')
    }

    const field = ctx.side === 'A' ? 'readyAAt' : 'readyBAt'
    if (!m[field]) {
      await tx.ogGtoonTournamentMatch.update({ where: { id: m.id }, data: { [field]: now, ...(m.firstReadyAt ? {} : { firstReadyAt: now }) } })
    }
    const after = await tx.ogGtoonTournamentMatch.findUnique({ where: { id: m.id }, select: { readyAAt: true, readyBAt: true } })
    const out = { ok: true, ready: { A: !!after.readyAAt, B: !!after.readyBAt }, side: ctx.side, opponentId: ctx.opponentId }
    if (after.readyAAt && after.readyBAt) {
      const made = await ensureNextGameInTx(tx, m.id, { now, rng })
      if (made.created) out.game = { gameId: made.gameId, gameNumber: made.gameNumber }
      else if (made.reason === 'deckProblem') out.deckProblem = { side: made.side, problems: made.problems }
    }
    return out
  }, { timeout: 30000, maxWait: 10000 })
}

/** Takes a Start back. Only while the opponent has not pressed theirs and no game exists. */
export async function cancelStart({ tournamentMatchId, userId, db = prisma }) {
  return db.$transaction(async (tx) => {
    if (!(await lockPairing(tx, tournamentMatchId))) return bad('badMatch', 'That tournament match could not be found.')
    const ctx = await getPlayContext(userId, tournamentMatchId, tx)
    if (!ctx.ok) return bad(ctx.code, ctx.message)
    const m = ctx.match
    if (!m.asyncRules) return bad('notAsync', 'This match uses the older rules.')
    const oppReady = ctx.side === 'A' ? m.readyBAt : m.readyAAt
    const everPlayed = (m.gamesCounted || 0) > 0 || (await tx.ogGtoonTournamentGame.count({ where: { tournamentMatchId } })) > 0
    if (oppReady || everPlayed) return bad('cannotCancel', 'Your opponent has already pressed Start, so this match is on.')
    await tx.ogGtoonTournamentMatch.update({ where: { id: m.id }, data: { [ctx.side === 'A' ? 'readyAAt' : 'readyBAt']: null } })
    return { ok: true }
  })
}

/* ═══ Part 5: playing ═══════════════════════════════════════════════════════════════════════════════════════════ */

const lastSeq = (reveals) => (Array.isArray(reveals) && reveals.length ? reveals[reveals.length - 1].seq || reveals.length : 0)

/**
 * One explicit play ('commit' | 'discard' | 'swap' | 'swapSkip' | 'chooseColor') by `userId` on game `gameId`, atomically.
 * `tentative` = that player's not-yet-committed placements (held in memory by the socket layer, never stored).
 *
 * Returns { ok: false, code, message } (nothing changed) or
 *   { ok: true, match, game, newReveals, end, extended, dueAt, post }
 * where `post` tells the caller what to do AFTER the commit: { advance, nextGame, decided, deckProblem }.
 */
export async function playMove({ gameId, userId, action, payload = {}, tentative = null, db = prisma, rng = secureRng }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(tx => playMoveTx(tx, { gameId, userId, action, payload, tentative, rng }), { timeout: 30000, maxWait: 10000 })
    } catch (err) {
      // Somebody else changed the game between our read and our write. Start over from what is stored now; never re-apply
      // a mutated copy, because the pairing may have been closed in the meantime.
      if (err?.code === 'CAS_CONFLICT') continue
      throw err
    }
  }
  return bad('busy', 'The game is busy. Try again in a moment.')
}

async function playMoveTx(tx, { gameId, userId, action, payload, tentative, rng }) {
  const head = await tx.ogGtoonTournamentGame.findUnique({ where: { id: gameId }, select: { tournamentMatchId: true } })
  if (!head) return bad('badGame', 'That game could not be found.')
  await lockPairing(tx, head.tournamentMatchId)
  const now = await dbNow(tx)

  const ctx = await getPlayContext(userId, head.tournamentMatchId, tx)
  if (!ctx.ok) return bad(ctx.code, ctx.message)
  const m = ctx.match
  if (!m.asyncRules) return bad('notAsync', 'This game uses the older rules.')
  const game = await tx.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
  if (!game || game.status !== 'ACTIVE') return bad('gameClosed', 'This game is over.')
  if (m.dueAt && now >= m.dueAt) return bad('deadlinePassed', 'The time for this match has run out.')
  const me = await tx.user.findUnique({ where: { id: userId }, select: { banned: true, active: true } })
  if (!me || me.banned || me.active === false) return bad('forbidden', 'You cannot play right now.')

  const match = restoreMatch(game.state)
  const idx = match.players.indexOf(userId)
  if (idx === -1) return bad('notYours', 'You are not a player in that game.')
  overlayTentative(match, idx, tentative)

  const res = applyPlay(match, idx, action, payload, rng)
  if (!res.ok) return res

  const seq0 = lastSeq(game.reveals)
  const newReveals = res.reveals.map((r, i) => ({ ...r, seq: seq0 + i + 1 }))
  const ext = extendOnPlay({ dueAt: m.dueAt, now, extensions: m.extensions })

  const pairingData = {
    lastPlayAt: now, lastPlayUserId: userId,
    ...(m.status === 'PENDING' ? { status: 'IN_PROGRESS' } : {}),
    ...(ext.extended ? { dueAt: ext.dueAt, extensions: ext.extensions } : {})
  }
  const post = { advance: false, nextGame: null, decided: false, deckProblem: null }

  // The pairing's own bookkeeping first: finishing a game may settle (and complete) the pairing, and a stale status written
  // after that would undo it.
  await tx.ogGtoonTournamentMatch.update({ where: { id: m.id }, data: pairingData })
  if (res.end) {
    match.ending = true
    await finishGameInTx(tx, { game, match, end: res.end, newReveals, now, post })
  } else {
    await saveGame(tx, game, { state: stateOf(match), reveals: [...(Array.isArray(game.reveals) ? game.reveals : []), ...newReveals], lastPlayAt: now })
  }

  return {
    ok: true, match, game: { id: game.id, gameNumber: game.gameNumber, tournamentMatchId: game.tournamentMatchId },
    newReveals, end: res.end, extended: ext.extended, dueAt: ext.dueAt, extensions: ext.extensions, idx, post
  }
}

/**
 * The end of a game, atomically: the finished game is written to OgGtoonMatch (what the leaderboards, Meta and series scoring
 * read), the game row becomes ENDED, the series is settled, and then either the next game is created or - when too little of
 * the round is left for one - the pairing is decided from the series. Fills in `post`.
 */
async function finishGameInTx(tx, { game, match, end, newReveals, now, post }) {
  const [p1, p2] = match.players
  const winnerUserId = end.winnerIdx == null ? null : match.players[end.winnerIdx]
  const result = {
    outcome: end.outcome, winnerUserId, player1Score: end.player1Score ?? 0, player2Score: end.player2Score ?? 0,
    endReason: 'natural', winReason: end.winReason || null, effectsResolved: end.effectsResolved || []
  }
  match.result = result

  await tx.ogGtoonMatch.create({
    data: {
      id: match.id, player1UserId: p1, player2UserId: p2, player1Points: 0, player2Points: 0,
      player1DeckSnapshot: match.deckOrder[0], player2DeckSnapshot: match.deckOrder[1],
      player1GoalColor: match.goalColor[0], player2GoalColor: match.goalColor[1],
      player1SwapUsed: match.swapUsed[0], player2SwapUsed: match.swapUsed[1],
      player1Score: result.player1Score, player2Score: result.player2Score,
      roundLog: buildRoundLog(match, result.effectsResolved), isChallenge: false,
      player1ManualCommits: match.manualCommits?.[0] ?? 0, player2ManualCommits: match.manualCommits?.[1] ?? 0,
      winnerUserId, outcome: end.outcome, winReason: result.winReason,
      startedAt: new Date(match.startedAt), endedAt: now, whoLeftUserId: null,
      tournamentMatchId: game.tournamentMatchId
    }
  })
  await saveGame(tx, game, {
    state: stateOf(match), reveals: [...(Array.isArray(game.reveals) ? game.reveals : []), ...newReveals],
    status: 'ENDED', endedAt: now, lastPlayAt: now
  })

  const settled = await settleMatchInTx(tx, game.tournamentMatchId, { now })
  post.advance = true
  if (settled.decided) {
    post.decided = true
    return
  }
  if (settled.locked || settled.inactive) return
  const next = await ensureNextGameInTx(tx, game.tournamentMatchId, { now })
  if (next.created) post.nextGame = { gameId: next.gameId, gameNumber: next.gameNumber }
  else if (next.decided) post.decided = true
  else if (next.reason === 'deckProblem') post.deckProblem = { side: next.side, problems: next.problems }
}

/* ═══ Part 6: what a player sees ════════════════════════════════════════════════════════════════════════════════ */

/**
 * Everything a client needs for one game from `uid`'s point of view: the normal per-player match view plus the async
 * extras (the deadline, who the game is waiting on, the result). `tentative` = that player's uncommitted placements.
 */
export function buildGameView({ game, pairing, uid, tentative = null, now = new Date() }) {
  const match = restoreMatch(game.state)
  const idx = match.players.indexOf(uid)
  if (game.status === 'ACTIVE') overlayTentative(match, idx, tentative)
  else match.ending = true
  const view = publicMatchView(match, uid)
  const blocker = game.status === 'ACTIVE' ? pendingStepBlocker(match) : null
  const seen = idx === 0 ? game.seenA : game.seenB
  const introSeen = idx === 0 ? game.introSeenA : game.introSeenB
  const started = (match.revealed?.[0]?.length || 0) + (match.revealed?.[1]?.length || 0) > 0 || match.currentRound > 1
  return {
    ...view,
    async: true,
    gameId: game.id,
    gameNumber: game.gameNumber,
    status: game.status,
    // The clocks: dueAt is the (possibly extended) deadline, serverNow lets the client correct for its own clock.
    deadline: pairing ? { dueAt: pairing.dueAt, baseDueAt: pairing.baseDueAt || pairing.dueAt, extensions: pairing.extensions || 0, serverNow: now } : null,
    waitingOn: blocker ? (blocker.blockerIdx === idx ? 'you' : 'opponent') : null,
    lastPlayAt: game.lastPlayAt || null,
    introPending: !introSeen && !started && game.status === 'ACTIVE',
    seenSeq: seen,
    ...(match.result ? { over: true, outcome: match.result.outcome, won: match.result.winnerUserId === uid, endReason: match.result.endReason, player1Score: match.result.player1Score, player2Score: match.result.player2Score, effectsResolved: match.result.effectsResolved || [] } : {}),
    ...(game.status === 'CLOSED' ? { over: true, closed: true, closedResolution: pairing?.resolution || null } : {})
  }
}

/** A player opens a game (any status): returns the view plus the reveals they have not watched yet. */
export async function openGame({ gameId, userId, tentative = null, db = prisma }) {
  const game = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
  if (!game) return bad('badGame', 'That game could not be found.')
  const pairing = await db.ogGtoonTournamentMatch.findUnique({
    where: { id: game.tournamentMatchId },
    select: {
      id: true, playerAUserId: true, playerBUserId: true, dueAt: true, baseDueAt: true, extensions: true, resolution: true,
      lockedAt: true, tournamentId: true, status: true, asyncRules: true
    }
  })
  if (!pairing || (pairing.playerAUserId !== userId && pairing.playerBUserId !== userId)) return bad('notYours', 'You are not a player in that game.')
  const idx = pairing.playerAUserId === userId ? 0 : 1
  const seen = idx === 0 ? game.seenA : game.seenB
  const reveals = (Array.isArray(game.reveals) ? game.reveals : []).filter(r => r.seq > seen)
  const next = game.status === 'ENDED' || game.status === 'CLOSED'
    ? await db.ogGtoonTournamentGame.findFirst({ where: { tournamentMatchId: game.tournamentMatchId, status: 'ACTIVE' }, select: { id: true, gameNumber: true } })
    : null
  return {
    ok: true, idx, game, pairing,
    view: buildGameView({ game, pairing, uid: userId, tentative, now: new Date() }),
    unseen: reveals, nextGame: next
  }
}

/** Advances a player's replay cursor (never backwards). */
export async function markSeen({ gameId, userId, seq, db = prisma }) {
  const game = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId }, select: { tournamentMatch: { select: { playerAUserId: true, playerBUserId: true } } } })
  if (!game) return false
  const side = game.tournamentMatch.playerAUserId === userId ? 'A' : game.tournamentMatch.playerBUserId === userId ? 'B' : null
  if (!side || !Number.isInteger(seq) || seq < 0) return false
  const field = side === 'A' ? 'seenA' : 'seenB'
  await db.ogGtoonTournamentGame.updateMany({ where: { id: gameId, [field]: { lt: seq } }, data: { [field]: seq } })
  return true
}

/** A player dismissed the goal-card intro for this game. */
export async function markIntroSeen({ gameId, userId, db = prisma }) {
  const game = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId }, select: { tournamentMatch: { select: { playerAUserId: true, playerBUserId: true } } } })
  if (!game) return false
  const side = game.tournamentMatch.playerAUserId === userId ? 'A' : game.tournamentMatch.playerBUserId === userId ? 'B' : null
  if (!side) return false
  await db.ogGtoonTournamentGame.updateMany({ where: { id: gameId }, data: side === 'A' ? { introSeenA: true } : { introSeenB: true } })
  return true
}

/** The id of the game currently being played for a pairing, or null. */
export async function activeGameId(tournamentMatchId, db = prisma) {
  const g = await db.ogGtoonTournamentGame.findFirst({ where: { tournamentMatchId, status: 'ACTIVE' }, select: { id: true, gameNumber: true } })
  return g || null
}

/* ═══ Part 7: the deadline ══════════════════════════════════════════════════════════════════════════════════════ */

/** Why a pairing was decided, in words for the players (used in the Discord message). */
export function describeDecision(d, { blocker, hasGame, deckProblem }) {
  if (d.resolution === 'WALKOVER') return 'walkover: the other player did not press Start in time'
  if (deckProblem === 'A' || deckProblem === 'B') return 'a card in a locked deck was no longer in the collection, so the next game could not start'
  if (blocker) return 'the other player did not make their move before time ran out'
  if (!hasGame) return d.outcome === 'TIE' ? 'nobody played before time ran out' : 'nobody played before time ran out, so the better seed advances'
  return 'time ran out'
}

/**
 * Decides an async pairing whose deadline has passed, atomically: under the pairing's row lock, with "now" read from the
 * database after the lock is held. A play that was waiting on the lock when the job started has already been applied (and
 * may have extended the deadline) by the time this reads the pairing, so the two can never disagree about which came first.
 * Closes the running game as part of locking the result (lockMatchResult).
 *
 *   { found: false }
 *   { decided: false, reason: 'notEligible' | 'inactive' | 'notDue' (with dueAt) | 'needsAdmin' }
 *   { decided: true, outcome, resolution, why, tournamentId, matchId }
 */
export async function decideAndLock(matchId, { db = prisma } = {}) {
  return db.$transaction(async (tx) => {
    if (!(await lockPairing(tx, matchId))) return { found: false }
    const now = await dbNow(tx)
    const m = await tx.ogGtoonTournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: true } })
    if (!m || m.lockedAt || m.status === 'BYE' || !m.asyncRules) return { found: true, decided: false, reason: 'notEligible' }
    if (!ACTIVE_STATUSES.includes(m.tournament.status)) return { found: true, decided: false, reason: 'inactive' }
    if (m.needsAdmin) return { found: true, decided: false, reason: 'needsAdmin' }
    if (!m.dueAt || m.dueAt.getTime() > now.getTime()) return { found: true, decided: false, reason: 'notDue', dueAt: m.dueAt }

    const game = await tx.ogGtoonTournamentGame.findFirst({ where: { tournamentMatchId: matchId, status: 'ACTIVE' } })
    let blocker = null
    if (game) {
      const b = pendingStepBlocker(restoreMatch(game.state))
      if (b) blocker = b.blockerIdx === 0 ? 'A' : 'B'
    }
    const loaded = await loadSeriesGames(m, tx)
    const hasGame = !!game || loaded.games.length > 0 || (await tx.ogGtoonTournamentGame.count({ where: { tournamentMatchId: matchId } })) > 0
    const deckProblem = game ? null : (m.deckProblemSide || null)
    const d = decideAtDeadlineAsync(m, {
      now: now.getTime(), baseDueAt: m.baseDueAt || m.dueAt, minPlayable: minPlayableMs(m.tournament.roundWindowHours),
      scoreA: loaded.scoreA, scoreB: loaded.scoreB, hasGame, blocker, deckProblem
    })
    if (d.kind === 'NEEDS_ADMIN') {
      await tx.ogGtoonTournamentMatch.updateMany({ where: { id: matchId, lockedAt: null }, data: { needsAdmin: true, needsAdminReason: d.reason } })
      return { found: true, decided: false, reason: 'needsAdmin', needsAdminReason: d.reason }
    }
    const ok = await lockMatchResult(tx, m, { outcome: d.outcome, resolution: d.resolution, winsA: d.winsA, winsB: d.winsB, now })
    if (!ok) return { found: true, decided: false, reason: 'notEligible' }
    return {
      found: true, decided: true, outcome: d.outcome, resolution: d.resolution, tournamentId: m.tournamentId, matchId,
      why: describeDecision(d, { blocker, hasGame, deckProblem })
    }
  }, { timeout: 30000, maxWait: 10000 })
}

/** Closes every running async game of a tournament (it was cancelled): they never count. */
export async function closeTournamentGames(tournamentId, { db = prisma, now = new Date() } = {}) {
  const r = await db.ogGtoonTournamentGame.updateMany({
    where: { status: 'ACTIVE', tournamentMatch: { tournamentId } }, data: { status: 'CLOSED', endedAt: now }
  })
  return r.count
}

/**
 * What the Tournaments panel needs to know about a pairing's running game from one player's point of view: its id, whose move
 * it is, and when anybody last played. Null when no game is running.
 */
export async function gameSummaryFor(tournamentMatchId, uid, { db = prisma } = {}) {
  const game = await db.ogGtoonTournamentGame.findFirst({ where: { tournamentMatchId, status: 'ACTIVE' } })
  if (!game) return null
  const match = restoreMatch(game.state)
  const idx = match.players.indexOf(uid)
  const b = pendingStepBlocker(match)
  return {
    gameId: game.id, gameNumber: game.gameNumber, lastPlayAt: game.lastPlayAt || null,
    waitingOn: b ? (b.blockerIdx === idx ? 'you' : 'opponent') : null,
    // New reveals this player has not watched yet (a returning player is shown them on the board).
    unseenReveals: Math.max(0, lastSeq(game.reveals) - (idx === 0 ? game.seenA : game.seenB))
  }
}

/**
 * Whether player `idx` still has something to do in the game's CURRENT step (placing and committing, discarding, deciding on the
 * swap, picking a Silver colour). A step the game completed for them (nothing to swap, no Silver card) is not something to do.
 * Used to decide whether a "your move" message is still true by the time it would be sent.
 */
export function needsToAct(match, idx) {
  if (!match || match.ending || idx < 0) return false
  if (match.phase === 'discard') return !match.discardReady?.[idx]
  if (match.phase === 'swap') return !match.swapReady?.[idx]
  if (match.phase === 'color') return !match.colorReady?.[idx]
  return !match.ready?.[idx]
}
