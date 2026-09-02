<template>
  <div class="snx-root" :style="{ animationDelay: fadeDelayMs + 'ms', animationDuration: fadeMs + 'ms' }">
    <canvas ref="canvasRef" class="snx-canvas"></canvas>

    <div class="snx-pacman" :style="{ animationDelay: fillMs + 'ms', animationDuration: popMs + 'ms' }">
      <div class="snx-pacman-outline"></div>
      <div class="snx-pacman-face">
        <div class="snx-pacman-eye"></div>
      </div>
    </div>

    <div class="snx-scanlines" aria-hidden="true"></div>
  </div>
</template>

<script setup>
// A small red 8-bit "snake" head races along a fixed raster (boustrophedon/"mow the lawn") path —
// left-to-right, then right-to-left on the next row, etc. — so it's guaranteed to cover every
// cell exactly once with no re-visits, turning the screen fully red as it goes (rather than
// black, per revision). Each frame paints only the newly-crossed cell(s) plus a short fading tail
// (a handful of fillRect calls, not a full-canvas redraw) — canvas retains prior paints as
// permanent red trail for free. This mirrors GlitchEffect.vue's existing pattern (throttled rAF,
// DPR capped at 1.5, single canvas, pause on document.hidden) rather than inventing a new
// performance approach (see performance review on the original version of this effect).
//
// Once the fill completes, a CSS/SVG-style Pac-Man (no image asset — built from clip-path shapes)
// pops in centered, holds, then the whole scene (canvas + Pac-Man + scanline overlay) fades out
// together as one unit.
const props = defineProps({
  durationMs: { type: Number, default: 3200 },
})
const emit = defineEmits(['done'])

const canvasRef = ref(null)
let ctx = null
let cellW = 0
let cellH = 0
let cols = 0
let rows = 0
let path = []
let totalCells = 0
let filledCount = 0
let rafId = null
let startTime = 0
let lastFrameTime = 0
const FRAME_INTERVAL_MS = 1000 / 20 // throttled well below display refresh, matching GlitchEffect

// Fill phase gets half the budget; Pac-Man pops in right after and holds; the last ~18% fades
// everything out together.
const fillMs = Math.round(props.durationMs * 0.5)
const popMs = Math.round(props.durationMs * 0.15)
const fadeMs = Math.round(props.durationMs * 0.18)
const fadeDelayMs = props.durationMs - fadeMs

const HEAD_RED = '#ff3b30'
const TAIL_REDS = ['#f0301f', '#d4201a', '#b31217'] // fading toward the settled trail color
const TAIL_LEN = TAIL_REDS.length
const SETTLED_RED = TAIL_REDS[TAIL_REDS.length - 1] // matches the last tail shade — no visible seam

let timers = []
function after(ms, fn) {
  timers.push(setTimeout(fn, ms))
}

function cellRect(i) {
  const [c, r] = path[i]
  return [c * cellW, r * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1]
}

function paintCell(i, color) {
  if (i < 0 || i >= totalCells) return
  ctx.fillStyle = color
  ctx.fillRect(...cellRect(i))
}

function buildPath() {
  // ~34 CSS px per cell — chunkier than the original 26px, for a more visibly blocky/8-bit fill.
  const TARGET_CELL_PX = 34
  const w = window.innerWidth
  const h = window.innerHeight
  cols = Math.max(6, Math.round(w / TARGET_CELL_PX))
  rows = Math.max(5, Math.round(h / TARGET_CELL_PX))
  cellW = w / cols
  cellH = h / rows
  path = []
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < cols; c++) path.push([c, r])
    } else {
      for (let c = cols - 1; c >= 0; c--) path.push([c, r])
    }
  }
  totalCells = path.length
}

function setupCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
  canvas.width = Math.ceil(window.innerWidth * dpr)
  canvas.height = Math.ceil(window.innerHeight * dpr)
  ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  buildPath()
}

function fillRemainderInstantly() {
  // Used as a resize/orientation-change fallback: rebuilding the grid mid-run would misalign the
  // already-painted trail against the new dimensions, so instead of a stale or corrupted partial
  // grid we just jump straight to "the screen is red" (see mobile review on the original version).
  if (!ctx) return
  // Coordinates here are in the dpr-transformed (CSS-pixel) space set up in setupCanvas(), not
  // the canvas element's raw backing-store width/height.
  ctx.fillStyle = SETTLED_RED
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
  filledCount = totalCells
}

function onResize() {
  if (filledCount < totalCells) fillRemainderInstantly()
}

function drawFrame(now) {
  rafId = requestAnimationFrame(drawFrame)
  if (now - lastFrameTime < FRAME_INTERVAL_MS) return
  lastFrameTime = now
  if (!ctx || filledCount >= totalCells) return

  const elapsed = now - startTime
  const target = Math.min(totalCells, Math.floor((elapsed / fillMs) * totalCells))
  while (filledCount < target) {
    // The cell that's about to drop out of the tail window settles to the permanent red; the
    // head and its short tail are repainted in fading red each step. Bounded, constant work per
    // step regardless of how much of the grid is already filled.
    const dropIndex = filledCount - TAIL_LEN
    if (dropIndex >= 0) paintCell(dropIndex, SETTLED_RED)
    filledCount++
    for (let t = 0; t < TAIL_LEN; t++) paintCell(filledCount - 1 - t, TAIL_REDS[t])
    paintCell(filledCount - 1, HEAD_RED)
  }
  if (filledCount >= totalCells) fillRemainderInstantly()
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

function onVisibilityChange() {
  if (document.hidden) stopLoop()
  else if (filledCount < totalCells && !rafId) {
    lastFrameTime = 0
    rafId = requestAnimationFrame(drawFrame)
  }
}

onMounted(async () => {
  await nextTick()
  setupCanvas()
  startTime = performance.now()
  rafId = requestAnimationFrame(drawFrame)
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibilityChange)
  after(props.durationMs, () => emit('done'))
})

onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  timers = []
  stopLoop()
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped>
.snx-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* The host overlay's own backdrop is solid black (see FullscreenEffectHost.vue's
     `.fxh-overlay`), so without an opaque light background here the "screen going red behind
     him" read would be invisible from frame one — there'd be no contrast to reveal. This gives
     the canvas's growing red trail something visible to cover. */
  background: #d8dadd;
  animation-name: snx-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: both;
}

@keyframes snx-fade {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

.snx-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}

/* Built from CSS shapes rather than an image asset — a black "outline" pie behind a slightly
   smaller yellow one gives a bordered silhouette (including along the mouth-wedge edge) without
   needing an SVG or bitmap. Same clip-path polygon on both, just at two sizes. */
.snx-pacman {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(46vw, 42vh, 220px);
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%) scale(0.3);
  opacity: 0;
  animation-name: snx-pacman-pop;
  animation-timing-function: cubic-bezier(0.2, 1.3, 0.4, 1);
  animation-fill-mode: both;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.45));
}

@keyframes snx-pacman-pop {
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
  70%  { opacity: 1; transform: translate(-50%, -50%) scale(1.12); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.snx-pacman-outline,
.snx-pacman-face {
  position: absolute;
  /* A pie: circle rim points every 15°, skipping the -35°..35° wedge (mouth, opening right),
     closing through the center. */
  clip-path: polygon(
    91% 79%, 82% 88%, 71% 95%, 59% 99%, 46% 100%, 33% 97%, 21% 91%, 12% 82%,
    5% 71%, 1% 59%, 0% 46%, 3% 33%, 9% 21%, 18% 12%, 29% 5%, 41% 1%,
    54% 0%, 67% 3%, 79% 9%, 88% 18%, 50% 50%
  );
}

.snx-pacman-outline {
  inset: 0;
  background: #0a0a0a;
}

.snx-pacman-face {
  inset: 7%;
  background: #ffe200;
}

.snx-pacman-eye {
  position: absolute;
  top: 26%;
  left: 32%;
  width: 11%;
  height: 11%;
  border-radius: 50%;
  background: #0a0a0a;
}

/* Static CRT/retro overlay — a plain repeating-gradient, no animation cost — layered above
   everything (canvas + Pac-Man) so the whole scene reads as one 8-bit screen. */
.snx-scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0, 0, 0, 0.14) 3px,
    rgba(0, 0, 0, 0.14) 4px
  );
}
</style>
