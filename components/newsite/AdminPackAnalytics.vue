<template>
  <div class="admin-pack-analytics bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-2 text-gray-900">Pack Analytics</h1>

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
            <label class="font-medium text-gray-800">Set</label>
            <select v-model="selectedSet" class="border rounded px-1.5 py-0.5 text-xs text-gray-900">
              <option value="">All sets</option>
              <option v-for="s in sets" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="flex flex-col gap-0.5">
            <label class="font-medium text-gray-800">Pack</label>
            <select v-model="selectedPack" class="border rounded px-1.5 py-0.5 text-xs text-gray-900">
              <option value="">All packs</option>
              <option v-for="p in packs" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <button type="submit" class="border rounded px-2 py-1 text-xs bg-blue-600 text-white hover:bg-blue-700">Apply</button>
          <button type="button" class="text-xs text-blue-600 underline" @click="setLastNDays(30)">Last 30 days</button>
          <button
            type="button"
            :disabled="loading"
            class="flex items-center gap-1 border rounded px-2 py-1 text-xs bg-amber-50 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="fetchData"
          >
            <svg :class="['w-3 h-3', loading ? 'animate-spin' : '']" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </form>

        <div v-if="loading" class="text-center py-6 text-gray-500">Loading…</div>
        <div v-else-if="error" class="text-red-600 py-4">{{ error }}</div>
        <template v-else>
          <!-- Summary stat -->
          <div class="inline-flex flex-col bg-gray-50 rounded border p-2 mb-3">
            <p class="text-[11px] text-gray-600 mb-0.5">Packs Opened</p>
            <p class="text-2xl font-bold text-gray-900">{{ packsOpened.toLocaleString() }}</p>
          </div>

          <!-- Charts and table side by side -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Stacked bar chart -->
            <div class="bg-gray-50 rounded border p-2">
              <h2 class="text-sm font-semibold mb-2 text-gray-900">Rarity Distribution</h2>
              <div class="chart-container">
                <canvas ref="barCanvas"></canvas>
              </div>
            </div>

            <!-- Breakdown table -->
            <div class="bg-gray-50 rounded border p-2">
              <h2 class="text-sm font-semibold mb-2 text-gray-900">Breakdown</h2>
              <div v-if="!hasData" class="text-gray-600">No data in this range.</div>
              <table v-else class="w-full text-[11px]">
                <thead>
                  <tr class="text-left border-b bg-gray-100">
                    <th class="px-1.5 py-1 text-gray-900">Rarity</th>
                    <th class="px-1.5 py-1 text-right text-gray-900">Total</th>
                    <th class="px-1.5 py-1 text-right text-gray-900">Shop</th>
                    <th class="px-1.5 py-1 text-right text-gray-900">PE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rarityBreakdown" :key="r.rarity" class="border-b hover:bg-gray-50">
                    <td class="px-1.5 py-1 text-gray-900">
                      <span class="inline-block w-3 h-3 rounded-sm mr-1.5 align-middle" :style="{ backgroundColor: colorFor(r.rarity) }"></span>
                      {{ capitalize(r.rarity) }}
                    </td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ r.total.toLocaleString() }}</td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ r.shop.toLocaleString() }}</td>
                    <td class="px-1.5 py-1 text-right tabular-nums text-gray-900">{{ r.pe.toLocaleString() }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="border-t-2 font-semibold">
                    <td class="px-1.5 pt-1.5 text-gray-900">Totals</td>
                    <td class="px-1.5 pt-1.5 text-right tabular-nums text-gray-900">{{ totalCtoons.toLocaleString() }}</td>
                    <td class="px-1.5 pt-1.5 text-right tabular-nums text-gray-900">{{ totalShop.toLocaleString() }}</td>
                    <td class="px-1.5 pt-1.5 text-right tabular-nums text-gray-900">{{ totalPE.toLocaleString() }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const from = ref('')
const to = ref('')
const selectedSet = ref('')
const selectedPack = ref('')

const sets = ref([])
const packs = ref([])
const packsOpened = ref(0)
const rarityBreakdown = ref([])
const loading = ref(false)
const error = ref(null)

const hasData = computed(() => rarityBreakdown.value.some(r => r.total > 0))
const totalCtoons = computed(() => rarityBreakdown.value.reduce((s, r) => s + r.total, 0))
const totalShop = computed(() => rarityBreakdown.value.reduce((s, r) => s + r.shop, 0))
const totalPE = computed(() => rarityBreakdown.value.reduce((s, r) => s + r.pe, 0))

const RARITY_COLORS = {
  common: '#9CA3AF',
  uncommon: '#3B82F6',
  rare: '#8B5CF6',
  'very rare': '#F59E0B',
  'crazy rare': '#EF4444'
}
const colorFor = r => RARITY_COLORS[r.toLowerCase()] || '#10B981'
const capitalize = s => s.replace(/\b\w/g, c => c.toUpperCase())

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

const barCanvas = ref(null)
let barChart = null

async function fetchData() {
  if (!from.value || !to.value) return
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams({ start: from.value, end: to.value })
    if (selectedSet.value) params.set('set', selectedSet.value)
    if (selectedPack.value) params.set('packId', selectedPack.value)

    const data = await $fetch(`/api/admin/pack-analytics?${params.toString()}`)

    packsOpened.value = data.packsOpened ?? 0
    rarityBreakdown.value = data.rarityBreakdown ?? []
    sets.value = data.sets ?? []
    packs.value = data.packs ?? []

    if (barChart) {
      barChart.data.labels = rarityBreakdown.value.map(r => capitalize(r.rarity))
      barChart.data.datasets = [
        { label: 'Shop', data: rarityBreakdown.value.map(r => r.shop), backgroundColor: '#3B82F6' },
        { label: 'PE',   data: rarityBreakdown.value.map(r => r.pe),   backgroundColor: '#8B5CF6' }
      ]
      barChart.update()
    }
  } catch (err) {
    error.value = err?.data?.statusMessage || err?.message || 'Failed to load analytics'
  } finally {
    loading.value = false
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

  barChart = new Chart(barCanvas.value.getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#111827', font: { size: 10 } }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: '#111827', font: { size: 10 } }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#111827', font: { size: 10 } }
        }
      }
    }
  })

  fetchData()
})
</script>

<style scoped>
.chart-container {
  height: 300px;
  position: relative;
}
</style>
