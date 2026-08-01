<template>
  <div>
    <NuxtLayout name="newsite-template" :show-adbar="true" :show-nav="true">
      <div class="ast-wrapper">
        <!-- Landscape warning (short viewports only — a tablet in landscape is fine) -->
        <div class="landscape-warning" aria-live="polite">
          <span>Rotate your device to portrait to continue the mission</span>
        </div>

        <!-- Loading -->
        <div v-if="uiState === 'loading'" class="center-content">
          <div class="spinner" aria-label="Loading game…"></div>
        </div>

        <!-- Start screen -->
        <div v-else-if="uiState === 'start'" class="center-content">
          <div class="start-card">
            <p class="start-eyebrow">Kids Next Door presents</p>
            <h1 class="game-title">Operation<br />A.S.T.E.R.O.I.D.</h1>
            <p class="start-expando">
              <span class="ex-letter">A</span>steroid
              <span class="ex-letter">S</span>mashing
              <span class="ex-letter">T</span>reehouse
              <span class="ex-letter">E</span>scort
              <span class="ex-letter">R</span>un
              <span class="ex-letter">O</span>ver
              <span class="ex-letter">I</span>nfinite
              <span class="ex-letter">D</span>ebris
            </p>
            <p class="start-sub">
              Fly the K.N.D. ship through an endless asteroid field. Your cannon fires on its own —
              you steer. Grab power-ups, don't get squashed.
            </p>

            <div class="plays-info">
              <span class="plays-badge" :class="{ 'plays-badge--practice': rankedPlaysLeft === 0 }">
                {{ rankedPlaysLeft > 0
                  ? `${rankedPlaysLeft} ranked run${rankedPlaysLeft !== 1 ? 's' : ''} left`
                  : 'Practice mode' }}
              </span>
              <span class="reset-text">· Resets {{ resetLabel }}</span>
            </div>
            <p class="plays-note">
              Play as much as you like — only your first {{ rankedPlaysPerPeriod }} run{{ rankedPlaysPerPeriod !== 1 ? 's' : '' }}
              each day count for the leaderboard and points.
            </p>

            <button class="btn-start" @click="startGame" :disabled="starting">
              {{ starting ? 'Launching…' : 'Launch' }}
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
        <div v-else-if="uiState === 'playing'" class="game-area" role="main" aria-label="Operation A.S.T.E.R.O.I.D. game board">
          <div class="hud" role="status" aria-live="off">
            <div class="hud-item">
              <span class="hud-label">Score</span>
              <span class="hud-value">{{ hudScore.toLocaleString() }}</span>
            </div>
            <div class="hud-item">
              <span class="hud-label">Lives</span>
              <span class="hud-value hud-lives">
                <span v-for="n in Math.min(hudLives, 5)" :key="n" class="life-pip"></span>
                <span v-if="hudLives > 5" class="life-extra">+{{ hudLives - 5 }}</span>
                <span v-if="hudLives === 0" class="life-none">—</span>
              </span>
            </div>
            <div class="hud-item">
              <span class="hud-label">Wave</span>
              <span class="hud-value">{{ hudWave }}</span>
            </div>
            <div class="hud-item hud-item--mode">
              <span class="hud-label">Mode</span>
              <span class="hud-value" :class="isRanked ? 'mode-ranked' : 'mode-practice'">
                {{ isRanked ? 'RANKED' : 'PRACTICE' }}
              </span>
            </div>
          </div>

          <!-- Active power-up timers -->
          <div class="pu-bar" aria-hidden="true">
            <div v-for="p in activePowerups" :key="p.key" class="pu-chip" :class="`pu-chip--${p.key}`">
              <span class="pu-name">{{ p.label }}</span>
              <span class="pu-meter"><i :style="{ width: p.pct + '%' }"></i></span>
            </div>
          </div>

          <div class="canvas-container" ref="canvasContainer">
            <canvas
              ref="canvas"
              class="game-canvas"
              draggable="false"
              @dragstart.prevent
              @contextmenu.prevent
              aria-label="Asteroid field"
              role="img"
            ></canvas>
          </div>

          <!-- Touch controls. Always rendered so a touchscreen laptop works too; the hint text
               below switches to keyboard wording on pointer-fine devices. -->
          <div class="controls" aria-hidden="false">
            <button
              class="ctrl ctrl--left"
              :class="{ 'ctrl--on': heldMask & IN_LEFT }"
              @pointerdown="onCtrlDown($event, IN_LEFT)"
              @pointerup="onCtrlUp($event, IN_LEFT)"
              @pointercancel="onCtrlUp($event, IN_LEFT)"
              @contextmenu.prevent
              aria-label="Rotate left"
            >◀</button>
            <button
              class="ctrl ctrl--thrust"
              :class="{ 'ctrl--on': heldMask & IN_THRUST }"
              @pointerdown="onCtrlDown($event, IN_THRUST)"
              @pointerup="onCtrlUp($event, IN_THRUST)"
              @pointercancel="onCtrlUp($event, IN_THRUST)"
              @contextmenu.prevent
              aria-label="Thrust"
            >THRUST</button>
            <button
              class="ctrl ctrl--right"
              :class="{ 'ctrl--on': heldMask & IN_RIGHT }"
              @pointerdown="onCtrlDown($event, IN_RIGHT)"
              @pointerup="onCtrlUp($event, IN_RIGHT)"
              @pointercancel="onCtrlUp($event, IN_RIGHT)"
              @contextmenu.prevent
              aria-label="Rotate right"
            >▶</button>
          </div>
          <p class="game-hint">{{ hintText }}</p>
          <p class="sr-only" aria-live="polite">{{ announce }}</p>
        </div>
      </div>
    </NuxtLayout>

    <!-- Game Over -->
    <Teleport to="body">
      <div v-if="uiState === 'gameover'" class="modal-backdrop" @click.self="uiState = 'start'">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="Mission Complete">
          <button class="modal-close" type="button" @click="goToGamesHome" aria-label="Close and return to Games Home">&times;</button>
          <h2 class="modal-title">{{ timeUp ? 'Mission Time Up!' : 'Ship Down!' }}</h2>
          <div class="modal-score-row">
            <span class="modal-score-label">Your Score</span>
            <span class="modal-score-value">{{ finalScore.toLocaleString() }}</span>
            <span class="modal-score-sub">Reached wave {{ finalWave }}</span>
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
          <div v-if="submitError" class="modal-points-notice modal-points-notice--error">
            {{ submitError }}
          </div>
          <div v-else class="modal-points-notice" :class="{ 'modal-points-notice--zero': pointsAwarded === 0 }">
            <template v-if="!wasRanked">Practice run — not scored or ranked</template>
            <template v-else-if="pointsAwarded > 0">+{{ pointsAwarded }} game points earned!</template>
            <template v-else>No game points earned (daily limit reached)</template>
          </div>
          <div class="modal-actions">
            <button class="btn-start" @click="startGame" :disabled="starting">
              {{ rankedPlaysLeft > 0 ? `Play Again (${rankedPlaysLeft} ranked left)` : 'Play Again (practice)' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- How to Play -->
    <Teleport to="body">
      <div v-if="showHowTo" class="modal-backdrop" @click.self="showHowTo = false">
        <div class="modal-card modal-card--howto" role="dialog" aria-modal="true" aria-label="How to Play">
          <h2 class="modal-title">How to Play</h2>
          <ol class="howto-list">
            <li>
              <span class="howto-num">1</span>
              <span>Use <strong>◀</strong> and <strong>▶</strong> to turn, and <strong>THRUST</strong> to accelerate. On a keyboard: arrows or <strong>A</strong>/<strong>D</strong> to turn, <strong>W</strong>/<strong>↑</strong>/<strong>Space</strong> to thrust.</span>
            </li>
            <li>
              <span class="howto-num">2</span>
              <span>Your cannon <strong>fires automatically</strong> — line up the shot by steering.</span>
            </li>
            <li>
              <span class="howto-num">3</span>
              <span>Big asteroids <strong>split into smaller ones</strong>. The small ones are worth the most.</span>
            </li>
            <li>
              <span class="howto-num">4</span>
              <span>Fly off one edge and you come back on the other. Clear every asteroid to advance a wave.</span>
            </li>
            <li>
              <span class="howto-num">5</span>
              <span>Grab power-ups — they <strong>stack</strong>:
                <span class="pu-key pu-key--blue">BLUE</span> doubles your fire rate,
                <span class="pu-key pu-key--red">RED</span> makes you invincible,
                <span class="pu-key pu-key--green">GREEN</span> shrinks your ship to half size.
                Losing a life clears them all.
              </span>
            </li>
            <li>
              <span class="howto-num">6</span>
              <span>Plays are <strong>unlimited</strong>, but only your first few runs each day count for the leaderboard and points.</span>
            </li>
          </ol>
          <div class="modal-actions">
            <button class="btn-start" @click="showHowTo = false">Battle Stations!</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
definePageMeta({ ssr: false })

import {
  WORLD_W, WORLD_H, MS_PER_TICK, TRIG_STEPS,
  IN_LEFT, IN_RIGHT, IN_THRUST,
  PU_BLUE, PU_RED, PU_GREEN,
  createState, step, shipRadius, isInvulnerable, seedFromHex
} from '@/lib/asteroidSim'

// ─── UI state ───────────────────────────────────────────────────────────────────
const uiState  = ref('loading') // loading | start | playing | gameover
const starting = ref(false)
const showHowTo = ref(false)
const announce  = ref('')

const hudScore = ref(0)
const hudLives = ref(3)
const hudWave  = ref(1)
const heldMask = ref(0)
const puPct    = ref([0, 0, 0])

const isRanked    = ref(false)
const wasRanked   = ref(false)
const rankedPlaysLeft = ref(0)
const rankedPlaysPerPeriod = ref(3)
const resetLabel  = ref('')
const finalScore  = ref(0)
const finalWave   = ref(1)
const weekHigh    = ref(0)
const allTimeHigh = ref(0)
const pointsAwarded = ref(0)
const submitError = ref('')
const timeUp      = ref(false)

const canvas = ref(null)
const canvasContainer = ref(null)

const hintText = ref('Tap and hold the buttons to steer — your cannon fires on its own')

const PU_META = [
  { key: 'blue',  label: '2x FIRE',    idx: PU_BLUE },
  { key: 'red',   label: 'INVINCIBLE', idx: PU_RED },
  { key: 'green', label: 'HALF SIZE',  idx: PU_GREEN }
]
const activePowerups = computed(() =>
  PU_META.filter(m => puPct.value[m.idx] > 0).map(m => ({ ...m, pct: puPct.value[m.idx] }))
)

// ─── Non-reactive game internals ────────────────────────────────────────────────
// Deliberately NOT refs: these change 60x/second and pushing them through Vue's reactivity
// would cost more than the simulation itself. The HUD refs above are synced once per frame.
let sim = null
let cfg = null
let runSeedInt = 0
let maxTicks = 18000
let inputLog = []
let currentMask = 0
let rafId = null
let ctx = null
let dpr = 1
let viewScale = 1, viewOffX = 0, viewOffY = 0, cssW = 0, cssH = 0
let lastFrameMs = 0
let tickAccumulator = 0
let paused = false
let ending = false
let reducedMotion = false
let shipImg = null
let shipReady = false
let stars = []
let particles = []
let shakeTicks = 0
const activePointers = new Map() // pointerId -> bit, so multi-touch releases cleanly

const MAX_PARTICLES = 90

// ─── Asteroid silhouettes ───────────────────────────────────────────────────────
// Render-only, so Math.cos/sin are fine here (the determinism contract applies to the
// simulation in utils/asteroidSim.js, never to drawing).
const ASTEROID_SHAPES = (() => {
  const shapes = []
  let s = 12345
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let k = 0; k < 4; k++) {
    const pts = []
    const n = 9 + k
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = 0.74 + rnd() * 0.36
      pts.push([Math.cos(a) * r, Math.sin(a) * r])
    }
    shapes.push(pts)
  }
  return shapes
})()

function buildStars() {
  stars = []
  let s = 987654321
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  for (let i = 0; i < 70; i++) {
    stars.push({ x: rnd() * WORLD_W, y: rnd() * WORLD_H, r: 0.5 + rnd() * 1.4, a: 0.25 + rnd() * 0.55 })
  }
}

// ─── Canvas sizing ──────────────────────────────────────────────────────────────
// The 640x480 world is letterboxed into whatever space we get. The SIMULATION never sees the
// viewport, so a phone and a desktop play byte-identical games — that is what makes the
// server's replay of a phone run valid.
function resizeCanvas() {
  if (!canvas.value || !canvasContainer.value) return
  const rect = canvasContainer.value.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  dpr = Math.min(window.devicePixelRatio || 1, 2) // never rasterize above 2x, even on 3x phones
  canvas.value.width  = Math.round(w * dpr)
  canvas.value.height = Math.round(h * dpr)
  canvas.value.style.width  = `${w}px`
  canvas.value.style.height = `${h}px`
  ctx = canvas.value.getContext('2d', { alpha: false })
  cssW = w; cssH = h
  viewScale = Math.min(w / WORLD_W, h / WORLD_H)
  viewOffX = (w - WORLD_W * viewScale) / 2
  viewOffY = (h - WORLD_H * viewScale) / 2
}

function applyWorldTransform() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // Screen shake is cosmetic only and never touches the simulation.
  let sx = 0, sy = 0
  if (shakeTicks > 0 && !reducedMotion) {
    sx = (Math.random() - 0.5) * shakeTicks * 0.7
    sy = (Math.random() - 0.5) * shakeTicks * 0.7
  }
  ctx.translate(viewOffX + sx, viewOffY + sy)
  ctx.scale(viewScale, viewScale)
}

function headingRadians(h) { return (h / TRIG_STEPS) * Math.PI * 2 }

// ─── Drawing ────────────────────────────────────────────────────────────────────
function draw() {
  if (!ctx || !sim) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#050d22'
  ctx.fillRect(0, 0, cssW, cssH)

  applyWorldTransform()

  // playfield backdrop
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H)
  g.addColorStop(0, '#0b1c46')
  g.addColorStop(1, '#050a1e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, WORLD_W, WORLD_H)

  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < stars.length; i++) {
    const st = stars[i]
    ctx.globalAlpha = st.a
    ctx.fillRect(st.x, st.y, st.r, st.r)
  }
  ctx.globalAlpha = 1

  // asteroids
  ctx.lineJoin = 'round'
  for (let i = 0; i < sim.asteroids.length; i++) {
    const a = sim.asteroids[i]
    const pts = ASTEROID_SHAPES[a.shape % ASTEROID_SHAPES.length]
    const ang = headingRadians(a.rot)
    ctx.save()
    ctx.translate(a.x, a.y)
    ctx.rotate(ang)
    ctx.beginPath()
    for (let p = 0; p < pts.length; p++) {
      const px = pts[p][0] * a.r, py = pts[p][1] * a.r
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = a.tier === 0 ? '#8a7fb5' : a.tier === 1 ? '#9b8fc6' : '#b0a5d6'
    ctx.fill()
    ctx.strokeStyle = '#2b2450'
    ctx.lineWidth = 2.5
    ctx.stroke()
    // crater dimples — cheap depth cue, two arcs only
    ctx.fillStyle = 'rgba(43,36,80,0.35)'
    ctx.beginPath(); ctx.arc(-a.r * 0.25, -a.r * 0.15, a.r * 0.22, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(a.r * 0.3, a.r * 0.25, a.r * 0.14, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // power-ups
  for (let i = 0; i < sim.powerups.length; i++) {
    const p = sim.powerups[i]
    const pulse = 1 + Math.sin(performance.now() / 160) * 0.12
    const color = p.kind === PU_BLUE ? '#31a9ff' : p.kind === PU_RED ? '#ff4d5a' : '#57e06a'
    const glow  = p.kind === PU_BLUE ? 'rgba(49,169,255,0.30)' : p.kind === PU_RED ? 'rgba(255,77,90,0.30)' : 'rgba(87,224,106,0.30)'
    // blink out over the last ~1.5s so a despawn is never a surprise
    ctx.globalAlpha = p.life < 90 && Math.floor(p.life / 6) % 2 === 0 ? 0.35 : 1
    ctx.beginPath(); ctx.arc(p.x, p.y, 19 * pulse, 0, Math.PI * 2)
    ctx.fillStyle = glow; ctx.fill()
    ctx.beginPath(); ctx.arc(p.x, p.y, 11 * pulse, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 11px Nunito, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(p.kind === PU_BLUE ? '2x' : p.kind === PU_RED ? '★' : '½', p.x, p.y + 0.5)
    ctx.globalAlpha = 1
  }

  // bullets
  ctx.fillStyle = '#ffe14d'
  for (let i = 0; i < sim.bullets.length; i++) {
    const b = sim.bullets[i]
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.6, 0, Math.PI * 2); ctx.fill()
  }

  // particles (render-only)
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s)
  }
  ctx.globalAlpha = 1

  // ship
  const s = sim.ship
  if (s.alive) {
    const invuln = isInvulnerable(sim)
    // Flash while invulnerable, but never flash *out* so long that the player loses the ship.
    const blink = invuln && Math.floor(performance.now() / 90) % 2 === 0
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.rotate(headingRadians(s.heading) + Math.PI) // sprite art faces left; +PI aligns it to heading

    if (sim.puTicks[PU_RED] > 0) {
      ctx.beginPath()
      ctx.arc(0, 0, shipRadius(sim) + 9, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,77,90,0.22)'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255,120,130,0.85)'
      ctx.stroke()
    }

    ctx.globalAlpha = blink ? 0.45 : 1
    // Draw the sprite proportional to the (admin-configurable) collision radius, so a retuned
    // hitbox and the art can never disagree. shipRadius() already accounts for Green halving it.
    const size = shipRadius(sim) * 4.8
    if (shipReady) {
      ctx.drawImage(shipImg, -size / 2, -size / 2, size, size)
    } else {
      // Vector fallback so the game is playable even if the sprite fails to load.
      ctx.beginPath()
      ctx.moveTo(size / 2, 0); ctx.lineTo(-size / 2, -size / 3); ctx.lineTo(-size / 3, 0); ctx.lineTo(-size / 2, size / 3)
      ctx.closePath()
      ctx.fillStyle = '#b6a8e0'; ctx.fill()
      ctx.lineWidth = 2; ctx.strokeStyle = '#2b2450'; ctx.stroke()
    }
    ctx.globalAlpha = 1

    if (sim.puTicks[PU_BLUE] > 0) {
      ctx.beginPath()
      ctx.arc(0, 0, shipRadius(sim) + 5, 0, Math.PI * 2)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(49,169,255,0.8)'
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function spawnParticles(x, y, n, color, spread) {
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = 0.6 + Math.random() * spread
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      s: 2 + Math.random() * 3, color, life: 26 + Math.random() * 20, maxLife: 46
    })
  }
}

function updateParticles() {
  let w = 0
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.x += p.vx; p.y += p.vy; p.life--
    if (p.life > 0) particles[w++] = p
  }
  particles.length = w
}

function handleSimEvents() {
  for (let i = 0; i < sim.events.length; i++) {
    const e = sim.events[i]
    if (e.t === 'boom') {
      spawnParticles(e.x, e.y, e.tier === 0 ? 14 : e.tier === 1 ? 10 : 7, '#c9bff0', 2.2)
    } else if (e.t === 'shipboom') {
      spawnParticles(e.x, e.y, 26, '#ffd24d', 3.2)
      shakeTicks = 16
      vibrate([30, 50, 30])
      announce.value = `Ship destroyed. ${sim.lives} live${sim.lives === 1 ? '' : 's'} left.`
    } else if (e.t === 'thrust' && !reducedMotion) {
      const ang = headingRadians(sim.ship.heading) + Math.PI
      spawnParticles(
        sim.ship.x + Math.cos(ang) * 16, sim.ship.y + Math.sin(ang) * 16,
        1, '#ff9d3d', 0.8
      )
    } else if (e.t === 'pickup') {
      vibrate(15)
      announce.value = e.kind === PU_BLUE ? 'Double fire rate!' : e.kind === PU_RED ? 'Invincible!' : 'Half size!'
    } else if (e.t === 'wave') {
      announce.value = `Wave ${e.n}.`
    } else if (e.t === 'life') {
      announce.value = 'Extra life!'
    }
  }
}

function vibrate(pattern) { try { navigator.vibrate?.(pattern) } catch {} }

// ─── Input ──────────────────────────────────────────────────────────────────────
// One log entry per CHANGE of the held mask — holding a button for four seconds is one entry,
// not 240. This is what keeps a five-minute run inside a couple of KB.
function setMask(next) {
  if (next === currentMask || !sim || sim.over) return
  currentMask = next
  heldMask.value = next
  // Record against the NEXT tick to simulate, so the change lands on a tick that hasn't run yet
  // and the server's replay applies it at exactly the same point.
  const t = Math.min(maxTicks, sim.tick + 1)
  const last = inputLog[inputLog.length - 1]
  if (last && last.t === t) last.a = next // collapse two changes inside one tick
  else inputLog.push({ t, a: next })
}

function onCtrlDown(e, bit) {
  if (uiState.value !== 'playing') return
  e.preventDefault()
  // Capture so the release still reaches this button when the finger slides off it mid-press —
  // without this, sliding off a control leaves the ship turning forever.
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  activePointers.set(e.pointerId, bit)
  setMask(currentMask | bit)
}

function onCtrlUp(e, bit) {
  e.preventDefault()
  try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
  activePointers.delete(e.pointerId)
  // Recompute from the surviving pointers rather than just clearing the bit, so holding the
  // same direction with two fingers and lifting one doesn't stop the turn.
  let m = 0
  for (const b of activePointers.values()) m |= b
  m |= keyboardMask
  setMask(m)
}

let keyboardMask = 0
function keyBit(code) {
  if (code === 'ArrowLeft'  || code === 'KeyA') return IN_LEFT
  if (code === 'ArrowRight' || code === 'KeyD') return IN_RIGHT
  if (code === 'ArrowUp'    || code === 'KeyW' || code === 'Space') return IN_THRUST
  return 0
}
function onKeyDown(e) {
  if (uiState.value !== 'playing') return
  const bit = keyBit(e.code)
  if (!bit) return
  e.preventDefault() // stop Space/arrows scrolling the page mid-run
  if (keyboardMask & bit) return
  keyboardMask |= bit
  let m = keyboardMask
  for (const b of activePointers.values()) m |= b
  setMask(m)
}
function onKeyUp(e) {
  const bit = keyBit(e.code)
  if (!bit) return
  keyboardMask &= ~bit
  let m = keyboardMask
  for (const b of activePointers.values()) m |= b
  setMask(m)
}

// Releasing every input on blur/pause prevents a "stuck thrust" when the player alt-tabs or
// takes a call mid-press.
function releaseAllInput() {
  activePointers.clear()
  keyboardMask = 0
  setMask(0)
}

// ─── Game loop ──────────────────────────────────────────────────────────────────
// Fixed 60Hz timestep with an accumulator: rendering can run at any refresh rate, but the
// simulation only ever advances in whole ticks, which is what makes the server's replay match.
function frame(nowMs) {
  rafId = null
  if (!sim || paused || uiState.value !== 'playing') return

  let delta = nowMs - lastFrameMs
  lastFrameMs = nowMs
  // Clamp so a hitch (or a backgrounded tab that rAF resumes from) never fast-forwards the
  // game past the player. Dropped time is simply lost — the run is shorter, never rushed.
  if (delta > 250) delta = MS_PER_TICK
  tickAccumulator += delta

  let steps = 0
  while (tickAccumulator >= MS_PER_TICK && steps < 8 && !sim.over) {
    step(sim, currentMask)
    handleSimEvents()
    tickAccumulator -= MS_PER_TICK
    steps++
    if (sim.tick >= maxTicks) { timeUp.value = true; break }
  }

  updateParticles()
  if (shakeTicks > 0) shakeTicks--

  // Sync the HUD once per frame rather than 60x/sec from inside the sim loop.
  hudScore.value = sim.score
  hudLives.value = sim.lives
  hudWave.value  = sim.wave
  puPct.value = [
    cfg.powerupBlueTicks  ? Math.round((sim.puTicks[PU_BLUE]  / cfg.powerupBlueTicks)  * 100) : 0,
    cfg.powerupRedTicks   ? Math.round((sim.puTicks[PU_RED]   / cfg.powerupRedTicks)   * 100) : 0,
    cfg.powerupGreenTicks ? Math.round((sim.puTicks[PU_GREEN] / cfg.powerupGreenTicks) * 100) : 0
  ]

  draw()

  if (sim.over || sim.tick >= maxTicks) { endGame(); return }
  rafId = requestAnimationFrame(frame)
}

function pauseGame() {
  if (paused || uiState.value !== 'playing') return
  paused = true
  releaseAllInput()
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
}
function resumeGame() {
  if (!paused || uiState.value !== 'playing') return
  paused = false
  lastFrameMs = performance.now()
  tickAccumulator = 0
  if (!rafId) rafId = requestAnimationFrame(frame)
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────
function formatReset(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    .format(new Date(iso))
}

async function fetchStatus() {
  try {
    const data = await $fetch('/api/game/asteroid/status', { credentials: 'include' })
    rankedPlaysLeft.value = data.rankedPlaysLeft
    rankedPlaysPerPeriod.value = data.config?.rankedPlaysPerPeriod ?? 3
    weekHigh.value    = data.weekHigh
    allTimeHigh.value = data.allTimeHigh
    resetLabel.value  = formatReset(data.playsResetAt)
  } catch {
    // A failed status fetch must not block play — the server decides ranked-ness at /start.
  }
  if (uiState.value === 'loading') uiState.value = 'start'
}

function goToGamesHome() { navigateTo('/newsite/games') }

async function startGame() {
  if (starting.value) return
  starting.value = true
  submitError.value = ''
  try {
    const data = await $fetch('/api/game/asteroid/start', { method: 'POST', credentials: 'include' })

    runSeedInt = seedFromHex(data.runSeed)
    cfg = data.config
    maxTicks = data.maxTicks
    isRanked.value = data.ranked
    rankedPlaysLeft.value = data.rankedPlaysLeft
    resetLabel.value = formatReset(data.playsResetAt)

    sim = createState(runSeedInt, cfg)
    inputLog = []
    currentMask = 0
    heldMask.value = 0
    keyboardMask = 0
    activePointers.clear()
    particles = []
    shakeTicks = 0
    ending = false
    paused = false
    timeUp.value = false
    announce.value = ''
    hudScore.value = 0
    hudLives.value = sim.lives
    hudWave.value = sim.wave
    puPct.value = [0, 0, 0]

    uiState.value = 'playing'
    await nextTick()
    resizeCanvas()
    buildStars()
    lastFrameMs = performance.now()
    tickAccumulator = 0
    rafId = requestAnimationFrame(frame)
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Failed to start game'
    submitError.value = msg
    uiState.value = 'start'
    alert(msg)
  } finally {
    starting.value = false
  }
}

async function endGame() {
  if (ending) return
  ending = true
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  releaseAllInput()

  finalScore.value = sim.score
  finalWave.value  = sim.wave
  wasRanked.value  = isRanked.value
  pointsAwarded.value = 0
  submitError.value = ''

  try {
    const result = await $fetch('/api/game/asteroid/end', {
      method: 'POST',
      credentials: 'include',
      body: { inputLog }
    })
    // The server's replay is authoritative — if it disagrees with what we drew, its number wins.
    if (typeof result.score === 'number') finalScore.value = result.score
    if (typeof result.wave === 'number') finalWave.value = result.wave
    pointsAwarded.value = result.pointsAwarded ?? 0
    wasRanked.value = !!result.ranked
    await fetchStatus()
  } catch (err) {
    submitError.value = err?.data?.statusMessage || 'Could not submit your run. Score not recorded.'
  }

  uiState.value = 'gameover'
}

// CSS user-select is the main defence, but a few mobile browsers still begin a selection or a
// drag from a long-press before the style applies. Cancelling the events outright is the
// belt-and-braces: a selection started mid-run swallows the next touch, which can strand a
// control in the "held" state because its pointerup never fires.
function blockSelection(e) {
  if (e.target?.closest?.('.ast-wrapper, .modal-backdrop')) e.preventDefault()
}

let resizeObserver = null
let landscapeMql = null
function onVisibilityChange() { if (document.hidden) pauseGame(); else resumeGame() }
function onLandscapeChange() { if (landscapeMql?.matches) pauseGame(); else resumeGame() }
function onWindowBlur() { pauseGame() }

onMounted(async () => {
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  if (window.matchMedia?.('(pointer: fine)')?.matches) {
    hintText.value = 'Arrows or A/D to turn · W / ↑ / Space to thrust · the cannon fires itself'
  }

  shipImg = new Image()
  shipImg.onload = () => { shipReady = true }
  shipImg.onerror = () => { shipReady = false }
  shipImg.src = '/asteroid/knd-ship.png'

  buildStars()
  await fetchStatus()

  resizeObserver = new ResizeObserver(() => { if (uiState.value === 'playing') resizeCanvas() })
  if (canvasContainer.value) resizeObserver.observe(canvasContainer.value)

  landscapeMql = window.matchMedia('(orientation: landscape) and (max-height: 480px)')
  landscapeMql.addEventListener?.('change', onLandscapeChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('selectstart', blockSelection)
  document.addEventListener('dragstart', blockSelection)
})

// Re-observe the container each time the game view mounts (v-if swaps it out between runs).
watch(uiState, async (v) => {
  if (v === 'playing') {
    await nextTick()
    if (canvasContainer.value && resizeObserver) resizeObserver.observe(canvasContainer.value)
  }
})

onUnmounted(() => {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  resizeObserver?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('selectstart', blockSelection)
  document.removeEventListener('dragstart', blockSelection)
  landscapeMql?.removeEventListener?.('change', onLandscapeChange)
})
</script>

<style scoped>
/* ── Nothing in this game is selectable ────────────────────────────────────────
   A drag across the canvas or a long-press on a control would otherwise start a text
   selection, which on mobile pops the copy/paste callout, hijacks the next touch, and can
   leave a control stuck "held" because its pointerup never arrives. The rules cover the
   modals too: they are Teleported to <body>, but they still carry this component's scope
   attribute, so a scoped selector reaches them.

   `*` here is scoped by Vue to this component's elements only, so no other page is affected. */
.ast-wrapper,
.ast-wrapper *,
.modal-backdrop,
.modal-backdrop * {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  -webkit-touch-callout: none;      /* no iOS long-press callout */
  -webkit-tap-highlight-color: transparent;
}

/* Images and the canvas must not be draggable — dragging the ship sprite out of the page is
   both possible and disruptive by default on desktop. */
.ast-wrapper img,
.ast-wrapper canvas,
.modal-backdrop img {
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
}

/* Buttons: `manipulation` kills the 300ms double-tap-to-zoom gesture without disabling the
   scrolling that the How to Play modal needs. */
.ast-wrapper button,
.modal-backdrop button {
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}

/* The modal body still has to scroll on a short phone, so it keeps pan gestures. */
.modal-card {
  touch-action: pan-y;
}

/* ── Shell ─────────────────────────────────────────────────────────────────── */
.ast-wrapper {
  width: 100%;
  /* The newsite layout gives .main-content a fixed 682px box on desktop but height:auto on
     mobile, so the game has to state its own height there or it collapses. */
  height: 100%;
  min-height: min(74dvh, 560px);
  display: flex;
  flex-direction: column;
  position: relative;
  background: #050d22;
  overflow: hidden;
}

.landscape-warning {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(5, 13, 34, 0.97);
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
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
  flex: 1;
  min-height: 320px;
  padding: 1rem 0;
}

/* ── Start card ────────────────────────────────────────────────────────────── */
.start-card {
  background: linear-gradient(160deg, rgba(24, 22, 74, 0.97), rgba(10, 14, 46, 0.97));
  border: 2px solid #4b3fa8;
  border-radius: 14px;
  padding: 1.6rem 1.5rem;
  text-align: center;
  max-width: 380px;
  width: 92%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.08);
}

.start-eyebrow {
  font-size: 0.62rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #ffd24d;
  margin: 0 0 0.35rem;
  font-weight: 800;
}

.game-title {
  font-size: clamp(1.5rem, 6.5vw, 2.2rem);
  font-weight: 900;
  line-height: 1.05;
  letter-spacing: 0.02em;
  margin: 0 0 0.5rem;
  color: #fff;
  text-shadow: 0 2px 0 #2b2062, 0 4px 12px rgba(120, 90, 255, 0.6);
}

.start-expando {
  font-size: 0.6rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.5);
  margin: 0 0 0.9rem;
  line-height: 1.5;
}
.ex-letter { color: #ffd24d; font-weight: 900; }

.start-sub {
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.85rem;
  line-height: 1.45;
  margin: 0 0 1rem;
}

.plays-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin-bottom: 0.35rem;
}

.plays-badge {
  background: rgba(87, 224, 106, 0.16);
  border: 1px solid rgba(87, 224, 106, 0.45);
  color: #7ff08d;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
}
.plays-badge--practice {
  background: rgba(255, 210, 77, 0.14);
  border-color: rgba(255, 210, 77, 0.45);
  color: #ffd24d;
}

.reset-text { color: rgba(255,255,255,0.4); font-size: 0.72rem; }

.plays-note {
  color: rgba(255,255,255,0.42);
  font-size: 0.7rem;
  line-height: 1.4;
  margin: 0 0 1.15rem;
}

.btn-start {
  background: linear-gradient(180deg, #ffd24d, #f0a021);
  color: #2b2062;
  font-weight: 900;
  font-size: 1rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: none;
  border-bottom: 4px solid #b96f10;
  border-radius: 10px;
  padding: 0.7rem 2.2rem;
  cursor: pointer;
  transition: filter 0.15s, transform 0.08s;
  min-width: 150px;
}
.btn-start:hover { filter: brightness(1.08); }
.btn-start:active { transform: translateY(2px); border-bottom-width: 2px; }
.btn-start:disabled { opacity: 0.55; cursor: not-allowed; }

.btn-howto {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.85rem;
  background: transparent;
  color: rgba(255,255,255,0.6);
  font-weight: 700;
  font-size: 0.78rem;
  border: none;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
}
.btn-howto:hover { color: #ffd24d; }
.howto-icon { flex-shrink: 0; }

.spinner {
  width: 40px; height: 40px;
  border: 3px solid rgba(255,255,255,0.12);
  border-top-color: #ffd24d;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Game area ─────────────────────────────────────────────────────────────── */
.game-area {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #050d22;
  overscroll-behavior: contain;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  /* Stops the browser turning drags on the controls into page scrolls or pinch-zooms. */
  touch-action: none;
}

.hud {
  display: flex;
  justify-content: center;
  gap: 5px;
  padding: 5px 6px;
  background: rgba(10, 14, 46, 0.9);
  border-bottom: 2px solid #4b3fa8;
  flex-shrink: 0;
}

.hud-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 3px 9px;
  min-width: 54px;
}

.hud-label {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.42);
  line-height: 1;
}

.hud-value {
  font-size: 0.88rem;
  font-weight: 800;
  color: #fff;
  line-height: 1.25;
}

.hud-lives { display: flex; align-items: center; gap: 3px; }
.life-pip {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #ffd24d;
  box-shadow: 0 0 5px rgba(255,210,77,0.8);
}
.life-extra { font-size: 0.66rem; color: #ffd24d; }
.life-none  { color: rgba(255,255,255,0.3); }

.mode-ranked   { color: #7ff08d; font-size: 0.66rem; letter-spacing: 0.06em; }
.mode-practice { color: #ffd24d; font-size: 0.66rem; letter-spacing: 0.06em; }

/* Power-up timers */
.pu-bar {
  display: flex;
  justify-content: center;
  gap: 5px;
  min-height: 20px;
  padding: 2px 6px;
  flex-shrink: 0;
  background: rgba(10, 14, 46, 0.6);
}

.pu-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid currentColor;
  min-width: 62px;
}
.pu-chip--blue  { color: #31a9ff; }
.pu-chip--red   { color: #ff4d5a; }
.pu-chip--green { color: #57e06a; }

.pu-name { font-size: 0.5rem; font-weight: 900; letter-spacing: 0.07em; line-height: 1; }
.pu-meter {
  display: block;
  height: 3px;
  background: rgba(255,255,255,0.16);
  border-radius: 2px;
  overflow: hidden;
}
.pu-meter i { display: block; height: 100%; background: currentColor; }

/* Canvas */
.canvas-container {
  flex: 1;
  width: 100%;
  position: relative;
  overflow: hidden;
  min-height: 150px;
}

.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* Touch controls */
.controls {
  display: flex;
  gap: 7px;
  padding: 7px 8px 4px;
  flex-shrink: 0;
}

/* Two classes deep on purpose: this must outrank the `.ast-wrapper button` rule above, which
   sets touch-action: manipulation. The controls need `none` — `manipulation` still permits
   panning, so dragging a control would scroll the page mid-run. */
.controls .ctrl {
  flex: 1;
  /* Comfortably above the 44px minimum touch target, and short enough to leave the board
     the majority of a phone's vertical space. */
  min-height: 54px;
  border: none;
  border-bottom: 4px solid #2b2062;
  border-radius: 10px;
  background: linear-gradient(180deg, #6a5cc9, #4b3fa8);
  color: #fff;
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: filter 0.1s;
}
.controls .ctrl--thrust { flex: 1.5; font-size: 0.82rem; background: linear-gradient(180deg, #ff9d3d, #e8761a); border-bottom-color: #9c4a08; }
.controls .ctrl--on { filter: brightness(1.3); transform: translateY(2px); border-bottom-width: 2px; }

.game-hint {
  flex-shrink: 0;
  text-align: center;
  color: rgba(255,255,255,0.34);
  font-size: 0.66rem;
  padding: 0 8px 5px;
  margin: 0;
}

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Modals ────────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  backdrop-filter: blur(4px);
}

.modal-card {
  position: relative;
  background: linear-gradient(160deg, rgba(24, 22, 74, 0.98), rgba(10, 14, 46, 0.98));
  border: 2px solid #4b3fa8;
  border-radius: 16px;
  padding: 1.75rem;
  width: 100%;
  max-width: 370px;
  max-height: min(90dvh, 560px);
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0,0,0,0.7);
  text-align: center;
}

.modal-close {
  position: absolute;
  top: 0.7rem; right: 0.7rem;
  width: 32px; height: 32px;
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
}
.modal-close:hover, .modal-close:focus-visible { background: rgba(255,255,255,0.18); color: #fff; }

.modal-title {
  font-size: 1.4rem;
  font-weight: 900;
  color: #ffd24d;
  margin: 0 0 1.1rem;
  text-shadow: 0 2px 0 #2b2062;
  letter-spacing: 0.02em;
}

.modal-score-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  margin-bottom: 1.1rem;
}
.modal-score-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.11em;
  color: rgba(255,255,255,0.48);
}
.modal-score-value { font-size: 2.7rem; font-weight: 900; color: #fff; line-height: 1; }
.modal-score-sub { font-size: 0.72rem; color: rgba(255,255,255,0.45); }

.modal-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 0 0 1.1rem; }
.modal-leaderboard { margin-bottom: 0.9rem; }

.modal-lb-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.45rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.modal-lb-row:last-child { border-bottom: none; }
.modal-lb-label { font-size: 0.78rem; color: rgba(255,255,255,0.6); }
.modal-lb-value { font-size: 0.95rem; font-weight: 800; color: #fff; }

.modal-points-notice {
  font-size: 0.82rem;
  font-weight: 700;
  color: #7ff08d;
  background: rgba(87, 224, 106, 0.1);
  border: 1px solid rgba(87, 224, 106, 0.25);
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  margin-bottom: 1.1rem;
}
.modal-points-notice--zero {
  color: rgba(255,255,255,0.45);
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.1);
}
.modal-points-notice--error {
  color: #ff8f99;
  background: rgba(255, 77, 90, 0.1);
  border-color: rgba(255, 77, 90, 0.3);
}

.modal-actions { display: flex; justify-content: center; }

.modal-card--howto { text-align: left; }
.howto-list {
  list-style: none;
  margin: 0 0 1.15rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.howto-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  color: rgba(255,255,255,0.8);
  font-size: 0.85rem;
  line-height: 1.45;
}
.howto-list strong { color: #fff; font-weight: 800; }
.howto-num {
  flex-shrink: 0;
  width: 21px; height: 21px;
  border-radius: 50%;
  background: linear-gradient(180deg, #ffd24d, #f0a021);
  color: #2b2062;
  font-size: 0.72rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.pu-key {
  font-weight: 900;
  font-size: 0.72rem;
  padding: 0 4px;
  border-radius: 3px;
}
.pu-key--blue  { color: #31a9ff; background: rgba(49,169,255,0.14); }
.pu-key--red   { color: #ff4d5a; background: rgba(255,77,90,0.14); }
.pu-key--green { color: #57e06a; background: rgba(87,224,106,0.14); }

@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}

/* Give the board more of the screen on very short viewports. */
@media (max-height: 620px) {
  .controls .ctrl { min-height: 46px; }
  .game-hint { display: none; }
}
</style>
