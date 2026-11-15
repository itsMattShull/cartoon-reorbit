<template>
  <Transition name="vb-fade">
    <div v-if="visible" class="vb-overlay" aria-hidden="true">
      <div class="vb-card">
        <div class="vb-side vb-side-a" :style="sideStyle(teamA)">
          <p class="vb-side-name">{{ teamA.name }}</p>
          <p v-if="teamA.captains.length" class="vb-captains">🎖️ {{ teamA.captains.join(', ') }}</p>
        </div>
        <p class="vb-vs">VS</p>
        <div class="vb-side vb-side-b" :style="sideStyle(teamB)">
          <p class="vb-side-name">{{ teamB.name }}</p>
          <p v-if="teamB.captains.length" class="vb-captains">🎖️ {{ teamB.captains.join(', ') }}</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
// One-time, two-sided "squaring off" intro — nothing else in this game needs this (raid is always
// "party vs one shared boss", never two symmetric sides), so this is new rather than reused. Shown
// once when a PvP match's combat starts (see pages/newsite/cmoon-pvp/[id].vue's own trigger),
// self-dismissing after a few seconds so the caller never needs its own timer.
import { ref, watch, onBeforeUnmount } from 'vue'
import { isSafeCMoonColor } from '~/utils/cmoonColor'

const props = defineProps({
  show: { type: Boolean, default: false },
  // { name, color } | null, plus captains: string[] — built by the caller from its own team roster.
  teamA: { type: Object, required: true },
  teamB: { type: Object, required: true },
})
const emit = defineEmits(['done'])

const visible = ref(false)
let hideTimer = null

function sideStyle(team) {
  const color = isSafeCMoonColor(team?.color) ? team.color : '#5b6b85'
  return { '--vb-color': color }
}

watch(() => props.show, (on) => {
  if (!on) return
  visible.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    visible.value = false
    emit('done')
  }, 2600)
})
onBeforeUnmount(() => { if (hideTimer) clearTimeout(hideTimer) })
</script>

<style scoped>
.vb-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(4, 10, 20, 0.75);
  pointer-events: none;
}
.vb-card {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 100%;
}
.vb-side {
  min-width: 120px;
  max-width: 180px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #0a0f1c;
  border: 2px solid var(--vb-color);
  box-shadow: 0 0 20px var(--vb-color);
  text-align: center;
  animation: vb-slide-in 0.5s ease-out;
}
.vb-side-a { animation-name: vb-slide-in-left; }
.vb-side-b { animation-name: vb-slide-in-right; }
.vb-side-name { margin: 0; font-size: 1.05rem; font-weight: 900; color: #fff; word-break: break-word; }
.vb-captains { margin: 4px 0 0; font-size: 0.75rem; color: rgba(255, 255, 255, 0.8); }
.vb-vs {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 900;
  color: #ffd75e;
  text-shadow: 0 0 10px rgba(255, 215, 94, 0.7);
  flex-shrink: 0;
}
@keyframes vb-slide-in-left {
  0% { transform: translateX(-40px); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
@keyframes vb-slide-in-right {
  0% { transform: translateX(40px); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .vb-side { animation: none; }
}
.vb-fade-enter-active, .vb-fade-leave-active { transition: opacity 0.4s ease; }
.vb-fade-enter-from, .vb-fade-leave-to { opacity: 0; }
</style>
