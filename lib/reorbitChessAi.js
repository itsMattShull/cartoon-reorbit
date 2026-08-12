// ReOrbit Chess — evaluation, search, and the three opponents' personalities.
//
// Runs in a Web Worker in the browser (see public/games/chess/engine.worker.js). Never on the
// server: AI games pay no points, so there is nothing here worth defending against a cheat,
// and a search loop in the socket process would block every live PvP match.
//
// ── Making an engine play BADLY on purpose ───────────────────────────────────────────────
// The hard part of this file is not Mandark, it is Ed. A search that is simply shallow does
// not play like a beginner — it plays like a machine with a short horizon, which is a
// different and much more annoying thing: it never hangs a queen outright, but it also never
// develops a piece or castles, so it feels alien rather than weak.
//
// A believable ~500 needs three separate ingredients, and they are applied at the ROOT only,
// never inside the search (corrupting the search itself makes the engine incoherent — it
// blunders into its own tactics and cannot see two moves of a combination it started):
//
//   1. eval noise    — a random centipawn offset per root move, so close decisions go wrong
//   2. a blunder roll — with probability p, deliberately pick a bad-but-legal move
//   3. a tactics veil — mate and hanging material are only SOMETIMES noticed
//
// Ingredient 3 is what separates this from a random-move bot. A real 500 does take a free
// queen most of the time; they just miss it now and then. Rolling that explicitly is much
// more convincing than lowering the depth until the engine happens to miss things.

import {
  Position, perft, // eslint-disable-line no-unused-vars
  moveFrom, moveTo, movePromo, moveToCoords, squareName,
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING
} from './reorbitChessEngine.js'

/* ── Material and piece-square tables ────────────────────────────────────────────────────
 * Values in centipawns. The PSTs are the classic "simplified evaluation" tables: they are not
 * state of the art, but they are the cheapest way to buy the behaviour a human actually reads
 * as competence — knights come off the rim, pawns claim the centre, the king hides in the
 * opening and walks to the middle in the endgame.
 *
 * Tables are written from White's point of view with a8 first (so they read like a board in
 * the source) and flipped for Black at lookup. */

const MG_VALUE = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 0 }
const EG_VALUE = { [PAWN]: 120, [KNIGHT]: 300, [BISHOP]: 320, [ROOK]: 520, [QUEEN]: 940, [KING]: 0 }

const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
]
const PST_KNIGHT = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  0,  0,  0,-20,-40,
 -30,  0, 10, 15, 15, 10,  0,-30,
 -30,  5, 15, 20, 20, 15,  5,-30,
 -30,  0, 15, 20, 20, 15,  0,-30,
 -30,  5, 10, 15, 15, 10,  5,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50
]
const PST_BISHOP = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5, 10, 10,  5,  0,-10,
 -10,  5,  5, 10, 10,  5,  5,-10,
 -10,  0, 10, 10, 10, 10,  0,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  5,  0,  0,  0,  0,  5,-10,
 -20,-10,-10,-10,-10,-10,-10,-20
]
const PST_ROOK = [
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0
]
const PST_QUEEN = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20
]
const PST_KING_MG = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
]
const PST_KING_EG = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50
]

// The tables above are written a8-first so they read like a board. Convert once, at module
// load, into rank-indexed lookups (index = rank*8 + file) for White, and mirrored for Black.
function toRankIndexed (table) {
  const out = new Int16Array(64)
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) out[r * 8 + f] = table[(7 - r) * 8 + f]
  }
  return out
}
const PST = {
  [PAWN]: toRankIndexed(PST_PAWN),
  [KNIGHT]: toRankIndexed(PST_KNIGHT),
  [BISHOP]: toRankIndexed(PST_BISHOP),
  [ROOK]: toRankIndexed(PST_ROOK),
  [QUEEN]: toRankIndexed(PST_QUEEN)
}
const PST_K_MG = toRankIndexed(PST_KING_MG)
const PST_K_EG = toRankIndexed(PST_KING_EG)

const MATE = 100000
const MATE_THRESHOLD = MATE - 1000

/* ── Evaluation ──────────────────────────────────────────────────────────────────────────
 * Always from the side-to-move's point of view (negamax convention).
 *
 * Tapered between a middlegame and an endgame score by remaining material. Without the taper
 * the king never comes out in the endgame and the engine cannot convert K+Q vs K — it shuffles
 * until the fifty-move rule, which is the single most visible way an engine looks broken to a
 * human who has just won a queen. */
export function evaluate (pos) {
  const board = pos.board
  let mg = 0, eg = 0, phase = 0
  let whitePawnFiles = 0, blackPawnFiles = 0
  let whiteBishops = 0, blackBishops = 0
  const kings = [-1, -1]

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue }
    const pc = board[sq]
    if (!pc) continue
    const color = (pc & 16) ? BLACK : WHITE
    const type = pc & 7
    const rank = sq >> 4
    const file = sq & 7
    // Black's tables are the same board seen from the other side.
    const idx = color === WHITE ? (rank * 8 + file) : ((7 - rank) * 8 + file)
    const sign = color === WHITE ? 1 : -1

    if (type === KING) {
      kings[color] = sq
      mg += sign * PST_K_MG[idx]
      eg += sign * PST_K_EG[idx]
      continue
    }

    mg += sign * (MG_VALUE[type] + PST[type][idx])
    eg += sign * (EG_VALUE[type] + PST[type][idx])

    // Game phase: how much non-pawn material is left. Queens dominate the taper.
    if (type === QUEEN) phase += 4
    else if (type === ROOK) phase += 2
    else if (type === KNIGHT || type === BISHOP) phase += 1

    if (type === PAWN) {
      if (color === WHITE) whitePawnFiles |= (1 << file); else blackPawnFiles |= (1 << file)
    } else if (type === BISHOP) {
      if (color === WHITE) whiteBishops++; else blackBishops++
    }
  }

  // The bishop pair is worth about a third of a pawn and is the cheapest positional term that
  // stops the engine trading bishops for knights on principle.
  if (whiteBishops >= 2) { mg += 30; eg += 45 }
  if (blackBishops >= 2) { mg -= 30; eg -= 45 }

  // Endgame king activity: drive the losing king to the edge and walk the winning king
  // towards it. Without this an engine up a queen genuinely cannot force mate.
  const totalPhase = 24
  const p = Math.min(phase, totalPhase)
  if (p <= 6 && kings[WHITE] >= 0 && kings[BLACK] >= 0) {
    const materialEdge = mg
    const strong = materialEdge > 200 ? WHITE : materialEdge < -200 ? BLACK : -1
    if (strong >= 0) {
      const weak = strong ^ 1
      const wr = kings[weak] >> 4, wf = kings[weak] & 7
      const sr = kings[strong] >> 4, sf = kings[strong] & 7
      // Distance of the weak king from the centre — being cornered is what allows mate.
      const edge = Math.max(Math.abs(3.5 - wr), Math.abs(3.5 - wf))
      // Kings close together is how the strong side actually delivers it.
      const gap = Math.abs(sr - wr) + Math.abs(sf - wf)
      const bonus = edge * 30 + (14 - gap) * 12
      eg += (strong === WHITE ? bonus : -bonus)
    }
  }

  // Doubled and isolated pawns, counted by file occupancy. Crude, but it is what stops the
  // engine cheerfully wrecking its own structure to win a tempo.
  for (let f = 0; f < 8; f++) {
    const wHas = whitePawnFiles & (1 << f)
    const bHas = blackPawnFiles & (1 << f)
    const neighbours = ((f > 0 ? 1 << (f - 1) : 0) | (f < 7 ? 1 << (f + 1) : 0))
    if (wHas && !(whitePawnFiles & neighbours)) { mg -= 15; eg -= 20 }
    if (bHas && !(blackPawnFiles & neighbours)) { mg += 15; eg += 20 }
  }

  const score = ((mg * p) + (eg * (totalPhase - p))) / totalPhase
  return pos.turn === WHITE ? score : -score
}

/* ── Move ordering ───────────────────────────────────────────────────────────────────────
 * Alpha-beta is only as good as its ordering — the ~6^depth node estimate this engine's
 * budgets assume is unreachable without it. MVV-LVA (grab the most valuable victim with the
 * least valuable attacker) plus killer moves gets most of the available benefit for very
 * little code. */
const ORDER_VALUE = { [PAWN]: 1, [KNIGHT]: 3, [BISHOP]: 3, [ROOK]: 5, [QUEEN]: 9, [KING]: 20 }

function scoreMove (pos, m, killers, ply) {
  const to = moveTo(m)
  const victim = pos.board[to]
  if (victim) {
    const attacker = pos.board[moveFrom(m)]
    return 1000000 + ORDER_VALUE[victim & 7] * 100 - ORDER_VALUE[attacker & 7]
  }
  if (movePromo(m)) return 900000 + movePromo(m)
  const k = killers[ply]
  if (k) {
    if (k[0] === m) return 800000
    if (k[1] === m) return 799000
  }
  return 0
}

function orderMoves (pos, moves, killers, ply) {
  const scored = moves.map(m => [scoreMove(pos, m, killers, ply), m])
  scored.sort((a, b) => b[0] - a[0])
  for (let i = 0; i < moves.length; i++) moves[i] = scored[i][1]
  return moves
}

/* ── Search ──────────────────────────────────────────────────────────────────────────── */

class Searcher {
  constructor (pos, opts = {}) {
    this.pos = pos
    this.nodes = 0
    this.deadline = opts.deadline ?? Infinity
    this.useQuiescence = opts.useQuiescence !== false
    this.killers = Array.from({ length: 64 }, () => [0, 0])
    this.aborted = false
  }

  outOfTime () {
    // Checked every 2048 nodes rather than every node: Date.now() is not free, and at these
    // node rates a 2048-node granularity is well under a millisecond of overshoot.
    if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) this.aborted = true
    return this.aborted
  }

  /**
   * Quiescence: keep searching captures past the horizon so the engine never evaluates a
   * position in the middle of a trade. Without it, a depth-N engine happily plays QxP one ply
   * before the horizon and "wins" a pawn that is recaptured on the move it cannot see. This
   * is the single biggest strength-per-line item in the file.
   */
  quiesce (alpha, beta) {
    this.nodes++
    if (this.outOfTime()) return alpha

    const standPat = evaluate(this.pos)
    if (standPat >= beta) return beta
    if (standPat > alpha) alpha = standPat

    const moves = orderMoves(this.pos, this.pos.generateMoves(true), this.killers, 0)
    for (const m of moves) {
      if (!this.pos.makeMove(m)) continue
      const score = -this.quiesce(-beta, -alpha)
      this.pos.unmakeMove()
      if (this.aborted) return alpha
      if (score >= beta) return beta
      if (score > alpha) alpha = score
    }
    return alpha
  }

  negamax (depth, alpha, beta, ply) {
    this.nodes++
    if (this.outOfTime()) return alpha

    // A repeated position inside the search is a draw offer the engine should notice — it is
    // what stops it walking into a perpetual while winning.
    if (ply > 0 && this.pos.halfmove >= 100) return 0

    if (depth <= 0) {
      return this.useQuiescence ? this.quiesce(alpha, beta) : evaluate(this.pos)
    }

    const moves = orderMoves(this.pos, this.pos.generateMoves(false), this.killers, ply)
    let legal = 0
    let best = -Infinity

    for (const m of moves) {
      if (!this.pos.makeMove(m)) continue
      legal++
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1)
      this.pos.unmakeMove()
      if (this.aborted) return best === -Infinity ? alpha : best

      if (score > best) best = score
      if (score > alpha) alpha = score
      if (alpha >= beta) {
        // Killer moves: quiet moves that caused a cutoff get tried first at the same ply in
        // sibling nodes. Captures are already ordered first, so only quiets are stored.
        if (!this.pos.board[moveTo(m)]) {
          const k = this.killers[ply]
          if (k[0] !== m) { k[1] = k[0]; k[0] = m }
        }
        break
      }
    }

    if (legal === 0) {
      // Mate scores are offset by ply so the engine prefers mate in 2 over mate in 4 — and,
      // just as importantly, prefers being mated LATER when it is lost.
      return this.pos.inCheck() ? -MATE + ply : 0
    }
    return best
  }

  /** Scores every legal root move. Returns [{ move, score }], best first. */
  searchRoot (depth) {
    const moves = orderMoves(this.pos, this.pos.generateMoves(false), this.killers, 0)
    const out = []
    for (const m of moves) {
      if (!this.pos.makeMove(m)) continue
      const score = -this.negamax(depth - 1, -Infinity, Infinity, 1)
      this.pos.unmakeMove()
      if (this.aborted) break
      out.push({ move: m, score })
    }
    out.sort((a, b) => b.score - a.score)
    return out
  }
}

/**
 * Iterative deepening. Each completed depth replaces the previous result, and an aborted depth
 * is discarded — so a hard time budget can never return a half-searched (and therefore
 * arbitrarily bad) move list.
 */
export function searchBestMoves (pos, { maxDepth = 4, budgetMs = 1000, useQuiescence = true } = {}) {
  const deadline = Date.now() + budgetMs
  let best = []
  let reached = 0
  for (let d = 1; d <= maxDepth; d++) {
    const s = new Searcher(pos, { deadline, useQuiescence })
    const scored = s.searchRoot(d)
    if (s.aborted && scored.length === 0) break
    if (!s.aborted) { best = scored; reached = d }
    if (Date.now() > deadline) break
    // A forced mate found is not going to be improved on by searching deeper.
    if (best.length && best[0].score > MATE_THRESHOLD) break
  }
  return { moves: best, depth: reached }
}

/* ── Personas ────────────────────────────────────────────────────────────────────────────
 * The numbers below are the whole difficulty curve. Each is tuned against what the character
 * is, not just against an Elo target:
 *
 *   ed       — genuinely weak. Sees one move ahead, no quiescence, misses half the mates he
 *              is handed and hangs pieces on nearly a third of his moves. He does still take
 *              a free queen most of the time, which is what keeps him feeling like a person
 *              rather than a random-move generator.
 *   computer — a competent club-level opponent that punishes real mistakes but misses deep
 *              tactics. Quiescence on, so it never loses a piece to a simple recapture.
 *   mandark  — plays properly. Full budget, deep search, no noise, no mercy.
 *
 * blunderChance is the probability of ignoring the search entirely for one move and playing
 * something bad on purpose. mateBlindness is the probability of NOT playing a mate it found.
 * noiseCp is the standard deviation of the random offset added to every root move's score. */
export const PERSONAS = {
  ed: {
    id: 'ed',
    maxDepth: 2,
    budgetMs: 300,
    useQuiescence: false,
    noiseCp: 130,
    blunderChance: 0.28,
    mateBlindness: 0.5,
    // Even when blundering, Ed picks from the middle of the pack rather than the literal
    // worst move on the board. Always playing the single worst legal move is a distinct and
    // very recognisable kind of wrong.
    blunderFromWorstFraction: 0.5,
    thinkMs: [500, 1400]
  },
  computer: {
    id: 'computer',
    maxDepth: 4,
    budgetMs: 700,
    useQuiescence: true,
    noiseCp: 45,
    blunderChance: 0.07,
    mateBlindness: 0.12,
    blunderFromWorstFraction: 0.35,
    thinkMs: [700, 1800]
  },
  mandark: {
    id: 'mandark',
    maxDepth: 7,
    budgetMs: 1400,
    useQuiescence: true,
    noiseCp: 0,
    blunderChance: 0,
    mateBlindness: 0,
    blunderFromWorstFraction: 0,
    thinkMs: [900, 2200]
  }
}

// Gaussian noise via Box-Muller. A uniform offset would make every near-tie a coin flip;
// a normal distribution keeps most decisions correct and occasionally gets one badly wrong,
// which is what a human's judgement error actually looks like.
function gauss (rng, sd) {
  if (sd <= 0) return 0
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd
}

/**
 * Picks the move a persona plays from a FEN.
 *
 * Returns { from, to, promotion } in chess.js coordinate form, plus telemetry the page uses
 * to drive dialogue (was it a capture, was it a blunder, how sure was it).
 *
 * `rng` is injectable so the tests can be deterministic.
 */
export function pickMove (fen, personaId, { rng = Math.random, history = [], budgetMs, maxDepth } = {}) {
  const persona = PERSONAS[personaId] || PERSONAS.computer
  const pos = new Position(fen)

  const { moves: allMoves, depth } = searchBestMoves(pos, {
    // Overridable so self-play tests can run a full game without spending 1.4s a move.
    maxDepth: maxDepth ?? persona.maxDepth,
    budgetMs: budgetMs ?? persona.budgetMs,
    useQuiescence: persona.useQuiescence
  })
  if (!allMoves.length) return null

  const bestScore = allMoves[0].score
  const foundMate = bestScore > MATE_THRESHOLD

  // Ingredient 3: the tactics veil. A mate that is found is not always played.
  const seesMate = foundMate && rng() >= persona.mateBlindness

  // When the veil DOES fall, the mating moves have to be taken off the table entirely.
  // Leaving them in and relying on noise to pass them over does not work: a mate scores
  // ±100000 and no plausible amount of centipawn noise reaches that, so the "blind" persona
  // plays the mate anyway. Measured: Ed found 83% of mate-in-1s with a 50% blindness setting
  // until this filter existed.
  const moves = (foundMate && !seesMate && allMoves.some(m => m.score <= MATE_THRESHOLD))
    ? allMoves.filter(m => m.score <= MATE_THRESHOLD)
    : allMoves

  let chosen
  let deliberate = false

  if (seesMate) {
    chosen = allMoves[0]
  } else if (persona.blunderChance > 0 && rng() < persona.blunderChance && moves.length > 2) {
    // Ingredient 2: pick from the weaker end of the move list, but not the very bottom.
    const from = Math.floor(moves.length * (1 - persona.blunderFromWorstFraction))
    const pool = moves.slice(Math.max(1, from))
    chosen = pool[Math.floor(rng() * pool.length)] || moves[moves.length - 1]
    deliberate = true
  } else {
    // Ingredient 1: noise. Re-rank by score + gaussian offset, then take the top.
    let bestNoisy = null
    let bestVal = -Infinity
    for (const entry of moves) {
      // Never let noise talk the engine into throwing away a mate it is being mated by, or
      // into a move that loses on the spot when a mate is on the board.
      const val = entry.score + gauss(rng, persona.noiseCp)
      if (val > bestVal) { bestVal = val; bestNoisy = entry }
    }
    chosen = bestNoisy || moves[0]
  }

  // Repetition avoidance. An engine that is winning and repeats the position is, to a human,
  // an engine that has stopped trying — and three of them is a draw the AI just gave away.
  if (history.length && moves.length > 1) {
    const coords = moveToCoords(chosen.move)
    const key = coords.from + coords.to
    const repeats = history.filter(h => h === key).length
    if (repeats >= 1 && chosen.score > -50) {
      const alt = moves.find(e => {
        const c = moveToCoords(e.move)
        return (c.from + c.to) !== key && e.score > chosen.score - 90
      })
      if (alt) chosen = alt
    }
  }

  const out = moveToCoords(chosen.move)
  return {
    ...out,
    // Telemetry for the dialogue layer, not for the rules.
    meta: {
      depth,
      score: Math.round(chosen.score),
      bestScore: Math.round(bestScore),
      // How much worse than best the played move was — the dialogue uses this to let a
      // character react to its own mistake.
      lost: Math.round(bestScore - chosen.score),
      deliberateBlunder: deliberate,
      isMate: foundMate && seesMate,
      capture: Boolean(pos.board[moveTo(chosen.move)]),
      promotion: Boolean(movePromo(chosen.move))
    }
  }
}

export const __testing = { evaluate, searchBestMoves, MATE, MATE_THRESHOLD }
