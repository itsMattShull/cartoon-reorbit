<!-- components/OgGtoonCardTile.vue -->
<!-- One gToon card position on the original gToons board or in the hand: face up (the round gToon card), face
     down (the same card's Noise "back" — never anything identifying), or an empty numbered slot.
     The card and its effects are allowed to extend past the tile; nothing in here clips them.
     Right-click (desktop) or long-press (touch) a face-up card to see its printed properties. -->
<template>
  <div
    class="og-tile relative rounded border-2 flex items-center justify-center select-none transition-colors"
    :class="[sizeClass, ringClass]"
    style="container-type: size"
    v-on="gestureEvents"
    @click.capture="clickCapture"
  >
    <!-- Keyed on face so a face-down -> face-up change replays the flip animation. -->
    <div v-if="card && !faceDown" :key="'face'" class="flip-in w-full h-full flex items-center justify-center" :class="{ 'opacity-40 grayscale': marker && marker.kind === 'knockedOut' }">
      <!-- Round gToon card. Revealed board cards get the Noise→Signal reveal + saved one-shot FX and the
           UFO Color Sweep when their color changes mid-match; hand / not-yet-revealed cards are static. -->
      <div class="aspect-square p-0.5 rounded-full" :class="bump" :style="{ width: 'min(100cqw, 100cqh)' }">
        <GtoonCard
          :image-url="card.assetPath"
          :value="shownValue"
          :color="card.color || 'SILVER'"
          :card-style="card.cardStyle"
          :seed="String(card.ctoonId || card.name || '')"
          :alt="card.name"
          :effects="isRevealed && animate ? 'full' : 'static'"
          :ambient="isRevealed && animate"
        />
      </div>
    </div>
    <!-- Face-down: the card's own Noise back. Deliberately given no art, value, color or look, so nothing
         about a hidden card can be read from the DOM. -->
    <div v-else-if="faceDown" :key="'back'" class="w-full h-full flex items-center justify-center">
      <div class="aspect-square p-0.5" :style="{ width: 'min(100cqw, 100cqh)' }">
        <GtoonCard mode="noise" effects="static" color="SILVER" alt="Face-down gToon" />
      </div>
    </div>
    <span v-else class="text-[10px] text-gray-400">{{ label }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import GtoonCard from '@/components/GtoonCard.vue'
import { useOgGtoonInfo } from '@/composables/useOgGtoonInfo'

const props = defineProps({
  card: { type: Object, default: null },        // hand card ({ value }) or revealed entry ({ finalValue })
  faceDown: { type: Boolean, default: false },
  label: { type: [String, Number], default: '' },
  // 'idle' | 'selected' | 'open' (a slot you can place into) | 'filled' | 'discard'
  tone: { type: String, default: 'idle' },
  size: { type: String, default: 'slot' },      // 'slot' | 'hand'
  animate: { type: Boolean, default: true },    // false → always the static card (e.g. inside a dialog)
  // What the game log says is happening to this card: { kind: 'knockedOut'|'cancelled'|'changed', from?, to? }.
  // Only a knock-out is shown (as a faded card); there are no badges on the tile.
  marker: { type: Object, default: null }
})

// Right-click / long-press -> printed properties. Only a face-up card can be inspected.
const { inspectGesture } = useOgGtoonInfo()
const { clickCapture, ...gestureEvents } = inspectGesture(() => (props.card && !props.faceDown ? props.card : null))

// Revealed entries carry `round`/`slot`; cards still in a hand carry `idx` instead.
const isRevealed = computed(() => props.card?.round != null && props.card?.slot != null)
const shownValue = computed(() => props.card?.finalValue ?? props.card?.value ?? 0)

// Flash the card when powers change its value (green = up, red = down) so players can follow the reveal.
const bump = ref('')
let bumpTimer = null
watch(shownValue, (now, was) => {
  if (was === undefined || now === was || !props.card || props.faceDown) return
  clearTimeout(bumpTimer)
  bump.value = ''
  requestAnimationFrame(() => {
    bump.value = now > was ? 'value-up' : 'value-down'
    bumpTimer = setTimeout(() => { bump.value = '' }, 1000)
  })
})

const sizeClass = computed(() => (props.size === 'hand' ? 'h-24 w-[4.5rem]' : 'h-20'))
// Once a card sits in a board slot (face up or face down) the slot's frame disappears and the card stands on its
// own. The border width stays (transparent) so nothing shifts. Empty slots keep their dashed outline, and hand
// tiles keep their selected / discard highlights, which are interaction feedback rather than a slot frame.
const occupiedSlot = computed(() => props.size === 'slot' && !!(props.card || props.faceDown))
const ringClass = computed(() => {
  if (occupiedSlot.value && (props.tone === 'idle' || props.tone === 'filled')) return 'border-transparent'
  return ({
    selected: 'border-amber-400 bg-amber-500/10',
    open: 'border-dashed border-emerald-400/70 bg-emerald-500/5 cursor-pointer',
    filled: 'border-indigo-400 bg-white/5',
    discard: 'border-red-400 bg-red-500/10 opacity-70',
    idle: props.card || props.faceDown ? 'border-indigo-400 bg-white/5' : 'border-dashed border-white/20 bg-white/5'
  }[props.tone] || 'border-white/20')
})
</script>

<style scoped>
/* No text selection / iOS long-press callout on the card, so a long-press opens the properties instead. */
.og-tile { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
.flip-in { animation: flip-in .35s ease-out }
.value-up { animation: value-up 1s ease-out }
.value-down { animation: value-down 1s ease-out }
@keyframes value-up {
  0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.9) }
  100% { box-shadow: 0 0 0 14px rgba(74, 222, 128, 0) }
}
@keyframes value-down {
  0% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.9) }
  100% { box-shadow: 0 0 0 14px rgba(248, 113, 113, 0) }
}
@keyframes flip-in {
  from { transform: rotateY(90deg) }
  to { transform: rotateY(0) }
}
</style>
