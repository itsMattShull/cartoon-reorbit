<template>
  <!-- Same Teleport-to-body reason as CMoonRaidBattleReportModal — .site-container's desktop
       transform:scale() makes it the containing block for position:fixed descendants.
       Deliberately NO @click.self dismissal and no ✕ — this one requires the explicit
       "I Understand" click, unlike every other modal in this feature. -->
  <Teleport to="body">
    <div class="cemim-overlay" role="dialog" aria-modal="true" aria-labelledby="cemim-title">
      <div class="cemim-card">
        <div class="cemim-swatch" :style="{ backgroundColor: map.backgroundColor }"></div>
        <h2 id="cemim-title" class="cemim-title">{{ map.name }}</h2>
        <p class="cemim-intro">This fight is on a special map with its own conditions:</p>
        <ul class="cemim-list">
          <li v-for="(line, i) in lines" :key="i">{{ line }}</li>
        </ul>
        <button type="button" class="cemim-button" @click="$emit('understood')">I Understand</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { describeEnemyMapEffects } from '@/utils/cmoonEnemyMapDescription'

const props = defineProps({
  map: { type: Object, required: true },
  // 'raid' or 'pvp' — fog-of-war means something different in each (see
  // utils/cmoonEnemyMapDescription.js's own comment), so the caller must say which.
  context: { type: String, required: true },
})
defineEmits(['understood'])

const lines = computed(() => describeEnemyMapEffects(props.map, props.context))
</script>

<style scoped>
.cemim-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  background: rgba(10, 14, 22, 0.82);
  backdrop-filter: blur(2px);
  box-sizing: border-box;
}

.cemim-card {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  max-height: 85dvh;
  overflow-y: auto;
  box-sizing: border-box;
  background: linear-gradient(160deg, #00111f 0%, #003466 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 20px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  color: #fff;
  font-family: 'Nunito', sans-serif;
  text-align: center;
}

.cemim-swatch {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  margin: 0 auto 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.cemim-title {
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0 0 6px;
}

.cemim-intro {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.75);
  margin: 0 0 10px;
}

.cemim-list {
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cemim-list li {
  font-size: 0.8rem;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 10px;
}

.cemim-button {
  width: 100%;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}
.cemim-button:hover {
  background: #1d4ed8;
}
</style>
