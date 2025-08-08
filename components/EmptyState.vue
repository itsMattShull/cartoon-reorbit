<template>
  <div :class="wrapperClass">
    <div class="flex flex-col items-center text-center gap-2">
      <div v-if="hasIcon" class="text-4xl" aria-hidden="true">
        <slot name="icon">
          <span>{{ icon }}</span>
        </slot>
      </div>

      <p class="text-gray-700 font-medium">{{ label }}</p>
      <p v-if="description" class="text-gray-500 text-sm">{{ description }}</p>

      <div v-if="$slots.actions" class="mt-3">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  /** Main line of text */
  label: { type: String, default: 'Nothing here' },
  /** Optional smaller subtext */
  description: { type: String, default: '' },
  /** Optional emoji/text icon. Use <template #icon> to fully customize. */
  icon: { type: String, default: '' },
  /** Smaller vertical padding */
  compact: { type: Boolean, default: false }
})

const slots = useSlots()

const wrapperClass = computed(() =>
  (props.compact ? 'py-6' : 'py-12') + ' text-center text-gray-500'
)

const hasIcon = computed(() => !!(props.icon || slots.icon))
</script>
