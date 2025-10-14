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

  <!-- Offer Points Modal -->
  <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
    <div class="relative bg-white rounded-lg shadow-lg w-full max-w-sm p-5">
      <h3 class="text-lg font-semibold mb-3">Offer points</h3>

      <label class="block text-sm mb-1">Points to offer</label>
      <input
        v-model.number="offerInput"
        type="number"
        min="1"
        inputmode="numeric"
        class="w-full border rounded px-3 py-2"
        @keyup.enter="confirmOffer"
      />
      <p v-if="error" class="text-red-600 text-sm mt-2">{{ error }}</p>

      <div class="mt-4 flex justify-end gap-2">
        <button class="px-3 py-1 border rounded" @click="closeModal">Cancel</button>
        <button
          class="px-3 py-1 rounded text-white"
          :class="confirmDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'"
          :disabled="confirmDisabled"
          @click="confirmOffer"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useWishlist } from '@/composables/useWishlist'

const props = defineProps({
  ctoonId: { type: String, required: true }
})

const { wishlist, loading, add, remove } = useWishlist()

const processing = ref(false)
const processingAction = ref('') // 'adding' | 'removing' | ''

const inWishlist = computed(() =>
  !loading.value && wishlist.value.includes(props.ctoonId)
)
const isDisabled = computed(() => loading.value || processing.value)
const buttonText = computed(() => {
  if (processing.value && processingAction.value === 'adding') return 'Adding To Wishlist'
  if (processing.value && processingAction.value === 'removing') return 'Removing From Wishlist'
  return inWishlist.value ? 'Remove From Wishlist' : 'Add to Wishlist'
})

// modal state
const showModal = ref(false)
const offerInput = ref(1)
const error = ref('')

function openModal() {
  error.value = ''
  offerInput.value = 1
  showModal.value = true
}
function closeModal() {
  showModal.value = false
  error.value = ''
}

const confirmDisabled = computed(() => !Number.isInteger(offerInput.value) || offerInput.value <= 0)

async function confirmOffer() {
  if (confirmDisabled.value) {
    error.value = 'Enter an integer greater than 0.'
    return
  }
  processing.value = true
  processingAction.value = 'adding'
  try {
    await add(props.ctoonId, offerInput.value)
    closeModal()
  } finally {
    processing.value = false
    processingAction.value = ''
  }
}

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
    openModal()
  }
}
</script>
