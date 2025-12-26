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
        <div v-if="!isLoaded || noMonster" class="loading-overlay">
          <div v-if="noMonster" class="no-monster-msg">No monster captured, try scanning to capture one!</div>
          <div v-else class="spinner" aria-label="Loading"></div>
        </div>
        <!-- Retro Tamagotchi-style menu overlay -->
        <div v-if="isMenuOpen" class="menu-overlay">
          <div class="menu-box" :class="{ 'menu-box--scroll': menuScrollable }">
            <div v-if="menuMode === 'rename'" class="rename-panel">
              <div class="rename-title">Rename Monster</div>
              <div class="rename-slots">
                <span
                  v-for="(ch, i) in renameChars"
                  :key="i"
                  :class="['rename-slot', { active: i === renameCursor }]"
                >
                  {{ i === renameCursor ? (renameOptions[renamePickerIndex] || '_') : (ch || '_') }}
                </span>
              </div>
              <div v-if="renameError" class="rename-error">{{ renameError }}</div>
            </div>
            <div v-else>
              <div
                v-for="opt in menuVisibleEntries"
                :key="opt.key"
                :class="['menu-row', { selected: opt.index === menuIndex }]"
              >
                <span class="menu-caret">{{ opt.index === menuIndex ? '▶' : '\u00A0' }}</span>
                <span class="menu-text">{{ opt.label }}</span>
              </div>
            </div>
          </div>
        </div>
        <!-- HUD: Health bar -->
        <div v-if="!noMonster && isLoaded" class="hud">
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
          v-show="isLoaded && !noMonster"
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
import { useRouter } from 'vue-router'

/**
 * CONFIG
 * - "steps" are discrete positions across the canvas width.
 * - 1 GIF frame == 1 step (as requested).
 */
const STEPS_WIDE = 100
const FRAME_MS = 100 // controls pace; 100–160 feels nice for digivice vibes

// Sprite sources (dynamic; required from selected monster)
const walkSpriteSrc = ref('')
const idleSpriteSrc = ref('')
const jumpSpriteSrc = ref('')
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
const menuIndex = ref(0)
const menuMode = ref('main') // 'main' | 'eat' | 'change' | 'rename'
const mainMenuOptions = ['SCAN', 'EAT', 'BATTLE', 'CHANGE MONSTER', 'RENAME MONSTER', 'EXIT']
const healItems = ref([])
const otherMonsters = ref([])
const currentMonsterId = ref(null)
const currentMonsterName = ref('')
const renameChars = ref(Array.from({ length: 10 }, () => ''))
const renameCursor = ref(0)
const renamePickerIndex = ref(0)
const renameError = ref('')
const renameOptions = [
  '',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
]
const router = useRouter()

const menuEntries = computed(() => {
  if (menuMode.value === 'main' && noMonster.value) {
    return [
      { key: 'SCAN', label: 'SCAN', action: 'SCAN' },
      { key: 'EXIT', label: 'EXIT', action: 'EXIT' },
    ]
  }
  if (menuMode.value === 'eat') {
    const items = healItems.value.map((it) => ({
      key: it.id,
      label: `${it.name} (+${it.power} HP)`,
      action: 'item',
      item: it,
    }))
    return [
      ...items,
      { key: 'back', label: 'BACK', action: 'back' },
    ]
  }
  if (menuMode.value === 'change') {
    const entries = otherMonsters.value.map((m) => ({
      key: m.id,
      label: `${m.displayName} — HP ${m.hp} ATK ${m.atk} DEF ${m.def}`,
      action: 'monster',
      monster: m,
    }))
    return [
      ...entries,
      { key: 'back', label: 'BACK', action: 'back' },
    ]
  }
  if (menuMode.value === 'rename') {
    return [
      { key: 'rename', label: 'RENAME', action: 'rename' },
    ]
  }
  return mainMenuOptions.map((opt) => ({ key: opt, label: opt, action: opt }))
})

const MENU_ROW_HEIGHT = 52
const MENU_PADDING_Y = 32
const menuVisibleRows = computed(() => Math.max(1, Math.floor((canvasHeight - MENU_PADDING_Y) / MENU_ROW_HEIGHT)))
const menuScrollable = computed(() => menuEntries.value.length > menuVisibleRows.value)
const menuWindowStart = computed(() => {
  const total = menuEntries.value.length
  const visible = menuVisibleRows.value
  if (total <= visible) return 0
  const maxStart = total - visible
  const cur = menuIndex.value
  return Math.min(Math.max(cur - visible + 1, 0), maxStart)
})
const menuVisibleEntries = computed(() => {
  if (!menuScrollable.value) {
    return menuEntries.value.map((entry, idx) => ({ ...entry, index: idx }))
  }
  const start = menuWindowStart.value
  const end = start + menuVisibleRows.value
  return menuEntries.value.slice(start, end).map((entry, idx) => ({
    ...entry,
    index: start + idx,
  }))
})

function openMenu() {
  isMenuOpen.value = true
  menuMode.value = 'main'
  menuIndex.value = 0
}

function closeMenu() {
  isMenuOpen.value = false
  menuMode.value = 'main'
}

function onBtnLeft() {
  if (isCutscene.value) return
  if (!isMenuOpen.value) return openMenu()
  if (menuMode.value === 'rename') {
    renameError.value = ''
    renamePickerIndex.value = (renamePickerIndex.value - 1 + renameOptions.length) % renameOptions.length
    return
  }
  // navigate up
  menuIndex.value = (menuIndex.value - 1 + menuEntries.value.length) % menuEntries.value.length
}

function onBtnCenter() {
  if (isCutscene.value) return
  if (!isMenuOpen.value) return openMenu()
  if (menuMode.value === 'rename') {
    renameError.value = ''
    renamePickerIndex.value = (renamePickerIndex.value + 1) % renameOptions.length
    return
  }
  // navigate down
  menuIndex.value = (menuIndex.value + 1) % menuEntries.value.length
}

function onBtnRight() {
  if (isCutscene.value) return
  if (!isMenuOpen.value) return openMenu()
  // select current option
  const entry = menuEntries.value[menuIndex.value]
  if (!entry) return
  if (menuMode.value === 'main') {
    if (entry.action === 'CHANGE MONSTER') {
      openChangeMenu()
    } else if (entry.action === 'RENAME MONSTER') {
      openRenameMenu()
    } else if (entry.action === 'SCAN') {
      closeMenu()
      router.push('/monsters/scan')
    } else if (entry.action === 'EAT') {
      openEatMenu()
    } else if (entry.action === 'BATTLE') {
      performBattle()
    } else if (entry.action === 'EXIT') {
      closeMenu()
    } else {
      closeMenu()
    }
    return
  }

  if (menuMode.value === 'rename') {
    handleRenameSelect()
    return
  }

  if (entry.action === 'back') {
    menuMode.value = 'main'
    menuIndex.value = 0
    return
  }
  if (entry.action === 'item' && entry.item) {
    useHealItem(entry.item)
    return
  }
  if (entry.action === 'monster' && entry.monster) {
    selectMonster(entry.monster)
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
const currentSpriteSrc = ref(walkSpriteSrc.value)
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
const maxHealth = ref(100)
const health = ref(50)
const healthPercent = computed(() => Math.max(0, Math.min(100, Math.round((health.value / maxHealth.value) * 100))))
const healthTier = computed(() => {
  const pct = maxHealth.value > 0 ? (health.value / maxHealth.value) * 100 : 0
  if (pct < 25) return 'red'
  if (pct < 50) return 'yellow' // 25-49
  return 'green' // >= 50
})

function randInt(min, max) { // inclusive of both ends
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function enterState(next) {
  state = next
  if (state === 'idle') {
    currentSpriteSrc.value = idleSpriteSrc.value
    stateRemainingMs = randInt(IDLE_MIN_MS, IDLE_MAX_MS)
  } else if (state === 'walk') {
    currentSpriteSrc.value = walkSpriteSrc.value
    stateRemainingMs = randInt(WALK_MIN_MS, WALK_MAX_MS)
  } else if (state === 'jump') {
    currentSpriteSrc.value = jumpSpriteSrc.value
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

function resolveItemImages(item) {
  const img0 = item?.itemImage0Path || item?.itemImage1Path || item?.itemImage2Path || null
  const img1 = item?.itemImage1Path || img0
  const img2 = item?.itemImage2Path || img1 || img0
  return [img0, img1, img2]
}

async function performEatWithItem(item) {
  // Close menu and pause normal behavior
  isMenuOpen.value = false
  isCutscene.value = true

  // Move monster to center and hold position
  stepX = Math.floor((STEPS_WIDE - 1) / 2)
  currentSpriteSrc.value = idleSpriteSrc.value

  const [img0, img1, img2] = resolveItemImages(item)
  // Show initial item in front
  itemSrc.value = img0 || APPLE0_SRC
  itemVisible.value = true
  await sleep(400)

  // Helper to play a single bite: jump -> standstill -> update apple
  const bite = async (nextAppleSrcOrNull) => {
    currentSpriteSrc.value = jumpSpriteSrc.value
    await sleep(600)
    currentSpriteSrc.value = idleSpriteSrc.value
    // Update apple AFTER returning to standstill
    if (nextAppleSrcOrNull === null) {
      itemVisible.value = false
    } else {
      itemSrc.value = nextAppleSrcOrNull
    }
    await sleep(400)
  }

  // Bite 1 updates to apple1
  await bite(img1 || img0 || APPLE1_SRC)
  // Bite 2 updates to apple2
  await bite(img2 || img1 || img0 || APPLE2_SRC)
  // Bite 3 hides apple
  await bite(null)

  // Heal on eat completion
  const healAmount = Number(item?.power) || 0
  health.value = Math.min(maxHealth.value, health.value + healAmount)

  // Resume
  enterState('walk')
  isCutscene.value = false
}

async function loadHealItems() {
  try {
    const res = await $fetch('/api/monsters/items')
    healItems.value = Array.isArray(res?.items) ? res.items : []
  } catch (e) {
    healItems.value = []
  }
}

function openEatMenu() {
  menuMode.value = 'eat'
  menuIndex.value = 0
  loadHealItems()
}

async function useHealItem(item) {
  try {
    const res = await $fetch('/api/monsters/items/use', {
      method: 'POST',
      body: { id: item.id }
    })
    healItems.value = healItems.value.filter((it) => it.id !== item.id)
    if (menuIndex.value >= menuEntries.value.length) menuIndex.value = Math.max(0, menuEntries.value.length - 1)
    await performEatWithItem(res?.item || item)
    if (res?.hp != null) {
      const hp = Number(res.hp)
      health.value = Number.isFinite(hp) ? Math.max(0, Math.min(maxHealth.value, hp)) : health.value
    }
  } catch (e) {
    healItems.value = healItems.value.filter((it) => it.id !== item.id)
    if (menuIndex.value >= menuEntries.value.length) menuIndex.value = Math.max(0, menuEntries.value.length - 1)
  }
}

async function loadOtherMonsters() {
  try {
    const res = await $fetch('/api/monsters/list')
    const all = Array.isArray(res?.monsters) ? res.monsters : []
    otherMonsters.value = all.filter((m) => m.id !== currentMonsterId.value)
  } catch (e) {
    otherMonsters.value = []
  }
}

function openChangeMenu() {
  menuMode.value = 'change'
  menuIndex.value = 0
  loadOtherMonsters()
}

async function selectMonster(monster) {
  try {
    await $fetch('/api/monsters/select', { method: 'POST', body: { id: monster.id } })
    await loadSelectedMonster()
  } catch (e) {
    // ignore selection failures
  } finally {
    closeMenu()
  }
}

function openRenameMenu() {
  menuMode.value = 'rename'
  menuIndex.value = 0
  const baseName = currentMonsterName.value || ''
  const letters = baseName.replace(/[^A-Za-z]/g, '').slice(0, 10).split('')
  const slots = Array.from({ length: 10 }, () => '')
  letters.forEach((ch, i) => { slots[i] = ch })
  renameChars.value = slots
  renameCursor.value = 0
  const firstChar = renameChars.value[0] || ''
  const firstIndex = renameOptions.indexOf(firstChar)
  renamePickerIndex.value = firstIndex >= 0 ? firstIndex : 0
  renameError.value = ''
}

async function handleRenameSelect() {
  renameError.value = ''
  renameChars.value[renameCursor.value] = renameOptions[renamePickerIndex.value]
  if (renameCursor.value < renameChars.value.length - 1) {
    renameCursor.value += 1
    const nextChar = renameChars.value[renameCursor.value] || ''
    const nextIndex = renameOptions.indexOf(nextChar)
    renamePickerIndex.value = nextIndex >= 0 ? nextIndex : 0
    return
  }

  const hasLetter = renameChars.value.some((ch) => ch)
  if (!hasLetter) {
    renameError.value = 'Name must include at least 1 letter.'
    renameCursor.value = 0
    renamePickerIndex.value = 0
    return
  }

  const name = renameChars.value.join('').replace(/\s+$/g, '')
  try {
    await $fetch('/api/monsters/rename', { method: 'POST', body: { name } })
    menuMode.value = 'main'
    menuIndex.value = 0
  } catch (e) {
    renameError.value = 'Failed to rename.'
  }
}

const noMonster = ref(false)

async function performBattle() {
  if (!currentMonsterId.value) {
    closeMenu()
    return
  }
  try {
    const res = await $fetch('/api/monsters/battle', { method: 'POST' })
    if (res?.monster?.hp != null) {
      const hp = Number(res.monster.hp)
      health.value = Number.isFinite(hp) ? Math.max(0, Math.min(maxHealth.value, hp)) : health.value
    }
  } catch (e) {
    // ignore battle failures
  } finally {
    closeMenu()
  }
}

async function loadSelectedMonster() {
  try {
    const selected = await $fetch('/api/monsters/selected-monster')
    if (!selected?.monster) {
      noMonster.value = true
      return false
    }
    noMonster.value = false
    currentMonsterId.value = selected.monster.id
    currentMonsterName.value = selected.monster.customName || selected.species?.name || selected.monster.name || ''
    if (selected.src?.walk) walkSpriteSrc.value = selected.src.walk
    if (selected.src?.idle) idleSpriteSrc.value = selected.src.idle
    if (selected.src?.jump) jumpSpriteSrc.value = selected.src.jump
    if (selected.monster?.maxHealth != null) {
      const maxHp = Number(selected.monster.maxHealth)
      maxHealth.value = Number.isFinite(maxHp) ? Math.max(1, maxHp) : maxHealth.value
    }
    if (selected.monster?.hp != null) {
      const hp = Number(selected.monster.hp)
      health.value = Number.isFinite(hp) ? Math.max(0, Math.min(maxHealth.value, hp)) : health.value
    }
    if (state === 'walk') currentSpriteSrc.value = walkSpriteSrc.value
    else if (state === 'idle') currentSpriteSrc.value = idleSpriteSrc.value
    else if (state === 'jump') currentSpriteSrc.value = jumpSpriteSrc.value
    return true
  } catch (e) {
    noMonster.value = true
    return false
  }
}

onMounted(async () => {
  ctx = canvas.value.getContext('2d')
  ctx.imageSmoothingEnabled = false

  // initial scale + resize
  updateScale()
  window.addEventListener('resize', updateScale)
  window.addEventListener('orientationchange', updateScale)

  const hasMonster = await loadSelectedMonster()
  if (!hasMonster) {
    // Do not preload or start the game loop if no monster exists
    return
  }

  try {
    // Preload both animations
    ;[walkImg, idleImg, jumpImg] = await Promise.all([
      loadSprite(walkSpriteSrc.value),
      loadSprite(idleSpriteSrc.value),
      loadSprite(jumpSpriteSrc.value),
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

@media (max-width: 640px) {
  .healthbar-label { font-size: 20px; }
  .menu-box { font-size: 28px; }
  .menu-row { height: 64px; }
  .menu-caret { width: 28px; }
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

.no-monster-msg {
  color: #10310f;
  background: rgba(255,255,255,0.7);
  border: 2px solid rgba(44,74,29,0.5);
  border-radius: 8px;
  padding: 10px 14px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  text-align: center;
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
.menu-box--scroll {
  justify-content: flex-start;
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

.rename-panel {
  display: grid;
  gap: 10px;
  text-align: center;
  text-transform: none;
  letter-spacing: 0;
}
.rename-title {
  font-weight: 800;
  font-size: 22px;
}
.rename-slots {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 6px;
}
.rename-slot {
  background: rgba(255,255,255,0.45);
  border: 2px solid rgba(44,74,29,0.4);
  border-radius: 6px;
  padding: 8px 0;
  font-size: 20px;
  font-weight: 800;
}
.rename-slot.active {
  background: rgba(44,74,29,0.2);
  border-color: rgba(44,74,29,0.7);
}
.rename-error {
  color: #8a1d1d;
  font-size: 14px;
  font-weight: 700;
}

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
