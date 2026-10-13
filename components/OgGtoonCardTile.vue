<!-- components/OgGtoonCardTile.vue -->
<!-- One gToon card position on the original gToons board or in the hand: face up (art + value +
     type badges), face down (card back), or an empty numbered slot. Purely presentational. -->
<template>
  <div
    class="relative rounded border-2 flex items-center justify-center overflow-hidden select-none transition-colors"
    :class="[sizeClass, ringClass]"
    style="container-type: size"
  >
    <!-- Keyed on face so a face-down -> face-up change replays the flip animation. -->
    <div v-if="card && !faceDown" :key="'face'" class="flip-in w-full h-full flex items-center justify-center bg-white/5" :class="{ 'opacity-40 grayscale': marker && marker.kind === 'knockedOut' }">
      <!-- Round gToon card. Revealed board cards get the Noise→Signal reveal + saved one-shot FX and the
           UFO Color Sweep when their color changes mid-match; hand / not-yet-revealed cards are static. -->
      <div class="aspect-square p-0.5 rounded-full" :class="bump" :style="{ width: 'min(100cqw, 100cqh)' }" :title="`${card.name} (${shownValue})`">
        <GtoonCard
          :image-url="card.assetPath"
          :value="shownValue"
          :color="card.color || 'SILVER'"
          :card-style="card.cardStyle"
          :seed="String(card.ctoonId || card.name || '')"
          :alt="card.name"
          :effects="isRevealed && animate ? 'full' : 'static'"
          :ambient="false"
        />
      </div>
      <span v-if="markerInfo" class="absolute top-0 right-0 text-[8px] font-bold leading-none px-1 py-0.5 rounded-bl text-white" :class="markerInfo.cls" :title="markerInfo.title">{{ markerInfo.text }}</span>
      <div v-if="badges.length" class="absolute bottom-0 inset-x-0 flex flex-wrap justify-center gap-0.5 px-0.5 pb-0.5">
        <span v-for="b in badges" :key="b" class="text-[7px] leading-none px-1 py-0.5 rounded bg-black/60 text-gray-100">{{ b }}</span>
      </div>
    </div>
    <div v-else-if="faceDown" :key="'back'" class="card-back w-full h-full flex items-center justify-center">
      <span class="text-white/80 font-extrabold text-sm tracking-tight">gT</span>
    </div>
    <span v-else class="text-[10px] text-gray-400">{{ label }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import GtoonCard from '@/components/GtoonCard.vue'

const props = defineProps({
  card: { type: Object, default: null },        // hand card ({ value }) or revealed entry ({ finalValue })
  faceDown: { type: Boolean, default: false },
  label: { type: [String, Number], default: '' },
  // 'idle' | 'selected' | 'open' (a slot you can place into) | 'filled' | 'discard'
  tone: { type: String, default: 'idle' },
  size: { type: String, default: 'slot' },      // 'slot' | 'hand'
  animate: { type: Boolean, default: true },    // false → always the static card (e.g. inside a dialog)
  // What the game log says is happening to this card: { kind: 'knockedOut'|'cancelled'|'changed', from?, to? }
  marker: { type: Object, default: null }
})

const markerInfo = computed(() => {
  const m = props.marker
  if (!m) return null
  if (m.kind === 'knockedOut') return { text: 'OUT', cls: 'bg-red-600', title: 'Knocked out: the same gToon is on both boards, so it scores 0 and its powers are off.' }
  if (m.kind === 'cancelled') return { text: 'CANCELLED', cls: 'bg-amber-600', title: "This card's powers are cancelled." }
  return { text: `${m.from}→${m.to}`, cls: 'bg-sky-600', title: `Value changed from ${m.from} to ${m.to} by powers (see the Game Log).` }
})

const GROUP_LABELS = {
  BEAN_SCOUTS: 'Bean Scouts', DAILY_PLANET: 'Daily Planet', GLOBAL: 'G.L.O.B.A.L.',
  IMAGINARY_FRIEND: 'Imaginary Friend', INJUSTICE_GANG: 'Injustice Gang', JUSTICE_FRIENDS: 'Justice Friends',
  JUSTICE_LEAGUE: 'Justice League', MUCHA_LUCHA: 'Mucha Lucha', MYSTERY_INC: 'Mystery, Inc.',
  POWERPUFF_GIRLS: 'Powerpuff Girls', SQUIRREL_SCOUTS: 'Squirrel Scouts', TEEN_TITANS: 'Teen Titans',
  TIME_SQUAD: 'Time Squad', WOOHP: 'WOOHP'
}
const titleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s)

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
const badges = computed(() => {
  const c = props.card
  if (!c) return []
  const out = [c.type1, c.type2, c.type3].filter(Boolean).map(titleCase)
  if (c.group) out.push(GROUP_LABELS[c.group] || c.group)
  return out
})
const sizeClass = computed(() => (props.size === 'hand' ? 'h-24 w-[4.5rem]' : 'h-20'))
const ringClass = computed(() => ({
  selected: 'border-amber-400 bg-amber-500/10',
  open: 'border-dashed border-emerald-400/70 bg-emerald-500/5 cursor-pointer',
  filled: 'border-indigo-400 bg-white/5',
  discard: 'border-red-400 bg-red-500/10 opacity-70',
  idle: props.card || props.faceDown ? 'border-indigo-400 bg-white/5' : 'border-dashed border-white/20 bg-white/5'
}[props.tone] || 'border-white/20'))
</script>

<style scoped>
.card-back {
  background: repeating-linear-gradient(45deg, #1e3a8a, #1e3a8a 6px, #1d4ed8 6px, #1d4ed8 12px);
}
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
