<template>
  <div class="relative">
    <label v-if="label" class="block text-sm font-medium text-gray-700 mb-1">{{ label }}</label>
    <input
      type="text"
      v-model="searchTerm"
      @focus="showDropdown = true"
      @input="showDropdown = true"
      :placeholder="modelValue ? modelValue.name : placeholder"
      class="w-full border border-gray-300 rounded-md px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    />
    <button
      v-if="modelValue"
      type="button"
      @click="clearSelection"
      class="absolute right-2 top-9 text-gray-400 hover:text-gray-600"
      aria-label="Clear selection"
    >✕</button>

    <ul
      v-if="showDropdown && filteredMatches.length"
      class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-56 overflow-y-auto"
    >
      <li
        v-for="c in filteredMatches"
        :key="c.id"
        @mousedown.prevent="select(c)"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-indigo-50"
      >
        <img :src="c.assetPath" alt="" class="w-8 h-8 rounded object-cover border shrink-0" />
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">{{ c.name }}</p>
          <p class="text-xs text-gray-500 capitalize">
            {{ c.rarity }}
            <span v-if="c.quantity !== null && c.totalMinted >= c.quantity" class="text-red-600 font-medium">· sold out</span>
          </p>
        </div>
      </li>
    </ul>

    <div v-if="modelValue" class="mt-2 flex items-center gap-3">
      <img :src="modelValue.assetPath" alt="" class="w-12 h-12 rounded border object-cover" />
      <div>
        <p class="text-sm font-medium">{{ modelValue.name }}</p>
        <p class="text-xs text-gray-500 capitalize">{{ modelValue.rarity }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
// Reusable cToon search/select input. games.vue duplicates this markup+logic three times
// inline (Grand Prize / Add-modal / Edit-modal pickers) — new usages should use this instead
// of adding a fourth copy.
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: null }, // { id, name, rarity, assetPath, quantity }
  label: { type: String, default: '' },
  placeholder: { type: String, default: 'Type a cToon name…' }
})
const emit = defineEmits(['update:modelValue'])

const allCtoons = ref([])
const searchTerm = ref('')
const showDropdown = ref(false)

onMounted(async () => {
  try {
    allCtoons.value = await $fetch('/api/admin/game-ctoons')
  } catch {
    allCtoons.value = []
  }
  if (props.modelValue?.name) searchTerm.value = props.modelValue.name
})

const filteredMatches = computed(() => {
  const t = searchTerm.value.trim().toLowerCase()
  if (!t) return allCtoons.value.slice(0, 25)
  return allCtoons.value.filter(c => c.name.toLowerCase().includes(t)).slice(0, 25)
})

function select(c) {
  searchTerm.value = c.name
  showDropdown.value = false
  emit('update:modelValue', c)
}

function clearSelection() {
  searchTerm.value = ''
  emit('update:modelValue', null)
}
</script>
