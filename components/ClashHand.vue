<template>
  <!-- Wrapper sticks to bottom on mobile, static on desktop -->
  <div
    class="fixed bottom-0 inset-x-0 p-3 bg-neutral-900 bg-opacity-95 md:static md:bg-transparent md:p-0"
    :class="disabled && 'pointer-events-none opacity-60'"
  >
    <!-- Energy badge -->
    <div class="flex justify-center mb-2 md:mb-1">
      <span
        class="bg-indigo-600 text-white text-xs font-semibold rounded-full px-3 py-1 shadow"
      >
        Energy: {{ energy }} / 6
      </span>
    </div>

    <!-- Hand row -->
    <div
      class="flex justify-center gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0"
      :class="{ 'cursor-not-allowed opacity-50': cards.length === 0 || disabled }"
    >
      <ClashCToonCard
        v-for="c in cards"
        :key="c.id"
        :card="c"
        :selected="selected && selected.id === c.id"
        @click="handleSelect(c)"
      />
    </div>
  </div>
</template>

<script setup>
/* ------------------------------------------------------------------
   Hand component – shows player cards, handles selection
------------------------------------------------------------------ */
import ClashCToonCard from '@/components/ClashCToonCard.vue'

const props = defineProps({
  cards:     { type: Array,  default: () => [] },
  energy:    { type: Number, default: 1 },
  selected:  { type: [Object, null], default: null },
  disabled:  { type: Boolean, default: false }   // NEW
})
const emit = defineEmits(['select'])

function handleSelect (card) {
  if (props.disabled) return
  if (card.cost > props.energy) return   // cannot afford
  emit('select', card)
}
</script>

<style scoped>
/* Hide scrollbars on mobile */
.flex::-webkit-scrollbar { display: none; }
</style>
