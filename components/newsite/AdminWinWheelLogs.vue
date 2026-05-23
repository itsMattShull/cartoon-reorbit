<template>
  <div class="admin-win-wheel-logs bg-gray-50">
    <div class="p-2 text-xs">
      <h1 class="text-base font-bold mb-2">Win Wheel Logs</h1>

      <!-- Date range filter -->
      <form class="bg-white border rounded p-2 flex flex-wrap items-end gap-2 mb-2" @submit.prevent="applyRange">
        <div>
          <label class="block text-[10px] font-medium mb-0.5">From</label>
          <input type="date" v-model="from" class="border rounded px-1.5 py-0.5 text-xs" />
        </div>
        <div>
          <label class="block text-[10px] font-medium mb-0.5">To</label>
          <input type="date" v-model="to" class="border rounded px-1.5 py-0.5 text-xs" />
        </div>
        <button class="bg-indigo-600 text-white rounded px-2 py-0.5 text-[11px]">Apply</button>
        <button type="button" class="text-[11px] text-gray-600 underline" @click="setLastNDays(30)">Last 30 days</button>
      </form>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <!-- Pie chart -->
        <div class="bg-white rounded shadow p-2">
          <h2 class="text-sm font-semibold mb-1">Results Distribution</h2>
          <p class="text-[11px] text-gray-500 mb-1">Total spins: {{ total }}</p>
          <div class="chart-container"><canvas ref="pieCanvas"></canvas></div>
        </div>

        <!-- Breakdown table -->
        <div class="bg-white rounded shadow p-2">
          <h2 class="text-sm font-semibold mb-1">Breakdown</h2>
          <div v-if="loading" class="text-gray-500">Loading…</div>
          <div v-else-if="rows.length === 0" class="text-gray-500">No spins in this range.</div>
          <table v-else class="w-full text-[11px]">
            <thead>
              <tr class="text-left border-b">
                <th class="py-1">Result</th>
                <th class="py-1">Count</th>
                <th class="py-1">% of total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.result" class="border-b">
                <td class="py-0.5">
                  <span class="inline-block w-2.5 h-2.5 rounded mr-1.5" :style="{ backgroundColor: colorFor(r.result) }"></span>
                  {{ labelFor(r.result) }}
                </td>
                <td class="py-0.5 tabular-nums">{{ r.count }}</td>
                <td class="py-0.5 tabular-nums">{{ pct(r.count) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'

Chart.register(PieController, ArcElement, Tooltip, Legend, ChartDataLabels)

const from = ref('')
const to = ref('')

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
let pieChart
const rows = ref([])
const loading = ref(false)
const total = computed(() => rows.value.reduce((s, r) => s + r.count, 0))

const LABELS = {
  nothing: 'Nothing',
  points: 'Points',
  ctoonLeast: 'cToon (Least Rare)',
  ctoonExclusive: 'cToon (Exclusive)'
}
const COLORS = {
  nothing: '#9CA3AF',
  points: '#F59E0B',
  ctoonLeast: '#3B82F6',
  ctoonExclusive: '#8B5CF6',
  default: '#10B981'
}
const labelFor = key => LABELS[key] || key
const colorFor = key => COLORS[key] || COLORS.default
const pct = count => (total.value ? ((count / total.value) * 100).toFixed(1) + '%' : '—')

async function fetchDistribution() {
  loading.value = true
  try {
    const params = new URLSearchParams({ start: from.value, end: to.value })
    const res = await fetch(`/api/admin/win-wheel-logs?${params.toString()}`, { credentials: 'include' })
    const data = await res.json()

    rows.value = (data.data || [])
      .map(d => ({ result: d.result, count: d.count }))
      .sort((a, b) => b.count - a.count)

    const labels = rows.value.map(r => labelFor(r.result))
    const counts = rows.value.map(r => r.count)
    const colors = rows.value.map(r => colorFor(r.result))

    pieChart.data.labels = labels
    pieChart.data.datasets = [{
      data: counts,
      backgroundColor: colors,
      borderColor: colors,
      borderWidth: 1
    }]
    pieChart.update()
  } catch (e) {
    console.error(e)
    rows.value = []
  } finally {
    loading.value = false
  }
}

function applyRange() {
  if (!from.value || !to.value) return
  if (new Date(from.value) > new Date(to.value)) {
    const t = from.value
    from.value = to.value
    to.value = t
  }
  fetchDistribution()
}

onMounted(() => {
  setLastNDays(30)
  pieChart = new Chart(pieCanvas.value.getContext('2d'), {
    type: 'pie',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#000', font: { size: 10 } }
        },
        datalabels: {
          color: '#fff',
          font: { size: 10 },
          formatter: (val, ctx) => {
            const total = ctx.chart.data.datasets[0].data.reduce((s, v) => s + v, 0)
            const p = total ? (val / total * 100).toFixed(1) : 0
            return `${val} (${p}%)`
          }
        }
      }
    }
  })
  fetchDistribution()
})
</script>

<style scoped>
.admin-win-wheel-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
.chart-container {
  height: 240px;
  position: relative;
}
</style>
