<template>
  <div class="snx-root">
    <canvas ref="canvasRef" class="snx-canvas" :style="{ animationDuration: fadeMs + 'ms', animationDelay: fadeDelayMs + 'ms' }"></canvas>
  </div>
</template>

<script setup>
// A small red 8-bit "snake" head races along a fixed raster (boustrophedon/"mow the lawn") path —
// left-to-right, then right-to-left on the next row, etc. — so it's guaranteed to cover every
// cell exactly once with no re-visits. Each frame paints only the newly-crossed cell(s) plus a
// short fading tail (a handful of fillRect calls, not a full-canvas redraw) — canvas retains
// prior paints as permanent black trail for free. This mirrors GlitchEffect.vue's existing
// pattern (throttled rAF, DPR capped at 1.5, single canvas, pause on document.hidden) rather than
// inventing a new performance approach (see performance review).
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

// Fill phase gets ~68% of the budget; the rest is a solid-black hold before the canvas fades.
const fillMs = Math.round(props.durationMs * 0.68)
const fadeMs = Math.round(props.durationMs * 0.22)
const fadeDelayMs = props.durationMs - fadeMs

const HEAD_RED = '#ff3b30'
const TAIL_REDS = ['#e0281f', '#a81812', '#5c0c09'] // fading brightness behind the head
const TAIL_LEN = TAIL_REDS.length

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
  // ~26 CSS px per cell — coarse enough to stay cheap, fine enough to read as pixel-art.
  const TARGET_CELL_PX = 26
  const w = window.innerWidth
  const h = window.innerHeight
  cols = Math.max(8, Math.round(w / TARGET_CELL_PX))
  rows = Math.max(6, Math.round(h / TARGET_CELL_PX))
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
  // grid we just jump straight to "the screen is black" (see mobile review).
  if (!ctx) return
  // Coordinates here are in the dpr-transformed (CSS-pixel) space set up in setupCanvas(), not
  // the canvas element's raw backing-store width/height.
  ctx.fillStyle = '#000000'
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
    // The cell that's about to drop out of the tail window goes permanently black; the head and
    // its short tail are repainted in fading red each step. Bounded, constant work per step.
    const dropIndex = filledCount - TAIL_LEN
    if (dropIndex >= 0) paintCell(dropIndex, '#000000')
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
     `.fxh-overlay`), so without an opaque light background here the "screen going black behind
     him" read would be invisible from frame one — there'd be no contrast to reveal. This gives
     the canvas's growing black trail something visible to cover. */
  background: #d8dadd;
}

.snx-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  animation-name: snx-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: both;
}

@keyframes snx-fade {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
</style>
