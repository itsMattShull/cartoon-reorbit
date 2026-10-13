<!-- components/GtoonCard.vue -->
<!-- The round "UFO" card used to show Original gToons everywhere a cToon image would normally appear.
     Markup + CSS are ported from the drawcard prototype (assets/css/gtoon-card.css, scoped under
     .gtoon-card-host); behavior lives in lib/gtoonCardEngine.js.

     effects="static"  → instant Signal-state card (value, color, art, barcode). No animation, no card-fx.js.
     effects="full"    → Noise/Signal transition + the admin-saved one-shot / ambient effects.

     The card fills the width of its parent (1:1). The DOM inside .card is mutated imperatively by the
     engine, so this template deliberately has NO reactive bindings below the host element. -->
<template>
  <div ref="host" class="gtoon-card-host" :aria-label="altText" role="img">
    <div ref="cardEl" class="card">
      <div class="e1"></div>
      <div class="e2"></div>
      <div class="ufo">
        <div class="ufo_small">
          <div class="e3"></div>
          <div class="img_wrap"></div>
        </div>
        <div class="shadow"></div>
        <div class="ufo_state0">
          <div class="wvring">
            <div class="wvring-sweep"></div>
            <div class="shader"></div>
          </div>
        </div>
        <div class="heatshield">
          <div class="barrier"></div>
          <div class="barrier0"></div>
          <div class="inner2"></div>
          <div class="inner"><div class="spec"></div></div>
          <div class="ufo_state">
            <div class="energy">
              <div class="spec"></div>
              <div class="wv"><div class="ptext">0</div></div>
              <div class="wv-border"></div>
            </div>
            <div class="energy2"></div>
          </div>
        </div>
        <div class="reflection"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import '@/assets/css/gtoon-card.css'
import { sanitizeGtoonCardStyle } from '@/utils/gtoonCardStyle'
import {
  setCardImage, setCardValue, setCardTheme, setCardRotation, setCardColor, setCardBarcodeSeed,
  renderCardStatic, setCardMode, playOneShot as engPlayOneShot, startAmbient as engStartAmbient,
  stopAmbient as engStopAmbient, clearCardFx, destroyCard
} from '@/lib/gtoonCardEngine'

const props = defineProps({
  imageUrl: { type: String, default: '' },
  value: { type: [Number, String], default: 0 },
  color: { type: String, default: 'SILVER' },        // Ctoon.gtoonColor enum value
  cardStyle: { type: [Object, String], default: null }, // Ctoon.gtoonCardStyle
  mode: { type: String, default: 'signal' },          // 'signal' | 'noise' (full effects only)
  effects: { type: String, default: 'static' },       // 'static' | 'full'
  seed: { type: String, default: '' },                // barcode seed (ctoon id)
  alt: { type: String, default: '' },
  playOnReveal: { type: Boolean, default: true },     // full: play saved one-shot FX when it turns Signal
  ambient: { type: Boolean, default: true },          // full: run saved ambient loops while Signal
  sweepOnColorChange: { type: Boolean, default: true } // run the UFO Color Sweep when `color` changes
})
const emit = defineEmits(['revealed'])

const host = ref(null)
const cardEl = ref(null)
let ro = null
let mounted = false

const style = computed(() => sanitizeGtoonCardStyle(props.cardStyle))
const isFull = computed(() => props.effects === 'full')
const altText = computed(() => (props.alt ? `${props.alt} (${props.value})` : `gToon ${props.value}`))

function fitScale() {
  const w = host.value?.clientWidth
  if (w) host.value.style.setProperty('--gc-scale', String(w / 384))
}

function applyAppearance() {
  const c = cardEl.value
  if (!c) return
  setCardTheme(c, style.value.theme)
  setCardRotation(c, style.value.rotation)
  setCardImage(c, props.imageUrl, props.alt)
  setCardValue(c, props.value)
  setCardBarcodeSeed(c, props.seed)
}

async function revealFlow() {
  const c = cardEl.value
  if (!c) return
  await setCardMode(c, props.mode === 'noise' ? 0 : 1, { themeFx: true })
  if (props.mode === 'noise' || !cardEl.value) return
  emit('revealed')
  const p = style.value.params
  if (props.playOnReveal) {
    for (const key of style.value.oneShot) engPlayOneShot(c, key, p)
  }
  if (props.ambient) {
    for (const key of style.value.ambient) engStartAmbient(c, key, p)
  }
}

onMounted(async () => {
  await nextTick()
  const c = cardEl.value
  if (!c) return
  fitScale()
  ro = new ResizeObserver(fitScale)
  ro.observe(host.value)
  applyAppearance()
  await setCardColor(c, props.color, { animate: false })
  // Start honouring prop changes now, not after the reveal: data that arrives while the card is powering on
  // (e.g. the properties dialog fetching the printed values) must not be dropped.
  mounted = true
  // ...and pick up anything that changed while the awaits above were pending.
  applyAppearance()
  setCardColor(c, props.color, { animate: false })
  if (isFull.value) {
    await revealFlow()
  } else {
    renderCardStatic(c)
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  if (cardEl.value) destroyCard(cardEl.value)
})

watch(() => [props.imageUrl, props.value, props.seed, style.value.theme, style.value.rotation], () => {
  if (!mounted) return
  applyAppearance()
})

// Mid-match / admin color changes: UFO Color Sweep on this instance only (never touches saved data).
watch(() => props.color, (next) => {
  if (!mounted || !cardEl.value) return
  setCardColor(cardEl.value, next, { animate: props.sweepOnColorChange && isFull.value })
})

watch(() => props.mode, () => {
  if (!mounted || !isFull.value) return
  revealFlow()
})

// Saved effect lists changed (admin preview): restart ambient loops to match.
watch(() => [style.value.ambient.join(','), props.ambient], () => {
  if (!mounted || !isFull.value || props.mode === 'noise') return
  engStopAmbient(cardEl.value)
  if (props.ambient) for (const key of style.value.ambient) engStartAmbient(cardEl.value, key, style.value.params)
})

defineExpose({
  playOneShot: (key) => cardEl.value && engPlayOneShot(cardEl.value, key, style.value.params),
  startAmbient: (key) => cardEl.value && engStartAmbient(cardEl.value, key, style.value.params),
  stopAmbient: (key) => cardEl.value && engStopAmbient(cardEl.value, key),
  clearFx: () => cardEl.value && clearCardFx(cardEl.value),
  replay: revealFlow,
  /** Fire every saved one-shot effect once (deck-builder click/hover, admin "test" button). */
  playSaved: () => {
    if (!cardEl.value) return
    for (const key of style.value.oneShot) engPlayOneShot(cardEl.value, key, style.value.params)
  }
})
</script>
