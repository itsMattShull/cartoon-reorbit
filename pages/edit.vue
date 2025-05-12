<template>
  <Nav />

  <!-- Mobile Buttons (moved above canvas panel) -->
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

      <!-- Filters for cToons -->
      <div v-if="tab === 'ctoones'" class="mb-4">
        <select v-model="seriesFilter" class="mb-2 w-full border rounded px-2 py-1">
          <option value="">All Series</option>
          <option v-for="s in uniqueSeries" :key="s">{{ s }}</option>
        </select>
        <select v-model="rarityFilter" class="w-full border rounded px-2 py-1">
          <option value="">All Rarities</option>
          <option v-for="r in uniqueRarities" :key="r">{{ r }}</option>
        </select>
        <div v-if="tab === 'ctoones'" class="mb-4 flex flex-wrap gap-2 overflow-y-auto h-[500px]">
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
          :class="{'border-blue-500': selectedBackground === bg}"
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
            :style="item.style"
            @contextmenu.prevent="removeItem(index)"
            @mousedown="onMouseDown($event, index)"
            @touchstart="onTouchStart($event, index)"
          >
            <img
              :src="item.assetPath"
              :alt="item.name"
              class="object-contain border border-gray-300"
            />
          </div>
        </div>
      </div>

      <!-- Buttons under the canvas -->
      <div class="flex flex-col lg:flex-row justify-between gap-2 px-4 mb-6 mt-6">
        <div class="w-full lg:w-auto">
          <button class="bg-red-500 text-white px-4 py-2 rounded" @click="clearAll">
            Remove All cToons
          </button>
        </div>
        <div class="w-full lg:w-auto flex gap-2">
          <button class="bg-gray-500 text-white px-4 py-2 rounded" @click="navigateTo('/czone/' + user.username)">
            Close
          </button>
          <button class="bg-green-600 text-white px-4 py-2 rounded" @click="saveLayout(true)">
            Save
          </button>
        </div>
      </div>
    </div>

    <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />

    <Transition name="slide-left">
      <div v-if="showPanel" class="fixed top-0 left-0 h-full w-80 bg-white shadow-lg p-4 overflow-y-auto z-50">
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
            :class="{'border-blue-500': selectedBackground === bg}"
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
definePageMeta({
  middleware: 'auth'
})

import Nav from '@/components/Nav.vue'
import Toast from '@/components/Toast.vue'
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { navigateTo, useHead } from '#app'

// --- mobile canvas scaling ---
const scale = ref(1)

const recalcScale = () => {
  // 800 is the logical canvas width
  scale.value = Math.min(1, window.innerWidth / 800)
}

recalcScale()

useHead({
  /* Tell phones to report their *real* width (≈390 px on an iPhone)   */
  meta: [
    { name: 'viewport',
      content: 'width=device-width, initial-scale=1',
      key: 'viewport' }     // ← same key so it REPLACES any previous tag
  ]
})

const scaleStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
  width: `${800 * scale.value}px`,
  height: `${600 * scale.value}px`
}))

const tab = ref('ctoones')
const seriesFilter = ref('')
const rarityFilter = ref('')
const selectedBackground = ref('IMG_3433.GIF')
const layout = ref([])
const toastMessage = ref('')
const toastType = ref('error')
const { user } = useAuth()

const ctoons = ref([])
const backgrounds = ref([])

const uniqueSeries = computed(() => [...new Set(ctoons.value.map(c => c.series).filter(Boolean))])
const uniqueRarities = computed(() => [...new Set(ctoons.value.map(c => c.rarity).filter(Boolean))])

onMounted(async () => {
  const res = await $fetch('/api/czone/edit')
  ctoons.value = res.ctoons
  backgrounds.value = res.backgrounds
  layout.value = res.layout || []
  selectedBackground.value = res.background || 'backgrounds/IMG_3433.GIF'
  window.addEventListener('resize', recalcScale)
})

onBeforeUnmount(() => window.removeEventListener('resize', recalcScale))

const unscale = (v) => v / scale.value

const filteredCtoons = computed(() => {
  return ctoons.value.filter(c => {
    return (!seriesFilter.value || c.series === seriesFilter.value) &&
           (!rarityFilter.value || c.rarity === rarityFilter.value) &&
           !layout.value.some(item => item.id === c.id)
  })
})

// Drag and drop logic for cToons panel and canvas
const draggingItem = ref(null)

const onDragStart = (ctoon) => {
  draggingItem.value = ctoon
}

const onDrop = async (event) => {
  if (!draggingItem.value) return;

  const rect = event.currentTarget.getBoundingClientRect();
  const x = unscale(event.clientX - rect.left)
  const y = unscale(event.clientY - rect.top)

  layout.value.push({
    id: draggingItem.value.id,
    name: draggingItem.value.name,
    assetPath: draggingItem.value.assetPath,
    style: `top: ${y}px; left: ${x}px;`
  });

  ctoons.value = ctoons.value.filter(c => c.id !== draggingItem.value.id);
  draggingItem.value = null;

  await saveLayout(false);
}

const removeItem = index => layout.value.splice(index, 1)

const clearAll = () => layout.value = []

const saveLayout = async (showToast = false) => {
  try {
    await $fetch('/api/czone/save', {
      method: 'POST',
      body: {
        background: selectedBackground.value,
        layout: layout.value
      }
    })
    if (showToast) {
      toastType.value = 'success'
      toastMessage.value = 'cZone saved successfully!'
      setTimeout(() => toastMessage.value = '', 5000)
    }
  } catch (err) {
    toastType.value = 'error'
    toastMessage.value = 'Failed to save layout.'
    setTimeout(() => toastMessage.value = '', 5000)
  }
}

const selectBackground = async (bg) => {
  selectedBackground.value = bg
  await saveLayout()
}

// New drag-and-drop repositioning within canvas
const currentlyDraggingIndex = ref(null)
const dragOffset = ref({ x: 0, y: 0 })

const onMouseDown = (event, index) => {
  event.preventDefault()
  currentlyDraggingIndex.value = index
  const rect = event.target.closest('.absolute').getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Add touch support to dragging
const onTouchStart = (event, index) => {
  currentlyDraggingIndex.value = index
  event.preventDefault()
  // Disable page scrolling while dragging on touch devices
  document.body.style.overflow = 'hidden'
  const touch = event.touches[0]
  const rect = event.target.closest('.absolute').getBoundingClientRect()
  dragOffset.value = {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top
  }
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd)
}

const onMouseMove = (event) => {
  if (currentlyDraggingIndex.value === null) return
  const canvasRect = document.querySelector('#czone-canvas').getBoundingClientRect()
  const x = unscale(event.clientX - canvasRect.left - dragOffset.value.x)
  const y = unscale(event.clientY - canvasRect.top  - dragOffset.value.y)
  layout.value[currentlyDraggingIndex.value].style = `top: ${y}px; left: ${x}px;`
}

const onTouchMove = (event) => {
  event.preventDefault()
  if (currentlyDraggingIndex.value === null) return
  const touch = event.touches[0]
  const canvasRect = document.querySelector('#czone-canvas').getBoundingClientRect()
  const x = unscale(touch.clientX - canvasRect.left - dragOffset.value.x)
  const y = unscale(touch.clientY - canvasRect.top  - dragOffset.value.y)
  layout.value[currentlyDraggingIndex.value].style = `top: ${y}px; left: ${x}px;`
}

const onMouseUp = async (event) => {
  event.preventDefault()
  if (currentlyDraggingIndex.value === null) return

  const canvasRect = document.querySelector('#czone-canvas').getBoundingClientRect()
  const x = unscale(event.clientX - canvasRect.left - dragOffset.value.x)
  const y = unscale(event.clientY - canvasRect.top  - dragOffset.value.y)
  layout.value[currentlyDraggingIndex.value].style = `top: ${y}px; left: ${x}px;`

  await saveLayout(false)
  currentlyDraggingIndex.value = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

const onTouchEnd = async () => {
  if (currentlyDraggingIndex.value !== null) {
    await saveLayout(false)
  }
  // Re‑enable page scrolling after dragging ends
  document.body.style.overflow = ''
  currentlyDraggingIndex.value = null
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
}

const tabClass = 'bg-gray-200 text-gray-800 px-3 py-1 rounded hover:bg-gray-300'
const activeTab = 'bg-blue-600 text-white px-3 py-1 rounded shadow'

const showPanel = ref(false)
const panelType = ref('ctoones')
const openPanel = async (type) => {
  panelType.value = type
  showPanel.value = true

  if (type === 'ctoones') {
    try {
      const res = await $fetch('/api/czone/edit')
      const ownedCtoons = res.ctoons || []
      ctoons.value = ownedCtoons.filter(c => !layout.value.some(item => item.id === c.id))
    } catch (err) {
      console.error('Failed to refresh cToons:', err)
    }
  }
}
const closePanel = () => { showPanel.value = false }
const selectCtoon = async (ctoon) => {
  layout.value.push({ id: ctoon.id, name: ctoon.name, assetPath: ctoon.assetPath, style: 'top: 0px; left: 0px;' })
  ctoons.value = ctoons.value.filter(c => c.id !== ctoon.id)
  closePanel()
  await saveLayout(false)
}
</script>


<style>
.slide-left-enter-active, .slide-left-leave-active {
  transition: transform 0.3s ease;
}
.slide-left-enter-from {
  transform: translateX(-100%);
}
.slide-left-enter-to {
  transform: translateX(0%);
}
.slide-left-leave-from {
  transform: translateX(0%);
}
.slide-left-leave-to {
  transform: translateX(-100%);
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