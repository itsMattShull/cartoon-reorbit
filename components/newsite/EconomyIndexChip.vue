<template>
  <!-- One ticker figure: label, info button, value, and the ▲/▼/– change —
       shared by EconomyTicker.vue's "Economy Index" and "Economy Index
       (ex. high mints)" chips so a markup/wording/a11y fix only has to be
       made in one place. -->
  <div
    class="ticker-index"
    :class="data?.available ? `ticker-index--${data.direction}` : 'ticker-index--unavailable'"
  >
    <span class="ticker-index-label">{{ label }}</span>
    <button
      type="button"
      class="ticker-index-help"
      :aria-label="helpLabel"
      @click="$emit('help')"
    >?</button>
    <template v-if="data?.available">
      <span class="ticker-index-value">{{ formatPoints(data.indexThisWeek) }}</span>
      <span class="ticker-index-change" aria-hidden="true">
        {{ directionArrow }}{{ Math.abs(data.pctChange).toFixed(1) }}%
      </span>
      <span class="sr-only">{{ srText }}</span>
    </template>
    <span v-else class="ticker-index-value">{{ loaded ? 'N/A' : '—' }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  helpLabel: { type: String, required: true },
  data: { type: Object, default: null },
  loaded: { type: Boolean, default: false }
})
defineEmits(['help'])

function formatPoints(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

const directionArrow = computed(() => {
  const d = props.data?.direction
  if (d === 'up') return '▲'
  if (d === 'down') return '▼'
  return '–'
})

const srText = computed(() => {
  const d = props.data
  if (!d?.available) return `${props.label} not available.`
  const dirWord = d.direction === 'up' ? 'up' : d.direction === 'down' ? 'down' : 'flat'
  return `${props.label} ${formatPoints(d.indexThisWeek)}, ${dirWord} ${Math.abs(d.pctChange).toFixed(1)} percent versus last week.`
})
</script>

<style scoped>
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
