<template>
  <Nav />
  <div class="mt-1">&nbsp;</div>
  <!-- Mobile Buttons -->
  <div class="lg:hidden flex flex-col gap-2 my-6 mt-20 md:pt-10 px-4">
    <button
      class="bg-blue-600 text-white px-4 py-2 rounded"
      @click="openPanel('ctoones')"
    >
      Add cToons
    </button>
    <button
      class="bg-green-600 text-white px-4 py-2 rounded"
      @click="openPanel('backgrounds')"
    >
      Change Background
    </button>
  </div>

  <div class="px-0 md:px-4 py-6 mx-auto flex gap-6 md:mt-20 w-full max-w-[1200px] justify-center items-start">
    <!-- Left Panel -->
    <div class="hidden lg:block lg:w-[360px] lg:flex-shrink-0 bg-white rounded-xl shadow-md p-4 flex flex-col">
      <div class="flex gap-2 mb-4">
        <button
          :class="tab === 'ctoones' ? activeTab : tabClass"
          @click="tab = 'ctoones'"
        >
          cToons
        </button>
        <button
          :class="tab === 'backgrounds' ? activeTab : tabClass"
          @click="tab = 'backgrounds'"
        >
          Backgrounds
        </button>
      </div>
      <div v-if="tab === 'ctoones'" class="mb-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search name or characters"
          class="mb-2 w-full border rounded px-2 py-1"
        />
        <select v-model="seriesFilter" class="mb-2 w-full border rounded px-2 py-1">
          <option value="">All Series</option>
          <option v-for="s in uniqueSeries" :key="s">{{ s }}</option>
        </select>
        <select v-model="rarityFilter" class="w-full border rounded px-2 py-1">
          <option value="">All Rarities</option>
          <option v-for="r in uniqueRarities" :key="r">{{ r }}</option>
        </select>
        <div class="mt-2 mb-4 flex flex-wrap items-start content-start gap-x-2 gap-y-1 overflow-y-auto h-[500px]">
          <div
            v-for="element in filteredCtoons"
            :key="element.id"
            class="cursor-move flex items-start justify-center w-[48%]"
            draggable="true"
            @dragstart="onDragStart(element, $event)"
          >
            <div class="relative inline-flex items-center justify-center">
              <img
                :src="element.assetPath"
                :alt="element.name"
                class="block max-w-full h-auto object-contain"
              />
              <GtoonOverlay
                v-if="element.isGtoon"
                :power="element.power"
                :cost="element.cost"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-else class="grid grid-cols-2 gap-2 overflow-y-auto max-h-[500px] pr-1">
        <div
          v-for="bg in availableBackgrounds"
          :key="bg.id"
          class="border p-1 cursor-pointer"
          :class="{ 'border-blue-500': selectedBackground === bg.imagePath }"
          @click="selectBackground(bg.imagePath)"
        >
          <img :src="bg.imagePath" class="w-full h-auto object-cover" />
        </div>
      </div>
    </div>

    <!-- Right Canvas Panel -->
    <div class="bg-white w-full lg:w-[800px] lg:flex-shrink-0">
      <!-- Zone pager controls -->
      <div class="flex justify-between items-center mb-2 px-4">
        <button
          class="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:opacity-50"
          @click="prevZone"
          :disabled="currentZoneIndex === 0"
        >
          ← Zone {{ currentZoneIndex }}
        </button>
        <div class="text-sm font-medium">
          Zone {{ currentZoneIndex + 1 }} of {{ zoneCount }}
        </div>
        <button
          class="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:opacity-50"
          @click="nextZone"
          :disabled="currentZoneIndex === zoneCount - 1"
        >
          Zone {{ currentZoneIndex + 2 }} →
        </button>
      </div>

      <div :style="scaleStyle">
        <div
          id="czone-canvas"
          class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto mb-4"
          :style="canvasBackgroundStyle"
          @dragover.prevent
          @drop="onDrop"
        >
          <div
            v-for="(item, index) in layout"
            :key="item.id"
            class="absolute cursor-pointer"
            :class="{ dragging: currentlyDraggingIndex === index && isDragging }"
            :style="{ top: item.y + 'px', left: item.x + 'px', width: item.width + 'px', height: item.height + 'px' }"
            @contextmenu.prevent="removeItem(index)"
            @mousedown="onMouseDown($event, index)"
            @mouseup="onMouseUp"
            @touchstart="onTouchStart($event, index)"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
            @touchcancel="onTouchEnd"
          >
            <div class="relative w-full h-full">
              <button
                type="button"
                class="absolute top-1 right-1 z-10 w-6 h-6 rounded-full bg-white/80 text-gray-700 shadow hover:bg-white flex items-center justify-center"
                aria-label="Bring to front"
                @click.stop="bringToFront(index)"
                @mousedown.stop
                @touchstart.stop
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M7 17h10M9 13h6M12 6v7M9 9l3-3 3 3" />
                </svg>
              </button>
              <img
                :src="item.assetPath"
                :alt="item.name"
                class="max-w-none object-contain"
                draggable="false"
              />
              <GtoonOverlay
                v-if="item.isGtoon"
                :power="item.power"
                :cost="item.cost"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Buttons under the canvas -->
      <div class="flex flex-col lg:flex-row justify-between gap-2 px-4 mb-6 mt-6 max-w-full">
        <button
          class="bg-red-500 text-white px-4 py-2 rounded"
          @click="clearZone"
        >
          Remove All cToons
        </button>
        <div class="flex gap-2">
          <button
            class="bg-gray-500 text-white px-4 py-2 rounded"
            @click="closeEditor"
          >
            Close
          </button>
          <button
            class="bg-green-600 text-white px-4 py-2 rounded"
            @click="saveZones(true, 'save button')"
          >
            Save
          </button>
        </div>
      </div>
    </div>

    <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />

    <!-- Slide-in Panel -->
    <Transition name="slide-left">
      <div
        v-if="showPanel"
        class="fixed top-0 left-0 h-full w-80 bg-white shadow-lg p-4 overflow-y-auto z-50"
      >
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold">
            {{ panelType === 'ctoones' ? 'Add cToons' : 'Change Background' }}
          </h3>
          <button class="text-gray-600 hover:text-gray-900" @click="closePanel">
            ✕
          </button>
        </div>
        <div v-if="panelType === 'ctoones'" class="flex flex-col gap-2">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search name or characters"
            class="mb-2 border rounded px-2 py-1"
          />
          <select v-model="seriesFilter" class="mb-2 border rounded px-2 py-1">
            <option value="">All Series</option>
            <option v-for="s in uniqueSeries" :key="s">{{ s }}</option>
          </select>
          <select v-model="rarityFilter" class="mb-2 border rounded px-2 py-1">
            <option value="">All Rarities</option>
            <option v-for="r in uniqueRarities" :key="r">{{ r }}</option>
          </select>
          <div class="flex flex-wrap items-start content-start gap-x-2 gap-y-1 max-h-[400px] overflow-y-auto">
            <div
              v-for="ctoon in filteredCtoons"
              :key="ctoon.id"
              class="cursor-pointer flex items-center justify-center w-[48%] border rounded p-1"
              @click="selectCtoon(ctoon)"
            >
              <div class="relative inline-flex items-center justify-center">
                <img
                  :src="ctoon.assetPath"
                  :alt="ctoon.name"
                  class="block max-w-full h-auto object-contain"
                />
                <GtoonOverlay
                  v-if="ctoon.isGtoon"
                  :power="ctoon.power"
                  :cost="ctoon.cost"
                />
              </div>
            </div>
          </div>
        </div>
        <div v-else class="grid grid-cols-2 gap-2 overflow-y-auto max-h-[500px] pr-1">
          <div
            v-for="bg in availableBackgrounds"
            :key="bg.id"
            class="border p-1 cursor-pointer"
            :class="{ 'border-blue-500': selectedBackground === bg.imagePath }"
            @click="selectBackground(bg.imagePath)"
          >
            <img :src="bg.imagePath" class="w-full h-auto object-cover" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { navigateTo, useHead } from '#app'
import GtoonOverlay from '@/components/GtoonOverlay.vue'
import Nav from '@/components/Nav.vue'
import Toast from '@/components/Toast.vue'

definePageMeta({
  title: 'Edit cZone',
  middleware: 'auth',
  layout: 'default',
})

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
})

// ——— Loading indicator ———
const loading = ref(true)
const pressTimer = ref(null)
const longPressDuration = 3000  // 3 seconds

// ——— Scale logic ———
const scale = ref(1)
const recalcScale = () => {
  scale.value = Math.min(1, window.innerWidth / 800)
}
const scaleStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
}))

// ——— Canvas constraints ———
const canvasSize = { width: 800, height: 600 }
const clampPosition = (x, y, w, h) => ({
  x: Math.max(0, Math.min(x, canvasSize.width - w)),
  y: Math.max(0, Math.min(y, canvasSize.height - h)),
})

// ——— State & data ———
const { user } = useAuth()
const tab = ref('ctoones')
const seriesFilter = ref('')
const rarityFilter = ref('')
const searchQuery = ref('')

// Instead of a single layout/background, store multiple zones
const zones = ref([
  { layout: [], background: '' },
  { layout: [], background: '' },
  { layout: [], background: '' },
])

// Which zone is currently active
const currentZoneIndex = ref(0)
const currentZone = computed(() => zones.value[currentZoneIndex.value])
const zoneCount = computed(() => Math.max(1, zones.value.length))

// Computed getter/setter so template can do “layout” → currentZone.layout
const layout = computed({
  get: () => currentZone.value.layout,
  set: (val) => {
    currentZone.value.layout = val
  },
})
const selectedBackground = computed({
  get: () => currentZone.value.background,
  set: (val) => {
    currentZone.value.background = val
  },
})

// These two give us quick access in the template
const canvasBackgroundStyle = computed(() => {
  const src = toUrl(selectedBackground.value)
  if (!src) return { backgroundColor: 'transparent' }
  return {
    backgroundImage: `url('${src}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
})

const toastMessage = ref('')
const toastType = ref('error')
const ctoons = ref([])
const availableBackgrounds = ref([])

// helper so old saved values (e.g., "foo.png") still render nicely
function toUrl(v) {
  if (!v) return ''
  return v.startsWith('/') ? v : `/backgrounds/${v}`
}

// Filter dropdown options
const uniqueSeries = computed(() =>
  [...new Set(ctoons.value.map((c) => c.series).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )
)
const uniqueRarities = computed(() =>
  [...new Set(ctoons.value.map((c) => c.rarity).filter(Boolean))]
)

// Keep track of every cToon already placed in any zone
const placedIds = computed(() =>
  new Set(zones.value.flatMap((z) => z.layout.map((item) => item.id)))
)

// Only show those cToons that the user hasn’t placed anywhere yet
const filteredCtoons = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return ctoons.value.filter((c) => {
    const matchesSeries = !seriesFilter.value || c.series === seriesFilter.value
    const matchesRarity = !rarityFilter.value || c.rarity === rarityFilter.value
    const matchesSearch =
      !q ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (Array.isArray(c.characters) && c.characters.some((ch) => ch && ch.toLowerCase().includes(q)))
    const notPlaced = !placedIds.value.has(c.id)
    return matchesSeries && matchesRarity && matchesSearch && notPlaced
  })
})

// ——— Zone paging ———
function nextZone() {
  if (currentZoneIndex.value < zoneCount.value - 1) {
    currentZoneIndex.value += 1
  }
}
function prevZone() {
  if (currentZoneIndex.value > 0) {
    currentZoneIndex.value -= 1
  }
}

function startLongPress(idx) {
  // clear any old timer
  clearTimeout(pressTimer.value)
  // start a new one
  pressTimer.value = setTimeout(() => {
    removeItem(idx)
  }, longPressDuration)
}

function cancelLongPress() {
  clearTimeout(pressTimer.value)
}

// ——— Drag & drop logic ———
const draggingItem = ref(null)
let dragImageEl = null

function onDragStart(ctoon, ev) {
  draggingItem.value = ctoon
  dragImageEl = ev.target.cloneNode(true)
  dragImageEl.style.position = 'absolute'
  dragImageEl.style.top = '-9999px'
  dragImageEl.style.left = '-9999px'
  dragImageEl.style.width = `${ev.target.clientWidth}px`
  dragImageEl.style.height = `${ev.target.clientHeight}px`
  document.body.appendChild(dragImageEl)
  ev.dataTransfer.setDragImage(dragImageEl, 0, 0)
}

const cleanupDragImage = () => {
  if (dragImageEl) {
    document.body.removeChild(dragImageEl)
    dragImageEl = null
  }
}

async function onDrop(e) {
  if (!draggingItem.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  let rawX = (e.clientX - rect.left) / scale.value
  let rawY = (e.clientY - rect.top) / scale.value

  const img = new Image()
  img.src = draggingItem.value.assetPath
  await img.decode()

  const { x, y } = clampPosition(
    rawX,
    rawY,
    img.naturalWidth,
    img.naturalHeight
  )

  layout.value.push({
    id: draggingItem.value.id,
    name: draggingItem.value.name,
    assetPath: draggingItem.value.assetPath,
    series: draggingItem.value.series,
    rarity: draggingItem.value.rarity,
    isGtoon: draggingItem.value.isGtoon,
    cost: draggingItem.value.cost,
    power: draggingItem.value.power,
    characters: Array.isArray(draggingItem.value.characters) ? draggingItem.value.characters : [],
    x,
    y,
    width: img.naturalWidth,
    height: img.naturalHeight,
  })

  ctoons.value = ctoons.value.filter((c) => c.id !== draggingItem.value.id)
  draggingItem.value = null
  await saveZones(false)
}

const currentlyDraggingIndex = ref(null)
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

function onMouseDown(e, idx) {
  e.preventDefault()
  currentlyDraggingIndex.value = idx
  isDragging.value = false
  const rect = e.target.closest('.absolute').getBoundingClientRect()
  dragOffset.value = {
    x: (e.clientX - rect.left) / scale.value,
    y: (e.clientY - rect.top) / scale.value,
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onTouchStart(e, idx) {
  e.preventDefault()
  currentlyDraggingIndex.value = idx
  isDragging.value = false
  document.body.style.overflow = 'hidden'
  startLongPress(idx)
  const t = e.touches[0]
  const rect = e.target.closest('.absolute').getBoundingClientRect()
  dragOffset.value = {
    x: (t.clientX - rect.left) / scale.value,
    y: (t.clientY - rect.top) / scale.value,
  }
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
}

async function onMouseMove(e) {
  if (currentlyDraggingIndex.value === null) return
  if (!isDragging.value) {
    isDragging.value = true
  }
  const canvasRect = document.querySelector('#czone-canvas').getBoundingClientRect()
  let rawX = (e.clientX - canvasRect.left) / scale.value - dragOffset.value.x
  let rawY = (e.clientY - canvasRect.top) / scale.value - dragOffset.value.y
  const item = layout.value[currentlyDraggingIndex.value]
  const { x, y } = clampPosition(rawX, rawY, item.width, item.height)
  layout.value[currentlyDraggingIndex.value].x = x
  layout.value[currentlyDraggingIndex.value].y = y
}

async function onTouchMove(e) {
  e.preventDefault()
  cancelLongPress()
  if (currentlyDraggingIndex.value === null) return
  if (!isDragging.value) {
    isDragging.value = true
  }
  const t = e.touches[0]
  const canvasRect = document.querySelector('#czone-canvas').getBoundingClientRect()
  let rawX = (t.clientX - canvasRect.left) / scale.value - dragOffset.value.x
  let rawY = (t.clientY - canvasRect.top) / scale.value - dragOffset.value.y
  const item = layout.value[currentlyDraggingIndex.value]
  const { x, y } = clampPosition(rawX, rawY, item.width, item.height)
  layout.value[currentlyDraggingIndex.value].x = x
  layout.value[currentlyDraggingIndex.value].y = y
}

async function onMouseUp() {
  if (currentlyDraggingIndex.value === null) return
  cancelLongPress()
  await saveZones(false)
  currentlyDraggingIndex.value = null
  isDragging.value = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

async function onTouchEnd() {
  if (currentlyDraggingIndex.value !== null) {
    await saveZones(false)
  }
  cancelLongPress()
  document.body.style.overflow = ''
  currentlyDraggingIndex.value = null
  isDragging.value = false
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
}

async function removeItem(idx) {
  const [removed] = layout.value.splice(idx, 1)
  currentlyDraggingIndex.value = null
  isDragging.value = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  await saveZones(false)

  // Only add back to the sidebar if it's not already present
  const existsInSidebar = ctoons.value.some(c => c.id === removed.id)
  if (!existsInSidebar) {
    ctoons.value.unshift({
      id: removed.id,
      name: removed.name,
      assetPath: removed.assetPath,
      series: removed.series,
      rarity: removed.rarity,
      characters: Array.isArray(removed.characters) ? removed.characters : [],
    })
  }
}

async function bringToFront(idx) {
  if (idx < 0 || idx >= layout.value.length) return
  const [item] = layout.value.splice(idx, 1)
  layout.value.push(item)
  if (currentlyDraggingIndex.value === idx) {
    currentlyDraggingIndex.value = layout.value.length - 1
  } else if (currentlyDraggingIndex.value > idx) {
    currentlyDraggingIndex.value -= 1
  }
  await saveZones(false)
}

async function clearZone() {
  layout.value = []

  await saveZones(false)

  // 3) re-load your “available” cToons from the server
  try {
    // the same endpoint you use on mount
    const res = await $fetch('/api/czone/edit')
    // filter out any toons still placed in ANY zone
    ctoons.value = res.ctoons.filter(c => !placedIds.value.has(c.id))
  } catch (err) {
    console.error('Could not refresh available cToons:', err)
  }
}

async function saveZones(showToast = false) {
  const payload = {
    zones: zones.value.map((z) => ({
      background: z.background,
      toons: z.layout,
    })),
  }

  try {
    await $fetch('/api/czone/save', {
      method: 'POST',
      body: payload,
    })
    if (showToast) {
      toastType.value = 'success'
      toastMessage.value = 'cZones saved successfully!'
      setTimeout(() => (toastMessage.value = ''), 5000)
    }
  } catch {
    toastType.value = 'error'
    toastMessage.value = 'Failed to save cZones.'
    setTimeout(() => (toastMessage.value = ''), 5000)
  }
}

async function selectBackground(bgPath) {
  selectedBackground.value = bgPath
  await saveZones(false)
}

async function selectCtoon(ctoon) {
  const img = new Image()
  img.src = ctoon.assetPath
  await img.decode()
  const { x, y } = clampPosition(0, 0, img.naturalWidth, img.naturalHeight)
  layout.value.push({
    id: ctoon.id,
    name: ctoon.name,
    assetPath: ctoon.assetPath,
    series: ctoon.series,
    rarity: ctoon.rarity,
    isGtoon: ctoon.isGtoon,
    cost: ctoon.cost,
    power: ctoon.power,
    characters: Array.isArray(ctoon.characters) ? ctoon.characters : [],
    x,
    y,
    width: img.naturalWidth,
    height: img.naturalHeight,
  })
  ctoons.value = ctoons.value.filter((c) => c.id !== ctoon.id)
  showPanel.value = false
  await saveZones(false)
}

function openPanel(type) {
  panelType.value = type
  showPanel.value = true
}
function closePanel() {
  showPanel.value = false
}

const tabClass = 'bg-gray-200 text-gray-800 px-3 py-1 rounded hover:bg-gray-300'
const activeTab = 'bg-blue-600 text-white px-3 py-1 rounded shadow'

const showPanel = ref(false)
const panelType = ref('ctoones')

async function closeEditor() {
  navigateTo('/czone/' + user.value.username)
}

onMounted(async () => {
  recalcScale()
  window.addEventListener('resize', recalcScale)
  window.addEventListener('dragend', cleanupDragImage)

  const res = await $fetch('/api/czone/edit')
  ctoons.value = res.ctoons
  // NEW: load only backgrounds the user can use now (PUBLIC or unlocked)
  try {
    availableBackgrounds.value = await $fetch('/api/czone/backgrounds-available')
  } catch (e) {
    console.error('Failed to load available backgrounds', e)
    availableBackgrounds.value = []
  }

  if (
    res.zones &&
    Array.isArray(res.zones) &&
    res.zones.length >= 1 &&
    res.zones.every((z) => typeof z.background === 'string' && Array.isArray(z.toons))
  ) {
    zones.value = res.zones.map((z) => ({
      layout: Array.isArray(z.toons) ? [...z.toons] : [],
      background: typeof z.background === 'string' ? z.background : '',
    }))
  } else {
    zones.value = [{
      layout: Array.isArray(res.layout) ? [...res.layout] : [],
      background: typeof res.background === 'string' ? res.background : '',
    }]
  }
  if (currentZoneIndex.value > zones.value.length - 1) {
    currentZoneIndex.value = zones.value.length - 1
  }

  // Assign width/height to every loaded cToon
  for (let z = 0; z < zones.value.length; z++) {
    for (let i = 0; i < zones.value[z].layout.length; i++) {
      const item = zones.value[z].layout[i]
      const img = new Image()
      img.src = item.assetPath
      await img.decode()
      item.width = img.naturalWidth
      item.height = img.naturalHeight
    }
  }

  selectedBackground.value = zones.value[currentZoneIndex.value].background || ''
  loading.value = false
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', recalcScale)
  window.removeEventListener('dragend', cleanupDragImage)
})
</script>

<style>
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
}
.slide-left-enter-to,
.slide-left-leave-from {
  transform: translateX(0%);
}
.dragging {
  opacity: 0.5;
  outline: 2px dashed #3b82f6;
  z-index: 50;
}
#czone-canvas {
  touch-action: none;
}
</style>
