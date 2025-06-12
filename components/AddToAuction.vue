<template>
  <!-- Global toast notification -->
  <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />

  <button @click="openModal" :disabled="disabled" class="btn">
    Add to Auction
  </button>

  <!-- Inline modal overlay -->
  <div
    v-if="showModal"
    class="fixed inset-0 z-50 flex items-center justify-center"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black bg-opacity-50"
      @click="closeModal"
    ></div>

    <!-- Modal content -->
    <div class="relative bg-white p-6 rounded-lg shadow-lg z-10 w-full max-w-md">
      <h3 class="text-lg font-semibold mb-4">Send {{ userCtoon.name }} to Auction</h3>
      <div class="space-y-4">
        <div>
          <label class="block mb-1 font-medium">Initial Bet</label>
          <input
            type="number"
            v-model.number="initialBet"
            :min="1"
            class="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label class="block mb-1 font-medium">
            Timeframe: <span class="font-semibold">{{ timeframe }} day(s)</span>
          </label>
          <input
            type="range"
            v-model.number="timeframe"
            :min="1"
            :max="5"
            step="2"
            class="w-full"
          />
          <div class="flex justify-between text-sm mt-1">
            <span>1</span><span>3</span><span>5</span>
          </div>
        </div>
      </div>
      <div class="mt-6 flex justify-end space-x-2">
        <button @click="closeModal" class="btn-secondary">Cancel</button>
        <button @click="sendToAuction" :disabled="sending" class="btn-primary">
          {{ sending ? 'Sending...' : 'Send to Auction' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Toast from '@/components/Toast.vue'

const props = defineProps({
  userCtoon: { type: Object, required: true },
  isOwner: { type: Boolean, required: true },
  hasActiveAuction: { type: Boolean, required: true }
})
const emit = defineEmits(['auctionCreated'])

const showModal = ref(false)
const initialBet = ref(props.userCtoon.price)
const timeframe = ref(1)
const sending = ref(false)
const auctionSent = ref(false)

const toastMessage = ref('')
const toastType = ref('error')

const disabled = computed(() =>
  !props.isOwner || props.hasActiveAuction || auctionSent.value
)

function showToast(message, type = 'error') {
  toastMessage.value = message
  toastType.value = type
  setTimeout(() => { toastMessage.value = '' }, 5000)
}

function openModal() {
  initialBet.value = props.userCtoon.price
  timeframe.value = 1
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function sendToAuction() {
  sending.value = true
  try {
    await $fetch('/api/auctions', {
      method: 'POST',
      body: {
        userCtoonId: props.userCtoon.id,
        initialBet: initialBet.value,
        durationDays: timeframe.value
      }
    })
    showToast('Auction created successfully!', 'success')
    auctionSent.value = true
    emit('auctionCreated', props.userCtoon.id)
    closeModal()
  } catch (error) {
    showToast(
      error.data?.message || 'Failed to create auction.',
      'error'
    )
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.btn {
  @apply px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50;
}
.btn-primary {
  @apply px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50;
}
.btn-secondary {
  @apply px-4 py-2 bg-gray-300 text-gray-800 rounded-lg;
}
</style>