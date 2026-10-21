import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BEST_OF, formatFor, swissRoundsFor, pairKey, compareStandings, seededShuffle,
  buildBracketSeedPairs, bracketSizeFor, bracketRoundLabel, pairSwissRound, computeSeries,
  decideAtDeadline, computeRecords, buildFinalPlacements, prizeRecipients, checkLockedDeck,
  roundDueAt, WALKOVER_MIN_READY_MS
} from '../server/utils/tournamentCore.js'

/* ── format / rounds / seeding ─────────────────────────────────────────────────────────── */

test('every pairing is a best-of-3', () => {
  assert.equal(BEST_OF, 3)
})

test('format switches to Swiss above 8 entrants', () => {
  assert.equal(formatFor(2), 'BRACKET_8_OR_LESS')
  assert.equal(formatFor(8), 'BRACKET_8_OR_LESS')
  assert.equal(formatFor(9), 'SWISS_THEN_TOP8')
})

test('swiss round count grows with the field, is clamped, and honours an override', () => {
  assert.equal(swissRoundsFor(9), 4)
  assert.equal(swissRoundsFor(16), 4)
  assert.equal(swissRoundsFor(17), 5)
  assert.equal(swissRoundsFor(500), 6)
  assert.equal(swissRoundsFor(4), 3)
  assert.equal(swissRoundsFor(40, 2), 2)
  assert.equal(swissRoundsFor(40, 'x'), 6)
})

test('seededShuffle is deterministic per seed and a true permutation', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `u${i}`)
  const a = seededShuffle(ids, 'abc')
  const b = seededShuffle(ids, 'abc')
  const c = seededShuffle(ids, 'abd')
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, c)
  assert.deepEqual(a.slice().sort(), ids.slice().sort())
  assert.deepEqual(ids[0], 'u0', 'input is not mutated')
})

test('bracket seeding pairs top vs bottom seeds', () => {
  assert.deepEqual(buildBracketSeedPairs(8), [[1, 8], [2, 7], [3, 6], [4, 5]])
  assert.deepEqual(buildBracketSeedPairs(2), [[1, 2]])
  assert.equal(bracketSizeFor(3), 4)
  assert.equal(bracketSizeFor(5), 8)
  assert.equal(bracketSizeFor(8), 8)
  assert.equal(bracketRoundLabel(1), 'Final')
  assert.equal(bracketRoundLabel(2), 'Semifinals')
  assert.equal(bracketRoundLabel(4), 'Quarterfinals')
  assert.equal(bracketRoundLabel(8), 'Round of 16')
})

test('byes in a 5-8 player bracket go to the top seeds', () => {
  // 5 players -> size 8 -> seeds 6,7,8 are empty, so seeds 1,2,3 get byes.
  const present = new Set([1, 2, 3, 4, 5])
  const byes = buildBracketSeedPairs(8).filter(([a, b]) => !present.has(a) || !present.has(b)).map(([a, b]) => (present.has(a) ? a : b))
  assert.deepEqual(byes.sort(), [1, 2, 3])
})

/* ── swiss pairing ─────────────────────────────────────────────────────────────────────── */

const mkPlayers = (n) => Array.from({ length: n }, (_, i) => ({ userId: `p${i + 1}`, points: 0, swissByes: 0 }))

test('swiss pairs an even field with no repeats', () => {
  const r = pairSwissRound(mkPlayers(8))
  assert.equal(r.byeUserId, null)
  assert.equal(r.pairs.length, 4)
  assert.equal(new Set(r.pairs.flat()).size, 8)
  assert.equal(r.rematches, 0)
})

test('swiss gives the bye to the lowest-ranked player without one', () => {
  const players = mkPlayers(5)
  players[4].swissByes = 1
  const r = pairSwissRound(players)
  assert.equal(r.byeUserId, 'p4')
  assert.equal(r.pairs.length, 2)
})

test('swiss avoids rematches when a clean pairing exists', () => {
  const players = mkPlayers(4)
  const prev = new Set([pairKey('p1', 'p2'), pairKey('p3', 'p4')])
  const r = pairSwissRound(players, prev)
  assert.equal(r.rematches, 0)
  for (const [a, b] of r.pairs) assert.ok(!prev.has(pairKey(a, b)))
})

test('swiss backtracks past a greedy dead end', () => {
  // Greedy p1-p2 would force p3-p4 (a rematch); the only clean answer is p1-p3 / p2-p4 or p1-p4 / p2-p3.
  const players = mkPlayers(4)
  const prev = new Set([pairKey('p3', 'p4')])
  const r = pairSwissRound(players, prev)
  assert.equal(r.rematches, 0)
})

test('swiss falls back to the fewest rematches when none can be avoided', () => {
  const players = mkPlayers(4)
  // Everyone has already played everyone.
  const prev = new Set()
  for (const a of players) for (const b of players) if (a !== b) prev.add(pairKey(a.userId, b.userId))
  const r = pairSwissRound(players, prev)
  assert.equal(r.pairs.length, 2)
  assert.equal(r.rematches, 2)
})

test('swiss copes with a larger field quickly', () => {
  const players = mkPlayers(64)
  const prev = new Set()
  for (let i = 0; i < 63; i += 2) prev.add(pairKey(`p${i + 1}`, `p${i + 2}`))
  const t = Date.now()
  const r = pairSwissRound(players, prev)
  assert.ok(Date.now() - t < 1000)
  assert.equal(r.pairs.length, 32)
  assert.equal(r.rematches, 0)
})

/* ── series (best of 3) ────────────────────────────────────────────────────────────────── */

const series = (games, over = {}) => computeSeries({ games, stage: 'SWISS', ...over })

test('series: 2-0 ends immediately', () => {
  const s = series(['A', 'A'])
  assert.equal(s.decided, true)
  assert.equal(s.outcome, 'A_WIN')
  assert.deepEqual([s.winsA, s.winsB, s.gamesCounted], [2, 0, 2])
  assert.equal(s.nextGameNumber, null)
})

test('series: a third game after the series is decided is ignored', () => {
  const s = series(['A', 'A', 'B'])
  assert.deepEqual([s.winsA, s.winsB, s.gamesCounted], [2, 0, 2])
})

test('series: 1-1 stays open and asks for game 3', () => {
  const s = series(['A', 'B'])
  assert.equal(s.decided, false)
  assert.equal(s.outcome, null)
  assert.equal(s.nextGameNumber, 3)
})

test('series: 2-1 is decided in game 3', () => {
  const s = series(['B', 'A', 'A'])
  assert.equal(s.outcome, 'A_WIN')
  assert.equal(s.gamesCounted, 3)
})

test('series: 1-1-1 is a draw in Swiss', () => {
  const s = series(['A', 'B', 'TIE'])
  assert.equal(s.outcome, 'TIE')
  assert.equal(s.decided, true)
})

test('series: a tied game does not stop a 1-0 lead winning after three games', () => {
  const s = series(['A', 'TIE', 'TIE'])
  assert.equal(s.outcome, 'A_WIN')
})

test('series: a level bracket series plays extra games until someone wins', () => {
  const s = series(['A', 'B', 'TIE', 'TIE', 'B'], { stage: 'BRACKET', requiresWinner: true })
  assert.equal(s.outcome, 'B_WIN')
  assert.equal(s.decided, true)
  assert.equal(s.extraGamesCounted, 2)
})

test('series: a level bracket series with no extras yet is open, not a draw', () => {
  const s = series(['A', 'B', 'TIE'], { stage: 'BRACKET', requiresWinner: true })
  assert.equal(s.decided, false)
  assert.equal(s.needsAdmin, false)
  assert.equal(s.nextGameNumber, 4)
})

test('series: the bracket extra-game cap hands over to an admin', () => {
  const s = series(['A', 'B', 'TIE', 'TIE', 'TIE'], { stage: 'BRACKET', requiresWinner: true, maxExtraGames: 2 })
  assert.equal(s.needsAdmin, true)
  assert.equal(s.decided, false)
})

test('series: no games yet', () => {
  const s = series([])
  assert.equal(s.decided, false)
  assert.equal(s.nextGameNumber, 1)
})

/* ── deadline decisions ────────────────────────────────────────────────────────────────── */

const base = { stage: 'SWISS', requiresWinner: false, winsA: 0, winsB: 0, ties: 0, gamesCounted: 0, readyAAt: null, readyBAt: null, seedA: 1, seedB: 2 }
const now = Date.parse('2026-11-01T12:00:00Z')
const longAgo = new Date(now - WALKOVER_MIN_READY_MS - 60000).toISOString()
const justNow = new Date(now - 60000).toISOString()

test('deadline: the leader of an unfinished series wins', () => {
  const r = decideAtDeadline({ ...base, winsA: 1, gamesCounted: 1 }, { now })
  assert.equal(r.outcome, 'A_WIN')
  assert.equal(r.resolution, 'DEADLINE')
  assert.equal(r.winsA, 2)
})

test('deadline: a level Swiss series is a draw', () => {
  const r = decideAtDeadline({ ...base, winsA: 1, winsB: 1, gamesCounted: 2 }, { now })
  assert.equal(r.outcome, 'TIE')
})

test('deadline: a level bracket series goes to the higher aggregate score, then the better seed', () => {
  const m = { ...base, stage: 'BRACKET', requiresWinner: true, winsA: 1, winsB: 1, gamesCounted: 2 }
  assert.equal(decideAtDeadline(m, { now, scoreA: 10, scoreB: 30 }).outcome, 'B_WIN')
  assert.equal(decideAtDeadline(m, { now, scoreA: 20, scoreB: 20 }).outcome, 'A_WIN') // seed 1 beats seed 2
  assert.equal(decideAtDeadline({ ...m, seedA: null, seedB: null }, { now }).kind, 'NEEDS_ADMIN')
})

test('deadline: only one player readied up long enough -> walkover for them', () => {
  const r = decideAtDeadline({ ...base, readyBAt: longAgo }, { now })
  assert.equal(r.outcome, 'B_WIN')
  assert.equal(r.resolution, 'WALKOVER')
  assert.equal(r.winsB, 2)
})

test('deadline: a ready-up made moments ago does not earn a walkover', () => {
  const r = decideAtDeadline({ ...base, readyAAt: justNow }, { now })
  assert.equal(r.outcome, null) // falls through to the no-show rule
})

test('deadline: a Swiss double no-show is a double loss, never a draw', () => {
  const r = decideAtDeadline(base, { now })
  assert.equal(r.kind, 'RESULT')
  assert.equal(r.outcome, null)
})

test('deadline: a bracket no-show by both goes to an admin; both ready but unplayed too', () => {
  assert.equal(decideAtDeadline({ ...base, stage: 'BRACKET', requiresWinner: true }, { now }).kind, 'NEEDS_ADMIN')
  assert.equal(decideAtDeadline({ ...base, readyAAt: longAgo, readyBAt: longAgo }, { now }).kind, 'NEEDS_ADMIN')
})

/* ── records ───────────────────────────────────────────────────────────────────────────── */

const sm = (a, b, outcome, winsA, winsB, ties = 0, status = 'COMPLETE') => ({ playerAUserId: a, playerBUserId: b, outcome, winsA, winsB, ties, status })

test('records: points, record and game stats from Swiss matches', () => {
  const rec = computeRecords(['a', 'b', 'c'], [
    sm('a', 'b', 'A_WIN', 2, 0),
    sm('c', 'c', 'A_WIN', 0, 0, 0, 'BYE')
  ], [])
  assert.equal(rec.get('a').points, 3)
  assert.equal(rec.get('b').swissLosses, 1)
  assert.equal(rec.get('c').swissByes, 1)
  assert.equal(rec.get('c').points, 3)
  assert.equal(rec.get('a').swissGameWins, 2)
})

test('records: a draw is 1 point each; a double loss is 0 for both', () => {
  const rec = computeRecords(['a', 'b', 'c', 'd'], [
    sm('a', 'b', 'TIE', 1, 1, 1),
    sm('c', 'd', null, 0, 0)
  ], [])
  assert.equal(rec.get('a').points, 1)
  assert.equal(rec.get('b').points, 1)
  assert.equal(rec.get('c').points, 0)
  assert.equal(rec.get('c').swissLosses, 1)
  assert.equal(rec.get('d').swissLosses, 1)
})

test('records: byes do not inflate opponents\' match-win percentage', () => {
  // x beat a (a's only real match is a loss) and then x had a bye; a's OMW from x ignores x's bye.
  const rec = computeRecords(['x', 'a', 'y'], [
    sm('x', 'a', 'A_WIN', 2, 0),
    sm('y', 'y', 'A_WIN', 0, 0, 0, 'BYE'),
    sm('x', 'x', 'A_WIN', 0, 0, 0, 'BYE')
  ], [])
  // x played one real match and won it -> 3/3 = 1.0; a faced only x.
  assert.equal(rec.get('a').opponentMatchWinPct, 1)
  assert.equal(rec.get('a').points, 0)
})

test('records: bracket wins and losses', () => {
  const rec = computeRecords(['a', 'b'], [], [
    { playerAUserId: 'a', playerBUserId: 'b', winnerUserId: 'a', status: 'COMPLETE' }
  ])
  assert.equal(rec.get('a').bracketWins, 1)
  assert.equal(rec.get('b').bracketLosses, 1)
})

test('compareStandings orders by points, then OMW, then GW, then id', () => {
  const rows = [
    { userId: 'b', points: 6, opponentMatchWinPct: 0.5, gameWinPct: 0.5 },
    { userId: 'a', points: 6, opponentMatchWinPct: 0.6, gameWinPct: 0.4 },
    { userId: 'c', points: 9, opponentMatchWinPct: 0.1, gameWinPct: 0.1 }
  ].sort(compareStandings)
  assert.deepEqual(rows.map(r => r.userId), ['c', 'a', 'b'])
})

/* ── placements ────────────────────────────────────────────────────────────────────────── */

test('final placements for a 4-player bracket', () => {
  const m = (round, a, b, w, seedA, seedB) => ({ roundNumber: round, playerAUserId: a, playerBUserId: b, winnerUserId: w, status: 'COMPLETE', seedA, seedB })
  const placements = buildFinalPlacements({
    format: 'BRACKET_8_OR_LESS',
    records: [{ userId: 'p1' }, { userId: 'p2' }, { userId: 'p3' }, { userId: 'p4' }],
    bracketMatches: [m(1, 'p1', 'p4', 'p1', 1, 4), m(1, 'p2', 'p3', 'p3', 2, 3), m(2, 'p1', 'p3', 'p3')]
  })
  assert.deepEqual(placements.map(p => [p.userId, p.place]), [['p3', 1], ['p1', 2], ['p2', 3], ['p4', 4]])
})

test('final placements: no final winner yields nothing', () => {
  assert.deepEqual(buildFinalPlacements({ format: 'BRACKET_8_OR_LESS', records: [], bracketMatches: [] }), [])
})

/* ── prizes ────────────────────────────────────────────────────────────────────────────── */

test('prize recipients: winner gets FIRST, places 2-8 get TOP8 only in big enough fields', () => {
  const placements = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i + 1}`, place: i + 1 }))
  const big = prizeRecipients({ placements, entrants: 12, minEntrantsTop8: 9 })
  assert.equal(big.filter(r => r.tier === 'FIRST').length, 1)
  assert.deepEqual(big.filter(r => r.tier === 'TOP8').map(r => r.place), [2, 3, 4, 5, 6, 7, 8])
  const small = prizeRecipients({ placements: placements.slice(0, 6), entrants: 6, minEntrantsTop8: 9 })
  assert.deepEqual(small.map(r => r.tier), ['FIRST'])
})

test('prize recipients: ineligible players are skipped and missing prizes pay nobody', () => {
  const placements = [{ userId: 'a', place: 1 }, { userId: 'b', place: 2 }]
  assert.deepEqual(prizeRecipients({ placements, entrants: 20, eligible: new Set(['b']) }).map(r => r.userId), ['b'])
  assert.deepEqual(prizeRecipients({ placements, entrants: 20, hasFirst: false, hasTop8: false }), [])
})

/* ── locked deck ───────────────────────────────────────────────────────────────────────── */

test('locked deck check finds missing, burned and re-homed copies', () => {
  const snapshot = Array.from({ length: 12 }, (_, i) => ({ position: i, ctoonId: `c${i}`, userCtoonId: `uc${i}` }))
  const owned = new Map(snapshot.map(s => [s.userCtoonId, { userId: 'me', ctoonId: s.ctoonId, burnedAt: null }]))
  assert.deepEqual(checkLockedDeck(snapshot, 'me', owned), { valid: true, missing: [] })
  owned.set('uc3', { userId: 'someone', ctoonId: 'c3', burnedAt: null })
  owned.set('uc5', { userId: 'me', ctoonId: 'c5', burnedAt: new Date() })
  owned.delete('uc9')
  assert.deepEqual(checkLockedDeck(snapshot, 'me', owned), { valid: false, missing: [3, 5, 9] })
  assert.equal(checkLockedDeck([], 'me', owned).valid, false)
})

test('roundDueAt adds the window in hours', () => {
  const due = roundDueAt('2026-11-01T00:00:00Z', 72)
  assert.equal(due.toISOString(), '2026-11-04T00:00:00.000Z')
})
