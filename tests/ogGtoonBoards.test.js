import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  normalizeLeaderboardParams, leaderboardCacheKey, buildLeaderboard, showsEarned, winPct, timeframeStart,
  normalizeMetaParams, metaCacheKey, buildMetaResponse, deckLabel, PRACTICE_MIN_GAMES, CACHE_TTL_SEC
} from '../server/utils/ogGtoonBoards.js'
import { recordPracticeResult } from '../server/utils/ogGtoonPracticeRecord.js'
import { determineWinner } from '../server/utils/ogGtoonEngine.js'
import { winReasonOf } from '../server/utils/ogGtoonMatchCore.js'

/* ── Parameters + cache keys ─────────────────────────────────────────────────────────────── */

test('leaderboard params default to Human Matches / All / 1 month', () => {
  assert.deepEqual(normalizeLeaderboardParams({}), { mode: 'human', timeframe: '1m', filter: 'all', difficulty: 'all', minGames: 3 })
})

test('leaderboard params: unknown values fall back, and the other mode\'s filter is pinned to All', () => {
  const p = normalizeLeaderboardParams({ mode: 'pvp', timeframe: 'forever', filter: 'weird', difficulty: 'hard' })
  assert.deepEqual(p, { mode: 'human', timeframe: '1m', filter: 'all', difficulty: 'all', minGames: 3 })
  // Practice ignores the human match-type filter; human ignores the difficulty.
  assert.equal(normalizeLeaderboardParams({ mode: 'practice', filter: 'tournament' }).filter, 'all')
  assert.equal(normalizeLeaderboardParams({ mode: 'human', difficulty: 'easy' }).difficulty, 'all')
  assert.equal(normalizeLeaderboardParams({ mode: 'practice', difficulty: 'normal' }).difficulty, 'normal')
})

test('practice win % needs a bigger sample; minGames is clamped', () => {
  assert.equal(normalizeLeaderboardParams({ mode: 'practice', minGames: '3' }).minGames, PRACTICE_MIN_GAMES)
  assert.equal(normalizeLeaderboardParams({ mode: 'practice', minGames: '40' }).minGames, 40)
  assert.equal(normalizeLeaderboardParams({ minGames: '99999' }).minGames, 100)
  assert.equal(normalizeLeaderboardParams({ minGames: '-4' }).minGames, 0)
})

test('cache keys use only whitelisted values and never minGames / sort / limit', () => {
  const a = leaderboardCacheKey(normalizeLeaderboardParams({ mode: 'human', filter: 'tournament', timeframe: '3m', minGames: '5' }))
  const b = leaderboardCacheKey(normalizeLeaderboardParams({ mode: 'human', filter: 'tournament', timeframe: '3m', minGames: '80' }))
  assert.equal(a, b)
  assert.match(a, /^og-leaderboard:v\d+:human:tournament:3m$/)
  assert.match(leaderboardCacheKey(normalizeLeaderboardParams({ mode: 'practice', difficulty: 'hard' })), /:practice:hard:1m$/)
  const m1 = metaCacheKey(normalizeMetaParams({ days: '7', filter: 'tournament', sort: 'games', minGames: '9', limit: '50' }))
  const m2 = metaCacheKey(normalizeMetaParams({ days: '7', filter: 'tournament', sort: 'wins', minGames: '2', limit: '5' }))
  assert.equal(m1, m2)
  assert.equal(CACHE_TTL_SEC, 3600)
})

test('meta params: defaults, whitelists and clamps', () => {
  assert.deepEqual(normalizeMetaParams({}), { days: 30, filter: 'all', sort: 'winPct', minGames: 3, limit: 25 })
  const p = normalizeMetaParams({ days: '45', filter: 'x', sort: 'y', minGames: '0', limit: '9999' })
  assert.deepEqual(p, { days: 30, filter: 'all', sort: 'winPct', minGames: 2, limit: 100 })
})

test('win % counts a tie as half; timeframe start', () => {
  assert.equal(winPct(3, 1, 5), 70)
  assert.equal(winPct(0, 0, 0), 0)
  const now = new Date('2026-06-15T12:00:00Z')
  assert.equal(timeframeStart('all', now), null)
  assert.equal(timeframeStart('1w', now).toISOString(), '2026-06-08T12:00:00.000Z')
})

/* ── Leaderboard shaping ─────────────────────────────────────────────────────────────────── */

const R = (username, wins, losses, ties, earned = 0, winsByColor = 0, winsByPoints = 0) => ({ uid: username, username, wins, losses, ties, played: wins + losses + ties, earned, winsByColor, winsByPoints })

test('leaderboard: top-10 boards, win % uses ties as half and honours minGames, W-L-T on rows', () => {
  const rows = [R('ann', 6, 2, 0, 40, 2, 3), R('bob', 3, 0, 0, 0), R('cy', 2, 2, 2, 5), R('dee', 0, 4, 0)]
  const params = normalizeLeaderboardParams({ minGames: '4' })
  const out = buildLeaderboard(rows, params, '2026-01-01T00:00:00Z')
  assert.deepEqual(out.wins.map(r => r.username), ['ann', 'bob', 'cy'])
  assert.deepEqual(out.played.map(r => r.username), ['ann', 'cy', 'dee', 'bob'])
  // bob has only 3 games, so he is off the win % board; cy = (2 + 1) / 6
  assert.deepEqual(out.winPct.map(r => r.username), ['ann', 'cy', 'dee'])
  assert.equal(out.winPct[1].value, 50)
  assert.deepEqual([out.wins[0].wins, out.wins[0].losses, out.wins[0].ties], [6, 2, 0])
  // How the wins were decided rides on every board's rows (the 6th win is a forfeit / older game: in neither split).
  assert.deepEqual([out.wins[0].winsByColor, out.wins[0].winsByPoints], [2, 3])
  assert.deepEqual([out.winPct[0].winsByColor, out.winPct[0].winsByPoints], [2, 3])
  assert.deepEqual(out.earned.map(r => r.username), ['ann', 'cy'])
  assert.equal(out.generatedAt, '2026-01-01T00:00:00.000Z')
})

test('leaderboard: Stake Points Earned only for Human Matches that are not tournaments', () => {
  assert.equal(showsEarned({ mode: 'human', filter: 'all' }), true)
  assert.equal(showsEarned({ mode: 'human', filter: 'non_tournament' }), true)
  assert.equal(showsEarned({ mode: 'human', filter: 'tournament' }), false)
  assert.equal(showsEarned({ mode: 'practice', filter: 'all' }), false)
  const practice = buildLeaderboard([R('ann', 12, 1, 0)], normalizeLeaderboardParams({ mode: 'practice' }))
  assert.equal('earned' in practice, false)
  assert.equal(practice.winPct.length, 1)
  // a lone 5-game practice player is under the 10-game floor
  assert.equal(buildLeaderboard([R('bo', 5, 0, 0)], normalizeLeaderboardParams({ mode: 'practice' })).winPct.length, 0)
})

test('leaderboard: empty input gives empty boards', () => {
  const out = buildLeaderboard([], normalizeLeaderboardParams({}))
  assert.deepEqual([out.wins, out.played, out.winPct, out.earned], [[], [], [], []])
})

/* ── Meta shaping ────────────────────────────────────────────────────────────────────────── */

function metaFixture() {
  const card = (id, extra = {}) => ({ ctoonId: id, name: `Card ${id}`, assetPath: `/${id}.png`, color: 'RED', value: 5, isSlam: false, appearances: 10, wins: 6, losses: 3, ties: 1, ...extra })
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    totalGames: 20,
    decidedGames: 18,
    decks: [
      { deckId: 'd1', deckKey: 'a,b,c', goalCtoonId: 'c', games: 10, wins: 6, losses: 3, ties: 1, mirrors: 0 },
      { deckId: 'd2', deckKey: 'a,b,z', goalCtoonId: 'z', games: 6, wins: 4, losses: 0, ties: 0, mirrors: 2 },
      { deckId: 'd3', deckKey: 'q,r', goalCtoonId: 'r', games: 2, wins: 2, losses: 0, ties: 0, mirrors: 0 }
    ],
    cards: [card('a'), card('b'), card('c', { appearances: 4, wins: 1, losses: 3, ties: 0 }), card('z', { appearances: 0, wins: 0, losses: 0, ties: 0 }), card('r')]
  }
}

test('meta: sorts, applies minGames, labels decks by their goal card, builds one card dictionary', () => {
  const byWin = buildMetaResponse(metaFixture(), normalizeMetaParams({ minGames: '3' }))
  assert.deepEqual(byWin.decks.map(d => d.deckId), ['d2', 'd1']) // d3 has only 2 games; d2 is 4-0
  assert.equal(byWin.decks[0].winPct, 100)
  assert.equal(byWin.decks[1].winPct, 65) // (6 + .5) / 10
  assert.equal(byWin.decks[0].mirrors, 2)
  assert.deepEqual(byWin.decks[1].cardIds, ['a', 'b', 'c'])
  assert.equal(byWin.decks[1].deckName, 'Goal: Card c')
  assert.equal(byWin.decks[1].sharePct, 50)
  const byGames = buildMetaResponse(metaFixture(), normalizeMetaParams({ minGames: '2', sort: 'games' }))
  assert.deepEqual(byGames.decks.map(d => d.deckId), ['d1', 'd2', 'd3'])
  assert.equal(byGames.totalDecks, 3)
  // Only the cards the page draws are sent.
  assert.deepEqual(Object.keys(byWin.cards).sort(), ['a', 'b', 'c', 'z'])
  assert.equal(byWin.cards.a.name, 'Card a')
})

test('meta: card usage and winning gToons', () => {
  const out = buildMetaResponse(metaFixture(), normalizeMetaParams({}))
  assert.deepEqual(out.cardUsage.map(c => c.ctoonId), ['a', 'b', 'r', 'c']) // unused 'z' is left out
  assert.equal(out.cardUsage[0].usePct, 25) // 10 of 40 deck appearances
  assert.equal(out.cardUsage[0].winPct, 65)
  assert.equal(out.winningCards[0].wins, 6)
  assert.ok(Math.abs(out.winningCards[0].winSharePct - (6 / 18) * 100) < 1e-9)
})

test('meta: an empty aggregate is harmless', () => {
  const out = buildMetaResponse(null, normalizeMetaParams({}))
  assert.deepEqual([out.totalGames, out.decks, out.cardUsage, out.winningCards], [0, [], [], []])
  assert.equal(deckLabel(undefined), 'Unnamed deck')
})

/* ── Practice recorder (no database: the write is injected) ──────────────────────────────── */

const rec = { id: 'p1', userId: 'u1', difficulty: 'normal', outcome: 'PLAYER_WIN', startedAt: Date.now() - 1000 }

test('recorder: saves a valid result, retries once, never throws', async () => {
  const saved = []
  assert.equal(await recordPracticeResult(rec, { create: async (d) => { saved.push(d) } }), true)
  assert.equal(saved[0].id, 'p1')
  assert.equal(saved[0].winReason, null)
  assert.ok(saved[0].startedAt instanceof Date && saved[0].endedAt instanceof Date)

  let calls = 0
  assert.equal(await recordPracticeResult(rec, { retryDelayMs: 0, create: async () => { calls += 1; if (calls === 1) throw new Error('blip') } }), true)
  assert.equal(calls, 2)

  const quiet = console.error; console.error = () => {}
  try {
    assert.equal(await recordPracticeResult(rec, { retryDelayMs: 0, create: async () => { throw new Error('down') } }), false)
  } finally { console.error = quiet }
})

test('recorder: keeps a valid win reason and drops an unknown one', async () => {
  const saved = []
  const create = async (d) => { saved.push(d) }
  await recordPracticeResult({ ...rec, id: 'r1', winReason: 'COLOR' }, { create })
  await recordPracticeResult({ ...rec, id: 'r2', winReason: 'POINTS' }, { create })
  await recordPracticeResult({ ...rec, id: 'r3', winReason: 'LUCK' }, { create })
  assert.deepEqual(saved.map(d => d.winReason), ['COLOR', 'POINTS', null])
})

test('win reason: the engine\'s reason maps to COLOR / POINTS, a tie has none', () => {
  const card = (color, finalValue) => ({ color, finalValue })
  // Different goal colours: more cards of both combined wins outright -> COLOR.
  const byColor = determineWinner({
    player1GoalColor: 'RED', player2GoalColor: 'BLUE',
    player1Revealed: [card('RED', 1), card('BLUE', 1), card('RED', 1)], player2Revealed: [card('RED', 9), card('GREEN', 9), card('GREEN', 9)]
  })
  assert.equal(byColor.winner, 'player1')
  assert.equal(winReasonOf(byColor.reason), 'COLOR')
  // Neutral goals: higher total wins -> POINTS.
  const byPoints = determineWinner({
    player1GoalColor: 'BLACK', player2GoalColor: 'SILVER',
    player1Revealed: [card('RED', 9)], player2Revealed: [card('RED', 2)]
  })
  assert.equal(byPoints.winner, 'player1')
  assert.equal(winReasonOf(byPoints.reason), 'POINTS')
  const tie = determineWinner({
    player1GoalColor: 'BLACK', player2GoalColor: 'SILVER', player1Revealed: [card('RED', 5)], player2Revealed: [card('RED', 5)]
  })
  assert.equal(tie.winner, null)
  assert.equal(winReasonOf(tie.reason), null)
})

test('recorder: refuses malformed results without touching the database', async () => {
  let called = false
  const create = async () => { called = true }
  for (const bad of [null, {}, { ...rec, difficulty: 'impossible' }, { ...rec, outcome: 'WIN' }, { ...rec, userId: '' }]) {
    assert.equal(await recordPracticeResult(bad, { create }), false)
  }
  assert.equal(called, false)
})

test('the recorder never touches points, and the boards helper imports nothing', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const recorder = strip(readFileSync(path.join(here, '../server/utils/ogGtoonPracticeRecord.js'), 'utf8'))
  for (const re of [/userPoints/i, /pointsLog/i, /gamePoints/i, /ogGtoonMatch\b/i, /DeckSnapshot/i]) {
    assert.equal(re.test(recorder), false, `recorder must not reference ${re}`)
  }
  assert.equal(/\bimport\b/.test(strip(readFileSync(path.join(here, '../server/utils/ogGtoonBoards.js'), 'utf8'))), false)
})
