<template>
  <div class="tcx-root" :style="{ animationDuration: durationMs + 'ms' }">
    <div class="tcx-content" :style="{ animationDuration: durationMs + 'ms' }">
      <div class="tcx-text">You with us?</div>
      <img src="/effects/cartoon-cartoon-fridays.webp" alt="Cartoon Cartoon Fridays" class="tcx-logo" />
    </div>
  </div>
</template>

<script setup>
// Solid yellow flash with centered pop-in text + logo. Cheapest of the five new effects — no
// canvas, no per-frame JS, just CSS keyframe animations (background opacity, content scale/
// opacity), all compositor-only (see performance review: SlimeEffect's own comment sets the
// precedent of avoiding layout/paint-triggering properties in these overlays). Text and logo pop
// in together as one group rather than staggered — simpler timing, and neither reads as more
// "primary" than the other.
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

.tcx-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: min(4vh, 1.5rem);
  max-width: 100%;
  max-height: 92vh;
  padding: 0 5vw;
  opacity: 0;
  transform: scale(0.7);
  animation-name: tcx-content-pop;
  animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.1);
  animation-fill-mode: forwards;
}

@keyframes tcx-content-pop {
  0%   { opacity: 0; transform: scale(0.7); }
  18%  { opacity: 1; transform: scale(1.06); }
  26%  { opacity: 1; transform: scale(1); }
  78%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1); }
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
  /* Scales with viewport but stays readable on a 320px phone and doesn't blow out on a tablet.
     Sized a bit smaller than a text-only callout would need, to leave room for the logo below on
     a short landscape-phone viewport. */
  font-size: clamp(1.9rem, 9vw, 4.75rem);
  line-height: 1.05;
}

.tcx-logo {
  /* Both a width and a max-height cap (with object-fit) rather than width alone — this is a wide,
     short banner image, so on a short landscape-phone viewport a width-only cap could still push
     the combined text+logo content taller than the screen. */
  width: min(60vw, 300px);
  max-height: 22vh;
  height: auto;
  object-fit: contain;
}
</style>
