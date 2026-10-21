// Checks the OG gToons Leaderboard + Meta SQL against a REAL Postgres.
//
// Skipped unless OG_BOARDS_TEST_DB is set (a throwaway database already migrated to the current schema),
// so a plain `npm test` stays database-free:
//
//   OG_BOARDS_TEST_DB=postgresql://... node --test tests/ogGtoonBoards.db.test.js
//
// Games are inserted exactly as the socket server persists them (OgGtoonMatch rows), including the ugly
// ones the boards must ignore: a swept 0-0 tie, an admin-voided game that kept its winner, and a forfeit.
import test from 'node:test'
import assert from 'node:assert/strict'

const URL = process.env.OG_BOARDS_TEST_DB
const run = URL ? test : test.skip

let db
let Sql
let Boards
let Record

async function setup() {
  if (db) return
  process.env.DATABASE_URL = URL
  ;({ prisma: db } = await import('../server/prisma.js'))
  Sql = await import('../server/utils/ogGtoonBoardsSql.js')
  Boards = await import('../server/utils/ogGtoonBoards.js')
  Record = await import('../server/utils/ogGtoonPracticeRecord.js')
}

const stamp = Date.now()
const deckOf = (tag) => Array.from({ length: 12 }, (_, i) => ({
  ctoonId: `${tag}-${stamp}-${i}`, name: `${tag} card ${i}`, assetPath: `/${tag}${i}.png`, characters: [],
  color: i === 11 ? 'RED' : 'BLUE', value: i + 1, isSlam: false, effect: null, position: i
}))
const keyOf = (deck) => deck.map(c => c.ctoonId).sort().join(',')

async function mkUser(tag) {
  return db.user.create({ data: { discordId: `d${stamp}${tag}`, username: `boards_${tag}_${stamp}` } })
}

async function game(data) {
  return db.ogGtoonMatch.create({
    data: {
      player1GoalColor: 'RED', player2GoalColor: 'BLUE', roundLog: [],
      startedAt: new Date(), endedAt: new Date(),
      player1Score: 30, player2Score: 20,
      ...data
    }
  })
}

let fixture
// One shared promise, so a failed seed fails every test the same way instead of half-reseeding.
function seed() {
  fixture ||= build()
  return fixture
}
async function build() {
  await setup()
  const [A, B, C] = await Promise.all([mkUser('a'), mkUser('b'), mkUser('c')])
  const X = deckOf('x')
  const Y = deckOf('y')
  const base = (p1, p2, d1, d2) => ({ player1UserId: p1.id, player2UserId: p2.id, player1DeckSnapshot: d1, player2DeckSnapshot: d2 })

  // A (deck X) vs B (deck Y), stakes 10/10
  await game({ ...base(A, B, X, Y), player1Points: 10, player2Points: 10, outcome: 'PLAYER1', winnerUserId: A.id })
  await game({ ...base(A, B, X, Y), player1Points: 10, player2Points: 10, outcome: 'PLAYER1', winnerUserId: A.id })
  await game({ ...base(A, B, X, Y), player1Points: 10, player2Points: 10, outcome: 'PLAYER2', winnerUserId: B.id, player1Score: 20, player2Score: 30 })
  await game({ ...base(A, B, X, Y), player1Points: 10, player2Points: 10, outcome: 'TIE', player1Score: 25, player2Score: 25 })
  // Ugly rows the boards must handle:
  await game({ ...base(A, B, X, Y), outcome: 'TIE', player1Score: 0, player2Score: 0 }) // swept: nobody played it
  await game({ ...base(A, B, X, Y), player1Points: 10, player2Points: 10, outcome: 'PLAYER2', winnerUserId: B.id, whoLeftUserId: A.id, player1Score: 0, player2Score: 0 }) // forfeit
  await game({ ...base(A, B, X, Y), outcome: 'INCOMPLETE', winnerUserId: A.id }) // voided, kept its winner
  // Mirror: both players on the same 12 cards, stakes 5/5
  await game({ ...base(A, C, X, X), player1Points: 5, player2Points: 5, outcome: 'PLAYER1', winnerUserId: A.id })
  // A tournament game (zero stake)
  const t = await db.ogGtoonTournament.create({ data: { name: `boards ${stamp}`, optInStartAt: new Date(), optInEndAt: new Date(), announcementChannelId: 'test' } })
  const round = await db.ogGtoonTournamentRound.create({ data: { tournamentId: t.id, stage: 'SWISS', roundNumber: 1 } })
  const tm = await db.ogGtoonTournamentMatch.create({
    data: { tournamentId: t.id, roundId: round.id, stage: 'SWISS', roundNumber: 1, playerAUserId: A.id, playerBUserId: B.id }
  })
  await game({ ...base(A, B, X, Y), outcome: 'PLAYER1', winnerUserId: A.id, tournamentMatchId: tm.id })

  // Practice (A only)
  const p = (difficulty, outcome) => db.ogGtoonPracticeMatch.create({ data: { id: `pm-${stamp}-${difficulty}-${outcome}-${Math.random()}`, userId: A.id, difficulty, outcome, startedAt: new Date() } })
  await p('easy', 'PLAYER_WIN'); await p('easy', 'PLAYER_WIN'); await p('normal', 'BOT_WIN'); await p('hard', 'TIE')

  return { A, B, C, X, Y }
}

const rowOf = (rows, user) => rows.find(r => r.uid === user.id)

run('human leaderboard: finished games only; forfeits count; sweeps and voided games do not; tournaments split out', async () => {
  const { A, B, C } = await seed()

  const casual = await Sql.loadHumanLeaderboardRows({ timeframe: 'all', filter: 'non_tournament' })
  assert.deepEqual(pick(rowOf(casual, A)), { played: 6, wins: 3, losses: 2, ties: 1, earned: 25 })
  assert.deepEqual(pick(rowOf(casual, B)), { played: 5, wins: 2, losses: 2, ties: 1, earned: 20 })
  assert.deepEqual(pick(rowOf(casual, C)), { played: 1, wins: 0, losses: 1, ties: 0, earned: 0 })

  const tournament = await Sql.loadHumanLeaderboardRows({ timeframe: 'all', filter: 'tournament' })
  assert.deepEqual(pick(rowOf(tournament, A)), { played: 1, wins: 1, losses: 0, ties: 0, earned: 0 })

  const all = await Sql.loadHumanLeaderboardRows({ timeframe: 'all', filter: 'all' })
  assert.equal(rowOf(all, A).played, 7)
  assert.equal(rowOf(all, A).username, A.username)

  // A timeframe that excludes everything leaves the user off the board.
  const future = await Sql.loadHumanLeaderboardRows({ timeframe: '1w', filter: 'all' })
  assert.ok(rowOf(future, A)) // played just now, so still inside the week
})

run('practice leaderboard: per difficulty, and All adds them up', async () => {
  const { A } = await seed()
  const all = await Sql.loadPracticeLeaderboardRows({ timeframe: 'all', difficulty: 'all' })
  assert.deepEqual(pick(rowOf(all, A)), { played: 4, wins: 2, losses: 1, ties: 1, earned: 0 })
  const easy = await Sql.loadPracticeLeaderboardRows({ timeframe: 'all', difficulty: 'easy' })
  assert.deepEqual(pick(rowOf(easy, A)), { played: 2, wins: 2, losses: 0, ties: 0, earned: 0 })
  const hard = await Sql.loadPracticeLeaderboardRows({ timeframe: 'all', difficulty: 'hard' })
  assert.deepEqual(pick(rowOf(hard, A)), { played: 1, wins: 0, losses: 0, ties: 1, earned: 0 })
})

run('meta: decks keyed by their 12 cards; mirror counted once; forfeits, sweeps and voided games skipped', async () => {
  const { X, Y } = await seed()
  const agg = await Sql.loadMetaAggregate({ days: 30, filter: 'all' })
  const deckX = agg.decks.find(d => d.deckKey === keyOf(X))
  const deckY = agg.decks.find(d => d.deckKey === keyOf(Y))
  // X: 5 games vs Y (3 wins, 1 loss, 1 tie) + 1 mirror
  assert.deepEqual(pick2(deckX), { games: 6, wins: 3, losses: 1, ties: 1, mirrors: 1 })
  assert.equal(deckX.goalCtoonId, X[11].ctoonId)
  assert.deepEqual(pick2(deckY), { games: 5, wins: 1, losses: 3, ties: 1, mirrors: 0 })

  const casual = await Sql.loadMetaAggregate({ days: 30, filter: 'non_tournament' })
  assert.equal(casual.decks.find(d => d.deckKey === keyOf(X)).games, 5)
  const tournament = await Sql.loadMetaAggregate({ days: 30, filter: 'tournament' })
  assert.equal(tournament.decks.find(d => d.deckKey === keyOf(X)), undefined) // one game < the 2-game floor

  // Card usage: X's cards appear in both sides of the mirror too.
  const card = agg.cards.find(c => c.ctoonId === X[0].ctoonId)
  assert.equal(card.appearances, 7) // 5 vs Y + 2 in the mirror
  assert.equal(card.name, X[0].name)

  // And the response builder turns it into the page's shape.
  const out = Boards.buildMetaResponse(agg, Boards.normalizeMetaParams({ minGames: 2 }))
  const outX = out.decks.find(d => d.deckId === deckX.deckId)
  assert.equal(outX.cardIds.length, 12)
  assert.equal(outX.deckName, `Goal: ${X[11].name}`)
  assert.equal(outX.winPct, 70) // (3 + 0.5) / 5 rated games
  assert.ok(out.cards[X[0].ctoonId])
})

run('practice recorder: one row per match, a duplicate is a no-op, a bad record is refused', async () => {
  const { A } = await seed()
  const id = `rec-${stamp}`
  const r = { id, userId: A.id, difficulty: 'normal', outcome: 'PLAYER_WIN', startedAt: Date.now() - 5000 }
  assert.equal(await Record.recordPracticeResult(r), true)
  assert.equal(await Record.recordPracticeResult(r), true)
  assert.equal(await db.ogGtoonPracticeMatch.count({ where: { id } }), 1)
  assert.equal(await Record.recordPracticeResult({ ...r, id: `${id}-x`, difficulty: 'impossible' }), false)
})

function pick(r) { return { played: r.played, wins: r.wins, losses: r.losses, ties: r.ties, earned: r.earned } }
function pick2(d) { return { games: d.games, wins: d.wins, losses: d.losses, ties: d.ties, mirrors: d.mirrors } }
