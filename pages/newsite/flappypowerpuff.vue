<template>
  <div
    ref="wrapper"
    class="flappy-wrapper"
    :style="{ '--play-h': playHeight ? playHeight + 'px' : '70svh' }"
  >
    <!-- Loading -->
    <div v-if="uiState === 'loading'" class="center-content">
      <div class="spinner" aria-label="Loading game…"></div>
    </div>

    <!-- Character select / start -->
    <div v-else-if="uiState === 'select'" class="center-content">
      <div class="start-panel">
        <h1 class="game-title">Flappy Powerpuff!</h1>
        <p class="start-sub">Tap to fly. Thread the gaps between the Townsville skyscrapers.</p>

        <p id="char-help" class="char-help">Pick your Powerpuff Girl — they all fly exactly the same.</p>
        <div class="char-row" role="radiogroup" aria-labelledby="char-help">
          <button
            v-for="c in CHARACTERS"
            :key="c.id"
            type="button"
            class="char-card"
            :class="{ 'char-card--active': character === c.id }"
            role="radio"
            :aria-checked="character === c.id"
            @click="pickCharacter(c.id)"
          >
            <img :src="sprites[c.id]" :alt="c.name" class="char-img" draggable="false" />
            <span class="char-name">{{ c.name }}</span>
          </button>
        </div>

        <div class="plays-info">
          <span v-if="playsLeft > 0" class="plays-badge">
            {{ playsLeft }} ranked play{{ playsLeft !== 1 ? 's' : '' }} left
          </span>
          <span v-else class="plays-badge plays-badge--practice">Practice mode</span>
          <span class="reset-text">· Resets {{ resetLabel }}</span>
        </div>
        <p v-if="playsLeft === 0" class="practice-note">
          You've used today's ranked plays. Keep playing for fun — these runs won't earn points
          or reach the leaderboard.
        </p>

        <button class="btn-start" :disabled="starting" @click="startGame">
          {{ starting ? 'Taking off…' : (playsLeft > 0 ? 'Play' : 'Practice') }}
        </button>
        <button class="btn-howto" @click="showHowTo = true">
          <span>How to Play</span>
        </button>
      </div>
    </div>

    <!-- Play area -->
    <div v-else class="play-area">
      <div class="hud-strip">
        <span class="hud-item">
          <span class="hud-label">Best</span>
          <span class="hud-value">{{ Math.max(allTimeHigh, score).toLocaleString() }}</span>
        </span>
        <span v-if="!isRanked" class="hud-tag">Practice — not scored</span>
        <button
          type="button"
          class="hud-mute"
          :aria-pressed="!muted"
          :aria-label="muted ? 'Turn sound on' : 'Turn sound off'"
          @click="toggleMute"
        >{{ muted ? '🔇' : '🔊' }}</button>
      </div>

      <div ref="canvasContainer" class="canvas-container">
        <canvas
          ref="canvas"
          class="game-canvas"
          role="application"
          tabindex="0"
          aria-label="Flappy Powerpuff. Tap, click or press space to fly."
          @pointerdown="onPointerDown"
          @contextmenu.prevent
          @dragstart.prevent
        ></canvas>

        <p v-if="uiState === 'ready'" class="tap-hint">Tap to start flying</p>
      </div>

      <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveMessage }}</p>
    </div>

    <!-- Game over -->
    <div v-if="showGameOver" class="modal-backdrop">
      <div class="modal-card" :class="{ 'modal-card--locked': gameOverLocked }">
        <h2 class="modal-title">{{ resultTitle }}</h2>
        <p class="final-score">{{ finalScore }}</p>
        <p class="final-label">building{{ finalScore === 1 ? '' : 's' }} passed</p>

        <p v-if="!isRanked" class="modal-note">
          Practice run — no points or leaderboard. Ranked plays reset {{ resetLabel }}.
        </p>
        <p v-else-if="pointsError" class="modal-note modal-note--warn">
          Your score was saved, but we couldn't award points just now. Try again shortly.
        </p>
        <p v-else-if="pointsAwarded > 0" class="modal-note modal-note--good">
          +{{ pointsAwarded }} points
        </p>
        <p v-else class="modal-note">You've hit today's points cap — the score still counts.</p>

        <div class="modal-actions">
          <button class="btn-start" :disabled="gameOverLocked || starting" @click="startGame">
            {{ playsLeft > 0 ? 'Play Again' : 'Practice Again' }}
          </button>
          <button class="btn-secondary" :disabled="gameOverLocked" @click="backToSelect">Change Girl</button>
        </div>
      </div>
    </div>

    <!-- How to play -->
    <div v-if="showHowTo" class="modal-backdrop" @click.self="showHowTo = false">
      <div class="modal-card">
        <h2 class="modal-title">How to Play</h2>
        <ul class="howto-list">
          <li>Tap the screen, click, or press <kbd>Space</kbd> to fly upward.</li>
          <li>Gravity pulls you down between taps — keep a rhythm going.</li>
          <li>Pass between the skyscrapers. Touching one, or the street, ends the run.</li>
          <li>The city speeds up the further you get.</li>
          <li>Your first {{ playsPerPeriod }} runs each day earn points and count for the leaderboard. After that you can keep practising for fun.</li>
        </ul>
        <button class="btn-start" @click="showHowTo = false">Got it</button>
      </div>
    </div>

    <!-- Toast -->
    <p v-if="toast" class="toast" role="alert">{{ toast }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  // The canvas needs the vertical space, and a nested scroller under a scrolling page is the
  // fastest way to make a tap-timed game feel broken on a phone.
  showSidebar: false,
  showFooter: false,
  ssr: false,
  title: 'Flappy Powerpuff!',
  description: 'Fly through the Townsville skyline as Blossom, Bubbles or Buttercup in Flappy Powerpuff, a Cartoon ReOrbit arcade game.'
})

// viewport-fit=cover is what makes env(safe-area-inset-*) resolve to anything but 0. The site
// default has no viewport-fit, so without this every safe-area rule on the page is dead CSS.
useHead({
  meta: [{
    name: 'viewport',
    content: 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no'
  }]
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const CHARACTERS = [
  { id: 'blossom', name: 'Blossom' },
  { id: 'bubbles', name: 'Bubbles' },
  { id: 'buttercup', name: 'Buttercup' }
]

// ─── World geometry — MUST mirror server/utils/flappyPowerpuffEngine.js ───────────────────
// The world is a FIXED 480x760 rectangle letterboxed into the viewport. That fixed size is
// the fairness guarantee: visible world width IS reaction time, so a viewport-dependent world
// would hand desktop players ~3 buildings of look-ahead and phone players ~1.
const WORLD_W = 480
const WORLD_H = 760
const BIRD_X = 132
const BIRD_W = 52
const BIRD_H = 38
const PIPE_W = 84
const GROUND_H = 80
const GROUND_Y = WORLD_H - GROUND_H
const START_Y = 300
const GAP_MARGIN_TOP = 70
const GAP_MARGIN_BOTTOM = 30
const MAX_GAP_DELTA = 130
const OVERLAP_HALF_W = (PIPE_W + BIRD_W) / 2
const LEAD_IN = WORLD_W - BIRD_X + PIPE_W / 2

// Client-side pacing floor. The server's is lower, so a flap the client keeps is never one the
// server rejects. Flaps closer than this are DROPPED, not shifted: nudging a timestamp would
// simulate the flap at a different world time than the player felt it.
const MIN_FLAP_GAP_MS = 60
const MAX_FLAPS = 3000
// A frame gap beyond this is a stall (GC, thermal throttle, backgrounded tab), not gameplay.
// It's excluded from game time, which keeps the client and the server's replay agreeing —
// the server only ever sees pause-adjusted timestamps.
const MAX_FRAME_GAP_MS = 250
const GAME_OVER_LOCK_MS = 600

// Flat CN palette, declared once. Building these as template strings per frame would mean
// dozens of string allocations and CSS colour parses every frame.
const C_SKY = '#81c3dd'
// Obstacles must never be mistakable for the backdrop, or the player cannot tell what kills
// them from what is scenery. They get the saturated end of the palette plus the heavy black
// outline that is the early-2000s CN hallmark; the backdrop is veiled in sky (see BACKDROP_VEIL)
// so it recedes behind them.
const C_TOWER_FACE = '#e8a33a'
const C_TOWER_LIGHT = '#ffd98a'
const C_TOWER_DARK = '#b96a1c'
const C_TOWER_WINDOW = '#8a4a12'
const C_TOWER_OUTLINE = '#231404'
const BACKDROP_VEIL = 'rgba(129, 195, 221, 0.55)'
const C_STREET = '#5d6169'
const C_STREET_TOP = '#231404' // heavy dark kerb line, matching the towers' outline
const C_SCORE = '#ffffff'
const C_SCORE_STROKE = '#20303a'
const C_LETTERBOX = '#0d1b26'
const LETTERBOX_SCRIM = 'rgba(8, 20, 30, 0.55)'

const uiState = ref('loading') // loading | select | ready | playing | over
const starting = ref(false)
const showHowTo = ref(false)
const showGameOver = ref(false)
const gameOverLocked = ref(true)
const toast = ref(null)
const liveMessage = ref('')

const character = ref('blossom')
const sprites = ref({
  blossom: '/flappypowerpuff/blossom.png',
  bubbles: '/flappypowerpuff/bubbles.png',
  buttercup: '/flappypowerpuff/buttercup.png',
  city: '/flappypowerpuff/city.png'
})
const playsLeft = ref(0)
const playsPerPeriod = ref(3)
const playsResetAt = ref(null)
const allTimeHigh = ref(0)
const isRanked = ref(false)
const score = ref(0)
const finalScore = ref(0)
const pointsAwarded = ref(0)
const pointsError = ref(false)
const muted = ref(true)
const playHeight = ref(0)

const wrapper = ref(null)
const canvas = ref(null)
const canvasContainer = ref(null)

const resultTitle = computed(() => {
  if (finalScore.value >= Math.max(10, allTimeHigh.value)) return 'New Best!'
  return finalScore.value === 0 ? 'Ouch!' : 'Nice Flying!'
})

const resetLabel = computed(() => {
  if (!playsResetAt.value) return 'daily'
  const d = new Date(playsResetAt.value)
  if (Number.isNaN(d.getTime())) return 'daily'
  return d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', weekday: 'short' })
})

// ─── Mutable game state (deliberately not reactive — touched every frame) ─────────────────
let cfg = null
let seedHash = 0
let flaps = []           // integer ms, pause-adjusted game time
let segments = []        // parabolic flight segments
let arrivals = []        // arrival time (s) per building
let gapCentres = []
let pipesBuilt = 0
let ctx = null
let cssW = 0, cssH = 0, dpr = 1
let scale = 1, offX = 0, offY = 0
let rafId = null
let gameStartPerf = 0
let pausedMs = 0
let pauseBeganAt = null
let lastFramePerf = 0
let running = false
let ending = false
let cityStrip = null      // pre-rendered offscreen backdrop
let cityStripW = 0
let spriteImg = null
let cityImg = null
let reducedMotion = false
let audioCtx = null
let masterGain = null
let awaitingKeyUp = false
let announcedAt = 0

// ─── Physics — MUST mirror flappyPowerpuffEngine.js exactly ───────────────────────────────
function hashSeed(seed) {
  let h = 0x811c9dc5
  const s = String(seed)
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function randFor(hash, n) {
  let h = (hash ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

function speedForPipe(n) {
  return cfg.scrollSpeed * Math.min(1 + n * cfg.speedGrowthPerPipe, cfg.maxSpeedMultiplier)
}

// Buildings are generated lazily as the run gets there, but always from the same recurrence,
// so building N is identical whenever it's derived.
function ensurePipes(count) {
  const half = cfg.pipeGap / 2
  const lo = GAP_MARGIN_TOP + half
  const hi = GROUND_Y - GAP_MARGIN_BOTTOM - half
  while (pipesBuilt < count) {
    const n = pipesBuilt + 1
    const t = n === 1
      ? LEAD_IN / speedForPipe(1)
      : arrivals[n - 2] + cfg.pipeSpacing / speedForPipe(n)
    arrivals[n - 1] = t
    const prev = n === 1 ? (lo + hi) / 2 : gapCentres[n - 2]
    const raw = lo + randFor(seedHash, n) * (hi - lo)
    const bounded = Math.min(prev + MAX_GAP_DELTA, Math.max(prev - MAX_GAP_DELTA, raw))
    gapCentres[n - 1] = Math.min(hi, Math.max(lo, bounded))
    pipesBuilt = n
  }
}

function rebuildSegments() {
  segments = [{ t0: 0, y0: START_Y, v0: 0 }]
  for (let i = 0; i < flaps.length; i++) {
    const t = flaps[i] / 1000
    const prev = segments[segments.length - 1]
    const d = t - prev.t0
    segments.push({
      t0: t,
      y0: prev.y0 + prev.v0 * d + 0.5 * cfg.gravity * d * d,
      v0: cfg.flapVelocity
    })
  }
}

function segmentAt(t) {
  let seg = segments[0]
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].t0 <= t) { seg = segments[i]; break }
  }
  return seg
}

// Position is a pure function of game time and the flap log. No accumulator, no integration of
// frame deltas — that's what makes a dropped frame unable to desync this from the server.
function yAt(t) {
  const seg = segmentAt(t)
  const d = t - seg.t0
  return seg.y0 + seg.v0 * d + 0.5 * cfg.gravity * d * d
}

function vAt(t) {
  const seg = segmentAt(t)
  return seg.v0 + cfg.gravity * (t - seg.t0)
}

// Local prediction only; the server recomputes the authoritative score independently.
function collidedAt(t) {
  const halfBird = BIRD_H / 2
  if (yAt(t) + halfBird >= GROUND_Y) return true

  ensurePipes(Math.max(8, pipesBuilt))
  const halfGap = cfg.pipeGap / 2
  for (let n = 1; n <= pipesBuilt; n++) {
    const speed = speedForPipe(n)
    const enter = arrivals[n - 1] - OVERLAP_HALF_W / speed
    const exit = arrivals[n - 1] + OVERLAP_HALF_W / speed
    if (t < enter) break
    if (t > exit) continue
    const y = yAt(t)
    if (y - halfBird < gapCentres[n - 1] - halfGap) return true
    if (y + halfBird > gapCentres[n - 1] + halfGap) return true
  }
  return false
}

function scoreAt(t) {
  let s = 0
  for (let n = 1; n <= pipesBuilt; n++) {
    const exit = arrivals[n - 1] + OVERLAP_HALF_W / speedForPipe(n)
    if (exit <= t) s++
    else break
  }
  return s
}

// ─── Canvas sizing + letterboxing ────────────────────────────────────────────────────────
function measurePlayHeight() {
  if (!wrapper.value) return
  const top = wrapper.value.getBoundingClientRect().top
  // svh (small viewport height) rather than vh or dvh: vh on iOS is measured with the URL bar
  // hidden so the box extends underneath it, and dvh changes continuously as the bar collapses,
  // which would trigger a resize storm mid-run.
  const vh = window.visualViewport?.height || window.innerHeight
  const bottomInset = 12
  playHeight.value = Math.max(320, Math.round(vh - top - bottomInset))
}

function resizeCanvas() {
  if (!canvas.value || !canvasContainer.value) return
  const rect = canvasContainer.value.getBoundingClientRect()
  const w = Math.round(rect.width)
  const h = Math.round(rect.height)
  if (w <= 0 || h <= 0) return

  // Cap DPR at 2, then step down on very large canvases: this is a full-height portrait canvas
  // repainted every frame, so fill rate is the budget that actually binds on a phone.
  let d = Math.min(window.devicePixelRatio || 1, 2)
  if (w * h * d * d > 1.6e6) d = Math.min(d, 1.5)
  dpr = d

  canvas.value.width = Math.round(w * dpr)
  canvas.value.height = Math.round(h * dpr)
  canvas.value.style.width = `${w}px`
  canvas.value.style.height = `${h}px`
  ctx = canvas.value.getContext('2d', { alpha: false })
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  cssW = w
  cssH = h

  // Letterbox: identical world for everyone, only the physical size differs.
  scale = Math.min(w / WORLD_W, h / WORLD_H)
  offX = (w - WORLD_W * scale) / 2
  offY = (h - WORLD_H * scale) / 2

  buildCityStrip()
}

// Pre-render the backdrop once per resize into a 2x-wide offscreen strip, so each frame is a
// single unscaled blit instead of a filtered rescale drawn twice for the wrap seam. The second
// copy is mirrored, which makes the tiling seamless on art that isn't.
function buildCityStrip() {
  if (!cityImg?.complete || !cityImg.naturalWidth) { cityStrip = null; return }
  // The skyline sits low and short so it reads as distant city rather than competing with
  // the obstacle towers for the player's attention.
  const bandH = Math.round((GROUND_Y - 370) * scale)
  if (bandH <= 0) { cityStrip = null; return }
  const aspect = cityImg.naturalWidth / cityImg.naturalHeight
  const tileW = Math.max(1, Math.round(bandH * aspect))
  const strip = document.createElement('canvas')
  strip.width = tileW * 2
  strip.height = bandH
  const sctx = strip.getContext('2d')
  sctx.drawImage(cityImg, 0, 0, tileW, bandH)
  sctx.save()
  sctx.translate(tileW * 2, 0)
  sctx.scale(-1, 1)
  sctx.drawImage(cityImg, 0, 0, tileW, bandH)
  sctx.restore()
  cityStrip = strip
  cityStripW = tileW
}

function wx(x) { return offX + x * scale }
function wy(y) { return offY + y * scale }

// ─── Rendering ───────────────────────────────────────────────────────────────────────────
// One tower half. `capAtBottom` is true for the upper building (its ledge sits at the bottom,
// facing the gap). The ledge overhangs the shaft on both sides, which is what makes the gap
// edge unmistakable at a glance — the single most important read in the whole game.
function drawTowerHalf(left, width, top, bottom, capAtBottom) {
  const h = bottom - top
  if (h <= 0) return
  const capH = Math.min(Math.max(8, 22 * scale), Math.max(1, h))
  const overhang = width * 0.1
  const outline = Math.max(2, 4 * scale)
  const capY = capAtBottom ? bottom - capH : top

  ctx.fillStyle = C_TOWER_FACE
  ctx.fillRect(left, top, width, h)

  // Lit face down the left third.
  ctx.fillStyle = C_TOWER_LIGHT
  ctx.fillRect(left + width * 0.1, top, width * 0.2, h)

  // Window rows, so the shaft reads as a building rather than a bar.
  ctx.fillStyle = C_TOWER_WINDOW
  const rowGap = Math.max(10, 34 * scale)
  const winH = Math.max(3, 12 * scale)
  const winW = width * 0.14
  const shaftTop = capAtBottom ? top : top + capH
  const shaftBottom = capAtBottom ? bottom - capH : bottom
  for (let y = shaftTop + rowGap * 0.5; y < shaftBottom - winH; y += rowGap) {
    ctx.fillRect(left + width * 0.42, y, winW, winH)
    ctx.fillRect(left + width * 0.66, y, winW, winH)
  }

  ctx.fillStyle = C_TOWER_DARK
  ctx.fillRect(left - overhang, capY, width + overhang * 2, capH)
  ctx.fillStyle = C_TOWER_LIGHT
  ctx.fillRect(left - overhang, capY, width + overhang * 2, Math.max(2, 5 * scale))

  ctx.fillStyle = C_TOWER_OUTLINE
  ctx.fillRect(left, top, outline, h)
  ctx.fillRect(left + width - outline, top, outline, h)
  ctx.fillRect(left - overhang, capY, width + overhang * 2, outline)
  ctx.fillRect(left - overhang, capY + capH - outline, width + overhang * 2, outline)
  ctx.fillRect(left - overhang, capY, outline, capH)
  ctx.fillRect(left + width + overhang - outline, capY, outline, capH)
}

function drawBuilding(cx, gapCentre) {
  const halfGap = cfg.pipeGap / 2
  const left = wx(cx - PIPE_W / 2)
  const width = PIPE_W * scale
  drawTowerHalf(left, width, wy(0), wy(gapCentre - halfGap), true)
  drawTowerHalf(left, width, wy(gapCentre + halfGap), wy(GROUND_Y), false)
}

function renderFrame(t) {
  if (!ctx) return

  ctx.fillStyle = C_LETTERBOX
  ctx.fillRect(0, 0, cssW, cssH)

  // Sky and backdrop draw FULL-BLEED across the whole canvas, ignoring the letterbox, so the
  // bars read as scenery rather than as broken layout. Only gameplay is clipped to the world.
  ctx.fillStyle = C_SKY
  ctx.fillRect(0, 0, cssW, wy(GROUND_Y))

  if (cityStrip) {
    // Parallax at 30% of world speed. Static under reduced-motion — a scrolling backdrop is
    // the vestibular offender here, not the buildings, which are the game.
    const parallax = reducedMotion ? 0 : (t * cfg.scrollSpeed * 0.3 * scale) % cityStripW
    const bandY = wy(GROUND_Y) - cityStrip.height
    let x = -parallax
    while (x < cssW) {
      ctx.drawImage(cityStrip, x, bandY)
      x += cityStrip.width
    }
    // Atmospheric veil: pushes the skyline back so the obstacle towers read as the only solid
    // things on screen. Without it the two are the same tan and the obstacles vanish into the
    // scenery, which is exactly as unfair as it sounds.
    ctx.fillStyle = BACKDROP_VEIL
    ctx.fillRect(0, bandY, cssW, cityStrip.height)
  }

  // Gameplay is clipped to the world rect while sky/skyline/street stay full-bleed. Without
  // the clip, a wide viewport shows towers popping into existence at an invisible boundary
  // mid-screen; with it (plus the margin scrim below) the play column reads as a deliberate
  // portrait screen inside the page.
  ctx.save()
  ctx.beginPath()
  ctx.rect(wx(0), 0, WORLD_W * scale, cssH)
  ctx.clip()

  // Buildings within view.
  ensurePipes(pipesBuilt + 4)
  for (let n = 1; n <= pipesBuilt; n++) {
    const speed = speedForPipe(n)
    const cx = BIRD_X + (arrivals[n - 1] - t) * speed
    if (cx < -PIPE_W) continue
    if (cx > WORLD_W + PIPE_W + 40) break
    drawBuilding(cx, gapCentres[n - 1])
  }
  if (pipesBuilt < 4 || arrivals[pipesBuilt - 1] - t < 6) ensurePipes(pipesBuilt + 4)

  // Street.
  const streetTop = wy(GROUND_Y)
  ctx.fillStyle = C_STREET_TOP
  ctx.fillRect(0, streetTop, cssW, Math.max(2, 8 * scale))
  ctx.fillStyle = C_STREET
  ctx.fillRect(0, streetTop + Math.max(2, 8 * scale), cssW, cssH - streetTop)

  // The girl. Rotation tracks vertical velocity, which reads as diving/climbing.
  const y = yAt(t)
  if (spriteImg?.complete && spriteImg.naturalWidth) {
    const h = BIRD_H * 2.9 * scale
    const w = h * (spriteImg.naturalWidth / spriteImg.naturalHeight)
    const tilt = reducedMotion ? 0 : Math.max(-0.5, Math.min(0.9, vAt(t) / 1400))
    ctx.save()
    ctx.translate(wx(BIRD_X), wy(y))
    ctx.rotate(tilt)
    ctx.drawImage(spriteImg, -w / 2, -h / 2, w, h)
    ctx.restore()
  }

  ctx.restore() // end gameplay clip

  // Dim whatever falls outside the play column so the eye settles on it.
  const playLeft = wx(0)
  const playRight = wx(WORLD_W)
  if (playLeft > 0.5 || playRight < cssW - 0.5) {
    ctx.fillStyle = LETTERBOX_SCRIM
    ctx.fillRect(0, 0, playLeft, cssH)
    ctx.fillRect(playRight, 0, cssW - playRight, cssH)
  }

  // Score, drawn in world units so it occupies the same fraction of the play area on every
  // device instead of shrinking to an unreadable DOM label on a phone.
  const fontPx = Math.round(58 * scale)
  ctx.font = `700 ${fontPx}px system-ui, -apple-system, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineWidth = Math.max(2, 5 * scale)
  ctx.strokeStyle = C_SCORE_STROKE
  ctx.fillStyle = C_SCORE
  const sx = wx(WORLD_W / 2)
  const sy = wy(56)
  ctx.strokeText(String(score.value), sx, sy)
  ctx.fillText(String(score.value), sx, sy)
}

// ─── Loop ────────────────────────────────────────────────────────────────────────────────
function now() { return performance.now() }

function gameTime() {
  return (now() - gameStartPerf - pausedMs) / 1000
}

function loop() {
  rafId = null
  if (!running) return

  const perf = now()
  const gap = perf - lastFramePerf
  // A stall is credited as paused time rather than integrated. Because flap timestamps are
  // written on the same pause-adjusted clock, the server's replay never sees the gap at all.
  if (gap > MAX_FRAME_GAP_MS) pausedMs += gap - 16
  lastFramePerf = perf

  const t = gameTime()

  if (uiState.value === 'playing' && !ending) {
    score.value = scoreAt(t)
    if (score.value - announcedAt >= 5) {
      announcedAt = score.value
      liveMessage.value = `${score.value} buildings passed`
    }
    if (collidedAt(t)) {
      endGame()
      return
    }
  }

  renderFrame(t)
  rafId = requestAnimationFrame(loop)
}

function startLoop() {
  if (rafId === null && running) {
    lastFramePerf = now()
    rafId = requestAnimationFrame(loop)
  }
}

// ─── Input ───────────────────────────────────────────────────────────────────────────────
function flap() {
  if (uiState.value === 'ready') {
    uiState.value = 'playing'
    gameStartPerf = now()
    pausedMs = 0
    lastFramePerf = gameStartPerf
  }
  if (uiState.value !== 'playing' || ending) return
  if (flaps.length >= MAX_FLAPS) return

  const ms = Math.round(gameTime() * 1000)
  // Dropped rather than nudged: shifting the timestamp would place the flap at a different
  // world time than the player felt, and the local prediction would drift from the replay.
  if (flaps.length && ms - flaps[flaps.length - 1] < MIN_FLAP_GAP_MS) return
  if (flaps.length && ms <= flaps[flaps.length - 1]) return

  flaps.push(ms)
  rebuildSegments()
  playFlapSound()
}

function onPointerDown(e) {
  // A second thumb landing must not double-flap.
  if (e.isPrimary === false) return
  e.preventDefault()
  unlockAudio()
  canvas.value?.focus?.({ preventScroll: true })
  flap()
}

function onKeyDown(e) {
  if (e.key !== ' ' && e.key !== 'Spacebar' && e.key !== 'ArrowUp') return
  // The keypress that activated "Play" would otherwise land as the first flap.
  if (awaitingKeyUp) { e.preventDefault(); return }
  e.preventDefault() // or the page scrolls under the canvas on every flap
  if (uiState.value !== 'ready' && uiState.value !== 'playing') return
  unlockAudio()
  flap()
}

function onKeyUp(e) {
  if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'ArrowUp') awaitingKeyUp = false
}

// ─── Audio ───────────────────────────────────────────────────────────────────────────────
// Synthesized rather than sampled: no binary assets to commit, and nothing to license.
function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
      masterGain = audioCtx.createGain()
      masterGain.gain.value = muted.value ? 0 : 0.25
      masterGain.connect(audioCtx.destination)
    }
    // iOS requires the resume to happen in the same task as the gesture, which is why this is
    // called synchronously from the pointerdown handler and never from onMounted.
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch {}
}

function tone(freq, endFreq, duration, type = 'square') {
  if (!audioCtx || muted.value) return
  try {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = type
    const t0 = audioCtx.currentTime
    osc.frequency.setValueAtTime(freq, t0)
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration)
    gain.gain.setValueAtTime(0.9, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.connect(gain)
    gain.connect(masterGain)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  } catch {}
}

function playFlapSound() { tone(520, 780, 0.09) }
function playCrashSound() { tone(320, 60, 0.34, 'sawtooth') }

function toggleMute() {
  muted.value = !muted.value
  if (masterGain) masterGain.gain.value = muted.value ? 0 : 0.25
  try { localStorage.setItem('flappy:muted', muted.value ? '1' : '0') } catch {}
}

// ─── Page scroll lock (pull-to-refresh) ──────────────────────────────────────────────────
// The DOCUMENT scrolls on mobile in this layout, so overscroll-behavior on an inner element
// does nothing: a few pixels of downward drift during a flap flurry triggers pull-to-refresh
// and reloads the page mid-run, burning the play.
let savedScrollY = 0
function lockPageScroll() {
  savedScrollY = window.scrollY || 0
  document.body.style.position = 'fixed'
  document.body.style.top = `-${savedScrollY}px`
  document.body.style.width = '100%'
  document.documentElement.style.overscrollBehaviorY = 'none'
}
function unlockPageScroll() {
  document.body.style.position = ''
  document.body.style.top = ''
  document.body.style.width = ''
  document.documentElement.style.overscrollBehaviorY = ''
  window.scrollTo(0, savedScrollY)
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────
function showToast(msg) {
  toast.value = msg
  setTimeout(() => { toast.value = null }, 4000)
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function pickCharacter(id) {
  character.value = id
  try { localStorage.setItem('flappy:character', id) } catch {}
}

async function fetchStatus() {
  const data = await $fetch('/api/game/flappypowerpuff/status')
  playsLeft.value = data.playsLeft
  playsPerPeriod.value = data.config.playsPerPeriod
  playsResetAt.value = data.playsResetAt
  allTimeHigh.value = data.allTimeHigh
  sprites.value = data.sprites
  return data
}

async function startGame() {
  if (starting.value) return
  starting.value = true
  try {
    const data = await $fetch('/api/game/flappypowerpuff/start', { method: 'POST' })
    cfg = data.config
    seedHash = hashSeed(data.pipeSeed)
    isRanked.value = data.ranked
    playsLeft.value = data.playsLeft

    flaps = []
    arrivals = []
    gapCentres = []
    pipesBuilt = 0
    score.value = 0
    announcedAt = 0
    ending = false
    showGameOver.value = false
    rebuildSegments()
    ensurePipes(8)

    // Decode before the first frame: the first drawImage of an undecoded image is a
    // synchronous main-thread decode, and it would land exactly as the player starts.
    const [sprite, city] = await Promise.all([
      loadImage(sprites.value[character.value]),
      cityImg ? Promise.resolve(cityImg) : loadImage(sprites.value.city)
    ])
    spriteImg = sprite
    cityImg = city
    try { await spriteImg?.decode?.() } catch {}

    uiState.value = 'ready'
    await nextTick()
    measurePlayHeight()
    await nextTick()
    resizeCanvas()
    lockPageScroll()

    running = true
    gameStartPerf = now()
    pausedMs = 0
    startLoop()
    canvas.value?.focus?.({ preventScroll: true })
  } catch (err) {
    showToast(err?.data?.statusMessage || err?.statusMessage || 'Could not start the game. Try again.')
  } finally {
    starting.value = false
  }
}

async function endGame() {
  if (ending) return
  ending = true
  running = false
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  playCrashSound()
  unlockPageScroll()

  const localScore = score.value
  finalScore.value = localScore
  pointsAwarded.value = 0
  pointsError.value = false
  uiState.value = 'over'
  showGameOver.value = true
  // The card mounts under a thumb that is mid-flurry at ~3 taps/sec. Without this, the taps
  // that killed the player dismiss the card or fire Play Again before they've read it.
  gameOverLocked.value = true
  setTimeout(() => { gameOverLocked.value = false }, GAME_OVER_LOCK_MS)

  try {
    const res = await $fetch('/api/game/flappypowerpuff/end', {
      method: 'POST',
      body: { flapLog: flaps, character: character.value }
    })
    if (res.ranked) {
      finalScore.value = res.score
      pointsAwarded.value = res.pointsAwarded
      pointsError.value = !!res.pointsError
      allTimeHigh.value = Math.max(allTimeHigh.value, res.score)
      // If these ever diverge the player watched one number and was told another, which reads
      // as a rigged game. It should be impossible; surface it rather than swallow it.
      if (typeof res.score === 'number' && localScore - res.score > 1) {
        console.warn(`[flappy] score mismatch: client=${localScore} server=${res.score}`)
      }
    }
    liveMessage.value = `Run over. ${finalScore.value} buildings passed.`
  } catch (err) {
    showToast(err?.data?.statusMessage || 'Could not save that run.')
  }

  try { await fetchStatus() } catch {}
}

function backToSelect() {
  showGameOver.value = false
  uiState.value = 'select'
}

function onVisibility() {
  if (document.hidden) {
    if (running && pauseBeganAt === null) {
      pauseBeganAt = now()
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    }
    try { audioCtx?.suspend?.() } catch {}
  } else {
    if (pauseBeganAt !== null) {
      pausedMs += now() - pauseBeganAt
      pauseBeganAt = null
      startLoop()
    }
    if (!muted.value) { try { audioCtx?.resume?.() } catch {} }
  }
}

let orientationHandler = null

onMounted(async () => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  try {
    const saved = localStorage.getItem('flappy:character')
    if (saved && CHARACTERS.some(c => c.id === saved)) character.value = saved
    muted.value = localStorage.getItem('flappy:muted') !== '0'
  } catch {}

  try {
    await fetchStatus()
    uiState.value = 'select'
  } catch (err) {
    uiState.value = 'select'
    showToast('Could not load your play count.')
  }

  measurePlayHeight()
  // Only on orientation change, never on every resize: the URL bar collapsing fires resize on
  // nearly every scroll pixel, and each canvas resize reallocates and clears the backbuffer.
  orientationHandler = () => {
    measurePlayHeight()
    nextTick(() => resizeCanvas())
  }
  window.addEventListener('orientationchange', orientationHandler)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  awaitingKeyUp = true
})

onBeforeUnmount(() => {
  running = false
  if (rafId !== null) cancelAnimationFrame(rafId)
  unlockPageScroll()
  if (orientationHandler) window.removeEventListener('orientationchange', orientationHandler)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  try { audioCtx?.close?.() } catch {}
})
</script>

<style scoped>
.flappy-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: var(--play-h);
  box-sizing: border-box;
  color: #e8f4fb;
  /* The whole play region swallows gestures, not just the canvas: a tap landing on the HUD
     should never scroll the page or zoom. */
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.center-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.start-panel {
  width: 100%;
  max-width: 460px;
  background: linear-gradient(180deg, #10344d, #06202f);
  border: 3px solid #2f7fae;
  border-radius: 16px;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.game-title {
  margin: 0 0 6px;
  font-size: clamp(1.6rem, 7vw, 2.3rem);
  font-weight: 800;
  color: #ffd76a;
  text-shadow: 0 3px 0 #8a4a1a;
}

.start-sub { margin: 0 0 14px; font-size: 0.95rem; opacity: 0.9; }
.char-help { margin: 0 0 8px; font-size: 0.85rem; opacity: 0.8; }

.char-row {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 14px;
}

.char-card {
  flex: 1 1 0;
  min-width: 0;
  /* >=44px targets with real spacing, so a thumb can't pick the wrong sister. */
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  color: inherit;
}

.char-card--active {
  border-color: #ffd76a;
  background: rgba(255, 215, 106, 0.14);
}

.char-img {
  width: min(28vw, 104px);
  height: min(28vw, 104px);
  object-fit: contain;
}

/* The three characters differ mainly by colour, so the name is not decoration. */
.char-name { font-size: 0.8rem; font-weight: 700; }

.plays-info {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 0.85rem;
}

.plays-badge {
  background: #1a6e3c;
  border-radius: 999px;
  padding: 3px 10px;
  font-weight: 700;
}

.plays-badge--practice { background: #6b4d1a; }
.reset-text { opacity: 0.75; }
.practice-note { margin: 0 0 12px; font-size: 0.82rem; opacity: 0.85; line-height: 1.4; }

.btn-start {
  width: 100%;
  min-height: 48px;
  margin-top: 4px;
  background: linear-gradient(180deg, #35a7e0, #1c6fa1);
  border: 2px solid #7fd0f5;
  border-radius: 12px;
  color: #fff;
  font-size: 1.05rem;
  font-weight: 800;
  cursor: pointer;
}

.btn-start:disabled { opacity: 0.6; cursor: default; }

.btn-secondary {
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  background: transparent;
  border: 2px solid #4d7f9c;
  border-radius: 12px;
  color: #cfe8f6;
  font-weight: 700;
  cursor: pointer;
}

.btn-howto {
  margin-top: 10px;
  background: none;
  border: none;
  color: #9fd4ef;
  font-size: 0.85rem;
  text-decoration: underline;
  cursor: pointer;
  min-height: 44px;
}

.play-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: var(--play-h);
}

.hud-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  flex-shrink: 0;
  min-height: 34px;
}

.hud-item { display: flex; align-items: baseline; gap: 5px; }
/* Never below 12px: the in-canvas score is the primary readout, but this still has to be
   legible on a phone in daylight. */
.hud-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; }
.hud-value { font-size: 1rem; font-weight: 800; }

.hud-tag {
  font-size: 0.72rem;
  background: #6b4d1a;
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 700;
}

.hud-mute {
  margin-left: auto;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
}

.canvas-container {
  position: relative;
  flex: 1;
  min-height: 260px;
  /* Keep the play surface clear of the iOS home indicator / Android gesture bar. */
  margin-bottom: max(0px, env(safe-area-inset-bottom));
}

.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  outline: none;
}

.tap-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 22%;
  text-align: center;
  font-weight: 800;
  font-size: 1.05rem;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.68);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
           max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  z-index: 60;
}

.modal-card {
  width: 100%;
  max-width: 380px;
  max-height: min(90svh, 560px);
  overflow-y: auto;
  background: linear-gradient(180deg, #10344d, #06202f);
  border: 3px solid #2f7fae;
  border-radius: 16px;
  padding: 20px 18px;
  text-align: center;
}

/* No @click.self dismiss on the game-over card, and no interaction at all until the flurry
   that killed the player has stopped. */
.modal-card--locked { pointer-events: none; }

.modal-title { margin: 0 0 6px; font-size: 1.4rem; font-weight: 800; color: #ffd76a; }
.final-score { margin: 6px 0 0; font-size: 3rem; font-weight: 900; line-height: 1; }
.final-label { margin: 2px 0 10px; font-size: 0.85rem; opacity: 0.8; }
.modal-note { margin: 0 0 10px; font-size: 0.85rem; opacity: 0.9; line-height: 1.4; }
.modal-note--good { color: #8ce6a5; font-weight: 700; }
.modal-note--warn { color: #ffc879; }
.modal-actions { margin-top: 8px; }

.howto-list {
  text-align: left;
  margin: 0 0 14px;
  padding-left: 20px;
  font-size: 0.9rem;
  line-height: 1.55;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  background: #7a1f1f;
  border: 2px solid #d97070;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 0.88rem;
  font-weight: 600;
  z-index: 70;
  max-width: min(92vw, 420px);
  text-align: center;
}

.spinner {
  width: 42px;
  height: 42px;
  border: 4px solid rgba(255, 255, 255, 0.25);
  border-top-color: #7fd0f5;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

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

@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
</style>
