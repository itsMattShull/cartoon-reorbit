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
            <p class="start-sub">Slide your finger across 3 matching icons — any direction — to clear them. Chain matches fast to build your combo!</p>
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
              <div class="hud-item" :class="{ 'hud-item--active': combo > 1 }">
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
              @pointercancel="onPointerCancel"
              aria-label="Match-3 game grid"
              role="img"
            ></canvas>
          </div>
          <p class="sr-only" aria-live="polite">{{ announce }}</p>
          <div class="game-hint" aria-hidden="true">Slide across 3 of the same icon — any direction, diagonals too</div>
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
const ANIMATION_REMOVE_MS = 300
const ANIMATION_FALL_MS   = 280
const ANIMATION_APPEAR_MS = 200
const MIN_MATCH = 3          // a valid match is exactly this many tiles
const MAX_MATCH = 3          // chain is capped at this many tiles

// Scoring — MUST stay in sync with server/utils/reorbitMatchEngine.js
const BASE_MATCH_POINTS = 30
const COMBO_WINDOW_MS   = 2500
const MAX_COMBO_MULT    = 8

const HINT_DELAY_MS = 5000
const FAIL_FLASH_MS = 380

// Tile animation states
const TS = { NORMAL: 0, REMOVING: 1, FALLING: 2, APPEARING: 3 }

// ─── Reactive UI state ──────────────────────────────────────────────────────────
const uiState    = ref('loading')  // loading | start | playing | gameover | noplays
const starting   = ref(false)
const score      = ref(0)
const combo      = ref(0)
const multiplier = ref(1)
const timeLeft   = ref(null)
const playsLeft  = ref(0)
const finalScore    = ref(0)
const weekHigh      = ref(0)
const allTimeHigh   = ref(0)
const pointsAwarded = ref(0)
const resetLabel = ref('')
const announce   = ref('')

const canvas          = ref(null)
const canvasContainer = ref(null)

// ─── Non-reactive game internals ──────────────────────────────────────────────
let board       = []    // flat array of emoji indices
let emojis      = []     // emoji strings
let gridSize    = 8
let timeSeconds = null
let fillSeed    = null
let fillRng     = null   // deterministic refill stream (shared with server)
let moveLog     = []     // [{ cells:[{row,col}x3], ts }]
let tiles       = []     // per-tile animation state
let animating   = false
let ending      = false  // guards endGame against double-fire
let gameStartTs = 0
let rafId       = null
let timerStart  = null
let ctx         = null
let tileSize    = 0
let gridOffset  = { x: 0, y: 0 }

// Drag / chain state
let pointerDown = false
let chain       = []      // ordered tile indices in the current drag
let pointerX    = 0
let pointerY    = 0

// Combo bookkeeping (mirrors the server's ts-driven combo)
let comboCount  = 0
let lastLogTs   = null    // relative ts of the previous logged match
let lastMatchAbs = 0      // performance.now() of the previous match (for idle decay)

// Feedback / hint
let particles     = []
let failFlashSet  = new Set()
let failFlashUntil = 0
let hintSet       = new Set()
let hintActive    = false
let lastActivityMs = 0
let reducedMotion = false

let configData = null

// ─── Deterministic PRNG (byte-identical to server makePRNG) ────────────────────
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

// ─── Grid helpers ───────────────────────────────────────────────────────────────
function idxOf(row, col) { return row * gridSize + col }
function rowOf(idx) { return Math.floor(idx / gridSize) }
function colOf(idx) { return idx % gridSize }

// 8-directional adjacency (Chebyshev distance exactly 1)
function isEightAdjacent(a, b) {
  const dr = Math.abs(rowOf(a) - rowOf(b))
  const dc = Math.abs(colOf(a) - colOf(b))
  return dr <= 1 && dc <= 1 && (dr + dc) > 0
}

function computeMultiplier(c) { return c <= 1 ? 1 : Math.min(c, MAX_COMBO_MULT) }

function vibrate(pattern) { try { navigator.vibrate?.(pattern) } catch {} }

// ─── Game-over detection (8-connected same-color component of size >= 3) ─────────
function hasPossibleMoves(b) {
  const n = gridSize * gridSize
  const visited = new Uint8Array(n)
  const stack = []
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue
    const color = b[start]
    if (color === -1) { visited[start] = 1; continue }
    stack.length = 0
    stack.push(start)
    visited[start] = 1
    let size = 0
    while (stack.length) {
      const idx = stack.pop()
      size++
      if (size >= MIN_MATCH) return true
      const r = rowOf(idx), c = colOf(idx)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue
          const nidx = nr * gridSize + nc
          if (!visited[nidx] && b[nidx] === color) { visited[nidx] = 1; stack.push(nidx) }
        }
      }
    }
  }
  return false
}

// Find one valid 3-chain for the idle hint (returns [idx, idx, idx] or null)
function findHint(b) {
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const color = b[idxOf(r, c)]
      if (color === -1) continue
      const nbrs = []
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue
          if (b[idxOf(nr, nc)] === color) nbrs.push(idxOf(nr, nc))
        }
      }
      if (nbrs.length >= 2) return [nbrs[0], idxOf(r, c), nbrs[1]]
    }
  }
  return null
}

// ─── Particles ──────────────────────────────────────────────────────────────────
function fireExplosion(tileIdx) {
  if (reducedMotion) return
  const cx = tileCenterX(colOf(tileIdx)), cy = tileCenterY(rowOf(tileIdx))
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

// ─── Tile animation state ──────────────────────────────────────────────────────
function initTiles(b) {
  tiles = b.map((emojiIdx) => ({
    emojiIdx,
    state: TS.NORMAL,
    visualY: 0,
    startVisualY: 0,
    alpha: 1,
    scale: 1,
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

// Color of the in-progress chain feedback: green while all-same-so-far, red otherwise.
function chainFeedbackColor() {
  if (chain.length === 0) return null
  const first = board[chain[0]]
  const allSame = chain.every(i => board[i] === first)
  return allSame ? '#3ddc84' : '#ff5a5a'
}

function renderFrame(nowMs) {
  if (!ctx) return
  const w = canvas.value.width / devicePixelRatio
  const h = canvas.value.height / devicePixelRatio

  ctx.fillStyle = '#001230'
  ctx.fillRect(0, 0, w, h)

  const boardPx = tileSize * gridSize + TILE_GAP * (gridSize + 1)
  const grd = ctx.createRadialGradient(
    gridOffset.x + boardPx / 2, gridOffset.y + boardPx / 2, 0,
    gridOffset.x + boardPx / 2, gridOffset.y + boardPx / 2, boardPx * 0.7
  )
  grd.addColorStop(0, 'rgba(30, 80, 180, 0.15)')
  grd.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grd
  ctx.fillRect(gridOffset.x, gridOffset.y, boardPx, boardPx)

  const feedback = chainFeedbackColor()
  const chainSet = new Set(chain)
  const flashing = nowMs < failFlashUntil

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    const row = rowOf(i), col = colOf(i)
    const elapsed = nowMs - tile.animStartMs

    let x = tileLeft(col)
    let y = tileTop(row) + tile.visualY
    let alpha = tile.alpha
    let scale = tile.scale
    let rot = 0

    if (tile.state === TS.REMOVING) {
      const t = Math.min(elapsed / ANIMATION_REMOVE_MS, 1)
      if (reducedMotion) {
        alpha = 1 - t
        scale = 1
      } else if (t < 0.28) {
        scale = 1 + (t / 0.28) * 0.55
        alpha = 1
      } else {
        const burst = (t - 0.28) / 0.72
        scale = 1.55 * (1 - burst)
        alpha = 1 - Math.pow(burst, 0.6)
        rot = burst * 0.4
      }
    } else if (tile.state === TS.FALLING) {
      const t = Math.min(elapsed / ANIMATION_FALL_MS, 1)
      const ease = reducedMotion ? t : 1 - Math.pow(1 - t, 3)
      tile.visualY = tile.startVisualY * (1 - ease)
      y = tileTop(row) + tile.visualY
    } else if (tile.state === TS.APPEARING) {
      const fadeT = Math.min(elapsed / ANIMATION_APPEAR_MS, 1)
      const fallT = Math.min(elapsed / ANIMATION_FALL_MS, 1)
      const ease  = reducedMotion ? fallT : 1 - Math.pow(1 - fallT, 3)
      alpha = fadeT
      scale = reducedMotion ? 1 : 0.6 + fadeT * 0.4
      tile.visualY = tile.startVisualY * (1 - ease)
      y = tileTop(row) + tile.visualY
    }

    const inChain  = chainSet.has(i)
    const inFlash  = flashing && failFlashSet.has(i)
    const inHint   = hintActive && hintSet.has(i)

    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    ctx.translate(x + tileSize / 2, y + tileSize / 2)
    if (rot) ctx.rotate(rot)
    if (inHint && !reducedMotion) scale *= 1 + Math.sin(nowMs / 160) * 0.06
    ctx.scale(scale, scale)

    const baseColor = TILE_COLORS[tile.emojiIdx % TILE_COLORS.length]
    if (inFlash) {
      ctx.shadowColor = '#ff5a5a'; ctx.shadowBlur = 14; ctx.fillStyle = '#ff5a5a'
    } else if (inChain && feedback) {
      ctx.shadowColor = feedback; ctx.shadowBlur = 14; ctx.fillStyle = feedback
    } else if (inHint) {
      ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 12; ctx.fillStyle = baseColor
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.fillStyle = baseColor
    }
    drawRoundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, Math.round(tileSize * 0.12))
    ctx.fill()
    ctx.shadowBlur = 0

    if (inChain || inFlash) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

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
  }

  // Chain connecting line + live segment to the pointer
  if (chain.length > 0 && feedback) {
    ctx.save()
    ctx.strokeStyle = feedback
    ctx.lineWidth = Math.max(3, tileSize * 0.09)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = feedback
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.moveTo(tileCenterX(colOf(chain[0])), tileCenterY(rowOf(chain[0])))
    for (let k = 1; k < chain.length; k++) {
      ctx.lineTo(tileCenterX(colOf(chain[k])), tileCenterY(rowOf(chain[k])))
    }
    ctx.stroke()
    if (pointerDown && chain.length < MAX_MATCH) {
      const last = chain[chain.length - 1]
      ctx.setLineDash([Math.round(tileSize * 0.16), Math.round(tileSize * 0.12)])
      ctx.beginPath()
      ctx.moveTo(tileCenterX(colOf(last)), tileCenterY(rowOf(last)))
      ctx.lineTo(pointerX, pointerY)
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.restore()
  }

  // Burst particles
  const PARTICLE_LIFE_MS = 500
  particles = particles.filter(p => {
    const age = nowMs - p.startMs
    if (age >= PARTICLE_LIFE_MS) return false
    const t = age / PARTICLE_LIFE_MS
    const secs = age / 1000
    ctx.save()
    ctx.globalAlpha = Math.pow(1 - t, 1.4)
    ctx.fillStyle   = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur  = 4
    ctx.beginPath()
    ctx.arc(p.x + p.vx * secs, p.y + p.vy * secs + 400 * secs * secs, p.size * (1 - t * 0.6), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return true
  })
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function gameLoop(nowMs) {
  if (!canvas.value) return

  if (timeSeconds && timerStart !== null) {
    const elapsed = (nowMs - timerStart) / 1000
    timeLeft.value = Math.max(0, Math.ceil(timeSeconds - elapsed))
    if (timeLeft.value === 0) { endGame(); return }
  }

  // Combo idle decay (display only; server recomputes authoritative combo from ts)
  if (comboCount > 0) {
    const alive = (nowMs - lastMatchAbs) <= COMBO_WINDOW_MS
    const dispC = alive ? comboCount : 0
    const dispM = alive ? computeMultiplier(comboCount) : 1
    if (combo.value !== dispC) combo.value = dispC
    if (multiplier.value !== dispM) multiplier.value = dispM
  }

  // Idle hint
  if (uiState.value === 'playing' && !animating && !pointerDown && !hintActive) {
    if (nowMs - lastActivityMs > HINT_DELAY_MS) {
      const h = findHint(board)
      if (h) { hintSet = new Set(h); hintActive = true }
    }
  }

  renderFrame(nowMs)
  rafId = requestAnimationFrame(gameLoop)
}

// ─── Deterministic settle (gravity + refill) matching the server exactly ────────
// Returns { newBoard, survivors:[{dest,fall}], newcomers:[{dest,fall}] }.
function settleBoard(removedSet) {
  const n = gridSize * gridSize
  const newBoard = new Array(n).fill(-1)
  const survivors = []
  const newcomers = []

  for (let col = 0; col < gridSize; col++) {
    let write = gridSize - 1
    for (let r = gridSize - 1; r >= 0; r--) {
      const idx = idxOf(r, col)
      if (!removedSet.has(idx)) {
        const dest = idxOf(write, col)
        newBoard[dest] = board[idx]
        if (write !== r) survivors.push({ dest, fall: write - r })
        write--
      }
    }
    const newCount = write + 1 // rows 0..write are freshly spawned
    for (let d = 0; d <= write; d++) {
      newcomers.push({ dest: idxOf(d, col), fall: newCount })
    }
  }

  // Fill placeholders row-major with the shared PRNG — same order as server fillEmpty.
  for (let i = 0; i < n; i++) {
    if (newBoard[i] === -1) newBoard[i] = Math.floor(fillRng() * emojis.length)
  }
  return { newBoard, survivors, newcomers }
}

// ─── Perform a match ─────────────────────────────────────────────────────────
async function performMatch(cells) {
  animating = true
  clearHint()

  // Log the move (relative ts, clamped so the server's monotonic + min-interval checks pass)
  let ts = Math.round(performance.now() - gameStartTs)
  if (lastLogTs !== null) ts = Math.max(ts, lastLogTs + 101)
  moveLog.push({ cells: cells.map(i => ({ row: rowOf(i), col: colOf(i) })), ts })

  // Combo (identical rule to server: driven purely by ts gaps)
  if (lastLogTs !== null && (ts - lastLogTs) <= COMBO_WINDOW_MS) comboCount++
  else comboCount = 1
  lastLogTs = ts
  lastMatchAbs = performance.now()
  const mult = computeMultiplier(comboCount)
  score.value += BASE_MATCH_POINTS * mult
  combo.value = comboCount
  multiplier.value = mult
  announce.value = `Matched 3! +${BASE_MATCH_POINTS * mult}. Combo ${comboCount}x.`
  vibrate(30)

  // Removal animation
  const now = performance.now()
  const removedSet = new Set(cells)
  for (const idx of cells) {
    tiles[idx].state = TS.REMOVING
    tiles[idx].animStartMs = now
    fireExplosion(idx)
  }
  await wait(ANIMATION_REMOVE_MS)

  // Settle deterministically
  const { newBoard, survivors, newcomers } = settleBoard(removedSet)
  board = newBoard
  initTiles(board)

  const fallNow = performance.now()
  const step = tileSize + TILE_GAP
  for (const { dest, fall } of survivors) {
    const t = tiles[dest]
    t.state = TS.FALLING
    t.startVisualY = -(fall * step)
    t.visualY = t.startVisualY
    t.animStartMs = fallNow
  }
  for (const { dest, fall } of newcomers) {
    const t = tiles[dest]
    t.state = TS.APPEARING
    t.alpha = 0
    t.startVisualY = -(fall * step)
    t.visualY = t.startVisualY
    t.animStartMs = fallNow
  }
  await wait(ANIMATION_FALL_MS + 50)

  for (const t of tiles) {
    if (t.state === TS.FALLING || t.state === TS.APPEARING) {
      t.state = TS.NORMAL
      t.visualY = 0
      t.alpha = 1
    }
  }

  animating = false
  touchActivity()

  // Terminal state: no more possible matches (rare with 8-dir; timer is the usual end)
  if (!hasPossibleMoves(board)) endGame()
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Input handling ────────────────────────────────────────────────────────────
function getCanvasPos(e) {
  if (!canvas.value) return { x: 0, y: 0 }
  const rect = canvas.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function touchActivity() { lastActivityMs = performance.now(); clearHint() }
function clearHint() { if (hintActive) { hintActive = false; hintSet = new Set() } }

function onPointerDown(e) {
  if (animating || uiState.value !== 'playing') return
  e.preventDefault()
  canvas.value?.setPointerCapture?.(e.pointerId)
  pointerDown = true
  const pos = getCanvasPos(e)
  pointerX = pos.x; pointerY = pos.y
  touchActivity()
  const idx = hitTest(pos.x, pos.y)
  chain = idx === -1 ? [] : [idx]
  if (idx !== -1) vibrate(8)
}

function onPointerMove(e) {
  if (!pointerDown) return
  e.preventDefault()
  const pos = getCanvasPos(e)
  pointerX = pos.x; pointerY = pos.y
  if (animating || uiState.value !== 'playing' || chain.length === 0) return

  const idx = hitTest(pos.x, pos.y)
  if (idx === -1) return
  const last = chain[chain.length - 1]
  if (idx === last) return

  // Backtrack: sliding onto the second-to-last cell pops the last one off.
  if (chain.length >= 2 && idx === chain[chain.length - 2]) {
    chain.pop()
    vibrate(6)
    return
  }
  if (chain.includes(idx)) return         // ignore other revisits
  if (chain.length >= MAX_MATCH) return    // hard cap at 3
  if (!isEightAdjacent(last, idx)) return  // keep the drag path contiguous

  chain.push(idx)
  vibrate(8)
}

function onPointerUp(e) {
  if (!pointerDown) return
  e.preventDefault()
  pointerDown = false
  canvas.value?.releasePointerCapture?.(e.pointerId)

  const c = chain
  chain = []
  if (animating || uiState.value !== 'playing') return

  if (c.length === MIN_MATCH) {
    const first = board[c[0]]
    const allSame = c.every(i => board[i] === first)
    if (allSame) { performMatch(c); return }
  }
  // Invalid selection — brief red flash + error haptic so it never reads as "broken".
  if (c.length > 0) {
    failFlashSet = new Set(c)
    failFlashUntil = performance.now() + FAIL_FLASH_MS
    announce.value = 'No match — connect exactly 3 of the same icon.'
    vibrate([20, 40, 20])
  }
  touchActivity()
}

function onPointerLeave() { /* pointer capture keeps events flowing; ignore */ }

function onPointerCancel(e) {
  pointerDown = false
  canvas.value?.releasePointerCapture?.(e.pointerId)
  chain = []
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
    fillSeed    = data.fillSeed
    fillRng     = makePRNG(fillSeed)

    score.value      = 0
    combo.value      = 0
    multiplier.value = 1
    timeLeft.value   = timeSeconds
    moveLog          = []
    chain            = []
    particles        = []
    comboCount       = 0
    lastLogTs        = null
    lastMatchAbs     = 0
    failFlashSet     = new Set()
    failFlashUntil   = 0
    animating        = false
    ending           = false
    hintActive       = false
    hintSet          = new Set()
    announce.value   = ''

    await fetchStatus() // refresh plays left
    playsLeft.value  = Math.max(0, playsLeft.value - 1) // optimistic

    uiState.value = 'playing'
    await nextTick()

    resizeCanvas()
    initTiles(board)
    gameStartTs = performance.now()
    timerStart  = timeSeconds ? performance.now() : null
    lastActivityMs = performance.now()
    rafId = requestAnimationFrame(gameLoop)
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Failed to start game'
    alert(msg)
  } finally {
    starting.value = false
  }
}

async function endGame() {
  if (ending) return
  ending = true
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }

  finalScore.value = score.value
  announce.value = `Game over. Final score ${score.value}.`

  try {
    const result = await $fetch('/api/game/reorbitmatch/end', {
      method: 'POST',
      credentials: 'include',
      body: { moveLog }
    })
    pointsAwarded.value = result.pointsAwarded ?? 0
    if (typeof result.score === 'number') finalScore.value = result.score
    const status = await $fetch('/api/game/reorbitmatch/status', { credentials: 'include' })
    weekHigh.value    = status.weekHigh
    allTimeHigh.value = status.allTimeHigh
    playsLeft.value   = status.playsLeft
  } catch {
    pointsAwarded.value = 0
  }

  uiState.value = 'gameover'
}

// ─── Resize observer & lifecycle ────────────────────────────────────────────────
let resizeObserver = null
onMounted(async () => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  await fetchStatus()
  resizeObserver = new ResizeObserver(() => {
    if (uiState.value === 'playing') resizeCanvas()
  })
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)
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

/* How-to hint under the board */
.game-hint {
  flex-shrink: 0;
  text-align: center;
  color: rgba(255,255,255,0.4);
  font-size: 0.72rem;
  padding: 4px 8px 6px;
}

/* Screen-reader-only live region */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
