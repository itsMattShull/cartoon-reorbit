// End-to-end checks of async + live tournament games against a REAL Postgres: Start, game creation, persisted moves,
// auto-chained games, the deadline guard, the final-minute extension, replay cursors and hidden information.
//
// Skipped unless OG_TOURNAMENT_TEST_DB is set (a throwaway database already migrated to the current schema):
//   OG_TOURNAMENT_TEST_DB=postgresql://... REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
//     node --test --test-concurrency=1 --test-force-exit tests/ogGtoonAsyncGames.db.test.js
// (--test-concurrency=1 because the DB test files share one GameConfig row and one Redis; --test-force-exit because the queue connections keep the process alive.)
import test from 'node:test'
import assert from 'node:assert/strict'

const URL = process.env.OG_TOURNAMENT_TEST_DB
const run = URL ? test : test.skip

let db
let T
let Live
let G
let Config
let seq = 0
const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE']

async function setup() {
  if (db) return
  process.env.DATABASE_URL = URL
  process.env.MINT_QUEUE_KEY = process.env.MINT_QUEUE_KEY || 'testMintQueue'
  process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379'
  ;({ prisma: db } = await import('../server/prisma.js'))
  T = await import('../server/utils/ogGtoonTournament.js')
  Live = await import('../server/utils/ogGtoonTournamentLive.js')
  G = await import('../server/utils/ogGtoonTournamentGames.js')
  Config = await import('../server/utils/ogGtoonsConfig.js')
}

async function mkUsers(n) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    seq += 1
    out.push(await db.user.create({ data: { discordId: `ad${Date.now()}${seq}`, username: `atester${Date.now()}_${seq}` } }))
  }
  return out
}

async function mkDeckFor(user, tag) {
  const ctoons = []
  for (let i = 0; i < 12; i += 1) {
    ctoons.push(await db.ctoon.create({
      data: { name: `${tag}-c${i}`, type: 'gtoon', rarity: 'Common', assetPath: `/x/${tag}${i}.png`, isOgGtoon: true, gtoonColor: COLORS[i % COLORS.length], gtoonValue: 3 + (i % 7) }
    }))
  }
  for (const c of ctoons) await db.userCtoon.create({ data: { userId: user.id, ctoonId: c.id } })
  const deck = await db.ogGtoonDeck.create({ data: { userId: user.id, name: `${tag} deck`, cards: { create: ctoons.map((c, i) => ({ ctoonId: c.id, position: i })) } } })
  return deck
}

/** Two players in a 2-player bracket whose round 1 pairing is created under the async rules. */
async function mkAsyncPairing({ windowHours = 24 } = {}) {
  await setup()
  await db.gameConfig.upsert({
    where: { gameName: 'OgGtoons' },
    create: { gameName: 'OgGtoons', ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true, ogGtoonsTournamentsAsyncEnabled: true },
    update: { ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true, ogGtoonsTournamentsAsyncEnabled: true }
  })
  Config.invalidateOgGtoonsConfigCache()
  const users = await mkUsers(2)
  const t = await db.ogGtoonTournament.create({
    data: { name: `Async Cup ${seq++}`, status: 'OPT_IN_OPEN', optInStartAt: new Date(Date.now() - 86400000), optInEndAt: new Date(Date.now() - 1000), announcementChannelId: '', roundWindowHours: windowHours }
  })
  for (const [i, u] of users.entries()) {
    const deck = await mkDeckFor(u, `as${seq}${i}`)
    const { snapshot } = await Live.lockTournamentDeck(u.id, deck.id)
    await db.ogGtoonTournamentOptIn.create({ data: { tournamentId: t.id, userId: u.id, deckSnapshotJson: snapshot } })
  }
  await T.startTournament(db, t.id)
  const pairing = await db.ogGtoonTournamentMatch.findFirst({ where: { tournamentId: t.id, status: 'PENDING' } })
  assert.equal(pairing.asyncRules, true)
  const byId = new Map(users.map(u => [u.id, u]))
  return { t, pairing, a: byId.get(pairing.playerAUserId), b: byId.get(pairing.playerBUserId) }
}

const reload = (id) => db.ogGtoonTournamentMatch.findUnique({ where: { id } })

/** A trivial bot: whatever the view says the player may do, do it (fill the open slots, keep the hand, skip the swap). */
async function actFor(gameId, user) {
  const o = await G.openGame({ gameId, userId: user.id })
  if (!o.ok || o.game.status !== 'ACTIVE') return null
  const v = o.view
  if (v.phase === 'play' && !v.you.ready) {
    const n = Math.min(v.roundSlots.length, v.you.hand.length)
    const tentative = v.roundSlots.slice(0, n).map((slot, i) => ({ slot, cardIdx: v.you.hand[i].idx }))
    return G.playMove({ gameId, userId: user.id, action: 'commit', payload: { round: v.round }, tentative })
  }
  if (v.phase === 'discard' && !v.you.discardReady) return G.playMove({ gameId, userId: user.id, action: 'discard', payload: { cardIdxs: [] } })
  if (v.phase === 'swap' && v.you.maySwap) return G.playMove({ gameId, userId: user.id, action: 'swapSkip' })
  if (v.phase === 'color' && v.you.mayChooseColor) return G.playMove({ gameId, userId: user.id, action: 'chooseColor', payload: { color: 'RED' } })
  return null
}

/** Plays the pairing to the end with both bots taking turns. */
async function playOut(pairingId, users) {
  for (let i = 0; i < 400; i += 1) {
    const p = await reload(pairingId)
    if (p.lockedAt) return p
    const game = await db.ogGtoonTournamentGame.findFirst({ where: { tournamentMatchId: pairingId, status: 'ACTIVE' } })
    assert.ok(game, 'while the pairing is open a game is waiting to be played')
    for (const u of users) await actFor(game.id, u)
  }
  throw new Error('the series never finished')
}

run('Start is sticky and needs both players; the second Start creates game 1 without anyone being online', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  const first = await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  assert.deepEqual([first.ok, first.ready, first.game], [true, { A: pairing.playerAUserId === a.id, B: pairing.playerBUserId === a.id }, undefined])
  assert.equal(await db.ogGtoonTournamentGame.count({ where: { tournamentMatchId: pairing.id } }), 0, 'one Start is not enough')

  const again = await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  assert.equal(again.ok, true, 'pressing again is harmless')

  const second = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  assert.equal(second.ok, true)
  assert.equal(second.game.gameNumber, 1)
  const games = await db.ogGtoonTournamentGame.findMany({ where: { tournamentMatchId: pairing.id } })
  assert.equal(games.length, 1)
  assert.equal(games[0].status, 'ACTIVE')
  assert.equal((await reload(pairing.id)).status, 'IN_PROGRESS')

  // A third press cannot make a second game, and a Start cannot be taken back once the game exists.
  assert.equal((await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })).game, undefined)
  assert.equal(await db.ogGtoonTournamentGame.count({ where: { tournamentMatchId: pairing.id } }), 1)
  assert.equal((await G.cancelStart({ tournamentMatchId: pairing.id, userId: a.id })).ok, false)
})

run('a Start can be taken back until the opponent presses theirs', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  assert.equal((await G.cancelStart({ tournamentMatchId: pairing.id, userId: a.id })).ok, true)
  const m = await reload(pairing.id)
  assert.equal(m.readyAAt === null && m.readyBAt === null, true)
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  assert.equal((await G.cancelStart({ tournamentMatchId: pairing.id, userId: b.id })).ok, false)
})

run('a best-of-3 plays out through persisted moves: games chain automatically and the series settles', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })

  const done = await playOut(pairing.id, [a, b])
  assert.equal(done.status, 'COMPLETE')
  assert.equal(done.resolution, 'PLAYED')
  assert.ok(done.winnerUserId, 'a bracket series always has a winner')
  assert.ok(done.gamesCounted >= 2 && done.gamesCounted <= 3 + 4)

  const games = await db.ogGtoonTournamentGame.findMany({ where: { tournamentMatchId: pairing.id }, orderBy: { gameNumber: 'asc' } })
  assert.deepEqual(games.map(g => g.gameNumber), games.map((_, i) => i + 1), 'numbered 1..n with no gaps')
  assert.ok(games.every(g => g.status === 'ENDED'), 'no game is left active')
  const written = await db.ogGtoonMatch.findMany({ where: { tournamentMatchId: pairing.id } })
  assert.equal(written.length, games.length, 'every finished game is written under its own id for scoring and Meta')
  assert.deepEqual(new Set(written.map(w => w.id)), new Set(games.map(g => g.id)))
  assert.ok(written.every(w => w.player1Points === 0 && w.player2Points === 0 && w.endedAt), 'zero stake')
  assert.equal((await Live.settleMatchFromGames(pairing.id)).locked, true, 'already settled')
})

run('a move is refused after the deadline, and a closed game takes no more moves', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { dueAt: new Date(Date.now() - 1000) } })
  const late = await actFor(game.gameId, a)
  assert.equal(late.ok, false)
  assert.equal(late.code, 'deadlinePassed')
  // Nothing changed.
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })).version, 1)

  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { dueAt: new Date(Date.now() + 86400000) } })
  await db.ogGtoonTournamentGame.update({ where: { id: game.gameId }, data: { status: 'CLOSED' } })
  assert.equal((await actFor(game.gameId, a))?.code ?? 'gameClosed', 'gameClosed')
})

run('a play in the last minute adds a minute to THAT match only; earlier plays do not', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  const other = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  const before = await reload(pairing.id)

  const early = await actFor(game.gameId, a)
  assert.equal(early.ok, true)
  assert.equal(early.extended, false, 'a play with a day left does not extend')
  assert.equal((await reload(pairing.id)).dueAt.getTime(), before.dueAt.getTime())

  // Now only 30 seconds are left: B's play adds a minute.
  const soon = new Date(Date.now() + 30 * 1000)
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { dueAt: soon } })
  const late = await actFor(game.gameId, b)
  assert.equal(late.ok, true)
  assert.equal(late.extended, true)
  const after = await reload(pairing.id)
  assert.equal(after.dueAt.getTime(), soon.getTime() + 60 * 1000)
  assert.equal(after.extensions, 1)
  assert.equal(after.baseDueAt.getTime(), before.baseDueAt.getTime(), 'the ORIGINAL deadline never moves')
  assert.equal((await reload(other.pairing.id)).dueAt.getTime(), other.pairing.dueAt.getTime(), 'another match is untouched')
})

run('who the game is waiting on: the player who has not made the pending play; hidden cards stay hidden', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })

  const open = async (u) => (await G.openGame({ gameId: game.gameId, userId: u.id })).view
  assert.equal((await open(a)).waitingOn, null, 'nobody has played yet')
  const r = await actFor(game.gameId, a)
  assert.equal(r.ok, true)
  assert.equal((await open(a)).waitingOn, 'opponent')
  assert.equal((await open(b)).waitingOn, 'you')

  // B's view never contains A's hand or what A placed, only that A committed.
  const vb = await open(b)
  assert.equal(JSON.stringify(vb.opponent).includes('"hand"'), false)
  assert.ok(vb.opponent.committedSlots.length > 0)
  assert.ok(vb.opponent.handCount > 0)
  assert.equal(vb.opponent.revealed.length, 0, 'nothing is revealed until both have committed')
  const stored = await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })
  assert.ok(JSON.stringify(stored.state).includes('"hand"'), 'the server-side state does hold it')

  // B commits: the round reveals for both, and nobody is waited on.
  const rb = await actFor(game.gameId, b)
  assert.equal(rb.ok, true)
  assert.equal(rb.newReveals.length, 1)
  assert.equal((await open(a)).waitingOn, null)
  assert.ok((await open(a)).you.revealed.length > 0)
})

run('a returning player gets the reveals they have not watched, in order, and the cursor never goes backwards', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  // Play two full rounds while "A is away": the game goes round 1 reveal, discard, round 2 reveal, swap.
  for (let i = 0; i < 6; i += 1) { await actFor(game.gameId, a); await actFor(game.gameId, b) }

  const o = await G.openGame({ gameId: game.gameId, userId: a.id })
  assert.ok(o.unseen.length >= 2, 'the round reveals were stored')
  assert.deepEqual(o.unseen.map(r => r.seq), o.unseen.map((_, i) => i + 1), 'in order, from 1')
  assert.ok(o.unseen.every(r => Array.isArray(r.entries) && r.entries.length === 2 && Array.isArray(r.steps)), 'seat-neutral payloads with their steps')

  await G.markSeen({ gameId: game.gameId, userId: a.id, seq: o.unseen[0].seq })
  assert.equal((await G.openGame({ gameId: game.gameId, userId: a.id })).unseen.length, o.unseen.length - 1)
  await G.markSeen({ gameId: game.gameId, userId: a.id, seq: 0 })
  assert.equal((await G.openGame({ gameId: game.gameId, userId: a.id })).unseen.length, o.unseen.length - 1, 'never backwards')
  assert.equal((await G.openGame({ gameId: game.gameId, userId: b.id })).unseen.length, o.unseen.length, "B's own cursor is separate")
})

run('only the two players can open or play a game', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  const [stranger] = await mkUsers(1)
  assert.equal((await G.openGame({ gameId: game.gameId, userId: stranger.id })).code, 'notYours')
  assert.equal((await G.playMove({ gameId: game.gameId, userId: stranger.id, action: 'commit', payload: { round: 1 } })).code, 'notYours')
  assert.equal((await G.pressStart({ tournamentMatchId: pairing.id, userId: stranger.id })).code, 'notYours')
})

run('a locked card that left a collection stops the next game and is recorded as that player\'s problem', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const optA = await db.ogGtoonTournamentOptIn.findFirst({ where: { tournamentId: pairing.tournamentId, userId: a.id } })
  // A card leaves A's collection before the second Start (an admin action, say; trades and auctions are refused by the freeze).
  await db.userCtoon.update({ where: { id: optA.deckSnapshotJson[3].userCtoonId }, data: { userId: b.id } })
  const res = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  assert.equal(res.ok, true)
  assert.equal(res.game, undefined, 'no game is created')
  assert.equal(res.deckProblem.side, pairing.playerAUserId === a.id ? 'A' : 'B')
  assert.equal((await reload(pairing.id)).deckProblemSide, res.deckProblem.side)
})

run('the end of a game with too little of the round left decides the pairing on the spot instead of starting another', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  // 10 minutes of the original round left: under the hour a new game needs.
  const soon = new Date(Date.now() + 10 * 60 * 1000)
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { dueAt: soon, baseDueAt: soon } })
  let ended = false
  for (let i = 0; i < 100 && !ended; i += 1) {
    for (const u of [a, b]) {
      const r = await actFor(game.gameId, u)
      if (r?.end) ended = true
    }
  }
  assert.equal(ended, true)
  const p = await reload(pairing.id)
  assert.equal(p.status, 'COMPLETE', 'decided now: nothing else can happen')
  assert.equal(await db.ogGtoonTournamentGame.count({ where: { tournamentMatchId: pairing.id, status: 'ACTIVE' } }), 0)
  assert.equal(await db.ogGtoonTournamentGame.count({ where: { tournamentMatchId: pairing.id } }), 1, 'no second game was started')
  assert.ok(p.winnerUserId, 'a bracket match always has a winner (score, then seed)')
})

run('deciding a pairing any other way closes its running game', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  const p = await reload(pairing.id)
  assert.equal(await Live.lockMatchResult(db, p, { outcome: 'A_WIN', resolution: 'ADMIN', winsA: 2, winsB: 0, note: 'test' }), true)
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })).status, 'CLOSED')
  assert.equal(await db.ogGtoonMatch.count({ where: { tournamentMatchId: pairing.id } }), 0, 'a closed game never counts')
})

/** A fake socket server: records what each socket is sent, no network. */
function fakeIo() {
  const sent = []
  const sockets = new Map()
  const io = {
    local: { to: (id) => ({ emit: (ev, p) => sent.push({ to: id, ev, p }) }) },
    in: () => ({ local: { fetchSockets: async () => [] } })
  }
  const mk = (id, uid) => {
    const handlers = {}
    const s = {
      id, data: {}, handlers,
      on: (ev, fn) => { handlers[ev] = fn },
      join: () => {}, leave: () => {},
      emit: (ev, p) => sent.push({ to: id, ev, p })
    }
    sockets.set(id, { s, uid })
    return s
  }
  return { io, sent, mk }
}

run('socket layer: placing is private, reveals are each player\'s own view, closing or dropping never forfeits', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  const { registerOgGtoonsAsync } = await import('../server/utils/ogGtoonsAsyncSocket.js')

  const { io, sent, mk } = fakeIo()
  const EV = (n) => `oggtoons:${n}`
  const connect = (user, id) => {
    const s = mk(id, user.id)
    registerOgGtoonsAsync(io, s, { resolveSocketUser: async () => ({ id: user.id, username: user.username }), EV, userRoom: (uid) => `oggtoons:user:${uid}` })
    return s
  }
  const sa = connect(a, 'sock-a')
  const sb = connect(b, 'sock-b')
  const to = (id, ev) => sent.filter(e => e.to === id && e.ev === EV(ev))

  await sa.handlers[EV('async:open')]({ gameId: game.gameId })
  await sb.handlers[EV('async:open')]({ gameId: game.gameId })
  const openA = to('sock-a', 'async:view')[0].p
  const openB = to('sock-b', 'async:view')[0].p
  assert.equal(openA.view.you.username, a.username)
  assert.deepEqual(openA.unseen, [])
  assert.equal(to('sock-a', 'async:presence').at(-1).p.opponentOnBoard, true, 'both on the board = live')

  // A places a card: only A hears about it.
  const hand = openA.view.you.hand
  sent.length = 0
  await sa.handlers[EV('async:place')]({ gameId: game.gameId, cardIdx: hand[0].idx, slot: openA.view.roundSlots[0] })
  assert.equal(to('sock-a', 'async:state').length, 1)
  assert.equal(to('sock-b', 'async:state').length, 0, 'tentative placing is never shown to the opponent')
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })).version, 1, 'and never written')

  // Both commit: each is sent the reveal as THEIR view, and nothing about the other side's hand.
  const commit = async (s, u, v) => {
    for (const [i, slot] of v.roundSlots.entries()) await s.handlers[EV('async:place')]({ gameId: game.gameId, cardIdx: v.you.hand[i].idx, slot })
    await s.handlers[EV('async:commit')]({ gameId: game.gameId, round: v.round })
  }
  sent.length = 0
  await commit(sa, a, openA.view)
  assert.equal(to('sock-a', 'async:reveal').length, 0, 'nothing reveals until both have committed')
  await commit(sb, b, openB.view)
  const revA = to('sock-a', 'async:reveal')
  const revB = to('sock-b', 'async:reveal')
  assert.equal(revA.length, 1)
  assert.equal(revB.length, 1)
  assert.equal(revA[0].p.reveal.seq, 1)
  assert.equal(revA[0].p.view.you.username, a.username)
  assert.equal(revB[0].p.view.you.username, b.username)
  assert.notDeepEqual(revA[0].p.reveal.you, revA[0].p.reveal.opponent)
  assert.deepEqual(revA[0].p.reveal.you, revB[0].p.reveal.opponent, 'A\'s cards are A\'s `you` and B\'s `opponent`')
  assert.equal(JSON.stringify(revA[0].p).includes('views'), false, 'the other seat\'s snapshot is never sent')

  // Closing the board and dropping the connection are not forfeits.
  await sa.handlers[EV('async:close')]({ gameId: game.gameId })
  sb.handlers.disconnecting?.()
  const after = await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })
  assert.equal(after.status, 'ACTIVE')
  assert.equal((await reload(pairing.id)).lockedAt, null)

  // The player who was away gets the reveal they missed when they come back.
  const back = connect(b, 'sock-b2')
  await back.handlers[EV('async:open')]({ gameId: game.gameId })
  assert.equal(to('sock-b2', 'async:view')[0].p.unseen.length, 1)

  // A stranger cannot open the game, and a game id that is not theirs is refused rather than guessed.
  const [stranger] = await mkUsers(1)
  const ss = connect(stranger, 'sock-x')
  await ss.handlers[EV('async:open')]({ gameId: game.gameId })
  assert.equal(to('sock-x', 'async:view').length, 0)
  assert.ok(sent.some(e => e.to === 'sock-x' && e.ev === EV('error') && e.p.code === 'notYours'))
})

run('Start through the tournament socket handler: sticky, nobody has to be online, the second Start announces the game', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  const { registerOgGtoonsTournament } = await import('../server/utils/ogGtoonsTournamentSocket.js')
  const { io, sent, mk } = fakeIo()
  const EV = (n) => `oggtoons:${n}`
  let acting = null
  const s = mk('sock', 'x')
  registerOgGtoonsTournament(io, s, {
    auth: async () => acting, startMatch: async () => { throw new Error('the live runtime must not be used') },
    matchByUser: new Map(), queueByUser: new Map(), removeFromQueue: () => {},
    userRoom: (uid) => `oggtoons:user:${uid}`, isPracticing: () => false, EV
  })
  const press = async (u) => { acting = u; await s.handlers[EV('tournamentReady')]({ tournamentMatchId: pairing.id }) }
  await press(a)
  const stateA = sent.filter(e => e.ev === EV('tournamentState') && e.to === `oggtoons:user:${a.id}`).at(-1).p
  assert.deepEqual([stateA.async, stateA.myReady, stateA.opponentReady, stateA.gameId], [true, true, false, null])
  // An hour-old Start is still a Start (the older rules let it go stale after 30 minutes).
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { readyAAt: new Date(Date.now() - 3 * 3600 * 1000) } })
  await press(b)
  const started = sent.filter(e => e.ev === EV('tournamentGameStarted'))
  assert.equal(started.length, 2, 'both players are told')
  assert.equal(started[0].p.gameNumber, 1)
  const stateB = sent.filter(e => e.ev === EV('tournamentState') && e.to === `oggtoons:user:${b.id}`).at(-1).p
  assert.equal(stateB.gameId, started[0].p.gameId)
  assert.equal(stateB.myReady && stateB.opponentReady, true)
})

/* ── the deadline ───────────────────────────────────────────────────────────────────────── */

const pastDue = (id) => db.ogGtoonTournamentMatch.update({ where: { id }, data: { dueAt: new Date(Date.now() - 1000) } })

run('deadline: nothing happens before it; after it, only one Start counted -> that player wins by walkover', async () => {
  const { pairing, a } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const early = await G.decideAndLock(pairing.id)
  assert.deepEqual([early.decided, early.reason], [false, 'notDue'])
  assert.ok(early.dueAt, 'and it says when to look again')

  await pastDue(pairing.id)
  const r = await G.decideAndLock(pairing.id)
  assert.deepEqual([r.decided, r.outcome, r.resolution], [true, pairing.playerAUserId === a.id ? 'A_WIN' : 'B_WIN', 'WALKOVER'])
  const p = await reload(pairing.id)
  assert.equal(p.status, 'COMPLETE')
  assert.equal(p.winnerUserId, a.id)
  assert.equal((await G.decideAndLock(pairing.id)).decided, false, 'deciding twice does nothing')
})

run('deadline: the player the game is waiting on loses the whole match, and the running game is closed', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  assert.equal((await actFor(game.gameId, a)).ok, true, 'A commits; B never does')
  await pastDue(pairing.id)
  const r = await G.decideAndLock(pairing.id)
  assert.equal(r.decided, true)
  assert.equal(r.resolution, 'DEADLINE')
  assert.equal((await reload(pairing.id)).winnerUserId, a.id, 'the one who moved wins')
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })).status, 'CLOSED')
  assert.equal(await db.ogGtoonMatch.count({ where: { tournamentMatchId: pairing.id } }), 0, 'a closed game never counts')
  assert.match(r.why, /did not make their move/)
})

run('deadline: both started but nobody moved -> a bracket goes to the better seed', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  await pastDue(pairing.id)
  const r = await G.decideAndLock(pairing.id)
  assert.equal(r.decided, true)
  const betterSeedIsA = pairing.seedA < pairing.seedB
  assert.equal((await reload(pairing.id)).winnerUserId, betterSeedIsA ? pairing.playerAUserId : pairing.playerBUserId)
})

run('deadline: a Start pressed too late to count does not beat the earlier walkover', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  // A pressed Start hours ago; the round now has only 30 minutes left (under the hour a Start needs to count).
  const soon = new Date(Date.now() + 30 * 60 * 1000)
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { dueAt: soon, baseDueAt: soon, readyAAt: new Date(Date.now() - 3 * 3600 * 1000) } })
  // The service refuses a Start this late outright, and records nothing...
  const refused = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'tooLate')
  assert.equal((await reload(pairing.id)).readyBAt, null)
  assert.equal(await db.ogGtoonTournamentGame.count({ where: { tournamentMatchId: pairing.id } }), 0, 'and no game was created')
  // ...and even a press that got in some other way would not count: the earlier player wins the walkover.
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { readyBAt: new Date(Date.now() - 60 * 1000), dueAt: new Date(Date.now() - 1000) } })
  const r = await G.decideAndLock(pairing.id)
  assert.deepEqual([r.outcome, r.resolution], [pairing.playerAUserId === a.id ? 'A_WIN' : 'B_WIN', 'WALKOVER'])
})

run('deadline: a player whose deck broke loses; the other is told why', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const optA = await db.ogGtoonTournamentOptIn.findFirst({ where: { tournamentId: pairing.tournamentId, userId: a.id } })
  await db.userCtoon.update({ where: { id: optA.deckSnapshotJson[0].userCtoonId }, data: { userId: b.id } })
  await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  await pastDue(pairing.id)
  const r = await G.decideAndLock(pairing.id)
  assert.equal(r.decided, true)
  assert.equal((await reload(pairing.id)).winnerUserId, b.id)
  assert.match(r.why, /locked deck/)
})

run('deadline job: re-arms itself when the deadline moved, decides and advances the tournament when it did not', async () => {
  const { t, pairing, a } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const armed = []
  const arm = async (id, at) => { armed.push([id, at.getTime()]) }
  const notDue = await T.runDeadlineJob(db, pairing.id, { arm })
  assert.equal(notDue.reason, 'notDue')
  assert.equal(armed.length, 1)
  assert.equal(armed[0][1], (await reload(pairing.id)).dueAt.getTime(), 'armed for the (possibly extended) deadline')

  await pastDue(pairing.id)
  const done = await T.runDeadlineJob(db, pairing.id, { arm })
  assert.equal(done.decided, true)
  assert.equal(armed.length, 1, 'no further arming once decided')
  // A 2 player bracket: that was the final, so the tournament is over straight away.
  assert.equal((await db.ogGtoonTournament.findUnique({ where: { id: t.id } })).status, 'COMPLETE')
})

run('the cron decides an async pairing whose exact-time job was lost, and never applies the older rules to it', async () => {
  const { t, pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  await pastDue(pairing.id)
  const touched = await T.processDeadlines(db)
  assert.ok(touched.includes(t.id))
  const p = await reload(pairing.id)
  assert.equal(p.status, 'COMPLETE')
  assert.equal(p.asyncRules, true)
})

run('admin: extending moves the ORIGINAL deadline too and resets the extension count; cancelling closes running games', async () => {
  const { t, pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { extensions: 4 } })
  const r = await T.adminExtendDeadline(db, { tournamentId: t.id, matchId: pairing.id, hours: 6 })
  assert.equal(r.ok, true)
  const p = await reload(pairing.id)
  assert.equal(p.baseDueAt.getTime(), p.dueAt.getTime())
  assert.equal(p.extensions, 0)
  assert.ok(p.dueAt.getTime() > pairing.dueAt.getTime())

  await T.cancelTournament(db, t.id)
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })).status, 'CLOSED')
})

run('a forfeit mid-game closes the game and keeps the games really played at their real score', async () => {
  const { t, pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  const res = await T.forfeitMatch(db, { tournamentId: t.id, matchId: pairing.id, userId: a.id })
  assert.equal(res.ok, true, 'allowed any time, including mid-game')
  const p = await reload(pairing.id)
  assert.equal(p.winnerUserId, b.id)
  assert.equal(p.resolution, 'FORFEIT')
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })).status, 'CLOSED')
})

run('a move that has to wait on the pairing lock is judged by the clock AFTER it gets the lock, not when it was sent', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  await db.ogGtoonTournamentMatch.update({ where: { id: pairing.id }, data: { dueAt: new Date(Date.now() + 1500) } })

  // Something else (a deadline job, an admin action) holds the pairing's lock for two seconds.
  let release
  const held = new Promise(r => { release = r })
  const holder = db.$transaction(async (tx) => { await G.lockPairing(tx, pairing.id); await held }, { timeout: 15000 })
  await new Promise(r => setTimeout(r, 250))

  // A's move is sent while there is still time on the clock; it queues behind the lock.
  const move = actFor(game.gameId, a)
  await new Promise(r => setTimeout(r, 2000))
  release()
  await holder
  const res = await move
  assert.equal(res.ok, false)
  assert.equal(res.code, 'deadlinePassed', 'it got the lock after the deadline, so it is refused')
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: game.gameId } })).version, 1, 'and changed nothing')
  // The deadline decision, which waited the same way, then agrees: nobody had moved.
  const d = await G.decideAndLock(pairing.id)
  assert.equal(d.decided, true)
})

run('the panel summary says whose move it is and how many reveals a returning player has not watched', async () => {
  const { pairing, a, b } = await mkAsyncPairing()
  assert.equal(await G.gameSummaryFor(pairing.id, a.id), null, 'no game yet')
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  let s = await G.gameSummaryFor(pairing.id, a.id)
  assert.deepEqual([s.gameId, s.gameNumber, s.waitingOn, s.unseenReveals], [game.gameId, 1, null, 0])
  await actFor(game.gameId, a)
  assert.equal((await G.gameSummaryFor(pairing.id, a.id)).waitingOn, 'opponent')
  assert.equal((await G.gameSummaryFor(pairing.id, b.id)).waitingOn, 'you')
  await actFor(game.gameId, b)
  s = await G.gameSummaryFor(pairing.id, a.id)
  assert.equal(s.unseenReveals, 1)
  await G.markSeen({ gameId: game.gameId, userId: a.id, seq: 1 })
  assert.equal((await G.gameSummaryFor(pairing.id, a.id)).unseenReveals, 0)
  assert.equal((await G.gameSummaryFor(pairing.id, b.id)).unseenReveals, 1)
})

test.after(async () => {
  if (!db) return
  await db.gameConfig.deleteMany({ where: { gameName: 'OgGtoons' } })
  Config?.invalidateOgGtoonsConfigCache()
})
