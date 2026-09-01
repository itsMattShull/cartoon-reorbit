<template>
  <div class="tcx-root" :style="{ animationDuration: durationMs + 'ms' }">
    <div class="tcx-tiles" :style="{ animationDelay: tilesFadeDelayMs + 'ms', animationDuration: tilesFadeMs + 'ms' }">
      <img
        v-for="t in tiles" :key="t.id"
        :src="t.src"
        alt=""
        class="tcx-tile"
        :style="{ animationDelay: t.delay + 'ms' }"
      />
    </div>

    <div class="tcx-content" :style="{ animationDelay: contentDelayMs + 'ms', animationDuration: contentMs + 'ms' }">
      <div class="tcx-text">You with us?</div>
    </div>
  </div>
</template>

<script setup>
// Solid yellow background throughout. Phase 1: a grid of tiles, each showing one of the two
// provided Cartoon Network gifs, pops in one by one (randomized order/timing) until they fill the
// screen, holds briefly, then fades out. Phase 2 (overlapping the tail of that fade): the green
// "You with us?" text pops in over the now-bare yellow background, holds, then fades — the text's
// own keyframe already ends in a fade-out, so no separate root-level fade is needed on top of it;
// the tiles and content phases are timed back-to-back to add up to the full duration.
const props = defineProps({
  durationMs: { type: Number, default: 2600 },
})
const emit = defineEmits(['done'])

const TILE_COLS = 4
const TILE_ROWS = 6
const TILE_GIFS = ['/effects/cn-board.gif', '/effects/cn-columns.gif']

// Tiles pop in across the first ~45% of the budget, hold briefly, then fade over the next ~12% —
// the text's own delay/duration picks up exactly where that leaves off.
const fillMs = Math.round(props.durationMs * 0.45)
const tilesHoldMs = Math.round(props.durationMs * 0.08)
const tilesFadeMs = Math.round(props.durationMs * 0.12)
const tilesFadeDelayMs = fillMs + tilesHoldMs
const contentDelayMs = tilesFadeDelayMs
const contentMs = props.durationMs - contentDelayMs

// Randomized once per play, not per frame — staggered (not strictly left-to-right) delays within
// the fill window read as tiles "filling in" organically; each tile randomly picks one of the two
// provided gifs.
const tiles = Array.from({ length: TILE_COLS * TILE_ROWS }, (_, i) => ({
  id: i,
  src: TILE_GIFS[Math.random() < 0.5 ? 0 : 1],
  delay: Math.round(Math.random() * fillMs * 0.7),
}))

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

.tcx-tiles {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(6, 1fr);
  animation-name: tcx-tiles-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

@keyframes tcx-tiles-fade {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

.tcx-tile {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transform: scale(0.4);
  animation-name: tcx-tile-pop;
  animation-duration: 380ms;
  animation-timing-function: cubic-bezier(0.2, 1.3, 0.4, 1);
  animation-fill-mode: both;
}

@keyframes tcx-tile-pop {
  0%   { opacity: 0; transform: scale(0.4); }
  70%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}

.tcx-content {
  display: flex;
  flex-direction: column;
  align-items: center;
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
  /* Scales with viewport but stays readable on a 320px phone and doesn't blow out on a tablet. */
  font-size: clamp(2.25rem, 11vw, 5.5rem);
  line-height: 1.05;
}
</style>
