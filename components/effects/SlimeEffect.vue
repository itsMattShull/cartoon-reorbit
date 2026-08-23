<template>
  <div class="sfx-root">
    <div
      v-for="d in drips" :key="d.id"
      class="sfx-drip"
      :style="{
        left: d.left + '%',
        width: d.width + 'px',
        animationDelay: d.delay + 'ms',
        animationDuration: durationMs + 'ms',
        background: d.gradient,
      }"
    ></div>
  </div>
</template>

<script setup>
// Green Nickelodeon-slime-style ooze: a row of drip shapes grow down from the top (CSS
// `transform: scaleY`, origin top) then slide the rest of the way off the bottom of the screen
// (`translateY`) — both GPU-composited transforms, deliberately avoiding animating `height` or
// `clip-path` per-frame (see performance review: those trigger layout/paint on every tick).
const props = defineProps({
  durationMs: { type: Number, default: 2600 },
})
const emit = defineEmits(['done'])

const DRIP_COUNT = 12
const GREENS = [
  'linear-gradient(180deg, #7ee600 0%, #4caf00 55%, #2e7d00 100%)',
  'linear-gradient(180deg, #8cff1a 0%, #5cc400 55%, #337a00 100%)',
  'linear-gradient(180deg, #6bd400 0%, #439900 55%, #285c00 100%)',
]

// Randomized once per play, not per frame — purely a static layout choice, not part of the
// animation loop.
const drips = Array.from({ length: DRIP_COUNT }, (_, i) => {
  const spread = 100 / DRIP_COUNT
  return {
    id: i,
    left: Math.min(96, Math.max(0, spread * i + (Math.random() * spread * 0.6 - spread * 0.3))),
    width: 48 + Math.round(Math.random() * 56),
    delay: Math.round(Math.random() * 260),
    gradient: GREENS[i % GREENS.length],
  }
})

let timer = null

onMounted(() => {
  // Longest possible per-drip delay (260ms) plus the shared animation duration, plus a small
  // margin — matches the CSS timeline rather than guessing a shorter fixed number.
  timer = setTimeout(() => emit('done'), props.durationMs + 300)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.sfx-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: rgba(10, 30, 0, 0.06);
}

.sfx-drip {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 0 0 45% 45% / 0 0 60px 60px;
  transform-origin: top center;
  transform: scaleY(0) translateY(0);
  animation-name: sfx-ooze;
  animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
  animation-fill-mode: forwards;
  will-change: transform;
  box-shadow: inset 0 -12px 24px rgba(0, 0, 0, 0.25);
}

@keyframes sfx-ooze {
  0%   { transform: scaleY(0) translateY(0); }
  38%  { transform: scaleY(1) translateY(0); }
  100% { transform: scaleY(1) translateY(130%); }
}
</style>
