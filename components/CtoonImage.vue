<!-- components/CtoonImage.vue -->
<!-- Drop-in replacement for `<img :src="ctoon.assetPath">` anywhere a cToon is shown. Original gToons
     render as the round GtoonCard; every other cToon renders the same plain <img> as before.

     Attributes (class, style, draggable, loading, @click ...) are forwarded to whichever root is used, so
     existing sizing classes keep working. For OG gToons the card is a 1:1 box, so it fits inside the
     box the image used to occupy (set a width OR a height on it; or pass `size`).

     effects: 'static' (default; no animation) | 'full' (Noise→Signal + saved effects). -->
<template>
  <div
    v-if="isOg"
    class="ctoon-image-og"
    :style="size ? { width: size } : null"
    @mouseenter="onHover"
    @click="onHover"
  >
    <GtoonCard
      ref="cardRef"
      :image-url="src"
      :value="ctoon.gtoonValue ?? 0"
      :color="ctoon.gtoonColor || 'SILVER'"
      :card-style="ctoon.gtoonCardStyle"
      :effects="effects"
      :mode="mode"
      :seed="seed"
      :alt="altText"
      :play-on-reveal="playOnReveal"
      :ambient="ambient"
    />
  </div>
  <img v-else :src="src" :alt="altText" />
</template>

<script setup>
import { computed, ref } from 'vue'
import GtoonCard from '@/components/GtoonCard.vue'

defineOptions({ inheritAttrs: true })

const props = defineProps({
  // A cToon-ish record: { assetPath, name, id|ctoonId, isOgGtoon, gtoonValue, gtoonColor, gtoonCardStyle }
  ctoon: { type: Object, default: () => ({}) },
  src: { type: String, default: '' },       // overrides ctoon.assetPath
  alt: { type: String, default: '' },
  effects: { type: String, default: 'static' },
  mode: { type: String, default: 'signal' },
  size: { type: String, default: '' },       // optional CSS width for the OG card, e.g. '6rem'
  playOnReveal: { type: Boolean, default: true },
  ambient: { type: Boolean, default: true },
  // Play the gToon's saved one-shot effects on hover/click (deck builder). Throttled; lazy-loads card-fx.
  hoverFx: { type: Boolean, default: false }
})

const cardRef = ref(null)
const src = computed(() => props.src || props.ctoon?.assetPath || '')
const altText = computed(() => props.alt || props.ctoon?.name || '')
const seed = computed(() => String(props.ctoon?.id || props.ctoon?.ctoonId || props.ctoon?.name || ''))
const isOg = computed(() => !!props.ctoon?.isOgGtoon && !!src.value)

let lastFx = 0
function onHover() {
  if (!props.hoverFx) return
  const now = Date.now()
  if (now - lastFx < 1800) return
  lastFx = now
  cardRef.value?.playSaved?.()
}

defineExpose({
  playSaved: () => cardRef.value?.playSaved?.(),
  replay: () => cardRef.value?.replay?.()
})
</script>

<style scoped>
.ctoon-image-og {
  display: block;
  aspect-ratio: 1 / 1;
  max-width: 100%;
  max-height: 100%;
}
</style>
