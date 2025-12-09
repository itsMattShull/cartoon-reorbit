<template>
  <div class="flex flex-wrap items-end gap-3 mb-6">
    <!-- Name filter with local suggestions -->
    <div class="flex-1">
      <label class="block text-xs font-medium mb-1">cToon Name</label>
      <div class="relative">
        <input
          :value="internalName"
          @input="onNameInput"
          @focus="showSuggest = true"
          @blur="onBlur"
          type="text"
          placeholder="Type at least 3 characters…"
          class="w-full min-w-[200px] border rounded px-3 py-2"
        />
        <div
          v-if="showSuggest && nameSuggestions.length"
          class="absolute z-10 w-full bg-white border rounded mt-1 max-h-48 overflow-auto"
        >
          <button
            v-for="s in nameSuggestions"
            :key="s"
            class="w-full text-left px-3 py-1.5 hover:bg-indigo-50"
            @mousedown.prevent="applySuggestion(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>
    </div>

    <!-- Set -->
    <div>
      <label class="block text-xs font-medium mb-1">Set</label>
      <select
        class="border rounded px-3 py-2 max-w-[152px]"
        :value="setValue"
        @change="$emit('update:set-filter', $event.target.value)"
      >
        <option v-for="opt in setOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- Series -->
    <div>
      <label class="block text-xs font-medium mb-1">Series</label>
      <select
        class="border rounded px-3 py-2 max-w-[152px]"
        :value="seriesValue"
        @change="$emit('update:series-filter', $event.target.value)"
      >
        <option v-for="opt in seriesOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- Rarity toggle -->
    <div>
      <label class="block text-xs font-medium mb-1">Rarity</label>
      <select
        class="border rounded px-3 py-2 max-w-[152px]"
        :value="rarityValue"
        @change="$emit('update:rarity-filter', $event.target.value)"
      >
        <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- Duplicates -->
    <div>
      <label class="block text-xs font-medium mb-1">Duplicates</label>
      <select
        class="border rounded px-3 py-2 max-w-[152px]"
        :value="duplicatesFilter"
        @change="$emit('update:duplicates-filter', $event.target.value)"
      >
        <option value="all">All</option>
        <option value="dups">Only Duplicates</option>
      </select>
    </div>

    <!-- Owned toggle -->
    <div>
      <label class="block text-xs font-medium mb-1">
        {{ context === 'other' ? 'Owned (by you)' : 'Owned by User' }}
      </label>
      <select
        class="border rounded px-3 py-2 max-w-[152px]"
        :value="ownedFilter"
        @change="$emit('update:owned-filter', $event.target.value)"
      >
        <option value="all">All</option>
        <option value="owned">Owned</option>
        <option value="unowned">Unowned</option>
      </select>
    </div>

    <!-- Extra inline controls slot (e.g., Wishlist checkbox) -->
    <slot />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  context: { type: String, required: true },
  nameQuery: { type: String, default: '' },
  nameSuggestions: { type: Array, default: () => [] },
  setOptions: { type: Array, default: () => ['All'] },
  seriesOptions: { type: Array, default: () => ['All'] },
  rarityOptions: { type: Array, default: () => ['All'] },
  ownedFilter: { type: String, default: 'all' },
  setValue: { type: String, default: 'All' },
  seriesValue: { type: String, default: 'All' },
  rarityValue: { type: String, default: 'All' },
  duplicatesFilter: { type: String, default: 'all' }
})

const emit = defineEmits([
  'update:name-query',
  'update:set-filter',
  'update:series-filter',
  'update:rarity-filter',
  'update:owned-filter',
  'update:duplicates-filter',
  'request-name-suggest'
])

const internalName = ref(props.nameQuery)
const showSuggest = ref(false)

watch(() => props.nameQuery, (n) => {
  internalName.value = n
})

function onNameInput(e) {
  internalName.value = e.target.value
  emit('update:name-query', internalName.value)
  showSuggest.value = true
  emit('request-name-suggest', internalName.value)
}

function applySuggestion(s) {
  internalName.value = s
  emit('update:name-query', s)
  showSuggest.value = false
}

function onBlur() {
  // small delay so click on suggestion (mousedown) can fire first
  setTimeout(() => { showSuggest.value = false }, 120)
}
</script>
