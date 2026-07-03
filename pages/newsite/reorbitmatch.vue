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
            <button class="btn-howto" @click="showHowTo = true" aria-label="How to play">
              <svg class="howto-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M9.1 9a3 3 0 1 1 4.4 3c-.9.6-1.5 1-1.5 2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="12" cy="17.4" r="1.2" fill="currentColor"/>
              </svg>
              <span>How to Play</span>
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
              <div class="hud-item" :class="{ 'hud-item--glow': combo > 1 }">
                <span class="hud-label">Combo</span>
                <span class="hud-value hud-multiplier">{{ combo }}x</span>
              </div>
              <div v-if="timeSeconds" class="hud-item" :class="{ 'hud-item--warning': timeLeft <= 10 }">
                <span class="hud-label">Time</span>
                <span class="hud-value">{{ timeLeft }}s</span>
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
              draggable="false"
              @pointerdown="onPointerDown"
              @dragstart.prevent
              @contextmenu.prevent
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

    <!-- How to Play Modal -->
    <Teleport to="body">
      <div v-if="showHowTo" class="modal-backdrop" @click.self="showHowTo = false">
        <div class="modal-card modal-card--howto" role="dialog" aria-modal="true" aria-label="How to Play">
          <h2 class="modal-title">How to Play</h2>
          <ol class="howto-list">
            <li>
              <span class="howto-num">1</span>
              <span>Press and hold on a tile, then <strong>slide your finger or mouse</strong> across the board — up, down, sideways, or diagonally.</span>
            </li>
            <li>
              <span class="howto-num">2</span>
              <span>Connect <strong>exactly 3 tiles of the same icon</strong>. The trail glows <span class="howto-green">green</span> when your picks match and <span class="howto-red">red</span> when they don't.</span>
            </li>
            <li>
              <span class="howto-num">3</span>
              <span><strong>Let go</strong> to clear a matching trio. The tiles pop, everything above drops down, and new tiles fill in from the top.</span>
            </li>
            <li>
              <span class="howto-num">4</span>
              <span>Each match you chain in a row raises your <strong>combo multiplier</strong> — 2×, 3×, 4× and up. Keep matching before the combo cools down or it drops back to 1×.</span>
            </li>
            <li>
              <span class="howto-num">5</span>
              <span>Score as much as you can before time runs out. Slid onto a wrong tile? Slide back a step to undo it.</span>
            </li>
          </ol>
          <div class="modal-actions">
            <button class="btn-start" @click="showHowTo = false">Got it!</button>
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

// Chain extension is direction-based rather than position-based: the drag vector from the
// current tile's center is snapped to the nearest of 8 compass directions, and the neighbor
// in that direction is added. This gives every neighbor — diagonals included — an equal 45°
// acceptance cone, so a diagonal drag has to be off by more than 22.5° before it slips into
// the tile above/below/beside. CHAIN_COMMIT_FRACTION is how far (as a fraction of a tile) the
// finger must travel from the current tile's center before the next tile is committed.
const CHAIN_COMMIT_FRACTION    = 0.45
// Sliding the finger back within this fraction of the previous tile's center pops the last
// tile off the chain (undo a step).
const CHAIN_BACKTRACK_FRACTION = 0.5
// Neighbor offset [dRow, dCol] for each snapped direction, indexed by the 8-way sector below.
const SECTOR_DIRS = [
  [0, 1],   // 0:  right
  [1, 1],   // 1:  down-right
  [1, 0],   // 2:  down
  [1, -1],  // 3:  down-left
  [0, -1],  // 4:  left
  [-1, -1], // 5:  up-left
  [-1, 0],  // 6:  up
  [-1, 1]   // 7:  up-right
]

// Scoring — MUST stay in sync with server/utils/reorbitMatchEngine.js
const BASE_MATCH_POINTS = 30
const DEFAULT_COMBO_WINDOW_MS = 3500  // fallback; server sends the configured value at /start

const FAIL_FLASH_MS = 380

// Tile animation states
const TS = { NORMAL: 0, REMOVING: 1, FALLING: 2, APPEARING: 3 }

// ─── Reactive UI state ──────────────────────────────────────────────────────────
const uiState    = ref('loading')  // loading | start | playing | gameover | noplays
const starting   = ref(false)
const score      = ref(0)
const combo      = ref(0)   // the combo streak, which is also the score multiplier
const timeLeft   = ref(null)
const playsLeft  = ref(0)
const finalScore    = ref(0)
const weekHigh      = ref(0)
const allTimeHigh   = ref(0)
const pointsAwarded = ref(0)
const resetLabel = ref('')
const announce   = ref('')
const showHowTo  = ref(false)

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
let comboWindowMs = DEFAULT_COMBO_WINDOW_MS // combo cooldown; set from /start config
let comboCount  = 0
let lastLogTs   = null    // relative ts of the previous logged match
let lastMatchAbs = 0      // performance.now() of the previous match (for idle decay)

// Feedback
let particles     = []
let failFlashSet  = new Set()
let failFlashUntil = 0
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

// The combo streak IS the multiplier (1st match 1x, 2nd chained 2x, …), no cap.
function computeMultiplier(c) { return c < 1 ? 1 : c }

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

    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
    ctx.translate(x + tileSize / 2, y + tileSize / 2)
    if (rot) ctx.rotate(rot)
    ctx.scale(scale, scale)

    const baseColor = TILE_COLORS[tile.emojiIdx % TILE_COLORS.length]
    if (inFlash) {
      ctx.shadowColor = '#ff5a5a'; ctx.shadowBlur = 14; ctx.fillStyle = '#ff5a5a'
    } else if (inChain && feedback) {
      ctx.shadowColor = feedback; ctx.shadowBlur = 14; ctx.fillStyle = feedback
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
    const alive = (nowMs - lastMatchAbs) <= comboWindowMs
    const dispC = alive ? comboCount : 0
    if (combo.value !== dispC) combo.value = dispC
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

  // Log the move (relative ts, clamped so the server's monotonic + min-interval checks pass)
  let ts = Math.round(performance.now() - gameStartTs)
  if (lastLogTs !== null) ts = Math.max(ts, lastLogTs + 101)
  moveLog.push({ cells: cells.map(i => ({ row: rowOf(i), col: colOf(i) })), ts })

  // Combo (identical rule to server: driven purely by ts gaps); the combo IS the multiplier
  if (lastLogTs !== null && (ts - lastLogTs) <= comboWindowMs) comboCount++
  else comboCount = 1
  lastLogTs = ts
  lastMatchAbs = performance.now()
  const mult = computeMultiplier(comboCount)
  score.value += BASE_MATCH_POINTS * mult
  combo.value = comboCount
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

  // Terminal state: no more possible matches (rare with 8-dir; timer is the usual end)
  if (!hasPossibleMoves(board)) endGame()
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Input handling ────────────────────────────────────────────────────────────
function getCanvasPos(e) {
  if (!canvas.value) return { x: 0, y: 0 }
  const rect = canvas.value.getBoundingClientRect()
  // The board sits inside the newsite layout's `transform: scale(...)` wrapper, so the canvas
  // is painted on screen at rect.width/height while tiles are drawn in the canvas's own
  // coordinate space (canvas.width/height ÷ devicePixelRatio — matching renderFrame). Without
  // converting between the two, a click lands off-target by the layout scale factor, and the
  // error grows with distance from center (transform-origin: top center) — picking a far tile.
  const drawW = canvas.value.width  / devicePixelRatio
  const drawH = canvas.value.height / devicePixelRatio
  const scaleX = rect.width  ? drawW / rect.width  : 1
  const scaleY = rect.height ? drawH / rect.height : 1
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY
  }
}

// While a drag is active we track it on `window`, not the canvas. Firefox delivers
// canvas-scoped pointermove/pointerup unreliably during a captured drag (it can drop
// moves when the pointer crosses the tile gaps or leaves the canvas, and sometimes loses
// the final pointerup), which makes chains — diagonals especially — hard to complete.
// Window listeners keep the whole drag flowing in every browser.
function attachDragListeners() {
  window.addEventListener('pointermove', onPointerMove, { passive: false })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
}
function detachDragListeners() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}

function onPointerDown(e) {
  if (animating || uiState.value !== 'playing') return
  e.preventDefault()
  // setPointerCapture can throw in Firefox; the window listeners cover us regardless.
  try { canvas.value?.setPointerCapture?.(e.pointerId) } catch {}
  pointerDown = true
  attachDragListeners()
  const pos = getCanvasPos(e)
  pointerX = pos.x; pointerY = pos.y
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

  const step = tileSize + TILE_GAP

  // Backtrack: sliding the finger back toward the previous tile pops the last one off.
  if (chain.length >= 2) {
    const prev = chain[chain.length - 2]
    const dxp = pos.x - tileCenterX(colOf(prev))
    const dyp = pos.y - tileCenterY(rowOf(prev))
    if (Math.hypot(dxp, dyp) <= step * CHAIN_BACKTRACK_FRACTION) {
      chain.pop()
      vibrate(6)
      return
    }
  }

  // Extend toward the finger, one 8-neighbor at a time. Snapping the drag vector to the
  // nearest of 8 directions gives diagonals the same 45° target as orthogonal moves, so a
  // diagonal drag no longer slips into the tile above/below/beside it. Looping lets a fast
  // flick fill in the tiles it skipped over.
  let guard = 0
  while (chain.length < MAX_MATCH && guard++ < gridSize) {
    const last = chain[chain.length - 1]
    const dx = pos.x - tileCenterX(colOf(last))
    const dy = pos.y - tileCenterY(rowOf(last))
    if (Math.hypot(dx, dy) < step * CHAIN_COMMIT_FRACTION) break  // finger hasn't left this tile

    const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8
    const [dRow, dCol] = SECTOR_DIRS[sector]
    const nr = rowOf(last) + dRow
    const nc = colOf(last) + dCol
    if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) break  // off the board
    const idx = idxOf(nr, nc)
    if (chain.includes(idx)) break  // don't revisit a tile already in the chain

    chain.push(idx)
    vibrate(8)
  }
}

function onPointerUp(e) {
  if (!pointerDown) return
  e.preventDefault()
  pointerDown = false
  detachDragListeners()
  try { canvas.value?.releasePointerCapture?.(e.pointerId) } catch {}

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
}

function onPointerCancel(e) {
  pointerDown = false
  detachDragListeners()
  try { canvas.value?.releasePointerCapture?.(e.pointerId) } catch {}
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
    comboWindowMs = data.comboWindowMs ?? DEFAULT_COMBO_WINDOW_MS

    score.value      = 0
    combo.value      = 0
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
    announce.value   = ''

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
  detachDragListeners()
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

/* How to Play trigger */
.btn-howto {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.9rem;
  background: transparent;
  color: rgba(255,255,255,0.6);
  font-weight: 600;
  font-size: 0.8rem;
  border: none;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  transition: color 0.15s;
}
.btn-howto:hover { color: #66bbff; }
.howto-icon { flex-shrink: 0; }

/* How to Play modal */
.modal-card--howto { text-align: left; }

.howto-list {
  list-style: none;
  margin: 0 0 1.25rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.howto-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  color: rgba(255,255,255,0.8);
  font-size: 0.9rem;
  line-height: 1.4;
}
.howto-list strong { color: #fff; font-weight: 700; }
.howto-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a6e3c, #3399cc);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}
.howto-green { color: #3ddc84; font-weight: 700; }
.howto-red   { color: #ff5a5a; font-weight: 700; }

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
  /* Dragging to match must never select text/UI or fire the mobile tap-highlight */
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
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
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
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
