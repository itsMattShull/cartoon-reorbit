<template>
  <div class="wrap" :class="{ 'wrap--center': !isScaledDown }">
    <div class="stage-shell" ref="stageShell" :style="{ width: shellWidth + 'px', height: scaledHeight + 'px' }">
      <div
        class="stage"
        :style="{
          width: (canvasWidth + BORDER_W * 2) + 'px',
          height: (canvasHeight + BORDER_W * 2) + 'px',
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
          :src="currentSpriteSrc"
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

// Sprite sources
const WALK_SPRITE_SRC = 'images/sprites/character.gif'
const IDLE_SPRITE_SRC = 'images/sprites/standstill.gif'
const JUMP_SPRITE_SRC = 'images/sprites/jump.gif'

// Canvas sizing (simple, crisp pixel look)
const canvasWidth = 800
const canvasHeight = 600
const BORDER_W = 4 // keep in sync with .screen border width

// Character placement/render
const spriteDrawW = 128
const spriteDrawH = 128
const floorY = 570 // baseline where feet sit

// State
const canvas = ref(null)
const spriteEl = ref(null)
const stageShell = ref(null)
let ctx = null

let rafId = 0
let lastTick = 0

// Sprite assets (preloaded)
let walkImg = null
let idleImg = null
let jumpImg = null
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

// Behavior: walk vs idle vs jump with random durations and turns
const currentSpriteSrc = ref(WALK_SPRITE_SRC)
let state = 'walk' // 'walk' | 'idle' | 'jump'
let stateRemainingMs = 0
const IDLE_MIN_MS = 1200
const IDLE_MAX_MS = 4500
const WALK_MIN_MS = 2000
const WALK_MAX_MS = 7000
const TURN_PROB = 0.02 // 2% chance each tick to flip while walking
const JUMP_PROB = 0.005 // 0.5% chance per tick to jump
const GRAVITY = 1.2 // px per tick^2
const JUMP_V0 = -12 // initial upward velocity (px / tick)
let jumpY = 0 // vertical offset from ground (0 at ground, negative when in air)
let jumpVy = 0

function randInt(min, max) { // inclusive of both ends
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function enterState(next) {
  state = next
  if (state === 'idle') {
    currentSpriteSrc.value = IDLE_SPRITE_SRC
    stateRemainingMs = randInt(IDLE_MIN_MS, IDLE_MAX_MS)
  } else if (state === 'walk') {
    currentSpriteSrc.value = WALK_SPRITE_SRC
    stateRemainingMs = randInt(WALK_MIN_MS, WALK_MAX_MS)
  } else if (state === 'jump') {
    currentSpriteSrc.value = JUMP_SPRITE_SRC
    // jump uses physics; timer not used
    jumpY = 0
    jumpVy = JUMP_V0
    stateRemainingMs = 0
  }
}

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

  // Update overlayed <img> position and flip (account for canvas border)
  spriteLeft.value = `${BORDER_W + x}px`
  spriteTop.value = `${BORDER_W + y + 10 + Math.round(jumpY)}px`
  spriteTransform.value = dir === -1 ? 'scaleX(-1)' : 'scaleX(1)'
}

function tick() {
  // If not jumping, handle walk/idle timers and potential jump trigger
  if (state !== 'jump') {
    stateRemainingMs -= FRAME_MS
    if (stateRemainingMs <= 0) {
      if (state === 'walk') {
        // randomly decide to idle
        enterState('idle')
      } else if (state === 'idle') {
        // leaving idle: 50% chance to flip direction
        if (Math.random() < 0.5) dir *= -1
        enterState('walk')
      }
    }

    // Random jump trigger while not already jumping
    if (Math.random() < JUMP_PROB) {
      enterState('jump')
    }
  }

  if (state === 'walk') {
    // Move 1 step per tick
    stepX += dir

    // Bounce at edges
    if (stepX >= STEPS_WIDE - 1) {
      stepX = STEPS_WIDE - 1
      dir = -1
    } else if (stepX <= 0) {
      stepX = 0
      dir = 1
    } else {
      // occasional random turn while walking
      if (Math.random() < TURN_PROB) dir *= -1
    }
  } else if (state === 'jump') {
    // Horizontal motion during jump (keep same step speed)
    stepX += dir
    if (stepX >= STEPS_WIDE - 1) {
      stepX = STEPS_WIDE - 1
      dir = -1
    } else if (stepX <= 0) {
      stepX = 0
      dir = 1
    }
    // Vertical physics
    jumpVy += GRAVITY
    jumpY += jumpVy
    if (jumpY >= 0) {
      // landed
      jumpY = 0
      // Continue walking after landing
      enterState('walk')
    }
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

function loadSprite(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
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
    // Preload both animations
    ;[walkImg, idleImg, jumpImg] = await Promise.all([
      loadSprite(WALK_SPRITE_SRC),
      loadSprite(IDLE_SPRITE_SRC),
      loadSprite(JUMP_SPRITE_SRC),
    ])
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to load sprite gif:', e)
    return
  }

  // Start in middle
  stepX = Math.floor(STEPS_WIDE / 2)
  dir = 1
  enterState('walk')
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
