<template>
  <div class="economy">
    <div class="economy-header">
      <h1 class="economy-title">Economy</h1>
      <div class="window-toggle" role="group" aria-label="Time window">
        <button
          v-for="opt in windowOptions"
          :key="opt.value"
          type="button"
          class="window-pill"
          :class="{ 'window-pill--active': windowValue === opt.value }"
          @click="windowValue = opt.value"
        >{{ opt.label }}</button>
      </div>
    </div>

    <!-- Stat tiles -->
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Avg Points / Player</div>
        <div class="stat-value">{{ summary ? formatNumber(summary.avgPointsPerPlayer, 0) : '—' }}</div>
        <div v-if="summary" class="stat-foot">Median {{ formatNumber(summary.medianPointsPerPlayer) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Points (7d)</div>
        <div class="stat-value" :class="netPointsClass">
          {{ summary ? formatSigned(summary.netPoints7d) : '—' }}
        </div>
        <div v-if="summary" class="stat-foot">Issued minus spent</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Trades</div>
        <div class="stat-value">{{ summary ? formatNumber(summary.totalTradeVolume) : '—' }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Auctions Sold</div>
        <div class="stat-value">{{ summary ? formatNumber(summary.totalAuctionVolume) : '—' }}</div>
      </div>
    </div>

    <!-- Net points issued -->
    <section class="economy-section">
      <h2 class="section-title">Net Points Issued</h2>
      <p class="section-sub">Daily points earned minus spent, last 30 days (dashed line = 7-day average)</p>
      <div v-if="netSeries.length" class="chart-container">
        <canvas ref="netCanvas"></canvas>
      </div>
      <p v-else class="empty-note">No points activity recorded yet.</p>
      <p class="chart-note">
        A net of 0 means no point inflation. Positive net means inflation; negative net means deflation.
      </p>

      <div v-if="inflation" class="inflation-row">
        <div class="inflation-card">
          <div class="stat-label">Inflation — Year to Date</div>
          <div class="stat-value">{{ formatPercent(inflation.ytdPct) }}</div>
          <div class="stat-foot">{{ inflationWord(inflation.ytdPct) }} since Jan 1</div>
        </div>
        <div class="inflation-card">
          <div class="stat-label">Inflation — Last 30 Days</div>
          <div class="stat-value">{{ formatPercent(inflation.last30Pct) }}</div>
          <div class="stat-foot">{{ inflationWord(inflation.last30Pct) }} over 30 days</div>
        </div>
      </div>
      <p v-if="inflation" class="chart-note">
        Measured as the change in the circulating player point supply over each period.
      </p>
    </section>

    <!-- Trending -->
    <section class="economy-section">
      <h2 class="section-title">Trending cToons</h2>
      <p class="section-sub">By combined trade + auction activity ({{ windowLabel }})</p>
      <ul v-if="trending?.length" class="ctoon-list">
        <li
          v-for="(row, idx) in trending"
          :key="row.ctoonId"
          class="ctoon-row"
          tabindex="0"
          @click="openHistory(row.ctoonId)"
          @keyup.enter="openHistory(row.ctoonId)"
        >
          <span class="ctoon-rank">{{ idx + 1 }}</span>
          <img v-if="row.assetPath" class="ctoon-thumb" :src="row.assetPath" :alt="row.name" />
          <span class="ctoon-name">{{ row.name }}</span>
          <span class="ctoon-metric">{{ row.volume }} txns</span>
        </li>
      </ul>
      <p v-else class="empty-note">Not enough activity yet to show trends.</p>
    </section>

    <!-- Top 10 -->
    <section class="economy-section">
      <h2 class="section-title">Top 10 Most Valuable</h2>
      <div class="top10-buttons">
        <GreenButton @click="openTopValuable('AUCTION')">By Auction</GreenButton>
        <GreenButton @click="openTopValuable('TRADE')">By Trade</GreenButton>
      </div>
    </section>

    <!-- Browse all -->
    <section class="economy-section">
      <h2 class="section-title">Browse All cToons</h2>
      <input
        v-model="searchInput"
        type="text"
        inputmode="search"
        autocomplete="off"
        placeholder="Search cToon name…"
        class="search-input"
      />
      <ul v-if="browseResults.length" class="ctoon-list">
        <li
          v-for="row in browseResults"
          :key="row.ctoonId"
          class="ctoon-row ctoon-row--browse"
          tabindex="0"
          @click="openHistory(row.ctoonId)"
          @keyup.enter="openHistory(row.ctoonId)"
        >
          <img v-if="row.assetPath" class="ctoon-thumb" :src="row.assetPath" :alt="row.name" />
          <span class="ctoon-name">{{ row.name }}</span>
          <span class="ctoon-price-chip">
            <span class="chip-label">Auction</span>
            <span>{{ formatPrice(row.avgAuctionPrice) }}</span>
          </span>
          <span class="ctoon-price-chip">
            <span class="chip-label">Trade</span>
            <span>{{ formatPrice(row.avgTradePrice) }}</span>
          </span>
        </li>
      </ul>
      <p v-else-if="!browsePending" class="empty-note">No cToons found.</p>
      <div v-if="browseTotal > pageSize" class="pagination">
        <button type="button" :disabled="browsePage <= 1" @click="browsePage--">Prev</button>
        <span>Page {{ browsePage }} of {{ totalPages }}</span>
        <button type="button" :disabled="browsePage >= totalPages" @click="browsePage++">Next</button>
      </div>
    </section>

    <EconomyTopValuableModal
      v-if="showTopValuable"
      :source="topValuableSource"
      :window="windowValue"
      @close="showTopValuable = false"
      @select="openHistory"
    />

    <EconomyCtoonHistoryModal
      v-if="historyCtoonId"
      :ctoon-id="historyCtoonId"
      @close="historyCtoonId = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRequestHeaders } from '#app'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Tooltip, Legend
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const windowOptions = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' }
]
const windowValue = ref('7d')
const windowLabel = computed(() => windowOptions.find(o => o.value === windowValue.value)?.label || '')

// Modals — tracked so polling can pause while either is open (avoids
// re-rendering/losing scroll position under a user's thumb mid-read).
const showTopValuable = ref(false)
const topValuableSource = ref('AUCTION')
const historyCtoonId = ref(null)
const anyModalOpen = computed(() => showTopValuable.value || !!historyCtoonId.value)

function openTopValuable(source) {
  topValuableSource.value = source
  showTopValuable.value = true
}

function openHistory(ctoonId) {
  showTopValuable.value = false
  historyCtoonId.value = ctoonId
}

// Summary + trending
const { data: summary, refresh: refreshSummary } = useFetch('/api/economy/summary', { headers })
const { data: trending, refresh: refreshTrending } = useFetch('/api/economy/trending', {
  query: { window: windowValue },
  headers
})

watch(windowValue, () => refreshTrending())

// Net points issued (last 30 days) + inflation rates — not window-dependent,
// so it isn't refetched when the window toggle changes.
const { data: netPoints } = useFetch('/api/economy/net-points', { headers })
const netSeries = computed(() => netPoints.value?.series || [])
const inflation = computed(() => netPoints.value?.inflation || null)

const netPointsClass = computed(() => {
  const v = summary.value?.netPoints7d
  if (v == null) return ''
  return v >= 0 ? 'stat-value--pos' : 'stat-value--neg'
})

const netCanvas = ref(null)
let netChart = null

async function renderNetChart() {
  if (!netSeries.value.length) return
  await nextTick()
  if (!netCanvas.value) return
  if (netChart) netChart.destroy()

  netChart = new Chart(netCanvas.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: netSeries.value.map(p => p.period.slice(5)), // MM-DD
      datasets: [
        {
          label: 'Net points',
          data: netSeries.value.map(p => p.net),
          borderColor: '#66CC00',
          backgroundColor: '#66CC00',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15
        },
        {
          label: '7-day avg',
          data: netSeries.value.map(p => p.movingAvg7Day),
          borderColor: '#FFB000',
          backgroundColor: '#FFB000',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0.15
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#fff', boxWidth: 12 } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          ticks: { color: '#fff', maxTicksLimit: 6, autoSkip: true },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        y: {
          ticks: { color: '#fff', maxTicksLimit: 6 },
          grid: { color: 'rgba(255,255,255,0.1)' }
        }
      }
    }
  })
}

watch(netPoints, renderNetChart)

let pollHandle = null
onMounted(() => {
  renderNetChart()
  pollHandle = setInterval(() => {
    if (anyModalOpen.value) return
    refreshSummary()
    refreshTrending()
  }, 60000)
})
onBeforeUnmount(() => {
  if (pollHandle) clearInterval(pollHandle)
  if (netChart) netChart.destroy()
})

// Browse all cToons
const searchInput = ref('')
const debouncedQuery = ref('')
let debounceHandle = null
watch(searchInput, (val) => {
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => { debouncedQuery.value = val; browsePage.value = 1 }, 300)
})

const browsePage = ref(1)
const pageSize = ref(20)
const browseResults = ref([])
const browseTotal = ref(0)
const browsePending = ref(false)
const totalPages = computed(() => Math.max(1, Math.ceil(browseTotal.value / pageSize.value)))

async function loadBrowse() {
  browsePending.value = true
  try {
    const res = await $fetch('/api/economy/ctoons/search', {
      query: { q: debouncedQuery.value, page: browsePage.value },
      headers
    })
    browseResults.value = res.results
    browseTotal.value = res.total
    pageSize.value = res.pageSize
  } catch {
    browseResults.value = []
    browseTotal.value = 0
  } finally {
    browsePending.value = false
  }
}

watch([debouncedQuery, browsePage], loadBrowse, { immediate: true })

function formatNumber(n, maximumFractionDigits = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits })
}

function formatSigned(n) {
  if (n == null) return '—'
  const v = Number(n)
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString()}`
}

function formatPercent(n) {
  if (n == null) return 'N/A'
  const v = Number(n)
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`
}

function inflationWord(n) {
  if (n == null) return 'Not enough data'
  if (n > 0) return 'Inflation'
  if (n < 0) return 'Deflation'
  return 'Flat'
}

function formatPrice(n) {
  if (n == null) return 'N/A'
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} pts`
}
</script>

<style scoped>
.economy {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  color: var(--text-color, #fff);
}

.economy-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.economy-title {
  font-size: 1.6rem;
  font-weight: 800;
  margin: 0;
}

.window-toggle {
  display: flex;
  gap: 6px;
}

.window-pill {
  padding: 6px 12px;
  min-height: 36px;
  border-radius: 999px;
  border: 2px solid var(--OrbitLightBlue, #3399CC);
  background: transparent;
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.window-pill--active {
  background: var(--OrbitLightBlue, #3399CC);
}

/* Horizontally-scrollable row instead of stacked full-width cards, so the
   trending list isn't pushed below the fold on small screens. */
.stat-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 18px;
  -webkit-overflow-scrolling: touch;
}

.stat-card {
  flex: 0 0 auto;
  min-width: 140px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 10px 14px;
}

.stat-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.75;
}

.stat-value {
  font-size: 1.3rem;
  font-weight: 800;
}

.stat-value--pos {
  color: #8CE046;
}

.stat-value--neg {
  color: #FF8A7A;
}

.stat-foot {
  margin-top: 2px;
  font-size: 0.68rem;
  opacity: 0.6;
}

.chart-container {
  position: relative;
  height: 220px;
  padding: 4px;
}

.chart-note {
  margin: 8px 0 0;
  font-size: 0.72rem;
  opacity: 0.6;
  line-height: 1.35;
}

.inflation-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.inflation-card {
  flex: 1 1 160px;
  min-width: 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 10px 14px;
}

.economy-section {
  margin-bottom: 22px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0 0 2px;
}

.section-sub {
  font-size: 0.78rem;
  opacity: 0.7;
  margin: 0 0 10px;
}

.top10-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ctoon-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ctoon-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  min-height: 44px;
  box-sizing: border-box;
}

.ctoon-row:hover,
.ctoon-row:focus-visible {
  background: rgba(255, 255, 255, 0.14);
  outline: none;
}

.ctoon-rank {
  width: 20px;
  text-align: center;
  font-weight: 700;
  opacity: 0.8;
  flex-shrink: 0;
}

.ctoon-thumb {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}

.ctoon-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.ctoon-metric {
  flex-shrink: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.ctoon-row--browse {
  flex-wrap: wrap;
}

.ctoon-price-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.78rem;
  line-height: 1.15;
  min-width: 70px;
}

.chip-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  opacity: 0.65;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1rem; /* >=16px so iOS Safari doesn't auto-zoom on focus */
  margin-bottom: 10px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.55);
}

.empty-note {
  opacity: 0.7;
  font-size: 0.85rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 0.85rem;
}

.pagination button {
  min-height: 36px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .economy-title {
    font-size: 1.3rem;
  }

  .ctoon-row--browse {
    align-items: flex-start;
  }
}
</style>
