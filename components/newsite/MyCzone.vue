<template>
  <div class="myczone">

    <!-- ── Top bar ─────────────────────────────────────────── -->
    <div class="cz-topbar">
      <div class="cz-topbar-left">
        <OrangeButton v-if="isOwnZone" @click="toggleBuild" :disabled="buildLoading">
          {{ cz.buildMode ? 'Exit Build' : buildLoading ? 'Loading…' : 'Build' }}
        </OrangeButton>
        <NuxtLink v-else-if="viewedUsername" :to="`/newsite/trade?username=${encodeURIComponent(viewedUsername)}`" style="text-decoration:none;display:contents;">
          <OrangeButton>Trade</OrangeButton>
        </NuxtLink>
        <template v-if="!isOwnZone && viewedUsername">
          <OrangeButton class="cz-wl-btn" @click="openWishlistModal">
            Wishlist ({{ wishlistCountDisplay }})
          </OrangeButton>
          <OrangeButton class="cz-wl-btn" @click="openTradeListModal">
            Trade List ({{ tradeListCountDisplay }})
          </OrangeButton>
        </template>
        <template v-for="(zone, i) in cz.zones" :key="i">
          <button
            v-if="!zoneLoading && (cz.buildMode || zone.toons.length > 0)"
            class="cz-zone-tab" :class="{ active: cz.activeZone === i }"
            @click="cz.activeZone = i"
          >{{ i + 1 }}</button>
        </template>
      </div>
      <div class="cz-owner-info" v-if="zoneLoading || viewedOwner">
        <template v-if="zoneLoading">
          <div class="cz-owner-avatar cz-skeleton cz-skeleton-avatar"></div>
          <div class="cz-owner-label">
            <div class="cz-skeleton cz-skeleton-line cz-skeleton-username"></div>
            <div class="cz-skeleton cz-skeleton-line cz-skeleton-lastseen"></div>
          </div>
        </template>
        <template v-else>
          <img :src="`/avatars/${viewedOwner.avatar || 'default.png'}`" class="cz-owner-avatar" />
          <div class="cz-owner-label">
            <div><span class="cz-owner-prefix">Owner</span> {{ viewedOwner.username }}</div>
            <div v-if="lastOnlineText" class="cz-owner-lastseen">{{ lastOnlineText }}</div>
          </div>
        </template>
      </div>
    </div>

    <!-- ── Canvas: outer reserves scaled layout, inner holds the 800×600 transform ── -->
    <div class="cz-canvas-outer" :style="outerScaleStyle">
      <div class="cz-canvas-inner" :style="innerScaleStyle">
        <div
          class="cz-canvas"
          ref="canvasEl"
          :style="canvasStyle"
          @contextmenu.prevent="onContextMenu"
          @mousedown="onCanvasMouseDown"
          @touchstart="onCanvasTouchStart"
        >
          <div
            v-for="(toon, toonIdx) in currentZone.toons" :key="toon.id"
            class="cz-item"
            :class="{ 'is-dragging': localDrag?.toon?.id === toon.id, 'is-viewable': !cz.buildMode, 'is-build': cz.buildMode, 'is-long-pressing': longPressToon?.toon?.id === toon.id }"
            :style="{ left: toon.x + 'px', top: toon.y + 'px', width: toonW(toon) + 'px', height: toonH(toon) + 'px' }"
            @click.stop="onToonClick(toon)"
            @mousedown="cz.buildMode && onItemMouseDown(toon, $event)"
            @touchstart="cz.buildMode && onItemTouchStart(toon, $event)"
            @contextmenu.prevent.stop="cz.buildMode && removeToon(toon)"
          >

            <img
              :src="toon.assetPath" :alt="toon.name"
              class="cz-item-img"
              :title="toon.name"
              draggable="false"
              @load="e => onToonImgLoad(e, toon)"
            />
            <div v-if="cz.buildMode" class="cz-item-btns" @mousedown.stop @touchstart.stop>
              <button
                class="cz-bring-front-btn"
                title="Bring to front"
                @click.stop="bringToFrontToon(toonIdx)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M7 17h10M9 13h6M12 6v7M9 9l3-3 3 3" />
                </svg>
              </button>
              <button
                class="cz-size-cycle-btn"
                :title="`Size: ${toon.sizeScale === 0.5 ? '50%' : toon.sizeScale === 2 ? '200%' : '100%'} — click to cycle`"
                @click.stop="cycleToonSize(toonIdx)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- ── cZone Search items (zone 0 only, visitor only) ── -->
          <template v-if="!cz.buildMode && cz.activeZone === 0">
            <button
              v-for="item in czoneSearchItems"
              :key="item.key"
              type="button"
              class="czone-search-ctoon"
              :class="{ 'opacity-70 cursor-wait': item.isCapturing }"
              :style="{ position: 'absolute', top: item.y + 'px', left: item.x + 'px', width: item.size + 'px', height: item.size + 'px', zIndex: 60 }"
              @click="captureCzoneSearchItem(item)"
            >
              <img :src="item.assetPath" :alt="item.name" class="czone-search-image" loading="lazy" />
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- ── Bottom bar ──────────────────────────────────────── -->
    <div class="cz-bottombar">
      <GreenButton v-show="!cz.buildMode" class="cz-myczone-btn" @click="goToMyCzone">My cZone</GreenButton>
      <div class="cz-build-hint">
        <template v-if="cz.buildMode">
          <span class="cz-build-hint-desktop">Drag cToons from sidebar · Right-click canvas to remove</span>
          <span class="cz-build-hint-mobile">Tap sidebar to add · Hold 2s to remove</span>
        </template>
      </div>
      <div v-show="!cz.buildMode" class="cz-nav-buttons">
        <img src="/images/newsite/ten_left.gif"  class="cz-nav-btn" title="Previous 10" draggable="false" @click="navigate('previous10')" />
        <img src="/images/newsite/one_left.gif"  class="cz-nav-btn" title="Previous"    draggable="false" @click="navigate('previous')"   />
        <img src="/images/newsite/rand.gif"      class="cz-nav-btn" title="Random"      draggable="false" @click="navigate('random')"     />
        <img src="/images/newsite/one_right.gif" class="cz-nav-btn" title="Next"        draggable="false" @click="navigate('next')"        />
        <img src="/images/newsite/ten_right.gif" class="cz-nav-btn" title="Next 10"     draggable="false" @click="navigate('next10')"     />
      </div>
    </div>

    <!-- ── Ghost (global, for cross-component drag) ─────────── -->
    <Teleport to="body">
      <img
        v-if="cz.activeDrag"
        :src="cz.activeDrag.ctoon.assetPath"
        class="cz-ghost-global"
        :style="{ left: cz.ghostX + 'px', top: cz.ghostY + 'px' }"
        draggable="false"
      />

      <!-- ── cZone Search: capture modal ── -->
      <transition name="cz-fade">
        <div
          v-if="captureModalVisible"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          @click.self="closeCaptureModal"
        >
          <div class="relative bg-white rounded-lg shadow-lg w-full max-w-md max-h-[90vh] flex flex-col text-gray-800">
            <div class="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
              <h2 class="text-lg font-semibold">cToon Captured</h2>
              <button class="text-gray-500 hover:text-black" @click="closeCaptureModal">✕</button>
            </div>
            <div class="p-4 overflow-y-auto flex-1">
              <div v-if="capturedCtoon" class="space-y-4">
                <img
                  :src="capturedCtoon.assetPath"
                  :alt="capturedCtoon.name || 'Captured cToon'"
                  class="w-full max-h-56 object-contain rounded"
                  loading="lazy"
                />
                <div class="space-y-1">
                  <p class="font-semibold text-base">You've captured {{ capturedCtoon.captureCount.toLocaleString() }} {{ capturedCtoon.name }}s</p>
                  <p class="text-sm text-gray-600">You now own {{ capturedCtoon.ownedCount.toLocaleString() }} {{ capturedCtoon.name }}s</p>
                </div>
                <div class="space-y-1 text-sm">
                  <div><span class="text-gray-500">Rarity:</span> <span class="font-medium">{{ capturedCtoon.rarity || '—' }}</span></div>
                  <div><span class="text-gray-500">Series:</span> <span class="font-medium">{{ capturedCtoon.series || '—' }}</span></div>
                  <div><span class="text-gray-500">Set:</span> <span class="font-medium">{{ capturedCtoon.set || '—' }}</span></div>
                </div>
              </div>
            </div>
            <div class="px-4 py-3 border-t flex justify-end gap-2 flex-shrink-0">
              <button class="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700" @click="closeCaptureModal">Close</button>
            </div>
          </div>
        </div>
      </transition>

      <!-- ── Wishlist modal ── -->
      <transition name="cz-fade">
        <div v-if="wishlistModalVisible" class="cz-modal-overlay" @click.self="closeWishlistModal">
          <div class="cz-modal">
            <div class="cz-modal-header">
              <span>🎁 {{ viewedOwner?.username }}'s Wishlist</span>
              <button class="cz-modal-close" @click="closeWishlistModal">✕</button>
            </div>
            <div class="cz-modal-body">
              <div v-if="isLoadingWishlist" class="cz-modal-loading">Loading…</div>
              <div v-else-if="!wishlistItems.length" class="cz-modal-empty">No cToons on their wishlist.</div>
              <div v-else class="cz-wl-grid">
                <div v-for="item in wishlistItems" :key="item.id" class="cz-wl-card">
                  <img
                    :src="item.ctoon.assetPath" :alt="item.ctoon.name"
                    class="cz-wl-img cz-wl-img--clickable"
                    @click="openCtoonModal({ ctoonId: item.ctoon.id, assetPath: item.ctoon.assetPath, name: item.ctoon.name })"
                  />
                  <p class="cz-wl-name">{{ item.ctoon.name }}</p>
                  <p class="cz-wl-pts">Offer: {{ item.offeredPoints.toLocaleString() }} pts</p>
                  <p class="cz-wl-owned">
                    You own: {{ item.viewerOwnedCount || 0 }} {{ (item.viewerOwnedCount || 0) === 1 ? 'copy' : 'copies' }}
                  </p>
                  <p v-if="(item.viewerOwnedCount || 0) > 0 && item.viewerTradeMintNumber != null" class="cz-wl-mint">
                    Send your highest mint: #{{ item.viewerTradeMintNumber }}
                  </p>
                  <p v-else-if="(item.viewerOwnedCount || 0) > 0" class="cz-wl-mint">
                    Highest mint to trade: none (newest copy sent)
                  </p>
                  <p v-else class="cz-wl-mint cz-wl-mint--disabled">
                    Trade disabled: you do not own this cToon.
                  </p>
                  <button
                    class="cz-wl-trade-btn"
                    :class="{ 'cz-wl-trade-btn--confirm': wishlistConfirmingId === item.id }"
                    :disabled="!item.hasEnough || !(item.viewerOwnedCount || 0) || isProcessingWishlistTrade"
                    @click="onWishlistTradeClick(item)"
                  >
                    {{ wishlistConfirmingId === item.id ? 'Confirm Trade?' : `Trade for ${item.offeredPoints.toLocaleString()} pts` }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- ── Trade list modal ── -->
      <transition name="cz-fade">
        <div v-if="tradeListModalVisible" class="cz-modal-overlay" @click.self="closeTradeListModal">
          <div class="cz-modal">
            <div class="cz-modal-header">
              <span>{{ viewedOwner?.username }}'s Trade List</span>
              <button class="cz-modal-close" @click="closeTradeListModal">✕</button>
            </div>
            <div class="cz-modal-body">
              <div v-if="isLoadingTradeList" class="cz-modal-loading">Loading…</div>
              <div v-else-if="!tradeListItems.length" class="cz-modal-empty">No cToons on their trade list.</div>
              <div v-else>
                <p class="cz-tl-hint">Click a cToon to start a trade.</p>
                <div class="cz-wl-grid">
                  <div
                    v-for="item in tradeListItems"
                    :key="item.userCtoonId"
                    class="cz-wl-card cz-wl-card--clickable"
                    @click="goToTradeWithCtoon(item)"
                  >
                    <img :src="item.assetPath" :alt="item.name" class="cz-wl-img" />
                    <p class="cz-wl-name">{{ item.name }}</p>
                    <p class="cz-wl-pts">{{ item.rarity }}</p>
                    <p class="cz-wl-owned">Mint #{{ item.mintNumber ?? 'N/A' }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- ── cZone Search: toast ── -->
      <transition name="cz-fade">
        <div v-if="searchToast.visible" class="cz-search-toast" :class="searchToast.type">
          {{ searchToast.message }}
        </div>
      </transition>

      <!-- ── Glitch / Matrix Effect Overlay ── -->
      <div v-if="glitchActive" class="czone-glitch-overlay" :class="`czone-glitch-phase-${glitchPhase}`">
        <!-- Phase 1: scan-line overlay (TV jitter via html class) -->
        <div v-if="glitchPhase === 1" class="czone-glitch-scanlines"></div>

        <!-- Phase 2 & 3: canvas for TV snow → matrix rain -->
        <canvas v-if="glitchPhase >= 2" ref="matrixCanvas" class="czone-matrix-canvas"></canvas>

        <!-- Phase 3: cToon floats on top of matrix, click to capture -->
        <transition name="cz-fade">
          <div v-if="glitchPhase === 3 && glitchItem" class="czone-glitch-ctoon-wrapper">
            <button
              class="czone-glitch-ctoon-btn"
              :class="{ 'opacity-60 cursor-wait': glitchItem.isCapturing }"
              @click="captureGlitchItem"
              type="button"
            >
              <img
                :src="glitchItem.assetPath"
                :alt="glitchItem.name"
                class="czone-glitch-ctoon-img"
                draggable="false"
              />
              <div class="czone-glitch-ctoon-label">{{ glitchItem.name }}</div>
            </button>
          </div>
        </transition>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
// ── Canvas size variables ─────────────────────────────────────
const TOON_SIZE        = 80    // default toon size in px when dropped
const TOPBAR_H         = 34    // top bar height in px
const BOTTOMBAR_H      = 35    // bottom bar height in px
const CANVAS_W         = 800   // design-space canvas width
const CANVAS_H         = 600   // design-space canvas height
const SIZE_CYCLE       = [1, 0.5, 2]  // sizeScale cycle: default → half → double
const SEARCH_TOON_SIZE = 140   // cZone search toon size in px

function toonW(t) { return (t.width  || TOON_SIZE) * (t.sizeScale || 1) }
function toonH(t) { return (t.height || TOON_SIZE) * (t.sizeScale || 1) }

// Design-space canvas dimensions (used for clamping toon positions)
function canvasW() { return CANVAS_W }
function canvasH() { return CANVAS_H }

const { user, fetchSelf } = useAuth()
const cz = useNewSiteCzoneState()
const { open: openCtoonModal, setContext, clearContext, holidaySignal, holidayRedeem } = useCtoonModal()
const { mobileSidebarCollapsed } = useNewsiteLayout()
const route  = useRoute()
const router = useRouter()

// ── Scale logic (mirrors pages/czone/[username].vue) ──────────
const scale = ref(1)
function recalcScale() {
  if (typeof window === 'undefined') return
  const gutter = 32 // account for page padding / scrollbar
  const w = window.innerWidth || document.documentElement?.clientWidth || CANVAS_W
  scale.value = Math.min(1, Math.max(0.1, (w - gutter) / CANVAS_W))
}

// Set the correct scale immediately on the client to avoid a post-hydration
// layout flash where the canvas briefly renders at full 800px width.
if (process.client) recalcScale()

// Outer box reserves the scaled visual footprint in layout flow
const outerScaleStyle = computed(() => ({
  width:    `${CANVAS_W * scale.value}px`,
  height:   `${CANVAS_H * scale.value}px`,
  position: 'relative',
  overflow: 'hidden',
  margin:   '0 auto',
}))

// Inner keeps the true 800×600 layout, visually scaled via transform
const innerScaleStyle = computed(() => ({
  transform:       `scale(${scale.value})`,
  transformOrigin: 'top left',
  width:           `${CANVAS_W}px`,
  height:          `${CANVAS_H}px`,
}))

const canvasEl       = ref(null)
const viewedOwner    = ref(null)   // { username, avatar } of the displayed zone owner
const viewedUsername = ref(null)   // username whose zone is currently displayed

// True while build-mode data is loading (prevents double-click and shows spinner on button)
const buildLoading = ref(false)

// True while a zone is being fetched – drives skeleton placeholders in the topbar
const zoneLoading = ref(false)

// Local drag: repositioning toons already on the canvas
const localDrag = ref(null)  // { toon, offsetX, offsetY }

// Long-press (mobile): hold 2s on a canvas toon to remove it
const LONG_PRESS_DURATION  = 2000
const LONG_PRESS_MOVE_THRESHOLD = 10
const longPressTimer  = ref(null)
const longPressToon   = ref(null)  // { toon, toons, startClientX, startClientY }

function cancelLongPress() {
  if (longPressTimer.value) { clearTimeout(longPressTimer.value); longPressTimer.value = null }
  longPressToon.value = null
}

// ── cZone Search state ────────────────────────────────────────
const czoneSearchItems  = ref([])
const captureModalVisible = ref(false)
const capturedCtoon       = ref(null)
const searchToast         = reactive({ visible: false, message: '', type: 'success' })
let   searchToastTimer    = null

// ── Glitch / Matrix Effect state ─────────────────────────────
// Phase 0 = off | 1 = TV jitter | 2 = TV snow | 3 = matrix + cToon on top
const glitchActive = ref(false)
const glitchPhase  = ref(0)
const glitchItem   = ref(null)
const matrixCanvas = ref(null)
let   glitchTimers   = []
let   matrixAnimFrame = null
let   matrixDrawMode  = 'snow' // 'snow' | 'matrix'

const MATRIX_CODE_LINES = [
  'import { defineEventHandler, createError } from "h3"',
  'import { prisma as db } from "@/server/prisma"',
  'import { redis } from "@/server/utils/redis"',
  'export default defineEventHandler(async (event) => {',
  '  const userId = event.context.userId',
  '  if (!userId) throw createError({ statusCode: 401 })',
  '  const appearance = await db.cZoneSearchAppearance.findUnique({',
  '    where: { id: appearanceId },',
  '    include: { ctoon: true, cZoneSearch: true }',
  '  })',
  '  if (!appearance) throw createError({ statusCode: 404 })',
  '  const prizePool = search.prizePool.filter(row => {',
  '    if (!row?.ctoon) return false',
  '    if (row.glitchEffect) triggerGlitchSequence()',
  '    return clampPercent(row.chancePercent) > 0',
  '  })',
  '  const chosen = pickWeighted(eligiblePool)',
  '  await db.cZoneSearchAppearance.createMany({ data: toCreate })',
  '  const job = await mintQueue.add("mintCtoon", { userId, ctoonId })',
  '  await job.waitUntilFinished(queueEvents)',
  '  return { items, glitchEffect: chosen.glitchEffect }',
  '})',
  'function startGlitchEffect(item) {',
  '  glitchPhase.value = 1',
  '  document.documentElement.classList.add("czone-tv-glitch")',
  '  setTimeout(() => { glitchPhase.value = 2 }, 3000)',
  '  setTimeout(() => { glitchPhase.value = 3 }, 6000)',
  '}',
  'const czoneSearchItems = ref([])',
  'const glitchActive = ref(false)',
  'async function captureCzoneSearchItem(item) {',
  '  const res = await $fetch("/api/czone/searches/capture", {',
  '    method: "POST", body: { appearanceId: item.appearanceId }',
  '  })',
  '  czoneSearchItems.value = czoneSearchItems.value',
  '    .filter(i => i.appearanceId !== item.appearanceId)',
  '  if (item.glitchEffect) stopGlitchEffect()',
  '}',
  'model CZoneSearchPrize {',
  '  id            String  @id @default(uuid())',
  '  cZoneSearchId String',
  '  ctoonId       String',
  '  chancePercent Float   @default(0)',
  '  glitchEffect  Boolean @default(false)',
  '  cZoneSearch CZoneSearch @relation(fields: [cZoneSearchId])',
  '  ctoon       Ctoon       @relation(fields: [ctoonId])',
  '}',
  'function randomSearchPosition(size) {',
  '  const maxX = Math.max(0, CANVAS_W - size)',
  '  const maxY = Math.max(0, CANVAS_H - size)',
  '  return {',
  '    x: Math.floor(Math.random() * (maxX + 1)),',
  '    y: Math.floor(Math.random() * (maxY + 1))',
  '  }',
  '}',
]

function startGlitchEffect(item) {
  if (!process.client) return
  if (glitchActive.value) stopGlitchEffect()
  glitchItem.value  = item
  glitchPhase.value = 1
  glitchActive.value = true
  document.documentElement.classList.add('czone-tv-glitch')

  // Phase 1 → 2: after 3s switch to TV snow
  glitchTimers.push(setTimeout(() => {
    glitchPhase.value = 2
    document.documentElement.classList.remove('czone-tv-glitch')
    nextTick(() => startMatrixCanvas('snow'))

    // Phase 2 → matrix: after 2.5s start fading to matrix rain
    glitchTimers.push(setTimeout(() => {
      matrixDrawMode = 'matrix'

      // Phase 3: after 0.5s more show the cToon on top
      glitchTimers.push(setTimeout(() => {
        glitchPhase.value = 3
      }, 500))
    }, 2500))
  }, 3000))
}

function stopGlitchEffect() {
  for (const t of glitchTimers) clearTimeout(t)
  glitchTimers = []
  glitchPhase.value  = 0
  glitchActive.value = false
  glitchItem.value   = null
  matrixDrawMode     = 'snow'
  stopMatrixCanvas()
  if (process.client) {
    document.documentElement.classList.remove('czone-tv-glitch')
  }
}

function startMatrixCanvas(mode) {
  const canvas = matrixCanvas.value
  if (!canvas) return
  matrixDrawMode = mode

  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
  const ctx = canvas.getContext('2d')

  // Matrix rain columns
  const fontSize = 14
  const cols  = Math.floor(canvas.width / fontSize)
  const drops = new Array(cols).fill(0).map(() => Math.random() * -(canvas.height / fontSize))

  // Characters used in the falling rain
  const rainChars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ{}[]()<>=+/-_|\\!@#$%^&*;:,.?'

  // Scrolling code overlay
  let codeY = canvas.height
  const codeLineH = 20
  const codeFontSize = 13

  function draw() {
    if (matrixDrawMode === 'snow') {
      // TV static noise – draw at ¼ resolution then scale for performance
      const sw = Math.ceil(canvas.width / 4)
      const sh = Math.ceil(canvas.height / 4)
      const imageData = ctx.createImageData(sw, sh)
      const data = imageData.data
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() > 0.5 ? 255 : 0
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
      }
      // Draw small then scale up via drawImage
      const offscreen = document.createElement('canvas')
      offscreen.width  = sw
      offscreen.height = sh
      offscreen.getContext('2d').putImageData(imageData, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height)
    } else {
      // Matrix rain effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.font = `${fontSize}px monospace`
      for (let i = 0; i < drops.length; i++) {
        const char = rainChars[Math.floor(Math.random() * rainChars.length)]
        // Occasional bright white leader character
        ctx.fillStyle = drops[i] > 0 && Math.random() > 0.97 ? '#ccffcc' : '#00cc44'
        ctx.fillText(char, i * fontSize, drops[i] * fontSize)
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i] += 0.6
      }

      // Scrolling code block overlay
      codeY -= 1.2
      if (codeY + MATRIX_CODE_LINES.length * codeLineH < 0) {
        codeY = canvas.height + codeLineH
      }
      ctx.font = `${codeFontSize}px "Courier New", monospace`
      const codeX = Math.round(canvas.width * 0.08)
      for (let i = 0; i < MATRIX_CODE_LINES.length; i++) {
        const lineY = codeY + i * codeLineH
        if (lineY < -codeLineH || lineY > canvas.height + codeLineH) continue
        // Highlight the glitchEffect line in brighter green
        const isBright = MATRIX_CODE_LINES[i].includes('glitchEffect') || MATRIX_CODE_LINES[i].includes('triggerGlitch')
        ctx.fillStyle = isBright ? '#7fff7f' : '#00ff41'
        ctx.fillText(MATRIX_CODE_LINES[i], codeX, lineY)
      }
    }
    matrixAnimFrame = requestAnimationFrame(draw)
  }
  draw()
}

function stopMatrixCanvas() {
  if (matrixAnimFrame) {
    cancelAnimationFrame(matrixAnimFrame)
    matrixAnimFrame = null
  }
}

async function captureGlitchItem() {
  const item = glitchItem.value
  if (!item || item.isCapturing) return
  await captureCzoneSearchItem(item)
  stopGlitchEffect()
}

// ── Wishlist state ────────────────────────────────────────────
const wishlistModalVisible      = ref(false)
const wishlistItems             = ref([])
const isLoadingWishlist         = ref(false)
const wishlistCount             = ref(0)
const isLoadingWishlistCount    = ref(false)
const wishlistConfirmingId      = ref(null)
const isProcessingWishlistTrade = ref(false)
let   wishlistConfirmTimer      = null

// ── Trade list state ──────────────────────────────────────────
const tradeListModalVisible = ref(false)
const tradeListItems        = ref([])
const isLoadingTradeList    = ref(false)
const tradeListCount        = ref(0)

const wishlistCountDisplay = computed(() => {
  if (isLoadingWishlistCount.value) return '…'
  return String(wishlistCount.value)
})
const tradeListCountDisplay = computed(() => {
  if (isLoadingTradeList.value) return '…'
  return String(tradeListCount.value)
})

async function loadWishlistCount(username) {
  isLoadingWishlistCount.value = true
  try {
    const res = await $fetch(`/api/wishlist/users/${username}/count`)
    wishlistCount.value = Number(res?.count ?? 0)
  } catch {
    wishlistCount.value = 0
  } finally {
    isLoadingWishlistCount.value = false
  }
}

async function loadWishlistItems(username) {
  isLoadingWishlist.value = true
  try {
    wishlistItems.value = await $fetch(`/api/wishlist/users/${username}`)
    wishlistCount.value = wishlistItems.value.length
  } catch {
    wishlistItems.value = []
  } finally {
    isLoadingWishlist.value = false
  }
}

async function loadTradeListItems(username) {
  isLoadingTradeList.value = true
  try {
    tradeListItems.value = await $fetch(`/api/trade-list/users/${username}`)
    tradeListCount.value = tradeListItems.value.length
  } catch {
    tradeListItems.value = []
  } finally {
    isLoadingTradeList.value = false
  }
}

function openWishlistModal() {
  wishlistModalVisible.value = true
  if (viewedUsername.value) loadWishlistItems(viewedUsername.value)
}
function closeWishlistModal() {
  wishlistModalVisible.value = false
  wishlistConfirmingId.value = null
  if (wishlistConfirmTimer) { clearTimeout(wishlistConfirmTimer); wishlistConfirmTimer = null }
}

function openTradeListModal() {
  tradeListModalVisible.value = true
  if (viewedUsername.value && !tradeListItems.value.length) loadTradeListItems(viewedUsername.value)
}
function closeTradeListModal() {
  tradeListModalVisible.value = false
}

function onWishlistTradeClick(item) {
  if (!item.hasEnough || !(item.viewerOwnedCount || 0) || isProcessingWishlistTrade.value) return
  if (wishlistConfirmingId.value !== item.id) {
    wishlistConfirmingId.value = item.id
    if (wishlistConfirmTimer) clearTimeout(wishlistConfirmTimer)
    wishlistConfirmTimer = setTimeout(() => {
      wishlistConfirmingId.value = null
    }, 5000)
  } else {
    if (wishlistConfirmTimer) { clearTimeout(wishlistConfirmTimer); wishlistConfirmTimer = null }
    wishlistConfirmingId.value = null
    executeWishlistTrade(item)
  }
}

async function executeWishlistTrade(item) {
  isProcessingWishlistTrade.value = true
  try {
    wishlistItems.value = wishlistItems.value.filter(w => w.id !== item.id)
    wishlistCount.value = Math.max(0, wishlistCount.value - 1)
    await $fetch(`/api/wishlist/accept/${item.id}`, { method: 'POST', body: { wishlistItemId: item.id } })
    showSearchToast('Trade completed!', 'success')
    await fetchSelf({ force: true })
    if (wishlistModalVisible.value && viewedUsername.value) await loadWishlistItems(viewedUsername.value)
  } catch (err) {
    showSearchToast(err?.data?.message || 'Failed to complete trade.', 'error')
    if (viewedUsername.value) await loadWishlistItems(viewedUsername.value)
  } finally {
    isProcessingWishlistTrade.value = false
  }
}

function goToTradeWithCtoon(item) {
  closeTradeListModal()
  router.push(`/newsite/trade?username=${encodeURIComponent(viewedUsername.value)}&userCtoonId=${encodeURIComponent(item.userCtoonId)}`)
}

const currentZone = computed(() => cz.value.zones?.[cz.value.activeZone] ?? { background: '', toons: [] })
const isOwnZone   = computed(() => !!user.value && viewedUsername.value === user.value.username)

// Keep ctoon modal context in sync so the "Open cToon" button appears on owned zones
watch([isOwnZone, viewedUsername], ([own, uname]) => {
  setContext({ source: 'czone', isOwner: own, username: uname || '' })
}, { immediate: true })

watch(holidaySignal, async () => {
  if (holidayRedeem.value?.reward?.name) {
    showSearchToast(`Opened! You received ${holidayRedeem.value.reward.name} 🎉`, 'success')
  }
  await loadZone(viewedUsername.value)
})

const lastOnlineText = computed(() => {
  if (!viewedOwner.value?.lastActivity) return null
  const diffMs   = Date.now() - new Date(viewedOwner.value.lastActivity).getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 1) return 'Last Online: Today!'
  return `Last Online: ${diffDays} day${diffDays === 1 ? '' : 's'}`
})

function bgUrl(v) {
  if (!v) return ''
  const s = String(v)
  if (/^(https?:)?\/\//.test(s) || s.startsWith('/')) return s
  return `/backgrounds/${s}`
}

const currentBg = computed(() => {
  const src = bgUrl(currentZone.value.background)
  return src ? `url('${src}')` : ''
})

const canvasStyle = computed(() => ({
  backgroundImage: currentBg.value,
}))

// ── Lifecycle ─────────────────────────────────────────────────
const czoneActions = useCzoneActions()

onMounted(() => {
  czoneActions.register(save, clearZone)
  recalcScale()
  window.addEventListener('resize',    recalcScale)
  window.addEventListener('mousemove', onGlobalMove)
  window.addEventListener('mouseup',   onGlobalUp)
  window.addEventListener('touchmove', onGlobalMove, { passive: false })
  window.addEventListener('touchend',  onGlobalUp)
})

// Load once the user is available (may not be ready at mount time)
watch(() => user.value?.username, async (loggedInUsername) => {
  if (loggedInUsername && !viewedUsername.value) {
    await loadZone(route.params.username || loggedInUsername)
  }
}, { immediate: true })

// Support URL navigation changes (e.g. when navigate() pushes a new /newsite/czone/:username)
watch(() => route.params.username, async (paramUsername) => {
  const target = paramUsername || user.value?.username
  if (target && target !== viewedUsername.value) await loadZone(target)
})


onUnmounted(() => {
  czoneActions.unregister()
  window.removeEventListener('resize',    recalcScale)
  window.removeEventListener('mousemove', onGlobalMove)
  window.removeEventListener('mouseup',   onGlobalUp)
  window.removeEventListener('touchmove', onGlobalMove)
  window.removeEventListener('touchend',  onGlobalUp)
  // clear any leftover drag state
  cancelLongPress()
  cz.value.activeDrag = null
  cz.value.buildMode  = false
  // cancel any pending dimension auto-save
  clearTimeout(_dimSaveTimer)
  // stop any active glitch effect
  stopGlitchEffect()
})

// ── Data loading ──────────────────────────────────────────────
async function loadZone(username) {
  const target = username ?? user.value?.username
  if (!target) return
  // Set viewedUsername immediately so the Trade/Build button stays visible
  // (and stable in place) while the zone data loads.
  viewedUsername.value = target
  zoneLoading.value    = true
  try {
    const data = await $fetch(`/api/czone/${target}`)
    cz.value.zones       = data.cZone.zones
    const firstActive    = data.cZone.zones.findIndex(z => z.toons.length > 0)
    cz.value.activeZone  = firstActive >= 0 ? firstActive : 0
    viewedOwner.value    = { username: data.ownerName, avatar: data.avatar, lastActivity: data.lastActivity ?? null }
    loadCzoneSearchItems()
    eagerLoadMissingDimensions()

    if (user.value && data.ownerId && data.ownerId !== user.value.id) {
      $fetch('/api/points/visit', { method: 'POST', body: { zoneOwnerId: data.ownerId } }).catch(() => {})
      // Reset and reload counts for the new zone owner
      wishlistCount.value  = 0
      tradeListCount.value = 0
      wishlistItems.value  = []
      tradeListItems.value = []
      loadWishlistCount(target)
      loadTradeListItems(target)
    } else {
      // Own zone or no user — clear visitor state
      wishlistCount.value  = 0
      tradeListCount.value = 0
      wishlistItems.value  = []
      tradeListItems.value = []
    }
  } catch (e) {
    console.error('MyCzone: failed to load zone', e)
  } finally {
    zoneLoading.value = false
  }
}

// Reload search items when switching to zone 0; clear them on other zones
watch(() => cz.value.activeZone, (newZone) => {
  if (newZone === 0) {
    loadCzoneSearchItems()
  } else {
    czoneSearchItems.value = []
  }
})

async function navigate(type) {
  const from = viewedUsername.value ?? user.value?.username
  if (!from) return
  try {
    const { username } = await $fetch(`/api/czone/${from}/${type}`)
    router.push(`/newsite/czone/${username}`)
  } catch (e) {
    console.error('MyCzone: navigate failed', e)
  }
}

function goToMyCzone() {
  if (user.value?.username) {
    router.push(`/newsite/czone/${user.value.username}`)
  }
}

async function toggleBuild() {
  if (!isOwnZone.value || buildLoading.value) return
  if (cz.value.buildMode) {
    // Exit build mode: save first, then switch
    cz.value.buildMode = false
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      mobileSidebarCollapsed.value = true
    }
    await save()
    const firstActive = cz.value.zones.findIndex(z => z.toons.length > 0)
    if (firstActive >= 0 && cz.value.zones[cz.value.activeZone]?.toons.length === 0) {
      cz.value.activeZone = firstActive
    }
  } else {
    // Enter build mode: always fetch fresh data first so the sidebar is never blank.
    buildLoading.value = true
    try {
      const username = user.value?.username
      if (username) {
        await Promise.all([
          $fetch(`/api/collection/${username}`)
            .then(data => { cz.value.collection = Array.isArray(data) ? data : [] })
            .catch(e => { console.error('MyCzone: failed to load collection', e); if (!Array.isArray(cz.value.collection)) cz.value.collection = [] }),
          $fetch('/api/czone/backgrounds-available')
            .then(data => { cz.value.backgrounds = Array.isArray(data) ? data : [] })
            .catch(e => { console.error('MyCzone: failed to load backgrounds', e); if (!Array.isArray(cz.value.backgrounds)) cz.value.backgrounds = [] }),
        ])
      }
    } finally {
      buildLoading.value = false
    }
    cz.value.buildMode = true
    mobileSidebarCollapsed.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────
function canvasRect() { return canvasEl.value?.getBoundingClientRect() }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function getCoords(e) {
  if (e.touches && e.touches.length > 0) return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
  if (e.changedTouches && e.changedTouches.length > 0) return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY }
  return { clientX: e.clientX, clientY: e.clientY }
}

function toCanvasCoords(cx, cy) {
  const r = canvasRect()
  if (!r) return { x: 0, y: 0 }
  const s = scale.value || 1
  return { x: (cx - r.left) / s, y: (cy - r.top) / s }
}

function isOverCanvas(cx, cy) {
  const r = canvasRect()
  return r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
}

// ── Toon click: open info modal in view mode ──────────────────
function onToonClick(toon) {
  if (cz.value.buildMode || !toon.ctoonId) return
  openCtoonModal({
    ctoonId: toon.ctoonId,
    userCtoonId: isOwnZone.value ? toon.id : undefined,
    assetPath: toon.assetPath,
    name: toon.name
  })
}

// ── Item mousedown: reposition placed toon (desktop drag) ─────
function onItemMouseDown(toon, e) {
  const { x, y } = toCanvasCoords(e.clientX, e.clientY)
  localDrag.value = { toon, offsetX: x - toon.x, offsetY: y - toon.y }
  e.preventDefault()
  e.stopPropagation()
}

// ── Item touchstart: reposition placed toon (touch drag / long-press) ──
function onItemTouchStart(toon, e) {
  const touch = e.touches[0]
  const { x, y } = toCanvasCoords(touch.clientX, touch.clientY)
  if (window.innerWidth <= 768) {
    // Mobile: start long-press timer; drag will begin only if finger moves
    longPressToon.value = { toon, toons: currentZone.value.toons, startClientX: touch.clientX, startClientY: touch.clientY, canvasX: x, canvasY: y }
    longPressTimer.value = setTimeout(() => {
      if (!longPressToon.value) return
      const { toon: lpt, toons: lptoons } = longPressToon.value
      const idx = lptoons.indexOf(lpt)
      if (idx !== -1) lptoons.splice(idx, 1)
      longPressToon.value = null
      longPressTimer.value = null
      localDrag.value = null
    }, LONG_PRESS_DURATION)
  } else {
    localDrag.value = { toon, offsetX: x - toon.x, offsetY: y - toon.y }
  }
  e.preventDefault()
  e.stopPropagation()
}

// ── Remove a specific toon (right-click on item) ──────────────
function removeToon(toon) {
  const toons = currentZone.value.toons
  const idx = toons.indexOf(toon)
  if (idx !== -1) toons.splice(idx, 1)
}

// ── Canvas mousedown: no-op (toon drag handled at item level) ─
function onCanvasMouseDown(e) {}

// ── Canvas touchstart: no-op (toon touch handled at item level) ─
function onCanvasTouchStart(e) {}

// ── Global move (mouse + touch) ───────────────────────────────
function onGlobalMove(e) {
  const { clientX, clientY } = getCoords(e)
  // Cancel long-press if finger moved beyond threshold; start drag instead
  if (longPressToon.value) {
    const dx = Math.abs(clientX - longPressToon.value.startClientX)
    const dy = Math.abs(clientY - longPressToon.value.startClientY)
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      const { toon, canvasX, canvasY } = longPressToon.value
      cancelLongPress()
      localDrag.value = { toon, offsetX: canvasX - toon.x, offsetY: canvasY - toon.y }
    }
  }
  if (cz.value.activeDrag || localDrag.value) {
    e.preventDefault()  // prevent page scroll during drag
  }
  if (cz.value.activeDrag) {
    cz.value.ghostX = clientX
    cz.value.ghostY = clientY
  }
  if (localDrag.value) {
    const { x, y } = toCanvasCoords(clientX, clientY)
    const t = localDrag.value.toon
    t.x = clamp(x - localDrag.value.offsetX, 0, canvasW() - toonW(t))
    t.y = clamp(y - localDrag.value.offsetY, 0, canvasH() - toonH(t))
  }
}

// ── Global up (mouse + touch) ─────────────────────────────────
function onGlobalUp(e) {
  cancelLongPress()
  const { clientX, clientY } = getCoords(e)
  if (cz.value.activeDrag && isOverCanvas(clientX, clientY)) {
    const { x, y } = toCanvasCoords(clientX, clientY)
    const c = cz.value.activeDrag.ctoon
    if (!currentZone.value.toons.some(t => t.id === c.id)) {
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        currentZone.value.toons.push({
          id: c.id, ctoonId: c.ctoonId, mintNumber: c.mintNumber,
          assetPath: c.assetPath, name: c.name,
          x: clamp(x - w / 2, 0, canvasW() - w),
          y: clamp(y - h / 2, 0, canvasH() - h),
          width: w, height: h,
        })
      }
      img.src = c.assetPath
    }
  }
  cz.value.activeDrag = null
  localDrag.value     = null
}

// ── Right-click: remove toon ──────────────────────────────────
function onContextMenu(e) {
  if (!cz.value.buildMode) return
  const { x, y } = toCanvasCoords(e.clientX, e.clientY)
  const toons = currentZone.value.toons
  for (let i = toons.length - 1; i >= 0; i--) {
    const t = toons[i]
    if (x >= t.x && x <= t.x + toonW(t) && y >= t.y && y <= t.y + toonH(t)) {
      toons.splice(i, 1); return
    }
  }
}

// ── Bring toon to front (highest z-index = end of array) ─────
function bringToFrontToon(idx) {
  const toons = currentZone.value.toons
  if (idx < 0 || idx >= toons.length) return
  const [toon] = toons.splice(idx, 1)
  toons.push(toon)
}

// ── Cycle toon display size (1× → 0.5× → 2× → 1× …) ─────────
function cycleToonSize(idx) {
  const toon = currentZone.value.toons[idx]
  if (!toon) return
  const cur = toon.sizeScale || 1
  const next = SIZE_CYCLE[(SIZE_CYCLE.indexOf(cur) + 1) % SIZE_CYCLE.length]
  toon.sizeScale = next
  // Re-clamp position so the toon never escapes canvas bounds after growing
  toon.x = clamp(toon.x, 0, canvasW() - toonW(toon))
  toon.y = clamp(toon.y, 0, canvasH() - toonH(toon))
}

// ── Populate toon dimensions from natural image size on load ──
function onToonImgLoad(e, toon) {
  if (!toon.width)  toon.width  = e.target.naturalWidth
  if (!toon.height) toon.height = e.target.naturalHeight
}

// ── Eagerly resolve missing toon dimensions on the client ─────
// The Vue template @load handler can miss cached images during SSR
// hydration (the event fires before Vue attaches the listener).
// We create throwaway Image objects so the load always completes,
// then reactively update any toons that lacked stored dimensions.
// If the viewer owns the zone we also schedule a background save
// so the dimensions are persisted and the flash never recurs.
let _dimSaveTimer = null
function eagerLoadMissingDimensions() {
  if (typeof window === 'undefined') return
  const zones = cz.value.zones
  let outstanding = 0
  let anyNew = false

  for (const zone of zones) {
    for (const toon of zone.toons) {
      if (toon.width && toon.height) continue
      outstanding++
      const img = new Image()
      img.onload = () => {
        if (!toon.width)  { toon.width  = img.naturalWidth;  anyNew = true }
        if (!toon.height) { toon.height = img.naturalHeight; anyNew = true }
        outstanding--
        if (outstanding === 0 && anyNew && isOwnZone.value && !cz.value.buildMode) {
          clearTimeout(_dimSaveTimer)
          _dimSaveTimer = setTimeout(() => save(), 1500)
        }
      }
      img.onerror = () => { outstanding-- }
      img.src = toon.assetPath
    }
  }
}

// ── cZone Search helpers ──────────────────────────────────────
function showSearchToast(message, type = 'success') {
  if (searchToastTimer) clearTimeout(searchToastTimer)
  searchToast.message = message
  searchToast.type    = type
  searchToast.visible = true
  searchToastTimer = setTimeout(() => { searchToast.visible = false }, 2500)
}

function randomSearchPosition(size) {
  const maxX = Math.max(0, CANVAS_W - size)
  const maxY = Math.max(0, CANVAS_H - size)
  return {
    x: Math.floor(Math.random() * (maxX + 1)),
    y: Math.floor(Math.random() * (maxY + 1))
  }
}

function buildSearchItems(items) {
  return items.map((entry) => {
    const size = SEARCH_TOON_SIZE
    const pos  = randomSearchPosition(size)
    return {
      appearanceId: entry.appearanceId,
      cZoneSearchId: entry.cZoneSearchId,
      ctoonId: entry.ctoon?.id,
      name: entry.ctoon?.name || 'cToon',
      assetPath: entry.ctoon?.assetPath,
      rarity: entry.ctoon?.rarity,
      series: entry.ctoon?.series,
      set: entry.ctoon?.set,
      glitchEffect: entry.glitchEffect || false,
      x: pos.x,
      y: pos.y,
      size,
      isCapturing: false,
      key: `search-${entry.appearanceId}`
    }
  }).filter(item => item.ctoonId && item.assetPath)
}

async function loadCzoneSearchItems() {
  czoneSearchItems.value = []
  if (!user.value?.id || !viewedUsername.value) return
  if (user.value.username === viewedUsername.value) return
  try {
    const tz  = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const res = await $fetch(`/api/czone/${viewedUsername.value}/searches`, {
      query: { tz, zoneIndex: 0 }
    })
    const items = Array.isArray(res?.items) ? res.items : []

    for (const item of items) {
      if (!item.selectionLog) continue
      const { name, dbChancePercent, relativeChancePercent, poolDetails } = item.selectionLog
      console.log(
        `[cZone Search] Selected: "${name}" | DB chance: ${dbChancePercent}% | Relative chance: ${relativeChancePercent}%`
      )
      console.log('[cZone Search] Prize pool details:', poolDetails)
    }

    czoneSearchItems.value = buildSearchItems(items)
    // Trigger glitch effect for any item that has it enabled
    const glitchTrigger = czoneSearchItems.value.find(item => item.glitchEffect)
    if (glitchTrigger) startGlitchEffect(glitchTrigger)
  } catch (err) {
    console.error('MyCzone: failed to load cZone search items', err)
    czoneSearchItems.value = []
  }
}

async function captureCzoneSearchItem(item) {
  if (!item || item.isCapturing) return
  item.isCapturing = true
  try {
    const res  = await $fetch('/api/czone/searches/capture', {
      method: 'POST',
      body: { appearanceId: item.appearanceId }
    })
    const name = res?.ctoon?.name || item.name
    showSearchToast(`Captured ${name}!`, 'success')
    capturedCtoon.value = res?.ctoon ? { ...res.ctoon } : {
      name: item.name,
      assetPath: item.assetPath,
      rarity: item.rarity,
      series: item.series,
      set: item.set,
      captureCount: 1,
      ownedCount: 1
    }
    captureModalVisible.value = true
    czoneSearchItems.value = czoneSearchItems.value.filter(i => i.appearanceId !== item.appearanceId)
  } catch (err) {
    const message = err?.data?.statusMessage || 'Failed to capture cToon.'
    showSearchToast(message, 'error')
    if (String(message).toLowerCase().includes('already')) {
      czoneSearchItems.value = czoneSearchItems.value.filter(i => i.appearanceId !== item.appearanceId)
      return
    }
    item.isCapturing = false
  }
}

function closeCaptureModal() {
  captureModalVisible.value = false
  capturedCtoon.value = null
}

// ── Save / Clear (called from CzoneEdit emits via page) ───────
async function save() {
  if (!isOwnZone.value) return
  cz.value.saving = true
  try {
    await $fetch('/api/czone/save', {
      method: 'POST',
      body: { zones: cz.value.zones.map(z => ({ background: z.background, toons: z.toons })) },
    })
  } catch (e) {
    console.error('MyCzone: save failed', e)
  } finally {
    cz.value.saving = false
  }
}

function clearZone() {
  if (!isOwnZone.value) return
  currentZone.value.toons = []
}

defineExpose({ save, clearZone })
</script>

<style scoped>
.myczone {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  user-select: none;
  position: relative;
  box-sizing: border-box;
}

/* ── Top bar ── */
.cz-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: v-bind(TOPBAR_H + 'px');
  box-sizing: border-box;
  padding: 4px 6px;
  gap: 6px;
  background: var(--OrbitLightBlue);
  border-bottom: 2px solid var(--OrbitDarkBlue);
}

.cz-topbar-left { display: flex; align-items: center; gap: 4px; }

.cz-zone-tab {
  font-size: 0.65rem;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.3);
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
}
.cz-zone-tab.active { background: var(--OrbitDarkBlue); color: #fff; border-color: transparent; }

.cz-owner-info {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--OrbitDarkBlue);
  border-radius: 4px;
  padding: 2px 8px 2px 4px;
}
.cz-owner-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.cz-owner-label  { font-size: 0.68rem; color: #fff; white-space: nowrap; }
.cz-owner-prefix  { font-size: 0.6rem; text-transform: uppercase; color: rgba(255,255,255,0.55); margin-right: 3px; }
.cz-owner-lastseen { font-size: 0.58rem; color: rgba(255,255,255,0.5); white-space: nowrap; }

/* ── Skeleton placeholders (shown while a new cZone is loading) ── */
.cz-skeleton {
  background: rgba(255, 255, 255, 0.18);
  animation: cz-skeleton-pulse 1.2s ease-in-out infinite;
}
.cz-skeleton-avatar { border-radius: 50%; }
.cz-skeleton-line { border-radius: 3px; margin: 2px 0; }
.cz-skeleton-username { width: 88px; height: 9px; }
.cz-skeleton-lastseen { width: 64px; height: 7px; }
@keyframes cz-skeleton-pulse {
  0%, 100% { opacity: 1;   }
  50%      { opacity: 0.4; }
}

@media (max-width: 768px) {
  .cz-topbar {
    flex-direction: column;
    align-items: flex-start;
    height: auto;
    gap: 4px;
  }
  .cz-owner-info {
    order: -1;
  }
}

/* ── Canvas ── */
.cz-canvas-outer {
  /* width/height/position/overflow/margin set inline via outerScaleStyle */
  flex-shrink: 0;
  background: var(--OrbitDarkBlue);
}

.cz-canvas-inner {
  /* width/height/transform set inline via innerScaleStyle */
}

.cz-canvas {
  position: relative;
  width: 800px;
  height: 600px;
  overflow: hidden;
  background-color: var(--OrbitDarkBlue);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  cursor: default;
}

.cz-item {
  position: absolute;
  cursor: default;
  pointer-events: none;
}

.cz-item.is-dragging { opacity: 0.5; }
.cz-item.is-viewable { pointer-events: auto; cursor: pointer; }
.cz-item.is-viewable:hover { filter: brightness(1.1); }
.cz-item.is-build { pointer-events: auto; cursor: grab; }
.cz-item.is-build.is-dragging { cursor: grabbing; }
.cz-item.is-long-pressing {
  animation: cz-long-press-shrink 2s linear forwards;
  transform-origin: center;
}
@keyframes cz-long-press-shrink {
  0%   { transform: scale(1);    filter: brightness(1); }
  60%  { transform: scale(0.85); filter: brightness(1.25) drop-shadow(0 0 6px rgba(255,80,80,0.8)); }
  100% { transform: scale(0.65); filter: brightness(1.5)  drop-shadow(0 0 10px rgba(255,80,80,1)); }
}

.cz-item-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  pointer-events: none;
  display: block;
}

.cz-item-btns {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 10;
  pointer-events: auto;
}

.cz-bring-front-btn,
.cz-size-cycle-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}
.cz-bring-front-btn:hover,
.cz-size-cycle-btn:hover { background: white; }
.cz-bring-front-btn svg,
.cz-size-cycle-btn svg { width: 16px; height: 16px; color: black; }

@media (max-width: 768px) {
  .cz-item-btns { gap: 4px; }
  .cz-bring-front-btn,
  .cz-size-cycle-btn {
    width: 36px;
    height: 36px;
    padding: 6px;
  }
  .cz-bring-front-btn svg,
  .cz-size-cycle-btn svg {
    width: 20px;
    height: 20px;
  }
}

/* ── Bottom bar ── */
.cz-bottombar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 3px 8px;
  background: var(--OrbitLightBlue);
  border-top: 2px solid var(--OrbitDarkBlue);
  height: v-bind(BOTTOMBAR_H + 'px');
  box-sizing: border-box;
}

.cz-myczone-btn { flex-shrink: 0; }

.cz-build-hint {
  font-size: 0.62rem;
  font-style: italic;
  color: rgba(255,255,255,0.7);
  text-align: center;
  flex: 1;
}
.cz-build-hint-mobile  { display: none; }
.cz-build-hint-desktop { display: inline; }
@media (max-width: 768px) {
  .cz-build-hint-mobile  { display: inline; }
  .cz-build-hint-desktop { display: none; }
}

.cz-nav-buttons {
  display: flex;
  align-items: center;
  margin-left: auto;
  gap: 0;
  flex-shrink: 0;
}

.cz-nav-btn {
  display: block;
  height: calc(v-bind(BOTTOMBAR_H + 'px') - 10px);
  width: auto;
  cursor: pointer;
  image-rendering: pixelated;
  opacity: 0.85;
  transition: opacity 0.1s;
  margin: 0 -1px;
}
.cz-nav-btn:hover { opacity: 1; }

/* ── Wishlist / Trade List buttons (topbar) ── */
.cz-wl-btn {
  font-size: 0.65rem;
}

/* ── Shared modal overlay + shell ── */
.cz-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9980;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

.cz-modal {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #111;
}

.cz-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--OrbitDarkBlue);
  color: #fff;
  font-size: 0.82rem;
  font-weight: bold;
  flex-shrink: 0;
}

.cz-modal-close {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.7);
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
}
.cz-modal-close:hover { color: #fff; }

.cz-modal-body {
  overflow-y: auto;
  padding: 12px;
  flex: 1;
}

.cz-modal-loading,
.cz-modal-empty {
  text-align: center;
  color: #666;
  font-size: 0.8rem;
  padding: 24px 0;
}

/* ── Wishlist / Trade List grid ── */
.cz-wl-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.cz-wl-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 5px;
  padding: 8px 6px;
  font-size: 0.72rem;
  text-align: center;
}

.cz-wl-card--clickable {
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}
.cz-wl-card--clickable:hover {
  background: #f0f4ff;
  border-color: var(--OrbitDarkBlue);
}

.cz-wl-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  image-rendering: pixelated;
  margin-bottom: 5px;
}

.cz-wl-img--clickable { cursor: pointer; }
.cz-wl-img--clickable:hover { filter: brightness(1.1); }

.cz-wl-name  { font-weight: 600; font-size: 0.72rem; margin: 2px 0; }
.cz-wl-pts   { color: #444; margin: 1px 0; }
.cz-wl-owned { color: #555; margin: 1px 0; }
.cz-wl-mint  { color: #555; margin: 1px 0; font-size: 0.67rem; }
.cz-wl-mint--disabled { color: #e53e3e; }

.cz-tl-hint {
  font-size: 0.72rem;
  color: #666;
  margin-bottom: 10px;
  font-style: italic;
}

/* ── Wishlist trade buttons ── */
.cz-wl-trade-btn {
  margin-top: 6px;
  width: 100%;
  padding: 4px 6px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: bold;
  color: #fff;
  background: #f47b00;
  border: 2px solid #c05a00;
  transition: background 0.15s, border-color 0.15s;
}
.cz-wl-trade-btn:hover:not(:disabled):not(.cz-wl-trade-btn--confirm) {
  filter: brightness(1.1);
}
.cz-wl-trade-btn--confirm {
  background: #16a34a;
  border-color: #15803d;
  animation: cz-confirm-pulse 0.9s ease-in-out infinite;
}
.cz-wl-trade-btn--confirm:hover { filter: brightness(1.1); }
.cz-wl-trade-btn:disabled {
  background: #9ca3af;
  border-color: #6b7280;
  cursor: not-allowed;
  opacity: 0.7;
}
@keyframes cz-confirm-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.5); }
  50%       { box-shadow: 0 0 0 5px rgba(22,163,74,0); }
}
</style>

<style>
/* Ghost must be global (not scoped) to work with Teleport */
.cz-ghost-global {
  position: fixed;
  pointer-events: none;
  width: 80px;
  height: 80px;
  object-fit: contain;
  opacity: 0.75;
  transform: translate(-50%, -50%);
  z-index: 9999;
  image-rendering: pixelated;
}

/* ── cZone Search ── */
.czone-search-ctoon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.czone-search-ctoon::before {
  content: '';
  position: absolute;
  inset: -14px;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.75) 0%, rgba(255, 215, 0, 0.15) 55%, rgba(255, 215, 0, 0) 70%);
  border-radius: 50%;
  filter: blur(2px);
  animation: czone-search-pulse 2.6s ease-in-out infinite;
  z-index: 0;
}
.czone-search-image {
  position: relative;
  z-index: 1;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
}
@keyframes czone-search-pulse {
  0%   { transform: scale(0.9); opacity: 0.65; }
  50%  { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.65; }
}

/* ── cZone Search: toast ── */
.cz-search-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #fff;
  pointer-events: none;
  white-space: nowrap;
}
.cz-search-toast.success { background: #16a34a; }
.cz-search-toast.error   { background: #dc2626; }

/* ── cZone Search: capture modal fade ── */
.cz-fade-enter-active,
.cz-fade-leave-active { transition: opacity 0.2s; }
.cz-fade-enter-from,
.cz-fade-leave-to    { opacity: 0; }

/* ─────────────────────────────────────────────────────────────
   Glitch / Matrix Effect
───────────────────────────────────────────────────────────── */

/* Phase 1: TV horizontal jitter applied to the root element */
html.czone-tv-glitch {
  animation: czone-tv-jitter 0.12s steps(1) infinite;
  overflow-x: hidden;
}
@keyframes czone-tv-jitter {
  0%   { transform: translateX(0px)   skewX(0deg);   }
  8%   { transform: translateX(-9px)  skewX(-0.4deg); }
  16%  { transform: translateX(6px)   skewX(0.3deg);  }
  24%  { transform: translateX(-4px)  skewX(0.2deg);  }
  32%  { transform: translateX(11px)  skewX(-0.5deg); }
  40%  { transform: translateX(-7px)  skewX(0.4deg);  }
  48%  { transform: translateX(3px)   skewX(-0.2deg); }
  56%  { transform: translateX(-12px) skewX(0.6deg);  }
  64%  { transform: translateX(8px)   skewX(-0.3deg); }
  72%  { transform: translateX(-5px)  skewX(0.2deg);  }
  80%  { transform: translateX(10px)  skewX(-0.4deg); }
  88%  { transform: translateX(-3px)  skewX(0.1deg);  }
  96%  { transform: translateX(6px)   skewX(-0.3deg); }
  100% { transform: translateX(0px)   skewX(0deg);   }
}

/* Full-screen overlay container */
.czone-glitch-overlay {
  position: fixed;
  inset: 0;
  z-index: 9990;
  pointer-events: none;
  overflow: hidden;
}

/* Phase 1 overlay: faint scan-lines on top of the jittering page */
.czone-glitch-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0, 0, 0, 0.18) 3px,
    rgba(0, 0, 0, 0.18) 4px
  );
  mix-blend-mode: multiply;
  pointer-events: none;
  animation: czone-scanline-flicker 0.08s steps(1) infinite;
}
@keyframes czone-scanline-flicker {
  0%   { opacity: 1;    }
  30%  { opacity: 0.7;  }
  60%  { opacity: 0.9;  }
  80%  { opacity: 0.5;  }
  100% { opacity: 1;    }
}

/* Phase 2 & 3: the canvas takes up the entire overlay */
.czone-matrix-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* Phase 3: make the overlay block interaction so only the cToon button is clickable */
.czone-glitch-phase-3 {
  pointer-events: auto;
}

/* cToon wrapper – centred in the overlay */
.czone-glitch-ctoon-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

/* Clickable cToon button */
.czone-glitch-ctoon-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  animation: czone-glitch-ctoon-appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes czone-glitch-ctoon-appear {
  0%   { transform: scale(0.2) rotate(-8deg); opacity: 0; }
  50%  { transform: scale(1.08) rotate(2deg); opacity: 1; }
  75%  { transform: scale(0.96) rotate(-1deg); }
  100% { transform: scale(1) rotate(0deg);    opacity: 1; }
}

/* The cToon image itself – glow in matrix green */
.czone-glitch-ctoon-img {
  width: auto;
  height: auto;
  max-width: 240px;
  max-height: 240px;
  object-fit: contain;
  image-rendering: pixelated;
  filter:
    drop-shadow(0 0 18px #00ff41)
    drop-shadow(0 0 40px rgba(0, 255, 65, 0.6))
    drop-shadow(0 0 70px rgba(0, 255, 65, 0.3));
  animation: czone-glitch-ctoon-pulse 2s ease-in-out infinite;
}
@keyframes czone-glitch-ctoon-pulse {
  0%   { filter: drop-shadow(0 0 18px #00ff41) drop-shadow(0 0 40px rgba(0,255,65,0.6)); }
  50%  { filter: drop-shadow(0 0 28px #00ff41) drop-shadow(0 0 60px rgba(0,255,65,0.9)) drop-shadow(0 0 90px rgba(0,255,65,0.4)); }
  100% { filter: drop-shadow(0 0 18px #00ff41) drop-shadow(0 0 40px rgba(0,255,65,0.6)); }
}

/* Name label beneath the cToon */
.czone-glitch-ctoon-label {
  color: #00ff41;
  font-family: "Courier New", monospace;
  font-size: 1.1rem;
  font-weight: bold;
  letter-spacing: 0.12em;
  text-shadow: 0 0 8px #00ff41, 0 0 20px rgba(0,255,65,0.5);
  animation: czone-glitch-label-blink 1.4s ease-in-out infinite;
}
@keyframes czone-glitch-label-blink {
  0%, 100% { opacity: 1; }
  45%       { opacity: 0.6; }
  50%       { opacity: 1; }
  55%       { opacity: 0.4; }
  60%       { opacity: 1; }
}
</style>
