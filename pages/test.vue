<template>
  <div class="wrap" :class="{ 'wrap--center': !isScaledDown }">
    <div class="stage-shell" ref="stageShell" :style="{ width: shellWidth + 'px', height: scaledHeight + 'px' }">
      <div
        class="stage"
        :style="{
          width: canvasWidth + 'px',
          height: canvasHeight + 'px',
          transform: 'scale(' + scale + ')'
        }"
      >
        <canvas ref="canvas" class="screen" :width="canvasWidth" :height="canvasHeight" />
        <div v-if="!isLoaded" class="loading-overlay">
          <div class="spinner" aria-label="Loading"></div>
        </div>
        <!-- Overlay the GIF so it animates naturally -->
        <img
          ref="spriteEl"
          class="sprite-dom"
          v-show="isLoaded"
          :src="sprite_src"
          :style="{
            left: spriteLeft,
            top: spriteTop,
            width: spriteDrawW + 'px',
            height: spriteDrawH + 'px',
            transform: spriteTransform,
          }"
          alt="sprite"
        />
      </div>
    </div>
  </div>
  
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

/**
 * CONFIG
 * - "steps" are discrete positions across the canvas width.
 * - 1 GIF frame == 1 step (as requested).
 */
const STEPS_WIDE = 100
const FRAME_MS = 100 // controls pace; 100–160 feels nice for digivice vibes

// Your asset path (put the gif in /public/sprites/ or similar)
// If you have a dynamic value elsewhere, bind that here instead
const sprite_src = 'images/sprites/character.gif'

// Canvas sizing (simple, crisp pixel look)
const canvasWidth = 800
const canvasHeight = 220
const BORDER_W = 4 // keep in sync with .screen border width

// Character placement/render
const spriteDrawW = 128
const spriteDrawH = 128
const floorY = 170 // baseline where feet sit

// State
const canvas = ref(null)
const spriteEl = ref(null)
const stageShell = ref(null)
let ctx = null

let rafId = 0
let lastTick = 0

let spriteImg = null
const isLoaded = ref(false)

// Responsive: scale stage based on available width (max 100%)
const scale = ref(1)
const scaledHeight = computed(() => Math.round((canvasHeight + BORDER_W * 2) * scale.value))
const isScaledDown = computed(() => scale.value < 1)
const shellWidth = ref(canvasWidth + BORDER_W * 2)

function updateScale() {
  const vw = Math.min(window.innerWidth || 0, document.documentElement.clientWidth || 0) || 0
  const fullContentW = canvasWidth + BORDER_W * 2
  if (vw < fullContentW) {
    // Small screens: fit to 98% of viewport width
    const availW = Math.floor(vw * 0.98)
    scale.value = Math.max(0.01, Math.min(1, availW / fullContentW))
  } else {
    // Large screens: no scale-down
    scale.value = 1
  }
  shellWidth.value = Math.round(fullContentW * scale.value)
}

// Position is in "steps" (0..STEPS_WIDE-1)
let stepX = Math.floor(STEPS_WIDE / 2)
let dir = 1 // +1 east (right), -1 west (left)

// GIF frames note:
// Browsers do not give per-frame access for GIFs via <img>.
// We still honor "1 step per frame" by ticking at FRAME_MS.
// The GIF animates on its own while we move 1 step per tick.
// If you need true frame-perfect sync, use a spritesheet instead.
function stepToPx(step) {
  const usableW = canvasWidth - spriteDrawW
  return Math.round((step / (STEPS_WIDE - 1)) * usableW)
}

function clear() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
}

function drawBackground() {
  // Simple digivice-y flat background + ground strip
  ctx.fillStyle = '#7bbf3a'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  ctx.fillStyle = '#5a8f2a'
  ctx.fillRect(0, floorY + 4, canvasWidth, canvasHeight - (floorY + 4))
}

// DOM-driven sprite positioning so the GIF animates normally
const spriteLeft = ref('0px')
const spriteTop = ref('0px')
const spriteTransform = ref('scaleX(1)')

function drawSprite() {
  const x = stepToPx(stepX)
  const y = floorY - spriteDrawH

  // Update overlayed <img> position and flip
  spriteLeft.value = `${x}px`
  spriteTop.value = `${y + 10}px`
  spriteTransform.value = dir === -1 ? 'scaleX(-1)' : 'scaleX(1)'
}

function tick() {
  // Move 1 step per tick
  stepX += dir

  // Bounce at edges
  if (stepX >= STEPS_WIDE - 1) {
    stepX = STEPS_WIDE - 1
    dir = -1
  } else if (stepX <= 0) {
    stepX = 0
    dir = 1
  }
}

function loop(ts) {
  rafId = requestAnimationFrame(loop)
  if (!lastTick) lastTick = ts

  const elapsed = ts - lastTick
  if (elapsed >= FRAME_MS) {
    // keep stable ticking even if the tab lags
    lastTick += FRAME_MS * Math.floor(elapsed / FRAME_MS)

    tick()
  }

  clear()
  drawBackground()
  drawSprite()
}

function loadSprite() {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = sprite_src
  })
}

onMounted(async () => {
  ctx = canvas.value.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // initial scale + resize
  updateScale()
  window.addEventListener('resize', updateScale)
  window.addEventListener('orientationchange', updateScale)

  try {
    // Preload image dimensions if needed; the on-canvas draw is no longer required
    spriteImg = await loadSprite()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to load sprite gif:', e)
    return
  }

  // Start in middle
  stepX = Math.floor(STEPS_WIDE / 2)
  dir = 1

  isLoaded.value = true
  rafId = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', updateScale)
  window.removeEventListener('orientationchange', updateScale)
})
</script>

<style scoped>
.wrap {
  display: grid;
  place-items: start center; /* default: top align when scaled */
  width: 100%;
  min-height: 240px;
}

.wrap.wrap--center {
  place-items: center; /* center vertically when not scaled */
}

.stage-shell {
  position: relative;
  overflow: hidden; /* ensure it never exceeds container */
}

.stage {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
}

.screen {
  position: absolute;
  left: 0;
  top: 0;
  border: 4px solid rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  background: #7bbf3a;
  /* crisp pixels */
  image-rendering: pixelated;
}

.sprite-dom {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2;
  pointer-events: none;
  image-rendering: pixelated;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 3;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid rgba(0, 0, 0, 0.15);
  border-top-color: rgba(0, 0, 0, 0.45);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
