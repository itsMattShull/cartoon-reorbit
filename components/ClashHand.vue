<template>
  <div
    class="fixed bottom-0 inset-x-0 p-3 bg-neutral-900 bg-opacity-95 md:static md:bg-transparent md:p-0"
    :class="disabled && 'pointer-events-none opacity-60'"
  >
    <!-- energy badge -->
    <div class="flex justify-center mb-2 md:mb-1">
      <span class="bg-indigo-600 text-white text-xs font-semibold rounded-full px-3 py-1 shadow">
        Energy: {{ energy }} / 6
      </span>
    </div>

    <!-- hand -->
    <div
      class="flex justify-center gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0"
      :class="{ 'cursor-not-allowed opacity-50': cards.length === 0 || disabled }"
    >
      <ClashCToonCard
        v-for="c in cards"
        :key="c.id"
        :card="c"
        :selected="selected && selected.id === c.id"
        :afford="c.cost <= remainingEnergy"
        @select="handleSelect"
        @info="emit('info',$event)"
      />
    </div>
  </div>
</template>

<script setup>
import ClashCToonCard from '@/components/ClashCToonCard.vue'

const props = defineProps({
  cards:    { type: Array,  default: () => [] },
  energy:   { type: Number, default: 1 },
  selected: { type: [Object, null], default: null },
  disabled: { type: Boolean, default: false },
  remainingEnergy: { type: Number, default: 1 },
})
const emit = defineEmits(['select','info'])

function handleSelect (card) {
  if (props.disabled) return
  if (card.cost > props.energy) return       // can’t afford → ignore click
  emit('select', card)
}
</script>

<style scoped>
.flex::-webkit-scrollbar { display: none; } /* hide mobile scrollbar */
</style>
