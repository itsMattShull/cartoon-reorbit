<template>
  <Nav />

  <div class="max-w-6xl mx-auto py-6 px-4">
    <h1 class="text-2xl font-bold mb-4">Trade Offers</h1>

    <!-- Tabs -->
    <div class="flex space-x-4 mb-6">
      <button
        @click="activeTab = 'incoming'"
        :class="tabClass('incoming')"
      >
        Incoming Trades
      </button>
      <button
        @click="activeTab = 'outgoing'"
        :class="tabClass('outgoing')"
      >
        Outgoing Trades
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-10">Loading…</div>

    <!-- Table -->
    <div v-else>
      <table class="w-full table-auto border-collapse">
        <thead>
          <tr class="bg-gray-100">
            <th class="px-4 py-2 text-left">Initiator</th>
            <th class="px-4 py-2 text-left">Recipient</th>
            <th class="px-4 py-2 text-right">Points</th>
            <th class="px-4 py-2 text-right"># Offered</th>
            <th class="px-4 py-2 text-right"># Requested</th>
            <th class="px-4 py-2 text-left">Status</th>
            <th class="px-4 py-2 text-left">Created</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="offer in displayedOffers"
            :key="offer.id"
            class="border-t"
          >
            <td class="px-4 py-2">{{ offer.initiator.username }}</td>
            <td class="px-4 py-2">{{ offer.recipient.username }}</td>
            <td class="px-4 py-2 text-right">{{ offer.pointsOffered }}</td>
            <td class="px-4 py-2 text-right">{{ countByRole(offer, 'OFFERED') }}</td>
            <td class="px-4 py-2 text-right">{{ countByRole(offer, 'REQUESTED') }}</td>
            <td class="px-4 py-2">
              <span :class="statusClasses(offer.status)">
                {{ offer.status }}
              </span>
            </td>
            <td class="px-4 py-2 text-left">{{ formatDateTime(offer.createdAt) }}</td>
            <td class="px-4 py-2 text-right">
              <button
                class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded"
                @click="viewOffer(offer)"
              >
                View Trade
              </button>
            </td>
          </tr>
          <tr v-if="displayedOffers.length === 0">
            <td colspan="8" class="px-4 py-6 text-center text-gray-500">
              No {{ activeTab === 'incoming' ? 'incoming' : 'outgoing' }} trades.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Offer Modal -->
    <transition name="fade">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      >
        <div class="bg-white rounded-lg shadow-lg w-11/12 max-w-3xl p-6 relative">
          <button
            class="absolute top-4 right-4 text-gray-500 hover:text-black"
            @click="closeModal"
          >✕</button>

          <h2 class="text-xl font-semibold mb-4">
            Trade between
            <span class="font-bold">{{ currentOffer.initiator.username }}</span>
            → 
            <span class="font-bold">{{ currentOffer.recipient.username }}</span>
          </h2>

          <!-- Points, Status & Created -->
          <p class="mb-1"><strong>Points Offered:</strong> {{ currentOffer.pointsOffered }}</p>
          <p class="mb-1"><strong>Status:</strong> {{ currentOffer.status.toLowerCase() }}</p>
          <p class="mb-4"><strong>Created:</strong> {{ formatDateTime(currentOffer.createdAt) }}</p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <!-- Offered -->
            <div>
              <h3 class="font-semibold mb-2">Offered CToons</h3>
              <div class="grid grid-cols-3 gap-4">
                <div
                  v-for="tc in currentOffer.ctoons.filter(c => c.role === 'OFFERED')"
                  :key="tc.id"
                  class="border rounded p-2 flex flex-col items-center"
                >
                  <img
                    :src="tc.userCtoon.ctoon.assetPath"
                    class="w-20 h-20 object-contain mb-1"
                  />
                  <p class="text-sm text-center">{{ tc.userCtoon.ctoon.name }}</p>
                  <p class="text-xs text-gray-600">
                    Mint #{{ tc.userCtoon.mintNumber }} of
                    {{ tc.userCtoon.ctoon.quantity ?? 'Unlimited' }}
                  </p>
                  <p class="text-xs text-gray-600">
                    {{ tc.userCtoon.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
                  </p>
                </div>
              </div>
            </div>
            <!-- Requested -->
            <div>
              <h3 class="font-semibold mb-2">Requested CToons</h3>
              <div class="grid grid-cols-3 gap-4">
                <div
                  v-for="tc in currentOffer.ctoons.filter(c => c.role === 'REQUESTED')"
                  :key="tc.id"
                  class="border rounded p-2 flex flex-col items-center"
                >
                  <img
                    :src="tc.userCtoon.ctoon.assetPath"
                    class="w-20 h-20 object-contain mb-1"
                  />
                  <p class="text-sm text-center">{{ tc.userCtoon.ctoon.name }}</p>
                  <p class="text-xs text-gray-600">
                    Mint #{{ tc.userCtoon.mintNumber }} of
                    {{ tc.userCtoon.ctoon.quantity ?? 'Unlimited' }}
                  </p>
                  <p class="text-xs text-gray-600">
                    {{ tc.userCtoon.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Action buttons (only when pending) -->
          <div class="flex justify-end space-x-3">
            <button
              v-if="isRecipient && currentOffer.status === 'PENDING'"
              class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
              @click="acceptOffer"
            >
              Accept Offer
            </button>
            <button
              v-if="(isRecipient || isInitiator) && currentOffer.status === 'PENDING'"
              class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
              @click="rejectOffer"
            >
              Reject Offer
            </button>
          </div>
        </div>
      </div>
    </transition>

    <Toast v-if="toast.show" :message="toast.message" :type="toast.type" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import Nav from '@/components/Nav.vue'
import Toast from '@/components/Toast.vue'
import { useAuth } from '@/composables/useAuth'

// format with the user's own locale & timezone
function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

// tabs & data
const activeTab = ref('incoming')
const incoming = ref([])
const outgoing = ref([])
const loading = ref(true)

// modal & current offer
const showModal = ref(false)
const currentOffer = ref(null)

// toast state
const toast = ref({ show: false, message: '', type: 'success' })
function showToast(msg, type = 'success') {
  toast.value = { show: true, message: msg, type }
  setTimeout(() => (toast.value.show = false), 4000)
}

// auth
const { user, fetchSelf } = useAuth()

// helper to tell which tab is active
function tabClass(tab) {
  return [
    'px-4 py-2 rounded',
    activeTab.value === tab
      ? 'bg-indigo-500 text-white'
      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
  ]
}

// at the top of your <script setup>
function statusClasses(status) {
  const base = 'inline-block px-2 py-1 rounded-full text-xs font-semibold capitalize'
  switch (status) {
    case 'PENDING':
      return `${base} bg-yellow-100 text-yellow-800`
    case 'ACCEPTED':
      return `${base} bg-green-100 text-green-800`
    case 'REJECTED':
      return `${base} bg-red-100 text-red-800`
    default:
      return `${base} bg-gray-100 text-gray-800`
  }
}

// count cToons by ROLE
function countByRole(offer, role) {
  return offer.ctoons.filter(c => c.role === role).length
}

// lists which offers to show in the table
const displayedOffers = computed(() =>
  activeTab.value === 'incoming' ? incoming.value : outgoing.value
)

// are we the recipient or initiator of the current offer?
const isRecipient = computed(() =>
  currentOffer.value?.recipient.id === user.value?.id
)
const isInitiator = computed(() =>
  currentOffer.value?.initiator.id === user.value?.id
)

// fetch both lists
async function loadOffers() {
  loading.value = true
  incoming.value = await $fetch('/api/trade/offers/incoming')
  outgoing.value = await $fetch('/api/trade/offers/outgoing')
  loading.value = false
}

// open/close modal
function viewOffer(offer) {
  currentOffer.value = offer
  showModal.value = true
}
function closeModal() {
  showModal.value = false
  currentOffer.value = null
}

// accept / reject
async function acceptOffer() {
  try {
    await $fetch(`/api/trade/offers/${currentOffer.value.id}/accept`, { method: 'POST' })
    // success path
    closeModal()
    await loadOffers()
    showToast('Offer accepted!', 'success')
  } catch (err) {
    // extract server message
    const msg =
      err.data?.statusMessage ||
      err.statusMessage ||
      'Failed to accept offer'
    closeModal()
    await loadOffers()
    showToast(msg, 'error')
  }
}

async function rejectOffer() {
  try {
    await $fetch(`/api/trade/offers/${currentOffer.value.id}/reject`, { method: 'POST' })
    // success path
    closeModal()
    await loadOffers()
    showToast('Offer rejected.', 'success')
  } catch (err) {
    // extract server message
    const msg =
      err.data?.statusMessage ||
      err.statusMessage ||
      'Failed to reject offer'
    closeModal()
    await loadOffers()
    showToast(msg, 'error')
  }
}


onMounted(async () => {
  await fetchSelf()
  await loadOffers()
})
</script>

<style>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
