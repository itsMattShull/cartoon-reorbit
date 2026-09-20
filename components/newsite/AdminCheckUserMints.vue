<template>
  <div class="admin-check-user-mints bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-2 text-gray-900">Check User Mints</h1>
        <p class="text-[11px] text-gray-500 mb-3">
          Finds usernames who minted a cToon between 1 and the chosen number of times in the selected period.
          Trades, auctions, and admin transfers do not count as mints.
        </p>

        <!-- Filters -->
        <form class="flex flex-wrap items-end gap-3 mb-3 border rounded p-2 bg-gray-50" @submit.prevent="applyFilters">
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">From</label>
            <input type="date" v-model="from" class="border rounded px-1.5 py-0.5 text-xs text-gray-900" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">To</label>
            <input type="date" v-model="to" class="border rounded px-1.5 py-0.5 text-xs text-gray-900" />
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">Rarity</label>
            <select v-model="rarity" class="border rounded px-1.5 py-0.5 text-xs text-gray-900">
              <option value="all">All rarities</option>
              <option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">Number of Mints</label>
            <select v-model.number="maxMints" class="border rounded px-1.5 py-0.5 text-xs text-gray-900">
              <option v-for="n in 10" :key="n" :value="n">{{ n }}</option>
            </select>
          </div>
          <button type="submit" class="border rounded px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700">Submit</button>
          <button type="button" class="text-xs text-blue-600 underline" @click="setLastNDays(30)">Last 30 days</button>
          <button
            type="button"
            :disabled="loading"
            class="flex items-center gap-1 border rounded px-2 py-1 text-xs bg-amber-50 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="fetchData(true)"
          >
            <svg :class="['w-3 h-3', loading ? 'animate-spin' : '']" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </form>

        <div v-if="error" class="text-red-600 py-2">{{ error }}</div>

        <template v-if="hasSearched && !error">
          <div v-if="loading" class="text-center py-6 text-gray-500">Loading…</div>
          <template v-else>
            <p class="text-[11px] text-gray-600 mb-2">
              {{ rows.length }} username{{ rows.length === 1 ? '' : 's' }} minted 1–{{ maxMintsUsed }}
              cToon{{ maxMintsUsed === 1 ? '' : 's' }}
              <span v-if="rarityUsed !== 'all'">({{ rarityUsed }} only)</span>
              between {{ rangeUsed.start }} and {{ rangeUsed.end }}.
            </p>
            <p v-if="truncated" class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
              Showing the top {{ rows.length }} matching usernames by count; more matched but were not returned. Narrow the date range or rarity to see everything.
            </p>

            <div v-if="rows.length === 0" class="text-gray-500 py-4">No matching usernames in this range.</div>
            <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <!-- Pie chart: capped to the top slices so the chart and legend stay readable, especially on mobile -->
              <div class="bg-gray-50 rounded border p-2">
                <h2 class="text-sm font-semibold mb-1 text-gray-900">
                  Mint Count by Username
                  <span v-if="rows.length > MAX_SLICES" class="text-[10px] font-normal text-gray-500">
                    (top {{ MAX_SLICES }} shown, rest grouped as Other)
                  </span>
                </h2>
                <div class="chart-container"><canvas ref="pieCanvas"></canvas></div>
              </div>

              <!-- Full breakdown table -->
              <div class="bg-gray-50 rounded border p-2">
                <h2 class="text-sm font-semibold mb-1 text-gray-900">Breakdown</h2>
                <div class="overflow-y-auto overflow-x-auto max-h-[320px]">
                  <table class="w-full text-[11px]">
                    <thead class="sticky top-0 bg-gray-100">
                      <tr class="text-left border-b">
                        <th class="px-1.5 py-1 text-gray-900">Username</th>
                        <th class="px-1.5 py-1 text-right text-gray-900">Mints</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in rows" :key="r.username" class="border-b hover:bg-blue-50">
                        <td class="px-1.5 py-1 text-gray-900 break-all">{{ r.username }}</td>
                        <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ r.count }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'

Chart.register(PieController, ArcElement, Tooltip, Legend, ChartDataLabels)

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
const MAX_SLICES = 15

const SLICE_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#10B981', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#A855F7', '#EAB308', '#F43F5E', '#22C55E']
const OTHER_COLOR = '#9CA3AF'

const from = ref('')
const to = ref('')
const rarity = ref('all')
const maxMints = ref(5)

const rows = ref([])
const loading = ref(false)
const error = ref(null)
const hasSearched = ref(false)
const truncated = ref(false)
const rangeUsed = ref({ start: '', end: '' })
const rarityUsed = ref('all')
const maxMintsUsed = ref(5)

function toYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function setLastNDays(n) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (n - 1))
  from.value = toYMD(start)
  to.value = toYMD(end)
}

const pieCanvas = ref(null)
const resources = useAdminResources()
let pieChart = null

function initChart() {
  if (pieChart) pieChart = resources.destroyChart(pieChart)
  if (!pieCanvas.value) return
  pieChart = resources.chart(new Chart(pieCanvas.value.getContext('2d'), {
    type: 'pie',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#374151', font: { size: 10 }, boxWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw}`
          }
        },
        datalabels: {
          color: '#fff',
          font: { size: 9, weight: 'bold' },
          formatter: (val) => val
        }
      }
    }
  }))
}

function renderChart() {
  if (!pieChart) return
  const sorted = [...rows.value].sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, MAX_SLICES)
  const rest = sorted.slice(MAX_SLICES)
  const labels = top.map(r => r.username)
  const counts = top.map(r => r.count)
  const colors = top.map((_, i) => SLICE_COLORS[i % SLICE_COLORS.length])

  if (rest.length) {
    labels.push(`Other (${rest.length} users)`)
    counts.push(rest.reduce((s, r) => s + r.count, 0))
    colors.push(OTHER_COLOR)
  }

  pieChart.data.labels = labels
  pieChart.data.datasets = [{
    data: counts,
    backgroundColor: colors,
    borderColor: '#fff',
    borderWidth: 1
  }]
  pieChart.update()
}

async function fetchData(refresh = false) {
  if (!from.value || !to.value) return
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams({ start: from.value, end: to.value, rarity: rarity.value, maxMints: String(maxMints.value) })
    if (refresh) params.set('refresh', '1')

    const data = await $fetch(`/api/admin/user-mints?${params.toString()}`)

    rows.value = data.data ?? []
    truncated.value = !!data.truncated
    rangeUsed.value = { start: data.start, end: data.end }
    rarityUsed.value = data.rarity
    maxMintsUsed.value = data.maxMints
    hasSearched.value = true
  } catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load mint data'
  } finally {
    loading.value = false
    await nextTick()
    initChart()
    if (rows.value.length) renderChart()
  }
}

function applyFilters() {
  if (!from.value || !to.value) return
  if (new Date(from.value) > new Date(to.value)) {
    const t = from.value
    from.value = to.value
    to.value = t
  }
  fetchData()
}

onMounted(() => {
  setLastNDays(30)
})
</script>

<style scoped>
.admin-check-user-mints {
  width: 100%;
  min-height: 100%;
}
.chart-container {
  height: 280px;
  position: relative;
}
</style>
