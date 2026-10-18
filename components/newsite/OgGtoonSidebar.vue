<!-- components/newsite/OgGtoonSidebar.vue -->
<!-- Sidebar-middle content during an Original gToons match: the opponent's panel on top, yours below.
     Each shows the username, points, and a count of that player's face-up cards in each goal color.
     The numbers are published by components/OgGtoonMatchBoard.vue through shared state. -->
<template>
  <div class="og-sb" data-tut="scoreboard">
    <section v-for="p in panels" :key="p.key" class="og-sb-panel">
      <h3 class="og-sb-name" :title="p.name">{{ p.name }}</h3>
      <div class="og-sb-label">Points</div>
      <div class="og-sb-points">{{ p.score }}</div>
      <div class="og-sb-colors">
        <div v-for="c in colors" :key="c.name" class="og-sb-color" :title="`${c.label} cards`">
          <span class="og-sb-dot" :style="{ background: c.hex }"></span>
          <span class="og-sb-count">{{ p.counts[c.name] ?? 0 }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ogTitleCase } from '@/utils/ogGtoonLabels'

const state = useState('ogGtoonSidebar', () => null)
const colors = computed(() => (state.value?.colors || []).map(c => ({ ...c, label: ogTitleCase(c.name) })))
const panels = computed(() => {
  const s = state.value
  if (!s) return []
  return [
    { key: 'opp', ...s.opponent },
    { key: 'you', ...s.you }
  ]
})
</script>

<style scoped>
.og-sb { height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; box-sizing: border-box; }
.og-sb-panel {
  flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px;
  padding: 10px 12px; border-radius: 6px; background: rgba(255, 255, 255, .12); border: 1px solid rgba(153, 255, 255, .35);
}
.og-sb-name { margin: 0; font-size: 1rem; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.og-sb-label { font-size: .7rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #99ffff; }
.og-sb-points { font-size: 2.6rem; font-weight: 800; line-height: 1; color: #fff; text-shadow: 3px 3px 0 rgba(0, 0, 0, .2); }
.og-sb-colors { display: flex; gap: 14px; margin-top: 6px; }
.og-sb-color { display: flex; align-items: center; gap: 6px; }
.og-sb-dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .7); box-shadow: 0 2px 4px rgba(0, 0, 0, .3); }
.og-sb-count { font-size: 1.4rem; font-weight: 800; color: #fff; }

/* On mobile the match board shows a compact name / score / color-count bar above and below the cards instead. */
@media (max-width: 767px) {
  .og-sb { display: none; }
}
</style>
