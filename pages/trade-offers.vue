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

    <!-- Responsive Table / Cards -->
    <div v-else>
      <!-- Desktop table -->
      <div class="hidden sm:block">
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
              <td class="px-4 py-2">
                <NuxtLink
                  :to="`/czone/${offer.initiator.username}`"
                  class="text-indigo-600 hover:underline"
                >
                  {{ offer.initiator.username }}
                </NuxtLink>
              </td>
              <td class="px-4 py-2">
                <NuxtLink
                  :to="`/czone/${offer.recipient.username}`"
                  class="text-indigo-600 hover:underline"
                >
                  {{ offer.recipient.username }}
                </NuxtLink>
              </td>
              <td class="px-4 py-2 text-right">{{ offer.pointsOffered }}</td>
              <td class="px-4 py-2 text-right">{{ countByRole(offer, 'OFFERED') }}</td>
              <td class="px-4 py-2 text-right">{{ countByRole(offer, 'REQUESTED') }}</td>
              <td class="px-4 py-2">
                <span :class="statusClasses(offer.status)">
                  {{ offer.status.toLowerCase() }}
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

      <!-- Mobile cards -->
      <div class="space-y-4 sm:hidden">
        <div
          v-for="offer in displayedOffers"
          :key="offer.id"
          class="border rounded-lg p-4 bg-white shadow"
        >
          <div class="flex justify-between items-start mb-2">
            <div>
              <p class="font-semibold">
                From:
                <NuxtLink
                  :to="`/czone/${offer.initiator.username}`"
                  class="text-indigo-600 hover:underline"
                >
                  {{ offer.initiator.username }}
                </NuxtLink>
              </p>
              <p class="text-sm">
                To:
                <NuxtLink
                  :to="`/czone/${offer.recipient.username}`"
                  class="text-indigo-600 hover:underline"
                >
                  {{ offer.recipient.username }}
                </NuxtLink>
              </p>
            </div>
            <span :class="statusClasses(offer.status)">
              {{ offer.status.toLowerCase() }}
            </span>
          </div>
          <p class="text-sm mb-1"><strong>Points:</strong> {{ offer.pointsOffered }}</p>
          <p class="text-sm mb-1">
            <strong>Offered:</strong> {{ countByRole(offer, 'OFFERED') }}
          </p>
          <p class="text-sm mb-1">
            <strong>Requested:</strong> {{ countByRole(offer, 'REQUESTED') }}
          </p>
          <p class="text-xs text-gray-500 mb-3">{{ formatDateTime(offer.createdAt) }}</p>
          <button
            class="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded"
            @click="viewOffer(offer)"
          >
            View Trade
          </button>
        </div>

        <div
          v-if="displayedOffers.length === 0"
          class="text-center text-gray-500 py-6"
        >
          No {{ activeTab === 'incoming' ? 'incoming' : 'outgoing' }} trades.
        </div>
      </div>
    </div>

    <!-- Offer Modal -->
    <transition name="fade">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      >
        <div
          class="bg-white rounded-lg shadow-lg w-11/12 max-w-3xl max-h-[90vh] overflow-y-auto relative"
        >
          <!-- Sticky Header -->
          <div class="sticky top-0 bg-white z-20 p-6 border-b">
            <button
              class="absolute top-4 right-4 text-gray-500 hover:text-black"
              @click="closeModal"
            >✕</button>

            <h2 class="text-xl font-semibold mb-2">
              Trade between
              <NuxtLink
                :to="`/czone/${currentOffer.initiator.username}`"
                class="text-indigo-600 hover:underline"
              >
                {{ currentOffer.initiator.username }}
              </NuxtLink>
              →
              <NuxtLink
                :to="`/czone/${currentOffer.recipient.username}`"
                class="text-indigo-600 hover:underline"
              >
                {{ currentOffer.recipient.username }}
              </NuxtLink>
            </h2>

            <p class="mb-1"><strong>Points Offered:</strong> {{ currentOffer.pointsOffered }}</p>
            <p class="mb-1">
              <strong>Status:</strong>
              <span :class="statusClasses(currentOffer.status)">
                {{ currentOffer.status.toLowerCase() }}
              </span>
            </p>
            <p class="mb-0"><strong>Created:</strong> {{ formatDateTime(currentOffer.createdAt) }}</p>
          </div>

          <!-- Scrollable Body -->
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <!-- Offered CToons -->
              <div>
                <h3 class="font-semibold mb-2">Offered CToons</h3>
                <div class="grid grid-cols-2 gap-4">
                  <div
                    v-for="tc in currentOffer.ctoons.filter(c => c.role === 'OFFERED')"
                    :key="tc.id"
                    class="relative border rounded p-2 flex flex-col items-center"
                  >
                    <span
                      class="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold rounded-full"
                      :class="selfOwnedIds.has(tc.userCtoon.ctoonId)
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-200 text-gray-600'"
                    >
                      {{ selfOwnedIds.has(tc.userCtoon.ctoonId) ? 'Owned' : 'Unowned' }}
                    </span>
                    <img
                      :src="tc.userCtoon.ctoon.assetPath"
                      class="w-20 h-20 object-contain mb-1 mt-6"
                    />
                    <p class="text-sm text-center">{{ tc.userCtoon.ctoon.name }}</p>
                    <p class="text-xs text-gray-600">{{ tc.userCtoon.ctoon.rarity }}</p>
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
              <!-- Requested CToons -->
              <div>
                <h3 class="font-semibold mb-2">Requested CToons</h3>
                <div class="grid grid-cols-2 gap-4">
                  <div
                    v-for="tc in currentOffer.ctoons.filter(c => c.role === 'REQUESTED')"
                    :key="tc.id"
                    class="relative border rounded p-2 flex flex-col items-center"
                  >
                    <span
                      class="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold rounded-full"
                      :class="selfOwnedIds.has(tc.userCtoon.ctoonId)
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-200 text-gray-600'"
                    >
                      {{ selfOwnedIds.has(tc.userCtoon.ctoonId) ? 'Owned' : 'Unowned' }}
                    </span>
                    <img
                      :src="tc.userCtoon.ctoon.assetPath"
                      class="w-20 h-20 object-contain mb-1 mt-6"
                    />
                    <p class="text-sm text-center">{{ tc.userCtoon.ctoon.name }}</p>
                    <p class="text-xs text-gray-600">{{ tc.userCtoon.ctoon.rarity }}</p>
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

            <!-- Action Buttons (PENDING only) -->
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

definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

const activeTab = ref('incoming')
const incoming = ref([])
const outgoing = ref([])
const loading = ref(true)

const showModal = ref(false)
const currentOffer = ref(null)

const selfCtoons    = ref([])
const isLoadingSelf = ref(false)
async function loadSelfCollection() {
  isLoadingSelf.value = true
  selfCtoons.value    = await $fetch(`/api/collection/${user.value.username}`)
  isLoadingSelf.value = false
}
const selfOwnedIds = computed(() =>
  new Set(selfCtoons.value.map(sc => sc.ctoonId))
)

const toast = ref({ show: false, message: '', type: 'success' })
function showToast(msg, type = 'success') {
  toast.value = { show: true, message: msg, type }
  setTimeout(() => (toast.value.show = false), 4000)
}

const { user, fetchSelf } = useAuth()

function tabClass(tab) {
  return [
    'px-4 py-2 rounded',
    activeTab.value === tab
      ? 'bg-indigo-500 text-white'
      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
  ]
}
function statusClasses(status) {
  const base = 'inline-block px-2 py-1 rounded-full text-xs font-semibold capitalize'
  switch (status) {
    case 'PENDING':  return `${base} bg-yellow-100 text-yellow-800`
    case 'ACCEPTED': return `${base} bg-green-100 text-green-800`
    case 'REJECTED': return `${base} bg-red-100 text-red-800`
    default:         return `${base} bg-gray-100 text-gray-800`
  }
}
function countByRole(offer, role) {
  return offer.ctoons.filter(c => c.role === role).length
}

const displayedOffers = computed(() =>
  activeTab.value === 'incoming' ? incoming.value : outgoing.value
)
const isRecipient = computed(() =>
  currentOffer.value?.recipient.id === user.value?.id
)
const isInitiator = computed(() =>
  currentOffer.value?.initiator.id === user.value?.id
)

async function loadOffers() {
  loading.value = true
  incoming.value = await $fetch('/api/trade/offers/incoming')
  outgoing.value = await $fetch('/api/trade/offers/outgoing')
  loading.value = false
}

function viewOffer(offer) {
  currentOffer.value = offer
  loadSelfCollection()
  showModal.value = true
}
function closeModal() {
  showModal.value = false
  currentOffer.value = null
}

async function acceptOffer() {
  try {
    await $fetch(`/api/trade/offers/${currentOffer.value.id}/accept`, { method: 'POST' })
    closeModal(); await loadOffers(); showToast('Offer accepted!', 'success')
  } catch (err) {
    const msg = err.data?.statusMessage || err.statusMessage || 'Failed to accept'
    closeModal(); await loadOffers(); showToast(msg, 'error')
  }
}
async function rejectOffer() {
  try {
    await $fetch(`/api/trade/offers/${currentOffer.value.id}/reject`, { method: 'POST' })
    closeModal(); await loadOffers(); showToast('Offer rejected.', 'success')
  } catch (err) {
    const msg = err.data?.statusMessage || err.statusMessage || 'Failed to reject'
    closeModal(); await loadOffers(); showToast(msg, 'error')
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
