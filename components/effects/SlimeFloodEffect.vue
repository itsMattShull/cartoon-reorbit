<template>
  <div class="sfd-root" :style="{ animationDuration: durationMs + 'ms' }">
    <img src="/effects/slime.gif" alt="" class="sfd-gif" />
    <div class="sfd-orange" :style="{ animationDelay: orangeDelayMs + 'ms', animationDuration: orangeMs + 'ms' }"></div>
  </div>
</template>

<script setup>
// The provided transparent slime .gif plays full-screen (its own animation is the "pours down and
// floods" motion — no CSS drip shapes needed anymore), then a solid orange wash fades in over it,
// holds, then the whole thing (gif + orange) fades to transparent together via the root's own
// opacity animation. Root uses `position:absolute;inset:0` (inherited from the host's fixed,
// 100dvh overlay) rather than any `vh` unit of its own — the mobile-browser-chrome/dvh pitfall the
// host's own comment already documents (see mobile review on the original version of this effect).
const props = defineProps({
  durationMs: { type: Number, default: 2800 },
})
const emit = defineEmits(['done'])

// The gif plays alone for the first ~40% of the budget, then the orange wash fades in over the
// next ~22% — the existing root-level fade (see the CSS keyframe below, fixed at 72%/100% of the
// FULL duration) starts only once that's finished, leaving a short hold beat before everything
// fades out together.
const orangeDelayMs = Math.round(props.durationMs * 0.4)
const orangeMs = Math.round(props.durationMs * 0.22)

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

.sfd-gif {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* object-position top: the gif pours from its own top edge, so top-aligning the crop keeps
     that motion visible even where `cover` has to crop the sides on a narrow phone. */
  object-fit: cover;
  object-position: center top;
  display: block;
}

.sfd-orange {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 40%, #ffb347 0%, #ff8c00 55%, #b35900 100%);
  opacity: 0;
  animation-name: sfd-orange-in;
  animation-timing-function: ease-out;
  animation-fill-mode: both;
}

@keyframes sfd-orange-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
</style>
