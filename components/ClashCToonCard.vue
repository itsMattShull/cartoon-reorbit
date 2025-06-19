<template>
  <div
    :class="[
      'border rounded bg-white flex flex-col items-center justify-center select-none transition',
      sizeClasses.outer,
      { 'cursor-pointer': true },
      isSelected && 'ring-2 ring-indigo-400'
    ]"
    :draggable="isDraggable"
    @dragstart="dragStart"
    @click="handleClick"
  >
    <img
      :src="card.assetPath"
      :alt="card.name"
      :class="[sizeClasses.img, 'object-contain mb-0.5']"
    />
    <span :class="['font-semibold truncate w-full px-1 leading-none', sizeClasses.name]">
      {{ card.name }}
    </span>
    <span :class="['text-gray-500 leading-none', sizeClasses.stats]">
      P{{ card.power }} · C{{ card.cost }}
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  card:        { type: Object, required: true },
  size:        { type: String, default: 'small' }, // 'small' | 'large'
  selectedId:  { type: [String, Number], default: null } // ← NEW
})

const emit = defineEmits(['select'])

/* ---------- visual helpers ---------- */
const isDraggable = computed(() => props.size === 'large')
const isSelected  = computed(() => props.card.id === props.selectedId)

const sizeClasses = computed(() => props.size === 'large'
  ? { outer: 'w-24 h-36 text-xs', img: 'w-20 h-20',
      name: 'text-[11px]', stats: 'text-[10px]' }
  : { outer: 'w-16 h-24 text-[10px]', img: 'w-12 h-12',
      name: 'text-[10px]', stats: 'text-[9px]' }
)

/* ---------- events ---------- */
function dragStart (evt) {
  if (evt.dataTransfer && isDraggable.value) {
    evt.dataTransfer.setData('ctoon-id', props.card.id)
  }
}

function handleClick () {
  emit('select', props.card)
}
</script>

<style scoped>
/* optional hover scale for large cards */
.cursor-pointer:hover { transform: scale(1.03); }
</style>
