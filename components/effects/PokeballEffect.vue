<template>
  <div class="pkx-root" :style="{ animationDuration: durationMs + 'ms' }">
    <div class="pkx-ball" :style="{ animationDuration: throwMs + 'ms' }">
      <div class="pkx-button"><div class="pkx-button-inner"></div></div>
    </div>
    <div class="pkx-flash" :style="{ animationDelay: flashDelayMs + 'ms' }"></div>
    <div class="pkx-wipe">
      <div
        v-for="b in bars" :key="b.id"
        class="pkx-bar"
        :class="b.fromRight ? 'pkx-bar-right' : 'pkx-bar-left'"
        :style="{ animationDelay: b.delay + 'ms', animationDuration: barAnimMs + 'ms' }"
      ></div>
    </div>
  </div>
</template>

<script setup>
// A CSS/SVG-drawn pokeball (no real Pokémon artwork — see plan review) scales up and spins toward
// the viewer, then a set of bars wipes the screen to black (classic battle-transition look),
// holds, then the whole overlay fades to transparent. Every moving piece here animates only
// `transform`/`opacity` — no `clip-path`/`height` — so the wipe is compositor-only rather than a
// per-frame repaint (see performance review, which specifically flagged clip-path-wedge wipes as
// the anti-pattern to avoid).
const props = defineProps({
  durationMs: { type: Number, default: 3000 },
})
const emit = defineEmits(['done'])

const BAR_COUNT = 10

const throwMs = Math.round(props.durationMs * 0.42)
const wipeMs = Math.round(props.durationMs * 0.3)
const barAnimMs = Math.round(wipeMs * 0.65)
const flashDelayMs = Math.max(0, throwMs - 90)

// Staggered so bars sweep in left-to-right-ish rather than all at once, alternating which edge
// they travel from for the classic "venetian blind" look.
const bars = Array.from({ length: BAR_COUNT }, (_, i) => ({
  id: i,
  fromRight: i % 2 === 1,
  delay: throwMs + Math.round((i * (wipeMs - barAnimMs)) / Math.max(1, BAR_COUNT - 1)),
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
.pkx-root {
  position: absolute;
  inset: 0;
  overflow: hidden;
  animation-name: pkx-root-fade;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

@keyframes pkx-root-fade {
  0%   { opacity: 1; }
  82%  { opacity: 1; }
  100% { opacity: 0; }
}

.pkx-ball {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24vmin;
  height: 24vmin;
  border-radius: 50%;
  background:
    linear-gradient(to bottom,
      #ee1c25 0%, #ee1c25 47%,
      #111111 47%, #111111 52%,
      #ffffff 52%, #ffffff 100%);
  box-shadow: inset -6px -8px 18px rgba(0, 0, 0, 0.35), inset 6px 6px 14px rgba(255, 255, 255, 0.25);
  animation-name: pkx-throw;
  animation-timing-function: cubic-bezier(0.3, 0.4, 0.25, 1);
  animation-fill-mode: forwards;
  will-change: transform, opacity;
}

/* Scale growth is deliberately gradual rather than a sudden lurch at the viewer — a large, fast
   central-FOV scale change is a known motion-sickness trigger on a phone held close to the face
   (see mobile review); most of the growth happens by 55-78% with only a small final bump. */
@keyframes pkx-throw {
  0%   { transform: translate(-50%, 120%) scale(0.15) rotate(0deg); opacity: 1; }
  55%  { transform: translate(-50%, -50%) scale(0.95) rotate(430deg); opacity: 1; }
  78%  { transform: translate(-50%, -50%) scale(1.3) rotate(620deg); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.5) rotate(700deg); opacity: 0; }
}

.pkx-button {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 30%;
  height: 30%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #ffffff;
  border: solid #111111;
  border-width: 8%;
  box-sizing: border-box;
}

.pkx-button-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40%;
  height: 40%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #ffffff;
}

.pkx-flash {
  position: absolute;
  inset: 0;
  background: #ffffff;
  opacity: 0;
  animation-name: pkx-flash;
  animation-duration: 180ms;
  animation-timing-function: ease-out;
  animation-fill-mode: both;
}

@keyframes pkx-flash {
  0%   { opacity: 0; }
  45%  { opacity: 0.85; }
  100% { opacity: 0; }
}

.pkx-wipe {
  position: absolute;
  inset: 0;
  display: flex;
}

.pkx-bar {
  flex: 1 1 0;
  height: 100%;
  background: #000000;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  animation-fill-mode: both;
  will-change: transform;
}

.pkx-bar-left {
  transform: translateX(-105%);
  animation-name: pkx-bar-in-left;
}

.pkx-bar-right {
  transform: translateX(105%);
  animation-name: pkx-bar-in-right;
}

@keyframes pkx-bar-in-left {
  0%   { transform: translateX(-105%); }
  100% { transform: translateX(0); }
}

@keyframes pkx-bar-in-right {
  0%   { transform: translateX(105%); }
  100% { transform: translateX(0); }
}
</style>
