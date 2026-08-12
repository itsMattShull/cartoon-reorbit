<template>
  <span class="cc" :class="{ 'is-low': low, 'is-running': running }">{{ text }}</span>
</template>

<script setup>
import { computed } from 'vue'

// A component of its own rather than a span inside the board's component. The clock updates
// five times a second; if that reactive read lived in the page component, every tick would
// re-diff all 64 squares. Here it re-renders one text node.
const props = defineProps({
  ms: { type: Number, default: 0 },
  running: { type: Boolean, default: false },
  low: { type: Boolean, default: false }
})

const text = computed(() => {
  const total = Math.max(0, props.ms)
  const mins = Math.floor(total / 60000)
  const secs = Math.floor((total % 60000) / 1000)
  // Tenths only under ten seconds, where they matter. Showing them for the whole game makes
  // the clock a flickering distraction beside a board you are trying to read.
  if (total < 10000) {
    const tenths = Math.floor((total % 1000) / 100)
    return `${secs}.${tenths}`
  }
  return `${mins}:${String(secs).padStart(2, '0')}`
})
</script>

<style scoped>
.cc {
  font-family: 'Courier New', Courier, monospace;
  /* Without tabular figures the HUD reflows on every tick as digit widths change. */
  font-variant-numeric: tabular-nums;
  font-weight: bold;
  font-size: 15px;
  padding: 2px 8px;
  border-radius: 5px;
  border: 2px solid #14110d;
  background: #d9e8f2;
  color: #14110d;
  min-width: 62px;
  text-align: center;
}
.cc.is-running { background: #fff3c9; }
.cc.is-low { background: #e0553f; color: #fff; }
</style>
