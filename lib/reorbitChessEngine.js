// ReOrbit Chess — the AI's internal board and search.
//
// ── Why this exists when chess.js is right there ─────────────────────────────────────────
// chess.js is the authoritative ruleset everywhere it matters (the server validates every PvP
// move with it, and the page uses it for the human's legal moves, check/mate/draw detection
// and SAN). It is not, however, something you can search with. Measured on the build
// container with chess.js@1.4.0 from a middlegame position:
//
//     moves() calls/sec       ~621          (1.6ms per move generation)
//     move()+undo() pairs/sec ~9,900
//     effective search rate   ~8,150 nodes/sec
//
// A mid-range phone is roughly a quarter of that — about 2,000 nodes/sec. Alpha-beta with
// decent ordering needs ~6^depth nodes, so chess.js caps out around depth 4 (~640ms) and
// takes ~3.8 SECONDS for depth 5. Mandark is supposed to feel like a 1700, which needs depth
// 5-6 plus quiescence. So the search runs on the 0x88 board below instead, which is ~50x
// faster because it never allocates a move object or re-parses a FEN.
//
// The correctness risk that buys is contained by construction: this module only ever ANSWERS
// "given this FEN, which move?". The caller hands the answer to chess.js, which is what
// actually moves the piece — and pickMove()'s caller treats an illegal suggestion as a bug to
// fall back from, not a move to play (see the worker). So a generation bug here can cost the
// AI a good move; it cannot corrupt a game or desync the board.
//
// Verified by perft against chess.js from four positions — see tests/reorbitChessEngine.test.js.

/* ── Board representation ────────────────────────────────────────────────────────────────
 * 0x88: a 16x8 array where a square is off-board iff (sq & 0x88) !== 0. That single AND
 * replaces every rank/file bounds check in the generator, which is the whole point.
 * a1 = 0, h1 = 7, a8 = 112. rank = sq >> 4, file = sq & 7. White moves toward higher ranks. */

export const WHITE = 0
export const BLACK = 1

// Piece codes. Colour is the high bit (8), type is the low three bits, so `code & 7` is the
// type and `code >> 3` is the colour — both branch-free in the hot loop.
export const EMPTY = 0
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6
const W = 8, B = 16
// Encoded as colour flag | type. White pieces are 9..14, black are 17..22.
const WP = W | PAWN, WN = W | KNIGHT, WB = W | BISHOP, WR = W | ROOK, WQ = W | QUEEN, WK = W | KING
const BP = B | PAWN, BN = B | KNIGHT, BB = B | BISHOP, BR = B | ROOK, BQ = B | QUEEN, BK = B | KING

const colorOf = (pc) => (pc & B) ? BLACK : WHITE
const typeOf = (pc) => pc & 7

const FEN_TO_PIECE = {
  P: WP, N: WN, B: WB, R: WR, Q: WQ, K: WK,
  p: BP, n: BN, b: BB, r: BR, q: BQ, k: BK
}
const PIECE_TO_FEN = { [WP]: 'P', [WN]: 'N', [WB]: 'B', [WR]: 'R', [WQ]: 'Q', [WK]: 'K', [BP]: 'p', [BN]: 'n', [BB]: 'b', [BR]: 'r', [BQ]: 'q', [BK]: 'k' }

// Castling rights as bits, so they survive a make/unmake as one integer.
const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8

const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33]
const BISHOP_OFFSETS = [-17, -15, 15, 17]
const ROOK_OFFSETS = [-16, -1, 1, 16]
const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17]

export const squareName = (sq) => 'abcdefgh'[sq & 7] + (1 + (sq >> 4))
export const squareFromName = (name) => {
  const f = name.charCodeAt(0) - 97
  const r = name.charCodeAt(1) - 49
  return (r << 4) | f
}

/* ── Move encoding ───────────────────────────────────────────────────────────────────────
 * One 32-bit int per move, so the move list is a plain array of numbers and the generator
 * allocates nothing per node. Layout:
 *   bits  0-7  from square
 *   bits  8-15 to square
 *   bits 16-18 promotion piece type (0 = none)
 *   bits 19-23 flags
 *   bits 24-28 captured piece code (filled by the generator so unmake needs no board read) */
const FLAG_EP = 1 << 19
const FLAG_CASTLE = 1 << 20
const FLAG_DOUBLE = 1 << 21

const mkMove = (from, to, promo, flags, captured) =>
  from | (to << 8) | (promo << 16) | flags | (captured << 24)

export const moveFrom = (m) => m & 0xff
export const moveTo = (m) => (m >> 8) & 0xff
export const movePromo = (m) => (m >> 16) & 7
const moveCaptured = (m) => (m >> 24) & 0x1f

const PROMO_LETTER = { [KNIGHT]: 'n', [BISHOP]: 'b', [ROOK]: 'r', [QUEEN]: 'q' }

/** Converts an internal move to the {from,to,promotion} shape chess.js accepts. */
export function moveToCoords (m) {
  const out = { from: squareName(moveFrom(m)), to: squareName(moveTo(m)) }
  const p = movePromo(m)
  if (p) out.promotion = PROMO_LETTER[p]
  return out
}

/* ── Position ────────────────────────────────────────────────────────────────────────── */

export class Position {
  constructor (fen) {
    this.board = new Int8Array(128)
    this.turn = WHITE
    this.castling = 0
    this.ep = -1
    this.halfmove = 0
    this.fullmove = 1
    this.kingSq = [-1, -1]
    this.undoStack = []
    if (fen) this.setFen(fen)
  }

  setFen (fen) {
    const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/)
    this.board.fill(EMPTY)
    let sq = 112 // a8 — FEN starts at the eighth rank
    for (const ch of placement) {
      if (ch === '/') { sq -= 24; continue }
      if (ch >= '1' && ch <= '8') { sq += ch.charCodeAt(0) - 48; continue }
      const pc = FEN_TO_PIECE[ch]
      this.board[sq] = pc
      if (typeOf(pc) === KING) this.kingSq[colorOf(pc)] = sq
      sq++
    }
    this.turn = turn === 'b' ? BLACK : WHITE
    this.castling = 0
    if (castling && castling !== '-') {
      if (castling.includes('K')) this.castling |= CASTLE_WK
      if (castling.includes('Q')) this.castling |= CASTLE_WQ
      if (castling.includes('k')) this.castling |= CASTLE_BK
      if (castling.includes('q')) this.castling |= CASTLE_BQ
    }
    this.ep = (ep && ep !== '-') ? squareFromName(ep) : -1
    this.halfmove = Number(half || 0)
    this.fullmove = Number(full || 1)
    this.undoStack.length = 0
  }

  fen () {
    let placement = ''
    for (let r = 7; r >= 0; r--) {
      let run = 0
      for (let f = 0; f < 8; f++) {
        const pc = this.board[(r << 4) | f]
        if (pc === EMPTY) { run++; continue }
        if (run) { placement += run; run = 0 }
        placement += PIECE_TO_FEN[pc]
      }
      if (run) placement += run
      if (r) placement += '/'
    }
    let c = ''
    if (this.castling & CASTLE_WK) c += 'K'
    if (this.castling & CASTLE_WQ) c += 'Q'
    if (this.castling & CASTLE_BK) c += 'k'
    if (this.castling & CASTLE_BQ) c += 'q'
    return [
      placement,
      this.turn === WHITE ? 'w' : 'b',
      c || '-',
      this.ep >= 0 ? squareName(this.ep) : '-',
      this.halfmove,
      this.fullmove
    ].join(' ')
  }

  /** True if `color`'s king is attacked. */
  inCheck (color = this.turn) {
    return this.isAttacked(this.kingSq[color], color ^ 1)
  }

  /** True if `by` attacks `sq`. Used for legality and for king safety in the eval. */
  isAttacked (sq, by) {
    if (sq < 0) return false
    const board = this.board

    // Pawns. A white pawn on sq-15/sq-17 attacks sq, and vice versa.
    if (by === WHITE) {
      let s = sq - 15
      if (!(s & 0x88) && board[s] === WP) return true
      s = sq - 17
      if (!(s & 0x88) && board[s] === WP) return true
    } else {
      let s = sq + 15
      if (!(s & 0x88) && board[s] === BP) return true
      s = sq + 17
      if (!(s & 0x88) && board[s] === BP) return true
    }

    const knight = by === WHITE ? WN : BN
    for (let i = 0; i < 8; i++) {
      const s = sq + KNIGHT_OFFSETS[i]
      if (!(s & 0x88) && board[s] === knight) return true
    }

    const king = by === WHITE ? WK : BK
    for (let i = 0; i < 8; i++) {
      const s = sq + KING_OFFSETS[i]
      if (!(s & 0x88) && board[s] === king) return true
    }

    // Sliders: walk each ray until it leaves the board or hits a piece.
    const queen = by === WHITE ? WQ : BQ
    const bishop = by === WHITE ? WB : BB
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_OFFSETS[i]
      for (let s = sq + d; !(s & 0x88); s += d) {
        const pc = board[s]
        if (pc === EMPTY) continue
        if (pc === bishop || pc === queen) return true
        break
      }
    }
    const rook = by === WHITE ? WR : BR
    for (let i = 0; i < 4; i++) {
      const d = ROOK_OFFSETS[i]
      for (let s = sq + d; !(s & 0x88); s += d) {
        const pc = board[s]
        if (pc === EMPTY) continue
        if (pc === rook || pc === queen) return true
        break
      }
    }
    return false
  }

  /**
   * Pseudo-legal move generation. Moves that leave the mover in check are filtered by
   * makeMove(), which unmakes and reports false — the standard "make and test" approach.
   * Generating pseudo-legally and rejecting on make is faster than proving legality up front,
   * because most nodes are cut before their moves are ever made.
   *
   * `capturesOnly` drives quiescence: it emits captures and promotions only.
   */
  generateMoves (capturesOnly = false) {
    const moves = []
    const board = this.board
    const us = this.turn
    const them = us ^ 1

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue } // skip the off-board half of the row
      const pc = board[sq]
      if (pc === EMPTY || colorOf(pc) !== us) continue
      const type = typeOf(pc)

      if (type === PAWN) {
        const dir = us === WHITE ? 16 : -16
        const startRank = us === WHITE ? 1 : 6
        const promoRank = us === WHITE ? 7 : 0

        const one = sq + dir
        if (!(one & 0x88) && board[one] === EMPTY) {
          if ((one >> 4) === promoRank) {
            // Promotions count as captures for quiescence: they swing material just as hard.
            moves.push(mkMove(sq, one, QUEEN, 0, 0), mkMove(sq, one, ROOK, 0, 0),
              mkMove(sq, one, BISHOP, 0, 0), mkMove(sq, one, KNIGHT, 0, 0))
          } else if (!capturesOnly) {
            moves.push(mkMove(sq, one, 0, 0, 0))
            const two = sq + dir * 2
            if ((sq >> 4) === startRank && board[two] === EMPTY) {
              moves.push(mkMove(sq, two, 0, FLAG_DOUBLE, 0))
            }
          }
        }
        for (const dc of (us === WHITE ? [15, 17] : [-15, -17])) {
          const to = sq + dc
          if (to & 0x88) continue
          const target = board[to]
          if (target !== EMPTY && colorOf(target) === them) {
            if ((to >> 4) === promoRank) {
              moves.push(mkMove(sq, to, QUEEN, 0, target), mkMove(sq, to, ROOK, 0, target),
                mkMove(sq, to, BISHOP, 0, target), mkMove(sq, to, KNIGHT, 0, target))
            } else {
              moves.push(mkMove(sq, to, 0, 0, target))
            }
          } else if (to === this.ep && target === EMPTY) {
            // The captured pawn sits beside the destination, not on it.
            moves.push(mkMove(sq, to, 0, FLAG_EP, us === WHITE ? BP : WP))
          }
        }
        continue
      }

      if (type === KNIGHT || type === KING) {
        const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS
        for (let i = 0; i < 8; i++) {
          const to = sq + offsets[i]
          if (to & 0x88) continue
          const target = board[to]
          if (target === EMPTY) { if (!capturesOnly) moves.push(mkMove(sq, to, 0, 0, 0)) }
          else if (colorOf(target) === them) moves.push(mkMove(sq, to, 0, 0, target))
        }
      } else {
        const offsets = type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : KING_OFFSETS
        const count = type === QUEEN ? 8 : 4
        for (let i = 0; i < count; i++) {
          const d = offsets[i]
          for (let to = sq + d; !(to & 0x88); to += d) {
            const target = board[to]
            if (target === EMPTY) { if (!capturesOnly) moves.push(mkMove(sq, to, 0, 0, 0)); continue }
            if (colorOf(target) === them) moves.push(mkMove(sq, to, 0, 0, target))
            break
          }
        }
      }
    }

    if (!capturesOnly) this.generateCastles(moves)
    return moves
  }

  generateCastles (moves) {
    const board = this.board
    const us = this.turn
    const them = us ^ 1
    if (us === WHITE) {
      if ((this.castling & CASTLE_WK) && board[5] === EMPTY && board[6] === EMPTY &&
          !this.isAttacked(4, them) && !this.isAttacked(5, them) && !this.isAttacked(6, them)) {
        moves.push(mkMove(4, 6, 0, FLAG_CASTLE, 0))
      }
      if ((this.castling & CASTLE_WQ) && board[3] === EMPTY && board[2] === EMPTY && board[1] === EMPTY &&
          !this.isAttacked(4, them) && !this.isAttacked(3, them) && !this.isAttacked(2, them)) {
        moves.push(mkMove(4, 2, 0, FLAG_CASTLE, 0))
      }
    } else {
      if ((this.castling & CASTLE_BK) && board[117] === EMPTY && board[118] === EMPTY &&
          !this.isAttacked(116, them) && !this.isAttacked(117, them) && !this.isAttacked(118, them)) {
        moves.push(mkMove(116, 118, 0, FLAG_CASTLE, 0))
      }
      if ((this.castling & CASTLE_BQ) && board[115] === EMPTY && board[114] === EMPTY && board[113] === EMPTY &&
          !this.isAttacked(116, them) && !this.isAttacked(115, them) && !this.isAttacked(114, them)) {
        moves.push(mkMove(116, 114, 0, FLAG_CASTLE, 0))
      }
    }
  }

  /**
   * Applies a move. Returns false and leaves the position untouched if the move was illegal
   * (i.e. it left the mover in check), which is how pseudo-legal generation is filtered.
   */
  makeMove (m) {
    const board = this.board
    const from = moveFrom(m)
    const to = moveTo(m)
    const promo = movePromo(m)
    const pc = board[from]
    const us = this.turn

    this.undoStack.push({
      move: m,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      kingSq: this.kingSq[us],
      captured: board[to]
    })

    board[to] = promo ? ((us === WHITE ? W : B) | promo) : pc
    board[from] = EMPTY

    if (m & FLAG_EP) {
      // The captured pawn is on the mover's own rank, beside the destination.
      board[us === WHITE ? to - 16 : to + 16] = EMPTY
    }

    if (m & FLAG_CASTLE) {
      // King has already moved; bring the rook round.
      if (to === 6) { board[5] = board[7]; board[7] = EMPTY }
      else if (to === 2) { board[3] = board[0]; board[0] = EMPTY }
      else if (to === 118) { board[117] = board[119]; board[119] = EMPTY }
      else if (to === 114) { board[115] = board[112]; board[112] = EMPTY }
    }

    if (typeOf(pc) === KING) this.kingSq[us] = to

    // Castling rights die when a king or rook leaves its home square, and when a rook is
    // captured on its home square.
    if (this.castling) {
      if (from === 4) this.castling &= ~(CASTLE_WK | CASTLE_WQ)
      else if (from === 116) this.castling &= ~(CASTLE_BK | CASTLE_BQ)
      if (from === 7 || to === 7) this.castling &= ~CASTLE_WK
      if (from === 0 || to === 0) this.castling &= ~CASTLE_WQ
      if (from === 119 || to === 119) this.castling &= ~CASTLE_BK
      if (from === 112 || to === 112) this.castling &= ~CASTLE_BQ
    }

    this.ep = (m & FLAG_DOUBLE) ? (us === WHITE ? from + 16 : from - 16) : -1

    // The fifty-move counter resets on a pawn move or a capture. An en passant capture takes
    // nothing off the destination square, so it has to be tested by its flag.
    const wasCapture = this.undoStack[this.undoStack.length - 1].captured !== EMPTY || (m & FLAG_EP)
    this.halfmove = (typeOf(pc) === PAWN || wasCapture) ? 0 : this.halfmove + 1
    if (us === BLACK) this.fullmove++
    this.turn = us ^ 1

    // Legality: the mover may not end up in check.
    if (this.isAttacked(this.kingSq[us], us ^ 1)) {
      this.unmakeMove()
      return false
    }
    return true
  }

  unmakeMove () {
    const u = this.undoStack.pop()
    if (!u) return
    const board = this.board
    const m = u.move
    const from = moveFrom(m)
    const to = moveTo(m)
    const us = this.turn ^ 1

    board[from] = movePromo(m) ? ((us === WHITE ? W : B) | PAWN) : board[to]
    board[to] = u.captured

    if (m & FLAG_EP) {
      board[to] = EMPTY
      board[us === WHITE ? to - 16 : to + 16] = us === WHITE ? BP : WP
    }

    if (m & FLAG_CASTLE) {
      if (to === 6) { board[7] = board[5]; board[5] = EMPTY }
      else if (to === 2) { board[0] = board[3]; board[3] = EMPTY }
      else if (to === 118) { board[119] = board[117]; board[117] = EMPTY }
      else if (to === 114) { board[112] = board[115]; board[115] = EMPTY }
    }

    this.kingSq[us] = u.kingSq
    this.castling = u.castling
    this.ep = u.ep
    this.halfmove = u.halfmove
    if (us === BLACK) this.fullmove--
    this.turn = us
  }

  /** Legal moves, as internal move ints. Allocates, so it is not used inside the search. */
  legalMoves () {
    const out = []
    for (const m of this.generateMoves(false)) {
      if (this.makeMove(m)) { out.push(m); this.unmakeMove() }
    }
    return out
  }
}

/** Node counter for correctness testing against chess.js. */
export function perft (pos, depth) {
  if (depth === 0) return 1
  let nodes = 0
  for (const m of pos.generateMoves(false)) {
    if (!pos.makeMove(m)) continue
    nodes += perft(pos, depth - 1)
    pos.unmakeMove()
  }
  return nodes
}
