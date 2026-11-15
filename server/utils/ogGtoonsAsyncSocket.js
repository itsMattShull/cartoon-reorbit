// server/utils/ogGtoonsAsyncSocket.js
//
// Socket side of async + live tournament games (see ogGtoonTournamentGames.js for the rules and the database work). A
// player OPENS a game, which subscribes their socket to it; both players on the board at once is simply live play, and a
// player who comes back hours later is sent the current state plus the reveals they have not watched yet.
//
// ── What is different from the live-only runtime (ogGtoonsSocket.js), on purpose ────────────────────────────────
//   * Its own events (`oggtoons:async:*`), always carrying the game id and routed by it. Nothing here goes through
//     matchByUser / reattach, so an async board can never be pulled into (or pull a socket into) a casual match,
//     practice game or the tutorial, and a player in a casual match can still open their tournament game.
//   * Leaving the board or a dropped connection NEVER forfeits: closing is just unsubscribing. There are no phase timers,
//     no auto-play, no idle sweep, and nothing is mirrored to Redis (the database row is the game).
//   * Every acting user comes from the session, never the payload. The game id picks the game, and the user must be one
//     of its two players (re-checked inside the move's transaction against the pairing, the entrant and the tournament).
//   * A player's hand and placements are only ever sent to that player: views are built and emitted one socket at a time.
//   * Tentative placing (place / unplace) is held in memory and never written; only a play (commit / discard / swap /
//     colour) is persisted. A server restart therefore loses uncommitted placements, nothing else.
//   * Heavier work (advancing rounds, DMs) is queued for the cron worker, never done here.
import { prisma as db } from '../prisma.js'
import { getOgGtoonsConfig } from './ogGtoonsConfig.js'
import { enqueueOgTournamentJob } from './queues.js'
import {
  openGame, playMove, markSeen, markIntroSeen, buildGameView, restoreMatch, applyTentative, overlayTentative
} from './ogGtoonTournamentGames.js'
import { pushTournamentState } from './ogGtoonsTournamentSocket.js'

const room = (gameId) => `oggtoons:agame:${gameId}`
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64

/** gameId -> Map(socketId -> { uid }) : who has the board open right now. */
const watchers = new Map()
/** `${gameId}:${userId}` -> [{ slot, cardIdx }] : placements not yet committed (memory only). */
const tentative = new Map()
const tentKey = (gameId, uid) => `${gameId}:${uid}`

/** Promise-chain mutex per game: actions on one game are applied strictly one after another. */
const chains = new Map()
function withGameLock(gameId, fn) {
  const prev = chains.get(gameId) || Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  chains.set(gameId, next)
  next.catch(() => {}).finally(() => { if (chains.get(gameId) === next) chains.delete(gameId) })
  return next
}

/** A tiny per-socket limiter so a script cannot hammer a game (a human needs a few events a second at most). */
function limiter(socket, key, max, windowMs) {
  const bag = (socket.data.ogAsyncRate ||= {})
  const now = Date.now()
  const b = (bag[key] ||= { n: 0, at: now })
  if (now - b.at > windowMs) { b.n = 0; b.at = now }
  b.n += 1
  return b.n <= max
}

export function registerOgGtoonsAsync(io, socket, { resolveSocketUser, EV, userRoom }) {
  const err = (code, message, extra = {}) => socket.emit(EV('error'), { code, message, ...extra })

  /** The signed-in user. Unlike the live runtime's auth() this NEVER reattaches the socket to a casual match. */
  const authAsync = async () => {
    const user = await resolveSocketUser(socket)
    if (!user) { err('unauth', 'Please sign in again to keep playing.'); return null }
    socket.join(userRoom(user.id))
    socket.data.ogAsyncUid = user.id
    return user
  }

  const gate = async () => {
    const cfg = await getOgGtoonsConfig()
    if (!cfg.gameEnabled || !cfg.tournamentsEnabled) { err('tournamentsDisabled', 'Tournament play is currently unavailable.'); return false }
    return true
  }

  const emitTo = (socketId, event, payload) => io.local.to(socketId).emit(EV(event), payload)
  const boardUsers = (gameId) => new Set([...(watchers.get(gameId)?.values() || [])].map(w => w.uid))

  async function loadBundle(gameId) {
    const game = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
    if (!game) return null
    const pairing = await db.ogGtoonTournamentMatch.findUnique({
      where: { id: game.tournamentMatchId },
      select: { id: true, playerAUserId: true, playerBUserId: true, dueAt: true, baseDueAt: true, extensions: true, resolution: true }
    })
    return { game, pairing }
  }

  /** Sends each socket that has the game open ITS OWN player's view. */
  async function pushState(gameId, event = 'async:state') {
    const sockets = watchers.get(gameId)
    if (!sockets?.size) return
    const b = await loadBundle(gameId)
    if (!b) return
    for (const [sid, w] of sockets) {
      emitTo(sid, event, buildGameView({ game: b.game, pairing: b.pairing, uid: w.uid, tentative: tentative.get(tentKey(gameId, w.uid)) || null }))
    }
  }

  function pushPresence(gameId) {
    const sockets = watchers.get(gameId)
    if (!sockets?.size) return
    const here = boardUsers(gameId)
    for (const [sid, w] of sockets) emitTo(sid, 'async:presence', { gameId, opponentOnBoard: [...here].some(u => u !== w.uid) })
  }

  function subscribe(gameId, uid) {
    socket.join(room(gameId))
    if (!watchers.has(gameId)) watchers.set(gameId, new Map())
    watchers.get(gameId).set(socket.id, { uid })
    ;(socket.data.ogAsyncGames ||= new Set()).add(gameId)
  }
  function unsubscribe(gameId) {
    socket.leave(room(gameId))
    const set = watchers.get(gameId)
    if (set) { set.delete(socket.id); if (!set.size) watchers.delete(gameId) }
    socket.data.ogAsyncGames?.delete(gameId)
    pushPresence(gameId)
  }

  /** What to do AFTER a move has committed: tell everyone watching, and queue the heavy work for the worker. */
  async function afterMove(gameId, result) {
    // The reveals, one at a time and in order, to every watching socket as its own player's view of them.
    const sockets = watchers.get(gameId)
    if (sockets?.size) {
      const b = await loadBundle(gameId)
      if (b) {
        for (const [sid, w] of sockets) {
          const idx = result.match.players.indexOf(w.uid)
          const view = buildGameView({ game: b.game, pairing: b.pairing, uid: w.uid, tentative: tentative.get(tentKey(gameId, w.uid)) || null })
          for (const r of result.newReveals) {
            const { view: snapshot, ...reveal } = revealForSeat(r, idx)
            emitTo(sid, 'async:reveal', { gameId, view: snapshot ?? view, reveal })
          }
          emitTo(sid, 'async:state', view)
          if (result.end) emitTo(sid, 'async:end', view)
          if (result.post.nextGame) emitTo(sid, 'async:nextGame', { gameId, nextGameId: result.post.nextGame.gameId, gameNumber: result.post.nextGame.gameNumber })
        }
      }
    }
    // The other player's own sockets that are NOT on this board (another page, another tab) still want to know.
    const tm = result.game.tournamentMatchId
    pushTournamentState(io, { EV, userRoom }, tm).catch(() => {})
    if (result.post.advance) {
      enqueueOgTournamentJob('ogTournamentAdvance', { tournamentId: result.match.tournament.tournamentId, matchId: tm }, { key: tm })
        .catch(e => console.error('[ogGtoonsAsync] could not queue tournament advance:', e?.message || e))
    }
  }

  /** Runs one play for the acting user, serialised per game. */
  async function play(gameId, user, action, payload) {
    if (!isId(gameId)) return err('badGame', 'That game could not be found.')
    if (!limiter(socket, 'play', 20, 10_000)) return err('slowDown', 'Slow down a little.')
    const result = await withGameLock(gameId, () => playMove({
      gameId, userId: user.id, action, payload, tentative: tentative.get(tentKey(gameId, user.id)) || null
    }))
    if (!result.ok) {
      // A refused play changes nothing. Re-sync the player so a stale board corrects itself.
      err(result.code, result.message, { gameId })
      if (['staleRound', 'wrongPhase', 'already_committed', 'gameClosed', 'deadlinePassed', 'finished'].includes(result.code)) await pushState(gameId).catch(() => {})
      return
    }
    tentative.delete(tentKey(gameId, user.id))
    await afterMove(gameId, result)
  }

  socket.on(EV('async:open'), async ({ gameId } = {}) => {
    const user = await authAsync()
    if (!user || !(await gate())) return
    if (!isId(gameId)) return err('badGame', 'That game could not be found.')
    if (!limiter(socket, 'open', 30, 60_000)) return err('slowDown', 'Slow down a little.')
    const o = await openGame({ gameId, userId: user.id, tentative: tentative.get(tentKey(gameId, user.id)) || null })
    if (!o.ok) return err(o.code, o.message, { gameId })
    subscribe(gameId, user.id)
    // One event with everything: the view, the reveals this player has not watched, and where the series goes next.
    socket.emit(EV('async:view'), {
      gameId, view: o.view, unseen: o.unseen.map(r => revealForSeat(r, o.idx)), nextGameId: o.nextGame?.id || null
    })
    pushPresence(gameId)
  })

  socket.on(EV('async:close'), async ({ gameId } = {}) => {
    if (isId(gameId)) unsubscribe(gameId)
  })

  socket.on(EV('async:place'), async ({ gameId, cardIdx, slot } = {}) => {
    const user = await authAsync()
    if (!user || !isId(gameId) || !limiter(socket, 'tent', 40, 10_000)) return
    await withGameLock(gameId, async () => {
      const o = await openGame({ gameId, userId: user.id })
      if (!o.ok || o.game.status !== 'ACTIVE') return err(o.code || 'gameClosed', o.message || 'This game is over.')
      const match = restoreMatch(o.game.state)
      const key = tentKey(gameId, user.id)
      overlayTentative(match, o.idx, tentative.get(key))
      const res = applyTentative(match, o.idx, 'place', { cardIdx, slot })
      if (!res.ok) return err(res.code, res.message, { gameId })
      tentative.set(key, match.placements[o.idx].map(p => ({ slot: p.slot, cardIdx: p.cardIdx })))
      await pushStateToUser(gameId, user.id)
    })
  })

  socket.on(EV('async:unplace'), async ({ gameId, slot } = {}) => {
    const user = await authAsync()
    if (!user || !isId(gameId) || !limiter(socket, 'tent', 40, 10_000)) return
    await withGameLock(gameId, async () => {
      const o = await openGame({ gameId, userId: user.id })
      if (!o.ok || o.game.status !== 'ACTIVE') return err(o.code || 'gameClosed', o.message || 'This game is over.')
      const match = restoreMatch(o.game.state)
      const key = tentKey(gameId, user.id)
      overlayTentative(match, o.idx, tentative.get(key))
      const res = applyTentative(match, o.idx, 'unplace', { slot })
      if (!res.ok) return err(res.code, res.message, { gameId })
      tentative.set(key, match.placements[o.idx].map(p => ({ slot: p.slot, cardIdx: p.cardIdx })))
      await pushStateToUser(gameId, user.id)
    })
  })

  /** Placing is private: only that player's own sockets are told (the opponent learns nothing until a commit). */
  async function pushStateToUser(gameId, uid) {
    const sockets = watchers.get(gameId)
    if (!sockets?.size) return
    const b = await loadBundle(gameId)
    if (!b) return
    for (const [sid, w] of sockets) {
      if (w.uid !== uid) continue
      emitTo(sid, 'async:state', buildGameView({ game: b.game, pairing: b.pairing, uid, tentative: tentative.get(tentKey(gameId, uid)) || null }))
    }
  }

  const playEvent = (name, action, pick) => socket.on(EV(name), async (p = {}) => {
    const user = await authAsync()
    if (!user || !(await gate())) return
    await play(p.gameId, user, action, pick(p))
  })
  playEvent('async:commit', 'commit', p => ({ round: p.round }))
  playEvent('async:discard', 'discard', p => ({ cardIdxs: p.cardIdxs }))
  playEvent('async:swap', 'swap', p => ({ cardIdx: p.cardIdx }))
  playEvent('async:swapSkip', 'swapSkip', () => ({}))
  playEvent('async:chooseColor', 'chooseColor', p => ({ color: p.color }))

  socket.on(EV('async:seen'), async ({ gameId, seq } = {}) => {
    const user = await authAsync()
    if (!user || !isId(gameId) || !limiter(socket, 'seen', 60, 60_000)) return
    await markSeen({ gameId, userId: user.id, seq: Number(seq) })
  })

  socket.on(EV('async:introSeen'), async ({ gameId } = {}) => {
    const user = await authAsync()
    if (!user || !isId(gameId) || !limiter(socket, 'seen', 60, 60_000)) return
    await markIntroSeen({ gameId, userId: user.id })
  })

  // A dropped connection just stops watching. It is never a forfeit (that is only ever an explicit button).
  socket.on('disconnecting', () => {
    for (const gameId of [...(socket.data?.ogAsyncGames || [])]) {
      const set = watchers.get(gameId)
      if (set) { set.delete(socket.id); if (!set.size) watchers.delete(gameId) }
      pushPresence(gameId)
    }
  })
}

/** A stored reveal as one player receives it: their own cards are `you`, and only their own snapshot of the board is sent. */
export function revealForSeat(r, idx) {
  const other = idx === 0 ? 1 : 0
  return {
    seq: r.seq, round: r.round, order: r.order, you: r.entries[idx], opponent: r.entries[other],
    steps: r.steps, before: r.before, timing: r.timing, logSeq: r.logSeq,
    view: r.views?.[idx] ?? null
  }
}

/**
 * A pairing can be decided while someone is looking at its game (the deadline passed, an admin set the result, a forfeit).
 * The worker cannot reach this process, so once every 30 seconds each open game is checked and its players are sent the
 * new picture. One cheap indexed read per open game; nothing runs when nobody has a board open.
 */
let reconcileTimer = null
export function startAsyncReconcile(io, { EV }) {
  if (reconcileTimer) return
  reconcileTimer = setInterval(async () => {
    for (const [gameId, sockets] of [...watchers.entries()]) {
      try {
        const b = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
        if (!b) continue
        const pairing = await db.ogGtoonTournamentMatch.findUnique({
          where: { id: b.tournamentMatchId },
          select: { id: true, playerAUserId: true, playerBUserId: true, dueAt: true, baseDueAt: true, extensions: true, resolution: true }
        })
        const last = reconcileSeen.get(gameId)
        const sig = `${b.status}:${b.version}:${pairing?.dueAt?.getTime()}`
        reconcileSeen.set(gameId, sig)
        if (last === undefined || last === sig) continue
        for (const [sid, w] of sockets) io.local.to(sid).emit(EV('async:state'), buildGameView({ game: b, pairing, uid: w.uid, tentative: null }))
      } catch (e) {
        console.error('[ogGtoonsAsync] reconcile failed:', e?.message || e)
      }
    }
    for (const id of [...reconcileSeen.keys()]) if (!watchers.has(id)) reconcileSeen.delete(id)
  }, 30_000)
  reconcileTimer.unref?.()
}
const reconcileSeen = new Map()
