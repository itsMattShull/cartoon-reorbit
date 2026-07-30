<template>
  <!-- Custom overlay (not the shared Modal.vue) with a z-index above it, since
       this can be opened from inside EconomyTopValuableModal and must render
       on top of it rather than behind/under it. -->
  <div class="hist-overlay" @click.self="$emit('close')">
    <div class="hist-card">
      <div class="hist-header">
        <img v-if="info?.assetPath" class="hist-thumb" :src="info.assetPath" :alt="info?.name" />
        <div class="hist-heading">
          <h3 class="hist-name">{{ info?.name || 'Loading…' }}</h3>
          <p v-if="info?.releaseDate" class="hist-sub">Released {{ formatDate(info.releaseDate) }}</p>
        </div>
        <button type="button" class="hist-close" @click="$emit('close')" aria-label="Close">✕</button>
      </div>

      <p v-if="pending" class="hist-empty">Loading price history…</p>
      <p v-else-if="!hasAnyData" class="hist-empty">Not enough auction or trade activity yet to chart a price history for this cToon.</p>
      <template v-else>
        <div class="chart-container">
          <canvas ref="canvasEl"></canvas>
        </div>
        <p class="hist-note">Tap a legend item to toggle a series. Gaps mean too few transactions that period to show a reliable average.</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
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
let chart = null

const hasAnyData = computed(() => {
  return (info.value?.auctionPoints?.some(p => p.avgPrice != null)) ||
         (info.value?.tradePoints?.some(p => p.avgPrice != null))
})

function formatDate(d) {
  try { return new Date(d).toLocaleDateString() } catch { return '' }
}

async function load() {
  pending.value = true
  try {
    const [auctionRes, tradeRes] = await Promise.all([
      $fetch(`/api/economy/ctoons/${props.ctoonId}/history`, { query: { source: 'AUCTION' } }),
      $fetch(`/api/economy/ctoons/${props.ctoonId}/history`, { query: { source: 'TRADE' } })
    ])

    const labelSet = new Set([
      ...auctionRes.points.map(p => p.period),
      ...tradeRes.points.map(p => p.period)
    ])
    const labels = [...labelSet].sort()

    const auctionByPeriod = new Map(auctionRes.points.map(p => [p.period, p.avgPrice]))
    const tradeByPeriod = new Map(tradeRes.points.map(p => [p.period, p.avgPrice]))

    info.value = {
      name: auctionRes.name,
      assetPath: auctionRes.assetPath,
      releaseDate: auctionRes.releaseDate,
      labels,
      auctionData: labels.map(l => auctionByPeriod.has(l) ? (auctionByPeriod.get(l) ?? null) : null),
      tradeData: labels.map(l => tradeByPeriod.has(l) ? (tradeByPeriod.get(l) ?? null) : null),
      auctionPoints: auctionRes.points,
      tradePoints: tradeRes.points
    }
  } catch {
    info.value = null
  } finally {
    pending.value = false
  }
}

async function renderChart() {
  if (!hasAnyData.value) return
  await nextTick()
  if (!canvasEl.value) return

  chart = new Chart(canvasEl.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: info.value.labels,
      datasets: [
        {
          label: 'Auction avg',
          data: info.value.auctionData,
          borderColor: '#66CC00',
          backgroundColor: '#66CC00',
          borderWidth: 2,
          spanGaps: false,
          tension: 0.15
        },
        {
          label: 'Trade avg',
          data: info.value.tradeData,
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

onMounted(async () => {
  await load()
  await renderChart()
})

onBeforeUnmount(() => {
  if (chart) chart.destroy()
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

.hist-close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-width: 44px;
  min-height: 32px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
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

.hist-empty {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  padding: 10px 0;
}
</style>
