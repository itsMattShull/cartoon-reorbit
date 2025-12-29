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
        <div v-if="!noMonster && isLoaded && !battleId" class="hud">
          <div class="healthbar">
            <div class="healthbar-fill" :class="'is-' + healthTier" :style="{ width: healthPercent + '%' }"></div>
            <div class="healthbar-frame"></div>
            <div class="healthbar-label">{{ health }}/{{ maxHealth }}</div>
          </div>
        </div>
        <div v-if="battleId && battleState" class="battle-hud">
          <div class="battle-hud-bar">
            <div class="battle-hud-name">You</div>
            <div class="battle-hud-meter">
              <div class="battle-hud-fill" :style="{ width: (displayHpLeft ?? 0) / (myParticipant?.maxHealth || 1) * 100 + '%' }"></div>
            </div>
            <div class="battle-hud-hp">
              <span>{{ displayHpLeft ?? 0 }}/{{ myParticipant?.maxHealth ?? 0 }}</span>
              <span class="battle-hud-blocks-inline">Blocks: {{ myParticipant?.blocksRemaining ?? 0 }}</span>
            </div>
          </div>
          <div class="battle-hud-bar">
            <div class="battle-hud-name">{{ opponentParticipant?.isAi ? 'AI' : 'Opponent' }}</div>
            <div class="battle-hud-meter">
              <div class="battle-hud-fill is-opponent" :style="{ width: (displayHpRight ?? 0) / (opponentParticipant?.maxHealth || 1) * 100 + '%' }"></div>
            </div>
            <div class="battle-hud-hp">
              <span>{{ displayHpRight ?? 0 }}/{{ opponentParticipant?.maxHealth ?? 0 }}</span>
              <span class="battle-hud-blocks-inline">Blocks: {{ opponentParticipant?.blocksRemaining ?? 0 }}</span>
            </div>
          </div>
        </div>
        <div v-if="battleId && battleState" class="battle-action-bar">
          <div
            v-for="(entry, idx) in battleActionItems"
            :key="entry.key"
            :class="['battle-action-item', { active: idx === battleActionIndex, disabled: entry.disabled }]"
          >
            <span class="battle-action-caret">{{ idx === battleActionIndex ? '▶' : ' ' }}</span>
            <span>{{ entry.label }}</span>
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
            height: spriteHeight,
            transform: spriteTransform,
          }"
          alt="sprite"
        />
        <img
          v-if="battleId && battleState"
          ref="opponentSpriteEl"
          class="sprite-dom sprite-dom--opponent"
          :src="opponentSpriteSrc"
          :style="{
            left: opponentSpriteLeft,
            top: opponentSpriteTop,
            width: spriteDrawW + 'px',
            height: opponentSpriteHeight,
            transform: opponentSpriteTransform,
          }"
          alt="opponent sprite"
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
      <button class="gb-btn gb-btn--up" aria-label="Button A" @click="onBtnLeft">
        <span class="gb-btn__icon gb-btn__icon--up" aria-hidden="true"></span>
      </button>
      <button class="gb-btn gb-btn--center gb-btn--enter" aria-label="Button B" @click="onBtnCenter">
        <span class="gb-btn__icon gb-btn__icon--enter" aria-hidden="true"></span>
      </button>
      <button class="gb-btn gb-btn--down" aria-label="Button C" @click="onBtnRight">
        <span class="gb-btn__icon gb-btn__icon--down" aria-hidden="true"></span>
      </button>
    </div>
  </div>


  <div v-if="showBattleModal" class="battle-modal">
    <div class="battle-modal-backdrop"></div>
    <div class="battle-modal-shell">
      <header class="battle-modal-header">
        <div class="battle-modal-title">Battle Results</div>
        <button class="battle-modal-close" @click="closeBattleModal">✕</button>
      </header>
      <div class="battle-modal-body">
        <div class="battle-modal-winner">Winner: {{ battleWinnerLabel }}</div>
        <div class="battle-modal-reason">Reason: {{ battleOutcome?.endReason }}</div>
        <div class="battle-modal-log">
          <div class="battle-modal-log-title">Turn Log</div>
          <div v-if="!battleOutcome?.turnLog?.length" class="battle-modal-log-empty">No turns recorded.</div>
          <div v-for="turn in battleOutcome?.turnLog || []" :key="turn.turnNumber" class="battle-modal-log-entry">
            <div class="battle-modal-log-line">Turn {{ turn.turnNumber }} — First: {{ turn.firstActor || 'None' }}</div>
            <div class="battle-modal-log-line">Actions: P1 {{ turn.actions?.player1 || '-' }} / P2 {{ turn.actions?.player2 || '-' }}</div>
            <div class="battle-modal-log-line">Damage: P1 {{ turn.damage?.player1 ?? 0 }} / P2 {{ turn.damage?.player2 ?? 0 }}</div>
            <div class="battle-modal-log-line">HP After: P1 {{ turn.hpAfter?.player1 ?? 0 }} / P2 {{ turn.hpAfter?.player2 ?? 0 }}</div>
          </div>
        </div>
      </div>
      <footer class="battle-modal-footer">
        <button class="btn-primary" @click="closeBattleModal">Back to Monsters</button>
      </footer>
    </div>
  </div>
  
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { useAuth } from '@/composables/useAuth'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
  alias: ['/monsters/:battleId']
})

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
const opponentSpriteEl = ref(null)
const stageShell = ref(null)
let ctx = null

let rafId = 0
let lastTick = 0

// Sprite assets (preloaded)
let walkImg = null
let idleImg = null
let jumpImg = null
const isLoaded = ref(false)
const opponentSpriteSrc = ref('')
const opponentSpriteLeft = ref('0px')
const opponentSpriteTop = ref('0px')
const opponentSpriteTransform = ref('scaleX(-1)')
const battleAttackTimers = { player: null, opponent: null }
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
const { user, fetchSelf } = useAuth()
await fetchSelf()
const router = useRouter()
const route = useRoute()
const config = useRuntimeConfig()

let battleSocket = null
const battleState = ref(null)
const battleResult = ref(null)
const battleOutcome = ref(null)
const battleError = ref('')
const pendingAction = ref(null)
const battleLeftSprites = ref({ walk: null, idle: null, jump: null })
const battleRightSprites = ref({ walk: null, idle: null, jump: null })
const displayHpLeft = ref(0)
const displayHpRight = ref(0)
const battlePlaybackActive = ref(false)
const battleActionIndex = ref(0)
const battleActionItems = computed(() => ([
  { key: 'ATTACK', label: 'ATTACK', disabled: !battleActive.value || myActionSubmitted.value || pendingAction.value || battlePlaybackActive.value },
  { key: 'BLOCK', label: 'BLOCK', disabled: !battleActive.value || myActionSubmitted.value || pendingAction.value || battlePlaybackActive.value || !canBlock.value },
  { key: 'RETREAT', label: 'RETREAT', disabled: !battleActive.value || myActionSubmitted.value || pendingAction.value || battlePlaybackActive.value || !canRetreat.value }
]))
const battleId = computed(() => (route.params?.battleId ? String(route.params.battleId) : null))
const isInBattle = computed(() => Boolean(battleId.value))
const myPlayerKey = computed(() => {
  if (!battleState.value || !user.value?.id) return null
  const p1 = battleState.value.participants?.player1
  const p2 = battleState.value.participants?.player2
  if (p1?.userId && String(p1.userId) === String(user.value.id)) return 'player1'
  if (p2?.userId && String(p2.userId) === String(user.value.id)) return 'player2'
  return null
})
const myParticipant = computed(() => {
  if (!myPlayerKey.value) return null
  return battleState.value?.participants?.[myPlayerKey.value] || null
})
const opponentParticipant = computed(() => {
  if (!myPlayerKey.value) return null
  const key = myPlayerKey.value === 'player1' ? 'player2' : 'player1'
  return battleState.value?.participants?.[key] || null
})
const myActionSubmitted = computed(() => {
  if (!myPlayerKey.value) return false
  return Boolean(battleState.value?.actionsSubmitted?.[myPlayerKey.value])
})
const canRetreat = computed(() => Boolean(myParticipant.value && !myParticipant.value.isAi))
const canBlock = computed(() => (myParticipant.value?.blocksRemaining ?? 0) > 0)
const battleActive = computed(() => battleState.value?.status === 'active')
const battleStatusText = computed(() => {
  if (!battleState.value) return 'Idle'
  if (battleState.value.status === 'finished') return `Finished (${battleState.value.endReason || 'UNKNOWN'})`
  return `Turn ${battleState.value.turnNumber}`
})
const myDamage = computed(() => {
  if (!battleResult.value || !myPlayerKey.value) return null
  return battleResult.value.damage?.[myPlayerKey.value] ?? 0
})
const opponentDamage = computed(() => {
  if (!battleResult.value || !myPlayerKey.value) return null
  const key = myPlayerKey.value === 'player1' ? 'player2' : 'player1'
  return battleResult.value.damage?.[key] ?? 0
})
const myDodged = computed(() => {
  if (!battleResult.value || !myPlayerKey.value) return null
  return Boolean(battleResult.value.dodge?.[myPlayerKey.value])
})
const opponentDodged = computed(() => {
  if (!battleResult.value || !myPlayerKey.value) return null
  const key = myPlayerKey.value === 'player1' ? 'player2' : 'player1'
  return Boolean(battleResult.value.dodge?.[key])
})
const showBattleModal = computed(() => Boolean(battleOutcome.value))
const battleWinnerLabel = computed(() => {
  if (!battleOutcome.value) return 'Unknown'
  const winner = battleOutcome.value?.winner
  if (!winner) return 'No winner'
  const myId = String(user.value?.id || '')
  if (winner.userId && String(winner.userId) === myId) return 'You'
  if (winner.isAi) return 'AI'
  return 'Opponent'
})

const closeBattleModal = () => {
  battleOutcome.value = null
  router.push('/monsters').then(() => {
    loadSelectedMonster()
  })
}

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
  if (isInBattle.value) {
    const total = battleActionItems.value.length
    if (!total) return
    battleActionIndex.value = (battleActionIndex.value - 1 + total) % total
    return
  }
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
  if (isInBattle.value) {
    const entry = battleActionItems.value[battleActionIndex.value]
    if (!entry || entry.disabled) return
    submitBattleAction(entry.key)
    return
  }
  if (isCutscene.value) return
  if (!isMenuOpen.value) return openMenu()
  // confirm/select
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

function onBtnRight() {
  if (isInBattle.value) {
    const total = battleActionItems.value.length
    if (!total) return
    battleActionIndex.value = (battleActionIndex.value + 1) % total
    return
  }
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
const spriteHeight = ref(`${spriteDrawH}px`)
const opponentSpriteHeight = ref(`${spriteDrawH}px`)

function getSpriteHeight(imgEl) {
  const img = imgEl
  if (img && img.naturalWidth && img.naturalHeight) {
    return Math.round(spriteDrawW * (img.naturalHeight / img.naturalWidth))
  }
  return spriteDrawH
}

function drawSprite() {
  if (isInBattle.value) {
    const leftX = Math.round(canvasWidth * 0.2)
    const rightX = Math.round(canvasWidth * 0.7)
    const leftH = getSpriteHeight(spriteEl.value)
    const rightH = getSpriteHeight(opponentSpriteEl.value)
    const yLeft = floorY - leftH
    const yRight = floorY - rightH
    spriteHeight.value = `${leftH}px`
    opponentSpriteHeight.value = `${rightH}px`
    spriteLeft.value = `${BORDER_W + leftX}px`
    spriteTop.value = `${BORDER_W + yLeft + 10}px`
    spriteTransform.value = 'scaleX(1)'
    opponentSpriteLeft.value = `${BORDER_W + rightX}px`
    opponentSpriteTop.value = `${BORDER_W + yRight + 10}px`
    opponentSpriteTransform.value = 'scaleX(-1)'
    return
  }
  const x = stepToPx(stepX)
  const spriteH = (() => {
    const img = spriteEl.value
    if (img && img.naturalWidth && img.naturalHeight) {
      return Math.round(spriteDrawW * (img.naturalHeight / img.naturalWidth))
    }
    return spriteDrawH
  })()
  const y = floorY - spriteH

  // Update overlayed <img> position and flip (account for canvas border)
  spriteHeight.value = `${spriteH}px`
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
  if (isInBattle.value) return
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

const resetBattleUi = () => {
  battleState.value = null
  battleResult.value = null
  battleOutcome.value = null
  battleError.value = ''
  pendingAction.value = null
  battleLeftSprites.value = { walk: null, idle: null, jump: null }
  battleRightSprites.value = { walk: null, idle: null, jump: null }
  opponentSpriteSrc.value = ''
  if (battleAttackTimers.player) clearTimeout(battleAttackTimers.player)
  if (battleAttackTimers.opponent) clearTimeout(battleAttackTimers.opponent)
  battleAttackTimers.player = null
  battleAttackTimers.opponent = null
  displayHpLeft.value = 0
  displayHpRight.value = 0
  battlePlaybackActive.value = false
  battleActionIndex.value = 0
}

const syncBattleSprites = () => {
  if (!isInBattle.value || !battleState.value) return
  const left = myParticipant.value
  const right = opponentParticipant.value
  if (!left || !right) return
  battleLeftSprites.value = left.sprites || { walk: null, idle: null, jump: null }
  battleRightSprites.value = right.sprites || { walk: null, idle: null, jump: null }
  if (!battlePlaybackActive.value) {
    currentSpriteSrc.value = battleLeftSprites.value.walk || battleLeftSprites.value.idle || currentSpriteSrc.value
    opponentSpriteSrc.value = battleRightSprites.value.walk || battleRightSprites.value.idle || opponentSpriteSrc.value
  }
}

const playBattleAttack = (attackerKey) => {
  if (!isInBattle.value || !battleState.value) return
  const isPlayerLeft = attackerKey === myPlayerKey.value
  const sprites = isPlayerLeft ? battleLeftSprites.value : battleRightSprites.value
  const targetRef = isPlayerLeft ? currentSpriteSrc : opponentSpriteSrc
  const timerKey = isPlayerLeft ? 'player' : 'opponent'
  if (!sprites?.jump) return
  if (battleAttackTimers[timerKey]) clearTimeout(battleAttackTimers[timerKey])
  targetRef.value = sprites.jump
  battleAttackTimers[timerKey] = setTimeout(() => {
    targetRef.value = sprites.walk || sprites.idle || sprites.jump
  }, 2000)
}

const setDisplayHpFromState = () => {
  if (!battleState.value) return
  displayHpLeft.value = myParticipant.value?.currentHp ?? 0
  displayHpRight.value = opponentParticipant.value?.currentHp ?? 0
}

const setDisplayHpFromResult = (hpAfter) => {
  if (!hpAfter || !myPlayerKey.value) return
  if (myPlayerKey.value === 'player1') {
    displayHpLeft.value = hpAfter.player1 ?? displayHpLeft.value
    displayHpRight.value = hpAfter.player2 ?? displayHpRight.value
  } else {
    displayHpLeft.value = hpAfter.player2 ?? displayHpLeft.value
    displayHpRight.value = hpAfter.player1 ?? displayHpRight.value
  }
}

const playTurnSequence = async (payload, startHp = {}) => {
  if (!payload) return
  if (!myPlayerKey.value) return
  battlePlaybackActive.value = true
  const hpLeft = Number.isFinite(startHp.left) ? startHp.left : displayHpLeft.value
  const hpRight = Number.isFinite(startHp.right) ? startHp.right : displayHpRight.value
  let workingLeft = hpLeft
  let workingRight = hpRight
  displayHpLeft.value = workingLeft
  displayHpRight.value = workingRight
  const leftKey = myPlayerKey.value
  const actions = payload.actions || {}
  const order = []
  if (actions.player1 === 'ATTACK' || actions.player2 === 'ATTACK') {
    if (actions.player1 === 'ATTACK' && actions.player2 === 'ATTACK') {
      const first = payload.firstActor || 'player1'
      order.push(first)
      order.push(first === 'player1' ? 'player2' : 'player1')
    } else if (actions.player1 === 'ATTACK') {
      order.push('player1')
    } else if (actions.player2 === 'ATTACK') {
      order.push('player2')
    }
  }

  for (const attacker of order) {
    if (actions[attacker] !== 'ATTACK') continue
    const defender = attacker === 'player1' ? 'player2' : 'player1'
    const defenderIsLeft = defender === leftKey
    const defenderHp = defenderIsLeft ? workingLeft : workingRight
    if ((defenderHp ?? 0) <= 0) break
    playBattleAttack(attacker)
    await sleep(2000)
    const damage = payload.results?.damage?.[attacker] ?? 0
    if (defenderIsLeft) {
      workingLeft = Math.max(0, (workingLeft ?? 0) - damage)
      displayHpLeft.value = workingLeft
    } else {
      workingRight = Math.max(0, (workingRight ?? 0) - damage)
      displayHpRight.value = workingRight
    }
  }

  battlePlaybackActive.value = false
  if (payload?.results?.hpAfter) {
    setDisplayHpFromResult(payload.results.hpAfter)
  }
  syncBattleSprites()
}

const connectBattleSocket = () => {
  if (battleSocket) return
  const path = import.meta.env.PROD
    ? 'https://www.cartoonreorbit.com'
    : `http://localhost:${config.public.socketPort}`

  battleSocket = io(path, {
    transports: ['websocket', 'polling']
  })

  battleSocket.on('connect', () => {
    if (battleId.value) joinBattle(battleId.value)
  })

  battleSocket.on('battle:created', ({ battleId: newId }) => {
    if (!newId) return
    resetBattleUi()
    router.push(`/monsters/${newId}`)
  })

  battleSocket.on('battle:state', (state) => {
    battleState.value = state
    battleError.value = ''
    pendingAction.value = null
    if (!battlePlaybackActive.value) {
      setDisplayHpFromState()
    }
    syncBattleSprites()
  })

  battleSocket.on('battle:actionAccepted', ({ battleId: acceptedId, playerId }) => {
    if (acceptedId !== battleId.value) return
    if (String(playerId) === String(user.value?.id)) {
      pendingAction.value = 'LOCKED'
    }
  })

  battleSocket.on('battle:turnResolved', (payload) => {
    if (!payload || payload.battleId !== battleId.value) return
    const startHp = { left: displayHpLeft.value, right: displayHpRight.value }
    battleResult.value = payload.results || null
    if (payload.updatedState) battleState.value = payload.updatedState
    pendingAction.value = null
    syncBattleSprites()
    playTurnSequence(payload, startHp)
  })

  battleSocket.on('battle:finished', (payload) => {
    if (!payload || payload.battleId !== battleId.value) return
    battleOutcome.value = payload
    if (payload.finalState) battleState.value = payload.finalState
    pendingAction.value = null
    setDisplayHpFromState()
    syncBattleSprites()
  })

  battleSocket.on('battle:error', ({ message }) => {
    battleError.value = message || 'Battle error.'
    pendingAction.value = null
  })
}

const joinBattle = (id) => {
  if (!battleSocket || !id) return
  battleSocket.emit('battle:join', { battleId: id, userId: user.value?.id })
}

const submitBattleAction = (action) => {
  if (!battleSocket || !battleId.value || !battleState.value) return
  if (!battleActive.value || myActionSubmitted.value || pendingAction.value || battlePlaybackActive.value) return
  battleActionIndex.value = 0
  battleSocket.emit('battle:chooseAction', {
    battleId: battleId.value,
    turnNumber: battleState.value.turnNumber,
    action
  })
}

watch(battleId, (nextId) => {
  if (!nextId) {
    resetBattleUi()
    if (!isCutscene.value && isLoaded.value && walkSpriteSrc.value) {
      enterState('walk')
    }
    loadSelectedMonster()
    return
  }
  if (battleSocket?.connected) joinBattle(nextId)
}, { immediate: true })

watch([myParticipant, opponentParticipant, isInBattle], () => {
  syncBattleSprites()
  if (!battlePlaybackActive.value) {
    setDisplayHpFromState()
  }
}, { immediate: true })

async function performBattle() {
  if (!currentMonsterId.value) {
    closeMenu()
    return
  }
  if (!user.value?.id) {
    battleError.value = 'Unable to start battle.'
    closeMenu()
    return
  }
  if (!battleSocket) connectBattleSocket()
  battleError.value = ''
  const payload = {
    player1UserId: user.value?.id,
    player1MonsterId: currentMonsterId.value,
    opponent: { type: 'AI' }
  }
  if (battleSocket.connected) {
    battleSocket.emit('battle:create', payload)
  } else {
    battleSocket.once('connect', () => {
      battleSocket.emit('battle:create', payload)
    })
    battleSocket.connect()
  }
  closeMenu()
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

  connectBattleSocket()

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
  if (battleSocket) {
    battleSocket.off('battle:created')
    battleSocket.off('battle:state')
    battleSocket.off('battle:actionAccepted')
    battleSocket.off('battle:turnResolved')
    battleSocket.off('battle:finished')
    battleSocket.off('battle:error')
    battleSocket.disconnect()
    battleSocket = null
  }
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

.sprite-dom--opponent {
  z-index: 2;
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

.battle-hud {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 8px;
  z-index: 3;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  pointer-events: none;
}

.battle-hud-bar {
  flex: 1;
  background: rgba(214, 239, 158, 0.85);
  border: 2px solid #2c4a1d;
  border-radius: 8px;
  padding: 6px 8px;
  text-transform: uppercase;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  color: #1f3813;
}

.battle-hud-name {
  font-weight: 800;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.battle-hud-meter {
  height: 10px;
  background: #cfe9a2;
  border: 1px solid #2c4a1d;
  border-radius: 6px;
  overflow: hidden;
}

.battle-hud-fill {
  height: 100%;
  background: linear-gradient(90deg, #8dd16a, #5fb44b);
}

.battle-hud-fill.is-opponent {
  background: linear-gradient(90deg, #f58a8a, #d15c5c);
}

.battle-hud-hp {
  margin-top: 4px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.battle-hud-blocks-inline {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-left: auto;
}

.battle-action-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 86px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  z-index: 3;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  text-transform: uppercase;
  pointer-events: none;
}

.battle-action-item {
  border: 2px solid #2c4a1d;
  border-radius: 8px;
  padding: 6px 8px;
  background: rgba(214, 239, 158, 0.85);
  color: #1f3813;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
}

.battle-action-item.active {
  outline: 2px solid rgba(44, 74, 29, 0.6);
  background: rgba(170, 220, 110, 0.9);
}

.battle-action-item.disabled {
  opacity: 0.5;
}

.battle-action-caret {
  width: 16px;
  display: inline-block;
}

.battle-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #2c4a1d;
  font-weight: 700;
  text-align: center;
}

.battle-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
}

.battle-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.battle-modal-shell {
  position: relative;
  z-index: 1;
  width: min(720px, 92vw);
  max-height: 80vh;
  background: #f8fafc;
  border-radius: 14px;
  border: 3px solid #2c4a1d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.battle-modal-header,
.battle-modal-footer {
  background: #d6ef9e;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid rgba(44, 74, 29, 0.3);
}

.battle-modal-footer {
  border-top: 2px solid rgba(44, 74, 29, 0.3);
  border-bottom: none;
  justify-content: flex-end;
}

.battle-modal-title {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.battle-modal-close {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
}

.battle-modal-body {
  padding: 16px;
  overflow: auto;
}

.battle-modal-winner {
  font-weight: 800;
  margin-bottom: 6px;
}

.battle-modal-reason {
  margin-bottom: 12px;
}

.battle-modal-log-title {
  font-weight: 800;
  margin-bottom: 8px;
}

.battle-modal-log-entry {
  border-bottom: 1px dashed rgba(44, 74, 29, 0.3);
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.battle-modal-log-line {
  font-size: 13px;
  color: #1f3813;
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
  .menu-box { font-size: 42px; }
  .menu-row { height: 92px; }
  .menu-caret { width: 40px; }
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

.battle-panel {
  margin: 24px auto 32px;
  max-width: 720px;
  border: 3px solid #2c4a1d;
  background: #e6f4c6;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 6px 0 rgba(0,0,0,0.2);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: #1f3813;
}

.battle-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  gap: 12px;
}

.battle-title {
  font-size: 20px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.battle-status {
  font-size: 14px;
  font-weight: 700;
}

.battle-rows {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.battle-side {
  padding: 10px 12px;
  background: #d6ef9e;
  border: 2px solid rgba(44,74,29,0.4);
  border-radius: 10px;
}

.battle-label {
  font-weight: 800;
  margin-bottom: 6px;
}

.battle-stat {
  font-size: 14px;
}

.battle-loading {
  font-size: 14px;
  margin-bottom: 14px;
}

.battle-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.battle-action {
  padding: 10px 12px;
  border-radius: 8px;
  border: 2px solid #2c4a1d;
  background: #9ed15c;
  font-weight: 800;
  letter-spacing: 1px;
  cursor: pointer;
}

.battle-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.battle-log {
  background: #f2f8df;
  border: 2px dashed rgba(44,74,29,0.4);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.battle-log-title {
  font-weight: 800;
  margin-bottom: 6px;
}

.battle-log-row {
  font-size: 14px;
}

.battle-outcome {
  background: #d1f0bd;
  border: 2px solid rgba(44,74,29,0.4);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.battle-outcome-title {
  font-weight: 800;
  margin-bottom: 4px;
}

.battle-error {
  color: #7a1414;
  font-weight: 700;
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
  --gb-icon-color: #3c1528;
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

.gb-btn__icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.gb-btn__icon--up,
.gb-btn__icon--down {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
}

.gb-btn__icon--up {
  border-bottom: 12px solid var(--gb-icon-color);
}

.gb-btn__icon--down {
  border-top: 12px solid var(--gb-icon-color);
}

.gb-btn__icon--enter {
  width: 18px;
  height: 14px;
  border-right: 3px solid var(--gb-icon-color);
  border-bottom: 3px solid var(--gb-icon-color);
  border-radius: 2px;
}

.gb-btn__icon--enter::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 7px;
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-right: 6px solid var(--gb-icon-color);
}

.gb-btn__icon--enter::after {
  content: '';
  position: absolute;
  left: -2px;
  top: 8px;
  width: 8px;
  height: 3px;
  background: var(--gb-icon-color);
  border-radius: 2px;
}
</style>
