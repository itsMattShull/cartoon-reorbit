<template>
  <Nav />

  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
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

          <!-- Points -->
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

          <!-- Grand Prize selection + preview (moved above schedule) -->
          <div class="mb-8">
            <div class="mb-3 relative">
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
          </div>

          <!-- Schedule UI -->
          <p class="text-sm text-gray-600 mb-2">
            All dates and times are interpreted as <strong>Central Time (US)</strong>. Default time is 8:00 PM.
          </p>

          <div class="mb-4">
            <button @click="openAddModal" class="px-3 py-2 rounded bg-indigo-600 text-white">Add schedule</button>
          </div>

          <div class="border rounded mb-6">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left p-2">Start (Central)</th>
                  <th class="text-left p-2">cToon</th>
                  <th class="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in schedules" :key="row.id" class="border-t">
                  <td class="p-2 whitespace-nowrap">{{ row.startsAtLocal }}</td>
                  <td class="p-2">
                    <div class="flex items-center gap-2">
                      <img :src="row.ctoon.assetPath" class="w-8 h-8 rounded border object-cover" alt="" />
                      <div>
                        <div class="font-medium">{{ row.ctoon.name }}</div>
                        <div class="text-xs text-gray-500 capitalize">{{ row.ctoon.rarity }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="p-2 text-right">
                    <button @click="removeSchedule(row)" class="px-2 py-1 rounded border">Remove</button>
                  </td>
                </tr>
                <tr v-if="!schedules.length">
                  <td colspan="3" class="p-3 text-gray-500">No scheduled grand prizes.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Add modal (unchanged) -->
          <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-white rounded-lg w-full max-w-md p-4">
              <h3 class="text-lg font-semibold mb-3">Schedule Grand Prize</h3>
              <!-- selector -->
              <div class="mb-4 relative">
                <label class="block text-sm font-medium text-gray-700 mb-1">Grand Prize cToon</label>
                <input
                  type="text"
                  v-model="modalSearch"
                  @focus="modalShowDropdown = true"
                  @input="onModalSearchInput"
                  :placeholder="modalSelectedCtoon ? modalSelectedCtoon.name : 'Type a cToon name…'"
                  class="input"
                />
                <ul
                  v-if="modalShowDropdown && modalFiltered.length"
                  class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
                >
                  <li
                    v-for="c in modalFiltered"
                    :key="c.id"
                    @mousedown.prevent="selectModalCtoon(c)"
                    class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-50"
                  >
                    <img :src="c.assetPath" alt="" class="w-8 h-8 rounded mr-3 object-cover border" />
                    <div>
                      <p class="text-sm font-medium">{{ c.name }}</p>
                      <p class="text-xs text-gray-500 capitalize">{{ c.rarity }}</p>
                    </div>
                  </li>
                </ul>
              </div>
              <!-- date/time -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Date (Central)</label>
                  <input type="date" v-model="modalDate" class="input" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Time (Central)</label>
                  <input type="time" v-model="modalTime" class="input" />
                </div>
              </div>
              <div class="flex justify-end gap-2">
                <button @click="closeAddModal" class="px-3 py-2 rounded border">Cancel</button>
                <button @click="createSchedule" :disabled="savingSchedule || !modalSelectedCtoon || !modalDate || !modalTime" class="px-3 py-2 rounded bg-indigo-600 text-white">
                  {{ savingSchedule ? 'Saving…' : 'Add' }}
                </button>
              </div>
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

          <!-- Sound upload for Win Wheel -->
          <div class="space-y-3 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Spin Sound Behavior</label>
              <select v-model="winWheelSoundMode" class="input">
                <option value="repeat">Repeat Sound</option>
                <option value="once">Play Once</option>
              </select>
            </div>
            <label class="block text-sm font-medium text-gray-700">
              Wheel Sound (MP3/WAV/OGG)
            </label>
            <input
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
              @change="onWinWheelSoundChange"
              class="block w-full text-sm"
            />
            <div class="flex items-center gap-3">
              <button
                class="btn-primary"
                @click="uploadWinWheelSound"
                :disabled="!winWheelSoundFile || uploadingSound"
              >
                <span v-if="!uploadingSound">Upload Sound</span>
                <span v-else>Uploading…</span>
              </button>
              <button
                v-if="winWheelSoundPath"
                type="button"
                class="px-3 py-2 text-sm rounded border"
                @click="removeWinWheelSound"
              >Remove Sound</button>
            </div>

            <div v-if="winWheelSoundPath" class="mt-2">
              <p class="text-xs text-gray-600 break-all">Saved path: {{ winWheelSoundPath }}</p>
              <audio :src="winWheelSoundPath" controls class="w-full mt-2"></audio>
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

const schedules = ref([])

async function loadSchedules() {
  const res = await $fetch('/api/admin/winball-grand-prize')
  schedules.value = res.items || []
}

// modal state
const showAddModal = ref(false)
const savingSchedule = ref(false)
const modalSelectedCtoon = ref(null)
const modalSearch = ref('')
const modalShowDropdown = ref(false)
const modalDate = ref('')
const modalTime = ref('20:00') // default 8 PM Central

const modalFiltered = computed(() => {
  const t = modalSearch.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c => c.name.toLowerCase().includes(t))
    .slice(0, 8)
})
function onModalSearchInput() { modalShowDropdown.value = !!modalSearch.value.trim() }
function selectModalCtoon(c) {
  modalSelectedCtoon.value = c
  modalSearch.value = c.name
  modalShowDropdown.value = false
}

function openAddModal() {
  modalSelectedCtoon.value = null
  modalSearch.value = ''
  modalShowDropdown.value = false
  // default date = today
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  modalDate.value = `${y}-${m}-${d}`
  modalTime.value = '20:00'
  showAddModal.value = true
}
function closeAddModal() { showAddModal.value = false }

async function createSchedule() {
  if (!modalSelectedCtoon.value || !modalDate.value || !modalTime.value) return
  savingSchedule.value = true
  toastMessage.value = ''
  try {
    // send local Central datetime as "YYYY-MM-DD HH:mm" string
    const startsAtLocal = `${modalDate.value} ${modalTime.value}`
    const res = await $fetch('/api/admin/winball-grand-prize', {
      method: 'POST',
      body: {
        ctoonId: modalSelectedCtoon.value.id,
        startsAtLocal
      }
    })
    schedules.value.unshift({
      id: res.item.id,
      ctoon: res.item.ctoon,
      // the GET formats startsAtLocal for display; call loadSchedules to normalize
    })
    await loadSchedules()
    toastMessage.value = 'Grand prize schedule added'
    toastType.value = 'success'
    showAddModal.value = false
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Failed to add schedule'
    toastType.value = 'error'
  } finally {
    savingSchedule.value = false
  }
}

async function removeSchedule(row) {
  if (!row?.id) return
  toastMessage.value = ''
  try {
    await $fetch(`/api/admin/winball-grand-prize/${row.id}`, { method: 'DELETE' })
    schedules.value = schedules.value.filter(r => r.id !== row.id)
    toastMessage.value = 'Schedule removed'
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Failed to remove schedule'
    toastType.value = 'error'
  }
}

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
// sound upload state
const winWheelSoundFile  = ref(null)
const uploadingSound     = ref(false)
const winWheelSoundPath  = ref('')
const winWheelSoundMode  = ref('repeat')

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
  winWheelSoundPath.value = ww.winWheelSoundPath || ''
  winWheelSoundMode.value = ww.winWheelSoundMode || 'repeat'
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

// ── Sound upload handlers ────────────────────
function onWinWheelSoundChange(e) {
  const f = e.target.files?.[0]
  winWheelSoundFile.value = f || null
}
async function uploadWinWheelSound() {
  if (!winWheelSoundFile.value) return
  uploadingSound.value = true
  toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('sound', winWheelSoundFile.value)
    fd.append('label', 'winwheel-sound')

    const res = await $fetch('/api/admin/winwheel-sound', {
      method: 'POST',
      body: fd
    })
    winWheelSoundPath.value = res.assetPath
    toastMessage.value = 'Sound uploaded.'
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Sound upload failed'
    toastType.value = 'error'
  } finally {
    uploadingSound.value = false
    winWheelSoundFile.value = null
  }
}
function removeWinWheelSound() {
  winWheelSoundPath.value = ''
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
        winWheelImagePath: winWheelImagePath.value || null,
        winWheelSoundPath: winWheelSoundPath.value || null,
        winWheelSoundMode: winWheelSoundMode.value || 'repeat'
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
  await loadSchedules()
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
