<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />

    <!-- Active Discord % Card -->
    <div class="px-6 py-4 mt-16 md:mt-20">
      <div class="inline-block bg-white shadow rounded p-4 mb-6">
        <h2 class="text-lg font-semibold">Active in Discord</h2>
        <p class="text-2xl font-bold">
          {{ activeDiscord.percentage }}%
          ({{ activeDiscord.count }} of {{ activeDiscord.total }})
        </p>
      </div>
    </div>

    <!-- Timeframe + GroupBy selector -->
    <div class="px-6 py-4 flex flex-wrap items-center gap-4">
      <div class="flex items-center space-x-2">
        <label for="timeframe" class="font-medium">Timeframe:</label>
        <select
          id="timeframe"
          v-model="selectedTimeframe"
          class="border rounded px-2 py-1"
        >
          <option v-for="opt in timeframeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="flex items-center space-x-2">
        <label for="groupBy" class="font-medium">Group by:</label>
        <select
          id="groupBy"
          v-model="groupBy"
          class="border rounded px-2 py-1"
        >
          <option v-for="opt in groupOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
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
          % of Users Buying First cToon within 1 {{ groupUnitLabel }}
        </h2>
        <div class="chart-container"><canvas ref="pctCanvas"></canvas></div>
      </div>

      <!-- 3) Unique Logons -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Unique {{ groupLabel }} Logons</h2>
        <div class="chart-container"><canvas ref="uniqueCanvas"></canvas></div>
      </div>

      <!-- 4) Codes Redeemed (bar) -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Codes Redeemed</h2>
        <div class="chart-container"><canvas ref="codesCanvas"></canvas></div>
      </div>

      <!-- 5) Trades Requested (bar) -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Trades Requested</h2>
        <div class="chart-container"><canvas ref="tradesCanvas"></canvas></div>
      </div>

      <!-- 5) cToons Purchased (bar) -->
      <div>
        <h2 class="text-xl font-semibold mb-2">cToons Purchased</h2>
        <div class="chart-container"><canvas ref="ctoonCanvas"></canvas></div>
      </div>

      <!-- 6) Packs Purchased (bar) -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Packs Purchased</h2>
        <div class="chart-container"><canvas ref="packsCanvas"></canvas></div>
      </div>

      <!-- 4) gToons Clash Games -->
      <div>
        <h2 class="text-xl font-semibold mb-2">gToons Clash Games</h2>
        <h3 class="text-sm text-gray-600 mb-1">
          Total (window): {{ clashTotal }} — Finished: {{ clashPctFinished }}%
        </h3>
        <div class="chart-container mb-6">
          <canvas ref="clashCanvas"></canvas>
        </div>
      </div>

      <!-- Monster Scans -->
      <div>
        <h2 class="text-xl font-semibold mb-2">Monster Scans</h2>
        <div class="chart-container">
          <canvas ref="monsterScansCanvas"></canvas>
        </div>
      </div>

      <!-- 7) Points Distribution (histogram) spans full width -->
      <div class="lg:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-2">
          <h2 class="text-xl font-semibold">Points Distribution</h2>
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center space-x-2 text-sm">
              <span class="font-medium">Bucket size:</span>
              <select v-model.number="pointsBucketSize" class="border rounded px-2 py-1">
                <option v-for="opt in pointsBucketOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </label>
            <div class="flex items-center gap-2 text-sm">
              <button type="button" class="border rounded px-2 py-1" @click="zoomPointsIn">
                Zoom In
              </button>
              <button type="button" class="border rounded px-2 py-1" @click="zoomPointsOut">
                Zoom Out
              </button>
              <button type="button" class="border rounded px-2 py-1" @click="resetPointsZoom">
                Reset
              </button>
            </div>
          </div>
        </div>
        <div class="chart-container"><canvas ref="ptsDistCanvas"></canvas></div>
      </div>

      <!-- 0) Net Points Issued w/ health badge -->
      <div class="lg:col-span-2">
        <h2 class="text-xl font-semibold mb-2 flex items-center">
          Net Points Issued
          <span class="ml-2 text-sm text-gray-500">
            (last {{ netWindowCount }} {{ windowUnitPlural }})
          </span>
          <span
            class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium"
            :class="badgeClass"
          >
            {{ badgeText }}
          </span>
        </h2>

        <!-- suggestions block -->
        <div v-if="netStatus !== 'good'" class="mt-2 p-3 bg-yellow-50 rounded">
          <p class="font-medium mb-1">How to improve:</p>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li v-for="(s,i) in netSuggestions" :key="i">{{ s }}</li>
          </ul>
        </div>

        <div class="chart-container">
          <canvas ref="netCanvas"></canvas>
        </div>
      </div>

      <!-- Spend / Earn Ratio -->
      <div class="lg:col-span-2">
        <h2 class="text-xl font-semibold mb-2 flex items-center">
          Spend / Earn Ratio
          <span class="ml-2 text-sm text-gray-500">
            (last {{ ratioWindowCount }} {{ windowUnitPlural }})
          </span>
          <span
            class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium"
            :class="ratioBadgeClass"
          >
            {{ ratioBadgeText }}
          </span>
        </h2>

        <div v-if="ratioStatus !== 'good'" class="mt-2 p-3 bg-yellow-50 rounded">
          <p class="font-medium mb-1">How to improve:</p>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li v-for="(s,i) in ratioSuggestions" :key="i">{{ s }}</li>
          </ul>
        </div>

        <div class="chart-container">
          <canvas ref="ratioCanvas"></canvas>
        </div>
      </div>

      <!-- 8) Rarity Turnover Rate -->
      <div class="lg:col-span-2">
        <h2 class="text-xl font-semibold mb-2 flex items-center">
          Rarity Turnover Rate
          <span class="ml-2 text-sm text-gray-500">
            (last {{ turnoverWindowCount }} {{ windowUnitPlural }})
          </span>
          <span
            class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium"
            :class="turnoverBadgeClass"
          >
            {{ turnoverBadgeText }}
          </span>
        </h2>

        <!-- healthy ranges subtitle -->
        <div class="text-sm text-gray-500 mb-4">
          <span v-for="(range, rarity) in healthyRanges" :key="rarity" class="mr-6">
            {{ rarity }}: {{ range }}
          </span>
        </div>

        <!-- suggestions if not healthy -->
        <div v-if="turnoverStatus !== 'good'" class="mt-2 p-3 bg-yellow-50 rounded">
          <p class="font-medium mb-1">How to improve:</p>
          <ul class="list-disc list-inside space-y-1 text-sm">
            <li v-for="(s,i) in turnoverSuggestions" :key="i">{{ s }}</li>
          </ul>
        </div>

        <div class="chart-container">
          <canvas ref="turnoverCanvas"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import {
  Chart,
  LineController, LineElement, PointElement,
  BarController, BarElement,
  CategoryScale, LinearScale, TimeScale,
  Title, Tooltip, Legend
} from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import 'chartjs-adapter-date-fns'
import annotationPlugin from 'chartjs-plugin-annotation'
import Nav from '@/components/Nav.vue'

// register controllers, scales & plugins
Chart.register(
  LineController, LineElement, PointElement,
  BarController, BarElement,
  CategoryScale, LinearScale, TimeScale,
  Title, Tooltip, Legend, annotationPlugin,
  ChartDataLabels, {
    id: 'resetLabelPosition',
    beforeDatasetsDraw(chart) {
      chart._lastShownLabelX = -Infinity
    }
  }
)

// auth/admin guard
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

// --- timeframe & groupBy ---
const timeframeOptions = [
  { value: '1m', label: '1 Month' },
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' }
]
const selectedTimeframe = ref('3m')

const TF_DAYS  = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 }
const TF_WEEKS = { '1m':  4, '3m': 13, '6m':  26, '1y':  52 }
const TF_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }

const groupOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
]
const groupBy = ref('weekly')

const pointsBucketOptions = [
  { value: 500, label: '500' },
  { value: 1000, label: '1,000' },
  { value: 5000, label: '5,000' },
  { value: 10000, label: '10,000' }
]
const pointsBucketSize = ref(1000)
const pointsZoomSpan = ref(null)
const pointsZoomCenter = ref(null)
const pointsFullData = ref({ labels: [], counts: [] })

const groupUnits = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month'
}
const groupUnitLabels = {
  daily: 'Day',
  weekly: 'Week',
  monthly: 'Month'
}
const groupLabels = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly'
}
const windowUnitPlurals = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months'
}

// derived labels/units
const groupUnit = computed(() => groupUnits[groupBy.value] || 'day')
const groupUnitLabel = computed(() => groupUnitLabels[groupBy.value] || 'Day')
const groupLabel = computed(() => groupLabels[groupBy.value] || 'Daily')
const windowUnitPlural = computed(() => windowUnitPlurals[groupBy.value] || 'days')

// Active Discord meta
const activeDiscord = ref({ percentage: 0, count: 0, total: 0 })

// canvas refs
const cumCanvas     = ref(null)
const pctCanvas     = ref(null)
const uniqueCanvas  = ref(null)
const clashCanvas   = ref(null)
const tradesCanvas  = ref(null)
const netCanvas     = ref(null)
const codesCanvas   = ref(null)
const ctoonCanvas   = ref(null)
const packsCanvas   = ref(null)
const ptsDistCanvas = ref(null)
const ratioCanvas   = ref(null)
const turnoverCanvas= ref(null)
const monsterScansCanvas = ref(null)

// window counts
const netWindowCount      = ref(0)
const ratioWindowCount    = ref(0)
const turnoverWindowCount = ref(0)

const clashTotal       = ref(0)
const clashFinished    = ref(0)
const clashPctFinished = ref(0)

// rarity turnover state/badges
const turnoverStatus      = ref('good')
const turnoverSuggestions = ref([])

const turnoverBadgeClass = computed(() => ({
  good:    'bg-green-100 text-green-800',
  caution: 'bg-yellow-100 text-yellow-800',
  danger:  'bg-red-100 text-red-800'
})[turnoverStatus.value])

const turnoverBadgeText = computed(() => ({
  good:    'Healthy',
  caution: 'Caution',
  danger:  'Danger'
})[turnoverStatus.value])

const healthyRanges = {
  Common:    '≥10%',
  Uncommon:  '≥8%',
  Rare:      '≥5%',
  'Very Rare':'≥3%',
  'Crazy Rare':'≥2%'
}

// net points badges
const netStatus      = ref('good')
const netSuggestions = ref([])

const badgeClass = computed(() => ({
  good:    'bg-green-100 text-green-800',
  caution: 'bg-yellow-100 text-yellow-800',
  danger:  'bg-red-100 text-red-800'
}[netStatus.value]))

const badgeText = computed(() => ({
  good:    'Healthy',
  caution: 'Caution',
  danger:  'Danger'
}[netStatus.value]))

// ratio badges
const ratioStatus      = ref('good')
const ratioSuggestions = ref([])

const ratioBadgeClass = computed(() => ({
  good:    'bg-green-100 text-green-800',
  caution: 'bg-yellow-100 text-yellow-800',
  danger:  'bg-red-100 text-red-800'
})[ratioStatus.value])

const ratioBadgeText = computed(() => ({
  good:    'Healthy',
  caution: 'Caution',
  danger:  'Danger'
})[ratioStatus.value])

// Chart instances
let cumChart, pctChart, uniqueChart,
    codesChart, ctoonChart, packChart, ptsHistChart, clashChart, tradesChart,
    netChart, ratioChart, turnoverChart, monsterScansChart

// --- color palette ---
const colors = {
  line:      '#4F46E5', // Indigo
  codesBar:  '#EF4444', // Red
  ctoonBar:  '#10B981', // Emerald
  tradesBar: '#D946EF',
  clashBar:  '#8B5CF6',
  packBar:   '#3B82F6', // Blue
  histBar:   '#F59E0B', // Amber
  earnedBar: '#22C55E', // Green
  spentBar:  '#EF4444', // Red
  netLine:   '#111827', // Slate-900
  maLine:    '#FACC15', // Yellow
  scanBar:   '#F97316', // Orange
  scanLine:  '#0EA5E9'  // Sky
}
colors.turnover = {
  Common:    '#9CA3AF',
  Uncommon:  '#3B82F6',
  Rare:      '#8B5CF6',
  'Very Rare':'#F59E0B',
  'Crazy Rare':'#EF4444'
}

// --- chart options (base) ---
const commonLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } }
}

const pctOptions = {
  ...commonLineOptions,
  scales: {
    x: { type: 'time', offset: true, time: { unit: 'day', tooltipFormat: 'PP' }, title: { color: '#000', display: true, text: 'Day' }, ticks: {color: '#000'} },
    y: {
      title: { color: '#000', display: true, text: '% First cToon Purchase' },
      ticks: { callback: v => v + '%', color: '#000' },
      min: 0, max: 100
    }
  }
}

const ratioOptions = {
  responsive: true,
  maintainAspectRatio: false,
  spanGaps: false,
  scales: {
    x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PP' }, title: { color: '#000', display: true, text: 'Day' }, ticks: {color: '#000'} },
    y: { title: { color: '#000', display: true, text: 'Spend / Earn Ratio' }, min: 0, ticks: { color: '#000' } }
  },
  plugins: {
    legend: { display: false },
    annotation: {
      annotations: {
        bandLow:  { type: 'line', yMin: 0.9, yMax: 0.9, scaleID: 'y', borderColor: 'rgba(0,0,0,0.25)', borderWidth: 1, label:{enabled:true, content:'0.9'} },
        bandHigh: { type: 'line', yMin: 1.1, yMax: 1.1, scaleID: 'y', borderColor: 'rgba(0,0,0,0.25)', borderWidth: 1, label:{enabled:true, content:'1.1'} },
        oneLine:  { type: 'line', yMin: 1.0, yMax: 1.0, scaleID: 'y', borderColor: 'green', borderWidth: 2, label:{enabled:true, content:'1.0'} }
      }
    }
  }
}

const uniqueOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      anchor: 'center',
      align:  'top',
      offset: 4,
      display: ctx => {
        const chart  = ctx.chart
        const xScale = chart.scales.x
        const labels = chart.data.labels
        if (ctx.dataIndex === 0) return true
        const currX = xScale.getPixelForValue(labels[ctx.dataIndex])
        const prevX = xScale.getPixelForValue(labels[ctx.dataIndex - 1])
        return Math.abs(currX - prevX) > 30
      }
    }
  },
  scales: {
    x: {
      type: 'time',
      offset: true,
      time: { unit: 'day', tooltipFormat: 'PP' },
      title: { color: '#000', display: true, text: 'Day' },
      ticks: { color: '#000' }
    },
    y: {
      title: { color: '#000', display: true, text: 'Unique Logons' },
      min: 0,               // <-- forces axis to start at 0
      // or: beginAtZero: true
      ticks: { color: '#000' }
    }
  }
}


const netOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { type: 'time', offset: true, time: { unit: 'day', tooltipFormat: 'PP' }, title: { color: '#000', display: true, text: 'Day' }, ticks: { color: '#000' } },
    yLeft: { title: { color: '#000', display: true, text: 'Net Points' }, beginAtZero: true, stacked: false, ticks: { color: '#000' } },
    yRight:{ color: '#000', position: 'right', title: { color: '#000', display: true, text: 'Earned / Spent' }, beginAtZero: true, stacked: true, grid: { drawOnChartArea: false }, ticks: { color: '#000' } }
  },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      onClick: (e, legendItem, legend) => {
        const ci  = legend.chart
        const idx = legendItem.datasetIndex
        const meta= ci.getDatasetMeta(idx)
        meta.hidden = !meta.hidden
        ci.update()
      }
    },
    annotation: {
      annotations: {
        zero: { type: 'line', yMin: 0, yMax: 0, scaleID: 'yLeft', borderColor: 'green', borderWidth: 2, label: { enabled: true, content: 'Zero' } }
      }
    }
  }
}

// Clash games
const clashOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { type: 'time', offset: true, time: { unit: 'day', tooltipFormat: 'PP', displayFormats: { day: 'MMM d', week: 'MMM d' } }, title: { color: '#000', display: true, text: 'Day' },
      ticks: { color: '#000', source: 'labels', autoSkip: true, maxRotation: 45, minRotation: 45 } },
    y:  { title: { color: '#000', display: true, text: 'Games Played' }, beginAtZero: true, ticks: { color: '#000' } },
    y1: { position: 'right', title: { color: '#000', display: true, text: '% Finished' }, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%', color: '#000' }, min: 0, max: 100 }
  },
  plugins: { legend: { position: 'top' } }
}

const monsterScansOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: { type: 'time', offset: true, time: { unit: 'day', tooltipFormat: 'PP', displayFormats: { day: 'MMM d', week: 'MMM d' } }, title: { color: '#000', display: true, text: 'Day' },
      ticks: { color: '#000', source: 'labels', autoSkip: true, maxRotation: 45, minRotation: 45 } },
    y:  { title: { color: '#000', display: true, text: 'Scans' }, beginAtZero: true, ticks: { color: '#000' } },
    y1: { position: 'right', title: { color: '#000', display: true, text: 'Unique Users' }, grid: { drawOnChartArea: false }, beginAtZero: true, ticks: { color: '#000' } }
  },
  plugins: { legend: { position: 'top' } }
}

// cumulative users
const cumOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: {
      anchor:  'center',
      align:   'bottom',
      offset:  4,
      display: ctx => {
        const chart  = ctx.chart
        const xScale = chart.scales.x
        const labels = chart.data.labels
        if (ctx.dataIndex === 0) return true
        const currX = xScale.getPixelForValue(labels[ctx.dataIndex])
        const prevX = xScale.getPixelForValue(labels[ctx.dataIndex - 1])
        return Math.abs(currX - prevX) > 30
      }
    }
  },
  scales: {
    x: { type: 'time', time: { unit: 'week', tooltipFormat: 'PP' }, title: { color: '#000', display: true, text: 'Week' }, ticks: {color: '#000'} },
    y: { title: { color: '#000', display: true, text: 'Cumulative Users' }, ticks: { color: '#000' } }
  }
}

// shared bar options
const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { anchor: 'center', align: 'center', color: '#ffffff', font: { color: '#000', weight: 'bold' } }, 
  },
  scales: {
    x: { type: 'time', offset: true, time: { unit: 'day', tooltipFormat: 'PP', displayFormats: { day: 'MMM d', week: 'MMM d' } }, title: { color: '#000', display: true, text: 'Day' },
      ticks: { color: '#000', source: 'labels', autoSkip: true, maxRotation: 45, minRotation: 45 } },
    y: { title: { color: '#000', display: true, text: 'Count' }, beginAtZero: true, ticks: {color: '#000'} }
  }
}

// histogram
const histOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, datalabels: { anchor: 'center', align: 'center', color: '#ffffff', font: { weight: 'bold' } } },
  scales: { x: { title: { color: '#000', display: true, text: 'Points Range' }, ticks: { color: '#000' } }, y: { title: { color: '#000', display: true, text: 'Users' }, beginAtZero: true, ticks: { color: '#000' } } },
  onClick: (_evt, elements) => {
    if (!elements?.length) return
    pointsZoomCenter.value = elements[0].index
    applyPointsZoom()
  }
}

// --- helpers ---
const dateOf = (d) => new Date(d.period || d.day || d.week || d.month || d.date)

function applyTimeUnit () {
  const unit  = groupUnit.value
  const label = groupUnitLabel.value
  const set = (chart) => {
    if (!chart?.options?.scales?.x) return
    chart.options.scales.x.time.unit = unit
    if (chart.options.scales.x.title) chart.options.scales.x.title.text = label
    const df = chart.options.scales.x.time.displayFormats || {}
    const defaultFormat = unit === 'month' ? 'MMM yyyy' : 'MMM d'
    df[unit] = df[unit] || defaultFormat
    chart.options.scales.x.time.displayFormats = df
    chart.update('none')
  }
  ;[cumChart, pctChart, uniqueChart, codesChart, ctoonChart, tradesChart, packChart, clashChart, monsterScansChart, netChart, ratioChart].forEach(set)
}

function applyPointsZoom () {
  if (!ptsHistChart) return
  const total = pointsFullData.value.labels.length
  if (!total) return

  const span = pointsZoomSpan.value
  if (!span || span >= total) {
    ptsHistChart.options.scales.x.min = undefined
    ptsHistChart.options.scales.x.max = undefined
  } else {
    const center = pointsZoomCenter.value ?? 0
    let min = Math.max(0, Math.floor(center - span / 2))
    let max = Math.min(total - 1, min + span - 1)
    min = Math.max(0, max - span + 1)
    ptsHistChart.options.scales.x.min = min
    ptsHistChart.options.scales.x.max = max
  }
  ptsHistChart.update('none')
}

function zoomPointsIn () {
  const total = pointsFullData.value.labels.length
  if (!total) return
  if (pointsZoomCenter.value == null) pointsZoomCenter.value = 0
  const current = pointsZoomSpan.value ?? total
  const next = Math.max(5, Math.floor(current * 0.6))
  pointsZoomSpan.value = next >= total ? null : next
  applyPointsZoom()
}

function zoomPointsOut () {
  const total = pointsFullData.value.labels.length
  if (!total) return
  if (pointsZoomCenter.value == null) pointsZoomCenter.value = 0
  const current = pointsZoomSpan.value ?? total
  const next = Math.min(total, Math.ceil(current * 1.4))
  pointsZoomSpan.value = next >= total ? null : next
  applyPointsZoom()
}

function resetPointsZoom () {
  pointsZoomSpan.value = null
  pointsZoomCenter.value = null
  applyPointsZoom()
}

async function fetchPointsDistribution () {
  const res = await fetch(`/api/admin/points-distribution?bucketSize=${pointsBucketSize.value}`, { credentials: 'include' })
  const hd = await res.json()
  const labels = hd.map(b => b.label)
  const counts = hd.map(b => b.count)
  pointsFullData.value = { labels, counts }
  ptsHistChart.data.labels   = labels
  ptsHistChart.data.datasets = [{
    data: counts,
    backgroundColor: colors.histBar,
    borderColor: colors.histBar,
    borderWidth: 1
  }]
  ptsHistChart.update()
  resetPointsZoom()
}

// --- fetch & populate ---
async function fetchData() {
  const groupParam = `&groupBy=${groupBy.value}`

  // 1) cumulative users
  let res = await fetch(`/api/admin/cumulative-users?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  let data = await res.json()
  cumChart.data.labels   = data.map(d => dateOf(d))
  cumChart.data.datasets = [{
    data: data.map(d => d.cumulative),
    borderColor: colors.line,
    backgroundColor: colors.line,
    borderWidth: 2,
    fill: false
  }]
  cumChart.update()

  // trades requested
  res = await fetch(`/api/admin/trades-requested?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  const tr = await res.json()
  tradesChart.data.labels   = tr.map(d => dateOf(d))
  tradesChart.data.datasets = [{
    data: tr.map(d => d.count),
    backgroundColor: colors.tradesBar,
    borderColor:     colors.tradesBar,
    borderWidth: 1
  }]
  tradesChart.update()

  // Net Points Issued (earned/spent bars + net lines)
  res = await fetch(`/api/admin/net-points-issues?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  const np = await res.json()
  const tfByGroup = {
    daily: TF_DAYS,
    weekly: TF_WEEKS,
    monthly: TF_MONTHS
  }
  netWindowCount.value = (tfByGroup[groupBy.value] || TF_DAYS)[selectedTimeframe.value]

  const netSeries = (np.daily || np.series || [])
  netChart.data.labels               = netSeries.map(d => dateOf(d))
  netChart.data.datasets[0].data     = netSeries.map(d => d.earned ?? 0)      // Earned bar
  netChart.data.datasets[1].data     = netSeries.map(d => (d.spent ?? 0))     // Spent bar
  netChart.data.datasets[2].data     = netSeries.map(d => d.net ?? d.netPoints ?? 0) // Net line
  netChart.data.datasets[3].data     = netSeries.map(d => d.net_ma7 ?? d.movingAvg7Day ?? 0) // MA line
  netChart.update()

  // Health badge off 7-period MA of net
  const last = netSeries[netSeries.length - 1] || null
  const avg7 = last ? (last.net_ma7 ?? last.movingAvg7Day ?? 0) : 0
  const healthyThreshold = 500
  const cautionThreshold = 1000
  if (Math.abs(avg7) <= healthyThreshold) {
    netStatus.value = 'good'
    netSuggestions.value = []
  } else if (Math.abs(avg7) <= cautionThreshold) {
    netStatus.value = 'caution'
    netSuggestions.value = avg7 > 0
      ? [
          `7-period net avg ${avg7}. Reduce supply:`,
          'Increase point sinks',
          'Offer high-cost cosmetics',
          'Run point-burn events'
        ]
      : [
          `7-period net avg ${avg7}. Boost supply:`,
          'Earn-focused events',
          'Lower pack prices or fees',
          'Time-limited bonuses'
        ]
  } else {
    netStatus.value = 'danger'
    netSuggestions.value = avg7 > 0
      ? [
          `7-period net avg ${avg7}. Immediate burn:`,
          'Premium limited items',
          'Raise auction fees',
          'Large point-burn events'
        ]
      : [
          `7-period net avg ${avg7}. Immediate injection:`,
          'Double/triple points',
          'Pause major sinks',
          'Generous referral rewards'
        ]
  }

  // % first purchase
  res = await fetch(`/api/admin/percentage-first-purchase?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  data = await res.json()
  pctChart.data.labels   = data.map(d => dateOf(d))
  pctChart.data.datasets = [{
    data: data.map(d => d.percentage),
    borderColor: colors.line,
    backgroundColor: colors.line,
    borderWidth: 2,
    fill: false
  }]
  pctChart.update()

  // unique logins
  res = await fetch(`/api/admin/unique-logins?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  data = await res.json()
  uniqueChart.data.labels   = data.map(d => dateOf(d))
  uniqueChart.data.datasets = [{
    data: data.map(d => d.count),
    borderColor: colors.line,
    backgroundColor: colors.line,
    borderWidth: 2,
    fill: false
  }]
  uniqueChart.update()

  // active Discord
  res = await fetch('/api/admin/active-discord', { credentials: 'include' })
  const ad = await res.json()
  activeDiscord.value = {
    percentage: Math.round((ad.active / ad.total) * 100),
    count: ad.active,
    total: ad.total
  }

  // Clash stats
  res = await fetch(`/api/admin/clash-stats?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  const cs = await res.json()
  const total    = cs.reduce((s, d) => s + (d.count || 0), 0)
  const finished = cs.reduce((s, d) => s + (d.finishedCount || 0), 0)
  clashTotal.value       = total
  clashFinished.value    = finished
  clashPctFinished.value = total ? Math.round((finished / total) * 100) : 0
  clashChart.data.labels = cs.map(s => dateOf(s))
  clashChart.data.datasets = [
    {
      type: 'bar',
      label: 'Games Played',
      data: cs.map(s => s.count),
      yAxisID: 'y',
      backgroundColor: colors.clashBar,
      borderColor: colors.clashBar,
      borderWidth: 1,
      order: 1,
      datalabels: { anchor: 'center', align: 'center', color: '#ffffff', font: { weight: 'bold' } }
    },
    {
      type: 'line',
      label: '% Finished',
      data: cs.map(s => s.percentFinished),
      yAxisID: 'y1',
      borderColor: '#FACC15',
      backgroundColor: '#FACC15',
      fill: false,
      tension: 0.3,
      order: 0,
      pointBackgroundColor: '#FACC15',
      datalabels: { anchor: 'end', align: 'top', color: '#222222', font: { weight: 'bold' } }
    }
  ]
  clashChart.update()

  // Monster scans
  res = await fetch(`/api/admin/monster-scans?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  const ms = await res.json()
  monsterScansChart.data.labels = ms.map(d => dateOf(d))
  monsterScansChart.data.datasets = [
    {
      type: 'bar',
      label: 'Scans',
      data: ms.map(d => d.scans ?? 0),
      yAxisID: 'y',
      backgroundColor: colors.scanBar,
      borderColor: colors.scanBar,
      borderWidth: 1,
      order: 1,
      datalabels: { anchor: 'center', align: 'center', color: '#ffffff', font: { weight: 'bold' } }
    },
    {
      type: 'line',
      label: 'Unique Users',
      data: ms.map(d => d.uniqueUsers ?? 0),
      yAxisID: 'y1',
      borderColor: colors.scanLine,
      backgroundColor: colors.scanLine,
      fill: false,
      tension: 0.3,
      order: 0,
      pointBackgroundColor: colors.scanLine,
      datalabels: { anchor: 'end', align: 'top', color: '#222222', font: { weight: 'bold' } }
    }
  ]
  monsterScansChart.update()

  // Spend / Earn Ratio (ratio and MA(spend)/MA(earn))
  res = await fetch(`/api/admin/spend-earn-ratio?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  const sr = await res.json()
  ratioWindowCount.value = (tfByGroup[groupBy.value] || TF_DAYS)[selectedTimeframe.value]

  const ratioSeries = (sr.daily || sr.series || [])
  ratioChart.data.labels           = ratioSeries.map(d => dateOf(d))
  ratioChart.data.datasets[0].data = ratioSeries.map(d => d.spendEarnRatio)              // per-period ratio
  ratioChart.data.datasets[1].data = ratioSeries.map(d => d.movingAvg7Day ?? null)       // MA ratio
  ratioChart.update()

  const lastEntry = ratioSeries[ratioSeries.length - 1] || {}
  const avg7forRatio = lastEntry.movingAvg7Day ?? null

  if (avg7forRatio != null && avg7forRatio >= 0.9 && avg7forRatio <= 1.1) {
    ratioStatus.value      = 'good'
    ratioSuggestions.value = []
  } else if (avg7forRatio != null && avg7forRatio >= 0.75 && avg7forRatio <= 1.25) {
    ratioStatus.value = 'caution'
    if (avg7forRatio < 1.0) {
      ratioSuggestions.value = [
        `7-period ratio ${avg7forRatio.toFixed(3)} below 1.0. Increase spending or reduce sinks:`,
        'Bonus quests and referrals',
        'Temporary fee reductions',
        'Short double-points windows'
      ]
    } else {
      ratioSuggestions.value = [
        `7-period ratio ${avg7forRatio.toFixed(3)} above 1.0. Add sinks:`,
        'Time-boxed cosmetics',
        'Burn-and-earn events',
        'Low-cost burn challenges'
      ]
    }
  } else {
    ratioStatus.value = 'danger'
    if (avg7forRatio == null || avg7forRatio < 0.75) {
      ratioSuggestions.value = [
        `Ratio very low${avg7forRatio==null ? '' : ` (${avg7forRatio.toFixed(3)})`}. Boost earning now:`,
        'Large event bonuses',
        'Pause major sinks',
        'Generous referrals'
      ]
    } else {
      ratioSuggestions.value = [
        `Ratio very high (${avg7forRatio.toFixed(3)}). Remove points quickly:`,
        'Premium limited items',
        'Raise auction fees',
        'Large burn events'
      ]
    }
  }

  // codes redeemed
  res = await fetch(`/api/admin/codes-redeemed?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  let cr = await res.json()
  codesChart.data.labels   = cr.map(d => dateOf(d))
  codesChart.data.datasets = [{
    data: cr.map(d => d.count),
    backgroundColor: colors.codesBar,
    borderColor: colors.codesBar,
    borderWidth: 1
  }]
  codesChart.update()

  // cToons purchased
  res = await fetch(`/api/admin/purchases?method=ctoon&timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  let pd = await res.json()
  if (pd.ctoonPurchases) pd = pd.ctoonPurchases
  ctoonChart.data.labels   = pd.map(d => dateOf(d))
  ctoonChart.data.datasets = [{
    data: pd.map(d => d.count),
    backgroundColor: colors.ctoonBar,
    borderColor: colors.ctoonBar,
    borderWidth: 1
  }]
  ctoonChart.update()

  // packs purchased
  res = await fetch(`/api/admin/purchases?method=pack&timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  let pp = await res.json()
  if (pp.packPurchases) pp = pp.packPurchases
  packChart.data.labels   = pp.map(d => dateOf(d))
  packChart.data.datasets = [{
    data: pp.map(d => d.count),
    backgroundColor: colors.packBar,
    borderColor: colors.packBar,
    borderWidth: 1
  }]
  packChart.update()

  // points distribution
  await fetchPointsDistribution()

  // rarity turnover
  res = await fetch(`/api/admin/rarity-turnover-rate?timeframe=${selectedTimeframe.value}${groupParam}`, { credentials: 'include' })
  const turnrate = await res.json()
  const turnoverCounts = {
    daily: turnrate.days,
    weekly: turnrate.weeks,
    monthly: turnrate.months
  }
  turnoverWindowCount.value = turnoverCounts[groupBy.value] ?? turnrate.days ?? turnrate.weeks ?? turnrate.months ?? 0

  turnoverChart.data.labels = turnrate.data.map(d => d.rarity)
  turnoverChart.data.datasets[0].data = turnrate.data.map(d => d.turnoverRate)
  turnoverChart.data.datasets[0].backgroundColor = turnrate.data.map(d => colors.turnover[d.rarity])
  turnoverChart.data.datasets[0].borderColor     = turnrate.data.map(d => colors.turnover[d.rarity])
  turnoverChart.update()

  // turnover health
  const avg = turnrate.data.reduce((s,d) => s + d.turnoverRate, 0) / Math.max(1, turnrate.data.length)
  const healthyT = 0.05
  const cautionT = 0.02
  if (avg >= healthyT) {
    turnoverStatus.value = 'good'
    turnoverSuggestions.value = []
  } else if (avg >= cautionT) {
    turnoverStatus.value = 'caution'
    turnoverSuggestions.value = [
      `Avg turnover ${(avg*100).toFixed(1)}% < 5%. Boost trading:`,
      'Quests that reward Rare/V.Rare trading',
      'Winball drops to spur swaps',
      'Fee coupons for Crazy Rare trades'
    ]
  } else {
    turnoverStatus.value = 'danger'
    turnoverSuggestions.value = [
      `Turnover ${(avg*100).toFixed(1)}% < 2%. Immediate actions:`,
      'Limited-edition auctions with bid fees',
      '24h triple-points on any trade',
      'Temporarily waive trade sinks'
    ]
  }
}

onMounted(async () => {
  // init line charts
  cumChart    = new Chart(cumCanvas.value.getContext('2d'),    { type: 'line', data: { labels: [], datasets: [] }, options: cumOptions })
  pctChart    = new Chart(pctCanvas.value.getContext('2d'),    { type: 'line', data: { labels: [], datasets: [] }, options: pctOptions })
  uniqueChart = new Chart(uniqueCanvas.value.getContext('2d'), { type: 'line', data: { labels: [], datasets: [] }, options: uniqueOptions })

  // init bars & histogram
  codesChart  = new Chart(codesCanvas.value.getContext('2d'),  { type: 'bar',  data: { labels: [], datasets: [] }, options: barOptions })
  ctoonChart  = new Chart(ctoonCanvas.value.getContext('2d'),  { type: 'bar',  data: { labels: [], datasets: [] }, options: barOptions })
  tradesChart = new Chart(tradesCanvas.value.getContext('2d'), { type: 'bar',  data: { labels: [], datasets: [] }, options: barOptions })
  packChart   = new Chart(packsCanvas.value.getContext('2d'),  { type: 'bar',  data: { labels: [], datasets: [] }, options: barOptions })
  ptsHistChart= new Chart(ptsDistCanvas.value.getContext('2d'),{ type: 'bar',  data: { labels: [], datasets: [] }, options: histOptions })
  clashChart  = new Chart(clashCanvas.value.getContext('2d'),  { data: { labels: [], datasets: [] }, options: clashOptions })
  monsterScansChart = new Chart(monsterScansCanvas.value.getContext('2d'), { data: { labels: [], datasets: [] }, options: monsterScansOptions })

  // spend/earn ratio chart
  ratioChart = new Chart(ratioCanvas.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Per-period ratio', data: [], borderColor: '#6366F1', borderWidth: 2, fill: false, datalabels: { anchor: 'end', align: 'top' } },
        { label: '7-period MA ratio', data: [], borderColor: colors.maLine, borderWidth: 2, borderDash: [5, 5], fill: false, datalabels: { anchor: 'start', align: 'bottom' } }
      ]
    },
    options: {
      ...ratioOptions,
      plugins: {
        ...ratioOptions.plugins,
        legend: {
          display: true,
          position: 'top',
          onClick: (e, legendItem, legend) => {
            const chart = legend.chart
            const idx   = legendItem.datasetIndex
            const meta  = chart.getDatasetMeta(idx)
            meta.hidden = !meta.hidden
            chart.update()
          }
        }
      }
    }
  })

  // turnover chart
  turnoverChart = new Chart(turnoverCanvas.value.getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [{
      data: [],
      backgroundColor: [],
      borderColor:  [],
      borderWidth: 1,
      datalabels: { anchor: 'end', align: 'top', formatter: v => (v * 100).toFixed(1) + '%' }
    }]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, datalabels: {} },
      scales: {
        x: { title: { color: '#000', display: true, text: 'Rarity' } },
        y: {
          title: { color: '#000', display: true, text: 'Turnover Rate' },
          ticks: { callback: v => (v * 100).toFixed(0) + '%', color: '#000' },
          beginAtZero: true
        }
      }
    },
    plugins: [ ChartDataLabels ]
  })

  // net chart (earned/spent stacked bars + net lines)
  netChart = new Chart(netCanvas.value.getContext('2d'), {
    data: {
      labels: [],
      datasets: [
        { type: 'bar',  label: 'Earned', data: [], backgroundColor: colors.earnedBar, borderColor: colors.earnedBar, yAxisID: 'yRight', stack: 'points', hidden: true,
          datalabels: { anchor: 'center', align: 'center', color: '#ffffff', font: { weight: 'bold' } } },
        { type: 'bar',  label: 'Spent',  data: [], backgroundColor: colors.spentBar,  borderColor: colors.spentBar,  yAxisID: 'yRight', stack: 'points', hidden: true,
          datalabels: { anchor: 'center', align: 'center', color: '#ffffff', font: { weight: 'bold' } } },
        { type: 'line', label: 'Net',    data: [], borderColor: colors.netLine, backgroundColor: colors.netLine, borderWidth: 2, fill: false, yAxisID: 'yLeft',
          datalabels: { anchor: 'end', align: 'top' } },
        { type: 'line', label: '7-period MA (Net)', data: [], borderColor: colors.maLine, backgroundColor: colors.maLine, borderWidth: 2, fill: false, borderDash: [5,5], yAxisID: 'yLeft',
          datalabels: { anchor: 'start', align: 'bottom' } }
      ]
    },
    options: netOptions
  })


  // apply initial grouping
  applyTimeUnit()

  // fetch
  await nextTick()
  await fetchData()
})

// re-fetch on changes
watch([selectedTimeframe, groupBy], async () => {
  if (!netChart) return
  applyTimeUnit()
  ;[cumChart, pctChart, uniqueChart, codesChart, ctoonChart, tradesChart, packChart, clashChart, monsterScansChart, netChart, ratioChart].forEach(ch => {
    if (!ch) return
    ch.data.labels = []
    ch.data.datasets.forEach(ds => (ds.data = []))
    ch.update('none')
  })
  await fetchData()
})

watch(pointsBucketSize, async () => {
  if (!ptsHistChart) return
  await fetchPointsDistribution()
})
</script>


<style scoped>
.chart-container {
  height: 300px;
  position: relative;
  padding: 10px;
}
</style>
