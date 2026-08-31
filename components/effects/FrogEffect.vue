<template>
  <div class="frx-root" :style="{ animationDuration: durationMs + 'ms' }">
    <div class="frx-purple" :style="{ animationDelay: purpleDelayMs + 'ms', animationDuration: purpleMs + 'ms' }"></div>
    <img
      src="/effects/frog.png"
      alt=""
      class="frx-frog"
      :style="{ animationDuration: frogInMs + 'ms' }"
    />
  </div>
</template>

<script setup>
// The frog pops in centered, the screen fades to solid purple behind/around it, holds, then the
// whole overlay fades out. Replaces the old pokeball-throw effect (previously CMoonEffectType
// POKEBALL, renamed to FROG via a Postgres RENAME VALUE migration so any cMoon already set to it
// keeps pointing at the same effect under its new content). All motion is transform/opacity only,
// matching every other effect in this set — no per-frame JS needed here.
const props = defineProps({
  durationMs: { type: Number, default: 2800 },
})
const emit = defineEmits(['done'])

const frogInMs = Math.round(props.durationMs * 0.4)
const purpleDelayMs = Math.round(props.durationMs * 0.3)
const purpleMs = Math.round(props.durationMs * 0.35)

let timer = null

onMounted(() => {
  timer = setTimeout(() => emit('done'), props.durationMs)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.frx-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  animation-name: frx-root-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

@keyframes frx-root-fade {
  0%   { opacity: 1; }
  78%  { opacity: 1; }
  100% { opacity: 0; }
}

.frx-purple {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 45%, #9b30d9 0%, #6a1fb0 55%, #3d0f78 100%);
  opacity: 0;
  animation-name: frx-purple-in;
  animation-timing-function: ease-out;
  animation-fill-mode: both;
}

@keyframes frx-purple-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

.frx-frog {
  position: relative;
  width: min(70vw, 60vh, 420px);
  height: auto;
  opacity: 0;
  transform: scale(0.4) translateY(10%);
  filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.5));
  animation-name: frx-frog-in;
  animation-timing-function: cubic-bezier(0.2, 1.4, 0.4, 1);
  animation-fill-mode: forwards;
}

@keyframes frx-frog-in {
  0%   { opacity: 0; transform: scale(0.4) translateY(10%); }
  70%  { opacity: 1; transform: scale(1.08) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
