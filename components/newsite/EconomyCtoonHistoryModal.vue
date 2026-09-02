<template>
  <!-- Custom overlay (not the shared Modal.vue) with a z-index above it, since
       this can be opened from inside EconomyTopValuableModal and must render
       on top of it rather than behind/under it. -->
  <!-- Teleported to body: .site-container carries a `transform`, which makes it the
       containing block for `position: fixed` descendants and then clips them with
       `overflow: hidden`. Without this the overlay is pinned to the chrome's box
       rather than the viewport, so on a page scrolled down it renders offset and
       partly unreachable. Same approach as AuctionModal / CtoonInfoCard / Trade. -->
  <Teleport to="body">
    <div class="hist-overlay" @click.self="$emit('close')">
      <div class="hist-card">
        <div class="hist-header">
          <img v-if="info?.assetPath" class="hist-thumb" :src="info.assetPath" :alt="info?.name" />
          <div class="hist-heading">
            <h3 class="hist-name">{{ info?.name || 'Loading…' }}</h3>
            <p v-if="info?.releaseDate" class="hist-sub">Released {{ formatDate(info.releaseDate) }}</p>
          </div>
          <button
            type="button"
            class="hist-refresh"
            :disabled="pending"
            aria-label="Refresh price data"
            title="Refresh"
            @click="refresh"
          >⟳</button>
          <button type="button" class="hist-close" @click="$emit('close')" aria-label="Close">✕</button>
        </div>

        <div class="hist-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="hist-tab"
            :class="{ active: tab === 'auctions' }"
            :aria-selected="tab === 'auctions' ? 'true' : 'false'"
            @click="tab = 'auctions'"
          >Auction Prices</button>
          <button
            type="button"
            role="tab"
            class="hist-tab"
            :class="{ active: tab === 'trades' }"
            :aria-selected="tab === 'trades' ? 'true' : 'false'"
            @click="tab = 'trades'"
          >Trade Values</button>
        </div>

        <p v-if="pending" class="hist-empty">Loading price history…</p>
        <p v-else-if="loadFailed" class="hist-empty">Couldn't load price history right now. Try again in a moment.</p>
        <template v-else>
          <p v-if="showAggregateFallback" class="hist-fallback-note">
            Not enough sales data yet for individual prices — showing the aggregate trend instead.
          </p>

          <template v-if="showLive">
            <div class="chart-container">
              <canvas ref="canvasEl"></canvas>
            </div>
            <p class="hist-note">{{ tab === 'auctions' ? 'Real closed-auction sale prices, most recent first.' : 'Per-trade imputed values, most recent first.' }}</p>
            <ul class="hist-points">
              <li v-for="(p, i) in activePoints" :key="i" class="hist-point-row">
                <span class="hist-point-value">{{ formatPoints(tab === 'auctions' ? p.price : p.value) }} pts</span>
                <span v-if="p.mintNumber != null" class="hist-point-mint">#{{ p.mintNumber }}</span>
                <span class="hist-point-date">{{ formatRelative(tab === 'auctions' ? p.soldAt : p.tradedAt) }}</span>
              </li>
            </ul>
          </template>

          <template v-else-if="showAggregateFallback">
            <div class="chart-container">
              <canvas ref="canvasEl"></canvas>
            </div>
            <p class="hist-note">Tap a legend item to toggle a series. Gaps mean too few transactions that period to show a reliable average.</p>
          </template>

          <p v-else class="hist-empty">Not enough auction or trade activity yet to chart a price history for this cToon.</p>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, CategoryScale, Title, Tooltip, Legend
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend)

const props = defineProps({
  ctoonId: { type: String, required: true }
})
defineEmits(['close'])

const canvasEl = ref(null)
const info = ref(null)
const pending = ref(true)
const loadFailed = ref(false)
const tab = ref('auctions')
let chart = null

// Live per-point data from the new endpoints, one entry per tab.
const live = ref({ auctions: null, trades: null })
// Aggregate CtoonPriceDaily chart data (the old behavior), built only when a
// live tab reports insufficientData.
const aggregate = ref(null)

function formatDate(d) {
  try { return new Date(d).toLocaleDateString() } catch { return '' }
}

function formatPoints(n) {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

function formatRelative(d) {
  if (!d) return ''
  const then = new Date(d).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(d).toLocaleDateString()
}

const activeLive = computed(() => live.value[tab.value])
const activeFellBack = computed(() => !!activeLive.value?.insufficientData && !!aggregate.value)
const activePoints = computed(() => activeLive.value?.points || [])
const showLive = computed(() => !!activeLive.value && !activeLive.value.insufficientData && activePoints.value.length > 0)
const showAggregateFallback = computed(() => activeFellBack.value && hasAggregateData.value)

const hasAggregateData = computed(() => {
  return (aggregate.value?.auctionPoints?.some(p => p.avgPrice != null)) ||
         (aggregate.value?.tradePoints?.some(p => p.avgPrice != null))
})

function buildAggregate(auctionRes, tradeRes) {
  const labelSet = new Set([
    ...auctionRes.points.map(p => p.period),
    ...tradeRes.points.map(p => p.period)
  ])
  const labels = [...labelSet].sort()

  const auctionByPeriod = new Map(auctionRes.points.map(p => [p.period, p.avgPrice]))
  const tradeByPeriod = new Map(tradeRes.points.map(p => [p.period, p.avgPrice]))

  return {
    labels,
    auctionData: labels.map(l => auctionByPeriod.has(l) ? (auctionByPeriod.get(l) ?? null) : null),
    tradeData: labels.map(l => tradeByPeriod.has(l) ? (tradeByPeriod.get(l) ?? null) : null),
    auctionPoints: auctionRes.points,
    tradePoints: tradeRes.points
  }
}

// Fetches everything a fresh open (or a refresh) needs: both live tabs, the
// AUCTION-source history call (also carries the header info), and — only when
// a tab actually needs it — the TRADE-source history call to complete the
// aggregate fallback chart.
async function fetchAll() {
  const [auctionsRes, tradesRes, historyAuctionRes] = await Promise.all([
    $fetch(`/api/economy/ctoons/${props.ctoonId}/auctions`),
    $fetch(`/api/economy/ctoons/${props.ctoonId}/trades`),
    $fetch(`/api/economy/ctoons/${props.ctoonId}/history`, { query: { source: 'AUCTION' } })
  ])

  live.value = { auctions: auctionsRes, trades: tradesRes }
  info.value = {
    name: historyAuctionRes.name,
    assetPath: historyAuctionRes.assetPath,
    releaseDate: historyAuctionRes.releaseDate
  }

  if (auctionsRes.insufficientData || tradesRes.insufficientData) {
    const historyTradeRes = await $fetch(`/api/economy/ctoons/${props.ctoonId}/history`, { query: { source: 'TRADE' } })
    aggregate.value = buildAggregate(historyAuctionRes, historyTradeRes)
  } else {
    aggregate.value = null
  }
}

async function load() {
  pending.value = true
  loadFailed.value = false
  try {
    await fetchAll()
  } catch {
    loadFailed.value = true
  } finally {
    pending.value = false
  }
  await renderActiveChart()
}

async function refresh() {
  if (pending.value) return
  pending.value = true
  try {
    await fetchAll()
  } catch {
    // Keep showing the previous data rather than blanking the modal on a
    // transient failure — the user just tapped refresh, they can tell if it
    // didn't move.
  } finally {
    pending.value = false
  }
  await renderActiveChart()
}

function destroyChart() {
  if (chart) {
    chart.destroy()
    chart = null
  }
}

async function renderLiveChart() {
  const points = activePoints.value
  if (!points.length) return
  await nextTick()
  if (!canvasEl.value) return

  const isAuctions = tab.value === 'auctions'
  const ordered = [...points].reverse() // oldest -> newest, left to right
  const labels = ordered.map(p => formatDate(isAuctions ? p.soldAt : p.tradedAt))
  const values = ordered.map(p => isAuctions ? p.price : p.value)

  destroyChart()
  chart = new Chart(canvasEl.value.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: isAuctions ? 'Sale price' : 'Imputed trade value',
        data: values,
        borderColor: isAuctions ? '#66CC00' : '#3399CC',
        backgroundColor: isAuctions ? '#66CC00' : '#3399CC',
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          ticks: { color: '#fff', maxTicksLimit: 6, autoSkip: true },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#fff' },
          grid: { color: 'rgba(255,255,255,0.1)' }
        }
      }
    }
  })
}

async function renderAggregateChart() {
  if (!hasAggregateData.value) return
  await nextTick()
  if (!canvasEl.value) return

  destroyChart()
  chart = new Chart(canvasEl.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: aggregate.value.labels,
      datasets: [
        {
          label: 'Auction avg',
          data: aggregate.value.auctionData,
          borderColor: '#66CC00',
          backgroundColor: '#66CC00',
          borderWidth: 2,
          spanGaps: false,
          tension: 0.15
        },
        {
          label: 'Trade avg',
          data: aggregate.value.tradeData,
          borderColor: '#3399CC',
          backgroundColor: '#3399CC',
          borderWidth: 2,
          spanGaps: false,
          tension: 0.15
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#fff' } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          ticks: { color: '#fff', maxTicksLimit: 6, autoSkip: true },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#fff' },
          grid: { color: 'rgba(255,255,255,0.1)' }
        }
      }
    }
  })
}

async function renderActiveChart() {
  if (showLive.value) {
    await renderLiveChart()
  } else if (showAggregateFallback.value) {
    await renderAggregateChart()
  } else {
    destroyChart()
  }
}

watch(tab, () => { renderActiveChart() })

onMounted(load)

onBeforeUnmount(() => {
  destroyChart()
})
</script>

<style scoped>
.hist-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100; /* above the shared Modal.vue (z-[1001]) this can open from on top of */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px;
  box-sizing: border-box;
}

.hist-card {
  background: #0b1f33;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 16px;
}

.hist-header {
  display: flex;
  align-items: center;
  gap: 10px;
  position: sticky;
  top: -16px;
  background: #0b1f33;
  padding: 4px 0 10px;
  margin: -4px 0 6px;
}

.hist-thumb {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex-shrink: 0;
}

.hist-heading {
  flex: 1 1 auto;
  min-width: 0;
}

.hist-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hist-sub {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.hist-refresh {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

.hist-refresh:disabled {
  opacity: 0.5;
  cursor: default;
}

.hist-close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
}

.hist-tabs {
  display: flex;
  gap: 6px;
  margin: 0 0 10px;
}

.hist-tab {
  flex: 1 1 0;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 6px;
}

.hist-tab.active {
  background: rgba(102, 204, 0, 0.18);
  border-color: #66CC00;
  color: #fff;
}

.chart-container {
  position: relative;
  height: 260px;
  padding: 4px;
}

.hist-note {
  margin: 8px 0 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.55);
}

.hist-fallback-note {
  margin: 0 0 8px;
  font-size: 0.78rem;
  color: #ffcc66;
  background: rgba(255, 204, 102, 0.1);
  border: 1px solid rgba(255, 204, 102, 0.3);
  border-radius: 6px;
  padding: 8px 10px;
}

.hist-empty {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  padding: 10px 0;
}

.hist-points {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.hist-point-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  min-height: 36px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.8rem;
  color: #fff;
}

.hist-point-value {
  font-weight: 700;
  flex: 0 0 auto;
}

.hist-point-mint {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.72rem;
  flex: 0 0 auto;
}

.hist-point-date {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.72rem;
  flex: 0 0 auto;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .hist-card {
    max-width: 100%;
    padding: 12px;
  }

  .hist-tab {
    font-size: 0.78rem;
    padding: 8px 4px;
  }

  .hist-point-row {
    font-size: 0.78rem;
  }
}
</style>
