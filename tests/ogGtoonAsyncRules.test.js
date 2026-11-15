// Pure rules for async + live tournament matches: the deadline decision, the final-minute extension, the
// "does this Start / new game still count" cut-off, and who the game is waiting on.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  minPlayableMs, startCounts, mayStartNewGame, extendOnPlay, decideAtDeadlineAsync, computeRecords,
  EXTENSION_MS, EXTENSION_WINDOW_MS, MAX_EXTENSIONS, WINS_NEEDED
} from '../server/utils/tournamentCore.js'
import {
  initHands, markCommitted, submitDiscard, recordSwapChoice, submitColor, startPhaseClock, pendingStepBlocker
} from '../server/utils/ogGtoonMatchCore.js'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const T0 = Date.parse('2026-11-10T00:00:00Z')
const base = new Date(T0 + 24 * HOUR)

/* ── how much time a Start / new game needs ────────────────────────────────────────────── */

test('a Start needs an hour left on a normal round, scaled down on short rounds, never under 5 minutes', () => {
  assert.equal(minPlayableMs(24), HOUR)
  assert.equal(minPlayableMs(48), HOUR)
  assert.equal(minPlayableMs(72), HOUR)
  assert.equal(minPlayableMs(4), 24 * MIN)
  assert.equal(minPlayableMs(2), 12 * MIN)
  assert.equal(minPlayableMs(1), 6 * MIN)
  assert.ok(minPlayableMs(0.01) >= 5 * MIN)
})

test('a Start pressed inside the last window does not count; the cut-off itself does', () => {
  const m = HOUR
  assert.equal(startCounts(new Date(base.getTime() - 2 * HOUR), base, m), true)
  assert.equal(startCounts(new Date(base.getTime() - HOUR), base, m), true, 'exactly at the cut-off')
  assert.equal(startCounts(new Date(base.getTime() - HOUR + 1), base, m), false)
  assert.equal(startCounts(new Date(base.getTime() - 1000), base, m), false, 'the last-second snipe')
  assert.equal(startCounts(null, base, m), false)
})

test('a new game only starts while enough of the ORIGINAL round is left', () => {
  assert.equal(mayStartNewGame(new Date(base.getTime() - 2 * HOUR), base, HOUR), true)
  assert.equal(mayStartNewGame(new Date(base.getTime() - 30 * MIN), base, HOUR), false)
  assert.equal(mayStartNewGame(new Date(base.getTime() + MIN), base, HOUR), false, 'after the deadline')
})

/* ── final-minute extension ────────────────────────────────────────────────────────────── */

test('a play in the last minute adds a minute to that match; earlier or later plays do not', () => {
  const due = new Date(T0 + HOUR)
  const at = (offsetMs) => extendOnPlay({ dueAt: due, now: new Date(due.getTime() + offsetMs), extensions: 0 })
  assert.equal(at(-61 * 1000).extended, false, 'just outside the window')
  const inWindow = at(-EXTENSION_WINDOW_MS)
  assert.equal(inWindow.extended, true, 'exactly one minute left counts')
  assert.equal(inWindow.dueAt.getTime(), due.getTime() + EXTENSION_MS)
  assert.equal(inWindow.extensions, 1)
  assert.equal(at(-1).extended, true)
  assert.equal(at(0).extended, false, 'at the deadline the match is already decided')
  assert.equal(at(5000).extended, false, 'after the deadline')
  assert.equal(at(5000).dueAt.getTime(), due.getTime(), 'and the deadline is never moved by a late play')
})

test('extensions chain while players keep answering, and stop at the cap', () => {
  let state = { dueAt: new Date(T0 + HOUR), extensions: 0 }
  for (let i = 0; i < MAX_EXTENSIONS; i += 1) {
    const r = extendOnPlay({ ...state, now: new Date(state.dueAt.getTime() - 30 * 1000) })
    assert.equal(r.extended, true, `extension ${i + 1}`)
    state = r
  }
  assert.equal(state.extensions, MAX_EXTENSIONS)
  const capped = extendOnPlay({ ...state, now: new Date(state.dueAt.getTime() - 30 * 1000) })
  assert.equal(capped.extended, false, 'a colluding pair cannot hold the round open for ever')
})

/* ── the deadline decision ─────────────────────────────────────────────────────────────── */

const ctx = (over = {}) => ({ now: base.getTime() + 1000, baseDueAt: base, minPlayable: HOUR, scoreA: 0, scoreB: 0, hasGame: false, blocker: null, deckProblem: null, ...over })
const early = new Date(base.getTime() - 5 * HOUR)
const late = new Date(base.getTime() - 5 * MIN)
const swiss = (o = {}) => ({ stage: 'SWISS', winsA: 0, winsB: 0, ties: 0, gamesCounted: 0, readyAAt: null, readyBAt: null, seedA: null, seedB: null, ...o })
const bracket = (o = {}) => swiss({ stage: 'BRACKET', seedA: 3, seedB: 6, ...o })

test('only one player pressed Start (in time): that player wins by walkover', () => {
  const r = decideAtDeadlineAsync(swiss({ readyAAt: early }), ctx())
  assert.deepEqual([r.kind, r.outcome, r.resolution], ['RESULT', 'A_WIN', 'WALKOVER'])
  assert.equal(decideAtDeadlineAsync(swiss({ readyBAt: early }), ctx()).outcome, 'B_WIN')
})

test('the last-second Start does not turn a real walkover into a draw or a win', () => {
  const r = decideAtDeadlineAsync(swiss({ readyAAt: early, readyBAt: late }), ctx())
  assert.deepEqual([r.outcome, r.resolution], ['A_WIN', 'WALKOVER'], 'the earlier player wins')
  const b = decideAtDeadlineAsync(bracket({ readyAAt: late, readyBAt: early }), ctx())
  assert.equal(b.outcome, 'B_WIN', 'even when the late presser is the better seed')
})

test('nobody showed (or both only started late), no game: Swiss draw, bracket better seed', () => {
  assert.deepEqual(decideAtDeadlineAsync(swiss(), ctx()).outcome, 'TIE')
  assert.equal(decideAtDeadlineAsync(swiss({ readyAAt: late, readyBAt: late }), ctx()).outcome, 'TIE')
  const b = decideAtDeadlineAsync(bracket(), ctx())
  assert.deepEqual([b.kind, b.outcome], ['RESULT', 'A_WIN'], 'seed 3 beats seed 6')
  assert.equal(decideAtDeadlineAsync(bracket({ seedA: 7, seedB: 2 }), ctx()).outcome, 'B_WIN')
  assert.equal(decideAtDeadlineAsync(bracket({ seedA: null, seedB: null }), ctx()).kind, 'NEEDS_ADMIN')
  assert.equal(decideAtDeadlineAsync(bracket({ seedA: 4, seedB: 4 }), ctx()).kind, 'NEEDS_ADMIN')
})

test('both started and a game is running: the player the game is waiting on loses the WHOLE match', () => {
  const m = swiss({ readyAAt: early, readyBAt: early })
  assert.equal(decideAtDeadlineAsync(m, ctx({ hasGame: true, blocker: 'B' })).outcome, 'A_WIN')
  assert.equal(decideAtDeadlineAsync(m, ctx({ hasGame: true, blocker: 'A' })).outcome, 'B_WIN')
  // Even trailing in the series: the mover still wins, as agreed.
  const trailing = decideAtDeadlineAsync(swiss({ winsA: 0, winsB: 1, gamesCounted: 1 }), ctx({ hasGame: true, blocker: 'B' }))
  assert.equal(trailing.outcome, 'A_WIN')
  assert.deepEqual([trailing.winsA, trailing.winsB], [0, 1], 'real game wins are kept, not inflated')
})

test('nobody is holding the game up: the series leader wins; level is a Swiss draw, bracket score then seed', () => {
  assert.equal(decideAtDeadlineAsync(swiss({ winsA: 1, winsB: 0, gamesCounted: 1 }), ctx({ hasGame: true })).outcome, 'A_WIN')
  assert.equal(decideAtDeadlineAsync(swiss({ winsA: 0, winsB: 1, gamesCounted: 1 }), ctx({ hasGame: true })).outcome, 'B_WIN')
  assert.equal(decideAtDeadlineAsync(swiss({ winsA: 1, winsB: 1, gamesCounted: 2 }), ctx({ hasGame: true })).outcome, 'TIE')
  const level = bracket({ winsA: 1, winsB: 1, gamesCounted: 2 })
  assert.equal(decideAtDeadlineAsync(level, ctx({ hasGame: true, scoreA: 40, scoreB: 55 })).outcome, 'B_WIN', 'higher aggregate in-game score')
  assert.equal(decideAtDeadlineAsync(level, ctx({ hasGame: true, scoreA: 50, scoreB: 50 })).outcome, 'A_WIN', 'then the better seed')
  assert.equal(decideAtDeadlineAsync({ ...level, seedA: null, seedB: null }, ctx({ hasGame: true })).kind, 'NEEDS_ADMIN')
})

test('a game that started but where nobody played is a no-play draw / seed decision, not a free win', () => {
  const m = swiss({ readyAAt: early, readyBAt: early })
  assert.equal(decideAtDeadlineAsync(m, ctx({ hasGame: true })).outcome, 'TIE')
  assert.equal(decideAtDeadlineAsync({ ...m, stage: 'BRACKET', seedA: 1, seedB: 2 }, ctx({ hasGame: true })).outcome, 'A_WIN')
})

test('a broken deck loses the match; both broken is a no-show', () => {
  const m = swiss({ readyAAt: early, readyBAt: early, winsA: 1, winsB: 0, gamesCounted: 1 })
  assert.equal(decideAtDeadlineAsync(m, ctx({ hasGame: true, deckProblem: 'A' })).outcome, 'B_WIN', 'even while leading')
  assert.equal(decideAtDeadlineAsync(m, ctx({ hasGame: true, deckProblem: 'B' })).outcome, 'A_WIN')
  const none = swiss({ readyAAt: early, readyBAt: early })
  assert.equal(decideAtDeadlineAsync(none, ctx({ deckProblem: 'BOTH' })).outcome, 'TIE')
})

test('the walkover shows 2-0 but is a result nobody played', () => {
  const r = decideAtDeadlineAsync(swiss({ readyAAt: early }), ctx())
  assert.deepEqual([r.winsA, r.winsB], [WINS_NEEDED, 0])
})

/* ── tiebreaks: results nobody played feed nothing ─────────────────────────────────────── */

test('under the async rules a no-play draw or walkover feeds neither opponent-win % nor game-win %; older matches are unchanged', () => {
  const players = ['a', 'b', 'c', 'd']
  const noPlayDraw = { stage: 'SWISS', status: 'COMPLETE', playerAUserId: 'a', playerBUserId: 'b', outcome: 'TIE', winsA: 0, winsB: 0, ties: 0, gamesCounted: 0 }
  const played = { stage: 'SWISS', status: 'COMPLETE', playerAUserId: 'c', playerBUserId: 'd', outcome: 'A_WIN', winsA: 2, winsB: 0, ties: 0, gamesCounted: 2 }
  const walkover = { stage: 'SWISS', status: 'COMPLETE', playerAUserId: 'a', playerBUserId: 'c', outcome: 'A_WIN', winsA: 2, winsB: 0, ties: 0, gamesCounted: 0 }

  const asyncRec = computeRecords(players, [{ ...noPlayDraw, asyncRules: true }, { ...walkover, asyncRules: true }, { ...played, asyncRules: true }], [])
  assert.equal(asyncRec.get('a').points, 4, 'the draw point and the walkover win still count in the standings')
  assert.equal(asyncRec.get('a').opponentMatchWinPct, 0, 'but they are nobody\'s strength-of-schedule')
  assert.equal(asyncRec.get('a').swissGameWins, 0, 'and not game wins')
  assert.equal(asyncRec.get('c').swissGameWins, 2, 'only real games count')

  const legacy = computeRecords(players, [noPlayDraw, walkover, played], [])
  assert.ok(legacy.get('a').opponentMatchWinPct > 0, 'a match from before the async rules is scored exactly as it always was')
  assert.equal(legacy.get('a').swissGameWins, 2)
})

/* ── who is the game waiting on (explicit plays only) ──────────────────────────────────── */

const card = (i) => ({
  ctoonId: `c${i}`, name: `c${i}`, assetPath: '/x.png', characters: [], color: 'RED', value: 5,
  type1: null, type2: null, type3: null, group: null, isSlam: false, effect: null, position: i
})
const mkMatch = () => initHands({
  id: 'g', players: ['a', 'b'], usernames: ['A', 'B'], deckOrder: [Array.from({ length: 12 }, (_, i) => card(i)), Array.from({ length: 12 }, (_, i) => card(i))],
  goalColor: ['RED', 'RED'], goalCardIdx: [0, 0], stake: [0, 0], noTimers: true
}, () => 0.5)

test('nobody has played yet: the game is not waiting on anyone', () => {
  assert.equal(pendingStepBlocker(mkMatch()), null)
})

test('one player commits: the other is who the game is waiting on; both committed: nobody', () => {
  const m = mkMatch()
  markCommitted(m, 1)
  assert.deepEqual(pendingStepBlocker(m), { moverIdx: 1, blockerIdx: 0 })
  markCommitted(m, 0)
  assert.equal(pendingStepBlocker(m), null)
})

test('discard, swap and colour picks are plays too', () => {
  const d = mkMatch(); d.phase = 'discard'; startPhaseClock(d)
  assert.equal(submitDiscard(d, 0, { cardIdxs: [] }).ok, true)
  assert.deepEqual(pendingStepBlocker(d), { moverIdx: 0, blockerIdx: 1 })

  const s = mkMatch(); s.phase = 'swap'; startPhaseClock(s); s.held = [{ slot: 7, deckIdx: 0 }, { slot: 7, deckIdx: 0 }]
  assert.equal(recordSwapChoice(s, 1, false).ok, true)
  assert.deepEqual(pendingStepBlocker(s), { moverIdx: 1, blockerIdx: 0 })

  const c = mkMatch(); c.phase = 'color'; startPhaseClock(c); c.colorReady = [false, false]
  assert.equal(submitColor(c, 0, { color: 'BLUE' }).ok, true)
  assert.deepEqual(pendingStepBlocker(c), { moverIdx: 0, blockerIdx: 1 })
})

test('a step the game completed for a player never makes them the mover (no winning by arranging for the game to move for you)', () => {
  // Player 0 cannot be offered a swap, so the game marks them ready up front; player 1 has not acted.
  const s = mkMatch(); s.phase = 'swap'; s.swapReady = [true, false]; startPhaseClock(s)
  assert.equal(pendingStepBlocker(s), null, 'nobody played, so the fallback (series leader / draw) decides')
  // Same for a player with no Silver card in the colour phase.
  const c = mkMatch(); c.phase = 'color'; c.colorReady = [true, false]; startPhaseClock(c)
  assert.equal(pendingStepBlocker(c), null)
})

test('the explicit-play marker resets when the next step begins', () => {
  const m = mkMatch()
  markCommitted(m, 0)
  assert.ok(pendingStepBlocker(m))
  startPhaseClock(m)
  assert.equal(pendingStepBlocker(m), null)
})

test('the explicit-play marker survives the persisted copy of a game', async () => {
  const { serializeMatch } = await import('../server/utils/ogGtoonsMatchSerialize.js')
  const m = mkMatch()
  markCommitted(m, 1)
  const restored = JSON.parse(JSON.stringify(serializeMatch(m)))
  assert.deepEqual(restored.acted, [false, true])
  assert.deepEqual(pendingStepBlocker(restored), { moverIdx: 1, blockerIdx: 0 })
})

test('a persisted copy keeps noTimers, and a restart never resumes an async game with phase clocks', async () => {
  const { serializeMatch } = await import('../server/utils/ogGtoonsMatchSerialize.js')
  const { readFileSync } = await import('node:fs')
  const m = mkMatch()
  m.noTimers = true
  assert.equal(JSON.parse(JSON.stringify(serializeMatch(m))).noTimers, true)
  assert.equal(m.deadline, null, 'an async game has no clock at all')
  const socket = readFileSync(new URL('../server/utils/ogGtoonsSocket.js', import.meta.url), 'utf8')
  assert.match(socket, /match\.noTimers \|\| match\.tournament\?\.async/, 'restore skips async games')
})
