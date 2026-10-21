// server/utils/ogGtoonsTournamentSocket.js
//
// Socket side of OG gToons tournaments: pressing Play on a pairing, ready-up, and starting the
// zero-stake, server-created game once BOTH players are ready and online. Registered per
// connection from ogGtoonsSocket.js (which hands over the runtime internals it owns — the match
// maps, the queue and startMatch — so this file never has to reach into module state).
//
// ── Security ────────────────────────────────────────────────────────────────────────────────
// The acting user always comes from the session (`auth()`), never the payload. A client sends only
// a tournament-match id; the server re-checks that this user is a player in it, that the pairing
// and tournament are live, that neither player is busy, and re-verifies BOTH locked decks against
// the database before a game starts. Stake is forced to 0 and the decks are the locked ones — the
// client can influence neither.
//
// ── Performance ─────────────────────────────────────────────────────────────────────────────
// Ready-up is a couple of indexed reads/writes on a user action, and a game start adds one deck
// check per player. Nothing here runs on a timer; DMs and round advancing are queued for the
// cron worker (queues.js), never sent from this process.
import { randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { getOgGtoonsConfig } from './ogGtoonsConfig.js'
import { enqueueOgTournamentJob } from './queues.js'
import { bracketRoundLabel } from './tournamentCore.js'
import {
  ACTIVE_STATUSES, isFresh, getPlayContext, settleMatchFromGames, setReady, clearReady,
  markLive, clearLive, loadLockedDeckForGame
} from './ogGtoonTournamentLive.js'

async function roundLabel(match) {
  if (match.stage === 'SWISS') return `Swiss Round ${match.roundNumber}`
  const count = await db.ogGtoonTournamentMatch.count({ where: { roundId: match.roundId } })
  return bracketRoundLabel(count)
}

export function registerOgGtoonsTournament(io, socket, h) {
  const { auth, startMatch, matchByUser, queueByUser, removeFromQueue, userRoom, isPracticing, EV } = h

  const err = (code, message, extra = {}) => socket.emit(EV('error'), { code, message, ...extra })
  const roomOf = (uid) => io.in(userRoom(uid))
  const isOnline = async (uid) => (await roomOf(uid).local.fetchSockets()).length > 0

  const gate = async () => {
    const cfg = await getOgGtoonsConfig()
    if (!cfg.gameEnabled || !cfg.tournamentsEnabled) {
      err('tournamentsDisabled', 'Tournament play is currently unavailable.')
      return false
    }
    return true
  }

  /** The state each player's Tournaments panel needs, from their own point of view. */
  async function stateFor(m, uid) {
    const side = m.playerAUserId === uid ? 'A' : 'B'
    const opp = side === 'A' ? m.playerBUserId : m.playerAUserId
    return {
      tournamentMatchId: m.id,
      myReady: isFresh(side === 'A' ? m.readyAAt : m.readyBAt),
      opponentReady: isFresh(side === 'A' ? m.readyBAt : m.readyAAt),
      opponentOnline: await isOnline(opp),
      live: !!m.liveMatchId,
      gamesCounted: m.gamesCounted,
      locked: !!m.lockedAt
    }
  }

  async function pushState(matchId) {
    const m = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId } })
    if (!m) return
    for (const uid of [m.playerAUserId, m.playerBUserId]) {
      io.local.to(userRoom(uid)).emit(EV('tournamentState'), await stateFor(m, uid))
    }
  }

  /** Starts the game if both players are ready, online and free. Returns true when a game began. */
  async function tryStart(matchId) {
    const m = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: true } })
    if (!m || m.lockedAt || m.liveMatchId || m.needsAdmin) return false
    if (!ACTIVE_STATUSES.includes(m.tournament.status)) return false
    if (!isFresh(m.readyAAt) || !isFresh(m.readyBAt)) return false
    const a = m.playerAUserId
    const b = m.playerBUserId

    for (const uid of [a, b]) {
      if (matchByUser.has(uid) || isPracticing(uid)) {
        io.local.to(userRoom(uid)).emit(EV('error'), { code: 'inMatch', message: 'Finish your current game before starting your tournament game.' })
        const other = uid === a ? b : a
        io.local.to(userRoom(other)).emit(EV('error'), { code: 'opponentBusy', message: 'Your opponent is still in another game. Press Play again when they are free.' })
        return false
      }
    }
    const [sockA] = await roomOf(a).local.fetchSockets()
    const [sockB] = await roomOf(b).local.fetchSockets()
    if (!sockA || !sockB) return false

    const [optIns, users] = await Promise.all([
      db.ogGtoonTournamentOptIn.findMany({ where: { tournamentId: m.tournamentId, userId: { in: [a, b] } } }),
      db.user.findMany({ where: { id: { in: [a, b] } }, select: { id: true, username: true, banned: true } })
    ])
    const optA = optIns.find(o => o.userId === a)
    const optB = optIns.find(o => o.userId === b)
    const userA = users.find(u => u.id === a)
    const userB = users.find(u => u.id === b)
    if (!optA || !optB || optA.disqualified || optB.disqualified || userA?.banned || userB?.banned) return false

    const [deckA, deckB] = await Promise.all([
      loadLockedDeckForGame(a, optA.deckSnapshotJson),
      loadLockedDeckForGame(b, optB.deckSnapshotJson)
    ])
    if (!deckA.valid || !deckB.valid) {
      for (const [uid, d, other] of [[a, deckA, b], [b, deckB, a]]) {
        if (d.valid) continue
        const names = [...d.missing, ...d.moved].map(p => d.names[p]).filter(Boolean)
        io.local.to(userRoom(uid)).emit(EV('error'), {
          code: 'badLockedDeck',
          message: `Your locked deck has a problem${names.length ? ` (${names.join(', ')})` : ''}. Fix it on the Tournaments tab before you can play.`,
          missing: d.missing, moved: d.moved
        })
        io.local.to(userRoom(other)).emit(EV('error'), { code: 'opponentDeckProblem', message: 'Your opponent has a deck problem to fix first. You will be told when they are ready.' })
      }
      return false
    }

    const liveId = randomUUID()
    if (!(await markLive(matchId, liveId))) return false

    // Pressing Play is a choice of this game over any random search either player had going.
    for (const uid of [a, b]) {
      if (!queueByUser.has(uid)) continue
      removeFromQueue(uid)
      io.local.to(userRoom(uid)).emit(EV('queueLeft'))
    }

    const started = await startMatch(
      io,
      { userId: a, username: userA.username, socket: sockA, deckSnapshot: deckA.deck, stake: 0 },
      { userId: b, username: userB.username, socket: sockB, deckSnapshot: deckB.deck, stake: 0 },
      {
        isChallenge: false,
        matchId: liveId,
        tournament: {
          matchId: m.id, tournamentId: m.tournamentId, name: m.tournament.name, stage: m.stage,
          label: await roundLabel(m), bestOf: m.bestOf, gameNumber: m.gamesCounted + 1
        }
      }
    )
    if (!started) {
      await clearLive(matchId, liveId)
      return false
    }
    pushState(matchId).catch(() => {})
    return true
  }

  socket.on(EV('tournamentReady'), async ({ tournamentMatchId } = {}) => {
    const user = await auth()
    if (!user || !(await gate())) return
    const ctx = await getPlayContext(user.id, tournamentMatchId)
    if (!ctx.ok) return err(ctx.code, ctx.message)
    if (ctx.match.liveMatchId) return err('gameLive', 'A game of this match is already being played.')
    if (matchByUser.has(user.id) || isPracticing(user.id)) return err('inMatch', 'You are already in a game.')

    // Score anything that just finished, so "is the series over?" is answered from the games.
    const settled = await settleMatchFromGames(ctx.match.id)
    if (settled.locked || settled.decided) {
      pushState(ctx.match.id).catch(() => {})
      return err('finished', 'This series has already been decided.')
    }

    // Surface a deck problem to the person who pressed Play, now, rather than when the game starts.
    const own = await loadLockedDeckForGame(user.id, ctx.optIn.deckSnapshotJson)
    if (!own.valid) {
      const names = [...own.missing, ...own.moved].map(p => own.names[p]).filter(Boolean)
      return err('badLockedDeck', `Your locked deck has a problem${names.length ? ` (${names.join(', ')})` : ''}. Fix it on the Tournaments tab first.`, { missing: own.missing, moved: own.moved })
    }

    await setReady(ctx.match, ctx.side)

    // Tell the opponent: live if they are connected, otherwise (rate-limited) by Discord DM.
    const online = await isOnline(ctx.opponentId)
    io.local.to(userRoom(ctx.opponentId)).emit(EV('tournamentOpponentReady'), {
      tournamentMatchId: ctx.match.id, tournamentName: ctx.tournament.name, username: user.username
    })
    if (!online) {
      enqueueOgTournamentJob('ogTournamentNotifyReady', { tournamentMatchId: ctx.match.id, readyUserId: user.id }, { key: `${ctx.match.id}-${user.id}`, bucketSec: 60 })
        .catch(() => {})
    }

    const started = await tryStart(ctx.match.id)
    if (!started) await pushState(ctx.match.id)
  })

  socket.on(EV('tournamentUnready'), async ({ tournamentMatchId } = {}) => {
    const user = await auth()
    if (!user) return
    const ctx = await getPlayContext(user.id, tournamentMatchId)
    if (!ctx.ok) return
    await clearReady(ctx.match.id, ctx.side)
    await pushState(ctx.match.id)
  })

  // The panel asks for the live picture of its pairing (opponent online? ready?) when it opens.
  socket.on(EV('tournamentSync'), async ({ tournamentMatchId } = {}) => {
    const user = await auth()
    if (!user) return
    const m = typeof tournamentMatchId === 'string'
      ? await db.ogGtoonTournamentMatch.findUnique({ where: { id: tournamentMatchId } })
      : null
    if (!m || (m.playerAUserId !== user.id && m.playerBUserId !== user.id)) return
    socket.emit(EV('tournamentState'), await stateFor(m, user.id))
  })
}
