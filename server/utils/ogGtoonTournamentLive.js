// server/utils/ogGtoonTournamentLive.js
//
// The small, DB-light half of OG gToons tournaments that the socket process (ogGtoonsSocket.js and
// ogGtoonsTournamentSocket.js) also needs: locked decks, ready-up, marking a pairing as having a
// live game, and scoring a pairing from its finished games. It deliberately imports only Prisma,
// the pure rules (tournamentCore.js) and the card-snapshot helper — never Discord, the prize code
// or the orchestration in ogGtoonTournament.js — so the shared socket event loop stays lean.
// Everything heavier (advancing rounds, DMs, prizes) is queued for the cron worker.
//
// Imports are relative (not '@/...') because the socket server is a plain `node` process.
import { prisma } from '../prisma.js'
import { toSnapshotCard } from './ogGtoonMatchCore.js'
import { checkLockedDeck, computeSeries, BEST_OF } from './tournamentCore.js'

/** A ready-up counts for this long; after that the player has to press Play again. */
export const READY_TTL_MS = 30 * 60 * 1000

export const ACTIVE_STATUSES = ['SWISS_ACTIVE', 'BRACKET_ACTIVE']

export const isFresh = (ts, now = Date.now()) => !!ts && now - new Date(ts).getTime() < READY_TTL_MS

/* ── Locked deck ─────────────────────────────────────────────────────────────────────────── */

/**
 * Locks one of the player's decks for a tournament: verifies it is a valid 12-card OG gToons deck
 * they own (12 distinct cards, positions 0-11) and pins the specific copies. Returns
 * [{ position, ctoonId, userCtoonId, lockedAt }] or { error } when the deck cannot be locked.
 */
export async function lockTournamentDeck(userId, deckId, db = prisma) {
  if (!deckId || typeof deckId !== 'string') return { error: 'Pick one of your decks.' }
  const deck = await db.ogGtoonDeck.findUnique({
    where: { id: deckId },
    include: { cards: { include: { ctoon: { select: { id: true, name: true, isOgGtoon: true } } }, orderBy: { position: 'asc' } } }
  })
  if (!deck || deck.userId !== userId) return { error: 'That deck could not be found.' }
  if (deck.cards.length !== 12) return { error: 'That deck needs exactly 12 cards.' }

  const positions = new Set()
  for (const c of deck.cards) {
    if (c.position < 0 || c.position > 11 || positions.has(c.position)) return { error: 'That deck is not a valid 12-card gToons deck.' }
    positions.add(c.position)
    if (!c.ctoon?.isOgGtoon) return { error: 'That deck contains a card that is not a gToon.' }
  }
  if (new Set(deck.cards.map(c => c.ctoonId)).size !== 12) return { error: 'A tournament deck needs 12 different cards.' }

  const copies = await db.userCtoon.findMany({
    where: { userId, ctoonId: { in: deck.cards.map(c => c.ctoonId) }, burnedAt: null },
    select: { id: true, ctoonId: true },
    orderBy: { createdAt: 'asc' }
  })
  const copyByCtoon = new Map()
  for (const cp of copies) if (!copyByCtoon.has(cp.ctoonId)) copyByCtoon.set(cp.ctoonId, cp.id)

  const lockedAt = new Date().toISOString()
  const snapshot = []
  for (const c of deck.cards) {
    const userCtoonId = copyByCtoon.get(c.ctoonId)
    if (!userCtoonId) return { error: `You no longer own ${c.ctoon?.name || 'one of the cards'} in that deck.` }
    snapshot.push({ position: c.position, ctoonId: c.ctoonId, userCtoonId, lockedAt })
  }
  return { snapshot }
}

/**
 * Re-checks a locked deck against what the player owns now and, when it is intact, builds the
 * ordered 12-card game snapshot from LIVE card data (so an admin fix to a broken effect applies).
 * A slot is flagged when its copy is gone, burned, owned by someone else, or has changed hands at
 * all since it was locked (lending a card between games is exactly what that catches).
 *
 * Returns { valid, missing: [position], moved: [position], deck, names: {position: name} }.
 */
export async function loadLockedDeckForGame(userId, snapshot, db = prisma) {
  if (!Array.isArray(snapshot) || snapshot.length !== 12) return { valid: false, missing: [], moved: [], deck: null, names: {} }
  const ids = snapshot.map(s => s.userCtoonId)
  const rows = await db.userCtoon.findMany({ where: { id: { in: ids } }, include: { ctoon: true } })
  const byId = new Map(rows.map(r => [r.id, r]))
  const owned = new Map(rows.map(r => [r.id, { userId: r.userId, ctoonId: r.ctoonId, burnedAt: r.burnedAt }]))

  const { missing } = checkLockedDeck(snapshot, userId, owned)

  const earliest = snapshot.reduce((min, s) => (s.lockedAt && (!min || s.lockedAt < min) ? s.lockedAt : min), null)
  const moved = []
  if (earliest) {
    const logs = await db.ctoonOwnerLog.findMany({
      where: { userCtoonId: { in: ids }, createdAt: { gt: new Date(earliest) } },
      select: { userCtoonId: true, createdAt: true }
    })
    const slotByCopy = new Map(snapshot.map(s => [s.userCtoonId, s]))
    for (const log of logs) {
      const slot = slotByCopy.get(log.userCtoonId)
      if (slot?.lockedAt && log.createdAt > new Date(slot.lockedAt) && !missing.includes(slot.position) && !moved.includes(slot.position)) {
        moved.push(slot.position)
      }
    }
  }

  const names = {}
  for (const s of snapshot) names[s.position] = byId.get(s.userCtoonId)?.ctoon?.name || null

  const stillGtoon = snapshot.every(s => byId.get(s.userCtoonId)?.ctoon?.isOgGtoon)
  const valid = missing.length === 0 && moved.length === 0 && stillGtoon
  let deck = null
  if (valid) {
    deck = new Array(12).fill(null)
    for (const s of snapshot) deck[s.position] = toSnapshotCard(byId.get(s.userCtoonId).ctoon, s.position)
    if (deck.some(c => !c)) deck = null
  }
  return { valid: valid && !!deck, missing, moved, deck, names }
}

/* ── Series scoring ──────────────────────────────────────────────────────────────────────── */

/** The finished games of one pairing, oldest first, as 'A' | 'B' | 'TIE', plus voids and scores. */
export async function loadSeriesGames(match, db = prisma) {
  const rows = await db.ogGtoonMatch.findMany({
    where: { tournamentMatchId: match.id, endedAt: { not: null } },
    orderBy: { startedAt: 'asc' },
    select: { id: true, outcome: true, winnerUserId: true, player1UserId: true, player1Score: true, player2Score: true }
  })
  const games = []
  let voided = 0
  let scoreA = 0
  let scoreB = 0
  for (const r of rows) {
    if (r.outcome === 'INCOMPLETE') { voided += 1; continue }
    if (r.outcome === 'TIE' || !r.winnerUserId) games.push('TIE')
    else games.push(r.winnerUserId === match.playerAUserId ? 'A' : r.winnerUserId === match.playerBUserId ? 'B' : 'TIE')
    const aIsP1 = r.player1UserId === match.playerAUserId
    scoreA += aIsP1 ? r.player1Score : r.player2Score
    scoreB += aIsP1 ? r.player2Score : r.player1Score
  }
  return { games, voided, scoreA, scoreB }
}

/** Series score straight from the games, without writing anything (used to render the UI). */
export async function readSeries(match, tournament, db = prisma) {
  const { games, voided } = await loadSeriesGames(match, db)
  const s = computeSeries({
    games, stage: match.stage, requiresWinner: match.requiresWinner,
    maxExtraGames: tournament?.maxExtraGames ?? 4, bestOf: match.bestOf || BEST_OF
  })
  return { ...s, voided }
}

/** Voided games allowed in one series before an admin has to step in. */
export const MAX_VOIDED_GAMES = 2

/**
 * Scores a pairing from its finished games and, once the series is decided, locks it. Idempotent
 * and safe to call from anywhere (a row lock serialises concurrent callers). A pairing that is
 * already locked (forfeit, walkover, deadline, admin) is never touched: `lockedAt` is
 * authoritative, so a game that finishes late cannot overturn an admin's or a deadline's decision.
 */
export async function settleMatchFromGames(matchId, { now = new Date(), db = prisma } = {}) {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT "lockedAt", status FROM "OgGtoonTournamentMatch" WHERE id = ${matchId} FOR UPDATE`
    if (!locked.length) return { found: false }
    if (locked[0].lockedAt || locked[0].status === 'BYE') return { found: true, locked: true, changed: false }

    const match = await tx.ogGtoonTournamentMatch.findUnique({
      where: { id: matchId },
      include: { tournament: { select: { id: true, status: true, maxExtraGames: true } } }
    })
    if (!ACTIVE_STATUSES.includes(match.tournament.status)) return { found: true, locked: false, changed: false, inactive: true }

    const { games, voided } = await loadSeriesGames(match, tx)
    const s = computeSeries({
      games, stage: match.stage, requiresWinner: match.requiresWinner,
      maxExtraGames: match.tournament.maxExtraGames, bestOf: match.bestOf || BEST_OF
    })

    const data = {
      winsA: s.winsA, winsB: s.winsB, ties: s.ties, gamesCounted: s.gamesCounted,
      extraGamesCounted: s.extraGamesCounted, voidedGames: voided
    }
    if (s.gamesCounted > 0 && match.status === 'PENDING') data.status = 'IN_PROGRESS'

    const tooManyVoids = voided > MAX_VOIDED_GAMES
    if (s.needsAdmin || (tooManyVoids && !s.decided)) {
      data.needsAdmin = true
      data.needsAdminReason = s.needsAdminReason || 'Too many voided games'
    }

    if (s.decided) {
      Object.assign(data, {
        status: 'COMPLETE',
        outcome: s.outcome,
        winnerUserId: s.winnerSide === 'A' ? match.playerAUserId : s.winnerSide === 'B' ? match.playerBUserId : null,
        resolution: 'PLAYED',
        needsAdmin: false,
        needsAdminReason: null,
        lockedAt: now,
        completedAt: now
      })
    }
    await tx.ogGtoonTournamentMatch.update({ where: { id: matchId }, data })
    return { found: true, locked: false, changed: true, decided: !!s.decided, series: s }
  })
}

/* ── Play context, ready-up, live marker ─────────────────────────────────────────────────── */

/**
 * Everything a "may this user play this pairing right now?" decision needs. Returns
 * { ok: true, match, side, opponentId, tournament, optIn } or { ok: false, code, message }.
 */
export async function getPlayContext(userId, tournamentMatchId, db = prisma) {
  if (typeof tournamentMatchId !== 'string' || !tournamentMatchId) return { ok: false, code: 'badMatch', message: 'That tournament match could not be found.' }
  const match = await db.ogGtoonTournamentMatch.findUnique({
    where: { id: tournamentMatchId },
    include: { tournament: true }
  })
  if (!match) return { ok: false, code: 'badMatch', message: 'That tournament match could not be found.' }
  const side = match.playerAUserId === userId ? 'A' : match.playerBUserId === userId ? 'B' : null
  if (!side || match.status === 'BYE' || match.playerAUserId === match.playerBUserId) {
    return { ok: false, code: 'notYours', message: 'You are not a player in that match.' }
  }
  if (!ACTIVE_STATUSES.includes(match.tournament.status)) return { ok: false, code: 'inactive', message: 'That tournament is not running.' }
  if (match.lockedAt || match.status === 'COMPLETE') return { ok: false, code: 'finished', message: 'That match has already been decided.' }
  if (match.needsAdmin) return { ok: false, code: 'needsAdmin', message: 'This match is waiting for an admin decision.' }
  const opponentId = side === 'A' ? match.playerBUserId : match.playerAUserId
  const optIns = await db.ogGtoonTournamentOptIn.findMany({
    where: { tournamentId: match.tournamentId, userId: { in: [userId, opponentId] } }
  })
  const optIn = optIns.find(o => o.userId === userId)
  const oppOptIn = optIns.find(o => o.userId === opponentId)
  if (!optIn || !optIn.isActive || optIn.disqualified) return { ok: false, code: 'disqualified', message: 'You are not an active entrant in this tournament.' }
  return { ok: true, match, side, opponentId, tournament: match.tournament, optIn, oppOptIn }
}

export async function setReady(match, side, now = new Date(), db = prisma) {
  const field = side === 'A' ? 'readyAAt' : 'readyBAt'
  const data = { [field]: now }
  if (!match.firstReadyAt) data.firstReadyAt = now
  await db.ogGtoonTournamentMatch.updateMany({ where: { id: match.id, lockedAt: null }, data })
}

export async function clearReady(matchId, side, db = prisma) {
  await db.ogGtoonTournamentMatch.updateMany({
    where: { id: matchId, lockedAt: null },
    data: { [side === 'A' ? 'readyAAt' : 'readyBAt']: null }
  })
}

/**
 * Claims the pairing for a live game. Returns false (and writes nothing) if another game is
 * already live on it or it was just decided. Consumes both ready-ups.
 */
export async function markLive(matchId, liveMatchId, db = prisma) {
  const claimed = await db.ogGtoonTournamentMatch.updateMany({
    where: { id: matchId, lockedAt: null, liveMatchId: null, needsAdmin: false },
    data: { liveMatchId, liveStartedAt: new Date(), status: 'IN_PROGRESS', readyAAt: null, readyBAt: null }
  })
  return claimed.count === 1
}

export async function clearLive(matchId, liveMatchId, db = prisma) {
  await db.ogGtoonTournamentMatch.updateMany({ where: { id: matchId, liveMatchId }, data: { liveMatchId: null, liveStartedAt: null } })
}

/**
 * A live marker older than a match can last (30 min sweep + slack) belongs to a game that was lost
 * (crash with nothing to restore). Clears it so the pairing can be played or forfeited again.
 */
export const LIVE_STALE_MS = 50 * 60 * 1000
export async function clearStaleLive(db = prisma, now = new Date()) {
  const cutoff = new Date(now.getTime() - LIVE_STALE_MS)
  const r = await db.ogGtoonTournamentMatch.updateMany({
    where: { liveMatchId: { not: null }, liveStartedAt: { lt: cutoff } },
    data: { liveMatchId: null, liveStartedAt: null }
  })
  return r.count
}

/** Hands a pairing to the admin queue (e.g. a game result that could not be saved). */
export async function flagNeedsAdmin(matchId, reason, db = prisma) {
  await db.ogGtoonTournamentMatch.updateMany({
    where: { id: matchId, lockedAt: null }, data: { needsAdmin: true, needsAdminReason: String(reason).slice(0, 300) }
  })
}

/** True when this pairing has been decided (or its tournament stopped) while a game was still live. */
export async function isPairingClosed(matchId, db = prisma) {
  const m = await db.ogGtoonTournamentMatch.findUnique({
    where: { id: matchId },
    select: { lockedAt: true, tournament: { select: { status: true } } }
  })
  return !m || !!m.lockedAt || !ACTIVE_STATUSES.includes(m.tournament.status)
}
