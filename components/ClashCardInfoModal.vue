<!-- components/CardInfoModal.vue -->
<template>
  <!-- backdrop listens for clicks -->
  <div
    class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
    @click="$emit('close')"
  >
    <!-- inner dialog stops the click from bubbling up -->
    <div
      class="bg-white rounded-lg p-6 w-80 relative"
      @click.stop
    >
      <button
        @click="$emit('close')"
        class="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-xl font-bold"
      >
        ×
      </button>

      <div class="flex flex-col items-center">
        <img
          :src="card.assetPath"
          :alt="card.name"
          class="w-32 h-32 object-contain mb-4"
        />
        <h3 class="text-xl font-semibold mb-2">{{ card.name }}</h3>
      </div>

      <dl class="text-sm space-y-1">
        <div>
          <dt class="font-medium">Cost:</dt>
          <dd>{{ card.cost }}</dd>
        </div>
        <div>
          <dt class="font-medium">Power:</dt>
          <dd>{{ card.power }}</dd>
        </div>
        <div>
          <dt class="font-medium">Ability:</dt>
          <dd v-if="card.abilityKey">{{ abilityLabel(card.abilityKey) }}</dd>
          <dd v-else class="text-gray-500">None</dd>
        </div>
      </dl>
    </div>
  </div>
</template>


<script setup>
import abilities from '../data/abilities.json'

const props = defineProps({
  card: { type: Object, required: true }
})
const emit = defineEmits(['close'])

function abilityLabel(key) {
  const entry = abilities.find(a => a.key === key)
  return entry?.label ?? key
}
</script>

<style scoped>
/* tweak as you like */
</style>
