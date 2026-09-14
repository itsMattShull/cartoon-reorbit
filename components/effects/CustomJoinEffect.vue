<template>
  <div class="cje-root" :style="backgroundStyle">
    <div class="cje-stack">
      <div v-if="hasText && config.textPosition === 'ABOVE_IMAGE'" class="cje-text" :style="{ color: config.textColor || '#fff' }">{{ displayText }}</div>

      <img
        v-if="config.imagePath"
        :src="config.imagePath"
        alt=""
        decoding="async"
        class="cje-image"
        :class="{ 'cje-image-ready': imageReady }"
      />

      <div v-if="hasText && config.textPosition !== 'ABOVE_IMAGE'" class="cje-text" :style="{ color: config.textColor || '#fff' }">{{ displayText }}</div>
    </div>
  </div>
</template>

<script setup>
import { cmoonJoinEffectBackgroundStyle } from '~/utils/cmoonJoinEffectBackground'
// Generic admin-composed join effect: background color fades in, the uploaded image scales up
// from center, an optional caption fades in above or below it — then holds until `done` fires.
// The overlay-level fade INTO the site (rather than an abrupt cut) is handled once, for every
// effect type including this one, by the shared host (components/effects/FullscreenEffectHost.vue)
// after `done` — this component only ever fades things IN, never out, so there's no double-fade.
const props = defineProps({
  durationMs: { type: Number, default: 2400 },
  config: { type: Object, required: true },
})
const emit = defineEmits(['done'])

// Flat fill, or (when config.vignette is set) the same radial-gradient darkened-edges look
// several built-in effects hand-author — see utils/cmoonJoinEffectBackground.js.
const backgroundStyle = computed(() => cmoonJoinEffectBackgroundStyle(props.config))

// Caption is admin-authored but rendered as plain text interpolation below — never v-html —
// matching every other effect component's convention, as defense in depth against a compromised
// admin account (see security review).
const displayText = computed(() => (props.config?.text || '').slice(0, 80))
const hasText = computed(() => displayText.value.length > 0)

// The uploaded image is already server-resized to a fixed square canvas with transparent padding
// (see server/api/admin/cmoon-join-effects/[id]/image.post.js), so no client-side aspect-ratio
// guesswork is needed to avoid layout shift. What's NOT guaranteed is that it's already
// downloaded — starting the scale-up transform on an undecoded image reads as a pop-in partway
// through, so the pop-in class is withheld (image stays invisible) until it loads or ~500ms
// passes, whichever first — long enough to usually beat it on a normal connection, short enough
// that a slow one never meaningfully delays the effect's fixed total duration.
const imageReady = ref(!props.config?.imagePath)
let readyTimer = null
let doneTimer = null

onMounted(() => {
  if (props.config?.imagePath && typeof Image !== 'undefined') {
    const preload = new Image()
    let settled = false
    const markReady = () => { if (!settled) { settled = true; imageReady.value = true } }
    preload.onload = markReady
    preload.onerror = markReady
    preload.src = props.config.imagePath
    readyTimer = setTimeout(markReady, 500)
  }
  doneTimer = setTimeout(() => emit('done'), props.durationMs)
})

onBeforeUnmount(() => {
  if (readyTimer) clearTimeout(readyTimer)
  if (doneTimer) clearTimeout(doneTimer)
})
</script>

<style scoped>
.cje-root {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  opacity: 0;
  animation: cje-bg-fade 450ms ease-out forwards;
}

@keyframes cje-bg-fade {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

.cje-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3vh;
  max-width: 100%;
  max-height: 92vh;
  padding: 0 6vw;
  box-sizing: border-box;
}

.cje-image {
  /* Bounded by both viewport axes so a very tall/short screen never clips it, and by a max
     pixel size so it doesn't blow up huge on a large desktop display either. */
  width: min(70vw, 420px);
  max-width: 70vw;
  max-height: 55vh;
  aspect-ratio: 1 / 1;
  object-fit: contain;
  display: block;
  opacity: 0;
  transform: scale(0.25);
  /* Compositor-only properties (transform + opacity), matching every other effect component —
     no width/height animation, which would force layout on every frame. */
  transition: opacity 550ms cubic-bezier(0.2, 0.9, 0.3, 1.1), transform 650ms cubic-bezier(0.2, 1.2, 0.3, 1);
}

.cje-image-ready {
  opacity: 1;
  transform: scale(1);
}

.cje-text {
  font-family: "FuturaBdCnBT", "Arial Narrow", Arial, Helvetica, sans-serif;
  font-weight: 700;
  text-align: center;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  /* Scales with viewport but stays readable on a 320px phone and never overruns a short one —
     paired with the 80-character server-side cap so it can't overflow this box regardless. */
  font-size: clamp(1.25rem, 5.5vw, 2.75rem);
  line-height: 1.15;
  max-width: min(80vw, 640px);
  overflow-wrap: break-word;
  opacity: 0;
  animation: cje-text-fade 500ms ease-out 350ms forwards;
}

@keyframes cje-text-fade {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
</style>
