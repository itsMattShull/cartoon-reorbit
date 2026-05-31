<template>
  <div class="admin-collection-analytics bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-2 text-gray-900">cToon Collection Analytics</h1>

        <!-- Week picker -->
        <div class="flex flex-wrap items-center gap-3 mb-3">
          <div class="flex items-center gap-1.5">
            <label for="weekStart" class="font-medium">Week starting (Monday):</label>
            <input
              id="weekStart"
              v-model="weekStartInput"
              type="date"
              class="border rounded px-1.5 py-0.5 text-xs"
              @change="load"
            />
          </div>
          <button
            type="button"
            class="border rounded px-2 py-0.5 text-xs bg-blue-50 hover:bg-blue-100"
            @click="loadPrevWeek"
          >
            Previous week
          </button>
          <button
            type="button"
            class="border rounded px-2 py-0.5 text-xs bg-blue-50 hover:bg-blue-100"
            @click="loadNextWeek"
          >
            Next week
          </button>
          <span v-if="weekEnd" class="text-gray-500">
            {{ formatDate(weekStartInput) }} – {{ formatDate(weekEnd) }}
          </span>
        </div>

        <div v-if="loading" class="text-center py-6 text-gray-500">Loading…</div>
        <div v-else-if="error" class="text-red-600 py-4">{{ error }}</div>
        <template v-else>

          <!-- No sets found -->
          <div v-if="!data || data.sets.length === 0" class="py-4 text-gray-500">
            No cToon sets with a release date in this week.
          </div>

          <template v-else>
            <!-- Sets released this week -->
            <div class="mb-3">
              <h2 class="text-sm font-semibold mb-1">Sets Released This Week</h2>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="s in data.sets"
                  :key="s.name"
                  class="inline-block bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-[11px]"
                >
                  {{ s.name }} ({{ s.ctoonCount }} cToons)
                </span>
              </div>
            </div>

            <!-- Summary stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div class="bg-green-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-green-700">{{ data.oneSet.count }}</div>
                <div class="text-[11px] text-green-600">Completed ≥1 Set</div>
              </div>
              <div class="bg-purple-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-purple-700">{{ data.allSets.count }}</div>
                <div class="text-[11px] text-purple-600">Completed All Sets</div>
              </div>
              <div class="bg-gray-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-gray-700">
                  {{ avgPoints(data.oneSet.users) }}<span v-if="data.oneSet.users.some(u => u.pointsEstimated)" class="text-amber-500" title="Includes estimated costs">*</span>
                </div>
                <div class="text-[11px] text-gray-500">Avg pts (1 set)</div>
              </div>
              <div class="bg-gray-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-gray-700">
                  {{ avgPoints(data.allSets.users) }}<span v-if="data.allSets.users.some(u => u.pointsEstimated)" class="text-amber-500" title="Includes estimated costs">*</span>
                </div>
                <div class="text-[11px] text-gray-500">Avg pts (all sets)</div>
              </div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div>
                <h2 class="text-sm font-semibold mb-1 text-gray-900">Points Distribution — ≥1 Set Completers</h2>
                <p class="text-[11px] text-gray-600 mb-1">
                  Distribution of total points spent to collect at least one full set.
                </p>
                <div class="chart-container">
                  <canvas ref="oneSetCanvas"></canvas>
                </div>
              </div>
              <div>
                <h2 class="text-sm font-semibold mb-1 text-gray-900">Points Distribution — All Sets Completers</h2>
                <p class="text-[11px] text-gray-600 mb-1">
                  Distribution of total points spent to collect every set released that week.
                </p>
                <div class="chart-container">
                  <canvas ref="allSetsCanvas"></canvas>
                </div>
              </div>
            </div>

            <!-- Tab toggle -->
            <div class="flex gap-1 mb-2">
              <button
                type="button"
                :class="[
                  'px-2 py-1 rounded text-[11px] border',
                  activeTab === 'one' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                ]"
                @click="activeTab = 'one'"
              >
                ≥1 Set Completers ({{ data.oneSet.count }})
              </button>
              <button
                type="button"
                :class="[
                  'px-2 py-1 rounded text-[11px] border',
                  activeTab === 'all' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                ]"
                @click="activeTab = 'all'"
              >
                All Sets Completers ({{ data.allSets.count }})
              </button>
            </div>

            <!-- User table -->
            <div class="overflow-x-auto">
              <table v-if="activeUsers.length" class="min-w-full table-auto border-collapse text-[11px]">
                <thead>
                  <tr class="bg-gray-100">
                    <th class="px-1.5 py-1 text-left text-gray-900">User</th>
                    <th class="px-1.5 py-1 text-left text-gray-900">Completed Sets</th>
                    <th class="px-1.5 py-1 text-right text-gray-900">Points Spent</th>
                    <th class="px-1.5 py-1 text-right text-gray-900">Trades Used</th>
                    <th class="px-1.5 py-1 text-right text-gray-900">Auctions Won</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="u in activeUsers"
                    :key="u.userId"
                    class="border-b hover:bg-gray-50"
                  >
                    <td class="px-1.5 py-1 font-medium text-gray-900">{{ u.username }}</td>
                    <td class="px-1.5 py-1 text-gray-700">{{ u.completedSets.join(', ') }}</td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">
                      {{ u.pointsSpent.toLocaleString() }}<span v-if="u.pointsEstimated" class="text-amber-500" title="Some costs estimated">*</span>
                    </td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ u.tradesUsed }}</td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ u.auctionsWon }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="text-gray-600 py-2">No users in this category for the selected week.</p>
            </div>

            <!-- Footnote shown when any visible user has an estimated cost -->
            <p v-if="activeUsers.some(u => u.pointsEstimated)" class="mt-1 text-[10px] text-amber-600">
              * Points marked with an asterisk include estimated costs: rarity default prices for legacy direct purchases,
              or {{ FALLBACK_PACK_PRICE.toLocaleString() }} pts per pack for purchases made before pack price tracking was added.
            </p>

          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  Chart,
  BarController, BarElement,
  CategoryScale, LinearScale,
  Title, Tooltip, Legend
} from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend)

const FALLBACK_PACK_PRICE = 1500

// ── Helpers ──────────────────────────────────────────────────────────────────

function prevMonday(from = new Date()) {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=Sun..6=Sat
  // Go to last week's Monday
  const daysBack = day === 0 ? 13 : day + 6
  d.setDate(d.getDate() - daysBack)
  return d
}

function toYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(ymd) {
  if (!ymd) return ''
  const d = new Date(`${ymd}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00`)
  d.setDate(d.getDate() + n)
  return toYMD(d)
}

// ── State ────────────────────────────────────────────────────────────────────

const weekStartInput = ref(toYMD(prevMonday()))
const weekEnd = computed(() => addDays(weekStartInput.value, 6))

const loading = ref(false)
const error = ref(null)
const data = ref(null)
const activeTab = ref('one')

const activeUsers = computed(() =>
  activeTab.value === 'one' ? (data.value?.oneSet.users ?? []) : (data.value?.allSets.users ?? [])
)

function avgPoints(users) {
  if (!users.length) return 0
  return Math.round(users.reduce((s, u) => s + u.pointsSpent, 0) / users.length).toLocaleString()
}

// ── Chart refs ────────────────────────────────────────────────────────────────

const oneSetCanvas = ref(null)
const allSetsCanvas = ref(null)
let oneSetChart = null
let allSetsChart = null

function destroyCharts() {
  oneSetChart?.destroy()
  allSetsChart?.destroy()
  oneSetChart = null
  allSetsChart = null
}

function buildBarChart(canvas, distribution, color, label) {
  if (!canvas) return null
  const labels = distribution.map(b => b.label)
  const counts = distribution.map(b => b.count)
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data: counts,
        backgroundColor: color,
        borderRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => `Points: ${ctx[0].label}`,
            label: ctx => `${ctx.raw} user${ctx.raw === 1 ? '' : 's'}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Points Spent', font: { size: 10 }, color: '#111827' },
          ticks: { font: { size: 10 }, color: '#111827' }
        },
        y: {
          title: { display: true, text: 'Users', font: { size: 10 }, color: '#111827' },
          ticks: { precision: 0, font: { size: 10 }, color: '#111827' },
          beginAtZero: true
        }
      }
    }
  })
}

function renderCharts() {
  destroyCharts()
  if (!data.value) return
  nextTick(() => {
    const oneDist = data.value.oneSetPointsDistribution
    const allDist = data.value.allSetsPointsDistribution

    if (oneSetCanvas.value) {
      oneSetChart = buildBarChart(
        oneSetCanvas.value,
        oneDist,
        'rgba(34, 197, 94, 0.7)',
        '≥1 Set Completers'
      )
    }
    if (allSetsCanvas.value) {
      allSetsChart = buildBarChart(
        allSetsCanvas.value,
        allDist,
        'rgba(147, 51, 234, 0.7)',
        'All Sets Completers'
      )
    }
  })
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await $fetch('/api/admin/ctoon-collection-analytics', {
      params: { weekStart: weekStartInput.value }
    })
    renderCharts()
  } catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load analytics'
  } finally {
    loading.value = false
  }
}

function loadPrevWeek() {
  weekStartInput.value = addDays(weekStartInput.value, -7)
  load()
}

function loadNextWeek() {
  weekStartInput.value = addDays(weekStartInput.value, 7)
  load()
}

onMounted(load)
onBeforeUnmount(destroyCharts)

watch(data, () => {
  nextTick(renderCharts)
})
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 220px;
}
</style>
