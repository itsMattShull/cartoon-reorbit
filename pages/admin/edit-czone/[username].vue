<template>
  <Nav />

  <div class="px-4 py-6 mx-auto flex flex-col items-center gap-4 md:mt-20 w-full max-w-[900px]">
    <!-- Header -->
    <div class="w-full flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold">Admin: Edit cZone for <span class="text-indigo-600">{{ username }}</span></h1>
        <p class="text-sm text-gray-500 mt-0.5">Click the X on a cToon to remove it, then save.</p>
      </div>
      <button
        class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        @click="cancel"
      >
        Cancel
      </button>
    </div>

    <!-- Zone pager -->
    <div class="flex items-center gap-4">
      <button
        class="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:opacity-50"
        :disabled="currentZoneIndex === 0"
        @click="prevZone"
      >
        ← Zone {{ currentZoneIndex }}
      </button>
      <span class="text-sm font-medium">Zone {{ currentZoneIndex + 1 }} of {{ zones.length }}</span>
      <button
        class="bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 disabled:opacity-50"
        :disabled="currentZoneIndex === zones.length - 1"
        @click="nextZone"
      >
        Zone {{ currentZoneIndex + 2 }} →
      </button>
    </div>

    <!-- Canvas -->
    <div :style="scaleWrapStyle">
      <div
        class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto"
        :style="canvasBackgroundStyle"
      >
        <div
          v-for="(toon, idx) in currentToons"
          :key="toon.id + '-' + idx"
          class="absolute"
          :style="{ top: toon.y + 'px', left: toon.x + 'px' }"
        >
          <div class="relative inline-flex items-center justify-center">
            <!-- Remove button -->
            <button
              type="button"
              class="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-red-600 text-white shadow hover:bg-red-700 flex items-center justify-center font-bold text-xs"
              aria-label="Remove cToon"
              @click="removeToon(idx)"
            >
              ✕
            </button>
            <img
              :src="toon.assetPath"
              :alt="toon.name"
              class="max-w-none object-contain"
              draggable="false"
            />
          </div>
        </div>

        <div v-if="currentToons.length === 0 && !loading" class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
          No cToons in this zone
        </div>
      </div>
    </div>

    <!-- Save button -->
    <div class="flex gap-3">
      <button
        class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        @click="cancel"
      >
        Cancel
      </button>
      <button
        class="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </div>
  </div>

  <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, navigateTo } from '#app'
import Nav from '@/components/Nav.vue'
import Toast from '@/components/Toast.vue'

definePageMeta({
  middleware: 'admin',
})

const route = useRoute()
const username = route.params.username

// ——— State ———
const zones = ref([{ background: '', toons: [] }])
const currentZoneIndex = ref(0)
const loading = ref(true)
const saving = ref(false)
const toastMessage = ref('')
const toastType = ref('success')

// ——— Scale ———
const scale = ref(1)
const recalcScale = () => {
  scale.value = Math.min(1, window.innerWidth / 860)
}
const scaleWrapStyle = computed(() => ({
  width: Math.round(800 * scale.value) + 'px',
  height: Math.round(600 * scale.value) + 'px',
  overflow: 'hidden',
}))

// ——— Zone helpers ———
const currentZone = computed(() => zones.value[currentZoneIndex.value] ?? { background: '', toons: [] })
const currentToons = computed(() => currentZone.value.toons ?? [])

const canvasBackgroundStyle = computed(() => {
  const bg = currentZone.value.background
  if (!bg) return { backgroundColor: '#e5e7eb' }
  const src = bg.startsWith('/') ? bg : `/backgrounds/${bg}`
  return {
    backgroundImage: `url('${src}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transform: `scale(${scale.value})`,
    transformOrigin: 'top left',
  }
})

function prevZone() {
  if (currentZoneIndex.value > 0) currentZoneIndex.value--
}
function nextZone() {
  if (currentZoneIndex.value < zones.value.length - 1) currentZoneIndex.value++
}

// ——— Remove ———
function removeToon(idx) {
  zones.value[currentZoneIndex.value].toons.splice(idx, 1)
}

// ——— Save ———
async function save() {
  saving.value = true
  try {
    await $fetch(`/api/admin/czone/${username}/save`, {
      method: 'POST',
      body: { zones: zones.value },
    })
    toastType.value = 'success'
    toastMessage.value = 'cZone saved successfully!'
    setTimeout(() => (toastMessage.value = ''), 5000)
  } catch {
    toastType.value = 'error'
    toastMessage.value = 'Failed to save cZone.'
    setTimeout(() => (toastMessage.value = ''), 5000)
  } finally {
    saving.value = false
  }
}

function cancel() {
  navigateTo(`/czone/${username}`)
}

// ——— Load ———
onMounted(async () => {
  recalcScale()
  window.addEventListener('resize', recalcScale)

  try {
    const res = await $fetch(`/api/admin/czone/${username}/edit`)
    if (Array.isArray(res.zones) && res.zones.length > 0) {
      zones.value = res.zones.map(z => ({
        background: typeof z.background === 'string' ? z.background : '',
        toons: Array.isArray(z.toons) ? z.toons : [],
      }))
    }
  } catch {
    toastType.value = 'error'
    toastMessage.value = 'Failed to load cZone.'
    setTimeout(() => (toastMessage.value = ''), 5000)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', recalcScale)
})
</script>
