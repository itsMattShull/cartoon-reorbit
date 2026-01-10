<template>
  <button
    @click="$emit('toggle')"
    :aria-pressed="selected ? 'true' : 'false'"
    :class="[
      'relative w-full text-left border rounded p-2 hover:shadow transition',
      selected ? 'border-indigo-500 bg-indigo-50' : ''
    ]"
  >
    <!-- Badge (Owned/Unowned or custom) -->
    <span
      v-if="badge"
      class="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold rounded-full"
      :class="badgeClassComputed"
    >
      {{ badge }}
    </span>

    <!-- Thumb -->
    <img
      :src="ctoon.assetPath"
      :alt="ctoon.name"
      class="w-full h-28 object-contain mb-2 mt-6"
      loading="lazy"
      draggable="false"
    />

    <!-- Meta -->
    <p class="text-sm font-medium leading-tight truncate">{{ ctoon.name }}</p>
    <p class="text-xs text-gray-600">{{ ctoon.rarity }}</p>

    <p v-if="ctoon.mintNumber != null" class="text-xs text-gray-600">
      Mint #{{ ctoon.mintNumber }}
      <template v-if="quantityDisplay"> of {{ quantityDisplay }}</template>
    </p>

    <p v-if="hasEdition" class="text-xs text-gray-600">
      {{ editionLabel }}
    </p>

    <!-- Selected tag -->
    <div
      v-if="selected"
      class="absolute -top-2 -left-2 bg-indigo-500 text-white text-xs px-2 py-0.5 rounded"
    >
      Selected
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue'

/**
 * Expects a flattened cToon object shaped like your collection responses, e.g.:
 * {
 *   id, ctoonId, assetPath, name, rarity,
 *   mintNumber, isFirstEdition, quantity? (nullable or missing)
 * }
 */
const props = defineProps({
  ctoon: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  badge: { type: String, default: '' },
  badgeClassOwned: { type: String, default: 'bg-green-100 text-green-800' },
  badgeClassUnowned: { type: String, default: 'bg-gray-200 text-gray-600' }
})

defineEmits(['toggle'])

const badgeClassComputed = computed(() => {
  const b = String(props.badge).toLowerCase()
  return b.includes('unowned') ? props.badgeClassUnowned : props.badgeClassOwned
})

const hasEdition = computed(() => typeof props.ctoon.isFirstEdition === 'boolean')
const editionLabel = computed(() =>
  props.ctoon.isFirstEdition ? 'First Edition' : 'Unlimited Edition'
)

/**
 * If quantity is null => Unlimited
 * If quantity is undefined => show nothing
 * Else => numeric quantity
 */
const quantityDisplay = computed(() => {
  if (!('quantity' in props.ctoon)) return ''
  return props.ctoon.quantity == null ? 'Unlimited' : props.ctoon.quantity
})
</script>
