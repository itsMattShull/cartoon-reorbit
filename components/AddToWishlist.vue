<template>
  <button
    @click="toggle"
    :disabled="isDisabled"
    :class="[
      'px-3 py-1 rounded text-sm font-medium transition',
      isDisabled
        ? 'opacity-50 cursor-not-allowed'
        : inWishlist
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
    ]"
  >
    {{ buttonText }}
  </button>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useWishlist } from '@/composables/useWishlist'

const props = defineProps({
  ctoonId: {
    type: String,
    required: true
  }
})

const { wishlist, loading, add, remove } = useWishlist()

// track if we're currently adding or removing
const processing = ref(false)
const processingAction = ref('') // 'adding' | 'removing' | ''

// determine if this ctoon is already in the wishlist
const inWishlist = computed(() =>
  !loading.value && wishlist.value.includes(props.ctoonId)
)

// disable button during initial load or while processing
const isDisabled = computed(() => loading.value || processing.value)

// dynamic button text
const buttonText = computed(() => {
  if (processing.value && processingAction.value === 'adding') {
    return 'Adding To Wishlist'
  }
  if (processing.value && processingAction.value === 'removing') {
    return 'Removing From Wishlist'
  }
  return inWishlist.value ? 'Remove From Wishlist' : 'Add to Wishlist'
})

async function toggle() {
  if (isDisabled.value) return

  if (inWishlist.value) {
    processing.value = true
    processingAction.value = 'removing'
    try {
      await remove(props.ctoonId)
    } finally {
      processing.value = false
      processingAction.value = ''
    }
  } else {
    processing.value = true
    processingAction.value = 'adding'
    try {
      await add(props.ctoonId)
    } finally {
      processing.value = false
      processingAction.value = ''
    }
  }
}
</script>