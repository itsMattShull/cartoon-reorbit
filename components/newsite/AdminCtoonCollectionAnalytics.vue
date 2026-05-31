<template>
  <div class="admin-collection-analytics bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-2 text-gray-900">cToon Collection Analytics</h1>

        <!-- Controls row -->
        <div class="flex flex-wrap items-center gap-3 mb-1">
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

          <div class="flex items-center gap-1.5 ml-auto">
            <label for="minCtoons" class="font-medium whitespace-nowrap">Min cToons per set:</label>
            <input
              id="minCtoons"
              v-model.number="minCtoons"
              type="number"
              min="1"
              class="border rounded px-1.5 py-0.5 text-xs w-16"
            />
          </div>
          <button
            type="button"
            :disabled="loading"
            class="flex items-center gap-1 border rounded px-2 py-0.5 text-xs bg-amber-50 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="loadFresh"
          >
            <svg :class="['w-3 h-3', loading ? 'animate-spin' : '']" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        <!-- Filter notes -->
        <div class="flex flex-col gap-1 mb-3">
          <p class="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
            <strong>Note:</strong> The week selection determines <strong>which sets to analyze</strong> based on their release date. All acquisition data (points spent, trades, auctions, pack purchases) is tracked <strong>for all time</strong> — not limited to the selected week.
          </p>
          <p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <strong>Data accuracy:</strong> Failed pack tracking (packs that were opened but yielded no new set cToons) requires UserPack records that were first tracked on <strong>May 31, 2026</strong>. Data before that date may undercount pack-related costs.
          </p>
        </div>

        <div v-if="loading" class="text-center py-6 text-gray-500">Loading…</div>
        <div v-else-if="error" class="text-red-600 py-4">{{ error }}</div>
        <template v-else>

          <!-- No sets found -->
          <div v-if="!data || data.sets.length === 0" class="py-4 text-gray-500">
            No cToon sets with a release date in this week.
          </div>

          <template v-else>
            <!-- Sets released this week (filtered) -->
            <div class="mb-3">
              <h2 class="text-sm font-semibold mb-1">
                Sets Released This Week
                <span v-if="filteredSets.length < data.sets.length" class="text-[11px] font-normal text-gray-500">
                  (showing {{ filteredSets.length }} of {{ data.sets.length }} with ≥{{ minCtoons }} cToons)
                </span>
              </h2>
              <div v-if="filteredSets.length" class="flex flex-wrap gap-2">
                <span
                  v-for="s in filteredSets"
                  :key="s.name"
                  class="inline-block bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-[11px]"
                >
                  {{ s.name }} ({{ s.ctoonCount }} cToons)
                </span>
              </div>
              <p v-else class="text-gray-500 text-[11px]">
                No sets have {{ minCtoons }}+ cToons this week.
              </p>
            </div>

            <!-- Summary stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div class="bg-green-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-green-700">{{ filteredOneSetUsers.length }}</div>
                <div class="text-[11px] text-green-600">Completed ≥1 Set</div>
              </div>
              <div class="bg-purple-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-purple-700">{{ filteredAllSetsUsers.length }}</div>
                <div class="text-[11px] text-purple-600">Completed All Sets</div>
              </div>
              <div class="bg-gray-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-gray-700">
                  {{ avgPoints(filteredOneSetUsers) }}<span v-if="filteredOneSetUsers.some(u => u.pointsEstimated)" class="text-amber-500" title="Includes estimated costs">*</span>
                </div>
                <div class="text-[11px] text-gray-500">Avg pts (1 set)</div>
              </div>
              <div class="bg-gray-50 rounded p-2 text-center">
                <div class="text-lg font-bold text-gray-700">
                  {{ avgPoints(filteredAllSetsUsers) }}<span v-if="filteredAllSetsUsers.some(u => u.pointsEstimated)" class="text-amber-500" title="Includes estimated costs">*</span>
                </div>
                <div class="text-[11px] text-gray-500">Avg pts (all sets)</div>
              </div>
            </div>

            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div>
                <h2 class="text-sm font-semibold mb-1 text-gray-900">Points Distribution — ≥1 Set Completers</h2>
                <p class="text-[11px] text-gray-600 mb-1">
                  Distribution of total all-time points spent to collect at least one full set.
                </p>
                <div class="chart-container">
                  <canvas ref="oneSetCanvas"></canvas>
                </div>
              </div>
              <div>
                <h2 class="text-sm font-semibold mb-1 text-gray-900">Points Distribution — All Sets Completers</h2>
                <p class="text-[11px] text-gray-600 mb-1">
                  Distribution of total all-time points spent to collect every set released that week.
                </p>
                <div class="chart-container">
                  <canvas ref="allSetsCanvas"></canvas>
                </div>
              </div>
            </div>

            <!-- Tab toggle -->
            <div class="flex gap-1 mb-3">
              <button
                type="button"
                :class="[
                  'px-2 py-1 rounded text-[11px] border',
                  activeTab === 'one' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                ]"
                @click="activeTab = 'one'"
              >
                ≥1 Set Completers ({{ filteredOneSetUsers.length }})
              </button>
              <button
                type="button"
                :class="[
                  'px-2 py-1 rounded text-[11px] border',
                  activeTab === 'all' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                ]"
                @click="activeTab = 'all'"
              >
                All Sets Completers ({{ filteredAllSetsUsers.length }})
              </button>
            </div>

            <!-- Aggregate breakdown -->
            <div v-if="activeBreakdown" class="mb-3 bg-gray-50 border rounded p-3">
              <h3 class="text-[11px] font-semibold text-gray-800 mb-2">
                Aggregate Acquisition Breakdown
                <span class="font-normal text-gray-500">(across all {{ activeTab === 'one' ? '≥1 set' : 'all sets' }} completers)</span>
              </h3>
              <div class="overflow-x-auto">
                <table class="text-[11px] w-full max-w-lg">
                  <thead>
                    <tr class="border-b bg-gray-100">
                      <th class="px-2 py-1 text-left text-gray-800">Method</th>
                      <th class="px-2 py-1 text-right text-gray-800">Count</th>
                      <th class="px-2 py-1 text-right text-gray-800">Total Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="border-b">
                      <td class="px-2 py-1 text-gray-700">cMart purchases</td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ activeBreakdown.totalCmartCount.toLocaleString() }}</td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ activeBreakdown.totalCmartPoints.toLocaleString() }}</td>
                    </tr>
                    <tr class="border-b">
                      <td class="px-2 py-1 text-gray-700">
                        Packs purchased
                        <span v-if="activeBreakdown.totalFailedPackCount > 0" class="text-gray-400">({{ activeBreakdown.totalFailedPackCount.toLocaleString() }} failed)</span>
                      </td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ activeBreakdown.totalPackCount.toLocaleString() }}</td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ activeBreakdown.totalPackPoints.toLocaleString() }}</td>
                    </tr>
                    <tr v-if="activeBreakdown.totalFailedPackCount > 0" class="border-b bg-amber-50">
                      <td class="px-2 py-1 text-amber-700 pl-5">↳ of which failed (no new set cToons)</td>
                      <td class="px-2 py-1 text-right tabular-nums text-amber-700">{{ activeBreakdown.totalFailedPackCount.toLocaleString() }}</td>
                      <td class="px-2 py-1 text-right tabular-nums text-amber-700">{{ activeBreakdown.totalFailedPackPoints.toLocaleString() }}</td>
                    </tr>
                    <tr class="border-b">
                      <td class="px-2 py-1 text-gray-700">Auctions won</td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ activeBreakdown.totalAuctions.toLocaleString() }}</td>
                      <td class="px-2 py-1 text-right tabular-nums text-gray-400">—</td>
                    </tr>
                    <tr class="border-b">
                      <td class="px-2 py-1 text-gray-700">Trades made</td>
                      <td class="px-2 py-1 text-right tabular-nums">{{ activeBreakdown.totalTrades.toLocaleString() }}</td>
                      <td class="px-2 py-1 text-right tabular-nums text-gray-400">—</td>
                    </tr>
                    <tr class="font-semibold bg-gray-100">
                      <td class="px-2 py-1 text-gray-900">Total points spent</td>
                      <td class="px-2 py-1"></td>
                      <td class="px-2 py-1 text-right tabular-nums text-gray-900">{{ activeBreakdown.totalPoints.toLocaleString() }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-[10px] text-gray-500 mt-1">
                "Failed packs" are set-eligible packs opened before a user completed the set that yielded no new cToons from that set. Points for trades shown per-user above (initiator-side only). Auction point totals roll up into user totals.
              </p>
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
                    <td class="px-1.5 py-1 text-gray-700">{{ filteredCompletedSets(u).join(', ') }}</td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">
                      {{ u.pointsSpent.toLocaleString() }}<span v-if="u.pointsEstimated" class="text-amber-500" title="Some costs estimated">*</span>
                    </td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ u.tradesUsed }}</td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ u.auctionsWon }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="text-gray-600 py-2">No users in this category for the selected sets.</p>
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

const FALLBACK_PACK_PRICE = 1250

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

function buildHistogram(users) {
  const values = users.map(u => u.pointsSpent)
  if (!values.length) return []
  const max = Math.max(...values)
  if (max === 0) return [{ label: '0–0', count: values.length }]
  const raw = max / 10
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const normalized = raw / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const bucketSize = Math.max(1, nice * magnitude)
  const buckets = []
  for (let lo = 0; lo <= max; lo += bucketSize) {
    const hi = lo + bucketSize
    buckets.push({ label: `${lo}–${hi - 1}`, count: values.filter(v => v >= lo && v < hi).length })
  }
  while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) buckets.pop()
  return buckets
}

// ── State ────────────────────────────────────────────────────────────────────

const weekStartInput = ref(toYMD(prevMonday()))
const weekEnd = computed(() => addDays(weekStartInput.value, 6))
const minCtoons = ref(19)

const loading = ref(false)
const error = ref(null)
const data = ref(null)
const activeTab = ref('one')

// ── Filtered computed ─────────────────────────────────────────────────────────

const filteredSets = computed(() => {
  if (!data.value) return []
  return data.value.sets.filter(s => s.ctoonCount >= minCtoons.value)
})

const filteredSetNames = computed(() => new Set(filteredSets.value.map(s => s.name)))

const filteredOneSetUsers = computed(() => {
  if (!data.value) return []
  return data.value.oneSet.users.filter(u =>
    u.completedSets.some(s => filteredSetNames.value.has(s))
  )
})

const filteredAllSetsUsers = computed(() => {
  if (!data.value) return []
  return data.value.allSets.users.filter(u =>
    u.completedSets.some(s => filteredSetNames.value.has(s))
  )
})

const activeUsers = computed(() =>
  activeTab.value === 'one' ? filteredOneSetUsers.value : filteredAllSetsUsers.value
)

// Compute breakdown aggregate from filtered users (not from raw API breakdown,
// since the minCtoons filter may exclude some users)
const activeBreakdown = computed(() => {
  const users = activeUsers.value
  if (!users.length) return null
  return users.reduce((acc, u) => ({
    totalPoints: acc.totalPoints + u.pointsSpent,
    totalTrades: acc.totalTrades + u.tradesUsed,
    totalAuctions: acc.totalAuctions + u.auctionsWon,
    totalCmartCount: acc.totalCmartCount + (u.cmartCount || 0),
    totalCmartPoints: acc.totalCmartPoints + (u.cmartPoints || 0),
    totalPackCount: acc.totalPackCount + (u.packCount || 0),
    totalPackPoints: acc.totalPackPoints + (u.packPoints || 0),
    totalFailedPackCount: acc.totalFailedPackCount + (u.failedPackCount || 0),
    totalFailedPackPoints: acc.totalFailedPackPoints + (u.failedPackPoints || 0)
  }), {
    totalPoints: 0, totalTrades: 0, totalAuctions: 0,
    totalCmartCount: 0, totalCmartPoints: 0,
    totalPackCount: 0, totalPackPoints: 0,
    totalFailedPackCount: 0, totalFailedPackPoints: 0
  })
})

function filteredCompletedSets(u) {
  return u.completedSets.filter(s => filteredSetNames.value.has(s))
}

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
    if (oneSetCanvas.value) {
      oneSetChart = buildBarChart(
        oneSetCanvas.value,
        buildHistogram(filteredOneSetUsers.value),
        'rgba(34, 197, 94, 0.7)',
        '≥1 Set Completers'
      )
    }
    if (allSetsCanvas.value) {
      allSetsChart = buildBarChart(
        allSetsCanvas.value,
        buildHistogram(filteredAllSetsUsers.value),
        'rgba(147, 51, 234, 0.7)',
        'All Sets Completers'
      )
    }
  })
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function load(refresh = false) {
  loading.value = true
  error.value = null
  try {
    const params = { weekStart: weekStartInput.value }
    if (refresh) params.refresh = '1'
    data.value = await $fetch('/api/admin/ctoon-collection-analytics', { params })
    renderCharts()
  } catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load analytics'
  } finally {
    loading.value = false
  }
}

function loadFresh() {
  load(true)
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

watch(minCtoons, () => {
  nextTick(renderCharts)
})
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 220px;
}
</style>
