<template>
  <div class="myczone" ref="wrapperEl" :style="wrapperStyle">
    <div class="myczone-content" :style="contentScaleStyle">

    <!-- ── Top bar ─────────────────────────────────────────── -->
    <div class="cz-topbar">
      <div class="cz-topbar-left">
        <OrangeButton v-if="isOwnZone" @click="toggleBuild">
          {{ cz.buildMode ? 'Exit Build' : 'Build' }}
        </OrangeButton>
        <OrangeButton v-else-if="viewedOwner">Trade</OrangeButton>
        <button
          v-for="(_, i) in cz.zones" :key="i"
          class="cz-zone-tab" :class="{ active: cz.activeZone === i }"
          @click="cz.activeZone = i"
        >{{ i + 1 }}</button>
      </div>
      <div class="cz-owner-info" v-if="viewedOwner">
        <img :src="`/avatars/${viewedOwner.avatar || 'default.png'}`" class="cz-owner-avatar" />
        <span class="cz-owner-label">
          <span class="cz-owner-prefix">Owner</span> {{ viewedOwner.username }}
        </span>
      </div>
    </div>

    <!-- ── Canvas ──────────────────────────────────────────── -->
    <div class="cz-canvas-outer">
      <div
        class="cz-canvas"
        ref="canvasEl"
        :style="{ backgroundImage: currentBg }"
        @contextmenu.prevent="onContextMenu"
        @mousedown="onCanvasMouseDown"
      >
        <img
          v-for="toon in currentZone.toons" :key="toon.id"
          :src="toon.assetPath" :alt="toon.name"
          class="cz-item"
          :class="{ 'is-dragging': localDrag?.toon?.id === toon.id }"
          :style="{ left: toon.x + 'px', top: toon.y + 'px' }"
          :title="toon.name"
          draggable="false"
        />
      </div>
    </div>

    <!-- ── Bottom bar ──────────────────────────────────────── -->
    <div class="cz-bottombar">
      <GreenButton class="cz-myczone-btn" @click="goToMyCzone">My cZone</GreenButton>
      <div class="cz-build-hint">
        <template v-if="cz.buildMode">Drag cToons from sidebar · Right-click canvas to remove</template>
      </div>
      <div class="cz-nav-buttons">
        <img src="/images/newsite/ten_left.gif"  class="cz-nav-btn" title="Previous 10" draggable="false" @click="navigate('previous10')" />
        <img src="/images/newsite/one_left.gif"  class="cz-nav-btn" title="Previous"    draggable="false" @click="navigate('previous')"   />
        <img src="/images/newsite/rand.gif"      class="cz-nav-btn" title="Random"      draggable="false" @click="navigate('random')"     />
        <img src="/images/newsite/one_right.gif" class="cz-nav-btn" title="Next"        draggable="false" @click="navigate('next')"        />
        <img src="/images/newsite/ten_right.gif" class="cz-nav-btn" title="Next 10"     draggable="false" @click="navigate('next10')"     />
      </div>
    </div>

    </div><!-- /myczone-content -->

    <!-- ── Ghost (global, for cross-component drag) ─────────── -->
    <Teleport to="body">
      <img
        v-if="cz.activeDrag"
        :src="cz.activeDrag.ctoon.assetPath"
        class="cz-ghost-global"
        :style="{ left: cz.ghostX + 'px', top: cz.ghostY + 'px' }"
        draggable="false"
      />
    </Teleport>

  </div>
</template>

<script setup>
// ── Canvas size variables ─────────────────────────────────────
const TOON_SIZE   = 80    // default toon size in px when dropped
const TOPBAR_H    = 34    // top bar height in px
const BOTTOMBAR_H = 35    // bottom bar height in px
const DESIGN_W    = 800   // design canvas width (matches main-content width)
const DESIGN_H    = 669   // design canvas height (matches main-content height)

// Reactive canvas dimensions — always the design dimensions (pre-transform)
function canvasW() { return canvasEl.value?.offsetWidth  ?? DESIGN_W }
function canvasH() { return canvasEl.value?.offsetHeight ?? (DESIGN_H - TOPBAR_H - BOTTOMBAR_H) }

const { user } = useAuth()
const cz = useNewSiteCzoneState()
const route  = useRoute()
const router = useRouter()

// ── Mobile scaling ────────────────────────────────────────────
const wrapperEl    = ref(null)
const contentScale = ref(1)

function updateContentScale() {
  if (!wrapperEl.value) return
  const w = wrapperEl.value.offsetWidth
  contentScale.value = w > 0 ? Math.min(w / DESIGN_W, 1) : 1
}

const contentScaleStyle = computed(() => {
  const s = contentScale.value
  if (s >= 1) return {}
  return { transform: `scale(${s})`, transformOrigin: 'top left' }
})

// Wrapper height = scaled design height, so the element self-sizes correctly
// instead of relying on height:100% which breaks when parent has height:auto
const wrapperStyle = computed(() => ({
  height: Math.round(contentScale.value * DESIGN_H) + 'px'
}))

let resizeObserver = null

const canvasEl   = ref(null)
const viewedOwner    = ref(null)   // { username, avatar } of the displayed zone owner
const viewedUsername = ref(null)   // username whose zone is currently displayed

// Local drag: repositioning toons already on the canvas
const localDrag = ref(null)  // { toon, offsetX, offsetY }

const currentZone = computed(() => cz.value.zones[cz.value.activeZone] ?? { background: '', toons: [] })
const isOwnZone   = computed(() => !!user.value && viewedUsername.value === user.value.username)

const currentBg = computed(() => {
  const bg   = currentZone.value.background
  const grid = `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`
  return bg ? `${grid}, url('/backgrounds/${bg}')` : grid
})

// ── Lifecycle ─────────────────────────────────────────────────
onMounted(() => {
  resizeObserver = new ResizeObserver(updateContentScale)
  if (wrapperEl.value) {
    resizeObserver.observe(wrapperEl.value)
    updateContentScale()
  }
  window.addEventListener('mousemove', onGlobalMove)
  window.addEventListener('mouseup',   onGlobalUp)
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
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('mousemove', onGlobalMove)
  window.removeEventListener('mouseup',   onGlobalUp)
  // clear any leftover drag state
  cz.value.activeDrag = null
  cz.value.buildMode  = false
})

// ── Data loading ──────────────────────────────────────────────
async function loadZone(username) {
  const target = username ?? user.value?.username
  if (!target) return
  try {
    const data = await $fetch(`/api/czone/${target}`)
    cz.value.zones       = data.cZone.zones
    cz.value.activeZone  = 0
    viewedUsername.value = target
    viewedOwner.value    = { username: data.ownerName, avatar: data.avatar }
  } catch (e) {
    console.error('MyCzone: failed to load zone', e)
  }
}

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
  if (!isOwnZone.value) return
  cz.value.buildMode = !cz.value.buildMode
  if (cz.value.buildMode) {
    if (!cz.value.collection.length) {
      cz.value.loadingCollection = true
      try {
        cz.value.collection = await $fetch(`/api/collection/${user.value.username}`)
      } catch (e) {
        console.error('MyCzone: failed to load collection', e)
      } finally {
        cz.value.loadingCollection = false
      }
    }
    if (!cz.value.backgrounds.length) {
      try {
        cz.value.backgrounds = await $fetch('/api/czone/backgrounds-available')
      } catch (e) {
        console.error('MyCzone: failed to load backgrounds', e)
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────
function canvasRect() { return canvasEl.value?.getBoundingClientRect() }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function toCanvasCoords(cx, cy) {
  const r = canvasRect()
  if (!r) return { x: 0, y: 0 }
  const s = contentScale.value
  return { x: (cx - r.left) / s, y: (cy - r.top) / s }
}

function isOverCanvas(cx, cy) {
  const r = canvasRect()
  return r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
}

// ── Canvas mousedown: reposition placed toons ─────────────────
function onCanvasMouseDown(e) {
  if (!cz.value.buildMode) return
  const { x, y } = toCanvasCoords(e.clientX, e.clientY)
  const toons = currentZone.value.toons
  for (let i = toons.length - 1; i >= 0; i--) {
    const t = toons[i]
    const w = t.width || TOON_SIZE, h = t.height || TOON_SIZE
    if (x >= t.x && x <= t.x + w && y >= t.y && y <= t.y + h) {
      localDrag.value = { toon: t, offsetX: x - t.x, offsetY: y - t.y }
      e.preventDefault()
      return
    }
  }
}

// ── Global mouse move ─────────────────────────────────────────
function onGlobalMove(e) {
  // Update ghost for cross-component drag from CzoneEdit
  if (cz.value.activeDrag) {
    cz.value.ghostX = e.clientX
    cz.value.ghostY = e.clientY
  }
  // Reposition local canvas drag
  if (localDrag.value) {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY)
    const t = localDrag.value.toon
    t.x = clamp(x - localDrag.value.offsetX, 0, canvasW() - (t.width  || TOON_SIZE))
    t.y = clamp(y - localDrag.value.offsetY, 0, canvasH() - (t.height || TOON_SIZE))
  }
}

// ── Global mouse up ───────────────────────────────────────────
function onGlobalUp(e) {
  // Drop from CzoneEdit onto canvas
  if (cz.value.activeDrag && isOverCanvas(e.clientX, e.clientY)) {
    const { x, y } = toCanvasCoords(e.clientX, e.clientY)
    const c = cz.value.activeDrag.ctoon
    if (!currentZone.value.toons.some(t => t.id === c.id)) {
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        currentZone.value.toons.push({
          id: c.id, assetPath: c.assetPath, name: c.name,
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
    if (x >= t.x && x <= t.x + (t.width || TOON_SIZE) && y >= t.y && y <= t.y + (t.height || TOON_SIZE)) {
      toons.splice(i, 1); return
    }
  }
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
  width: 100%;
  /* height set dynamically via wrapperStyle (scale × DESIGN_H) */
  overflow: hidden;
  user-select: none;
  position: relative;
}

.myczone-content {
  display: flex;
  flex-direction: column;
  width: v-bind(DESIGN_W + 'px');
  height: v-bind(DESIGN_H + 'px');
  transform-origin: top left;
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
.cz-owner-prefix { font-size: 0.6rem; text-transform: uppercase; color: rgba(255,255,255,0.55); margin-right: 3px; }

/* ── Canvas ── */
.cz-canvas-outer {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: var(--OrbitDarkBlue);
}

.cz-canvas {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: var(--OrbitDarkBlue);
  background-size: 40px 40px, 40px 40px, cover;
  background-position: 0 0, 0 0, center;
  background-repeat: repeat, repeat, no-repeat;
  cursor: default;
}

.cz-item {
  position: absolute;
  cursor: default;
  image-rendering: pixelated;
  pointer-events: none;
}

.cz-item.is-dragging { opacity: 0.5; }

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
</style>
