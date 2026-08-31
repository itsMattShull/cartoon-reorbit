<template>
  <div class="tcx-root" :style="{ animationDuration: durationMs + 'ms' }">
    <div class="tcx-text" :style="{ animationDuration: durationMs + 'ms' }">You with us?</div>
  </div>
</template>

<script setup>
// Solid yellow flash with centered pop-in text. Cheapest of the five new effects — no canvas, no
// per-frame JS, just two CSS keyframe animations (background opacity + text scale/opacity), both
// compositor-only (see performance review: SlimeEffect's own comment sets the precedent of
// avoiding layout/paint-triggering properties in these overlays).
const props = defineProps({
  durationMs: { type: Number, default: 2600 },
})
const emit = defineEmits(['done'])

let timer = null

onMounted(() => {
  timer = setTimeout(() => emit('done'), props.durationMs)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.tcx-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #ffd400;
  display: flex;
  align-items: center;
  justify-content: center;
  animation-name: tcx-bg-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

@keyframes tcx-bg-fade {
  0%   { opacity: 0; }
  12%  { opacity: 1; }
  78%  { opacity: 1; }
  100% { opacity: 0; }
}

.tcx-text {
  /* FuturaBdCnBT (see assets/css/tailwind.css) with a bold fallback stack so the text is
     legible immediately even if the font file hasn't arrived yet (font-display: swap). */
  font-family: "FuturaBdCnBT", "Arial Narrow", Arial, Helvetica, sans-serif;
  font-weight: 700;
  color: #1a7a1a;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  text-align: center;
  padding: 0 5vw;
  /* Scales with viewport but stays readable on a 320px phone and doesn't blow out on a tablet. */
  font-size: clamp(2.25rem, 11vw, 5.5rem);
  line-height: 1.05;
  opacity: 0;
  transform: scale(0.7);
  animation-name: tcx-text-pop;
  animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.1);
  animation-fill-mode: forwards;
}

@keyframes tcx-text-pop {
  0%   { opacity: 0; transform: scale(0.7); }
  18%  { opacity: 1; transform: scale(1.06); }
  26%  { opacity: 1; transform: scale(1); }
  78%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1); }
}
</style>
