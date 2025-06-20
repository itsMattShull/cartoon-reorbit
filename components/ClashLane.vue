<template>
  <div
    class="relative flex flex-col justify-between border rounded p-2 h-44 md:h-60 bg-white"
    :class="[
      lane.revealed ? 'opacity-100' : 'opacity-40',
      highlight ? 'ring-4 ring-indigo-400' : ''
    ]"
    @dragover.prevent
    @drop="dropHandler"
  >
    <!-- Lane title + effect -->
    <header class="text-xs font-bold mb-1 text-center">
      {{ lane.revealed ? lane.name : '?? ?? ??' }}
    </header>
    <p
      v-if="lane.revealed"
      class="text-[10px] mb-2 text-center text-gray-600 min-h-[28px]"
    >
      {{ lane.desc }}
    </p>

    <!-- CToon stacks -->
    <div class="flex justify-between gap-1">
      <div class="flex gap-0">
        <ClashCToonCard v-for="c in lane.player" :key="c.id" :card="c" small />
      </div>
      <div class="flex gap-0">
        <ClashCToonCard v-for="c in lane.ai" :key="c.id" :card="c" small />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  lane: Object,
  laneIndex: Number,
  highlight: Boolean
})
const emit = defineEmits(['drop-card'])

function dropHandler (evt) {
  const cardId = evt.dataTransfer.getData('ctoon-id')
  if (cardId) emit('drop-card', cardId)
}
</script>
