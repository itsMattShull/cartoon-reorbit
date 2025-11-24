<template>
  <!-- Global toast notification -->
  <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />

  <button @click="openModal" :disabled="disabled" class="btn">
    Add to Auction
  </button>

  <!-- Inline modal overlay -->
  <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black bg-opacity-50" @click="closeModal"></div>

    <!-- Modal content -->
    <div class="relative bg-white p-6 rounded-lg shadow-lg z-10 w-full max-w-lg">
      <h3 class="text-lg font-semibold mb-4">Send {{ userCtoon.name }} to Auction</h3>
      <div class="space-y-4">
        <div>
          <label class="block mb-1 font-medium">Initial Bet</label>
          <input
            type="number"
            v-model.number="initialBet"
            :min="minInitialBet"
            step="1"
            class="w-full p-2 border rounded"
          />
        </div>
        <p v-if="initialBet < minInitialBet" class="text-sm text-red-500 mt-1">
          Initial bet must be at least {{ minInitialBet }} pts.
        </p>
        <!-- Duration -->
        <div>
          <p class="block mb-1 font-medium">Duration</p>

          <!-- Presets -->
          <div class="flex flex-wrap gap-4 mb-2">
            <label class="inline-flex items-center">
              <input type="radio" class="form-radio" value="3m" v-model="durationPreset" />
              <span class="ml-2">Quick: 3 minutes</span>
            </label>
            <label class="inline-flex items-center">
              <input type="radio" class="form-radio" value="4h" v-model="durationPreset" />
              <span class="ml-2">4 hours</span>
            </label>
            <label class="inline-flex items-center">
              <input type="radio" class="form-radio" value="12h" v-model="durationPreset" />
              <span class="ml-2">12 hours</span>
            </label>
            <label class="inline-flex items-center">
              <input type="radio" class="form-radio" value="days" v-model="durationPreset" />
              <span class="ml-2">Custom days</span>
            </label>
          </div>

          <!-- Days slider only when "days" is selected -->
          <div v-if="durationPreset === 'days'">
            <label class="block mb-1">
              Days: <span class="font-semibold">{{ timeframe }} day(s)</span>
            </label>
            <input
              type="range"
              v-model.number="timeframe"
              :min="1"
              :max="5"
              step="1"
              class="w-full"
            />
            <div class="flex justify-between text-sm mt-1">
              <span>1</span><span>3</span><span>5</span>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-6 flex justify-between items-center">
        <button
          @click="instaBid"
          :disabled="sending"
          class="btn-secondary"
        >
          Insta-bid for {{ instaBidValue }} Points
        </button>
        <div class="flex space-x-2">
          <button @click="closeModal" class="btn-secondary">Cancel</button>
          <button
            @click="sendToAuction"
            :disabled="sending || initialBet < minInitialBet"
            class="btn-primary"
          >
            {{ sending ? 'Sending...' : 'Send to Auction' }}
          </button>
        </div>
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

const showModal    = ref(false)
const initialBet   = ref(props.userCtoon.price)
const timeframe    = ref(1)     // days
const quick3m      = ref(false) // 3-minute flag
const sending      = ref(false)
const auctionSent  = ref(false)
const durationPreset = ref('days') // '3m' | '4h' | '12h' | 'days'
const toastMessage = ref('')
const toastType    = ref('error')

const disabled = computed(() =>
  !props.isOwner || props.hasActiveAuction || auctionSent.value
)

const instaBidValue = computed(() => {
  switch ((props.userCtoon.rarity || '').toLowerCase()) {
    case 'common': return 25
    case 'uncommon': return 50
    case 'rare': return 100
    case 'very rare': return 187
    case 'crazy rare': return 312
    case 'code only': return 50
    case 'prize only': return 50
    case 'auction only': return 50
    default: return 50
  }
})

const minInitialBet = computed(() => Math.max(1, instaBidValue.value))

function showToast(message, type = 'error') {
  toastMessage.value = message
  toastType.value    = type
  setTimeout(() => { toastMessage.value = '' }, 5000)
}

function openModal() {
  initialBet.value = Math.max(props.userCtoon.price || 0, minInitialBet.value)
  timeframe.value = 1
  durationPreset.value = 'days' // default to days
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

async function sendToAuction() {
  if (initialBet.value < minInitialBet.value) {
    showToast(`Initial bet must be at least ${minInitialBet.value} pts.`, 'error')
    return
  }

  // Map preset -> payload fields
  let durationDays = 0
  let durationMinutes = 0
  switch (durationPreset.value) {
    case '3m':  durationMinutes = 3;        break
    case '4h':  durationMinutes = 4 * 60;   break
    case '12h': durationMinutes = 12 * 60;  break
    case 'days':
    default:
      durationDays = timeframe.value
  }

  sending.value = true
  try {
    const { auction } = await $fetch('/api/auctions', {
      method: 'POST',
      body: {
        userCtoonId:     props.userCtoon.id,
        initialBet:      initialBet.value,
        durationDays,
        durationMinutes,
        createInitialBid: false
      }
    })
    showToast('Auction created successfully!', 'success')
    auctionSent.value = true
    emit('auctionCreated', props.userCtoon.id)
    closeModal()
  } catch (error) {
    showToast(error.data?.message || 'Failed to create auction.', 'error')
  } finally {
    sending.value = false
  }
}

async function instaBid() {
  if (sending.value || disabled.value) return
  sending.value = true
  try {
    initialBet.value = instaBidValue.value
    durationPreset.value = 'days'
    timeframe.value = 1

    const { auction } = await $fetch('/api/auctions', {
      method: 'POST',
      body: {
        userCtoonId:      props.userCtoon.id,
        initialBet:       initialBet.value,
        durationDays:     1,
        durationMinutes:  0,
        createInitialBid: true
      }
    })
    showToast('Auction created with initial bid!', 'success')
    auctionSent.value = true
    emit('auctionCreated', props.userCtoon.id)
    closeModal()
  } catch (error) {
    showToast(error.data?.message || 'Failed to create auction.', 'error')
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
