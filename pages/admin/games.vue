<template>
  <Nav />

  <div class="min-h-screen bg-gray-100 p-6 mt-12">
    <h1 class="text-3xl font-bold mb-6">Admin: Game Configuration</h1>

    <!-- Tabs -->
    <div class="flex space-x-4 mb-6">
      <button
        @click="activeTab = 'Settings'"
        :class="activeTab === 'Settings'
          ? 'border-b-2 border-indigo-600 text-indigo-600'
          : 'text-gray-600 hover:text-gray-800'"
        class="px-4 py-2 text-sm font-medium"
      >
        Settings
      </button>
      <button
        @click="activeTab = 'ClashGames'"
        :class="activeTab === 'ClashGames'
          ? 'border-b-2 border-indigo-600 text-indigo-600'
          : 'text-gray-600 hover:text-gray-800'"
        class="px-4 py-2 text-sm font-medium"
      >
        gToons Clash
      </button>
    </div>

    <!-- ── SETTINGS TAB ─────────────────────────────────── -->
    <div
      v-show="activeTab === 'Settings'"
      class="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto space-y-12"
    >
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
      <div v-if="toastMessage" :class="toastClass">
        {{ toastMessage }}
      </div>
    </div>

    <!-- gToons Clash TAB -->
    <div
      v-show="activeTab === 'ClashGames'"
      class="bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto space-y-4"
    >
      <h2 class="text-2xl font-semibold">gToons Clash Games</h2>

      <!-- Chart: now always in DOM, just hidden/shown -->
      <div class="chart-container mb-6">
        <canvas ref="clashCanvas"></canvas>
      </div>

      <!-- Recent Games Table -->
      <div class="overflow-x-auto">
        <table class="min-w-full table-auto border-collapse">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-4 py-2 text-left">Start</th>
              <th class="px-4 py-2 text-left">End</th>
              <th class="px-4 py-2 text-left">Player 1</th>
              <th class="px-4 py-2 text-left">Player 2</th>
              <th class="px-4 py-2 text-left">Winner</th>
              <th class="px-4 py-2 text-left">Outcome</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="g in clashGames"
              :key="g.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-4 py-2">{{ formatDate(g.startedAt) }}</td>
              <td class="px-4 py-2">
                {{ g.endedAt ? formatDate(g.endedAt) : '–' }}
              </td>
              <td class="px-4 py-2">
                {{ g.player1.username }}
                <span class="text-gray-500 text-sm">
                  ({{ g.player1.discordTag }})
                </span>
              </td>
              <td class="px-4 py-2">
                <template v-if="g.player2">
                  {{ g.player2.username }}
                  <span class="text-gray-500 text-sm">
                    ({{ g.player2.discordTag }})
                  </span>
                </template>
                <template v-else>AI</template>
              </td>
              <td class="px-4 py-2">
                <template v-if="g.winner">
                  {{ g.winner.username }}
                  <span class="text-gray-500 text-sm">
                    ({{ g.winner.discordTag }})
                  </span>
                </template>
                <template v-else-if="g.endedAt && !g.winnerUserId">AI/Tie</template>
                <template v-else>–</template>
              </td>
              <td class="px-4 py-2">
                <template v-if="g.outcome">
                  {{ g.outcome }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import Nav from '@/components/Nav.vue'
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import ChartDataLabels from 'chartjs-plugin-datalabels'

// page meta
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

// ── Tabs ───────────────────────────────────────
const activeTab = ref('Settings')

// ── Settings state ────────────────────────────
const globalDailyPointLimit = ref(100)
const loadingGlobal         = ref(false)
const leftCupPoints         = ref(0)
const rightCupPoints        = ref(0)
const goldCupPoints         = ref(0)
const clashPointsPerWin     = ref(1)
const loadingClash          = ref(false)
const grandPrizeCtoon       = ref(null)
const selectedCtoonId       = ref('')
const allCtoons             = ref([])
const searchTerm            = ref('')
const showDropdown          = ref(false)
const loadingWinball        = ref(false)

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
  searchTerm.value       = ''
  showDropdown.value     = false
}

// ── Chart & table state ──────────────────────
const clashCanvas = ref(null)
let clashChart   = null
const clashStats = ref([])
const clashGames = ref([])

const clashOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: { unit: 'day', tooltipFormat: 'PP' },
      title: { display: true, text: 'Day' }
    },
    y: {
      title: { display: true, text: 'Games Played' }
    },
    y1: {
      title: { display: true, text: '% Finished' },
      position: 'right',
      grid: { drawOnChartArea: false },
      ticks: { callback: v => v + '%' },
      min: 0,
      max: 100
    }
  },
  plugins: { legend: { position: 'top' } }
}

// ── Helpers ──────────────────────────────────
function formatDate(dt) {
  return new Date(dt).toLocaleString('en-US', {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit'
  })
}

// ── Data loaders ────────────────────────────
async function loadClashStats() {
  clashStats.value = await $fetch('/api/admin/clash-stats')
}
async function loadClashGames() {
  clashGames.value = await $fetch('/api/admin/clash-games')
}

// ── Chart initializer ───────────────────────
async function initClashChart() {
  await nextTick()
  const canvasEl = clashCanvas.value
  if (!canvasEl) {
    console.error('⚠️ clashCanvas ref not found')
    return
  }
  const ctx = canvasEl.getContext('2d')
  if (!ctx) {
    console.error('⚠️ could not getContext("2d")')
    return
  }
  if (clashChart) {
    clashChart.destroy()
    clashChart = null
  }

  let stats = []
  try {
    stats = await $fetch('/api/admin/clash-stats')
  } catch (err) {
    console.error('Failed to load /api/admin/clash-stats', err)
    return
  }

  clashChart = new Chart(ctx, {
    data: {
      labels: stats.map(s => new Date(s.day)),
      datasets: [
        {
          type: 'bar',
          label: 'Games Played',
          data: stats.map(s => s.count),
          yAxisID: 'y',
          backgroundColor: '#6366F1',
          barPercentage: 0.6,
          categoryPercentage: 0.6,
          order: 1,
          datalabels: {
            color: '#fff',                 // white labels
            anchor: 'center',               // attach at base of bar
            align: 'center',               // centered horizontally
            font: { weight: 'bold', size: 12 }
          }
        },
        {
          type: 'line',
          label: '% Finished',
          data: stats.map(s => s.percentFinished),
          yAxisID: 'y1',
          borderColor: 'rgba(243,156,18,0.9)',
          fill: false,
          tension: 0.3,
          pointBackgroundColor: 'rgba(243,156,18,1)',
          order: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day', tooltipFormat: 'PP' },
          title: { display: true, text: 'Day' }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Games Played' }
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          title: { display: true, text: '% Finished' },
          grid: { drawOnChartArea: false },
          ticks: { callback: v => v + '%', min: 0, max: 100 }
        }
      },
      plugins: {
        legend: { position: 'top' },
        datalabels: {
          anchor: 'end',
          align: 'top',
          formatter: (value, ctx) =>
            ctx.dataset.type === 'bar' ? value : value + '%',
          font: { weight: 'bold', size: 12 }
        }
      }
    }
  })
}


// ── Settings load & save ────────────────────
async function loadSettings() {
  const g = await $fetch('/api/admin/global-config')
  globalDailyPointLimit.value = g.dailyPointLimit

  const wb = await $fetch('/api/admin/game-config?gameName=Winball')
  leftCupPoints.value  = wb.leftCupPoints
  rightCupPoints.value = wb.rightCupPoints
  goldCupPoints.value  = wb.goldCupPoints
  if (wb.grandPrizeCtoon) {
    grandPrizeCtoon.value  = wb.grandPrizeCtoon
    selectedCtoonId.value  = wb.grandPrizeCtoon.id
    searchTerm.value       = wb.grandPrizeCtoon.name
  }
  allCtoons.value = await $fetch(
    '/api/admin/game-ctoons?select=id,name,rarity,assetPath'
  )

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

// ── Lifecycle ────────────────────────────────
onMounted(async () => {
  // register Chart.js controllers & elements
  Chart.register(
    BarController, BarElement,
    LineController, LineElement, PointElement,
    CategoryScale, LinearScale, TimeScale,
    Title, Tooltip, Legend, ChartDataLabels
  )

  // load your settings (cToon pools, point caps, etc.)
  await loadSettings()
  // and then initialize the chart
  await initClashChart()
  await loadClashGames()
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
  margin-top: 1rem;
  background-color: #6366F1;
  color: white;
  padding: .5rem 1.5rem;
  border-radius: .375rem;
}
.btn-primary:disabled { opacity: .5; }

/* Chart container styling */
.chart-container {
  height: 300px;
  position: relative;
}
</style>
