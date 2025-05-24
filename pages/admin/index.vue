<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />

    <div class="px-6 py-4 flex items-center space-x-4 mt-16">
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

    <div class="px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Cumulative Users -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Cumulative Users</h2>
        <div class="chart-container">
          <canvas ref="cumCanvas"></canvas>
        </div>
      </div>

      <!-- % First Purchase -->
      <div>
        <h2 class="text-xl font-semibold mb-2">
          % of Users Buying First cToon within 1 Day
        </h2>
        <div class="chart-container">
          <canvas ref="pctCanvas"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import 'chartjs-adapter-date-fns'

// Register controllers, elements, scales & plugins
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend
)

// Restrict page to authenticated admins
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

// --- State & refs ---
const timeframeOptions = [
  { value: '1m', label: '1 Month' },
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' }
]
const selectedTimeframe = ref('3m')

const cumCanvas = ref(null)
const pctCanvas = ref(null)
let cumChart = null
let pctChart = null

// Chart.js options
const cumOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: { unit: 'week', tooltipFormat: 'PP' },
      title: { display: true, text: 'Week' }
    },
    y: {
      title: { display: true, text: 'Cumulative Users' }
    }
  },
  plugins: { legend: { display: false } }
}
const pctOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: { unit: 'week', tooltipFormat: 'PP' },
      title: { display: true, text: 'Week' }
    },
    y: {
      title: { display: true, text: '% First cToon Purchase' },
      ticks: { callback: (v) => v + '%' },
      min: 0,
      max: 100
    }
  },
  plugins: { legend: { display: false } }
}

// --- Fetch and render data ---
async function fetchData() {
  // 1) Cumulative users
  const cumRes = await fetch(
    `/api/admin/cumulative-users?timeframe=${selectedTimeframe.value}`,
    { credentials: 'include' }
  )
  const cumData = await cumRes.json()
  cumChart.data.labels = cumData.map(d => new Date(d.week))
  cumChart.data.datasets = [{
    label: 'Users',
    data: cumData.map(d => d.cumulative),
    borderWidth: 2,
    fill: false
  }]
  cumChart.update()

  // 2) % First purchase
  const pctRes = await fetch(
    `/api/admin/percentage-first-purchase?timeframe=${selectedTimeframe.value}`,
    { credentials: 'include' }
  )
  const pctData = await pctRes.json()
  pctChart.data.labels = pctData.map(d => new Date(d.week))
  pctChart.data.datasets = [{
    label: '% Buying in 1 Day',
    data: pctData.map(d => d.percentage),
    borderWidth: 2,
    fill: false
  }]
  pctChart.update()
}

onMounted(async () => {
  // initialize both charts
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

  // wait for DOM render, then load data
  await nextTick()
  await fetchData()
})

// refetch whenever timeframe changes
watch(selectedTimeframe, fetchData)
</script>

<style scoped>
.chart-container {
  height: 300px;
  position: relative;
}
</style>
