<template>
  <div>
    <NuxtLayout name="newsite-template" :show-adbar="true" :show-nav="true">
      <div class="fs-wrapper">
        <!-- Landscape warning (short viewports only — a tablet in landscape is fine) -->
        <div class="landscape-warning" aria-live="polite">
          <span>Turn your device upright to face the fruit</span>
        </div>

        <!-- Loading -->
        <div v-if="uiState === 'loading'" class="center-content">
          <div class="spinner" aria-label="Loading game…"></div>
        </div>

        <!-- Start screen -->
        <div v-else-if="uiState === 'start'" class="center-content">
          <div class="start-card">
            <h1 class="game-title">Fruit<br />Samurai</h1>
            <p class="start-sub">
              Jack's blade is drawn. Swipe to cut the fruit before it falls — three escape you
              and the run is over. Slice several in one stroke for far more than they are worth
              apart.
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

            <div class="high-row">
              <div class="high-item"><span class="high-label">Your best</span><span class="high-value">{{ allTimeHigh.toLocaleString() }}</span></div>
              <div class="high-item"><span class="high-label">This week</span><span class="high-value">{{ weekHigh.toLocaleString() }}</span></div>
            </div>

            <button class="btn-start" @click="startGame" :disabled="starting">
              {{ starting ? 'Drawing the blade…' : 'Begin' }}
            </button>
            <button class="btn-howto" @click="showHowTo = true" aria-label="How to play">
              <svg class="howto-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
                <path d="M9.1 9a3 3 0 1 1 4.4 3c-.9.6-1.5 1-1.5 2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <circle cx="12" cy="17.4" r="1.2" fill="currentColor" />
              </svg>
              <span>How to Play</span>
            </button>
            <p v-if="startError" class="err-text">{{ startError }}</p>
          </div>
        </div>

        <!-- Active game -->
        <div v-else-if="uiState === 'playing'" class="game-area" role="main" aria-label="Fruit Samurai game board">
          <div class="hud" role="status" aria-live="off">
            <div class="hud-item">
              <span class="hud-label">Score</span>
              <span class="hud-value">{{ hudScore.toLocaleString() }}</span>
            </div>
            <div class="hud-item">
              <span class="hud-label">Lives</span>
              <span class="hud-value hud-lives">
                <span v-for="n in hudLives" :key="n" class="life-pip"></span>
                <span v-if="hudLives === 0" class="life-none">—</span>
              </span>
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
            <div v-if="piggyTicksLeft > 0" class="pu-chip pu-chip--piggy">
              <span class="pu-name">{{ piggyMultiplier }}× POINTS</span>
              <span class="pu-time">{{ Math.ceil(piggyTicksLeft / 60) }}s</span>
            </div>
            <div v-if="hourglassTicksLeft > 0" class="pu-chip pu-chip--hourglass">
              <span class="pu-name">SLOW</span>
              <span class="pu-time">{{ Math.ceil(hourglassTicksLeft / 60) }}s</span>
            </div>
            <div v-if="fuseCount > 0" class="pu-chip pu-chip--dynamite">
              <span class="pu-name">FUSE LIT</span>
            </div>
          </div>

          <div ref="stageEl" class="stage">
            <canvas
              ref="canvasEl"
              class="board"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
              @contextmenu.prevent
            ></canvas>

            <!-- Jack's commentary.
                 pointer-events:none is load-bearing, not decoration: this sits over the play
                 surface, and without it the bubble would swallow the start of a swipe. It is
                 also positioned in the lower band beside Jack rather than over the fruit. -->
            <transition name="bubble">
              <div v-if="jackLine" class="jack-bubble" aria-live="polite">{{ jackLine }}</div>
            </transition>

            <div v-if="paused" class="pause-overlay">
              <span>Paused</span>
            </div>
          </div>
        </div>

        <!-- Game over -->
        <div v-else-if="uiState === 'gameover'" class="center-content">
          <div class="start-card">
            <h2 class="over-title">The last fruit falls</h2>
            <div class="final-score">{{ finalScore.toLocaleString() }}</div>
            <p class="final-line" v-if="finalSlices">
              {{ finalSlices.toLocaleString() }} cut · {{ Math.floor(finalTicks / 60) }}s survived
            </p>
            <p v-if="submitFailed" class="points-line points-line--failed">Run could not be recorded</p>
            <p v-else-if="wasRanked" class="points-line">
              <span v-if="pointsError">Your score is recorded — points could not be awarded just now.</span>
              <span v-else-if="pointsAwarded > 0">+{{ pointsAwarded }} points</span>
              <span v-else>No points left in today's pool</span>
            </p>
            <p v-else class="points-line">Practice run — not scored</p>
            <p v-if="submitError" class="err-text">{{ submitError }}</p>

            <button class="btn-start" @click="startGame" :disabled="starting">
              {{ starting ? 'Drawing the blade…' : 'Again' }}
            </button>
            <NuxtLink to="/newsite/leaderboards" class="btn-howto btn-howto--link">
              <span>Leaderboards</span>
            </NuxtLink>
          </div>
        </div>

        <!-- How to play -->
        <Teleport to="body">
          <div v-if="showHowTo" class="modal-backdrop" @click.self="showHowTo = false">
            <div class="modal-card" role="dialog" aria-modal="true" aria-label="How to play">
              <h3>How to Play</h3>
              <ul>
                <li>Swipe across the fruit to cut it. The blade has to be <em>moving</em> — resting a finger on a fruit does nothing.</li>
                <li>Let three fruit fall past you and the run ends. Missing a power-up costs nothing.</li>
                <li>Cut three or more in a single unbroken stroke for a combo bonus that grows with every extra fruit. Grouping your cuts is worth far more than taking them one at a time.</li>
              </ul>
              <h4>Power-ups</h4>
              <ul>
                <li><strong>Piggy bank</strong> — {{ piggyMultiplier }}× points for a while.</li>
                <li><strong>Hourglass</strong> — the world slows down. Your hand does not.</li>
                <li><strong>Dynamite</strong> — lights a fuse, then destroys every fruit on screen at a bonus rate. Cut it when the screen is <em>full</em>, not when it's empty.</li>
              </ul>
              <button class="btn-start btn-start--small" @click="showHowTo = false">Got it</button>
            </div>
          </div>
        </Teleport>
      </div>
    </NuxtLayout>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  WORLD_W,
  WORLD_H,
  FP_SHIFT,
  TICK_HZ,
  K_FRUIT,
  K_PIGGY,
  K_HOURGLASS,
  K_DYNAMITE,
  FRUIT_TYPES,
  createState,
  createSegmentFeeder,
  clampSampleX,
  clampSampleY,
  hashSeed,
  step
} from '~/lib/fruitSamuraiSim.js'

// ssr: false to match the other canvas game — the whole page is a render loop against a
// canvas sized from the real viewport, so there is nothing worth rendering on the server.
definePageMeta({ middleware: 'newsite', ssr: false })

const MS_PER_TICK = 1000 / TICK_HZ

const uiState = ref('loading')
const showHowTo = ref(false)
const starting = ref(false)
const startError = ref('')
const submitError = ref('')
const paused = ref(false)

const rankedPlaysLeft = ref(0)
const rankedPlaysPerPeriod = ref(3)
const allTimeHigh = ref(0)
const weekHigh = ref(0)
const playsResetAt = ref(null)
const isRanked = ref(false)

const hudScore = ref(0)
const hudLives = ref(3)
const piggyTicksLeft = ref(0)
const hourglassTicksLeft = ref(0)
const fuseCount = ref(0)
const piggyMultiplier = ref(2)

const finalScore = ref(0)
const finalTicks = ref(0)
const finalSlices = ref(0)
const pointsAwarded = ref(0)
const pointsError = ref(false)
const wasRanked = ref(false)
// Distinct from `wasRanked === false`. A rejected submission used to fall through to the
// practice branch and tell the player "Practice run — not scored", which was simply untrue:
// the run was ranked, the attempt was spent, and the score was lost.
const submitFailed = ref(false)

const jackLine = ref('')

const stageEl = ref(null)
const canvasEl = ref(null)

// ── Jack's commentary ─────────────────────────────────────────────────────────────────────
// Original lines written in his cadence — terse, formal, unhurried — rather than dialogue
// lifted from the show. Presentation only: nothing here is read by the simulation, so the
// server never knows (or needs to know) that Jack said anything.
const JACK_LINES = {
  start: ['The fruit falls. My blade answers.', 'I am ready.'],
  combo: ['Swift.', 'Precise.', 'As my father taught me.'],
  bigCombo: ['The blade knows its purpose.', 'One stroke. Many foes.'],
  miss: ['I must not falter.', 'A lapse. It will not repeat.'],
  lastLife: ['One breath remains.'],
  piggy: ['Fortune favors a patient hand.'],
  hourglass: ['Time bends. I do not.'],
  dynamite: ['Stand back.'],
  idle: ['Focus.', 'Patience.', 'The blade waits.']
}

let chatterEnabled = true
let chatterCooldown = 420
let lastChatterTick = -9999
let jackTimer = null

function say (bucket, tick, force = false) {
  if (!chatterEnabled) return
  if (!force && tick - lastChatterTick < chatterCooldown) return
  const pool = JACK_LINES[bucket]
  if (!pool || !pool.length) return
  lastChatterTick = tick
  // Math.random, deliberately: cosmetic randomness must never touch the sim's seeded stream.
  jackLine.value = pool[Math.floor(Math.random() * pool.length)]
  if (jackTimer) clearTimeout(jackTimer)
  jackTimer = setTimeout(() => { jackLine.value = '' }, 2600)
}

// ── Session / sim state ───────────────────────────────────────────────────────────────────
let sim = null
let feeder = null
let strokes = []
let cfg = null
let hourglassScalePct = 45

// Input. A SINGLE active pointer: a second finger is ignored until the first lifts. Two
// simultaneous blades would leave the order they resolve within a tick undefined and would
// double the achievable combo rate for free.
let activePointerId = null
let pointerPos = null // {x, y} in world units, integers
let openStroke = null

let rafId = null
let lastFrameMs = 0
let acc = 0

// Cosmetic only — never seeded from the sim's RNG.
let particles = []
let bladeTrail = []

function msPerTick () {
  if (!sim) return MS_PER_TICK
  // Slow motion is EXACTLY this: the wall-clock spacing between ticks changes, and nothing
  // else does. The sim still advances one integer tick per step, so the server replays the run
  // without ever knowing the hourglass was picked up.
  if (sim.tick <= sim.hourglassUntil) return MS_PER_TICK * 100 / hourglassScalePct
  return MS_PER_TICK
}

const resetLabel = computed(() => {
  if (!playsResetAt.value) return 'daily'
  const d = new Date(playsResetAt.value)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
})

// ── Canvas sizing ─────────────────────────────────────────────────────────────────────────
// The world is a fixed 480x760 rectangle scaled to FIT — never cropped. `contain` semantics,
// so on a wide screen there are bars at the sides and on a tall one bars top and bottom, but
// every player sees exactly the same play area. That equality is the whole point: the visible
// world is the reachable area, so letting it vary by device would put players on measurably
// different games while sharing one leaderboard.
let scale = 1
let dpr = 1

let lastFitW = 0
let lastFitH = 0

function resizeCanvas () {
  const stage = stageEl.value
  const canvas = canvasEl.value
  if (!stage || !canvas) return
  // LAYOUT pixels, deliberately — not getBoundingClientRect().
  //
  // The newsite shell scales the whole UI with a CSS transform, and a transform makes these two
  // disagree: getBoundingClientRect() reports post-transform (visual) pixels while clientWidth
  // reports pre-transform (layout) ones. `style.width` is interpreted in layout pixels and then
  // scaled by that same ancestor transform, so measuring visually and writing layoutwise
  // applied the factor twice and left the board ~9% smaller than the space it was given.
  const layoutW = stage.clientWidth
  const layoutH = stage.clientHeight
  if (layoutW < 2 || layoutH < 2) return
  // Nothing moved — bail before touching canvas.width, which is destructive (it clears the
  // backing store and resets the context state).
  if (layoutW === lastFitW && layoutH === lastFitH) return
  lastFitW = layoutW
  lastFitH = layoutH

  scale = Math.min(layoutW / WORLD_W, layoutH / WORLD_H)
  canvas.style.width = `${Math.round(WORLD_W * scale)}px`
  canvas.style.height = `${Math.round(WORLD_H * scale)}px`

  // The backing store, by contrast, must be sized in the pixels the board actually occupies on
  // screen, so the ancestor transform has to be folded back in here or the canvas renders soft
  // wherever the shell scales the page up.
  const rect = stage.getBoundingClientRect()
  const transform = layoutW > 0 && rect.width > 0 ? rect.width / layoutW : 1
  // Cap at 2x: beyond that the fill-rate cost on a mid-range phone buys nothing visible for
  // flat vector shapes.
  dpr = Math.min((window.devicePixelRatio || 1) * transform, 2)
  canvas.width = Math.max(1, Math.round(WORLD_W * scale * dpr))
  canvas.height = Math.max(1, Math.round(WORLD_H * scale * dpr))
}

function toWorld (ev) {
  const canvas = canvasEl.value
  if (!canvas) return null
  // Derived from the canvas's own on-screen rectangle rather than from `scale`, because a
  // pointer event's clientX/clientY are in visual pixels while `scale` is in layout pixels.
  // Under the shell's CSS transform those differ, and dividing by the wrong one puts every cut
  // slightly away from where the player actually swiped.
  const rect = canvas.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null
  // Clamped into the legal box before it can ever reach the log. The pointer is captured on
  // pointerdown, so following a swipe off the edge of the board — which is completely ordinary
  // play — keeps delivering positions well outside the world, and an unclamped sample there
  // used to fail validation and cost the player the entire run.
  return {
    x: clampSampleX(Math.round((ev.clientX - rect.left) * WORLD_W / rect.width)),
    y: clampSampleY(Math.round((ev.clientY - rect.top) * WORLD_H / rect.height))
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────────────────

function onPointerDown (ev) {
  if (uiState.value !== 'playing' || paused.value) return
  if (activePointerId !== null) return // single active pointer
  activePointerId = ev.pointerId
  try { canvasEl.value?.setPointerCapture(ev.pointerId) } catch {}
  pointerPos = toWorld(ev)
  ev.preventDefault()
}

function onPointerMove (ev) {
  if (ev.pointerId !== activePointerId) return
  pointerPos = toWorld(ev)
  ev.preventDefault()
}

function onPointerUp (ev) {
  if (ev.pointerId !== activePointerId) return
  endStroke()
  activePointerId = null
  pointerPos = null
  try { canvasEl.value?.releasePointerCapture(ev.pointerId) } catch {}
  ev.preventDefault()
}

function endStroke () {
  openStroke = null
}

/**
 * Commit at most ONE sample for the tick that is about to run. Recording here rather than in
 * the pointer handler is deliberate: a sample taken during a frame must be consumed by a tick
 * that has not run yet, so the client and the server test the blade against the same fruit
 * positions. Slicing straight off the pointer event would use each fruit's pre-integration
 * position for that tick while the server used the post-integration one — a one-tick offset,
 * which on a fast fruit is twenty world units and a guaranteed disagreement on close cuts.
 */
function recordSampleFor (tick) {
  if (activePointerId === null || !pointerPos) return
  const x = pointerPos.x
  const y = pointerPos.y
  if (openStroke === null) {
    openStroke = { t: tick, p: [0, x, y] }
    strokes.push(openStroke)
  } else {
    openStroke.p.push(tick - openStroke.t, x, y)
  }
}

// ── Loop ──────────────────────────────────────────────────────────────────────────────────

function frame (now) {
  rafId = requestAnimationFrame(frame)
  if (!sim || sim.over) { render(); return }
  if (paused.value) { lastFrameMs = now; return }

  let delta = now - lastFrameMs
  lastFrameMs = now
  // A long delta means the tab was away or the main thread stalled. Never try to catch up
  // across it — that would fast-forward the world past the player.
  if (delta > 250 || delta < 0) delta = msPerTick()
  acc += delta

  let steps = 0
  // msPerTick() is re-read every iteration, so an hourglass picked up on the first sub-step
  // slows the ones after it in the same frame.
  while (acc >= msPerTick() && steps < 8 && !sim.over) {
    acc -= msPerTick()
    const t = sim.tick + 1
    recordSampleFor(t)
    step(sim, feeder(t))
    steps++
  }

  drainEvents()
  syncHud()
  // Re-fit every frame. ResizeObserver covers most of it, but the stage can settle to its final
  // size through changes it does not reliably deliver before the first frames are drawn — the
  // adbar image loading above the board, a webfont landing, the layout's own min-height giving
  // way to its real height. Missing one of those leaves the board sized for a box that no
  // longer exists. resizeCanvas() early-returns unless the measurement actually changed, so the
  // steady-state cost is one getBoundingClientRect.
  resizeCanvas()
  render()

  if (sim.over) finishRun()
}

function drainEvents () {
  const ev = sim.events
  if (!ev.length) return
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]
    if (e.e === 'slice') {
      spawnBurst(e)
      if (e.kind === K_PIGGY) say('piggy', sim.tick, true)
      else if (e.kind === K_HOURGLASS) say('hourglass', sim.tick, true)
      else if (e.kind === K_DYNAMITE) say('dynamite', sim.tick, true)
      else if (e.combo >= 5) say('bigCombo', sim.tick)
      else if (e.combo >= 3) say('combo', sim.tick)
    } else if (e.e === 'miss') {
      if (e.lives === 1) say('lastLife', sim.tick, true)
      else say('miss', sim.tick, true)
    } else if (e.e === 'boom') {
      for (const c of e.caught) spawnBurst({ id: c.id, typeIdx: c.typeIdx, kind: K_FRUIT, boom: true })
    }
  }
  // Output-only, so draining is safe and keeps memory bounded on a long run.
  ev.length = 0
}

function spawnBurst (e) {
  // Position from the object if it is still around this frame, otherwise skip — a burst with
  // no anchor is not worth guessing at.
  const obj = sim.objects.find(o => o.id === e.id)
  const x = obj ? (obj.x >> FP_SHIFT) : null
  const y = obj ? (obj.y >> FP_SHIFT) : null
  if (x === null) return
  const colour = e.kind === K_FRUIT ? FRUIT_COLOURS[e.typeIdx].juice : '#ffe9a8'
  const n = e.boom ? 14 : 10
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 9,
      vy: (Math.random() - 0.5) * 9 - 2,
      life: 1,
      r: 2 + Math.random() * 4,
      colour
    })
  }
  if (particles.length > 400) particles.splice(0, particles.length - 400)
}

function syncHud () {
  hudScore.value = sim.score
  hudLives.value = Math.max(0, sim.lives)
  piggyTicksLeft.value = Math.max(0, sim.piggyUntil - sim.tick)
  hourglassTicksLeft.value = Math.max(0, sim.hourglassUntil - sim.tick)
  fuseCount.value = sim.fuses.length
}

// ── Rendering ─────────────────────────────────────────────────────────────────────────────
// Everything is drawn procedurally. No fruit sprites to download, no atlas to keep in sync
// with the sim's radii, and it stays crisp at any device pixel ratio.

const FRUIT_COLOURS = [
  { skin: '#2e7d32', flesh: '#e8455f', juice: '#e8455f', seed: '#2b2b2b' }, // watermelon
  { skin: '#d4372f', flesh: '#fdf3dc', juice: '#e86a5f', seed: '#6b4423' }, // apple
  { skin: '#f08a1c', flesh: '#ffc46b', juice: '#f5a623', seed: '#c96a10' }, // orange
  { skin: '#f2cf3f', flesh: '#fff4c9', juice: '#f7e07a', seed: '#c9a227' }, // banana
  { skin: '#e0a92b', flesh: '#ffe9a0', juice: '#f3d15e', seed: '#8a6b1e' }, // pineapple
  { skin: '#d6247a', flesh: '#f6eef5', juice: '#e85fa4', seed: '#2b2b2b' } // dragonfruit
]

let jackImg = null
let bgImg = null

function render () {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.save()
  // Straight from the backing store, so one world unit always maps to the same number of
  // device pixels no matter how the shell has scaled the page.
  const k = canvas.width / WORLD_W
  ctx.setTransform(k, 0, 0, k, 0, 0)

  drawBackground(ctx)
  drawJack(ctx)

  if (sim) {
    for (const o of sim.objects) drawObject(ctx, o)
    drawParticles(ctx)
  }
  drawBlade(ctx)

  ctx.restore()
}

function drawBackground (ctx) {
  if (bgImg && bgImg.complete && bgImg.naturalWidth) {
    ctx.drawImage(bgImg, 0, 0, WORLD_W, WORLD_H)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H)
    g.addColorStop(0, '#1b1033')
    g.addColorStop(0.55, '#3d1f4d')
    g.addColorStop(1, '#8a3b2e')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)
    // A low sun disc, so the backdrop reads as a place rather than a gradient.
    ctx.fillStyle = 'rgba(255, 186, 92, 0.28)'
    ctx.beginPath()
    ctx.arc(WORLD_W * 0.72, WORLD_H * 0.30, 92, 0, Math.PI * 2)
    ctx.fill()
  }
  // Slow-motion wash, so the effect reads instantly without a HUD glance.
  if (sim && sim.tick <= sim.hourglassUntil) {
    ctx.fillStyle = 'rgba(120, 190, 255, 0.13)'
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)
  }
}

function drawJack (ctx) {
  if (!jackImg || !jackImg.complete || !jackImg.naturalWidth) return
  // Anchored bottom-left, drawn BEHIND the fruit, and kept narrow so it never eats play space.
  const h = WORLD_H * 0.42
  const w = h * (jackImg.naturalWidth / jackImg.naturalHeight)
  ctx.globalAlpha = 0.92
  ctx.drawImage(jackImg, 6, WORLD_H - h, w, h)
  ctx.globalAlpha = 1
}

function drawObject (ctx, o) {
  const x = o.x >> FP_SHIFT
  const y = o.y >> FP_SHIFT
  // Cull anything still below the launch line or well off the top.
  if (y - o.r > WORLD_H + 40 || y + o.r < -60) return
  if (o.kind === K_FRUIT) drawFruit(ctx, x, y, o)
  else drawPowerup(ctx, x, y, o)
}

function drawFruit (ctx, x, y, o) {
  const c = FRUIT_COLOURS[o.typeIdx]
  const key = FRUIT_TYPES[o.typeIdx].key
  const r = o.r

  ctx.save()
  ctx.translate(x, y)
  // A slow spin keyed to the object id and its own position, so every fruit tumbles
  // differently without touching the seeded stream.
  ctx.rotate(((o.id * 37) % 360) * Math.PI / 180 + y * 0.004)

  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = c.skin
  ctx.fill()

  if (key === 'watermelon') {
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2)
    ctx.fillStyle = c.flesh
    ctx.fill()
    ctx.fillStyle = c.seed
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.ellipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, 2.4, 3.6, a, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (key === 'orange') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.6
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9)
      ctx.stroke()
    }
  } else if (key === 'apple') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.ellipse(-r * 0.32, -r * 0.34, r * 0.2, r * 0.3, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#5b3a1a'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.9)
    ctx.quadraticCurveTo(r * 0.18, -r * 1.25, r * 0.34, -r * 1.1)
    ctx.stroke()
  } else if (key === 'banana') {
    // Drawn as a crescent inside the same circular hitbox the sim tests.
    ctx.fillStyle = '#0000'
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, r * 0.25, r * 0.98, Math.PI * 1.08, Math.PI * 1.92)
    ctx.arc(0, r * 0.05, r * 0.98, Math.PI * 1.92, Math.PI * 1.08, true)
    ctx.closePath()
    ctx.fillStyle = c.skin
    ctx.fill()
    ctx.strokeStyle = c.seed
    ctx.lineWidth = 1.4
    ctx.stroke()
  } else if (key === 'pineapple') {
    ctx.strokeStyle = 'rgba(120,86,20,0.5)'
    ctx.lineWidth = 1.3
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(-r, i * r * 0.38)
      ctx.lineTo(r, i * r * 0.38 + r * 0.5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-r, i * r * 0.38 + r * 0.5)
      ctx.lineTo(r, i * r * 0.38)
      ctx.stroke()
    }
    ctx.fillStyle = '#3f8f3a'
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath()
      ctx.moveTo(i * r * 0.28, -r * 0.85)
      ctx.lineTo(i * r * 0.28 - r * 0.18, -r * 1.5)
      ctx.lineTo(i * r * 0.28 + r * 0.18, -r * 1.5)
      ctx.closePath()
      ctx.fill()
    }
  } else if (key === 'dragonfruit') {
    ctx.fillStyle = '#5fbf5a'
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      ctx.save()
      ctx.rotate(a)
      ctx.beginPath()
      ctx.moveTo(0, -r * 0.7)
      ctx.lineTo(-r * 0.22, -r * 1.22)
      ctx.lineTo(r * 0.22, -r * 1.05)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
    ctx.fillStyle = c.flesh
    ctx.fill()
    ctx.fillStyle = c.seed
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.26, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}

function drawPowerup (ctx, x, y, o) {
  const r = o.r
  ctx.save()
  ctx.translate(x, y)

  // A halo, so power-ups read as special at a glance in a busy wave.
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.32, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fill()

  if (o.kind === K_PIGGY) {
    ctx.fillStyle = '#f38fb8'
    ctx.beginPath()
    ctx.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(r * 0.78, -r * 0.1, r * 0.3, r * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#c65f8c'
    ctx.beginPath()
    ctx.arc(r * 0.86, -r * 0.1, r * 0.09, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(-r * 0.32, -r * 0.72, r * 0.64, r * 0.14) // coin slot
    ctx.beginPath()
    ctx.moveTo(-r * 0.55, -r * 0.6)
    ctx.lineTo(-r * 0.28, -r * 1.05)
    ctx.lineTo(-r * 0.12, -r * 0.62)
    ctx.closePath()
    ctx.fill()
  } else if (o.kind === K_HOURGLASS) {
    ctx.fillStyle = '#c9962f'
    ctx.fillRect(-r * 0.7, -r * 0.92, r * 1.4, r * 0.2)
    ctx.fillRect(-r * 0.7, r * 0.72, r * 1.4, r * 0.2)
    ctx.beginPath()
    ctx.moveTo(-r * 0.58, -r * 0.72)
    ctx.lineTo(r * 0.58, -r * 0.72)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.fillStyle = '#7fd0ff'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-r * 0.58, r * 0.72)
    ctx.lineTo(r * 0.58, r * 0.72)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.fillStyle = '#4aa8e0'
    ctx.fill()
  } else if (o.kind === K_DYNAMITE) {
    ctx.fillStyle = '#c0392b'
    ctx.fillRect(-r * 0.42, -r * 0.75, r * 0.84, r * 1.5)
    ctx.fillStyle = '#8e2b20'
    ctx.fillRect(-r * 0.42, -r * 0.18, r * 0.84, r * 0.16)
    ctx.strokeStyle = '#e0c088'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.75)
    ctx.quadraticCurveTo(r * 0.5, -r * 1.1, r * 0.34, -r * 1.35)
    ctx.stroke()
    ctx.fillStyle = '#ffd257'
    ctx.beginPath()
    ctx.arc(r * 0.34, -r * 1.38, 3.4, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawParticles (ctx) {
  const next = []
  for (const p of particles) {
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.45
    p.life -= 0.03
    if (p.life <= 0) continue
    ctx.globalAlpha = Math.max(0, p.life)
    ctx.fillStyle = p.colour
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2)
    ctx.fill()
    next.push(p)
  }
  ctx.globalAlpha = 1
  particles = next
}

function drawBlade (ctx) {
  // Drawn from the RECORDED sample log, not from raw pointer events. A smooth 120Hz trail over
  // a coarser sampled polyline would visibly pass through fruit the sim never tested, so the
  // player's eyes would disagree with both the client and the server about what was cut.
  if (openStroke) {
    const p = openStroke.p
    const pts = []
    for (let i = Math.max(0, p.length - 3 * 12); i < p.length; i += 3) pts.push([p[i + 1], p[i + 2]])
    bladeTrail = pts
  } else if (bladeTrail.length) {
    bladeTrail = bladeTrail.slice(1)
  }
  if (bladeTrail.length < 2) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath()
    ctx.moveTo(bladeTrail[0][0], bladeTrail[0][1])
    for (let i = 1; i < bladeTrail.length; i++) ctx.lineTo(bladeTrail[i][0], bladeTrail[i][1])
    ctx.strokeStyle = pass === 0 ? 'rgba(180, 225, 255, 0.35)' : 'rgba(255,255,255,0.95)'
    ctx.lineWidth = pass === 0 ? 14 : 5
    ctx.stroke()
  }
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────────────────

async function fetchStatus () {
  const s = await $fetch('/api/game/fruitsamurai/status')
  rankedPlaysLeft.value = s.playsLeft
  rankedPlaysPerPeriod.value = s.config.playsPerPeriod
  allTimeHigh.value = s.allTimeHigh
  weekHigh.value = s.weekHigh
  playsResetAt.value = s.playsResetAt
  if (s.sprites?.jack) {
    jackImg = new Image()
    jackImg.src = s.sprites.jack
  }
  if (s.sprites?.background) {
    bgImg = new Image()
    bgImg.src = s.sprites.background
  }
}

async function startGame () {
  if (starting.value) return
  starting.value = true
  startError.value = ''
  submitError.value = ''
  try {
    const r = await $fetch('/api/game/fruitsamurai/start', { method: 'POST' })
    cfg = r.config
    hourglassScalePct = r.hourglassScalePercent || 45
    chatterEnabled = r.chatter?.enabled !== false
    chatterCooldown = r.chatter?.cooldownTicks ?? 420
    isRanked.value = !!r.ranked
    rankedPlaysLeft.value = r.playsLeft
    piggyMultiplier.value = cfg.piggyMultiplier

    submitFailed.value = false
    strokes = []
    openStroke = null
    activePointerId = null
    pointerPos = null
    particles = []
    bladeTrail = []
    lastChatterTick = -9999

    // hashSeed comes from the shared sim rather than being reimplemented here: the server
    // derives the world from the same function, and a divergent copy would silently produce a
    // different game than the one being replayed.
    sim = createState(hashSeed(r.runSeed), cfg)
    feeder = createSegmentFeeder(strokes)

    hudScore.value = 0
    hudLives.value = cfg.startingLives
    uiState.value = 'playing'
    await nextTick()
    resizeCanvas()
    say('start', 0, true)

    lastFrameMs = performance.now()
    acc = 0
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(frame)
  } catch (err) {
    startError.value = err?.data?.statusMessage || 'Could not start a game just now.'
  } finally {
    starting.value = false
  }
}

let submitting = false
async function finishRun () {
  if (submitting) return
  submitting = true
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  endStroke()

  finalScore.value = sim.score
  finalTicks.value = sim.tick

  try {
    const result = await $fetch('/api/game/fruitsamurai/end', {
      method: 'POST',
      body: { strokes }
    })
    // The server's replay is authoritative — if it disagrees with what we drew, its number
    // wins. The shared sim exists so that this never actually differs.
    if (typeof result.score === 'number') finalScore.value = result.score
    if (typeof result.ticks === 'number') finalTicks.value = result.ticks
    finalSlices.value = result.slices ?? 0
    pointsAwarded.value = result.pointsAwarded ?? 0
    pointsError.value = !!result.pointsError
    wasRanked.value = !!result.ranked
    await fetchStatus()
  } catch (err) {
    submitError.value = err?.data?.statusMessage || 'Could not submit your run. Score not recorded.'
    submitFailed.value = true
  }

  uiState.value = 'gameover'
  submitting = false
}

// ── Pause / lifecycle ─────────────────────────────────────────────────────────────────────

function pauseGame () {
  if (uiState.value !== 'playing' || paused.value) return
  paused.value = true
  // Closing the open stroke is a correctness requirement, not tidiness. Leave it open and the
  // next sample after the player returns joins to the last one before they left — a single
  // blade segment spanning the whole pause, straight across the world. The sim refuses to cut
  // across a gap that wide anyway, but a half-open stroke across a pause has no business
  // existing in the log at all.
  endStroke()
  activePointerId = null
  pointerPos = null
}

function resumeGame () {
  if (uiState.value !== 'playing' || !paused.value) return
  paused.value = false
  lastFrameMs = performance.now()
  acc = 0
}

function onVisibilityChange () { if (document.hidden) pauseGame(); else resumeGame() }
function onWindowBlur () { pauseGame() }

// CSS user-select is the main defence, but some mobile browsers still begin a selection or a
// drag from a long-press before the style applies, and a selection started mid-run swallows
// the next touch. Blocks selection across the whole page while the game is mounted: dragging
// off the board would otherwise latch onto the surrounding layout chrome. Nothing on this page
// is meant to be selectable, so the simplest correct rule is "none of it".
function blockSelection (e) { e.preventDefault() }

// iOS Safari ignores user-scalable=no, so the meta tag alone does not stop a pinch there.
// These WebKit-only gesture events are what it actually listens to. They never fire on
// Android/Chrome, which honours touch-action instead — between the two, every browser is
// covered.
function blockGesture (e) { e.preventDefault() }

// Any touch that becomes multi-finger inside the game is not a gesture this game supports.
// Registered with { passive: false }, without which preventDefault is a no-op on touchmove.
function blockMultiTouch (e) { if (e.touches && e.touches.length > 1) e.preventDefault() }

let resizeObserver = null
let landscapeMql = null
function onLandscapeChange () { if (landscapeMql?.matches) pauseGame() }

onMounted(async () => {
  document.addEventListener('selectstart', blockSelection)
  document.addEventListener('dragstart', blockSelection)
  document.addEventListener('gesturestart', blockGesture, { passive: false })
  document.addEventListener('gesturechange', blockGesture, { passive: false })
  document.addEventListener('touchmove', blockMultiTouch, { passive: false })
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', onWindowBlur)

  landscapeMql = window.matchMedia?.('(max-height: 500px) and (orientation: landscape)')
  landscapeMql?.addEventListener?.('change', onLandscapeChange)

  try {
    await fetchStatus()
    uiState.value = 'start'
  } catch {
    startError.value = 'Could not load the game.'
    uiState.value = 'start'
  }

  await nextTick()
  resizeObserver = new ResizeObserver(() => resizeCanvas())
  window.addEventListener('resize', resizeCanvas)
  window.addEventListener('orientationchange', resizeCanvas)
})

// The stage only exists while a run is in progress — it sits inside the `playing` branch, so
// at mount time the start screen is showing and there is nothing to observe. Observing on mount
// therefore silently watched nothing, the canvas was measured exactly once in startGame(), and
// any later layout change never reached it: the adbar finishing loading, a phone rotating, or
// the mobile URL bar collapsing would all leave the board sized for a viewport that no longer
// exists. Re-attach whenever the element appears or goes away.
watch(stageEl, (el) => {
  resizeObserver?.disconnect()
  if (!el) return
  resizeObserver?.observe(el)
  resizeCanvas()
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (jackTimer) clearTimeout(jackTimer)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resizeCanvas)
  window.removeEventListener('orientationchange', resizeCanvas)
  document.removeEventListener('selectstart', blockSelection)
  document.removeEventListener('dragstart', blockSelection)
  document.removeEventListener('gesturestart', blockGesture)
  document.removeEventListener('gesturechange', blockGesture)
  document.removeEventListener('touchmove', blockMultiTouch)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('blur', onWindowBlur)
  landscapeMql?.removeEventListener?.('change', onLandscapeChange)
})
</script>

<style scoped>
/* ── Nothing in this game is selectable ────────────────────────────────────────
   A drag across the canvas or a long-press on a control would otherwise start a text
   selection, which on mobile pops the copy/paste callout, hijacks the next touch, and can
   leave the blade stuck mid-stroke because its pointerup never arrives. The rules cover the
   modal too: it is Teleported to <body>, but it still carries this component's scope
   attribute, so a scoped selector reaches it.

   `*` here is scoped by Vue to this component's elements only, so no other page is affected. */
.fs-wrapper,
.fs-wrapper *,
.modal-backdrop,
.modal-backdrop * {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  -webkit-touch-callout: none; /* no iOS long-press callout */
  -webkit-tap-highlight-color: transparent;
}

.fs-wrapper img,
.fs-wrapper canvas,
.modal-backdrop img {
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
}

/* ── No zooming anywhere in the game ──────────────────────────────────────────
   `touch-action: none` on every surface stops pinch-zoom AND double-tap zoom, which a
   two-finger touch or a fast double-tap would otherwise trigger mid-run. `manipulation` is
   deliberately NOT used: the spec has it permit "continuous zooming", so it blocks double-tap
   but still lets a pinch through.

   touch-action is not inherited, so it has to be set on descendants explicitly. Clicks are
   unaffected — touch-action governs browser gestures, not event dispatch. */
.fs-wrapper,
.fs-wrapper *,
.modal-backdrop,
.modal-backdrop * {
  touch-action: none;
}

/* The one exception: the cards have to stay scrollable on a short phone. `pan-y` allows that
   single gesture while still refusing pinch and double-tap zoom. Children need it too — the
   gesture is resolved from the element the touch starts on, and text fills the card. Declared
   after the blanket rule at equal specificity, so source order lets it win. */
.modal-card,
.modal-card *,
.start-card,
.start-card * {
  touch-action: pan-y;
}

/* ── Shell ─────────────────────────────────────────────────────────────────── */
.fs-wrapper {
  width: 100%;
  /* The newsite layout gives .main-content a fixed box on desktop but height:auto on mobile,
     so the game has to state its own height there or it collapses. */
  height: 100%;
  min-height: min(74dvh, 560px);
  display: flex;
  flex-direction: column;
  position: relative;
  background: #140b26;
  overflow: hidden;
}

.landscape-warning {
  display: none;
}
/* Short landscape viewports only — a tablet in landscape has room and is left alone. */
@media (max-height: 500px) and (orientation: landscape) {
  .landscape-warning {
    display: flex;
    position: absolute;
    inset: 0;
    z-index: 30;
    align-items: center;
    justify-content: center;
    background: #140b26;
    color: #f4e3c1;
    font-weight: 600;
    text-align: center;
    padding: 20px;
  }
}

.center-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  overflow-y: auto;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.25);
  border-top-color: #f4e3c1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.start-card {
  max-width: 420px;
  width: 100%;
  text-align: center;
  color: #f4e3c1;
  padding: 8px 4px 16px;
}

.game-title {
  font-size: clamp(2rem, 9vw, 3rem);
  line-height: 1.02;
  font-weight: 800;
  letter-spacing: 0.02em;
  margin-bottom: 10px;
  color: #fff;
  text-shadow: 0 3px 0 #b0342a, 0 6px 18px rgba(0, 0, 0, 0.5);
}

.over-title {
  font-size: 1.45rem;
  font-weight: 700;
  margin-bottom: 6px;
}

.start-sub {
  font-size: 0.92rem;
  line-height: 1.45;
  opacity: 0.86;
  margin-bottom: 14px;
}

.plays-info { font-size: 0.85rem; margin-bottom: 4px; }
.plays-badge {
  display: inline-block;
  background: #2e7d32;
  color: #fff;
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 700;
  font-size: 0.78rem;
}
.plays-badge--practice { background: #6b5b8a; }
.reset-text { opacity: 0.7; margin-left: 4px; }
.plays-note { font-size: 0.76rem; opacity: 0.62; margin-bottom: 14px; line-height: 1.4; }

.high-row {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 16px;
}
.high-item {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 7px 14px;
  display: flex;
  flex-direction: column;
}
.high-label { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.6; }
.high-value { font-size: 1.05rem; font-weight: 700; }

.final-score {
  font-size: 3rem;
  font-weight: 800;
  color: #ffd257;
  line-height: 1;
  margin: 6px 0;
}
.final-line { font-size: 0.85rem; opacity: 0.72; margin-bottom: 8px; }
.points-line { font-size: 0.92rem; margin-bottom: 14px; font-weight: 600; }
.points-line--failed { color: #ff9d8f; }
.err-text { color: #ff9d8f; font-size: 0.85rem; margin-top: 10px; }

.btn-start {
  background: #c0392b;
  color: #fff;
  font-weight: 700;
  font-size: 1.05rem;
  border: none;
  border-radius: 12px;
  padding: 12px 34px;
  cursor: pointer;
  box-shadow: 0 3px 0 #8e2b20;
  transition: filter 0.15s ease, transform 0.08s ease;
}
.btn-start:active { transform: translateY(2px); box-shadow: 0 1px 0 #8e2b20; }
.btn-start:disabled { opacity: 0.65; cursor: default; }
.btn-start--small { font-size: 0.92rem; padding: 9px 22px; margin-top: 12px; }

.btn-howto {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  background: none;
  border: none;
  color: #f4e3c1;
  opacity: 0.72;
  font-size: 0.88rem;
  cursor: pointer;
  text-decoration: none;
}
.btn-howto--link { display: block; margin-top: 14px; }

/* ── Board ─────────────────────────────────────────────────────────────────── */
.game-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 10px;
  color: #f4e3c1;
  flex-shrink: 0;
  gap: 8px;
}
.hud-item { display: flex; flex-direction: column; line-height: 1.1; }
.hud-item--mode { text-align: right; }
.hud-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.55; }
.hud-value { font-size: 1rem; font-weight: 700; }
.hud-lives { display: flex; gap: 3px; align-items: center; height: 1.2em; }
.life-pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e8455f;
  box-shadow: 0 0 6px rgba(232, 69, 95, 0.7);
}
.life-none { opacity: 0.4; }
.mode-ranked { color: #7fe08a; }
.mode-practice { color: #b9a8d8; }

.pu-bar {
  display: flex;
  gap: 6px;
  padding: 0 10px 4px;
  flex-shrink: 0;
  min-height: 20px;
}
.pu-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 1px 9px;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #1a1024;
}
.pu-chip--piggy { background: #f38fb8; }
.pu-chip--hourglass { background: #7fd0ff; }
.pu-chip--dynamite { background: #ffb46b; }

/* The stage fills what is left; the canvas is sized in JS to FIT inside it, so the world is
   letterboxed rather than cropped and every player sees the same play area. */
.stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  overscroll-behavior: contain;
}

.board {
  display: block;
  border-radius: 8px;
  background: #140b26;
  touch-action: none;
}

/* Jack's speech bubble.
   pointer-events:none so it can never swallow the start of a swipe, and it sits in the lower
   band beside him rather than over the fruit. */
.jack-bubble {
  position: absolute;
  left: 8px;
  bottom: 12%;
  max-width: 62%;
  pointer-events: none;
  background: rgba(250, 246, 235, 0.95);
  color: #221733;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.32;
  padding: 7px 11px;
  border-radius: 12px;
  border-bottom-left-radius: 3px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.45);
  z-index: 5;
}
.bubble-enter-active, .bubble-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.bubble-enter-from, .bubble-leave-to { opacity: 0; transform: translateY(6px); }

.pause-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 11, 38, 0.72);
  color: #f4e3c1;
  font-size: 1.2rem;
  font-weight: 700;
  z-index: 6;
}

/* ── Modal ─────────────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.66);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.modal-card {
  background: #241539;
  color: #f4e3c1;
  border-radius: 14px;
  padding: 20px;
  max-width: 420px;
  width: 100%;
  max-height: 82vh;
  overflow-y: auto;
  text-align: left;
}
.modal-card h3 { font-size: 1.2rem; font-weight: 700; margin-bottom: 10px; }
.modal-card h4 { font-size: 0.95rem; font-weight: 700; margin: 14px 0 6px; }
.modal-card ul { list-style: disc; padding-left: 20px; }
.modal-card li { font-size: 0.87rem; line-height: 1.5; margin-bottom: 7px; }
</style>
