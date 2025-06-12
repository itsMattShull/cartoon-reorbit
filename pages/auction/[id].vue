<template>
  <Nav />
  <div class="pt-16 px-4 py-6 max-w-3xl mx-auto">
    <!-- Auction Header -->
    <h1 class="text-3xl font-bold mb-4">Auction: {{ auction.ctoon.name }}</h1>

    <!-- Countdown / Ended Message -->
    <p v-if="!ended" class="text-sm text-red-600 mb-6">
      {{ ended ? 'Auction has ended' : `Ending in ${formatRemaining(auction.endAt)}` }}
    </p>
    
    <div v-if="ended" class="mb-6">
      <span
        class="inline-block bg-green-100 text-green-800 text-xl font-bold px-4 py-2 rounded-full"
      >
        🎉 Winner: {{ displayWinner || '—' }} 🎉
      </span>
    </div>

    <!-- Ctoon Image Centered -->
    <div class="flex justify-center mb-6">
      <img
        :src="auction.ctoon.assetPath"
        alt="{{ auction.ctoon.name }}"
        class="block max-w-full mx-auto rounded"
      />
    </div>

    <!-- Details -->
    <div class="mb-6 space-y-2">
      <p><strong>Series:</strong> {{ auction.ctoon.series }}</p>
      <p><strong>Rarity:</strong> {{ auction.ctoon.rarity }}</p>
      <p><strong>Mint #:</strong> {{ auction.ctoon.mintNumber ?? 'N/A' }}</p>
      <p><strong>Current Highest Bid:</strong> {{ currentBid }} pts</p>
    </div>

    <!-- Countdown / Ended Message -->
    <p v-if="!ended" class="text-sm text-red-600 mb-6">
      {{ ended ? 'Auction has ended' : `Ending in ${formatRemaining(auction.endAt)}` }}
    </p>

    <div v-if="ended" class="mb-6">
      <span
        class="inline-block bg-green-100 text-green-800 text-xl font-bold px-4 py-2 rounded-full"
      >
        🎉 Winner: {{ displayWinner || '—' }} 🎉
      </span>
    </div>

    <!-- Bid Form -->
    <div v-if="!ended" class="mb-6">
      <label for="bid" class="block text-sm font-medium mb-1">Your Bid (pts)</label>
      <input
        id="bid"
        type="number"
        v-model.number="bidAmount"
        :min="currentBid + 1"
        class="w-full border border-gray-300 rounded px-3 py-2 mb-2"
      />
      <button
        @click="placeBid"
        :disabled="!canBid"
        class="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
      >
        Place Bid
      </button>
      <p v-if="!hasEnoughPoints" class="text-sm text-red-500 mt-2">
        You only have {{ userPoints }} pts.
      </p>
    </div>

    <!-- Bid History -->
    <div class="border-t pt-4">
      <h2 class="text-xl font-semibold mb-2">Bid History</h2>
      <ul class="space-y-1 text-sm">
        <li v-for="(b, i) in bids" :key="i">
          {{ b.user }}: {{ b.amount }} pts
        </li>
        <li v-if="!bids.length" class="text-gray-500">No bids yet.</li>
      </ul>
    </div>

    <!-- Toast -->
    <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import { useAuth } from '@/composables/useAuth'
import { useRoute } from 'vue-router'
import { useRuntimeConfig } from '#imports'
import Nav from '@/components/Nav.vue'
import Toast from '@/components/Toast.vue'

// --- Setup & state ---
const route     = useRoute()
const auctionId = route.params.id
const { user, fetchSelf } = useAuth()

const auction       = ref({ ctoon: {}, winnerUsername: null, endAt: null })
const bids          = ref([])
const currentBid    = ref(0)
const bidAmount     = ref(0)
const userPoints    = ref(0)
const toastMessage  = ref('')
const toastType     = ref('error')

const now = ref(new Date())
let timer

// --- Socket.IO client (lazy connect) ---
const config = useRuntimeConfig()
const socket = io(
  import.meta.env.PROD
    ? undefined
    : `http://localhost:${config.public.socketPort}`,
  { autoConnect: false }
)

// --- Computed ---
// Auction ended?
const ended = computed(() => auction.value.endAt && new Date(auction.value.endAt) <= now.value)

// Highest bidder from bid history
const topBidderFromHistory = computed(() => {
  if (!bids.value.length) return null
  return bids.value
    .reduce((max, b) => b.amount > max.amount ? b : max, bids.value[0])
    .user
})

// If API returned a winnerUsername use that, otherwise fall back
const displayWinner = computed(() =>
  auction.value.winnerUsername || topBidderFromHistory.value
)

// Can the current user place this bid?
const canBid = computed(() =>
  !ended.value &&
  bidAmount.value >= currentBid.value + 1 &&
  bidAmount.value <= userPoints.value
)

const hasEnoughPoints = computed(() => bidAmount.value <= userPoints.value)

// --- Helpers ---
function showToast(msg, type = 'error') {
  toastMessage.value = msg
  toastType.value = type
  setTimeout(() => { toastMessage.value = '' }, 5000)
}

function formatRemaining(endAt) {
  const diff = new Date(endAt) - now.value
  if (diff <= 0) return '0s'
  const hrs  = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  if (hrs > 0)  return `${hrs}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

// --- Data loading & actions ---
async function loadAuction() {
  await fetchSelf()
  const data = await $fetch(`/api/auction/${auctionId}`)
  const pts  = await $fetch('/api/user/points')

  auction.value    = data
  bids.value       = data.bids
  currentBid.value = data.currentBid
  bidAmount.value  = data.currentBid + 1
  userPoints.value = pts.points
}

async function placeBid() {
  if (!canBid.value) return
  try {
    await $fetch(`/api/auction/${auctionId}/bid`, {
      method: 'POST',
      body: { amount: bidAmount.value }
    })
    showToast('Bid placed!', 'success')
  } catch (err) {
    showToast(err.data?.message || 'Bid failed.')
  }
}

// --- Lifecycle ---
onMounted(async () => {
  // 1) load initial data
  await loadAuction()

  // 2) countdown tick
  timer = setInterval(() => { now.value = new Date() }, 1000)

  // 3) socket event handlers
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id)
    socket.emit('join-auction', { auctionId })
  })

  socket.on('new-bid', payload => {
    console.log('Received new-bid:', payload)
    if (payload.auctionId.toString() === auctionId) {
      bids.value.unshift({ user: payload.user, amount: payload.amount })
      currentBid.value = payload.amount
      bidAmount.value  = payload.amount + 1
    }
  })

  socket.on('auction-ended', ({ winnerId, winningBid, winnerUsername }) => {
    console.log('Auction ended:', { winnerId, winningBid, winnerUsername })
    currentBid.value = winningBid ?? currentBid.value
    auction.value.winnerUsername = winnerUsername || auction.value.winnerUsername
  })

  socket.on('connect_error', err => {
    console.error('Socket connect error:', err)
  })

  // 4) finally connect
  socket.connect()
})

onUnmounted(() => {
  clearInterval(timer)
  socket.emit('leave-auction', { auctionId })
  socket.disconnect()
})
</script>

<style scoped>
/* Basic styling */
</style>
