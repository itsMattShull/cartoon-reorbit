<template>
  <Nav />

  <div class="min-h-screen bg-gray-100 p-6 mt-12">
    <h1 class="text-3xl font-bold mb-6">Admin: Game Configuration</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto space-y-12">
      <!-- Global Settings -->
      <section>
        <h2 class="text-2xl font-semibold mb-4">Global Settings</h2>
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700">Daily Point Cap</label>
          <input type="number" v-model.number="globalDailyPointLimit" class="input" />
        </div>
        <button
          @click="saveGlobalConfig"
          :disabled="loadingGlobal"
          class="btn-primary"
        >
          <span v-if="!loadingGlobal">Save Global Settings</span>
          <span v-else>Saving…</span>
        </button>
      </section>

      <!-- Winball Settings -->
      <section>
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
          <img
            :src="grandPrizeCtoon.assetPath"
            alt="Grand Prize Preview"
            class="w-16 h-16 rounded border"
          />
          <div>
            <p class="font-medium">{{ grandPrizeCtoon.name }}</p>
            <p class="text-sm text-gray-600 capitalize">{{ grandPrizeCtoon.rarity }}</p>
          </div>
        </div>
        <button
          @click="saveWinballConfig"
          :disabled="loadingWinball"
          class="btn-primary"
        >
          <span v-if="!loadingWinball">Save Winball Settings</span>
          <span v-else>Saving…</span>
        </button>
      </section>

      <!-- gToon Clash Settings -->
      <section>
        <h2 class="text-2xl font-semibold mb-4">gToon Clash Settings</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label class="block text-sm font-medium text-gray-700">Points Per Win</label>
            <input type="number" v-model.number="clashPointsPerWin" class="input" />
          </div>
        </div>
        <button
          @click="saveClashConfig"
          :disabled="loadingClash"
          class="btn-primary"
        >
          <span v-if="!loadingClash">Save Clash Settings</span>
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

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
  allCtoons.value = await $fetch('/api/admin/game-ctoons?select=id,name,rarity,assetPath')

  const cc = await $fetch('/api/admin/game-config?gameName=Clash')
  clashPointsPerWin.value = cc.pointsPerWin
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

onMounted(loadSettings)
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
  margin-top: 1rem;
  background-color: #6366F1;
  color: white;
  padding: .5rem 1.5rem;
  border-radius: .375rem;
}
.btn-primary:disabled { opacity: .5; }

/* Chart container styling (still here if you add charts elsewhere) */
.chart-container {
  height: 300px;
  position: relative;
}
</style>
