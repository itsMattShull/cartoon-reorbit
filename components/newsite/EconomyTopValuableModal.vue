<template>
  <Modal close-on-backdrop @close="$emit('close')">
    <h3 class="tv-title">Top 10 Most Valuable — {{ source === 'AUCTION' ? 'Auction' : 'Trade' }}</h3>
    <p class="tv-sub">{{ windowLabel }} · anonymous aggregate data</p>

    <p v-if="pending" class="tv-empty">Loading…</p>
    <p v-else-if="error" class="tv-empty">Couldn't load this list. Try again shortly.</p>
    <ul v-else-if="rows.length" class="tv-list">
      <li
        v-for="(row, idx) in rows"
        :key="row.ctoonId"
        class="tv-row"
        tabindex="0"
        @click="select(row)"
        @keyup.enter="select(row)"
      >
        <span class="tv-rank">{{ idx + 1 }}</span>
        <img v-if="row.assetPath" class="tv-thumb" :src="row.assetPath" :alt="row.name" />
        <span class="tv-name">{{ row.name }}</span>
        <span class="tv-price">{{ formatPrice(row.avgPrice) }}</span>
      </li>
    </ul>
    <p v-else class="tv-empty">Not enough {{ source === 'AUCTION' ? 'auction' : 'trade' }} activity yet.</p>
  </Modal>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  source: { type: String, required: true }, // 'AUCTION' | 'TRADE'
  window: { type: String, default: 'all' }
})
const emit = defineEmits(['close', 'select'])

const WINDOW_LABELS = { '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' }
const windowLabel = computed(() => WINDOW_LABELS[props.window] || 'All time')

const rows = ref([])
const pending = ref(true)
const error = ref(false)

onMounted(async () => {
  pending.value = true
  error.value = false
  try {
    rows.value = await $fetch('/api/economy/top-valuable', {
      query: { source: props.source, window: props.window }
    })
  } catch {
    error.value = true
  } finally {
    pending.value = false
  }
})

function select(row) {
  emit('select', row.ctoonId)
}

function formatPrice(n) {
  if (n == null) return 'N/A'
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} pts`
}
</script>

<style scoped>
.tv-title {
  margin: 0 0 2px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
}

.tv-sub {
  margin: 0 0 12px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.tv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tv-row {
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

.tv-row:hover,
.tv-row:focus-visible {
  background: rgba(255, 255, 255, 0.14);
  outline: none;
}

.tv-rank {
  width: 20px;
  text-align: center;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
}

.tv-thumb {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.tv-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  font-weight: 600;
}

.tv-price {
  flex-shrink: 0;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
}

.tv-empty {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
}
</style>
