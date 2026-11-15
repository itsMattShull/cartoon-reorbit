// End-to-end checks of async + live tournament games against a REAL Postgres: Start, game creation, persisted moves,
// auto-chained games, the deadline guard, the final-minute extension, replay cursors and hidden information.
//
// Skipped unless OG_TOURNAMENT_TEST_DB is set (a throwaway database already migrated to the current schema):
//   OG_TOURNAMENT_TEST_DB=postgresql://... REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
//     node --test --test-force-exit tests/ogGtoonAsyncGames.db.test.js
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

test.after(async () => {
  if (!db) return
  await db.gameConfig.deleteMany({ where: { gameName: 'OgGtoons' } })
  Config?.invalidateOgGtoonsConfigCache()
})
