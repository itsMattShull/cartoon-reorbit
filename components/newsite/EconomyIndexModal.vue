<template>
  <!-- Same Teleport-to-body + z-index approach as EconomyCtoonHistoryModal:
       .site-container carries a transform, which makes it the containing
       block for position:fixed descendants and clips them. -->
  <Teleport to="body">
    <div class="eim-overlay" @click.self="$emit('close')">
      <div class="eim-card" role="dialog" aria-modal="true" aria-labelledby="eim-title">
        <div class="eim-header">
          <h3 id="eim-title" class="eim-title">What is the Economy Index?</h3>
          <button type="button" class="eim-close" @click="$emit('close')" aria-label="Close">✕</button>
        </div>

        <div v-if="inflation?.available" class="eim-current" :class="`eim-current--${inflation.direction}`">
          <span class="eim-current-value">{{ formatPoints(inflation.indexThisWeek) }} pts</span>
          <span class="eim-current-change" aria-hidden="true">
            {{ directionArrow }}{{ Math.abs(inflation.pctChange).toFixed(1) }}%
          </span>
          <span class="eim-current-sub">vs. last week</span>
        </div>
        <p v-else class="eim-current-unavailable">Not enough sales data yet this week or last to show a number.</p>

        <div class="eim-body">
          <p>
            The Economy Index is the average number of points a cToon sold for over
            the past 7 days, combining both <strong>auction wins</strong> and
            <strong>trades</strong> into one number.
          </p>
          <p>
            It's <strong>weighted by volume</strong> — a day with a lot of sales
            counts for more than a day with just one or two — so the number reflects
            the overall market rather than swinging on a single high-value auction.
          </p>
          <p>
            The percent change compares this week's average against last week's,
            using the same method for both, so <span class="eim-up">▲ up</span> means
            cToons generally sold for more points this week, and
            <span class="eim-down">▼ down</span> means they generally sold for fewer.
          </p>
          <p class="eim-note">
            Auctions and trades are blended here for a single glanceable figure — the
            "Top 10 Most Valuable" and "Browse All cToons" sections below stay split
            by source for a closer look.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  inflation: { type: Object, default: null }
})
defineEmits(['close'])

function formatPoints(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

const directionArrow = computed(() => {
  const d = props.inflation?.direction
  if (d === 'up') return '▲'
  if (d === 'down') return '▼'
  return '–'
})
</script>

<style scoped>
.eim-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px;
  box-sizing: border-box;
}

.eim-card {
  background: #0b1f33;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 100%;
  max-width: 440px;
  max-height: 85vh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 16px;
  color: #fff;
}

.eim-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.eim-title {
  margin: 0;
  flex: 1;
  font-size: 1rem;
  font-weight: 700;
}

.eim-close {
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

.eim-current {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  margin-bottom: 12px;
  font-variant-numeric: tabular-nums;
}

.eim-current-value {
  font-size: 1.2rem;
  font-weight: 800;
}

.eim-current-change {
  font-size: 0.95rem;
  font-weight: 700;
}

.eim-current--up .eim-current-change { color: #8CE046; }
.eim-current--down .eim-current-change { color: #FF8A7A; }
.eim-current--flat .eim-current-change { color: rgba(255, 255, 255, 0.75); }

.eim-current-sub {
  font-size: 0.7rem;
  opacity: 0.6;
}

.eim-current-unavailable {
  font-size: 0.82rem;
  opacity: 0.7;
  margin: 0 0 12px;
}

.eim-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 0.85rem;
  line-height: 1.45;
}

.eim-body p {
  margin: 0;
}

.eim-up { color: #8CE046; font-weight: 700; }
.eim-down { color: #FF8A7A; font-weight: 700; }

.eim-note {
  opacity: 0.65;
  font-size: 0.78rem;
}
</style>
