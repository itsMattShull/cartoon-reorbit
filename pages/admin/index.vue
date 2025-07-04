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
        <div class="chart-container mb-6">
          <canvas ref="clashCanvas"></canvas>
        </div>
      </div>

      <!-- 7) Points Distribution (histogram) spans full width -->
      <div class="lg:col-span-2">
        <h2 class="text-xl font-semibold mb-2">Points Distribution</h2>
        <div class="chart-container"><canvas ref="ptsDistCanvas"></canvas></div>
      </div>

      <!-- 0) Net Points Issued w/ health badge -->
      <div class="lg:col-span-2">
        <h2 class="text-xl font-semibold mb-2 flex items-center">
          Net Points Issued
          <span class="ml-2 text-sm text-gray-500">
            (last {{ netWindowDays }} days)
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
            (last {{ ratioWindowDays }} days)
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
            (last {{ turnoverWindowDays }} days)
          </span>
          <span
            class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium"
            :class="turnoverBadgeClass"
          >
            {{ turnoverBadgeText }}
          </span>
        </h2>

        <!-- NEW: healthy‐ranges subtitle -->
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
const clashCanvas   = ref(null)
const tradesCanvas  = ref(null)
const netCanvas    = ref(null)
const codesCanvas   = ref(null)
const ctoonCanvas   = ref(null)
const packsCanvas   = ref(null)
const ptsDistCanvas = ref(null)
const netWindowDays = ref(0)
// 1) New refs & state
const turnoverCanvas      = ref(null)
const turnoverWindowDays  = ref(0)
const turnoverStatus      = ref('good')   // 'good' | 'caution' | 'danger'
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

const netStatus      = ref('good')   // 'good' | 'caution' | 'danger'
const netSuggestions = ref([])

const badgeClass = computed(() => {
  switch (netStatus.value) {
    case 'good':   return 'bg-green-100 text-green-800'
    case 'caution':return 'bg-yellow-100 text-yellow-800'
    case 'danger': return 'bg-red-100   text-red-800'
  }
})

const badgeText = computed(() => {
  switch (netStatus.value) {
    case 'good':   return 'Healthy'
    case 'caution':return 'Caution'
    case 'danger': return 'Danger'
  }
})

const ratioCanvas     = ref(null)
const ratioWindowDays = ref(0)
const ratioStatus     = ref('good')    // 'good' | 'caution' | 'danger'
const ratioSuggestions= ref([])

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
    codesChart, ctoonChart, packChart, ptsHistChart, clashChart, tradesChart, netChart, ratioChart, turnoverChart

// --- color palette (solid, no opacity) ---
const colors = {
  line:      '#4F46E5', // Indigo
  codesBar:  '#EF4444', // Red
  ctoonBar:  '#10B981', // Emerald
  tradesBar: '#D946EF',
  clashBar:  '#8B5CF6',
  packBar:   '#3B82F6', // Blue
  histBar:   '#F59E0B'  // Amber
}

colors.turnover = {
  Common:    '#9CA3AF', // gray
  Uncommon:  '#3B82F6', // blue
  Rare:      '#8B5CF6', // purple
  'Very Rare':'#F59E0B', // amber
  'Crazy Rare':'#EF4444'  // red
}

// --- chart options ---
const commonLineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } }
}

const pctOptions = {
  ...commonLineOptions,
  scales: {
    x: { type: 'time', offset: true, time: { unit: 'day', tooltipFormat: 'PP' }, title: { display: true, text: 'Day' } },
    y: {
      title: { display: true, text: '% First cToon Purchase' },
      ticks: { callback: v => v + '%' },
      min: 0, max: 100
    }
  }
}

const ratioOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      time: { unit: 'day', tooltipFormat: 'PP' },
      title: { display: true, text: 'Day' }
    },
    y: {
      title: { display: true, text: 'Spend / Earn Ratio' },
      min: 0
    }
  },
  plugins: {
    legend: { display: false },
    annotation: {
      annotations: {
        green: {
          type: 'line', yMin: 1, yMax: 1, scaleID: 'y',
          borderColor: 'green', borderWidth: 2,
          label: { enabled: true, content: '1.0' }
        },
        yellowLow: {
          type: 'line', yMin: 0.9, yMax: 0.9, scaleID: 'y',
          borderColor: 'orange', borderWidth: 1,
          label: { enabled: true, content: '0.9' }
        },
        yellowHigh: {
          type: 'line', yMin: 1.1, yMax: 1.1, scaleID: 'y',
          borderColor: 'orange', borderWidth: 1,
          label: { enabled: true, content: '1.1' }
        },
        redLow: {
          type: 'line', yMin: 0.75, yMax: 0.75, scaleID: 'y',
          borderColor: 'red', borderWidth: 1,
          label: { enabled: true, content: '0.75' }
        },
        redHigh: {
          type: 'line', yMin: 1.25, yMax: 1.25, scaleID: 'y',
          borderColor: 'red', borderWidth: 1,
          label: { enabled: true, content: '1.25' }
        }
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
      anchor: 'center',   // center on the point
      align:  'top',   // push below
      offset: 4,          // a few pixels of breathing room
      display: ctx => {
        const chart = ctx.chart;
        const xScale = chart.scales.x;
        const labels = chart.data.labels;

        // always show the very first point
        if (ctx.dataIndex === 0) return true;

        // get pixel X for this label vs. the previous one
        const currX = xScale.getPixelForValue(labels[ctx.dataIndex]);
        const prevX = xScale.getPixelForValue(labels[ctx.dataIndex - 1]);

        // only show if they’re at least 30px apart
        return Math.abs(currX - prevX) > 30;
      }
    }
  },
  scales: {
    x: {
      type: 'time',
      offset: true,
      time: {
        unit: 'day',
        tooltipFormat: 'PP'
      },
      title: { display: true, text: 'Day' }
    },
    y: {
      title: { display: true, text: 'Unique Daily Logons' }
    }
  }
}

const netOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      type: 'time',
      offset: true,
      time: { unit: 'day', tooltipFormat: 'PP' },
      title: { display: true, text: 'Day' }
    },
    y: {
      title: { display: true, text: 'Net Points Issued' },
      beginAtZero: false
    }
  },
  plugins: {
    legend: {
      display: true,
      position: 'top',     // or 'bottom', 'left', 'right'
      onClick: (e, legendItem, legend) => {
        const ci = legend.chart;
        const idx = legendItem.datasetIndex;
        const meta = ci.getDatasetMeta(idx);
        // toggle hidden flag
        meta.hidden = !meta.hidden;
        ci.update();
      }
    },
    annotation: {
      annotations: {
        greenLine: {
          type: 'line',
          yMin: 0, yMax: 0,
          scaleID: 'y',
          borderColor: 'green',
          borderWidth: 2,
          label: { enabled: true, content: 'Zero' }
        },
        yellowLine: {
          type: 'line',
          yMin: 500, yMax: 500,
          scaleID: 'y',
          borderColor: 'orange',
          borderWidth: 1,
          label: { enabled: true, content: '+500' }
        },
        yellowLineNeg: {
          type: 'line',
          yMin: -500, yMax: -500,
          scaleID: 'y',
          borderColor: 'orange',
          borderWidth: 1,
          label: { enabled: true, content: '-500' }
        },
        redLine: {
          type: 'line',
          yMin: 1000, yMax: 1000,
          scaleID: 'y',
          borderColor: 'red',
          borderWidth: 1,
          label: { enabled: true, content: '+1000' }
        },
        redLineNeg: {
          type: 'line',
          yMin: -1000, yMax: -1000,
          scaleID: 'y',
          borderColor: 'red',
          borderWidth: 1,
          label: { enabled: true, content: '-1000' }
        }
      }
    }
  }
}

// Clash games: bar+line combo
const clashOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    // ← exactly the same X‐axis settings you used for codesChart
    x: {
      type: 'time',
      offset: true,
      time: {
        unit: 'day',
        tooltipFormat: 'PP',
        displayFormats: { day: 'MMM d' }
      },
      title: { display: true, text: 'Day' },
      ticks: {
        source: 'labels',
        autoSkip: true,
        maxRotation: 45,
        minRotation: 45
      }
    },
    y: {
      title: { display: true, text: 'Games Played' },
      beginAtZero: true
    },
    y1: {
      position: 'right',
      title: { display: true, text: '% Finished' },
      grid: { drawOnChartArea: false },
      ticks: { callback: v => v + '%' },
      min: 0,
      max: 100
    }
  },
  plugins: { legend: { position: 'top' } }
}


const cumOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },

    // ← add this block
    datalabels: {
      anchor:  'center',     // center the label on the point
      align:   'bottom',     // put it just under the point
      offset:  4,            // a few pixels away
      display: ctx => {
        const chart = ctx.chart;
        const xScale = chart.scales.x;
        const labels = chart.data.labels;

        // always show the very first point
        if (ctx.dataIndex === 0) return true;

        // get pixel X for this label vs. the previous one
        const currX = xScale.getPixelForValue(labels[ctx.dataIndex]);
        const prevX = xScale.getPixelForValue(labels[ctx.dataIndex - 1]);

        // only show if they’re at least 30px apart
        return Math.abs(currX - prevX) > 30;
      }
    }
  },
  scales: {
    x: {
      type: 'time',
      time: {
        unit:         'week',
        tooltipFormat:'PP'
      },
      title: { display: true, text: 'Week' }
    },
    y: {
      title: { display: true, text: 'Cumulative Users' }
    }
  }
}

// both Codes, cToons & Packs use the same barOptions
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
      offset: true,
      time: {
        unit: 'day',
        tooltipFormat: 'PP',
        displayFormats: { day: 'MMM d' }
      },
      title: { display: true, text: 'Day' },
      ticks: {
        source:    'labels',
        autoSkip: true,
        maxRotation: 45,
        minRotation: 45
      }
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

  // trades requested
  res = await fetch(`/api/admin/trades-requested?timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  const tr = await res.json()
  tradesChart.data.labels   = tr.map(d => new Date(d.period))
  tradesChart.data.datasets = [{
    data: tr.map(d => d.count),
    backgroundColor: colors.tradesBar,
    borderColor:     colors.tradesBar,
    borderWidth: 1
  }]
  tradesChart.update()

  // Net Points Issued
  res = await fetch(
    `/api/admin/net-points-issues?timeframe=${selectedTimeframe.value}`,
    { credentials: 'include' }
  )
  const np = await res.json()
  console.log('np: ', np)
  netWindowDays.value = np.days

  // populate the chart
  netChart.data.labels           = np.daily.map(d => new Date(d.period))
  netChart.data.datasets[0].data = np.daily.map(d => d.netPoints)
  netChart.data.datasets[1].data = np.daily.map(d => d.movingAvg7Day)
  netChart.update()

  // **Compute health status off the 7-day moving average of the latest day**
  const last = np.daily[np.daily.length - 1]
  const avg7 = last ? last.movingAvg7Day : 0

  const healthyThreshold = 500
  const cautionThreshold = 1000

  if (Math.abs(avg7) <= healthyThreshold) {
    // 🎉 Healthy: within ±500 of zero
    netStatus.value = 'good'
    netSuggestions.value = []
  }
  else if (Math.abs(avg7) <= cautionThreshold) {
    // ⚠️ Caution: between ±500 and ±1000
    netStatus.value = 'caution'

    if (avg7 > healthyThreshold) {
      // Slightly too high: net points are above +500
      netSuggestions.value = [
        `Your 7-day avg is **${avg7}**, above the healthy target (should be near 0 ±${healthyThreshold}). To pull it back toward 0:`,
        '• Increase point sinks (raise auction fees or pack prices)',
        '• Launch limited-time, high-cost cosmetics to burn points',
        '• Add small periodic point-burn challenges or raffles'
      ]
    } else {
      // Slightly too low: net points are below −500
      netSuggestions.value = [
        `Your 7-day avg is **${avg7}**, below the healthy target (should be near 0 ±${healthyThreshold}). To boost it up toward 0:`,
        '• Introduce earn-focused events (bonus quests, referral rewards)',
        '• Temporarily lower pack prices or auction fees to spur spending',
        '• Run double-points days or time-limited earn bonuses'
      ]
    }
  }
  else {
    // 🔥 Danger: beyond ±1000
    netStatus.value = 'danger'

    if (avg7 > cautionThreshold) {
      // Way too high
      netSuggestions.value = [
        `Your 7-day avg is **${avg7}**, well above the danger threshold (>±${cautionThreshold}). It should be near 0 ±${healthyThreshold}. Immediately remove points by:`,
        '• Introducing premium limited-edition items with steep point costs',
        '• Significantly raising auction fees or new sink mechanics',
        '• Running high-visibility, large-scale point-burn events'
      ]
    } else {
      // Way too low
      netSuggestions.value = [
        `Your 7-day avg is **${avg7}**, far below the danger threshold (<−${cautionThreshold}). It should be near 0 ±${healthyThreshold}. Immediately inject points by:`,
        '• Granting large event-based point bonuses (double or triple points)',
        '• Temporarily removing or reducing all point sinks',
        '• Offering generous referral or activity rewards'
      ]
    }
  }

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

  // 5) clash stats
  res = await fetch(`/api/admin/clash-stats?timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  const cs = await res.json()
  clashChart.data.labels = cs.map(s => new Date(s.day))
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
      datalabels: {
        anchor: 'center',   // center vertically
        align: 'center',    // center horizontally
        color: '#ffffff',   // white text
        font: { weight: 'bold' }
      }
    },
    {
      type: 'line',
      label: '% Finished',
      data: cs.map(s => s.percentFinished),
      yAxisID: 'y1',
      borderColor: '#FACC15',   // red line
      backgroundColor: '#FACC15',
      fill: false,
      tension: 0.3,
      order: 0,
      pointBackgroundColor: '#FACC15',
      datalabels: {
        anchor: 'end',     // place above the point
        align: 'top',
        color: '#222222',  // dark color for max contrast on light or dark
        font: { weight: 'bold' }
      }
    }
  ]
  clashChart.update()

  res = await fetch(
    `/api/admin/spend-earn-ratio?timeframe=${selectedTimeframe.value}`,
    { credentials: 'include' }
  )
  // --- after fetching your spend/earn series above ---
  const sr = await res.json()
  ratioWindowDays.value = sr.days

  // 1) re-populate the chart with two datasets
  ratioChart.data.labels               = sr.daily.map(d => new Date(d.period))
  ratioChart.data.datasets[0].data     = sr.daily.map(d => d.spendEarnRatio)
  ratioChart.data.datasets[1].data     = sr.daily.map(d => d.movingAvg7Day)
  ratioChart.update()

  // 2) compute health off the 7-day moving avg of the last day
  const lastEntry = sr.daily[sr.daily.length - 1] || { movingAvg7Day: 0 }
  const avg7forRatio      = lastEntry.movingAvg7Day

  if (avg7forRatio >= 0.9 && avg7forRatio <= 1.1) {
    // 🎉 Healthy
    ratioStatus.value      = 'good'
    ratioSuggestions.value = []
  }
  else if (avg7forRatio >= 0.75 && avg7forRatio <= 1.25) {
    // ⚠️ Caution
    ratioStatus.value = 'caution'
    if (avg7forRatio < 0.9) {
      // MA slightly too low → need to inject more points (earn)
      ratioSuggestions.value = [
        `Your 7-day avg is ${avg7forRatio.toFixed(3)}, just below the healthy band (0.9–1.1). To pull it up toward 1.0:`,
        '• Run earn-focused events (bonus quests, referral rewards)',
        '• Temporarily lower pack prices or auction fees to drive more spending',
        '• Offer short-lived double-points days'
      ]
    } else {
      // MA slightly too high → need to sink more points (spend)
      ratioSuggestions.value = [
        `Your 7-day avg is ${avg7forRatio.toFixed(3)}, just above the healthy band (0.9–1.1). To bring it down toward 1.0:`,
        '• Introduce small time-boxed point sinks (new cosmetics or auction fees)',
        '• Run burn-and-earn events that balance give/take',
        '• Add low-cost point-burn challenges'
      ]
    }
  }
  else {
    // 🔥 Danger
    ratioStatus.value = 'danger'
    if (avg7forRatio < 0.75) {
      // MA well under → massive earn needed
      ratioSuggestions.value = [
        `Your 7-day avg is ${avg7forRatio.toFixed(3)}, far below healthy. Urgently boost earning:`,
        '• Add large event-based point bonuses (double/triple points)',
        '• Temporarily pause major point sinks (auctions, high-cost packs)',
        '• Launch generous referral or activity rewards'
      ]
    } else {
      // MA well over → massive sink needed
      ratioSuggestions.value = [
        `Your 7-day avg is ${avg7forRatio.toFixed(3)}, far above healthy. Immediately remove points by:`,
        '• Introducing premium limited-edition items with steep point costs',
        '• Significantly raising auction fees or new sink mechanics',
        '• Running large-scale point-burn events'
      ]
    }
  }

  // 5) codes redeemed
  res = await fetch(`/api/admin/codes-redeemed?timeframe=${selectedTimeframe.value}`, { credentials: 'include' })
  let cr = await res.json()
  codesChart.data.labels   = cr.map(d => new Date(d.period))
  codesChart.data.datasets = [{
    data: cr.map(d => d.count),
    backgroundColor: colors.codesBar,
    borderColor: colors.codesBar,
    borderWidth: 1
  }]
  codesChart.update()

  // 6) cToons purchased
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

  // 7) packs purchased
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

  // 8) points distribution
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

  res = await fetch(
    `/api/admin/rarity-turnover-rate?timeframe=${selectedTimeframe.value}`,
    { credentials: 'include' }
  )

  const turnrate = await res.json()
  turnoverWindowDays.value = turnrate.days

  // populate chart
  turnoverChart.data.labels = turnrate.data.map(d => d.rarity)
  turnoverChart.data.datasets[0].data = turnrate.data.map(d => d.turnoverRate)
  // assign colors per rarity
  turnoverChart.data.datasets[0].backgroundColor =
    turnrate.data.map(d => colors.turnover[d.rarity])
  turnoverChart.data.datasets[0].borderColor =
    turnrate.data.map(d => colors.turnover[d.rarity])
  turnoverChart.update()

  // compute overall health (avg turnover)
  const avg = turnrate.data.reduce((sum,d) => sum + d.turnoverRate, 0) / turnrate.data.length
  const healthyT = 0.05   // 5%
  const cautionT = 0.02   // 2%

  if (avg >= healthyT) {
    turnoverStatus.value = 'good'
    turnoverSuggestions.value = []
  }
  else if (avg >= cautionT) {
    turnoverStatus.value = 'caution'
    turnoverSuggestions.value = [
      `Your average turnover is ${(avg*100).toFixed(1)}%, slightly below target (≥${healthyT*100}%). To boost trading:`,
      '• Run gToons Clash quests rewarding bonus points for trading Rare & Very Rare cToons',
      '• Add Winball challenges that drop Uncommon cToons on win to spur secondary trades',
      '• Offer a small point-fee discount or coupon (via daily login bonus) for Crazy Rare trades',
      '• Promote visiting czones with “trade boost” rewards to unlock lower auction fees'
    ]
  }
  else {
    turnoverStatus.value = 'danger'
    turnoverSuggestions.value = [
      `Turnover is very low at ${(avg*100).toFixed(1)}% (<${cautionT*100}%). Immediate actions:`,
      '• Launch limited-edition auctions for Rare & Very Rare cToons with small bid fees',
      '• Run a 24-hr triple-points event on any trade in gToons and Winball',
      '• Temporarily waive all point sinks on trades to encourage Crazy Rare swaps',
      '• Add a one-time “czone marathon” reward granting Rare cToons for visiting zones'
    ]
  }
}

onMounted(async () => {
  // init line charts
  cumChart    = new Chart(cumCanvas.value.getContext('2d'),    { type: 'line', data: { labels: [], datasets: [] }, options: cumOptions })
  pctChart    = new Chart(pctCanvas.value.getContext('2d'),    { type: 'line', data: { labels: [], datasets: [] }, options: pctOptions })
  uniqueChart = new Chart(uniqueCanvas.value.getContext('2d'), { type: 'line', data: { labels: [], datasets: [] }, options: uniqueOptions })

  // init bar & histogram charts
  codesChart  = new Chart(codesCanvas.value.getContext('2d'),  { type: 'bar',  data: { labels: [], datasets: [] }, options: barOptions })
  ctoonChart  = new Chart(ctoonCanvas.value.getContext('2d'),  { type: 'bar',  data: { labels: [], datasets: [] }, options: barOptions })
  tradesChart = new Chart(tradesCanvas.value.getContext('2d'), { type: 'bar', data: { labels: [], datasets: [] }, options: barOptions })
  packChart   = new Chart(packsCanvas.value.getContext('2d'),  { type: 'bar',  data: { labels: [], datasets: [] }, options: barOptions })
  ptsHistChart= new Chart(ptsDistCanvas.value.getContext('2d'),{ type: 'bar',  data: { labels: [], datasets: [] }, options: histOptions })
  clashChart  = new Chart(clashCanvas.value.getContext('2d'),  { data: { labels: [], datasets: [] }, options: clashOptions })

  // in your onMounted or wherever you init charts:
  ratioChart = new Chart(ratioCanvas.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Daily spend/earn',
          data: [],
          borderColor: '#6366F1',
          borderWidth: 2,
          fill: false,
          datalabels: {
            anchor: 'end',   // above the point
            align:  'top'
          }
        },
        {
          label: '7-day moving avg',
          data: [],
          borderColor: '#FACC15',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          datalabels: {
            anchor: 'start', // below the point
            align:  'bottom'
          }
        }
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
            const chart = legend.chart;
            const idx   = legendItem.datasetIndex;
            const meta  = chart.getDatasetMeta(idx);
            meta.hidden = !meta.hidden;
            chart.update();
          }
        }
      }
    }
  });

  turnoverChart = new Chart(turnoverCanvas.value.getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [{
      data: [],
      backgroundColor: [],
      borderColor:  [],
      borderWidth: 1,
      datalabels: { 
        anchor: 'end', 
        align: 'top',
        formatter: v => (v * 100).toFixed(1) + '%'
      }
    }]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {}
      },
      scales: {
        x: {
          title: { display: true, text: 'Rarity' }
        },
        y: {
          title: { display: true, text: 'Turnover Rate' },
          ticks: {
            callback: v => (v * 100).toFixed(0) + '%'
          },
          beginAtZero: true
        }
      }
    },
    plugins: [ ChartDataLabels ]
  })


  netChart = new Chart(netCanvas.value.getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [
      {
        label: 'Daily net points',
        data: [],
        borderColor: colors.line,
        backgroundColor: colors.line,
        borderWidth: 2,
        fill: false,
        datalabels: {
          anchor: 'end',
          align:  'top'
        }
      },
      {
        label: '7-day moving avg',
        data: [],
        borderColor: '#FACC15',  // yellow
        backgroundColor: '#FACC15',
        borderWidth: 2,
        fill: false,
        borderDash: [5,5],
        datalabels: {
          anchor: 'start',
          align:  'bottom'
        }
      }
    ]},
    options: netOptions
  })

  // fetch all
  await nextTick()
  await fetchData()
})

// re-fetch whenever timeframe changes
watch(
  selectedTimeframe,
  async () => {
    // don’t run until the chart is built
    if (!netChart) return

    // clear out old data so Chart.js redraws axes properly
    netChart.data.labels = []
    netChart.data.datasets.forEach(ds => (ds.data = []))
    netChart.update()

    // now actually re-fetch & re-populate
    await fetchData()
  }
)
</script>

<style scoped>
.chart-container {
  height: 300px;
  position: relative;
  padding: 10px;
}
</style>
