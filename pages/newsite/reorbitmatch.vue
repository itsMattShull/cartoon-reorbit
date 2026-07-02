<template>
  <div>
    <NuxtLayout name="newsite-template" :show-adbar="true" :show-nav="true">
      <div class="reorbit-wrapper">
        <!-- Landscape warning -->
        <div class="landscape-warning" aria-live="polite">
          <span>Rotate your device to portrait for the best experience</span>
        </div>

        <!-- Loading state -->
        <div v-if="uiState === 'loading'" class="center-content">
          <div class="spinner" aria-label="Loading game…"></div>
        </div>

        <!-- No plays left -->
        <div v-else-if="uiState === 'noplays'" class="center-content">
          <div class="start-card">
            <h1 class="game-title">ReOrbit Match</h1>
            <p class="no-plays-text">No plays left today.</p>
            <p class="reset-text">Resets {{ resetLabel }}</p>
          </div>
        </div>

        <!-- Start screen -->
        <div v-else-if="uiState === 'start'" class="center-content">
          <div class="start-card">
            <h1 class="game-title">ReOrbit Match</h1>
            <p class="start-sub">Match 3 or more orbiting icons to score!</p>
            <div class="plays-info">
              <span class="plays-badge">{{ playsLeft }} play{{ playsLeft !== 1 ? 's' : '' }} left</span>
              <span class="reset-text">· Resets {{ resetLabel }}</span>
            </div>
            <button class="btn-start" @click="startGame" :disabled="starting">
              {{ starting ? 'Launching…' : 'Play' }}
            </button>
          </div>
        </div>

        <!-- Active game -->
        <div v-else-if="uiState === 'playing'" class="game-area" role="main" aria-label="ReOrbit Match game board">
          <!-- HUD -->
          <div class="hud" role="status" aria-live="polite" aria-atomic="true">
            <div class="hud-row hud-row--primary">
              <div class="hud-item">
                <span class="hud-label">Score</span>
                <span class="hud-value">{{ score.toLocaleString() }}</span>
              </div>
              <div class="hud-item" :class="{ 'hud-item--active': combo > 0 }">
                <span class="hud-label">Combo</span>
                <span class="hud-value">{{ combo }}x</span>
              </div>
              <div v-if="timeSeconds" class="hud-item" :class="{ 'hud-item--warning': timeLeft <= 10 }">
                <span class="hud-label">Time</span>
                <span class="hud-value">{{ timeLeft }}s</span>
              </div>
            </div>
            <div class="hud-row hud-row--secondary">
              <div class="hud-item" :class="{ 'hud-item--glow': multiplier > 1 }">
                <span class="hud-label">Multiplier</span>
                <span class="hud-value hud-multiplier">{{ multiplier }}x</span>
              </div>
              <div class="hud-item">
                <span class="hud-label">Plays Left</span>
                <span class="hud-value">{{ playsLeft }}</span>
              </div>
            </div>
          </div>

          <!-- Canvas board -->
          <div class="canvas-container" ref="canvasContainer">
            <canvas
              ref="canvas"
              class="game-canvas"
              :style="{ touchAction: 'none' }"
              @pointerdown="onPointerDown"
              @pointerup="onPointerUp"
              @pointermove="onPointerMove"
              @pointerleave="onPointerLeave"
              aria-label="Match-3 game grid"
              role="img"
            ></canvas>
          </div>
        </div>
      </div>
    </NuxtLayout>

    <!-- Game Over Modal (teleported outside transform context) -->
    <Teleport to="body">
      <div v-if="uiState === 'gameover'" class="modal-backdrop" @click.self="uiState = 'start'">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Game Over">
          <h2 class="modal-title">Game Over!</h2>
          <div class="modal-score-row">
            <span class="modal-score-label">Your Score</span>
            <span class="modal-score-value">{{ finalScore.toLocaleString() }}</span>
          </div>
          <div class="modal-divider"></div>
          <div class="modal-leaderboard">
            <div class="modal-lb-row">
              <span class="modal-lb-label">This Week's Best</span>
              <span class="modal-lb-value">{{ weekHigh.toLocaleString() }}</span>
            </div>
            <div class="modal-lb-row">
              <span class="modal-lb-label">Your All-Time Best</span>
              <span class="modal-lb-value">{{ allTimeHigh.toLocaleString() }}</span>
            </div>
          </div>
          <div class="modal-points-notice" :class="{ 'modal-points-notice--zero': pointsAwarded === 0 }">
            <template v-if="pointsAwarded > 0">+{{ pointsAwarded }} game points earned!</template>
            <template v-else>No game points earned (daily limit reached)</template>
          </div>
          <div class="modal-actions">
            <button v-if="playsLeft > 0" class="btn-start" @click="startGame">
              Play Again ({{ playsLeft }} left)
            </button>
            <button v-else class="btn-secondary" @click="uiState = 'noplays'">
              No Plays Left
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
definePageMeta({ ssr: false })

// ─── Game constants ────────────────────────────────────────────────────────────
const TILE_GAP = 3
const ANIMATION_WIGGLE_MS = 400
const ANIMATION_REMOVE_MS = 320
const ANIMATION_FALL_MS   = 280
const ANIMATION_APPEAR_MS = 180
const MIN_MATCH = 3

// Tile states
const TS = { NORMAL: 0, SELECTED: 1, WIGGLE: 2, REMOVING: 3, FALLING: 4, APPEARING: 5 }

// ─── State ────────────────────────────────────────────────────────────────────
const uiState   = ref('loading')  // loading | start | playing | gameover | noplays
const starting  = ref(false)
const score     = ref(0)
const combo     = ref(0)
const multiplier = ref(1)
const timeLeft  = ref(null)
const playsLeft = ref(0)
const finalScore  = ref(0)
const weekHigh    = ref(0)
const allTimeHigh = ref(0)
const pointsAwarded = ref(0)
const resetLabel  = ref('')

const canvas         = ref(null)
const canvasContainer = ref(null)

// ─── Non-reactive game internals ──────────────────────────────────────────────
let board        = []   // flat array of emoji indices
let emojis       = []   // emoji strings
let gridSize     = 8
let timeSeconds  = null
let moveLog      = []   // [{fromRow,fromCol,toRow,toCol,ts}]
let tiles        = []   // per-tile animation state
let selectedIdx  = -1
let animating    = false
let gameStartTs  = 0
let rafId        = null
let timerStart   = null
let ctx          = null
let tileSize     = 0
let gridOffset   = { x: 0, y: 0 }
let pointerStartX = 0
let pointerStartY = 0
let pointerDown  = false
let dragFromIdx  = -1  // tile pressed on in current gesture (immediate visual feedback)
let dragHoverIdx = -1  // adjacent tile being hovered over as a valid swap target
let particles    = []  // burst particles [{x,y,vx,vy,color,size,startMs}]
let configData   = null

// ─── Utility ──────────────────────────────────────────────────────────────────
function getMultiplier(c) {
  if (c < 2) return 1
  if (c < 4) return 2
  if (c < 6) return 4
  if (c < 8) return 8
  return 16
}

function idxOf(row, col) { return row * gridSize + col }
function rowOf(idx) { return Math.floor(idx / gridSize) }
function colOf(idx) { return idx % gridSize }

function isAdjacent(aIdx, bIdx) {
  const ar = rowOf(aIdx), ac = colOf(aIdx), br = rowOf(bIdx), bc = colOf(bIdx)
  return (Math.abs(ar - br) === 1 && ac === bc) || (ar === br && Math.abs(ac - bc) === 1)
}

function fireExplosion(tileIdx) {
  const row = rowOf(tileIdx), col = colOf(tileIdx)
  const cx = tileCenterX(col), cy = tileCenterY(row)
  const now = performance.now()
  const colors = ['#FFD700', '#fff', '#FFD700', '#66bbff', '#fff', '#FFD700']
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
    const speed = tileSize * (1.8 + Math.random() * 2.2)
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: colors[i % colors.length],
      size: tileSize * (0.07 + Math.random() * 0.07),
      startMs: now
    })
  }
}

// ─── Match finding ────────────────────────────────────────────────────────────
function findMatches(b) {
  const matched = new Set()
  // Horizontal
  for (let r = 0; r < gridSize; r++) {
    let c = 0
    while (c < gridSize) {
      const v = b[idxOf(r, c)]
      if (v === -1) { c++; continue }
      let len = 1
      while (c + len < gridSize && b[idxOf(r, c + len)] === v) len++
      if (len >= MIN_MATCH) for (let k = 0; k < len; k++) matched.add(idxOf(r, c + k))
      c += len
    }
  }
  // Vertical
  for (let c = 0; c < gridSize; c++) {
    let r = 0
    while (r < gridSize) {
      const v = b[idxOf(r, c)]
      if (v === -1) { r++; continue }
      let len = 1
      while (r + len < gridSize && b[idxOf(r + len, c)] === v) len++
      if (len >= MIN_MATCH) for (let k = 0; k < len; k++) matched.add(idxOf(r + k, c))
      r += len
    }
  }
  return matched
}

function hasPossibleMoves(b) {
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const idx = idxOf(r, c)
      if (c + 1 < gridSize) {
        const copy = [...b]; [copy[idx], copy[idxOf(r, c + 1)]] = [copy[idxOf(r, c + 1)], copy[idx]]
        if (findMatches(copy).size > 0) return true
      }
      if (r + 1 < gridSize) {
        const copy = [...b]; [copy[idx], copy[idxOf(r + 1, c)]] = [copy[idxOf(r + 1, c)], copy[idx]]
        if (findMatches(copy).size > 0) return true
      }
    }
  }
  return false
}

function scoreGroup(cells, b) {
  const n = cells.size
  let base = n * 10
  if (n >= 5) base = Math.round(base * 2)
  else if (n === 4) base = Math.round(base * 1.5)
  return base
}

// ─── Tile animation state helpers ─────────────────────────────────────────────
function initTiles(b) {
  tiles = b.map((emojiIdx, i) => ({
    emojiIdx,
    state: TS.NORMAL,
    visualY: 0,       // current Y offset from logical row (for falling)
    startVisualY: 0,  // Y offset at animation start (source for easing)
    alpha: 1,
    scale: 1,
    wiggleAngle: 0,
    animStartMs: 0
  }))
}

// ─── Canvas sizing ────────────────────────────────────────────────────────────
function resizeCanvas() {
  if (!canvas.value || !canvasContainer.value) return
  const { width, height } = canvasContainer.value.getBoundingClientRect()
  canvas.value.width  = width  * devicePixelRatio
  canvas.value.height = height * devicePixelRatio
  canvas.value.style.width  = `${width}px`
  canvas.value.style.height = `${height}px`
  ctx = canvas.value.getContext('2d')
  ctx.scale(devicePixelRatio, devicePixelRatio)

  const availW = width  - TILE_GAP * 2
  const availH = height - TILE_GAP * 2
  tileSize = Math.floor(Math.min(availW, availH) / gridSize) - TILE_GAP
  const boardPx = tileSize * gridSize + TILE_GAP * (gridSize + 1)
  gridOffset.x = Math.floor((width  - boardPx) / 2)
  gridOffset.y = Math.floor((height - boardPx) / 2)
}

function tileCenterX(col) { return gridOffset.x + TILE_GAP + col * (tileSize + TILE_GAP) + tileSize / 2 }
function tileCenterY(row) { return gridOffset.y + TILE_GAP + row * (tileSize + TILE_GAP) + tileSize / 2 }
function tileLeft(col)    { return gridOffset.x + TILE_GAP + col * (tileSize + TILE_GAP) }
function tileTop(row)     { return gridOffset.y + TILE_GAP + row * (tileSize + TILE_GAP) }

function hitTest(px, py) {
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const tx = tileLeft(c), ty = tileTop(r)
      if (px >= tx && px < tx + tileSize && py >= ty && py < ty + tileSize) return idxOf(r, c)
    }
  }
  return -1
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function drawRoundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

const TILE_COLORS = [
  '#1a3a8f', '#1a6e3c', '#7c2d8a', '#8a4a1a',
  '#8a1a32', '#1a6a8a', '#5a3a00', '#2a4a00',
  '#4a0050', '#00404a', '#3a2a00', '#003a70'
]

function renderFrame(nowMs) {
  if (!ctx) return
  const w = canvas.value.width / devicePixelRatio
  const h = canvas.value.height / devicePixelRatio

  // Background
  ctx.fillStyle = '#001230'
  ctx.fillRect(0, 0, w, h)

  // Board background glow
  const boardPx = tileSize * gridSize + TILE_GAP * (gridSize + 1)
  const grd = ctx.createRadialGradient(
    gridOffset.x + boardPx / 2, gridOffset.y + boardPx / 2, 0,
    gridOffset.x + boardPx / 2, gridOffset.y + boardPx / 2, boardPx * 0.7
  )
  grd.addColorStop(0, 'rgba(30, 80, 180, 0.15)')
  grd.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grd
  ctx.fillRect(gridOffset.x, gridOffset.y, boardPx, boardPx)

  // Collect match connections to draw last
  const matchedSet = findMatches(board)
  const connections = []

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    const row = rowOf(i), col = colOf(i)
    const elapsed = nowMs - tile.animStartMs

    let x = tileLeft(col)
    let y = tileTop(row) + tile.visualY
    let alpha = tile.alpha
    let scale = tile.scale

    if (tile.state === TS.WIGGLE) {
      const t = Math.min(elapsed / ANIMATION_WIGGLE_MS, 1)
      const wobble = Math.sin(t * Math.PI * 6) * (1 - t)
      tile.wiggleAngle = wobble * 0.2
      scale = 1 + Math.abs(wobble) * 0.12
    } else if (tile.state === TS.REMOVING) {
      const t = Math.min(elapsed / ANIMATION_REMOVE_MS, 1)
      if (t < 0.28) {
        // Pop: quick scale-up flash
        const pop = t / 0.28
        scale = 1 + pop * 0.55
        alpha = 1
      } else {
        // Burst: shrink to nothing while fading
        const burst = (t - 0.28) / 0.72
        scale = 1.55 * (1 - burst)
        alpha = 1 - Math.pow(burst, 0.6)
        tile.wiggleAngle = (tile.wiggleAngle || 0) + burst * 0.4
      }
    } else if (tile.state === TS.FALLING) {
      const t = Math.min(elapsed / ANIMATION_FALL_MS, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      tile.visualY = tile.startVisualY * (1 - ease)
      y = tileTop(row) + tile.visualY
    } else if (tile.state === TS.APPEARING) {
      const fadeT = Math.min(elapsed / ANIMATION_APPEAR_MS, 1)
      const fallT = Math.min(elapsed / ANIMATION_FALL_MS, 1)
      const ease  = 1 - Math.pow(1 - fallT, 3)
      alpha = fadeT
      scale = 0.6 + fadeT * 0.4
      tile.visualY = tile.startVisualY * (1 - ease)
      y = tileTop(row) + tile.visualY
    }

    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    ctx.translate(x + tileSize / 2, y + tileSize / 2)
    ctx.rotate(tile.wiggleAngle || 0)
    ctx.scale(scale, scale)

    // Tile background
    const baseColor = TILE_COLORS[tile.emojiIdx % TILE_COLORS.length]
    const isSelected = (i === selectedIdx || i === dragFromIdx || i === dragHoverIdx)
    const isMatched  = matchedSet.has(i)

    if (isSelected) {
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur  = 12
      ctx.fillStyle = '#FFD700'
    } else if (isMatched && tile.state !== TS.WIGGLE && tile.state !== TS.REMOVING) {
      ctx.shadowColor = '#fff'
      ctx.shadowBlur  = 8
      ctx.fillStyle = '#3a80ff'
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur  = 4
      ctx.fillStyle = baseColor
    }
    drawRoundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, Math.round(tileSize * 0.12))
    ctx.fill()
    ctx.shadowBlur = 0

    // Shimmer edge for selected
    if (isSelected) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Emoji
    const fontSize = Math.round(tileSize * 0.52)
    ctx.font = `${fontSize}px serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'white'
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur  = 3
    ctx.fillText(emojis[tile.emojiIdx] || '?', 0, 1)
    ctx.shadowBlur = 0
    ctx.restore()

    // Collect connections for matched tiles that are wiggling
    if ((tile.state === TS.WIGGLE || matchedSet.has(i)) && tile.state !== TS.REMOVING) {
      if (col + 1 < gridSize) {
        const nidx = idxOf(row, col + 1)
        if (matchedSet.has(nidx)) {
          connections.push([col, row, col + 1, row])
        }
      }
      if (row + 1 < gridSize) {
        const nidx = idxOf(row + 1, col)
        if (matchedSet.has(nidx)) {
          connections.push([col, row, col, row + 1])
        }
      }
    }
  }

  // Draw connection lines
  if (connections.length > 0) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 220, 50, 0.85)'
    ctx.lineWidth   = Math.max(2, tileSize * 0.06)
    ctx.lineCap = 'round'
    ctx.shadowColor = '#FFD700'
    ctx.shadowBlur  = 8
    for (const [c1, r1, c2, r2] of connections) {
      ctx.beginPath()
      ctx.moveTo(tileCenterX(c1), tileCenterY(r1))
      ctx.lineTo(tileCenterX(c2), tileCenterY(r2))
      ctx.stroke()
    }
    ctx.restore()
  }

  // Draw drag-swap preview line between pressed tile and valid hover target
  if (dragFromIdx !== -1 && dragHoverIdx !== -1) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)'
    ctx.lineWidth   = Math.max(2, tileSize * 0.06)
    ctx.lineCap = 'round'
    ctx.setLineDash([Math.round(tileSize * 0.15), Math.round(tileSize * 0.1)])
    ctx.shadowColor = '#FFD700'
    ctx.shadowBlur  = 6
    ctx.beginPath()
    ctx.moveTo(tileCenterX(colOf(dragFromIdx)), tileCenterY(rowOf(dragFromIdx)))
    ctx.lineTo(tileCenterX(colOf(dragHoverIdx)), tileCenterY(rowOf(dragHoverIdx)))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  // Burst particles from matched tile explosions
  const PARTICLE_LIFE_MS = 500
  particles = particles.filter(p => {
    const age  = nowMs - p.startMs
    if (age >= PARTICLE_LIFE_MS) return false
    const t    = age / PARTICLE_LIFE_MS
    const secs = age / 1000
    ctx.save()
    ctx.globalAlpha = Math.pow(1 - t, 1.4)
    ctx.fillStyle   = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur  = 4
    ctx.beginPath()
    ctx.arc(
      p.x + p.vx * secs,
      p.y + p.vy * secs + 400 * secs * secs,
      p.size * (1 - t * 0.6),
      0, Math.PI * 2
    )
    ctx.fill()
    ctx.restore()
    return true
  })
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function gameLoop(nowMs) {
  if (!canvas.value) return

  // Timer
  if (timeSeconds && timerStart !== null) {
    const elapsed = (nowMs - timerStart) / 1000
    timeLeft.value = Math.max(0, Math.ceil(timeSeconds - elapsed))
    if (timeLeft.value === 0) { endGame(); return }
  }

  renderFrame(nowMs)
  rafId = requestAnimationFrame(gameLoop)
}

// ─── Swap & cascade logic ─────────────────────────────────────────────────────
async function trySwap(fromIdx, toIdx) {
  if (animating) return
  const fr = rowOf(fromIdx), fc = colOf(fromIdx)
  const tr = rowOf(toIdx),   tc = colOf(toIdx)

  moveLog.push({ fromRow: fr, fromCol: fc, toRow: tr, toCol: tc, ts: performance.now() - gameStartTs })

  const swapped = [...board]
  ;[swapped[fromIdx], swapped[toIdx]] = [swapped[toIdx], swapped[fromIdx]]
  const matches = findMatches(swapped)

  if (matches.size === 0) {
    // Invalid swap — brief shake on both tiles
    combo.value = 0
    multiplier.value = getMultiplier(0)
    selectedIdx = -1
    return
  }

  animating = true
  selectedIdx = -1
  board = swapped
  combo.value++
  multiplier.value = getMultiplier(combo.value)

  await runCascade(1)

  if (!hasPossibleMoves(board)) endGame()
  animating = false
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function runCascade(cascadeLevel) {
  const matches = findMatches(board)
  if (matches.size === 0) return

  // Score this cascade
  const cascadeMultiplier = 1 + (cascadeLevel - 1) * 0.5
  let roundScore = 0
  matches.forEach(idx => { /* counted by group below */ })

  // Group connected matches for scoring
  const seen = new Set()
  for (const idx of matches) {
    if (seen.has(idx)) continue
    // BFS to find the group
    const group = new Set([idx])
    const queue = [idx]
    while (queue.length) {
      const cur = queue.shift()
      const r = rowOf(cur), c = colOf(cur)
      for (const [nr, nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
        const nidx = idxOf(nr, nc)
        if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && matches.has(nidx) && !group.has(nidx)) {
          group.add(nidx); queue.push(nidx)
        }
      }
    }
    group.forEach(i => seen.add(i))
    roundScore += scoreGroup(group, board)
  }

  score.value += Math.floor(roundScore * cascadeMultiplier * multiplier.value)

  // Wiggle animation
  const now = performance.now()
  matches.forEach(idx => {
    tiles[idx].state = TS.WIGGLE
    tiles[idx].animStartMs = now
  })
  await wait(ANIMATION_WIGGLE_MS)

  // Remove — pop animation + particle burst
  const removeNow = performance.now()
  matches.forEach(idx => {
    tiles[idx].state = TS.REMOVING
    tiles[idx].animStartMs = removeNow
    fireExplosion(idx)
  })
  await wait(ANIMATION_REMOVE_MS)

  // Apply gravity to board and animate fall
  const newBoard = [...board]
  matches.forEach(idx => { newBoard[idx] = -1 })

  // Calculate fall distances before gravity
  const fallDistances = new Array(newBoard.length).fill(0)
  for (let c = 0; c < gridSize; c++) {
    let emptyCount = 0
    for (let r = gridSize - 1; r >= 0; r--) {
      const idx = idxOf(r, c)
      if (newBoard[idx] === -1) {
        emptyCount++
      } else if (emptyCount > 0) {
        fallDistances[idx] = emptyCount
      }
    }
  }

  // Apply gravity to board
  for (let c = 0; c < gridSize; c++) {
    let empty = gridSize - 1
    for (let r = gridSize - 1; r >= 0; r--) {
      const idx = idxOf(r, c)
      if (newBoard[idx] !== -1) {
        newBoard[idxOf(empty, c)] = newBoard[idx]
        if (empty !== r) newBoard[idx] = -1
        empty--
      }
    }
  }

  // Fill empty cells with new random tiles
  const newNow = performance.now()
  for (let i = 0; i < newBoard.length; i++) {
    if (newBoard[i] === -1) {
      newBoard[i] = Math.floor(Math.random() * emojis.length)
    }
  }

  board = newBoard
  initTiles(board)

  // Animate falling tiles
  const fallNow = performance.now()
  for (let c = 0; c < gridSize; c++) {
    let emptyBelow = 0
    for (let r = gridSize - 1; r >= 0; r--) {
      const idx = idxOf(r, c)
      if (matches.has(idx)) {
        emptyBelow++
      } else if (emptyBelow > 0) {
        tiles[idx].state = TS.FALLING
        tiles[idx].animStartMs = fallNow
        tiles[idx].startVisualY = -(emptyBelow * (tileSize + TILE_GAP))
        tiles[idx].visualY      = tiles[idx].startVisualY
      }
    }
    // Mark top cells as appearing
    let topEmpty = 0
    for (let r = 0; r < gridSize; r++) {
      const idx = idxOf(r, c)
      if (tiles[idx].state === TS.NORMAL && r < emptyBelow) {
        tiles[idx].state = TS.APPEARING
        tiles[idx].animStartMs = fallNow
        tiles[idx].alpha = 0
        tiles[idx].startVisualY = -((emptyBelow - r) * (tileSize + TILE_GAP))
        tiles[idx].visualY      = tiles[idx].startVisualY
        topEmpty++
      }
    }
  }

  await wait(ANIMATION_FALL_MS + 50)

  // Reset animation states
  tiles.forEach(t => {
    if (t.state === TS.FALLING || t.state === TS.APPEARING) {
      t.state = TS.NORMAL
      t.visualY = 0
      t.alpha = 1
    }
  })

  // Check for chain reaction
  await runCascade(cascadeLevel + 1)
}

// ─── Input handling ────────────────────────────────────────────────────────────
function getCanvasPos(e) {
  if (!canvas.value) return { x: 0, y: 0 }
  const rect = canvas.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onPointerDown(e) {
  if (animating || uiState.value !== 'playing') return
  e.preventDefault()
  pointerDown = true
  const pos = getCanvasPos(e)
  pointerStartX = pos.x
  pointerStartY = pos.y
  canvas.value?.setPointerCapture?.(e.pointerId)

  // Immediately highlight the tile under the pointer
  dragFromIdx  = hitTest(pos.x, pos.y)
  dragHoverIdx = -1
}

function onPointerMove(e) {
  if (!pointerDown) return
  e.preventDefault()

  if (animating || uiState.value !== 'playing' || dragFromIdx === -1) return

  const pos    = getCanvasPos(e)
  const overIdx = hitTest(pos.x, pos.y)

  if (overIdx !== -1 && overIdx !== dragFromIdx && isAdjacent(dragFromIdx, overIdx)) {
    const swapped = [...board]
    ;[swapped[dragFromIdx], swapped[overIdx]] = [swapped[overIdx], swapped[dragFromIdx]]
    dragHoverIdx = findMatches(swapped).size > 0 ? overIdx : -1
  } else {
    dragHoverIdx = -1
  }
}

function onPointerUp(e) {
  if (!pointerDown) return
  e.preventDefault()
  pointerDown = false

  const fromIdx  = dragFromIdx
  const hoverIdx = dragHoverIdx
  dragFromIdx  = -1
  dragHoverIdx = -1

  if (animating || uiState.value !== 'playing') return

  const pos = getCanvasPos(e)
  const dx  = pos.x - pointerStartX
  const dy  = pos.y - pointerStartY
  const dist = Math.sqrt(dx * dx + dy * dy)
  const threshold = tileSize * 0.35

  if (fromIdx === -1) { selectedIdx = -1; return }

  // Drag released over a valid adjacent swap target → perform swap immediately
  if (hoverIdx !== -1) {
    selectedIdx = -1
    trySwap(fromIdx, hoverIdx)
    return
  }

  if (dist < threshold) {
    // Tap
    if (selectedIdx !== -1 && selectedIdx !== fromIdx && isAdjacent(selectedIdx, fromIdx)) {
      // Two-tap swap: previously selected tile + this tap
      const prevSel = selectedIdx
      selectedIdx = -1
      trySwap(prevSel, fromIdx)
    } else if (selectedIdx === fromIdx) {
      selectedIdx = -1  // tap same tile again: deselect
    } else {
      selectedIdx = fromIdx  // first tap: select
    }
  } else {
    // Swipe: use drag direction as fallback
    const swapIdx = getSwipeTarget(fromIdx, dx, dy)
    if (swapIdx !== -1) {
      selectedIdx = -1
      trySwap(fromIdx, swapIdx)
    } else {
      selectedIdx = -1
    }
  }
}

function onPointerLeave() {
  pointerDown  = false
  dragFromIdx  = -1
  dragHoverIdx = -1
}

function getSwipeTarget(fromIdx, dx, dy) {
  const r = rowOf(fromIdx), c = colOf(fromIdx)
  let tr, tc
  if (Math.abs(dx) > Math.abs(dy)) {
    tc = dx > 0 ? c + 1 : c - 1; tr = r
  } else {
    tr = dy > 0 ? r + 1 : r - 1; tc = c
  }
  if (tr < 0 || tr >= gridSize || tc < 0 || tc >= gridSize) return -1
  return idxOf(tr, tc)
}

// ─── Game lifecycle ────────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const data = await $fetch('/api/game/reorbitmatch/status', { credentials: 'include' })
    playsLeft.value   = data.playsLeft
    weekHigh.value    = data.weekHigh
    allTimeHigh.value = data.allTimeHigh
    configData        = data.config
    resetLabel.value  = formatReset(data.playsResetAt)
    uiState.value = data.playsLeft > 0 ? 'start' : 'noplays'
  } catch {
    uiState.value = 'start'
  }
}

function formatReset(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d)
}

async function startGame() {
  if (starting.value) return
  starting.value = true
  try {
    const data = await $fetch('/api/game/reorbitmatch/start', { method: 'POST', credentials: 'include' })
    board       = data.board
    emojis      = data.emojis
    gridSize    = data.gridSize
    timeSeconds = data.timeSeconds

    score.value      = 0
    combo.value      = 0
    multiplier.value = 1
    timeLeft.value   = timeSeconds
    moveLog          = []
    selectedIdx      = -1
    dragFromIdx      = -1
    dragHoverIdx     = -1
    particles        = []
    animating        = false

    await fetchStatus() // refresh plays left
    playsLeft.value  = Math.max(0, playsLeft.value - 1) // optimistic

    uiState.value = 'playing'
    await nextTick()

    resizeCanvas()
    initTiles(board)
    gameStartTs = performance.now()
    timerStart  = timeSeconds ? performance.now() : null
    rafId = requestAnimationFrame(gameLoop)
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Failed to start game'
    alert(msg)
  } finally {
    starting.value = false
  }
}

async function endGame() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }

  finalScore.value = score.value

  try {
    const result = await $fetch('/api/game/reorbitmatch/end', {
      method: 'POST',
      credentials: 'include',
      body: { moveLog }
    })
    pointsAwarded.value = result.pointsAwarded ?? 0
    // Refresh high scores
    const status = await $fetch('/api/game/reorbitmatch/status', { credentials: 'include' })
    weekHigh.value    = status.weekHigh
    allTimeHigh.value = status.allTimeHigh
    playsLeft.value   = status.playsLeft
  } catch {
    pointsAwarded.value = 0
  }

  uiState.value = 'gameover'
}

// ─── Resize observer ──────────────────────────────────────────────────────────
let resizeObserver = null
onMounted(async () => {
  await fetchStatus()
  resizeObserver = new ResizeObserver(() => {
    if (uiState.value === 'playing') resizeCanvas()
  })
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)

  // Haptic helper (Android only)
  window._vibrate = (ms) => { try { navigator.vibrate?.(ms) } catch {} }
})

onUnmounted(() => {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.reorbit-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  position: relative;
  background: #001230;
}

/* Landscape orientation warning */
.landscape-warning {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 10, 30, 0.97);
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  padding: 2rem;
  align-items: center;
  justify-content: center;
}

@media (orientation: landscape) and (max-height: 480px) {
  .landscape-warning { display: flex; }
}

.center-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 300px;
}

/* Start/No-plays card */
.start-card {
  background: rgba(10, 25, 55, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 2rem 2.5rem;
  text-align: center;
  max-width: 340px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.game-title {
  font-size: clamp(1.4rem, 5vw, 2rem);
  font-weight: 800;
  color: #fff;
  margin: 0 0 0.5rem;
  background: linear-gradient(135deg, #66bbff, #fff 50%, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.start-sub {
  color: rgba(255,255,255,0.65);
  font-size: 0.875rem;
  margin: 0 0 1.25rem;
}

.plays-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.plays-badge {
  background: rgba(102, 187, 255, 0.2);
  border: 1px solid rgba(102, 187, 255, 0.4);
  color: #66bbff;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
}

.reset-text {
  color: rgba(255,255,255,0.4);
  font-size: 0.75rem;
}

.no-plays-text {
  color: rgba(255,255,255,0.7);
  font-size: 1rem;
  margin: 0 0 0.5rem;
}

.btn-start {
  background: linear-gradient(135deg, #1a6e3c, #3399cc);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  border: none;
  border-radius: 12px;
  padding: 0.75rem 2.5rem;
  cursor: pointer;
  transition: filter 0.15s, transform 0.1s;
  min-width: 140px;
}
.btn-start:hover { filter: brightness(1.15); }
.btn-start:active { transform: scale(0.97); }
.btn-start:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.7);
  font-weight: 600;
  font-size: 0.9rem;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 10px;
  padding: 0.65rem 2rem;
  cursor: pointer;
}

/* Spinner */
.spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #66bbff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Game area */
.game-area {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 400px;
  gap: 0;
  background: #001230;
}

/* HUD */
.hud {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(0, 10, 30, 0.8);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.hud-row {
  display: flex;
  justify-content: center;
  gap: 6px;
  flex-wrap: nowrap;
}

.hud-row--primary  { gap: 8px; }
.hud-row--secondary { gap: 8px; }

.hud-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 4px 10px;
  min-width: 64px;
  transition: border-color 0.2s, background 0.2s;
}

.hud-item--active {
  border-color: rgba(102, 187, 255, 0.4);
  background: rgba(102, 187, 255, 0.1);
}

.hud-item--glow {
  border-color: rgba(255, 215, 0, 0.5);
  background: rgba(255, 215, 0, 0.1);
}

.hud-item--warning {
  border-color: rgba(255, 80, 80, 0.5);
  background: rgba(255, 80, 80, 0.1);
  animation: pulse-warn 1s ease-in-out infinite;
}

@keyframes pulse-warn {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

.hud-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
  line-height: 1;
}

.hud-value {
  font-size: 0.9rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.hud-multiplier {
  color: #ffd700;
}

/* Canvas */
.canvas-container {
  flex: 1;
  width: 100%;
  position: relative;
  overflow: hidden;
  min-height: 200px;
}

.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  backdrop-filter: blur(4px);
}

.modal-card {
  background: rgba(10, 25, 55, 0.97);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 20px;
  padding: 2rem;
  width: 100%;
  max-width: 360px;
  max-height: min(90dvh, 520px);
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7);
  text-align: center;
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #fff;
  margin: 0 0 1.25rem;
  background: linear-gradient(135deg, #ffd700, #fff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.modal-score-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 1.25rem;
}

.modal-score-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.5);
}

.modal-score-value {
  font-size: 3rem;
  font-weight: 900;
  color: #ffd700;
  line-height: 1;
}

.modal-divider {
  height: 1px;
  background: rgba(255,255,255,0.1);
  margin: 0 0 1.25rem;
}

.modal-leaderboard { margin-bottom: 1rem; }

.modal-lb-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.modal-lb-row:last-child { border-bottom: none; }

.modal-lb-label {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.6);
}

.modal-lb-value {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}

.modal-points-notice {
  font-size: 0.85rem;
  font-weight: 600;
  color: #66cc00;
  background: rgba(102, 204, 0, 0.1);
  border: 1px solid rgba(102, 204, 0, 0.25);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  margin-bottom: 1.25rem;
}
.modal-points-notice--zero {
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.modal-actions { display: flex; justify-content: center; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
  .hud-item--warning { animation: none; }
}
</style>
