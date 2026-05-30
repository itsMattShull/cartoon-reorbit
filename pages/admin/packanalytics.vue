<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />
    <div class="mt-8">&nbsp;</div>
    <div class="px-6 mt-16 md:mt-20">
      <h1 class="text-2xl font-bold mb-4">Pack Analytics</h1>

      <!-- Filters -->
      <form class="bg-white border rounded p-4 flex flex-wrap items-end gap-4 mb-6" @submit.prevent="applyFilters">
        <div>
          <label class="block text-sm font-medium mb-1">From</label>
          <input type="date" v-model="from" class="border rounded px-2 py-1" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">To</label>
          <input type="date" v-model="to" class="border rounded px-2 py-1" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Set</label>
          <select v-model="selectedSet" class="border rounded px-2 py-1">
            <option value="">All sets</option>
            <option v-for="s in sets" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Pack</label>
          <select v-model="selectedPack" class="border rounded px-2 py-1">
            <option value="">All packs</option>
            <option v-for="p in packs" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <button class="bg-indigo-600 text-white rounded px-4 py-2">Apply</button>
        <button type="button" class="text-sm text-gray-600 underline" @click="setLastNDays(30)">Last 30 days</button>
      </form>

      <!-- Summary stat -->
      <div class="bg-white rounded shadow p-4 mb-6 inline-flex flex-col">
        <p class="text-sm text-gray-500 mb-1">Packs Opened</p>
        <p class="text-3xl font-bold">{{ loading ? '—' : packsOpened }}</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Stacked bar chart -->
        <div class="bg-white rounded shadow p-4">
          <h2 class="text-xl font-semibold mb-2">Rarity Distribution</h2>
          <div class="chart-container"><canvas ref="barCanvas"></canvas></div>
        </div>

        <!-- Breakdown table -->
        <div class="bg-white rounded shadow p-4">
          <h2 class="text-xl font-semibold mb-2">Breakdown</h2>
          <div v-if="loading" class="text-gray-500">Loading…</div>
          <div v-else-if="!hasData" class="text-gray-500">No data in this range.</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2">Rarity</th>
                <th class="py-2 text-right">Total</th>
                <th class="py-2 text-right">Shop</th>
                <th class="py-2 text-right">PE</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rarityBreakdown" :key="r.rarity" class="border-b">
                <td class="py-1">
                  <span class="inline-block w-3 h-3 rounded-sm mr-2" :style="{ backgroundColor: colorFor(r.rarity) }"></span>
                  {{ capitalize(r.rarity) }}
                </td>
                <td class="py-1 text-right">{{ r.total.toLocaleString() }}</td>
                <td class="py-1 text-right">{{ r.shop.toLocaleString() }}</td>
                <td class="py-1 text-right">{{ r.pe.toLocaleString() }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t-2 font-semibold">
                <td class="pt-2">Totals</td>
                <td class="pt-2 text-right">{{ totalCtoons.toLocaleString() }}</td>
                <td class="pt-2 text-right">{{ totalShop.toLocaleString() }}</td>
                <td class="pt-2 text-right">{{ totalPE.toLocaleString() }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

definePageMeta({ title: 'Admin - Pack Analytics', middleware: ['auth', 'admin'], layout: 'admin' })

const from = ref('')
const to = ref('')
const selectedSet = ref('')
const selectedPack = ref('')

const sets = ref([])
const packs = ref([])
const packsOpened = ref(0)
const rarityBreakdown = ref([])
const loading = ref(false)

const hasData = computed(() => rarityBreakdown.value.some(r => r.total > 0))
const totalCtoons = computed(() => rarityBreakdown.value.reduce((s, r) => s + r.total, 0))
const totalShop = computed(() => rarityBreakdown.value.reduce((s, r) => s + r.shop, 0))
const totalPE = computed(() => rarityBreakdown.value.reduce((s, r) => s + r.pe, 0))

const RARITY_COLORS = {
  common: '#9CA3AF',
  uncommon: '#3B82F6',
  rare: '#8B5CF6',
  'very rare': '#F59E0B'
}
const colorFor = r => RARITY_COLORS[r] || '#10B981'
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
let barChart

async function fetchData() {
  if (!from.value || !to.value) return
  loading.value = true
  try {
    const params = new URLSearchParams({ start: from.value, end: to.value })
    if (selectedSet.value) params.set('set', selectedSet.value)
    if (selectedPack.value) params.set('packId', selectedPack.value)

    const data = await $fetch(`/api/admin/pack-analytics?${params.toString()}`, { credentials: 'include' })

    packsOpened.value = data.packsOpened ?? 0
    rarityBreakdown.value = data.rarityBreakdown ?? []
    sets.value = data.sets ?? []
    packs.value = data.packs ?? []

    barChart.data.labels = rarityBreakdown.value.map(r => capitalize(r.rarity))
    barChart.data.datasets = [
      {
        label: 'Shop',
        data: rarityBreakdown.value.map(r => r.shop),
        backgroundColor: '#3B82F6'
      },
      {
        label: 'PE',
        data: rarityBreakdown.value.map(r => r.pe),
        backgroundColor: '#8B5CF6'
      }
    ]
    barChart.update()
  } catch (e) {
    console.error(e)
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
        x: { stacked: true, ticks: { color: '#000' } },
        y: { stacked: true, beginAtZero: true, ticks: { color: '#000' } }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#000' }
        }
      }
    }
  })

  fetchData()
})
</script>

<style scoped>
.chart-container {
  height: 360px;
  position: relative;
}
</style>
