<template>
  <Nav />

<!-- Mobile Buttons -->
<div class="lg:hidden flex flex-col gap-2 my-6 mt-20 px-4">
  <button class="bg-blue-600 text-white px-4 py-2 rounded" @click="openPanel('ctoones')">Add cToons</button>
  <button class="bg-green-600 text-white px-4 py-2 rounded" @click="openPanel('backgrounds')">Change Background</button>
</div>

<div class="px-0 md:px-4 py-6 mx-auto flex gap-6 md:mt-20 max-w-[800px]">
  <!-- Left Panel -->
  <div class="hidden lg:block w-2/3 bg-white rounded-xl shadow-md p-4 flex flex-col">
    <div class="flex gap-2 mb-4">
      <button :class="tab === 'ctoones' ? activeTab : tabClass" @click="tab = 'ctoones'">cToons</button>
      <button :class="tab === 'backgrounds' ? activeTab : tabClass" @click="tab = 'backgrounds'">Backgrounds</button>
    </div>
    <div v-if="tab === 'ctoones'" class="mb-4">
      <select v-model="seriesFilter" class="mb-2 w-full border rounded px-2 py-1">
        <option value="">All Series</option>
        <option v-for="s in uniqueSeries" :key="s">{{ s }}</option>
      </select>
      <select v-model="rarityFilter" class="w-full border rounded px-2 py-1">
        <option value="">All Rarities</option>
        <option v-for="r in uniqueRarities" :key="r">{{ r }}</option>
      </select>
      <div class="mb-4 flex flex-wrap gap-2 overflow-y-auto h-[500px]">
        <div
          v-for="element in filteredCtoons"
          :key="element.id"
          class="cursor-move flex items-start justify-center min-h-[6rem] w-[48%]"
          draggable="true"
          @dragstart="onDragStart(element)"
        >
          <img :src="element.assetPath" :alt="element.name" class="object-contain" />
        </div>
      </div>
    </div>
    <div v-else class="grid grid-cols-2 gap-2 overflow-y-auto h-[500px]">
      <div
        v-for="bg in backgrounds"
        :key="bg"
        class="border p-1 cursor-pointer"
        :class="{ 'border-blue-500': selectedBackground === bg }"
        @click="selectBackground(bg)"
      >
        <img :src="`/backgrounds/${bg}`" class="w-full h-auto object-cover" />
      </div>
    </div>
  </div>

  <!-- Right Canvas Panel -->
  <div class="bg-white rounded-xl shadow-md">
    <div :style="scaleStyle">
      <div
        id="czone-canvas"
        class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto mb-4"
        :style="`background: url('/backgrounds/${selectedBackground}') center / cover no-repeat`"
        @dragover.prevent
        @drop="onDrop"
      >
        <div
          v-for="(item, index) in layout"
          :key="item.id"
          class="absolute cursor-pointer"
          :class="{ dragging: currentlyDraggingIndex === index }"
          :style="{ top: item.y + 'px', left: item.x + 'px', width: item.width + 'px', height: item.height + 'px' }"
          @contextmenu.prevent="removeItem(index)"
          @mousedown="onMouseDown($event, index)"
          @touchstart="onTouchStart($event, index)"
        >
          <img
            :src="item.assetPath"
            :alt="item.name"
            class="object-contain border border-gray-300"
            draggable="false"
          />
        </div>
      </div>
    </div>

    <!-- Buttons under the canvas -->
    <div class="flex flex-col lg:flex-row justify-between gap-2 px-4 mb-6 mt-6">
      <button class="bg-red-500 text-white px-4 py-2 rounded" @click="clearAll">
        Remove All cToons
      </button>
      <div class="flex gap-2">
        <button
          class="bg-gray-500 text-white px-4 py-2 rounded"
          @click="navigateTo('/czone/' + user.username)"
        >
          Close
        </button>
        <button class="bg-green-600 text-white px-4 py-2 rounded" @click="saveLayout(true)">
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
        <button class="text-gray-600 hover:text-gray-900" @click="closePanel">✕</button>
      </div>
      <div v-if="panelType === 'ctoones'" class="flex flex-col gap-2">
        <select v-model="seriesFilter" class="mb-2 border rounded px-2 py-1">
          <option value="">All Series</option>
          <option v-for="s in uniqueSeries" :key="s">{{ s }}</option>
        </select>
        <select v-model="rarityFilter" class="mb-2 border rounded px-2 py-1">
          <option value="">All Rarities</option>
          <option v-for="r in uniqueRarities" :key="r">{{ r }}</option>
        </select>
        <div class="flex flex-wrap gap-2 max-h-[400px] overflow-y-auto">
          <div
            v-for="ctoon in filteredCtoons"
            :key="ctoon.id"
            class="cursor-pointer flex items-center justify-center min-h-[6rem] w-[48%] border rounded p-1"
            @click="selectCtoon(ctoon)"
          >
            <img :src="ctoon.assetPath" :alt="ctoon.name" class="object-contain" />
          </div>
        </div>
      </div>
      <div v-else class="grid grid-cols-2 gap-2 max-h-[450px] overflow-y-auto">
        <div
          v-for="bg in backgrounds"
          :key="bg"
          class="border p-1 cursor-pointer"
          :class="{ 'border-blue-500': selectedBackground === bg }"
          @click="selectBackground(bg)"
        >
          <img :src="`/backgrounds/${bg}`" class="w-full h-auto object-cover" />
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
import Nav from '@/components/Nav.vue'
import Toast from '@/components/Toast.vue'

definePageMeta({ middleware: 'auth' })

// Scale logic
const scale = ref(1)
const recalcScale = () => {
  scale.value = Math.min(1, window.innerWidth / 800)
}
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1', key: 'viewport' }
  ]
})
const scaleStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
  width: `${800 * scale.value}px`,
  height: `${600 * scale.value}px`
}))

// Canvas constraints
const canvasSize = { width: 800, height: 600 }
const clampPosition = (x, y, w, h) => ({
  x: Math.max(0, Math.min(x, canvasSize.width - w)),
  y: Math.max(0, Math.min(y, canvasSize.height - h))
})

// State & data
const { user } = useAuth()
const tab = ref('ctoones')
const seriesFilter = ref('')
const rarityFilter = ref('')
const selectedBackground = ref('IMG_3433.GIF')
const layout = ref([])
const toastMessage = ref('')
const toastType = ref('error')
const ctoons = ref([])
const backgrounds = ref([])

const uniqueSeries = computed(() =>
  [...new Set(ctoons.value.map(c => c.series).filter(Boolean))]
)
const uniqueRarities = computed(() =>
  [...new Set(ctoons.value.map(c => c.rarity).filter(Boolean))]
)
const filteredCtoons = computed(() =>
  ctoons.value.filter(c =>
    (!seriesFilter.value || c.series === seriesFilter.value) &&
    (!rarityFilter.value || c.rarity === rarityFilter.value) &&
    !layout.value.some(i => i.id === c.id)
  )
)

onMounted(async () => {
  recalcScale()
  window.addEventListener('resize', recalcScale)
  const res = await $fetch('/api/czone/edit')
  ctoons.value = res.ctoons
  backgrounds.value = res.backgrounds
  layout.value = res.layout || []
  selectedBackground.value = res.background || 'backgrounds/IMG_3433.GIF'
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', recalcScale)
})

// Drag & drop new
const draggingItem = ref(null)
function onDragStart(ctoon) {
  draggingItem.value = ctoon
}
async function onDrop(e) {
  if (!draggingItem.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  let rawX = (e.clientX - rect.left) / scale.value
  let rawY = (e.clientY - rect.top) / scale.value
  const img = new Image()
  img.src = draggingItem.value.assetPath
  await img.decode()
  const { x, y } = clampPosition(rawX, rawY, img.naturalWidth, img.naturalHeight)
  layout.value.push({
    id: draggingItem.value.id,
    name: draggingItem.value.name,
    assetPath: draggingItem.value.assetPath,
    x, y,
    width: img.naturalWidth,
    height: img.naturalHeight
  })
  ctoons.value = ctoons.value.filter(c => c.id !== draggingItem.value.id)
  draggingItem.value = null
  await saveLayout(false)
}

// Reposition & removal
const currentlyDraggingIndex = ref(null)
const dragOffset = ref({ x: 0, y: 0 })

function onMouseDown(e, idx) {
  e.preventDefault()
  currentlyDraggingIndex.value = idx
  const rect = e.target.closest('.absolute').getBoundingClientRect()
  dragOffset.value = {
    x: (e.clientX - rect.left) / scale.value,
    y: (e.clientY - rect.top) / scale.value
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onTouchStart(e, idx) {
  e.preventDefault()
  currentlyDraggingIndex.value = idx
  document.body.style.overflow = 'hidden'
  const t = e.touches[0]
  const rect = e.target.closest('.absolute').getBoundingClientRect()
  dragOffset.value = {
    x: (t.clientX - rect.left) / scale.value,
    y: (t.clientY - rect.top) / scale.value
  }
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
}

async function onMouseMove(e) {
  if (currentlyDraggingIndex.value === null) return
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
  if (currentlyDraggingIndex.value === null) return
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
  await saveLayout(false)
  currentlyDraggingIndex.value = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

async function onTouchEnd() {
  if (currentlyDraggingIndex.value !== null) {
    await saveLayout(false)
  }
  document.body.style.overflow = ''
  currentlyDraggingIndex.value = null
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
}

async function removeItem(idx) {
  const [removed] = layout.value.splice(idx, 1)
  currentlyDraggingIndex.value = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  await saveLayout(false)
  ctoons.value.push({
    id: removed.id,
    name: removed.name,
    assetPath: removed.assetPath,
    series: removed.series,
    rarity: removed.rarity
  })
}

function clearAll() {
  layout.value = []
}

async function saveLayout(showToast = false) {
  try {
    await $fetch('/api/czone/save', {
      method: 'POST',
      body: { background: selectedBackground.value, layout: layout.value }
    })
    if (showToast) {
      toastType.value = 'success'
      toastMessage.value = 'cZone saved successfully!'
      setTimeout(() => (toastMessage.value = ''), 5000)
    }
  } catch {
    toastType.value = 'error'
    toastMessage.value = 'Failed to save layout.'
    setTimeout(() => (toastMessage.value = ''), 5000)
  }
}

async function selectBackground(bg) {
  selectedBackground.value = bg
  await saveLayout()
}

async function selectCtoon(ctoon) {
  layout.value.push({
    id: ctoon.id,
    name: ctoon.name,
    assetPath: ctoon.assetPath,
    x: 0,
    y: 0,
    width: ctoon.naturalWidth || 100,
    height: ctoon.naturalHeight || 100
  })
  ctoons.value = ctoons.value.filter(c => c.id !== ctoon.id)
  showPanel.value = false
  await saveLayout(false)
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

</script>

<style>
.slide-left-enter-active,
.slide-left-leave-active { transition: transform 0.3s ease; }
.slide-left-enter-from,
.slide-left-leave-to { transform: translateX(-100%); }
.slide-left-enter-to,
.slide-left-leave-from { transform: translateX(0%); }
.dragging { opacity: 0.5; outline: 2px dashed #3b82f6; z-index: 50; }
#czone-canvas { touch-action: none; }
</style>
