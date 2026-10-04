<!-- components/OgGtoonCardTile.vue -->
<!-- One gToon card position on the original gToons board or in the hand: face up (art + value +
     type badges), face down (card back), or an empty numbered slot. Purely presentational. -->
<template>
  <div
    class="relative rounded border-2 flex items-center justify-center overflow-hidden select-none transition-colors"
    :class="[sizeClass, ringClass]"
  >
    <!-- Keyed on face so a face-down -> face-up change replays the flip animation. -->
    <div v-if="card && !faceDown" :key="'face'" class="flip-in w-full h-full flex items-center justify-center bg-white/5">
      <img :src="card.assetPath" :alt="card.name" :title="`${card.name} (${shownValue})`" class="h-full w-full object-contain p-0.5" />
      <span class="absolute top-0 left-0 text-[10px] font-bold leading-none px-1 py-0.5 rounded-br bg-black/70 text-white">{{ shownValue }}</span>
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
import { computed } from 'vue'

const props = defineProps({
  card: { type: Object, default: null },        // hand card ({ value }) or revealed entry ({ finalValue })
  faceDown: { type: Boolean, default: false },
  label: { type: [String, Number], default: '' },
  // 'idle' | 'selected' | 'open' (a slot you can place into) | 'filled' | 'discard'
  tone: { type: String, default: 'idle' },
  size: { type: String, default: 'slot' }       // 'slot' | 'hand'
})

const GROUP_LABELS = {
  BEAN_SCOUTS: 'Bean Scouts', DAILY_PLANET: 'Daily Planet', GLOBAL: 'G.L.O.B.A.L.',
  IMAGINARY_FRIEND: 'Imaginary Friend', INJUSTICE_GANG: 'Injustice Gang', JUSTICE_FRIENDS: 'Justice Friends',
  JUSTICE_LEAGUE: 'Justice League', MUCHA_LUCHA: 'Mucha Lucha', MYSTERY_INC: 'Mystery, Inc.',
  POWERPUFF_GIRLS: 'Powerpuff Girls', SQUIRREL_SCOUTS: 'Squirrel Scouts', TEEN_TITANS: 'Teen Titans',
  TIME_SQUAD: 'Time Squad', WOOHP: 'WOOHP'
}
const titleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s)

const shownValue = computed(() => props.card?.finalValue ?? props.card?.value ?? 0)
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
@keyframes flip-in {
  from { transform: rotateY(90deg) }
  to { transform: rotateY(0) }
}
</style>
