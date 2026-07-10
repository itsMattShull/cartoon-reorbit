<template>
  <div>
    <NuxtLayout name="newsite-template" :show-adbar="true" :show-nav="true">
      <div class="tower-wrapper">
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
            <h1 class="game-title">Tower Stack</h1>
            <p class="no-plays-text">No plays left today.</p>
            <p class="reset-text">Resets {{ resetLabel }}</p>
          </div>
        </div>

        <!-- Start screen -->
        <div v-else-if="uiState === 'start'" class="center-content">
          <div class="start-card">
            <h1 class="game-title">Tower Stack</h1>
            <p class="start-sub">Tap to drop blocks onto the base. Align blocks correctly for a stable tower and boost your score. Keep stacking without errors for the best results.</p>
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
        <div v-else-if="uiState === 'playing'" class="game-area" role="main" aria-label="Tower Stack game board">
          <!-- HUD -->
          <div class="hud" role="status" aria-live="polite" aria-atomic="true">
            <div class="hud-row hud-row--primary">
              <div class="hud-item">
                <span class="hud-label">Score</span>
                <span class="hud-value">{{ score.toLocaleString() }}</span>
              </div>
              <div class="hud-item">
                <span class="hud-label">Best</span>
                <span class="hud-value">{{ Math.max(allTimeHigh, score).toLocaleString() }}</span>
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
              @pointerdown="onTap"
              @dragstart.prevent
              @contextmenu.prevent
              aria-label="Tower Stack game board"
              role="img"
            ></canvas>
          </div>
          <p class="sr-only" aria-live="polite">{{ announce }}</p>
          <div class="game-hint" aria-hidden="true">Tap anywhere to drop the block — keep a steady rhythm</div>
        </div>
      </div>
    </NuxtLayout>

    <!-- Game Over Modal (teleported outside transform context) -->
    <Teleport to="body">
      <div v-if="uiState === 'gameover'" class="modal-backdrop" @click.self="uiState = 'start'">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Game Over">
          <button class="modal-close" type="button" @click="goToGamesHome" aria-label="Close and return to Games Home">&times;</button>
          <h2 class="modal-title">{{ maxedOut ? 'Max Height Reached!' : 'Game Over!' }}</h2>
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
              <span><strong>Tap anywhere</strong> to drop the sliding block onto the tower.</span>
            </li>
            <li>
              <span class="howto-num">2</span>
              <span>Land it <strong>lined up</strong> with the block below to keep the tower stable. Any part that hangs off gets trimmed away.</span>
            </li>
            <li>
              <span class="howto-num">3</span>
              <span>A <strong>near-perfect</strong> tap keeps the tower's width — miss by too much and there's nothing left to land on.</span>
            </li>
            <li>
              <span class="howto-num">4</span>
              <span>Each block you keep adds <strong>+1</strong> to your score. The tower speeds up the higher you climb.</span>
            </li>
            <li>
              <span class="howto-num">5</span>
              <span>Maintain a <strong>steady rhythm</strong> to perfect your timing — one miss and the run ends.</span>
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

// ─── Shared world/physics constants — MUST stay in sync with server/utils/towerStackEngine.js ──
const BASE_WIDTH = 100
const BOARD_HALF_RANGE = 60
const MIN_MOVE_INTERVAL_MS = 150

// ─── Rendering-only constants (no server sync needed — purely visual) ──────────────────────────
const LAYER_HEIGHT = 26          // world units per block
const RENDER_WINDOW = 16         // only the last N committed layers are ever drawn (perf: culling)
const MAX_PARTICLES = 70         // hard cap on live falling-chip particles
const CAMERA_FOLLOW_RATE = 5.5   // lerp speed (per second) toward camera target
const ISO_COS = Math.cos(Math.PI / 6)
const ISO_SIN = Math.sin(Math.PI / 6)

// ─── Reactive UI state ──────────────────────────────────────────────────────────
const uiState    = ref('loading')  // loading | start | playing | gameover | noplays
const starting   = ref(false)
const score      = ref(0)
const playsLeft  = ref(0)
const finalScore    = ref(0)
const weekHigh      = ref(0)
const allTimeHigh   = ref(0)
const pointsAwarded = ref(0)
const maxedOut       = ref(false)
const resetLabel = ref('')
const announce   = ref('')
const showHowTo  = ref(false)

const canvas          = ref(null)
const canvasContainer = ref(null)

// ─── Non-reactive game internals ──────────────────────────────────────────────
let cfg         = null   // { baseSpeed, speedGrowthPerLayer, maxSpeedMultiplier, perfectEpsilon, maxLayers, baseWidth, boardHalfRange }
let jitter      = { phaseFrac: 0, speedMult: 1 }
let currentRect = null   // { xCenter, xWidth, zCenter, zWidth } — last committed footprint
let renderLayers = []    // bounded ring buffer of the last RENDER_WINDOW committed layers, for drawing only
let moveLog     = []     // [{ ts }] sent to the server at game end
let layerIndex  = 1      // n of the block currently in flight
let layerStartTs = 0     // ts (ms since gameStartPerf, pause-adjusted) when the current layer began sliding
let lastLogTs   = null
let gameStartPerf = 0
let totalPausedMs = 0
let pauseBeganAtPerf = null
let ending      = false
let rafId       = null
let ctx         = null
let cw = 0, ch = 0
let dpr = 1
let cameraY = 0
let cameraTargetY = 0
let particles   = []
let bgGradient  = null
let reducedMotion = false

// ─── Deterministic per-session jitter (MUST mirror deriveJitter in towerStackEngine.js) ────────
function deriveJitter(jitterSeed) {
  let h1 = 0x811c9dc5, h2 = 0x1000193
  for (let i = 0; i < jitterSeed.length; i++) {
    const c = jitterSeed.charCodeAt(i)
    h1 = (h1 ^ c) >>> 0; h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 = (h2 ^ c) >>> 0; h2 = Math.imul(h2, 0x85ebca6b) >>> 0
  }
  return {
    phaseFrac: (h1 >>> 0) / 4294967296,
    speedMult: 0.92 + ((h2 >>> 0) / 4294967296) * 0.16
  }
}

function layerSpeed(n) {
  const growth = Math.min(1 + n * cfg.speedGrowthPerLayer, cfg.maxSpeedMultiplier)
  return cfg.baseSpeed * growth * jitter.speedMult
}

function triangleWave(tSeconds, speed, amplitude, phaseOffsetSeconds) {
  const period = (4 * amplitude) / speed
  let phase = ((tSeconds + phaseOffsetSeconds) % period + period) % period
  const quarter = period / 4
  if (phase < quarter) return (phase / quarter) * amplitude
  // Middle leg spans 2*quarter (from +amplitude down to -amplitude), so the slope is
  // amplitude/quarter, not 2*amplitude/quarter -- the old extra "* 2" here made the block
  // swing past the board edge (up to 3x amplitude) before snapping back once phase crossed
  // into the next leg, which is what caused the visible "pull back" glitch on new blocks.
  if (phase < 3 * quarter) return amplitude - ((phase - quarter) / quarter) * amplitude
  return -amplitude + ((phase - 3 * quarter) / quarter) * amplitude
}

// MUST mirror movingCenterAt in towerStackEngine.js exactly (see that file for why the phase
// offset is anchored to a turning point instead of an arbitrary fraction of the period).
function movingCenterAt(n, tSeconds) {
  const speed = layerSpeed(n)
  const amplitude = cfg.boardHalfRange
  const period = (4 * amplitude) / speed
  const quarter = period / 4
  const startsPositive = (jitter.phaseFrac < 0.5) === (n % 2 === 1)
  const phaseOffset = startsPositive ? quarter : 3 * quarter
  return triangleWave(tSeconds, speed, amplitude, phaseOffset)
}

function axisForLayer(n) { return n % 2 === 1 ? 'x' : 'z' }

// Mirrors applyDrop in towerStackEngine.js exactly (client-side prediction for instant visual
// feedback; the server always recomputes the authoritative score independently at /end).
function applyDrop(n, tSeconds, rect) {
  const axis = axisForLayer(n)
  const movingCenter = movingCenterAt(n, tSeconds)
  const prevCenter = axis === 'x' ? rect.xCenter : rect.zCenter
  const prevWidth   = axis === 'x' ? rect.xWidth  : rect.zWidth

  if (Math.abs(movingCenter - prevCenter) <= cfg.perfectEpsilon) {
    return { hit: true, rect: { ...rect }, movingCenter, trimmed: false }
  }

  const prevMin = prevCenter - prevWidth / 2
  const prevMax = prevCenter + prevWidth / 2
  const curMin = movingCenter - prevWidth / 2
  const curMax = movingCenter + prevWidth / 2
  const overlapMin = Math.max(prevMin, curMin)
  const overlapMax = Math.min(prevMax, curMax)
  const overlapWidth = overlapMax - overlapMin

  if (overlapWidth <= 0) return { hit: false, rect, movingCenter, trimmed: true }

  const newCenter = (overlapMin + overlapMax) / 2
  const newRect = { ...rect }
  if (axis === 'x') { newRect.xCenter = newCenter; newRect.xWidth = overlapWidth }
  else { newRect.zCenter = newCenter; newRect.zWidth = overlapWidth }
  return { hit: true, rect: newRect, movingCenter, trimmed: true }
}

function vibrate(pattern) { try { navigator.vibrate?.(pattern) } catch {} }

// ─── Isometric projection ──────────────────────────────────────────────────────
let scale = 1
function worldToScreen(x, z, y) {
  const isoX = (x - z) * ISO_COS
  const isoY = (x + z) * ISO_SIN
  return {
    sx: cw / 2 + isoX * scale,
    sy: ch * 0.6 + isoY * scale - (y - cameraY) * scale
  }
}

function hueForLayer(n) { return (200 + n * 6) % 360 }

function drawBlock(rect, yBottom, yTop, hue) {
  const x0 = rect.xCenter - rect.xWidth / 2, x1 = rect.xCenter + rect.xWidth / 2
  const z0 = rect.zCenter - rect.zWidth / 2, z1 = rect.zCenter + rect.zWidth / 2

  const A = worldToScreen(x0, z0, yTop)
  const B = worldToScreen(x1, z0, yTop)
  const C = worldToScreen(x1, z1, yTop)
  const D = worldToScreen(x0, z1, yTop)
  const Bp = worldToScreen(x1, z0, yBottom)
  const Cp = worldToScreen(x1, z1, yBottom)
  const Dp = worldToScreen(x0, z1, yBottom)

  // Off-screen cull (cheap bounding check before touching the path API)
  if (Math.max(A.sy, B.sy, C.sy, D.sy, Bp.sy, Cp.sy, Dp.sy) < -40) return
  if (Math.min(A.sy, B.sy, C.sy, D.sy) > ch + 40) return

  const top   = `hsl(${hue}, 68%, 58%)`
  const right = `hsl(${hue}, 60%, 42%)`
  const front = `hsl(${hue}, 60%, 33%)`

  ctx.fillStyle = top
  ctx.beginPath()
  ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.lineTo(C.sx, C.sy); ctx.lineTo(D.sx, D.sy)
  ctx.closePath(); ctx.fill()

  ctx.fillStyle = right
  ctx.beginPath()
  ctx.moveTo(B.sx, B.sy); ctx.lineTo(C.sx, C.sy); ctx.lineTo(Cp.sx, Cp.sy); ctx.lineTo(Bp.sx, Bp.sy)
  ctx.closePath(); ctx.fill()

  ctx.fillStyle = front
  ctx.beginPath()
  ctx.moveTo(C.sx, C.sy); ctx.lineTo(D.sx, D.sy); ctx.lineTo(Dp.sx, Dp.sy); ctx.lineTo(Cp.sx, Cp.sy)
  ctx.closePath(); ctx.fill()
}

// ─── Canvas sizing ────────────────────────────────────────────────────────────
function resizeCanvas() {
  if (!canvas.value || !canvasContainer.value) return
  const { width, height } = canvasContainer.value.getBoundingClientRect()
  dpr = Math.min(window.devicePixelRatio || 1, 2) // perf: never rasterize above 2x, even on 3x-DPR phones
  canvas.value.width  = width  * dpr
  canvas.value.height = height * dpr
  canvas.value.style.width  = `${width}px`
  canvas.value.style.height = `${height}px`
  ctx = canvas.value.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  cw = width; ch = height
  scale = (cw * 0.42) / (BASE_WIDTH * ISO_COS)
  bgGradient = ctx.createLinearGradient(0, 0, 0, ch)
  bgGradient.addColorStop(0, '#0a1e42')
  bgGradient.addColorStop(1, '#001230')
}

// ─── Particles (falling overhang chips) ────────────────────────────────────────
function spawnChip(rect, axis, side, yBottom, yTop, hue) {
  if (particles.length >= MAX_PARTICLES) return
  const cx = axis === 'x' ? (side === 'lo' ? rect.xCenter - rect.xWidth / 2 - 8 : rect.xCenter + rect.xWidth / 2 + 8) : rect.xCenter
  const cz = axis === 'z' ? (side === 'lo' ? rect.zCenter - rect.zWidth / 2 - 8 : rect.zCenter + rect.zWidth / 2 + 8) : rect.zCenter
  const p = worldToScreen(cx, cz, (yBottom + yTop) / 2)
  particles.push({
    sx: p.sx, sy: p.sy, vy: -20, vx: (Math.random() - 0.5) * 40,
    size: 10, hue, alpha: 1, startMs: performance.now(), life: 900
  })
}

function updateAndDrawParticles(nowMs) {
  let write = 0
  for (let read = 0; read < particles.length; read++) {
    const p = particles[read]
    const age = nowMs - p.startMs
    if (age >= p.life) continue // drop (in-place compaction, no per-frame array alloc)
    const t = age / 1000
    const sy = p.sy + p.vy * t + 260 * t * t
    const sx = p.sx + p.vx * t
    const alpha = Math.max(0, 1 - age / p.life)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = `hsl(${p.hue}, 60%, 45%)`
    ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size)
    ctx.restore()
    particles[write++] = p
  }
  particles.length = write
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderFrame(nowMs, tSecondsCurrent) {
  if (!ctx) return
  ctx.fillStyle = bgGradient || '#001230'
  ctx.fillRect(0, 0, cw, ch)

  // Committed layers, oldest-to-newest so nearer blocks paint over farther ones.
  for (let i = 0; i < renderLayers.length; i++) {
    const layer = renderLayers[i]
    drawBlock(layer.rect, layer.n * LAYER_HEIGHT, (layer.n + 1) * LAYER_HEIGHT, layer.hue)
  }

  // In-flight moving block
  if (uiState.value === 'playing' && !ending && currentRect) {
    const movingCenter = movingCenterAt(layerIndex, tSecondsCurrent)
    const axis = axisForLayer(layerIndex)
    const movingRect = { ...currentRect }
    if (axis === 'x') movingRect.xCenter = movingCenter
    else movingRect.zCenter = movingCenter
    drawBlock(movingRect, layerIndex * LAYER_HEIGHT, (layerIndex + 1) * LAYER_HEIGHT, hueForLayer(layerIndex))
  }

  updateAndDrawParticles(nowMs)
}

// ─── Game loop ────────────────────────────────────────────────────────────────
let paused = false
function gameLoop(nowPerf) {
  if (!canvas.value || paused) { rafId = null; return }

  const elapsedMs = (nowPerf - gameStartPerf) - totalPausedMs
  const tSeconds = Math.max(0, elapsedMs - layerStartTs) / 1000

  const dt = 1 / 60
  cameraY += (cameraTargetY - cameraY) * Math.min(1, (reducedMotion ? 1 : CAMERA_FOLLOW_RATE * dt))

  renderFrame(nowPerf, tSeconds)
  rafId = requestAnimationFrame(gameLoop)
}

function pauseGame() {
  if (paused) return
  paused = true
  pauseBeganAtPerf = performance.now()
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
}
function resumeGame() {
  if (!paused || uiState.value !== 'playing') return
  if (pauseBeganAtPerf != null) totalPausedMs += performance.now() - pauseBeganAtPerf
  pauseBeganAtPerf = null
  paused = false
  rafId = requestAnimationFrame(gameLoop)
}

// ─── Tap handling ───────────────────────────────────────────────────────────────
function onTap(e) {
  if (uiState.value !== 'playing' || ending || paused) return
  e.preventDefault()

  const nowPerf = performance.now()
  let ts = Math.round((nowPerf - gameStartPerf) - totalPausedMs)
  if (lastLogTs !== null) ts = Math.max(ts, lastLogTs + MIN_MOVE_INTERVAL_MS + 1)

  const tSeconds = Math.max(0, ts - layerStartTs) / 1000
  const { hit, rect, trimmed, movingCenter } = applyDrop(layerIndex, tSeconds, currentRect)
  const axis = axisForLayer(layerIndex)
  const hue = hueForLayer(layerIndex)

  if (!hit) {
    // Whole block misses — falls away, run ends.
    spawnChip(currentRect, axis, movingCenter > (axis === 'x' ? currentRect.xCenter : currentRect.zCenter) ? 'hi' : 'lo',
      layerIndex * LAYER_HEIGHT, (layerIndex + 1) * LAYER_HEIGHT, hue)
    vibrate([20, 40, 20])
    announce.value = `Missed! Final score ${score.value}.`
    endGame()
    return
  }

  if (trimmed) {
    const prevCenter = axis === 'x' ? currentRect.xCenter : currentRect.zCenter
    spawnChip(currentRect, axis, movingCenter > prevCenter ? 'hi' : 'lo', layerIndex * LAYER_HEIGHT, (layerIndex + 1) * LAYER_HEIGHT, hue)
  }

  currentRect = rect
  moveLog.push({ ts })
  lastLogTs = ts
  layerIndex++
  layerStartTs = ts
  score.value++
  vibrate(10)
  announce.value = `Block ${score.value} placed.`

  renderLayers.push({ n: layerIndex - 1, rect: { ...currentRect }, hue })
  if (renderLayers.length > RENDER_WINDOW) renderLayers.shift()

  cameraTargetY = (layerIndex) * LAYER_HEIGHT

  if (layerIndex > cfg.maxLayers) {
    maxedOut.value = true
    announce.value = `Max height reached! Final score ${score.value}.`
    endGame()
  }
}

// ─── Game lifecycle ────────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const data = await $fetch('/api/game/tower/status', { credentials: 'include' })
    playsLeft.value   = data.playsLeft
    weekHigh.value    = data.weekHigh
    allTimeHigh.value = data.allTimeHigh
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

function goToGamesHome() {
  navigateTo('/newsite/games')
}

async function startGame() {
  if (starting.value) return
  starting.value = true
  try {
    const data = await $fetch('/api/game/tower/start', { method: 'POST', credentials: 'include' })
    cfg = data.config
    jitter = deriveJitter(data.jitterSeed)

    currentRect = { xCenter: 0, xWidth: cfg.baseWidth, zCenter: 0, zWidth: cfg.baseWidth }
    renderLayers = [{ n: 0, rect: { ...currentRect }, hue: hueForLayer(0) }]
    moveLog = []
    layerIndex = 1
    layerStartTs = 0
    lastLogTs = null
    particles = []
    score.value = 0
    maxedOut.value = false
    ending = false
    totalPausedMs = 0
    pauseBeganAtPerf = null
    paused = false
    announce.value = ''
    cameraY = 0
    cameraTargetY = LAYER_HEIGHT

    await fetchStatus()
    playsLeft.value = Math.max(0, playsLeft.value - 1) // optimistic

    uiState.value = 'playing'
    await nextTick()

    resizeCanvas()
    gameStartPerf = performance.now()
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

  try {
    const result = await $fetch('/api/game/tower/end', {
      method: 'POST',
      credentials: 'include',
      body: { moveLog }
    })
    pointsAwarded.value = result.pointsAwarded ?? 0
    if (typeof result.score === 'number') finalScore.value = result.score
    const status = await $fetch('/api/game/tower/status', { credentials: 'include' })
    weekHigh.value    = status.weekHigh
    allTimeHigh.value = status.allTimeHigh
    playsLeft.value   = status.playsLeft
  } catch {
    pointsAwarded.value = 0
  }

  uiState.value = 'gameover'
}

// ─── Resize / visibility / orientation lifecycle ────────────────────────────────
let resizeObserver = null
let landscapeMql = null
function onVisibilityChange() { if (document.hidden) pauseGame(); else resumeGame() }
function onLandscapeChange() { if (landscapeMql?.matches) pauseGame(); else resumeGame() }

onMounted(async () => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  await fetchStatus()
  resizeObserver = new ResizeObserver(() => {
    if (uiState.value === 'playing') resizeCanvas()
  })
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)

  landscapeMql = window.matchMedia('(orientation: landscape) and (max-height: 480px)')
  landscapeMql.addEventListener?.('change', onLandscapeChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  landscapeMql?.removeEventListener?.('change', onLandscapeChange)
})
</script>

<style scoped>
.tower-wrapper {
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
  overscroll-behavior: contain;
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
  gap: 8px;
  flex-wrap: nowrap;
}

.hud-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 4px 12px;
  min-width: 64px;
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

/* Canvas */
.canvas-container {
  flex: 1;
  width: 100%;
  position: relative;
  overflow: hidden;
  min-height: 200px;
  overscroll-behavior: contain;
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
  position: relative;
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

.modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.7);
  font-size: 1.4rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.modal-close:hover,
.modal-close:focus-visible {
  background: rgba(255,255,255,0.18);
  color: #fff;
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
}
</style>
