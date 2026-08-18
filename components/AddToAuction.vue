<template>
  <!-- Global toast notification -->
  <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />
  <button
    v-bind="buttonAttrs"
    @click="openModal"
    :disabled="disabled"
    :class="buttonClass"
  >
    Add to Auction
  </button>

  <!-- Inline modal overlay -->
  <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black bg-opacity-50" @click="closeModal"></div>

    <!-- Modal content -->
    <div class="relative bg-white p-6 rounded-lg shadow-lg z-10 w-full max-w-lg">
      <h3 class="text-lg font-semibold mb-4">Send {{ userCtoon.name }} to Auction</h3>
      <div class="space-y-6">
        <!-- Recent Auctions (last 3 closed for this cToon) -->
        <div v-if="recentAuctions.length" class="mt-2">
          <h4 class="text-md font-semibold mb-2">Recent Auctions</h4>
          <ul class="space-y-1">
            <li
              v-for="(ra, idx) in recentAuctions"
              :key="idx"
              class="text-sm text-gray-700 flex items-center justify-between"
            >
              <span>{{ formatDate(ra.endedAt) }}</span>
              <span class="font-medium">{{ ra.soldFor }} pts</span>
            </li>
          </ul>
        </div>
        
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
        <div class="adp-light">
          <p class="block mb-1 font-medium">Duration</p>
          <AuctionDurationPicker @update="onDurationUpdate" />
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
            :disabled="sending || initialBet < minInitialBet || !duration.valid"
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
import { ref, computed, useAttrs } from 'vue'
import Toast from '@/components/Toast.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  userCtoon: { type: Object, required: true },
  isOwner: { type: Boolean, required: true },
  hasActiveAuction: { type: Boolean, required: true }
})
const emit = defineEmits(['auctionCreated'])

const attrs = useAttrs()
const buttonAttrs = computed(() => {
  const { class: _class, ...rest } = attrs
  return rest
})
const buttonClass = computed(() => ['btn', attrs.class])

const showModal    = ref(false)
const initialBet   = ref(props.userCtoon.price)
const sending      = ref(false)
const auctionSent  = ref(false)
// Populated by AuctionDurationPicker's @update.
const duration     = ref({ durationDays: 0, durationMinutes: 0, totalMinutes: null, valid: false })
const toastMessage = ref('')
const toastType    = ref('error')
const recentAuctions = ref([])

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

function onDurationUpdate(next) { duration.value = next }

function openModal() {
  initialBet.value = Math.max(props.userCtoon.price || 0, minInitialBet.value)
  showModal.value = true
  // Load recent auctions for this cToon (last 3 closed)
  loadRecentAuctions()
}

function closeModal() {
  showModal.value = false
}

async function sendToAuction() {
  if (initialBet.value < minInitialBet.value) {
    showToast(`Initial bet must be at least ${minInitialBet.value} pts.`, 'error')
    return
  }

  if (!duration.value.valid) {
    showToast('Pick a valid auction length.', 'error')
    return
  }
  const { durationDays, durationMinutes } = duration.value

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

async function loadRecentAuctions() {
  try {
    const res = await $fetch(`/api/ctoon/${props.userCtoon.ctoonId}/getRecentAuctions`)
    recentAuctions.value = Array.isArray(res) ? res : []
  } catch (e) {
    recentAuctions.value = []
  }
}

function formatDate(d) {
  try {
    const dt = new Date(d)
    return dt.toLocaleDateString()
  } catch {
    return ''
  }
}
</script>

<style scoped>
/* The picker defaults to the dark AuctionModal surface. This host is a white
   Tailwind panel, so it overrides the --adp-* variables rather than forking the
   component. color-scheme matters as much as color here: without it, WebKit
   renders the datetime-local editor's segments for the wrong scheme. */
.adp-light :deep(.adp) {
  --adp-fg: #111827;
  --adp-fg-dim: #4b5563;
  --adp-fg-faint: #6b7280;
  --adp-border: #d1d5db;
  --adp-surface: #f3f4f6;
  --adp-input-bg: #fff;
  --adp-accent: #2563eb;
  --adp-error: #b91c1c;
  --adp-scheme: light;
}

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
