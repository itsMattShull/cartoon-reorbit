<template>
  <Nav />
  <div class="mt-6 md:mt-12">&nbsp;</div>
  <div class="mt-12 wrap" :class="{ 'wrap--center': !isScaledDown }">
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
        <!-- Retro Tamagotchi-style menu overlay -->
        <div v-if="isMenuOpen" class="menu-overlay">
          <div class="menu-box">
            <div
              v-for="(opt, i) in menuOptions"
              :key="opt"
              :class="['menu-row', { selected: i === menuIndex }]"
            >
              <span class="menu-caret">{{ i === menuIndex ? '▶' : '\u00A0' }}</span>
              <span class="menu-text">{{ opt }}</span>
            </div>
          </div>
        </div>
        <!-- HUD: Health bar -->
        <div class="hud">
          <div class="healthbar">
            <div class="healthbar-fill" :class="'is-' + healthTier" :style="{ width: healthPercent + '%' }"></div>
            <div class="healthbar-frame"></div>
            <div class="healthbar-label">{{ health }}/{{ maxHealth }}</div>
          </div>
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
        <img
          v-if="itemVisible"
          class="item-dom"
          :src="itemSrc"
          :style="{ left: itemLeft, top: itemTop, width: itemDrawW + 'px', height: itemDrawH + 'px' }"
          alt="item"
        />
      </div>
    </div>
  </div>
  <div class="controls" :style="{ width: shellWidth + 'px' }">
    <div class="gb-buttons">
      <button class="gb-btn" aria-label="Button A" @click="onBtnLeft"></button>
      <button class="gb-btn gb-btn--center" aria-label="Button B" @click="onBtnCenter"></button>
      <button class="gb-btn" aria-label="Button C" @click="onBtnRight"></button>
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
// Item sources
const APPLE0_SRC = 'images/sprites/items/apple/apple0.png'
const APPLE1_SRC = 'images/sprites/items/apple/apple1.png'
const APPLE2_SRC = 'images/sprites/items/apple/apple2.png'

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
// Menu state
const isMenuOpen = ref(false)
const menuOptions = ['EAT', 'PLAY', 'SLEEP', 'SCAVENGE', 'BATTLE', 'EXIT']
const menuIndex = ref(0)

function openMenu() {
  isMenuOpen.value = true
  menuIndex.value = 0
}

function closeMenu() {
  isMenuOpen.value = false
}

function onBtnLeft() {
  if (isCutscene.value) return
  if (!isMenuOpen.value) return openMenu()
  // navigate up
  menuIndex.value = (menuIndex.value - 1 + menuOptions.length) % menuOptions.length
}

function onBtnCenter() {
  if (isCutscene.value) return
  if (!isMenuOpen.value) return openMenu()
  // navigate down
  menuIndex.value = (menuIndex.value + 1) % menuOptions.length
}

function onBtnRight() {
  if (isCutscene.value) return
  if (!isMenuOpen.value) return openMenu()
  // select current option
  const choice = menuOptions[menuIndex.value]
  if (choice === 'EAT') {
    performEat()
  } else {
    closeMenu()
  }
}

// Responsive: scale stage based on available width
// Minimum downscale target: 0.8 (i.e., show at 80% on large screens)
const BASE_SCALE = 0.8
const scale = ref(BASE_SCALE)
const scaledHeight = computed(() => Math.round((canvasHeight + BORDER_W * 2) * scale.value))
const isScaledDown = computed(() => scale.value < 1)
const shellWidth = ref(canvasWidth + BORDER_W * 2)

function updateScale() {
  const vw = Math.min(window.innerWidth || 0, document.documentElement.clientWidth || 0) || 0
  const fullContentW = canvasWidth + BORDER_W * 2
  // Available width as a scale factor relative to full content
  const sW = vw > 0 ? (vw / fullContentW) : 1
  // On large screens, cap at BASE_SCALE (80%). On small screens, scale down further to fit.
  scale.value = Math.max(0.01, Math.min(BASE_SCALE, sW))
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
const JUMP_PROB = 0.0005 // 0.05% chance per tick to jump
const GRAVITY = 1.2 // px per tick^2
const JUMP_V0 = -12 // initial upward velocity (px / tick)
let jumpY = 0 // vertical offset from ground (0 at ground, negative when in air)
let jumpVy = 0

// Cutscene/action mode (pauses normal walking/jumping behavior)
const isCutscene = ref(false)

// Item overlay state
const itemVisible = ref(false)
const itemSrc = ref('')
const itemDrawW = 64
const itemDrawH = 64
const itemLeft = ref('0px')
const itemTop = ref('0px')

// Health
const maxHealth = 100
const health = ref(50)
const healthPercent = computed(() => Math.max(0, Math.min(100, Math.round((health.value / maxHealth) * 100))))
const healthTier = computed(() => {
  if (health.value <= 29) return 'red'
  if (health.value <= 49) return 'yellow' // 30-49
  return 'green' // >= 50
})

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

  // Update item position to be in front of the monster near the ground
  if (itemVisible.value) {
    const frontOffset = dir === 1
      ? Math.floor(spriteDrawW * 0.7) + 40 // further by +40px when facing right
      : -Math.floor(itemDrawW * 0.4) - 40 // further by -40px when facing left
    const itemX = x + frontOffset
    const itemY = floorY - itemDrawH + 10 - 20 // 20px higher vertically
    itemLeft.value = `${BORDER_W + itemX}px`
    itemTop.value = `${BORDER_W + itemY}px`
  }
}

function tick() {
  if (isCutscene.value) return // freeze behavior during scripted actions
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

function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }

async function performEat() {
  // Close menu and pause normal behavior
  isMenuOpen.value = false
  isCutscene.value = true

  // Move monster to center and hold position
  stepX = Math.floor((STEPS_WIDE - 1) / 2)
  currentSpriteSrc.value = IDLE_SPRITE_SRC

  // Show initial apple in front
  itemSrc.value = APPLE0_SRC
  itemVisible.value = true
  await sleep(400)

  // Helper to play a single bite: jump -> standstill -> update apple
  const bite = async (nextAppleSrcOrNull) => {
    currentSpriteSrc.value = JUMP_SPRITE_SRC
    await sleep(600)
    currentSpriteSrc.value = IDLE_SPRITE_SRC
    // Update apple AFTER returning to standstill
    if (nextAppleSrcOrNull === null) {
      itemVisible.value = false
    } else {
      itemSrc.value = nextAppleSrcOrNull
    }
    await sleep(400)
  }

  // Bite 1 updates to apple1
  await bite(APPLE1_SRC)
  // Bite 2 updates to apple2
  await bite(APPLE2_SRC)
  // Bite 3 hides apple
  await bite(null)

  // Heal on eat completion
  health.value = Math.min(maxHealth, health.value + 10)

  // Resume
  enterState('walk')
  isCutscene.value = false
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

.item-dom {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 3; /* above sprite */
  pointer-events: none;
  image-rendering: pixelated;
}

/* HUD */
.hud {
  position: absolute;
  left: 6px; /* slight inset from canvas border */
  top: 6px;
  z-index: 3; /* above sprite, below menu */
  pointer-events: none;
}

.healthbar {
  position: relative;
  width: 240px; /* larger for readability when scaled */
  height: 32px; /* taller bar */
  background: #cfe9a2;
  border: 3px solid #2c4a1d;
  border-radius: 8px;
  box-shadow: inset 0 0 0 2px rgba(44,74,29,0.25);
}

.healthbar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(0deg, #8dd16a, #6bb44b);
}

.healthbar-fill.is-green { background: linear-gradient(0deg, #8dd16a, #6bb44b); }
.healthbar-fill.is-yellow { background: linear-gradient(0deg, #f5d36a, #e9b83c); }
.healthbar-fill.is-red { background: linear-gradient(0deg, #e56565, #c94747); }

.healthbar-frame { /* decorative scanlines */
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 4px);
  border-radius: 2px;
}

.healthbar-label {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  color: #1f3813;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 1px 0 rgba(255,255,255,0.3);
  font-size: 16px; /* scale text up; still scales with stage */
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

/* Retro Tamagotchi-style menu */
.menu-overlay {
  position: absolute;
  inset: 0;
  z-index: 4; /* above loader + sprite */
}

.menu-box {
  width: 100%;
  height: 100%;
  background:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 4px),
    #d6ef9e;
  border: 3px solid #2c4a1d;
  border-radius: 8px;
  box-shadow:
    inset 0 0 0 2px rgba(44,74,29,0.25),
    0 6px 0 rgba(0,0,0,0.25);
  padding: 16px 18px;
  color: #1f3813;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-size: 22px; /* larger, Tamagotchi-like */
  line-height: 1.1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.menu-row {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px; /* taller rows for larger text */
  line-height: 1;
  font-weight: 800;
}

.menu-row + .menu-row {
  border-top: 2px dotted rgba(44,74,29,0.3);
}

.menu-row.selected {
  background: rgba(44,74,29,0.15);
  outline: 2px solid rgba(44,74,29,0.55);
}

.menu-caret {
  width: 24px;
  display: inline-block;
}

.menu-text { letter-spacing: 2px; }

/* Game Boy-like buttons */
.controls {
  margin: 12px auto 0; /* center horizontally like canvas */
  display: grid;
  place-items: center;
}

.gb-buttons {
  display: flex;
  align-items: center;
  justify-content: space-between; /* spread across full width */
  width: 100%;
  gap: 0;
  padding: 0 12px; /* keep off the very edge */
}

.gb-btn {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  appearance: none;
  border: 0;
  cursor: pointer;
  background: radial-gradient(120% 120% at 30% 30%, #ad3c6e, #7c2d54 60%, #5a2341 100%);
  box-shadow:
    inset 0 3px 6px rgba(255,255,255,0.15),
    inset 0 -6px 10px rgba(0,0,0,0.35),
    0 4px 0 #34152a,
    0 6px 8px rgba(0,0,0,0.35);
  position: relative;
  transition: transform 0.06s ease, box-shadow 0.06s ease, filter 0.2s ease;
}

.gb-btn::after {
  content: '';
  position: absolute;
  top: 8px;
  left: 10px;
  width: 12px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255,255,255,0.25);
  filter: blur(0.3px);
}

.gb-btn:hover { filter: brightness(1.05); }
.gb-btn:active {
  transform: translateY(2px);
  box-shadow:
    inset 0 2px 5px rgba(255,255,255,0.1),
    inset 0 -3px 8px rgba(0,0,0,0.4),
    0 2px 0 #34152a,
    0 3px 4px rgba(0,0,0,0.35);
}

.gb-btn--center {
  transform: translateY(25px);
}

.gb-btn--center:active {
  /* Keep the same pressed effect but from a lower resting position */
  transform: translateY(27px);
}
</style>
