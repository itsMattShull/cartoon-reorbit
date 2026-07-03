// Server-only ReOrbit Match game engine. Never import this from pages/ or components/.
//
// Game model: drag-to-connect ("Dots"-style).
//  - The player drags across the grid to select a chain of EXACTLY 3 tiles.
//  - Adjacency is 8-directional (orthogonal + diagonal).
//  - A move clears the 3 selected tiles ONLY if they all share the same color/emoji.
//  - There are NO auto-cascades: only the manually selected tiles are removed. Tiles
//    above fall down (gravity) and empty cells are refilled from the top.
//  - Scoring: a flat amount per 3-match, multiplied by a combo multiplier that grows
//    when matches are made in quick succession and resets after a pause.
//
// Anti-cheat: the board is generated server-side from a secret session token. Refills
// use a SEPARATE, non-secret fillSeed that is shared with the client so both sides stay
// bit-identical. The authoritative score is recomputed here by replaying the move log.

const DEFAULT_EMOJIS = ['⭐', '🌙', '🚀', '🌍', '⚡', '💫', '🪐', '🎯']
const MIN_MATCH = 3           // a valid match is exactly this many tiles
const MAX_MATCH = 3           // chain is capped at this many tiles
const MIN_MOVE_INTERVAL_MS = 100 // no human makes two matches faster than this

// Scoring — kept in sync with the client (pages/newsite/reorbitmatch.vue).
const BASE_MATCH_POINTS = 30            // points for a single 3-match at 1x
const DEFAULT_COMBO_WINDOW_MS = 3500    // fallback combo window; admin-configurable per game

// splitmix32 seeded PRNG — fast and high-quality for 32-bit seeds.
// We fold a 128-bit hex token down to a 64-bit pair of seeds.
function makePRNG(seedHex) {
  const hi = parseInt(seedHex.slice(0, 8), 16) >>> 0
  const lo = parseInt(seedHex.slice(8, 16), 16) >>> 0
  let s0 = hi >>> 0
  let s1 = lo >>> 0

  return function () {
    s0 = (s0 + 0x9e3779b9) >>> 0
    let z = s0
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    z = (z ^ (z >>> 16)) >>> 0

    s1 = (s1 + 0x6c62272e) >>> 0
    let w = s1
    w = Math.imul(w ^ (w >>> 16), 0x85ebca6b) >>> 0
    w = Math.imul(w ^ (w >>> 13), 0xc2b2ae35) >>> 0
    w = (w ^ (w >>> 16)) >>> 0

    return ((z ^ w) >>> 0) / 4294967296
  }
}

// 8-directional adjacency: two cells are neighbors iff Chebyshev distance is exactly 1.
function isEightAdjacent(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2)
  const dc = Math.abs(c1 - c2)
  return dr <= 1 && dc <= 1 && (dr + dc) > 0
}

// Apply gravity: tiles fall down into empty slots (-1). Column order preserved.
function applyGravity(board, gridSize) {
  const copy = [...board]
  for (let col = 0; col < gridSize; col++) {
    let empty = gridSize - 1
    for (let row = gridSize - 1; row >= 0; row--) {
      if (copy[row * gridSize + col] !== -1) {
        copy[empty * gridSize + col] = copy[row * gridSize + col]
        if (empty !== row) copy[row * gridSize + col] = -1
        empty--
      }
    }
  }
  return copy
}

// Fill empty cells (-1) in row-major order using the shared PRNG. The iteration order
// here MUST match the client exactly so both boards stay identical after every refill.
function fillEmpty(board, gridSize, emojiCount, rng) {
  const copy = [...board]
  for (let i = 0; i < copy.length; i++) {
    if (copy[i] === -1) copy[i] = Math.floor(rng() * emojiCount)
  }
  return copy
}

// Does any valid move exist? Equivalent (for k=3) to: some color has a same-color
// 8-connected component of size >= 3. Proof: a size>=3 component's spanning tree has a
// vertex of degree >= 2, giving a simple 3-vertex path = a draggable 3-chain. O(n).
function hasPossibleMoves(board, gridSize) {
  const n = gridSize * gridSize
  const visited = new Uint8Array(n)
  const stack = []
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue
    const color = board[start]
    if (color === -1) { visited[start] = 1; continue }
    // Flood-fill the same-color 8-connected component.
    stack.length = 0
    stack.push(start)
    visited[start] = 1
    let size = 0
    while (stack.length) {
      const idx = stack.pop()
      size++
      if (size >= MIN_MATCH) return true
      const r = Math.floor(idx / gridSize)
      const c = idx % gridSize
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue
          const nidx = nr * gridSize + nc
          if (!visited[nidx] && board[nidx] === color) {
            visited[nidx] = 1
            stack.push(nidx)
          }
        }
      }
    }
  }
  return false
}

// Generate a flat board of emoji indices. Deterministic from seedHex. Guarantees at
// least one valid 3-chain exists (the board is stored server-side, so the exact bytes
// are authoritative; the guarantee just prevents shipping an instantly-dead board).
function generateBoard(gridSize, emojiCount, seedHex) {
  const rng = makePRNG(seedHex)
  const size = gridSize * gridSize
  const board = new Array(size)
  for (let i = 0; i < size; i++) board[i] = Math.floor(rng() * emojiCount)

  if (!hasPossibleMoves(board, gridSize)) {
    // Deterministic fallback: force a same-color L in the top-left corner. The three
    // cells (0,0),(0,1),(1,0) are mutually 8-adjacent → a guaranteed size-3 component.
    const color = board[0]
    board[1] = color                 // (0,1)
    board[gridSize] = color          // (1,0)
  }
  return board
}

// Validate a single chain move against the current board. Returns the matched color.
// Throws on any malformed / illegal move. Never trusts client-supplied colors.
function validateChain(board, cells, gridSize) {
  if (!Array.isArray(cells) || cells.length !== MIN_MATCH) {
    throw new Error('Chain must have exactly 3 cells')
  }

  const keys = new Set()
  for (const cell of cells) {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      throw new Error('Cell coordinates must be integers')
    }
    if (cell.row < 0 || cell.row >= gridSize || cell.col < 0 || cell.col >= gridSize) {
      throw new Error('Cell out of bounds')
    }
    keys.add(`${cell.row},${cell.col}`)
  }
  if (keys.size !== MIN_MATCH) throw new Error('Chain cells must be distinct')

  // Consecutive cells must be 8-adjacent (a connected drag path).
  for (let i = 1; i < cells.length; i++) {
    if (!isEightAdjacent(cells[i - 1].row, cells[i - 1].col, cells[i].row, cells[i].col)) {
      throw new Error('Chain cells must be 8-adjacent in sequence')
    }
  }

  // All cells must share the same non-empty color, read from the server's board.
  const color = board[cells[0].row * gridSize + cells[0].col]
  if (color === -1 || color == null) throw new Error('Chain includes an empty cell')
  for (const { row, col } of cells) {
    if (board[row * gridSize + col] !== color) throw new Error('Chain colors do not match')
  }
  return color
}

// The combo streak IS the score multiplier: the 1st match is 1x, a 2nd chained match
// is 2x, a 3rd is 3x, and so on with no cap.
function getComboMultiplier(combo) {
  return combo < 1 ? 1 : combo
}

// Replay the entire game from the initial board + move log. Returns the authoritative
// score. Throws if any move is invalid. `fillSeedHex` drives deterministic refills and
// must be the same value handed to the client at /start. `comboWindowMs` is the combo
// cooldown (admin-configurable) and must match the value handed to the client.
function replayGame(initialBoard, moveLog, gridSize, emojiCount, fillSeedHex, comboWindowMs = DEFAULT_COMBO_WINDOW_MS) {
  const fillRng = makePRNG(fillSeedHex)
  let board = [...initialBoard]
  let score = 0
  let combo = 0
  let lastTs = null

  for (const move of moveLog) {
    const cells = move?.cells
    validateChain(board, cells, gridSize) // throws on any illegal move

    // Combo is derived purely from move timestamps so it is reproducible here.
    const ts = move.ts
    if (lastTs !== null && (ts - lastTs) <= comboWindowMs) combo++
    else combo = 1
    lastTs = ts

    score += BASE_MATCH_POINTS * getComboMultiplier(combo)

    // Remove exactly the selected tiles, then settle once. No cascade.
    for (const { row, col } of cells) board[row * gridSize + col] = -1
    board = applyGravity(board, gridSize)
    board = fillEmpty(board, gridSize, emojiCount, fillRng)
  }

  return Math.floor(score)
}

export {
  generateBoard,
  validateChain,
  hasPossibleMoves,
  applyGravity,
  fillEmpty,
  getComboMultiplier,
  isEightAdjacent,
  replayGame,
  DEFAULT_EMOJIS,
  MIN_MOVE_INTERVAL_MS,
  MIN_MATCH,
  MAX_MATCH,
  BASE_MATCH_POINTS,
  DEFAULT_COMBO_WINDOW_MS
}
