<template>
  <div class="sfd-root" :style="{ animationDuration: durationMs + 'ms' }">
    <div
      v-for="d in drips" :key="d.id"
      class="sfd-drip"
      :style="{
        left: d.left + '%',
        width: d.width + '%',
        animationDelay: d.delay + 'ms',
        animationDuration: fillMs + 'ms',
        background: d.gradient,
      }"
    ></div>
  </div>
</template>

<script setup>
// Distinct from SlimeEffect.vue's drip-and-slide-off: here the slime pours down from the top,
// FLOODS to fully cover the screen, holds solid for a beat, then the whole thing fades to
// transparent as one unit. Root uses `position:absolute;inset:0` (inherited from the host's
// fixed, 100dvh overlay) rather than any `vh` unit of its own — the mobile-browser-chrome/dvh
// pitfall the host's own comment already documents (see mobile review).
const props = defineProps({
  durationMs: { type: Number, default: 2800 },
})
const emit = defineEmits(['done'])

const DRIP_COUNT = 14
const GREENS = [
  'linear-gradient(180deg, #8cff1a 0%, #4caf00 55%, #2e7d00 100%)',
  'linear-gradient(180deg, #9dff33 0%, #5cc400 55%, #337a00 100%)',
  'linear-gradient(180deg, #7be600 0%, #439900 55%, #285c00 100%)',
]

// Randomized once per play, not per frame — a static layout choice, not part of any animation
// loop (matches SlimeEffect.vue's own reasoning). Widths are in percent (not px) and deliberately
// overlap their neighbors' lanes — this effect needs to fully FLOOD the screen regardless of
// viewport width, unlike SlimeEffect's narrower drip-and-slide-off look, so px-fixed widths would
// leave visible gaps on a wide desktop monitor.
const spread = 100 / DRIP_COUNT
const drips = Array.from({ length: DRIP_COUNT }, (_, i) => ({
  id: i,
  left: Math.max(0, spread * i - spread * 0.3 + (Math.random() * spread * 0.3)),
  width: spread * (1.6 + Math.random() * 0.6),
  delay: Math.round(Math.random() * 180),
  gradient: GREENS[i % GREENS.length],
}))

// The pour/flood phase gets ~55% of the budget, the rest is the solid hold + the root's own fade.
const fillMs = Math.round(props.durationMs * 0.55)

let timer = null

onMounted(() => {
  timer = setTimeout(() => emit('done'), props.durationMs)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.sfd-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #0a1e00;
  animation-name: sfd-root-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

@keyframes sfd-root-fade {
  0%   { opacity: 1; }
  72%  { opacity: 1; }
  100% { opacity: 0; }
}

.sfd-drip {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 0 0 45% 45% / 0 0 60px 60px;
  transform-origin: top center;
  transform: scaleY(0);
  animation-name: sfd-pour;
  animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
  animation-fill-mode: forwards;
  will-change: transform;
  box-shadow: inset 0 -12px 24px rgba(0, 0, 0, 0.25);
}

@keyframes sfd-pour {
  0%   { transform: scaleY(0); }
  100% { transform: scaleY(1.08); }
}
</style>
