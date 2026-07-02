// Server-only ReOrbit Match game engine. Never import this from pages/ or components/.

const DEFAULT_EMOJIS = ['⭐', '🌙', '🚀', '🌍', '⚡', '💫', '🪐', '🎯']
const MIN_MATCH = 3
const MIN_MOVE_INTERVAL_MS = 100 // no human moves faster than 100ms

// splitmix32 seeded PRNG — fast and high-quality for 32-bit seeds.
// We use a 128-bit session token and fold it down to a 64-bit pair of seeds.
function makePRNG(seedHex) {
  // Take first 16 hex chars as two 32-bit integers
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

// Generate a flat board array of emoji indices
function generateBoard(gridSize, emojiCount, seedHex) {
  const rng = makePRNG(seedHex)
  const board = []
  const size = gridSize * gridSize

  // Fill avoiding immediate 3-in-a-row matches at generation time
  for (let i = 0; i < size; i++) {
    const row = Math.floor(i / gridSize)
    const col = i % gridSize
    let emojiIdx
    let attempts = 0
    do {
      emojiIdx = Math.floor(rng() * emojiCount)
      attempts++
    } while (attempts < 20 && wouldCreateMatchAt(board, row, col, gridSize, emojiIdx))
    board.push(emojiIdx)
  }
  return board
}

function wouldCreateMatchAt(board, row, col, gridSize, emojiIdx) {
  const idx = row * gridSize + col
  // Check left-left
  if (col >= 2) {
    const l1 = idx - 1
    const l2 = idx - 2
    if (board[l1] === emojiIdx && board[l2] === emojiIdx) return true
  }
  // Check up-up
  if (row >= 2) {
    const u1 = (row - 1) * gridSize + col
    const u2 = (row - 2) * gridSize + col
    if (board[u1] === emojiIdx && board[u2] === emojiIdx) return true
  }
  return false
}

// Returns array of match groups, each group is an array of {row, col} cells
function findMatches(board, gridSize) {
  const matched = new Set()
  const groups = []

  // Horizontal
  for (let row = 0; row < gridSize; row++) {
    let col = 0
    while (col < gridSize) {
      const baseIdx = row * gridSize + col
      const baseVal = board[baseIdx]
      if (baseVal === -1) { col++; continue }
      let len = 1
      while (col + len < gridSize && board[row * gridSize + col + len] === baseVal) len++
      if (len >= MIN_MATCH) {
        const group = []
        for (let k = 0; k < len; k++) {
          const key = `${row},${col + k}`
          if (!matched.has(key)) { matched.add(key); group.push({ row, col: col + k }) }
        }
        if (group.length > 0) groups.push(group)
      }
      col += len
    }
  }

  // Vertical
  for (let col = 0; col < gridSize; col++) {
    let row = 0
    while (row < gridSize) {
      const baseIdx = row * gridSize + col
      const baseVal = board[baseIdx]
      if (baseVal === -1) { row++; continue }
      let len = 1
      while (row + len < gridSize && board[(row + len) * gridSize + col] === baseVal) len++
      if (len >= MIN_MATCH) {
        const group = []
        for (let k = 0; k < len; k++) {
          const key = `${row + k},${col}`
          if (!matched.has(key)) { matched.add(key); group.push({ row: row + k, col }) }
        }
        if (group.length > 0) groups.push(group)
      }
      row += len
    }
  }

  return groups
}

function removeMatches(board, groups, gridSize) {
  const copy = [...board]
  for (const group of groups) {
    for (const { row, col } of group) {
      copy[row * gridSize + col] = -1
    }
  }
  return copy
}

// Apply gravity: tiles fall down into empty slots (-1)
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

// Fill empty cells (top rows) using PRNG
function fillEmpty(board, gridSize, emojiCount, rng) {
  const copy = [...board]
  for (let i = 0; i < copy.length; i++) {
    if (copy[i] === -1) copy[i] = Math.floor(rng() * emojiCount)
  }
  return copy
}

function applySwap(board, fromRow, fromCol, toRow, toCol, gridSize) {
  const copy = [...board]
  const fromIdx = fromRow * gridSize + fromCol
  const toIdx = toRow * gridSize + toCol
  ;[copy[fromIdx], copy[toIdx]] = [copy[toIdx], copy[fromIdx]]
  return copy
}

function isAdjacent(fromRow, fromCol, toRow, toCol) {
  const dr = Math.abs(toRow - fromRow)
  const dc = Math.abs(toCol - fromCol)
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

// Returns true if any swap on the board produces a match
function hasPossibleMoves(board, gridSize) {
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Try swap right
      if (col + 1 < gridSize) {
        const b = applySwap(board, row, col, row, col + 1, gridSize)
        if (findMatches(b, gridSize).length > 0) return true
      }
      // Try swap down
      if (row + 1 < gridSize) {
        const b = applySwap(board, row, col, row + 1, col, gridSize)
        if (findMatches(b, gridSize).length > 0) return true
      }
    }
  }
  return false
}

function getMultiplier(combo) {
  if (combo < 2)  return 1
  if (combo < 4)  return 2
  if (combo < 6)  return 4
  if (combo < 8)  return 8
  return 16
}

function scoreGroup(group) {
  const n = group.length
  const base = n * 10
  if (n >= 5) return Math.round(base * 2)
  if (n === 4) return Math.round(base * 1.5)
  return base
}

// Replay entire game from initial board and move log. Returns computed score.
// Throws if a move is invalid.
export function replayGame(initialBoard, moveLog, gridSize, emojiCount, seedHex) {
  const rng = makePRNG(seedHex)
  // Advance rng to the same state used after board generation
  // (We need to consume the rng calls made during generateBoard to keep state consistent)
  // Actually we just pass the same seed for fill operations
  const fillRng = makePRNG(seedHex.slice(16, 32) || seedHex)

  let board = [...initialBoard]
  let score = 0
  let combo = 0

  for (const move of moveLog) {
    const { fromRow, fromCol, toRow, toCol } = move

    // Validate move is within bounds and adjacent
    if (
      fromRow < 0 || fromRow >= gridSize || fromCol < 0 || fromCol >= gridSize ||
      toRow < 0 || toRow >= gridSize || toCol < 0 || toCol >= gridSize
    ) throw new Error('Move out of bounds')

    if (!isAdjacent(fromRow, fromCol, toRow, toCol)) throw new Error('Non-adjacent swap')

    const swapped = applySwap(board, fromRow, fromCol, toRow, toCol, gridSize)
    const initialMatches = findMatches(swapped, gridSize)

    if (initialMatches.length === 0) {
      // Invalid swap (no match) — still recorded by client as a rejected move
      // Do not update board, do not increment combo
      combo = 0
      continue
    }

    // Valid swap — apply cascade
    combo++
    const multiplier = getMultiplier(combo)
    let cascadeBoard = swapped
    let cascadeLevel = 0

    while (true) {
      const matches = findMatches(cascadeBoard, gridSize)
      if (matches.length === 0) break

      const cascadeMultiplier = 1 + cascadeLevel * 0.5
      for (const group of matches) {
        score += Math.round(scoreGroup(group) * cascadeMultiplier * multiplier)
      }

      cascadeBoard = removeMatches(cascadeBoard, matches, gridSize)
      cascadeBoard = applyGravity(cascadeBoard, gridSize)
      cascadeBoard = fillEmpty(cascadeBoard, gridSize, emojiCount, fillRng)
      cascadeLevel++
    }

    board = cascadeBoard
  }

  return Math.floor(score)
}

export { generateBoard, findMatches, hasPossibleMoves, applySwap, applyGravity, fillEmpty, getMultiplier, DEFAULT_EMOJIS, MIN_MOVE_INTERVAL_MS }
