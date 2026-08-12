import test from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'

import { Position, perft, moveToCoords, squareName, squareFromName } from '../lib/reorbitChessEngine.js'
import { pickMove, PERSONAS, __testing } from '../lib/reorbitChessAi.js'

// The engine's move generator is a from-scratch 0x88 implementation written because chess.js
// is ~870x too slow to search with (see the header of lib/reorbitChessEngine.js). Writing
// your own generator is exactly the kind of thing that is 99% right and silently wrong in the
// remaining 1%, so it is pinned against published perft values here. Kiwipete and positions
// 3-5 are the standard suite precisely because they catch castling-through-check, en passant
// pins, and promotion edge cases that a naive generator gets wrong.

const CASES = [
  ['startpos', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
  ['ep+promo', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
  ['promotions', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]]
]

for (const [name, fen, expected] of CASES) {
  test(`perft matches the published values: ${name}`, () => {
    for (let d = 1; d <= expected.length; d++) {
      const pos = new Position(fen)
      assert.equal(perft(pos, d), expected[d - 1], `${name} depth ${d}`)
    }
  })
}

test('FEN round-trips through the internal board', () => {
  for (const [, fen] of CASES) {
    assert.equal(new Position(fen).fen(), fen, `${fen} did not survive a round trip`)
  }
})

test('square naming is its own inverse', () => {
  for (const name of ['a1', 'h1', 'a8', 'h8', 'e4', 'd5']) {
    assert.equal(squareName(squareFromName(name)), name)
  }
})

test('make/unmake leaves the position byte-identical', () => {
  // An unmake that restores the board but not the castling rights, ep square or halfmove
  // clock corrupts every sibling node in the search rather than failing loudly.
  for (const [name, fen] of CASES) {
    const pos = new Position(fen)
    const before = pos.fen()
    for (const m of pos.generateMoves(false)) {
      if (!pos.makeMove(m)) continue
      pos.unmakeMove()
      assert.equal(pos.fen(), before, `${name}: ${JSON.stringify(moveToCoords(m))} did not unmake cleanly`)
    }
  }
})

test('every generated legal move is legal according to chess.js', () => {
  // The generator is only ever a suggestion engine, but a suggestion chess.js rejects costs
  // the AI its move and falls back to a random one, so a disagreement is a real defect.
  for (const [name, fen] of CASES) {
    const pos = new Position(fen)
    const ref = new Chess(fen)
    const refSet = new Set(ref.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || '')))
    const mine = pos.legalMoves().map(m => {
      const c = moveToCoords(m)
      return c.from + c.to + (c.promotion || '')
    })
    assert.equal(mine.length, refSet.size, `${name}: generated ${mine.length}, chess.js has ${refSet.size}`)
    for (const m of mine) assert.ok(refSet.has(m), `${name}: generated ${m}, which chess.js says is illegal`)
  }
})

test('the search finds a mate in one', () => {
  const { searchBestMoves, MATE_THRESHOLD } = __testing
  const pos = new Position('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
  const { moves } = searchBestMoves(pos, { maxDepth: 2, budgetMs: 500 })
  assert.ok(moves[0].score > MATE_THRESHOLD, 'the mate was not scored as a mate')
  assert.deepEqual(moveToCoords(moves[0].move), { from: 'a1', to: 'a8' })
})

test('the search prefers a faster mate', () => {
  // Mate scores are offset by ply so mate-in-1 beats mate-in-3. Without the offset an engine
  // finds "a mate" and then never converts it, shuffling between equally-winning lines.
  const { searchBestMoves } = __testing
  const pos = new Position('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
  const { moves } = searchBestMoves(pos, { maxDepth: 3, budgetMs: 800 })
  assert.deepEqual(moveToCoords(moves[0].move), { from: 'a1', to: 'a8' })
})

test('every persona only ever proposes legal moves', () => {
  // Ten games of persona-vs-persona. Any illegal proposal is caught by chess.js refusing it.
  for (let g = 0; g < 10; g++) {
    const c = new Chess()
    for (let ply = 0; ply < 40 && !c.isGameOver(); ply++) {
      const persona = ['ed', 'computer', 'mandark'][ply % 3]
      const mv = pickMove(c.fen(), persona, { budgetMs: 60, maxDepth: 2 })
      assert.ok(mv, 'a persona returned no move in a position that has legal moves')
      const applied = c.move({ from: mv.from, to: mv.to, promotion: mv.promotion })
      assert.ok(applied, `${persona} proposed an illegal move ${mv.from}${mv.to} in ${c.fen()}`)
    }
  }
})

test('a persona returns null only when the game is genuinely over', () => {
  const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
  assert.equal(pickMove(mated, 'mandark', { budgetMs: 50, maxDepth: 1 }), null)
})

test('personas are ordered by how often they find a mate', () => {
  // The difficulty curve is the product requirement, so it is asserted rather than assumed.
  // Ed is deliberately blind to half the mates he is handed; Mandark never is.
  const FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
  const rate = (persona, n = 120) => {
    let found = 0
    for (let i = 0; i < n; i++) {
      const mv = pickMove(FEN, persona)
      if (mv && mv.from === 'a1' && mv.to === 'a8') found++
    }
    return found / n
  }
  const ed = rate('ed')
  const mandark = rate('mandark')
  assert.equal(mandark, 1, 'Mandark must never miss a mate in one')
  // Wide bounds: this is a random process and the test must not flake. The point is that Ed
  // clearly misses mates and clearly is not random.
  assert.ok(ed > 0.25 && ed < 0.8, `Ed's mate rate should sit near his 50% blindness knob, got ${ed}`)
  assert.ok(ed < mandark, 'Ed must be measurably weaker than Mandark')
})

test('persona tuning stays inside sane bounds', () => {
  for (const [id, p] of Object.entries(PERSONAS)) {
    assert.ok(p.maxDepth >= 1, `${id} would search no plies at all`)
    assert.ok(p.budgetMs > 0 && p.budgetMs <= 3000, `${id} would hang the worker`)
    assert.ok(p.blunderChance >= 0 && p.blunderChance < 0.5,
      `${id} blunders so often it is a random-move bot`)
    assert.ok(p.mateBlindness >= 0 && p.mateBlindness <= 0.6, `${id} would never convert a win`)
  }
  // Mandark is the advertised 1700; he must not be handicapped at all.
  assert.equal(PERSONAS.mandark.blunderChance, 0)
  assert.equal(PERSONAS.mandark.mateBlindness, 0)
  assert.equal(PERSONAS.mandark.noiseCp, 0)
  assert.ok(PERSONAS.mandark.maxDepth > PERSONAS.computer.maxDepth)
  assert.ok(PERSONAS.computer.maxDepth > PERSONAS.ed.maxDepth)
})

test('the search respects its time budget', () => {
  // The budget is what stops Mandark freezing a phone. Iterative deepening discards an
  // aborted depth, so overrunning here would mean the abort check is not firing.
  const { searchBestMoves } = __testing
  const pos = new Position('r1bqkb1r/pp2nppp/2n1p3/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R w KQkq - 0 7')
  const started = Date.now()
  searchBestMoves(pos, { maxDepth: 20, budgetMs: 300 })
  const took = Date.now() - started
  assert.ok(took < 2500, `search overran its 300ms budget badly: ${took}ms`)
})

test('the endgame eval drives a lone king toward the edge', () => {
  // Without this term an engine up a queen shuffles until the fifty-move rule, which is the
  // most visible way an engine looks broken to a human who has just won material.
  const { evaluate } = __testing
  const cornered = new Position('7k/8/6Q1/8/8/8/8/K7 w - - 0 1')
  const central = new Position('8/8/3k4/8/6Q1/8/8/K7 w - - 0 1')
  assert.ok(evaluate(cornered) > evaluate(central),
    'a cornered enemy king must evaluate better than a centralised one')
})

test('a winning persona can actually force mate with a queen', () => {
  // The UX failure this guards: the player trades down into a won endgame and the AI cannot
  // finish, so the game dribbles into a fifty-move draw.
  const c = new Chess('7k/8/8/8/8/8/8/K5QR w - - 0 1')
  let plies = 0
  while (!c.isGameOver() && plies < 80) {
    const mv = pickMove(c.fen(), c.turn() === 'w' ? 'mandark' : 'ed', { budgetMs: 120, maxDepth: 3 })
    if (!mv) break
    if (!c.move({ from: mv.from, to: mv.to, promotion: mv.promotion })) break
    plies++
  }
  assert.ok(c.isCheckmate(), `K+Q+R vs K was not converted in 80 plies (ended: ${c.fen()})`)
})
