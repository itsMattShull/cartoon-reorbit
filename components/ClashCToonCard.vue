<template>
  <div
    class="border rounded bg-white flex flex-col items-center justify-center text-[10px] w-16 h-24"
    :class="{ 'cursor-pointer': !small }"
    :draggable="!small"
    @dragstart="dragStart"
  >
    <img :src="card.assetPath" :alt="card.name" class="w-12 h-12 object-contain mb-0.5" />
    <span class="font-semibold truncate w-full px-1 leading-none">{{ card.name }}</span>
    <span class="text-[9px] text-gray-500 leading-none">P{{ card.power }} · C{{ card.cost }}</span>
  </div>
</template>

<script setup>
defineProps({
  card: Object,
  small: Boolean
})

function dragStart (evt) {
  // Only the full-size hand cards are draggable; board copies are `small`
  if (evt.dataTransfer && !props.small) {
    evt.dataTransfer.setData('ctoon-id', props.card.id)
  }
}
</script>
