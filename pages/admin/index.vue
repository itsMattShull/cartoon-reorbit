<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />

    <!-- Active Discord % Card -->
    <div class="px-6 py-4 mt-16">
      <div class="inline-block bg-white shadow rounded p-4 mb-6">
        <h2 class="text-lg font-semibold">Active in Discord</h2>
        <p class="text-2xl font-bold">
          {{ activeDiscord.percentage }}%
          ({{ activeDiscord.count }} of {{ activeDiscord.total }})
        </p>
      </div>
    </div>

    <!-- Timeframe selector -->
    <div class="px-6 py-4 flex items-center space-x-4">
      <label for="timeframe" class="font-medium">Timeframe:</label>
      <select
        id="timeframe"
        v-model="selectedTimeframe"
        class="border rounded px-2 py-1"
      >
        <option
          v-for="opt in timeframeOptions"
          :key="opt.value"
          :value="opt.value"
        >{{ opt.label }}</option>
      </select>
    </div>

    <!-- Charts grid -->
    <div class="px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- 1) Cumulative Users -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Cumulative Users</h2>
        <div class="chart-container"><canvas ref="cumCanvas"></canvas></div>
      </div>

      <!-- 2) % First Purchase -->
      <div>
        <h2 class="text-xl font-semibold mb-2">
          % of Users Buying First cToon within 1 Day
        </h2>
        <div class="chart-container"><canvas ref="pctCanvas"></canvas></div>
      </div>

      <!-- 3) Unique Daily Logons -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Unique Daily Logons</h2>
        <div class="chart-container"><canvas ref="uniqueCanvas"></canvas></div>
      </div>

      <!-- 4) cToons Purchased (bar) -->
      <div>
        <h2 class="text-xl font-semibold mb-2">cToons Purchased</h2>
        <div class="chart-container"><canvas ref="ctoonCanvas"></canvas></div>
      </div>

      <!-- 5) Packs Purchased (bar) -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Packs Purchased</h2>
        <div class="chart-container"><canvas ref="packsCanvas"></canvas></div>
      </div>

      <!-- 6) Points Distribution (histogram) spans full width -->
      <div class="lg:col-span-2">
        <h2 class="text-xl font-semibold mb-2">Points Distribution</h2>
        <div class="chart-container"><canvas ref="ptsDistCanvas"></canvas></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import {
  Chart,
  LineController, LineElement, PointElement,
  BarController, BarElement,
  CategoryScale, LinearScale, TimeScale,
  Title, Tooltip, Legend
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import 'chartjs-adapter-date-fns'
import Nav from '@/components/Nav.vue'

// register controllers, scales & plugins
Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  CategoryScale, LinearScale, TimeScale,
  Title, Tooltip, Legend,
  ChartDataLabels
)

// auth/admin guard
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

// --- state & refs ---
const timeframeOptions = [
  { value: '1m', label: '1 Month' },
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' }
]
const selectedTimeframe = ref('1m')

// Active Discord meta
const activeDiscord = ref({ percentage: 0, count: 0, total: 0 })

// canvas refs
const cumCanvas     = ref(null)
const pctCanvas     = ref(null)
const uniqueCanvas  = ref(null)
const ctoonCanvas   = ref(null)
const packsCanvas   = ref(null)
const ptsDistCanvas = ref(null)

// Chart instances
let cumChart, pctChart, uniqueChart,
    ctoonChart, packChart, ptsHistChart

// --- color palette (solid, no opacity) ---
const colors = {
  line:      '#4F46E5', // Indigo
  ctoonBar:  '#10B981', // Emerald
  packBar:   '#3B82F6', // Blue
  histBar:   '#F59E0B'  // Amber
}

// --- chart options ---
const commonLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } }
}

const cumOptions = {
  ...commonLineOptions,
  scales: {
    x: { type: 'time', time: { unit: 'week', tooltipFormat: 'PP' }, title: { display: true, text: 'Week' } },
    y: { title: { display: true, text: 'Cumulative Users' } }
  }
}

const pctOptions = {
  ...commonLineOptions,
  scales: {
    x: { type: 'time', time: { unit: 'week', tooltipFormat: 'PP' }, title: { display: true, text: 'Week' } },
    y: {
      title: { display: true, text: '% First cToon Purchase' },
      ticks: { callback: v => v + '%' },
      min: 0, max: 100
    }
  }
}

const uniqueOptions = {
  ...commonLineOptions,
  scales: {
    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' }, title: { display: true, text: 'Day' } },
    y: { title: { display: true, text: 'Unique Daily Logons' } }
  }
}

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      anchor: 'center',
      align: 'center',
      color: '#ffffff',
      font: { weight: 'bold' }
    }
  },
  scales: {
    x: {
      type: 'time',
      time: {
        unit: 'week',
        // show e.g. "Jun 23"
        tooltipFormat: 'PP',
        displayFormats: { week: 'MMM d' }
      },
      title: { display: true, text: 'Week' }
    },
    y: { title: { display: true, text: 'Count' }, beginAtZero: true }
  }
}

const histOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      anchor: 'center',
      align: 'center',
      color: '#ffffff',
      font: { weight: 'bold' }
    }
  },
  scales: {
    x: { title: { display: true, text: 'Points Range' } },
    y: { title: { display: true, text: 'Users' }, beginAtZero: true }
  }
}

// --- fetch & populate ---
async function fetchData() {
  // 1) cumulative users
  let res = await fetch(`/api/admin/cumulative-users?timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  let data = await res.json()
  cumChart.data.labels   = data.map(d => new Date(d.week))
  cumChart.data.datasets = [{
    data: data.map(d => d.cumulative),
    borderColor: colors.line,
    backgroundColor: colors.line,
    borderWidth: 2,
    fill: false
  }]
  cumChart.update()

  // 2) % first purchase
  res = await fetch(`/api/admin/percentage-first-purchase?timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  data = await res.json()
  pctChart.data.labels   = data.map(d => new Date(d.week))
  pctChart.data.datasets = [{
    data: data.map(d => d.percentage),
    borderColor: colors.line,
    backgroundColor: colors.line,
    borderWidth: 2,
    fill: false
  }]
  pctChart.update()

  // 3) unique logins
  res = await fetch(`/api/admin/unique-logins?timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  data = await res.json()
  uniqueChart.data.labels   = data.map(d => new Date(d.day))
  uniqueChart.data.datasets = [{
    data: data.map(d => d.count),
    borderColor: colors.line,
    backgroundColor: colors.line,
    borderWidth: 2,
    fill: false
  }]
  uniqueChart.update()

  // 4) active Discord
  res = await fetch('/api/admin/active-discord', { credentials: 'include' })
  const ad = await res.json()
  activeDiscord.value = {
    percentage: Math.round((ad.active / ad.total) * 100),
    count: ad.active,
    total: ad.total
  }

  // 5) cToons purchased
  res = await fetch(`/api/admin/purchases?method=ctoon&timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  let pd = await res.json()
  if (pd.ctoonPurchases) pd = pd.ctoonPurchases
  ctoonChart.data.labels   = pd.map(d => new Date(d.period))
  ctoonChart.data.datasets = [{
    data: pd.map(d => d.count),
    backgroundColor: colors.ctoonBar,
    borderColor: colors.ctoonBar,
    borderWidth: 1
  }]
  ctoonChart.update()

  // 6) packs purchased
  res = await fetch(`/api/admin/purchases?method=pack&timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  let pp = await res.json()
  if (pp.packPurchases) pp = pp.packPurchases
  packChart.data.labels   = pp.map(d => new Date(d.period))
  packChart.data.datasets = [{
    data: pp.map(d => d.count),
    backgroundColor: colors.packBar,
    borderColor: colors.packBar,
    borderWidth: 1
  }]
  packChart.update()

  // 7) points distribution
  res = await fetch('/api/admin/points-distribution', { credentials: 'include' })
  const hd = await res.json()
  ptsHistChart.data.labels   = hd.map(b => b.label)
  ptsHistChart.data.datasets = [{
    data: hd.map(b => b.count),
    backgroundColor: colors.histBar,
    borderColor: colors.histBar,
    borderWidth: 1
  }]
  ptsHistChart.update()
}

onMounted(async () => {
  // init line charts
  cumChart = new Chart(cumCanvas.value.getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: cumOptions
  })
  pctChart = new Chart(pctCanvas.value.getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: pctOptions
  })
  uniqueChart = new Chart(uniqueCanvas.value.getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: uniqueOptions
  })

  // init bar & histogram charts
  ctoonChart = new Chart(ctoonCanvas.value.getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: barOptions
  })
  packChart = new Chart(packsCanvas.value.getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: barOptions
  })
  ptsHistChart = new Chart(ptsDistCanvas.value.getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [] },
    options: histOptions
  })

  // fetch everything
  await nextTick()
  await fetchData()
})

// re-fetch whenever timeframe changes
watch(selectedTimeframe, fetchData)
</script>

<style scoped>
.chart-container {
  height: 300px;
  position: relative;
  padding: 10px;
}
</style>
