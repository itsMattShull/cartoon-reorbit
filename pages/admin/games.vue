<template>
  <Nav />

  <div class="min-h-screen bg-gray-100 p-6 mt-12">
    <h1 class="text-3xl font-bold mb-6">Admin: Game Configuration</h1>

    <div class="bg-white rounded-lg shadow-md max-w-2xl mx-auto">
      <!-- Tabs -->
      <div
        class="border-b px-4 pt-4 overflow-x-auto no-scrollbar"
        role="tablist"
        aria-label="Game configuration sections"
      >
        <div class="flex gap-2 sm:gap-4 min-w-max">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="px-3 sm:px-4 py-2 text-sm font-medium rounded-t-md border-b-2"
            :class="activeTab === t.key
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'"
            role="tab"
            :aria-selected="activeTab === t.key"
            @click="switchTab(t.key)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- Panels -->
      <div class="p-6 space-y-8">
        <!-- Global -->
        <section v-if="activeTab === 'Global'" role="tabpanel" aria-label="Global Settings">
          <h2 class="text-2xl font-semibold mb-4">Global Settings</h2>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700">Daily Point Cap</label>
            <input type="number" v-model.number="globalDailyPointLimit" class="input" />
          </div>
          <button @click="saveGlobalConfig" :disabled="loadingGlobal" class="btn-primary">
            <span v-if="!loadingGlobal">Save Global Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- Winball -->
        <section v-if="activeTab === 'Winball'" role="tabpanel" aria-label="Winball Settings">
          <h2 class="text-2xl font-semibold mb-4">Winball Settings</h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Left Cup Points</label>
              <input type="number" v-model.number="leftCupPoints" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Right Cup Points</label>
              <input type="number" v-model.number="rightCupPoints" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Gold Cup Points</label>
              <input type="number" v-model.number="goldCupPoints" class="input" />
            </div>
          </div>

          <div class="mb-6 relative">
            <label class="block text-sm font-medium text-gray-700 mb-1">Grand Prize cToon</label>
            <input
              type="text"
              v-model="searchTerm"
              @focus="showDropdown = true"
              @input="onSearchInput"
              :placeholder="grandPrizeCtoon ? grandPrizeCtoon.name : 'Type a cToon name…'"
              class="input"
            />
            <ul
              v-if="showDropdown && filteredMatches.length"
              class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
            >
              <li
                v-for="c in filteredMatches"
                :key="c.id"
                @mousedown.prevent="selectCtoon(c)"
                class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-50"
              >
                <img :src="c.assetPath" alt="" class="w-8 h-8 rounded mr-3 object-cover border" />
                <div>
                  <p class="text-sm font-medium">{{ c.name }}</p>
                  <p class="text-xs text-gray-500 capitalize">{{ c.rarity }}</p>
                </div>
              </li>
            </ul>
            <button
              v-if="grandPrizeCtoon"
              @click="clearSelection"
              class="absolute top-0 right-0 mt-2 mr-2 text-gray-500 hover:text-gray-700"
            >✕</button>
          </div>

          <div v-if="grandPrizeCtoon" class="mt-4 flex items-center space-x-4">
            <img :src="grandPrizeCtoon.assetPath" alt="Grand Prize Preview" class="w-16 h-16 rounded border" />
            <div>
              <p class="font-medium">{{ grandPrizeCtoon.name }}</p>
              <p class="text-sm text-gray-600 capitalize">{{ grandPrizeCtoon.rarity }}</p>
            </div>
          </div>

          <button @click="saveWinballConfig" :disabled="loadingWinball" class="btn-primary">
            <span v-if="!loadingWinball">Save Winball Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- gToon Clash -->
        <section v-if="activeTab === 'Clash'" role="tabpanel" aria-label="gToon Clash Settings">
          <h2 class="text-2xl font-semibold mb-4">gToon Clash Settings</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Per Win</label>
              <input type="number" v-model.number="clashPointsPerWin" class="input" />
            </div>
          </div>
          <button @click="saveClashConfig" :disabled="loadingClash" class="btn-primary">
            <span v-if="!loadingClash">Save Clash Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- Win Wheel -->
        <section v-if="activeTab === 'Winwheel'" role="tabpanel" aria-label="Win Wheel Settings">
          <h2 class="text-2xl font-semibold mb-4">Win Wheel Settings</h2>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Spin Cost (pts)</label>
              <input type="number" v-model.number="spinCostWW" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Won</label>
              <input type="number" v-model.number="pointsWonWW" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Max Daily Spins</label>
              <input type="number" v-model.number="maxDailySpinsWW" class="input" />
            </div>
          </div>

          <!-- Image upload for Win Wheel -->
          <div class="space-y-3 mb-6">
            <label class="block text-sm font-medium text-gray-700">
              Wheel Image (SVG/PNG/JPEG)
            </label>
            <input
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
              @change="onWinWheelFileChange"
              class="block w-full text-sm"
            />
            <div class="flex items-center gap-3">
              <button
                class="btn-primary"
                @click="uploadWinWheelImage"
                :disabled="!winWheelFile || uploadingImage"
              >
                <span v-if="!uploadingImage">Upload Image</span>
                <span v-else>Uploading…</span>
              </button>
              <button
                v-if="winWheelImagePath"
                type="button"
                class="px-3 py-2 text-sm rounded border"
                @click="removeWinWheelImage"
              >Remove Image</button>
            </div>

            <div v-if="winWheelImagePath" class="mt-2">
              <p class="text-xs text-gray-600 break-all">Saved path: {{ winWheelImagePath }}</p>
              <div class="mt-2 border rounded p-2 bg-gray-50">
                <!-- preview with fallback -->
                <img :src="previewSrc" alt="Win Wheel image preview" class="max-h-40 mx-auto" />
              </div>
            </div>
          </div>

          <div class="mb-6 relative">
            <label class="block text-sm font-medium text-gray-700 mb-1">Exclusive cToon Pool</label>
            <input
              type="text"
              v-model="searchTermWW"
              @focus="showDropdownWW = true"
              @input="onSearchInputWW"
              placeholder="Type to search…"
              class="input"
            />
            <ul
              v-if="showDropdownWW && filteredMatchesWW.length"
              class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
            >
              <li
                v-for="c in filteredMatchesWW"
                :key="c.id"
                @mousedown.prevent="selectPoolCtoon(c)"
                class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-50"
              >
                <img :src="c.assetPath" alt="" class="w-6 h-6 rounded mr-2 object-cover border" />
                <div>
                  <p class="text-sm">{{ c.name }}</p>
                  <p class="text-xs text-gray-500">{{ c.rarity }}</p>
                </div>
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-2 mb-6">
            <span
              v-for="c in poolCtoons"
              :key="c.id"
              class="flex items-center bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-sm"
            >
              {{ c.name }}
              <button class="ml-1" @click="removePoolCtoon(c)">✕</button>
            </span>
          </div>

          <button @click="saveWinWheelConfig" :disabled="loadingWinWheel" class="btn-primary">
            <span v-if="!loadingWinWheel">Save Win Wheel Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- Toast -->
        <div
          v-if="toastMessage"
          :class="[toastClass, 'fixed bottom-4 left-1/2 transform -translate-x-1/2']"
        >
          {{ toastMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const tabs = [
  { key: 'Global',   label: 'Global Settings' },
  { key: 'Winball',  label: 'Winball' },
  { key: 'Clash',    label: 'gToon Clash' },
  { key: 'Winwheel', label: 'Win Wheel' }
]
const activeTab = ref('Global')
function switchTab(k) { activeTab.value = k }

// ── Settings state ────────────────────────────
const globalDailyPointLimit = ref(100)
const loadingGlobal         = ref(false)
const leftCupPoints         = ref(0)
const rightCupPoints        = ref(0)
const goldCupPoints         = ref(0)
const clashPointsPerWin     = ref(1)
const loadingWinball        = ref(false)
const loadingClash          = ref(false)

const grandPrizeCtoon       = ref(null)
const selectedCtoonId       = ref('')
const allCtoons             = ref([])
const searchTerm            = ref('')
const showDropdown          = ref(false)

const toastMessage = ref('')
const toastType    = ref('')
const toastClass   = computed(() => [
  'mt-4 px-4 py-2 rounded',
  toastType.value === 'error'
    ? 'bg-red-100 text-red-700'
    : 'bg-green-100 text-green-700'
])

// ── Autocomplete ─────────────────────────────
const filteredMatches = computed(() => {
  const t = searchTerm.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c => c.name.toLowerCase().includes(t))
    .slice(0, 8)
})
function onSearchInput() { showDropdown.value = !!searchTerm.value.trim() }
function selectCtoon(c) {
  selectedCtoonId.value = c.id
  grandPrizeCtoon.value = c
  searchTerm.value      = c.name
  showDropdown.value    = false
}
function clearSelection() {
  selectedCtoonId.value = ''
  grandPrizeCtoon.value = null
  searchTerm.value      = ''
  showDropdown.value    = false
}

// ── Lifecycle & data loading ─────────────────
async function loadSettings() {
  const g = await $fetch('/api/admin/global-config')
  globalDailyPointLimit.value = g.dailyPointLimit

  const wb = await $fetch('/api/admin/game-config?gameName=Winball')
  leftCupPoints.value  = wb.leftCupPoints
  rightCupPoints.value = wb.rightCupPoints
  goldCupPoints.value  = wb.goldCupPoints
  if (wb.grandPrizeCtoon) {
    grandPrizeCtoon.value = wb.grandPrizeCtoon
    selectedCtoonId.value = wb.grandPrizeCtoon.id
    searchTerm.value      = wb.grandPrizeCtoon.name
  }
  allCtoons.value = await $fetch('/api/admin/game-ctoons?select=id,name,rarity,assetPath,quantity')

  const cc = await $fetch('/api/admin/game-config?gameName=Clash')
  clashPointsPerWin.value = cc.pointsPerWin
}

// Win Wheel state
const spinCostWW       = ref(100)
const pointsWonWW      = ref(250)
const maxDailySpinsWW  = ref(2)
const poolCtoons       = ref([])
const searchTermWW     = ref('')
const showDropdownWW   = ref(false)
const loadingWinWheel  = ref(false)

// image upload state
const winWheelFile       = ref(null)
const uploadingImage     = ref(false)
const winWheelImagePath  = ref('')

// preview fallback
const previewSrc = computed(() => winWheelImagePath.value || '/images/wheel.svg')

const filteredMatchesWW = computed(() => {
  const t = searchTermWW.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c =>
      (c.quantity === null || c.quantity === '') &&
      c.name.toLowerCase().includes(t) &&
      !poolCtoons.value.some(p => p.id === c.id)
    )
    .slice(0, 8)
})
function onSearchInputWW() { showDropdownWW.value = !!searchTermWW.value.trim() }
function selectPoolCtoon(c) {
  poolCtoons.value.push(c)
  searchTermWW.value = ''
  showDropdownWW.value = false
}
function removePoolCtoon(c) {
  poolCtoons.value = poolCtoons.value.filter(x => x.id !== c.id)
}

async function loadWinWheelConfig() {
  const ww = await $fetch('/api/admin/game-config?gameName=Winwheel')
  spinCostWW.value        = ww.spinCost
  pointsWonWW.value       = ww.pointsWon
  maxDailySpinsWW.value   = ww.maxDailySpins
  winWheelImagePath.value = ww.winWheelImagePath || ''
  poolCtoons.value        = (ww.exclusiveCtoons || []).map(o => o.ctoon)
}

// ── Image upload handlers ────────────────────
function onWinWheelFileChange(e) {
  const f = e.target.files?.[0]
  winWheelFile.value = f || null
}
async function uploadWinWheelImage() {
  if (!winWheelFile.value) return
  uploadingImage.value = true
  toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('image', winWheelFile.value)
    fd.append('label', 'winwheel')

    const res = await $fetch('/api/admin/winwheel-image', {
      method: 'POST',
      body: fd
    })
    winWheelImagePath.value = res.assetPath
    toastMessage.value = 'Image uploaded.'
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Image upload failed'
    toastType.value = 'error'
  } finally {
    uploadingImage.value = false
    winWheelFile.value = null
  }
}
function removeWinWheelImage() {
  winWheelImagePath.value = ''
}

// ── Saves ────────────────────────────────────
async function saveWinWheelConfig() {
  loadingWinWheel.value = true
  toastMessage.value    = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:          'Winwheel',
        spinCost:          spinCostWW.value,
        pointsWon:         pointsWonWW.value,
        maxDailySpins:     maxDailySpinsWW.value,
        exclusiveCtoons:   poolCtoons.value.map(c => c.id),
        winWheelImagePath: winWheelImagePath.value || null
      }
    })
    toastMessage.value = 'Win Wheel settings saved!'
    toastType.value    = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Error saving Win Wheel settings'
    toastType.value    = 'error'
  } finally {
    loadingWinWheel.value = false
  }
}

async function saveGlobalConfig() {
  loadingGlobal.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: { dailyPointLimit: globalDailyPointLimit.value }
    })
    toastMessage.value = 'Global settings saved!'; toastType.value = 'success'
  } catch {
    toastMessage.value = 'Error saving global settings'; toastType.value = 'error'
  } finally {
    loadingGlobal.value = false
  }
}

async function saveWinballConfig() {
  loadingWinball.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:          'Winball',
        leftCupPoints:     leftCupPoints.value,
        rightCupPoints:    rightCupPoints.value,
        goldCupPoints:     goldCupPoints.value,
        dailyPointLimit:   globalDailyPointLimit.value,
        grandPrizeCtoonId: selectedCtoonId.value || null
      }
    })
    toastMessage.value = 'Winball settings saved!'; toastType.value = 'success'
  } catch {
    toastMessage.value = 'Error saving Winball settings'; toastType.value = 'error'
  } finally {
    loadingWinball.value = false
  }
}

async function saveClashConfig() {
  loadingClash.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:        'Clash',
        pointsPerWin:    clashPointsPerWin.value,
        dailyPointLimit: globalDailyPointLimit.value
      }
    })
    toastMessage.value = 'Clash settings saved!'; toastType.value = 'success'
  } catch {
    toastMessage.value = 'Error saving Clash settings'; toastType.value = 'error'
  } finally {
    loadingClash.value = false
  }
}

onMounted(async () => {
  await loadSettings()
  await loadWinWheelConfig()
})
</script>

<style scoped>
.input {
  margin-top: .25rem;
  width: 100%;
  border: 1px solid #D1D5DB;
  border-radius: .375rem;
  padding: .5rem;
  outline: none;
}
.input:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 1px #6366F1;
}
.btn-primary {
  margin-top: .25rem;
  background-color: #6366F1;
  color: white;
  padding: .5rem 1.25rem;
  border-radius: .375rem;
}
.btn-primary:disabled { opacity: .5; }

/* hide horizontal scrollbar on mobile tab strip */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
