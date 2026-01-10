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

    <!-- 🔹 ability banner -->
    <div class="flex justify-center mb-2 md:mb-1 py-1">
      <span class="bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full px-3 py-1 border border-indigo-200">
        {{ abilityLine }}
      </span>
    </div>

    <!-- hand -->
    <div
      class="
        flex w-full gap-2
        overflow-x-auto overflow-y-hidden
        justify-start md:justify-center
        px-3 -mx-3
        pb-2 md:pb-0
        scroll-px-3
        touch-pan-x
      "
      :class="{ 'cursor-not-allowed opacity-50': cards.length === 0 || disabled }"
    >
      <div v-for="(c, idx) in cards" :key="idx" class="shrink-0">
        <ClashCToonCard
          :card="c"
          :selected="selected === c"
          :afford="c.cost <= remainingEnergy"
          @select="() => { if (!disabled && c.cost <= energy) emit('select', c) }"
          @info="emit('info',$event)"
        />
      </div>
    </div>
    <!-- 🔹 status banner -->
    <div v-if="status" class="flex justify-center mb-2 md:mb-1">
      <span class="bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full px-3 py-1 mt-4 border border-indigo-200">
        {{ status }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import ClashCToonCard from '@/components/ClashCToonCard.vue'
import abilities from '~/data/abilities.json' // remove the assert for broad compatibility

// key → label map
const ABILITY_TEXTS = Object.fromEntries(
  (abilities || []).map(a => [a.key, a.label])
)

const props = defineProps({
  cards:    { type: Array,  default: () => [] },
  energy:   { type: Number, default: 1 },
  selected: { type: Object, default: null }, // null is fine as a default
  disabled: { type: Boolean, default: false },
  remainingEnergy: { type: Number, default: 1 },
  status:   { type: String, default: '' },
})
const emit = defineEmits(['select','info'])

const abilityLine = computed(() => {
  const c = props.selected
  if (!c) return 'No card selected'
  const parts = []
  if (c.abilityKey) {
    const key = String(c.abilityKey)
    parts.push(ABILITY_TEXTS[key] || `Ability: ${key.replace(/_/g, ' ')}`)
  } else {
    parts.push('No ability')
  }
  const t = typeof c.gtoonType === 'string' ? c.gtoonType.trim() : ''
  if (t) parts.push(`Type: ${t}`)
  return parts.join(' • ')
})
</script>


<style scoped>
.flex::-webkit-scrollbar { display: none; } /* hide mobile scrollbar */
</style>
