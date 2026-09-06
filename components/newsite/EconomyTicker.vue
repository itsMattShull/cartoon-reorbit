<template>
  <div class="economy-ticker">
    <!-- Static chip, not rotated — there's only ever one number. Glyph plus
         colour so direction reads without relying on colour alone. -->
    <div
      v-if="inflation?.available"
      class="ticker-index"
      :class="`ticker-index--${inflation.direction}`"
    >
      <span class="ticker-index-label">Economy Index</span>
      <button
        type="button"
        class="ticker-index-help"
        aria-label="What is the Economy Index?"
        @click="showIndexModal = true"
      >?</button>
      <span class="ticker-index-value">{{ formatPoints(inflation.indexThisWeek) }}</span>
      <span class="ticker-index-change" aria-hidden="true">
        {{ directionArrow }}{{ Math.abs(inflation.pctChange).toFixed(1) }}%
      </span>
      <span class="sr-only">{{ srIndexText }}</span>
    </div>
    <div v-else class="ticker-index ticker-index--unavailable">
      <span class="ticker-index-label">Economy Index</span>
      <button
        type="button"
        class="ticker-index-help"
        aria-label="What is the Economy Index?"
        @click="showIndexModal = true"
      >?</button>
      <span class="ticker-index-value">{{ inflationLoaded ? 'N/A' : '—' }}</span>
    </div>

    <!-- Live top-10 active-auction strip — see EconomyAuctionTicker.vue. -->
    <EconomyAuctionTicker />

    <EconomyIndexModal
      v-if="showIndexModal"
      :inflation="inflation"
      @close="showIndexModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const INFLATION_POLL_MS = 30000

const inflation = ref(null)
const inflationLoaded = ref(false)
const pageHidden = ref(false)
const showIndexModal = ref(false)

function formatPoints(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

const directionArrow = computed(() => {
  const d = inflation.value?.direction
  if (d === 'up') return '▲'
  if (d === 'down') return '▼'
  return '–'
})

const srIndexText = computed(() => {
  const inf = inflation.value
  if (!inf?.available) return 'Economy index not available.'
  const dirWord = inf.direction === 'up' ? 'up' : inf.direction === 'down' ? 'down' : 'flat'
  return `Economy index ${formatPoints(inf.indexThisWeek)}, ${dirWord} ${Math.abs(inf.pctChange).toFixed(1)} percent versus last week.`
})

async function fetchInflation() {
  try {
    inflation.value = await $fetch('/api/economy/inflation')
  } catch {
    // Leave the last good value on screen rather than blanking it.
  } finally {
    inflationLoaded.value = true
  }
}

let inflationHandle = null

function onVisibilityChange() {
  pageHidden.value = document.hidden
  if (!pageHidden.value) fetchInflation()
}

onMounted(() => {
  pageHidden.value = document.hidden
  document.addEventListener('visibilitychange', onVisibilityChange)

  fetchInflation()

  inflationHandle = setInterval(() => {
    if (pageHidden.value) return
    fetchInflation()
  }, INFLATION_POLL_MS)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (inflationHandle) clearInterval(inflationHandle)
})
</script>

<style scoped>
/* Single flex/block root so this drops in cleanly whether the caller shows it
   inline above the stat tiles or inside a collapsible container. */
.economy-ticker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.ticker-index {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-variant-numeric: tabular-nums;
}

.ticker-index-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

.ticker-index-help {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Visual circle is 18px, but the tap target is padded out to the usual
     44px minimum via a transparent hit-box rather than growing the circle
     itself, which would look oversized next to the label text. */
  position: relative;
}

.ticker-index-help::before {
  content: '';
  position: absolute;
  inset: -13px;
}

.ticker-index-help:hover,
.ticker-index-help:focus-visible {
  background: rgba(255, 255, 255, 0.25);
  outline: none;
}

.ticker-index-value {
  font-size: 1.05rem;
  font-weight: 800;
}

.ticker-index-change {
  font-size: 0.85rem;
  font-weight: 700;
}

/* Colour plus the ▲/▼/– glyph already in the markup, never colour alone. */
.ticker-index--up .ticker-index-change {
  color: #8CE046;
}

.ticker-index--down .ticker-index-change {
  color: #FF8A7A;
}

.ticker-index--flat .ticker-index-change,
.ticker-index--unavailable .ticker-index-value {
  color: rgba(255, 255, 255, 0.75);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .ticker-index {
    font-size: 0.9em;
  }
}
</style>
