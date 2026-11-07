// End-to-end checks of the OG gToons tournament orchestration against a REAL Postgres.
//
// Skipped unless OG_TOURNAMENT_TEST_DB is set (a throwaway database already migrated to the current
// schema), so a plain `npm test` stays database-free:
//
//   OG_TOURNAMENT_TEST_DB=postgresql://... REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
//     node --test tests/ogGtoonTournament.db.test.js
//
// Games are simulated by inserting OgGtoonMatch rows (exactly what the socket server persists), then
// running the same code the worker runs.
import test from 'node:test'
import assert from 'node:assert/strict'

const URL = process.env.OG_TOURNAMENT_TEST_DB
const run = URL ? test : test.skip

let db
let core
let T
let Live
let seq = 0

async function setup() {
  if (db) return
  process.env.DATABASE_URL = URL
  process.env.MINT_QUEUE_KEY = process.env.MINT_QUEUE_KEY || 'testMintQueue'
  process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379'
  ;({ prisma: db } = await import('../server/prisma.js'))
  T = await import('../server/utils/ogGtoonTournament.js')
  Live = await import('../server/utils/ogGtoonTournamentLive.js')
  core = await import('../server/utils/tournamentCore.js')
}

async function mkUsers(n) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    seq += 1
    out.push(await db.user.create({ data: { discordId: `d${Date.now()}${seq}`, username: `tester${Date.now()}_${seq}` } }))
  }
  return out
}

async function mkTournament(users, over = {}) {
  const t = await db.ogGtoonTournament.create({
    data: {
      name: `Test ${seq++}`, status: 'OPT_IN_OPEN',
      optInStartAt: new Date(Date.now() - 86400000), optInEndAt: new Date(Date.now() - 1000),
      announcementChannelId: '', ...over
    }
  })
  const deck = Array.from({ length: 12 }, (_, i) => ({ position: i, ctoonId: `c${i}`, userCtoonId: `uc${i}`, lockedAt: new Date().toISOString() }))
  for (const u of users) {
    await db.ogGtoonTournamentOptIn.create({ data: { tournamentId: t.id, userId: u.id, deckSnapshotJson: deck } })
  }
  return t
}

/** Inserts the finished games a worker would see for a pairing, then scores + advances. */
async function playSeries(matchId, games /* e.g. ['A','A'] */) {
  const m = await db.ogGtoonTournamentMatch.findUnique({ where: { id: matchId } })
  for (const g of games) {
    const aWins = g === 'A'
    const tie = g === 'TIE'
    await db.ogGtoonMatch.create({
      data: {
        player1UserId: m.playerAUserId, player2UserId: m.playerBUserId,
        player1DeckSnapshot: [], player2DeckSnapshot: [], player1GoalColor: 'RED', player2GoalColor: 'BLUE',
        player1Score: aWins ? 30 : 20, player2Score: aWins ? 20 : 30, roundLog: [],
        winnerUserId: tie ? null : aWins ? m.playerAUserId : m.playerBUserId,
        outcome: tie ? 'TIE' : aWins ? 'PLAYER1' : 'PLAYER2',
        startedAt: new Date(Date.now() - 60000), endedAt: new Date(), tournamentMatchId: matchId
      }
    })
  }
  return Live.settleMatchFromGames(matchId)
}

async function openMatches(tournamentId) {
  return db.ogGtoonTournamentMatch.findMany({ where: { tournamentId, status: { in: ['PENDING', 'IN_PROGRESS'] }, lockedAt: null }, orderBy: [{ roundNumber: 'asc' }, { tableNumber: 'asc' }] })
}

async function close(t, users) {
  const events = await T.processStateTransitions(db)
  assert.ok(events.length)
  return db.ogGtoonTournament.findUnique({ where: { id: t.id } })
}

run('a 6-player bracket runs to a winner; best-of-3 ends at 2 wins; small field pays only first prize', async () => {
  await setup()
  const users = await mkUsers(6)
  const t = await mkTournament(users, {
    firstPrizeJson: { points: 500, ctoons: [], backgrounds: [] },
    top8PrizeJson: { points: 100, ctoons: [], backgrounds: [] },
    requirePrizeApproval: false
  })
  const closed = await close(t, users)
  assert.equal(closed.status, 'BRACKET_ACTIVE')
  assert.equal(closed.format, 'BRACKET_8_OR_LESS')

  // 6 players -> size 8: seeds 1 and 2 get byes, so only two real matches in round 1.
  let guard = 0
  while (guard++ < 10) {
    const open = await openMatches(t.id)
    if (!open.length) break
    for (const m of open) {
      assert.equal(m.bestOf, 3)
      const r = await playSeries(m.id, ['A', 'B', 'A']) // 2-1
      assert.equal(r.decided, true)
      const fresh = await db.ogGtoonTournamentMatch.findUnique({ where: { id: m.id } })
      assert.deepEqual([fresh.winsA, fresh.winsB, fresh.gamesCounted], [2, 1, 3])
      assert.equal(fresh.winnerUserId, m.playerAUserId)
    }
    await T.advanceAndNotify(db, t.id)
  }
  const done = await db.ogGtoonTournament.findUnique({ where: { id: t.id } })
  assert.equal(done.status, 'COMPLETE')
  assert.ok(done.winnerUserId)
  assert.equal(done.finalPlacementsJson.length, 6)
  assert.equal(done.finalPlacementsJson[0].place, 1)

  const grants = await db.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id } })
  assert.deepEqual(grants.map(g => g.tier), ['FIRST'], 'a 6-player field must not pay the top-8 prize')
  assert.equal(grants[0].userId, done.winnerUserId)

  await T.processPrizeGrants(db)
  const paid = await db.ogGtoonTournamentPrizeGrant.findUnique({ where: { id: grants[0].id } })
  assert.equal(paid.status, 'PAID')
  const pts = await db.userPoints.findUnique({ where: { userId: done.winnerUserId } })
  assert.equal(pts.points, 500)

  // Paying again must not double-pay.
  await T.processPrizeGrants(db)
  assert.equal((await db.userPoints.findUnique({ where: { userId: done.winnerUserId } })).points, 500)
})

run('a 10-player field plays Swiss without rematches, cuts to Top 8, and pays both prize tiers after approval', async () => {
  await setup()
  const users = await mkUsers(10)
  const t = await mkTournament(users, {
    firstPrizeJson: { points: 1000, ctoons: [], backgrounds: [] },
    top8PrizeJson: { points: 50, ctoons: [], backgrounds: [] }
  })
  const closed = await close(t, users)
  assert.equal(closed.status, 'SWISS_ACTIVE')
  assert.equal(closed.format, 'SWISS_THEN_TOP8')
  assert.equal(closed.swissRoundsPlanned, 4)

  let rounds = 0
  while (rounds++ < 12) {
    const open = await openMatches(t.id)
    if (!open.length) break
    for (const m of open) await playSeries(m.id, ['A', 'A'])
    await T.advanceAndNotify(db, t.id)
  }
  const done = await db.ogGtoonTournament.findUnique({ where: { id: t.id } })
  assert.equal(done.status, 'COMPLETE')

  const swiss = await db.ogGtoonTournamentMatch.findMany({ where: { tournamentId: t.id, stage: 'SWISS' } })
  const seen = new Set()
  for (const m of swiss.filter(x => x.status !== 'BYE')) {
    const k = core.pairKey(m.playerAUserId, m.playerBUserId)
    assert.ok(!seen.has(k), 'no rematch in Swiss')
    seen.add(k)
  }
  assert.equal(new Set(swiss.map(m => m.roundNumber)).size, 4)
  const byes = swiss.filter(x => x.status === 'BYE')
  assert.equal(new Set(byes.map(b => b.playerAUserId)).size, byes.length, 'nobody gets two byes')
  const bracket = await db.ogGtoonTournamentMatch.findMany({ where: { tournamentId: t.id, stage: 'BRACKET', roundNumber: 1 } })
  assert.equal(bracket.length, 4, 'Top 8 starts as four matches')

  const grants = await db.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id } })
  assert.equal(grants.filter(g => g.tier === 'FIRST').length, 1)
  assert.equal(grants.filter(g => g.tier === 'TOP8').length, 7)
  assert.ok(grants.every(g => g.status === 'PENDING_APPROVAL'), 'held for approval by default')

  await T.processPrizeGrants(db)
  assert.ok((await db.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id } })).every(g => g.status === 'PENDING_APPROVAL'), 'nothing pays before approval')

  await T.approvePrizeGrants(db, { tournamentId: t.id, adminId: 'admin' })
  await T.processPrizeGrants(db)
  const after = await db.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id } })
  assert.ok(after.every(g => g.status === 'PAID'))
})

run('voided games are replayed, a decided series ignores late games, and forfeits/admin results lock', async () => {
  await setup()
  const users = await mkUsers(4)
  const t = await mkTournament(users)
  await close(t, users)
  const [m1, m2] = await openMatches(t.id)

  // A voided game does not count toward the series.
  const m = await db.ogGtoonTournamentMatch.findUnique({ where: { id: m1.id } })
  await db.ogGtoonMatch.create({
    data: {
      player1UserId: m.playerAUserId, player2UserId: m.playerBUserId, player1DeckSnapshot: [], player2DeckSnapshot: [],
      player1GoalColor: 'RED', player2GoalColor: 'BLUE', roundLog: [], outcome: 'INCOMPLETE',
      startedAt: new Date(Date.now() - 3600000), endedAt: new Date(), tournamentMatchId: m1.id
    }
  })
  let r = await Live.settleMatchFromGames(m1.id)
  assert.equal(r.decided, false)
  assert.equal((await db.ogGtoonTournamentMatch.findUnique({ where: { id: m1.id } })).voidedGames, 1)

  r = await playSeries(m1.id, ['B', 'B'])
  assert.equal(r.decided, true)
  // A third game arriving after the series is decided changes nothing.
  await playSeries(m1.id, ['A'])
  const fin = await db.ogGtoonTournamentMatch.findUnique({ where: { id: m1.id } })
  assert.deepEqual([fin.winsA, fin.winsB, fin.outcome], [0, 2, 'B_WIN'])

  // Forfeit by a player: opponent takes it 2-0, and it can't be forfeited twice.
  const f = await T.forfeitMatch(db, { tournamentId: t.id, matchId: m2.id, userId: m2.playerAUserId })
  assert.equal(f.ok, true)
  const f2 = await T.forfeitMatch(db, { tournamentId: t.id, matchId: m2.id, userId: m2.playerBUserId })
  assert.equal(f2.ok, false)
  const fm = await db.ogGtoonTournamentMatch.findUnique({ where: { id: m2.id } })
  assert.equal(fm.winnerUserId, m2.playerBUserId)
  assert.equal(fm.resolution, 'FORFEIT')

  // A late game cannot overturn the forfeit.
  await playSeries(m2.id, ['A', 'A'])
  assert.equal((await db.ogGtoonTournamentMatch.findUnique({ where: { id: m2.id } })).winnerUserId, m2.playerBUserId)
})

run('admin can set a winner on any open pairing, reopen it while nothing is built on it, and void a game', async () => {
  await setup()
  const users = await mkUsers(4)
  const t = await mkTournament(users)
  await close(t, users)
  const [m1, m2] = await openMatches(t.id)

  assert.equal((await T.adminSetMatchResult(db, { tournamentId: t.id, matchId: m1.id, outcome: 'A_WIN', note: '' })).ok, false, 'reason required')
  assert.equal((await T.adminSetMatchResult(db, { tournamentId: t.id, matchId: m1.id, outcome: 'TIE', note: 'x' })).ok, false, 'bracket cannot draw')
  const ok = await T.adminSetMatchResult(db, { tournamentId: t.id, matchId: m1.id, outcome: 'B_WIN', note: 'player was disconnected' })
  assert.equal(ok.ok, true)
  const set = await db.ogGtoonTournamentMatch.findUnique({ where: { id: m1.id } })
  assert.deepEqual([set.outcome, set.resolution, set.winsB], ['B_WIN', 'ADMIN', 2])
  assert.equal((await T.adminSetMatchResult(db, { tournamentId: t.id, matchId: m1.id, outcome: 'A_WIN', note: 'again' })).ok, false, 'already decided')

  // Reopen works while the other semifinal is unfinished (no later round yet).
  const re = await T.adminReopenMatch(db, { tournamentId: t.id, matchId: m1.id })
  assert.equal(re.ok, true)
  assert.equal((await db.ogGtoonTournamentMatch.findUnique({ where: { id: m1.id } })).lockedAt, null)

  // Void a played game, then it is replayed.
  await playSeries(m1.id, ['A'])
  const game = await db.ogGtoonMatch.findFirst({ where: { tournamentMatchId: m1.id } })
  assert.equal((await T.adminVoidGame(db, { tournamentId: t.id, matchId: m1.id, gameId: game.id })).ok, true)
  assert.equal((await db.ogGtoonTournamentMatch.findUnique({ where: { id: m1.id } })).gamesCounted, 0)

  // Finish both semifinals; the final exists; the semifinal can no longer be reopened.
  await T.adminSetMatchResult(db, { tournamentId: t.id, matchId: m1.id, outcome: 'A_WIN', note: 'ok' })
  await T.adminSetMatchResult(db, { tournamentId: t.id, matchId: m2.id, outcome: 'A_WIN', note: 'ok' })
  await T.advanceAndNotify(db, t.id)
  assert.equal((await db.ogGtoonTournamentMatch.count({ where: { tournamentId: t.id, roundNumber: 2 } })), 1)
  const late = await T.adminReopenMatch(db, { tournamentId: t.id, matchId: m1.id })
  assert.equal(late.ok, false)
})

run('deadlines: walkover for the player who showed, a Swiss double no-show is a double loss, level bracket needs an admin', async () => {
  await setup()
  const users = await mkUsers(10)
  const t = await mkTournament(users)
  await close(t, users)
  const open = await openMatches(t.id)
  assert.equal(open.length, 5)

  const past = new Date(Date.now() - 1000)
  await db.ogGtoonTournamentMatch.updateMany({ where: { tournamentId: t.id }, data: { dueAt: past } })
  // Pairing 0: A readied up a while ago, B never did -> A wins by walkover.
  await db.ogGtoonTournamentMatch.update({ where: { id: open[0].id }, data: { readyAAt: new Date(Date.now() - 3600000) } })
  // Pairing 1: one game played, 1-0 for B -> B wins at the deadline.
  await playSeries(open[1].id, ['B'])

  await T.processDeadlines(db)
  const w = await db.ogGtoonTournamentMatch.findUnique({ where: { id: open[0].id } })
  assert.deepEqual([w.resolution, w.outcome, w.winsA], ['WALKOVER', 'A_WIN', 2])
  const lead = await db.ogGtoonTournamentMatch.findUnique({ where: { id: open[1].id } })
  assert.deepEqual([lead.resolution, lead.outcome], ['DEADLINE', 'B_WIN'])
  const dbl = await db.ogGtoonTournamentMatch.findUnique({ where: { id: open[2].id } })
  assert.equal(dbl.outcome, null)
  assert.equal(dbl.status, 'COMPLETE')

  await T.recomputeRecords(db, t.id)
  const recs = await db.ogGtoonTournamentPlayerRecord.findMany({ where: { tournamentId: t.id, userId: { in: [dbl.playerAUserId, dbl.playerBUserId] } } })
  assert.ok(recs.every(r => r.points === 0 && r.swissLosses === 1), 'double no-show: 0 points and a loss each')
})

run('a banned entrant is disqualified and their open pairing goes to the opponent', async () => {
  await setup()
  const users = await mkUsers(4)
  const t = await mkTournament(users)
  await close(t, users)
  const [m1] = await openMatches(t.id)
  await db.user.update({ where: { id: m1.playerAUserId }, data: { banned: true } })
  const touched = await T.processBannedEntrants(db)
  assert.ok(touched.includes(t.id))
  const m = await db.ogGtoonTournamentMatch.findUnique({ where: { id: m1.id } })
  assert.deepEqual([m.outcome, m.resolution], ['B_WIN', 'ADMIN'])
})

/* ── Play / ready-up / game start (socket module with a fake socket layer) ───────────────── */

async function mkDeckFor(user, tag) {
  const ctoons = []
  for (let i = 0; i < 12; i += 1) {
    ctoons.push(await db.ctoon.create({
      data: {
        name: `${tag}-card-${i}`, type: 'gtoon', rarity: 'Common', assetPath: `/x/${tag}${i}.png`,
        isOgGtoon: true, gtoonColor: 'RED', gtoonValue: i + 1
      }
    }))
  }
  const copies = []
  for (const c of ctoons) copies.push(await db.userCtoon.create({ data: { userId: user.id, ctoonId: c.id } }))
  const deck = await db.ogGtoonDeck.create({
    data: { userId: user.id, name: `${tag} deck`, cards: { create: ctoons.map((c, i) => ({ ctoonId: c.id, position: i })) } }
  })
  return { ctoons, copies, deck }
}

run('locking a deck pins specific copies and rejects invalid decks; a moved copy is flagged', async () => {
  await setup()
  const [u, other] = await mkUsers(2)
  const { deck, copies, ctoons } = await mkDeckFor(u, 'lock')

  const ok = await Live.lockTournamentDeck(u.id, deck.id)
  assert.equal(ok.snapshot.length, 12)
  assert.deepEqual(ok.snapshot.map(s => s.userCtoonId).sort(), copies.map(c => c.id).sort())
  assert.ok((await Live.lockTournamentDeck(other.id, deck.id)).error, 'someone else\'s deck')
  assert.ok((await Live.lockTournamentDeck(u.id, 'nope')).error)

  const good = await Live.loadLockedDeckForGame(u.id, ok.snapshot)
  assert.equal(good.valid, true)
  assert.equal(good.deck.length, 12)
  assert.equal(good.deck[3].ctoonId, ctoons[3].id)

  // Lend a card: it changes hands (and the owner log notes it), then comes back.
  const lent = ok.snapshot[5]
  await db.userCtoon.update({ where: { id: lent.userCtoonId }, data: { userId: other.id } })
  let bad = await Live.loadLockedDeckForGame(u.id, ok.snapshot)
  assert.deepEqual([bad.valid, bad.missing], [false, [5]])
  await db.ctoonOwnerLog.create({ data: { userId: other.id, userCtoonId: lent.userCtoonId, ctoonId: lent.ctoonId, method: 'TRADE' } })
  await db.userCtoon.update({ where: { id: lent.userCtoonId }, data: { userId: u.id } })
  await db.ctoonOwnerLog.create({ data: { userId: u.id, userCtoonId: lent.userCtoonId, ctoonId: lent.ctoonId, method: 'TRADE' } })
  bad = await Live.loadLockedDeckForGame(u.id, ok.snapshot)
  assert.deepEqual([bad.valid, bad.missing, bad.moved], [false, [], [5]], 'handing a card back does not clear the flag')

  // A card burned after locking is missing.
  await db.userCtoon.update({ where: { id: ok.snapshot[1].userCtoonId }, data: { burnedAt: new Date() } })
  bad = await Live.loadLockedDeckForGame(u.id, ok.snapshot)
  assert.ok(bad.missing.includes(1))
})

run('Play: nothing starts until BOTH are ready and online; the game starts at zero stake from the locked decks', async () => {
  await setup()
  await db.gameConfig.upsert({
    where: { gameName: 'OgGtoons' },
    create: { gameName: 'OgGtoons', ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true },
    update: { ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true }
  })
  const { registerOgGtoonsTournament } = await import('../server/utils/ogGtoonsTournamentSocket.js')

  const users = await mkUsers(2)
  const decks = []
  const snaps = []
  for (const [i, u] of users.entries()) {
    decks.push(await mkDeckFor(u, `play${i}`))
    snaps.push((await Live.lockTournamentDeck(u.id, decks[i].deck.id)).snapshot)
  }
  const t = await db.ogGtoonTournament.create({
    data: { name: 'Play Cup', status: 'OPT_IN_OPEN', optInStartAt: new Date(Date.now() - 86400000), optInEndAt: new Date(Date.now() - 1000), announcementChannelId: '' }
  })
  for (const [i, u] of users.entries()) {
    await db.ogGtoonTournamentOptIn.create({ data: { tournamentId: t.id, userId: u.id, deckSnapshotJson: snaps[i] } })
  }
  await T.processStateTransitions(db)
  const [pairing] = await openMatches(t.id)
  const [pa, pb] = [pairing.playerAUserId, pairing.playerBUserId]

  // Fake socket layer.
  const online = new Map()
  const emitted = []
  const started = []
  const handlers = {}
  let acting = null
  const mkSocket = (uid) => ({ id: `s-${uid}`, emit: (ev, p) => emitted.push({ uid, ev, p }) })
  const io = {
    in: (room) => ({ local: { fetchSockets: async () => online.get(room.split(':').pop()) || [] } }),
    local: { to: (room) => ({ emit: (ev, p) => emitted.push({ room, ev, p }) }) }
  }
  const mySocket = { id: 'me', on: (ev, fn) => { handlers[ev] = fn }, emit: (ev, p) => emitted.push({ me: true, ev, p }) }
  const matchByUser = new Map()
  const queueByUser = new Map()
  registerOgGtoonsTournament(io, mySocket, {
    auth: async () => acting,
    startMatch: async (_io, a, b, opts) => { started.push({ a, b, opts }); return { id: opts.matchId } },
    matchByUser, queueByUser, removeFromQueue: (uid) => queueByUser.delete(uid),
    userRoom: (uid) => `oggtoons:user:${uid}`, isPracticing: () => false, EV: (n) => `oggtoons:${n}`
  })
  const userA = users.find(u => u.id === pa)
  const userB = users.find(u => u.id === pb)
  const press = async (u) => { acting = u; await handlers['oggtoons:tournamentReady']({ tournamentMatchId: pairing.id }) }
  const errors = () => emitted.filter(e => e.ev === 'oggtoons:error').map(e => e.p.code)

  // A readies; B is offline -> no game, B is queued for a DM instead.
  online.set(pa, [mkSocket(pa)])
  await press(userA)
  assert.equal(started.length, 0)
  assert.ok((await db.ogGtoonTournamentMatch.findUnique({ where: { id: pairing.id } })).readyAAt, 'ready is stored in the database')

  // B comes online but A's ready-up only counts, so B pressing Play starts the game.
  online.set(pb, [mkSocket(pb)])
  await press(userB)
  assert.equal(started.length, 1)
  const { a, b, opts } = started[0]
  assert.equal(a.stake, 0)
  assert.equal(b.stake, 0)
  assert.equal(a.deckSnapshot.length, 12)
  assert.equal(opts.tournament.matchId, pairing.id)
  assert.equal(opts.tournament.gameNumber, 1)
  assert.equal(opts.isChallenge, false)
  const live = await db.ogGtoonTournamentMatch.findUnique({ where: { id: pairing.id } })
  assert.equal(live.liveMatchId, opts.matchId)
  assert.equal(live.status, 'IN_PROGRESS')
  assert.equal(live.readyAAt, null, 'starting consumes both ready-ups')

  // While a game is live a second Play is refused and cannot start a second game.
  await press(userA)
  assert.ok(errors().includes('gameLive'))
  assert.equal(started.length, 1)

  // The game ends (worker clears the marker); a lent card then blocks the next game with a clear error.
  await Live.clearLive(pairing.id, opts.matchId)
  const lentSlot = snaps[0].find(s => true)
  const owner = users.find(u => u.id === pa)
  await db.userCtoon.update({ where: { id: snaps.find((_, i) => users[i].id === pa)[2].userCtoonId }, data: { userId: pb } })
  emitted.length = 0
  await press(owner)
  assert.ok(errors().includes('badLockedDeck'))
  assert.equal(started.length, 1)

  // Not a player in this match -> refused.
  const [stranger] = await mkUsers(1)
  emitted.length = 0
  await press(stranger)
  assert.ok(errors().includes('notYours'))
})

run('deck repair: only flagged slots, a different copy each, never mid-series, and a lent card cannot be re-picked', async () => {
  await setup()
  const [u, other] = await mkUsers(2)
  const { deck, ctoons } = await mkDeckFor(u, 'rep')
  const { snapshot } = await Live.lockTournamentDeck(u.id, deck.id)
  const t = await db.ogGtoonTournament.create({
    data: { name: 'Repair Cup', status: 'OPT_IN_CLOSED', optInStartAt: new Date(Date.now() - 86400000), optInEndAt: new Date(Date.now() - 1000), announcementChannelId: '' }
  })
  await db.ogGtoonTournamentOptIn.create({ data: { tournamentId: t.id, userId: u.id, deckSnapshotJson: snapshot } })

  // Nothing wrong yet.
  assert.equal((await T.repairLockedDeck(db, { tournamentId: t.id, userId: u.id, replacements: [] })).ok, false)

  // Lend slot 4's card away and back (flagged as moved) and sell slot 7's card.
  const s4 = snapshot[4]
  await db.ctoonOwnerLog.create({ data: { userId: other.id, userCtoonId: s4.userCtoonId, ctoonId: s4.ctoonId, method: 'TRADE' } })
  await db.userCtoon.update({ where: { id: snapshot[7].userCtoonId }, data: { userId: other.id } })

  // Spare cards the player could swap in.
  const spare = await db.ctoon.create({ data: { name: 'spare', type: 'gtoon', rarity: 'Common', assetPath: '/x/spare.png', isOgGtoon: true, gtoonColor: 'RED', gtoonValue: 5 } })
  const spare2 = await db.ctoon.create({ data: { name: 'spare2', type: 'gtoon', rarity: 'Common', assetPath: '/x/spare2.png', isOgGtoon: true, gtoonColor: 'RED', gtoonValue: 5 } })
  await db.userCtoon.create({ data: { userId: u.id, ctoonId: spare.id } })
  await db.userCtoon.create({ data: { userId: u.id, ctoonId: spare2.id } })

  const bad = (r) => assert.equal(r.ok, false)
  bad(await T.repairLockedDeck(db, { tournamentId: t.id, userId: u.id, replacements: [{ position: 7, ctoonId: spare.id }] }))                       // slot 4 not replaced
  bad(await T.repairLockedDeck(db, { tournamentId: t.id, userId: u.id, replacements: [{ position: 4, ctoonId: spare.id }, { position: 7, ctoonId: spare.id }] })) // same card twice
  bad(await T.repairLockedDeck(db, { tournamentId: t.id, userId: u.id, replacements: [{ position: 4, ctoonId: ctoons[0].id }, { position: 7, ctoonId: spare.id }] })) // duplicates a kept card

  // The very copy that was lent out cannot be chosen again for its own slot.
  const same = await T.repairLockedDeck(db, { tournamentId: t.id, userId: u.id, replacements: [{ position: 4, ctoonId: s4.ctoonId }, { position: 7, ctoonId: spare.id }] })
  bad(same)

  const ok = await T.repairLockedDeck(db, { tournamentId: t.id, userId: u.id, replacements: [{ position: 4, ctoonId: spare.id }, { position: 7, ctoonId: spare2.id }] })
  assert.deepEqual([ok.ok, ok.replaced], [true, 2])
  const opt = await db.ogGtoonTournamentOptIn.findFirst({ where: { tournamentId: t.id, userId: u.id } })
  assert.equal(opt.repairCount, 1)
  assert.equal((await Live.loadLockedDeckForGame(u.id, opt.deckSnapshotJson)).valid, true)

  // Mid-series: no repairs.
  await db.ogGtoonTournament.update({ where: { id: t.id }, data: { status: 'BRACKET_ACTIVE' } })
  const r = await db.ogGtoonTournamentRound.create({ data: { tournamentId: t.id, stage: 'BRACKET', roundNumber: 1 } })
  await db.ogGtoonTournamentMatch.create({ data: { tournamentId: t.id, roundId: r.id, stage: 'BRACKET', roundNumber: 1, tableNumber: 1, playerAUserId: u.id, playerBUserId: other.id, status: 'IN_PROGRESS', gamesCounted: 1, winsA: 1 } })
  await db.userCtoon.update({ where: { id: opt.deckSnapshotJson[0].userCtoonId }, data: { burnedAt: new Date() } })
  const mid = await T.repairLockedDeck(db, { tournamentId: t.id, userId: u.id, replacements: [{ position: 0, ctoonId: spare.id }] })
  assert.equal(mid.ok, false)
  assert.match(mid.message, /middle of a series/)
})

run('the cron entry point does everything in order: close opt-in, score unscored games, advance, remind, pay', async () => {
  await setup()
  const users = await mkUsers(4)
  const t = await mkTournament(users, { firstPrizeJson: { points: 25, ctoons: [], backgrounds: [] }, requirePrizeApproval: false })

  await T.runOgGtoonTournamentScheduler(db)
  assert.equal((await db.ogGtoonTournament.findUnique({ where: { id: t.id } })).status, 'BRACKET_ACTIVE')
  let open = await openMatches(t.id)
  assert.equal(open.length, 2)

  // Games finished while the queue job was lost: the cron still finds, scores and advances them.
  for (const m of open) {
    for (const g of ['A', 'A']) {
      await db.ogGtoonMatch.create({
        data: {
          player1UserId: m.playerAUserId, player2UserId: m.playerBUserId, player1DeckSnapshot: [], player2DeckSnapshot: [],
          player1GoalColor: 'RED', player2GoalColor: 'BLUE', roundLog: [], player1Score: 30, player2Score: 20,
          winnerUserId: m.playerAUserId, outcome: 'PLAYER1', startedAt: new Date(Date.now() - 60000), endedAt: new Date(), tournamentMatchId: m.id
        }
      })
    }
  }
  await T.runOgGtoonTournamentScheduler(db)
  open = await openMatches(t.id)
  assert.equal(open.length, 1, 'the final is up')
  const fin = open[0]

  // A reminder goes out for a pairing due within 24h, once.
  await db.ogGtoonTournamentMatch.update({ where: { id: fin.id }, data: { dueAt: new Date(Date.now() + 3 * 3600000) } })
  await T.runOgGtoonTournamentScheduler(db)
  const rem = await db.ogGtoonTournamentMatch.findUnique({ where: { id: fin.id } })
  assert.ok(rem.reminder24SentAt && rem.reminder4SentAt)

  for (const g of ['B', 'B']) {
    await db.ogGtoonMatch.create({
      data: {
        player1UserId: fin.playerAUserId, player2UserId: fin.playerBUserId, player1DeckSnapshot: [], player2DeckSnapshot: [],
        player1GoalColor: 'RED', player2GoalColor: 'BLUE', roundLog: [], player1Score: 10, player2Score: 40,
        winnerUserId: fin.playerBUserId, outcome: 'PLAYER2', startedAt: new Date(Date.now() - 30000), endedAt: new Date(), tournamentMatchId: fin.id
      }
    })
  }
  await T.runOgGtoonTournamentScheduler(db)
  const done = await db.ogGtoonTournament.findUnique({ where: { id: t.id } })
  assert.equal(done.status, 'COMPLETE')
  assert.equal(done.winnerUserId, fin.playerBUserId)
  const grant = await db.ogGtoonTournamentPrizeGrant.findFirst({ where: { tournamentId: t.id } })
  assert.equal(grant.status, 'PAID')
  assert.equal((await db.userPoints.findUnique({ where: { userId: done.winnerUserId } })).points, 25)
})

/* ── pack prizes + participation prize ─────────────────────────────────────────────────── */

async function mkPack(name) {
  return db.pack.create({
    data: { name, inCmart: false, rarityConfigs: { create: [{ rarity: 'Common', count: 1, probabilityPercent: 100 }] } }
  })
}

run('pack prizes: winner gets packs, every other player gets the participation pack, each exactly once', async () => {
  await setup()
  const users = await mkUsers(6)
  const winPack = await mkPack(`Winner pack ${seq}`)
  const partPack = await mkPack(`Participant pack ${seq}`)
  const t = await mkTournament(users, {
    firstPrizeJson: { points: 0, ctoons: [], backgrounds: [], packs: [{ packId: winPack.id, quantity: 2 }] },
    participantPrizeJson: { points: 0, ctoons: [], backgrounds: [], packs: [{ packId: partPack.id, quantity: 1 }] },
    requirePrizeApproval: false
  })
  const closed = await close(t, users)
  assert.equal(closed.format, 'BRACKET_8_OR_LESS')

  let guard = 0
  while (guard++ < 10) {
    const open = await openMatches(t.id)
    if (!open.length) break
    for (const m of open) await playSeries(m.id, ['A', 'A'])
    await T.advanceAndNotify(db, t.id)
  }
  const done = await db.ogGtoonTournament.findUnique({ where: { id: t.id } })
  assert.equal(done.status, 'COMPLETE')

  // 6 players, no Top 8 prize: one FIRST and five PARTICIPANT, and nobody is queued twice.
  const grants = await db.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id } })
  assert.equal(grants.length, 6)
  assert.deepEqual(grants.map(g => g.tier).sort(), ['FIRST', 'PARTICIPANT', 'PARTICIPANT', 'PARTICIPANT', 'PARTICIPANT', 'PARTICIPANT'])
  assert.equal(new Set(grants.map(g => g.userId)).size, 6)
  assert.ok(grants.every(g => g.status === 'PENDING'), 'approval is off, so they are payable straight away')

  await T.processPrizeGrants(db)
  const paid = await db.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id } })
  assert.ok(paid.every(g => g.status === 'PAID'), JSON.stringify(paid.map(g => [g.tier, g.status, g.errorMessage])))

  const winnerGrant = paid.find(g => g.tier === 'FIRST')
  const winnerPacks = await db.userPack.findMany({ where: { userId: winnerGrant.userId } })
  assert.equal(winnerPacks.length, 2, 'the winner gets the 1st-place packs and NOT the participation pack too')
  for (const p of winnerPacks) {
    assert.equal(p.packId, winPack.id)
    assert.equal(p.source, 'OG_GTOONS_TOURNAMENT')
    assert.equal(p.sourceRef, winnerGrant.id, 'keyed to the prize grant, which is what makes a re-run harmless')
    assert.equal(p.opened, false)
  }
  assert.deepEqual(winnerPacks.map(p => p.sourceOrdinal).sort(), [0, 1])
  assert.deepEqual(winnerGrant.summaryJson.packs, [{ packId: winPack.id, name: winPack.name, quantity: 2 }])
  const log = await db.packOwnerLog.findMany({ where: { userPackId: { in: winnerPacks.map(p => p.id) } } })
  assert.equal(log.length, 2)
  assert.ok(log.every(l => l.method === 'OG_GTOONS_TOURNAMENT' && l.userId === winnerGrant.userId))

  for (const g of paid.filter(x => x.tier === 'PARTICIPANT')) {
    const mine = await db.userPack.findMany({ where: { userId: g.userId } })
    assert.deepEqual(mine.map(p => p.packId), [partPack.id])
    assert.equal(mine[0].source, 'OG_GTOONS_TOURNAMENT')
  }

  // Running the payout again (cron, double click on Approve) must not hand out a second set.
  await T.processPrizeGrants(db)
  await T.processPrizeGrants(db)
  const all = await db.userPack.findMany({ where: { userId: { in: users.map(u => u.id) } } })
  assert.equal(all.length, 2 + 5)
})

run('pack prizes: a pack that cannot be granted rolls the whole prize back, so a retry cannot double-pay the points', async () => {
  await setup()
  const [u] = await mkUsers(1)
  const t = await mkTournament([u], { requirePrizeApproval: false })
  const grant = await db.ogGtoonTournamentPrizeGrant.create({
    data: {
      tournamentId: t.id, userId: u.id, tier: 'PARTICIPANT', place: 3, status: 'PENDING',
      // A pack id that does not exist (deleted after the tournament was set up): the pack insert hits the foreign key.
      rewardJson: { points: 40, ctoons: [], backgrounds: [], packs: [{ packId: '00000000-0000-4000-8000-000000000000', quantity: 1 }] }
    }
  })
  await T.processPrizeGrants(db)
  const after = await db.ogGtoonTournamentPrizeGrant.findUnique({ where: { id: grant.id } })
  assert.equal(after.status, 'FAILED')
  assert.ok(after.errorMessage)
  assert.equal(await db.userPack.count({ where: { userId: u.id } }), 0)
  const pts = await db.userPoints.findUnique({ where: { userId: u.id } })
  assert.ok(!pts || pts.points === 0, 'the points half of the prize was rolled back with the failed packs')
})

run('pack prizes: a prize that is only invalid pack rows is skipped, not paid as nothing', async () => {
  await setup()
  const [u] = await mkUsers(1)
  const pack = await mkPack(`Zero pack ${seq}`)
  const t = await mkTournament([u], { requirePrizeApproval: false })
  const grant = await db.ogGtoonTournamentPrizeGrant.create({
    data: {
      tournamentId: t.id, userId: u.id, tier: 'PARTICIPANT', place: 1, status: 'PENDING',
      rewardJson: { points: 0, ctoons: [], backgrounds: [], packs: [{ packId: pack.id, quantity: 0 }] }
    }
  })
  await T.processPrizeGrants(db)
  assert.equal((await db.ogGtoonTournamentPrizeGrant.findUnique({ where: { id: grant.id } })).status, 'SKIPPED')
  assert.equal(await db.userPack.count({ where: { userId: u.id } }), 0)
})

run('pack prizes: a participation-only tournament queues nothing for a player who never played a game', async () => {
  await setup()
  const users = await mkUsers(4)
  const pack = await mkPack(`Participation pack ${seq}`)
  const t = await mkTournament(users, {
    participantPrizeJson: { points: 0, ctoons: [], backgrounds: [], packs: [{ packId: pack.id, quantity: 1 }] },
    requirePrizeApproval: false
  })
  await close(t, users)
  // Semi 1 is played. Semi 2 is decided by an admin without a game, so its loser never plays a counted game.
  const open = await openMatches(t.id)
  assert.equal(open.length, 2)
  await playSeries(open[0].id, ['A', 'A'])
  const res = await T.adminSetMatchResult(db, { tournamentId: t.id, matchId: open[1].id, outcome: 'A_WIN', note: 'test: nobody showed up to play' })
  assert.equal(res.ok, true, res.message)
  const neverPlayed = open[1].playerBUserId
  await T.advanceAndNotify(db, t.id)
  assert.equal(await db.ogGtoonTournamentPrizeGrant.count({ where: { tournamentId: t.id } }), 0, 'nothing is queued until the tournament completes')

  // The final is played for real.
  let guard = 0
  while (guard++ < 10) {
    const next = await openMatches(t.id)
    if (!next.length) break
    for (const m of next) await playSeries(m.id, ['A', 'A'])
    await T.advanceAndNotify(db, t.id)
  }
  assert.equal((await db.ogGtoonTournament.findUnique({ where: { id: t.id } })).status, 'COMPLETE')

  const grants = await db.ogGtoonTournamentPrizeGrant.findMany({ where: { tournamentId: t.id } })
  assert.equal(grants.length, 3, 'three of the four players played a counted game')
  assert.ok(grants.every(g => g.tier === 'PARTICIPANT'), 'no 1st/Top 8 prize is set, so everyone who played gets the participation prize')
  assert.ok(!grants.some(g => g.userId === neverPlayed), 'a player who never played a counted game is not paid')
})
