<template>
  <Nav />

  <div class="pt-16 px-4 py-6 max-w-3xl mx-auto">
    <!-- Skeleton -->
    <template v-if="loading">
      <div class="animate-pulse space-y-4">
        <div class="h-8 bg-gray-200 rounded w-1/3"></div>
        <div class="h-4 bg-gray-200 rounded w-1/4"></div>
        <div class="h-64 bg-gray-200 rounded"></div>
        <div class="space-y-2">
          <div class="h-4 bg-gray-200 rounded w-2/3"></div>
          <div class="h-4 bg-gray-200 rounded w-1/2"></div>
          <div class="h-4 bg-gray-200 rounded w-1/4"></div>
          <div class="h-4 bg-gray-200 rounded w-1/3"></div>
        </div>
        <div class="h-10 bg-gray-200 rounded w-1/2"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="h-32 bg-gray-200 rounded"></div>
          <div class="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    </template>

    <!-- Real content -->
    <template v-else>
      <h1 class="text-3xl font-bold mb-4">Auction: {{ auction.ctoon.name }}</h1>

      <p v-if="!ended" class="text-sm text-red-600 mb-6">
        {{ `Ending in ${formatRemaining(auction.endAt)}` }}
      </p>

      <div v-if="ended" class="mb-6">
        <span class="inline-block bg-green-100 text-green-800 text-xl font-bold px-4 py-2 rounded-full">
          🎉 Winner: {{ displayWinner || '—' }} 🎉
        </span>
      </div>

      <div class="flex justify-center mb-6">
        <img
          :src="auction.ctoon.assetPath"
          :alt="auction.ctoon.name"
          class="block max-w-full mx-auto rounded"
        />
      </div>

      <div class="mb-6 space-y-2">
        <p><strong>Series:</strong> {{ auction.ctoon.series }}</p>
        <p><strong>Rarity:</strong> {{ auction.ctoon.rarity }}</p>
        <p><strong>Mint #:</strong> {{ auction.ctoon.mintNumber ?? 'N/A' }}</p>
        <p>
          <strong>Current Highest Bid:</strong>
          {{ displayCurrentBid }} pts
          <span v-if="!hasBids" class="text-xs text-gray-500 ml-2">(starting price)</span>
        </p>
      </div>

      <!-- Bid Form -->
      <div v-if="!ended" class="mb-6">
        <button
          @click="placeBid"
          :disabled="!canBid"
          class="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
        >
          <template v-if="hasBids">
            Increase bid to {{ displayCurrentBid + bidIncrement }} pts
          </template>
          <template v-else>
            Place opening bid at {{ auction.initialBet }} pts
          </template>
        </button>

        <p v-if="isTopBidder" class="text-sm text-gray-500 mt-2">
          You are currently the highest bidder and cannot bid again.
        </p>
        <p v-else-if="!canBid" class="text-sm text-red-500 mt-2">
          You need {{ nextBidAmount }} pts but only have {{ userPoints }} pts.
        </p>

        <p v-if="!ended" class="text-sm text-red-600 mb-6 mt-4">
          {{ `Ending in ${formatRemaining(auction.endAt)}` }}
        </p>
      </div>

      <!-- History & Sales -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="bg-white shadow rounded p-4">
          <h2 class="text-xl font-semibold mb-2">Bid History</h2>
          <ul class="space-y-1 text-sm">
            <li v-for="(b, i) in bids" :key="i">
              {{ b.user }}: {{ b.amount }} pts
            </li>
            <li v-if="!bids.length" class="text-gray-500">No bids yet.</li>
          </ul>
        </div>

        <div class="bg-white shadow rounded p-4">
          <h2 class="text-xl font-semibold mb-2">Recent Sales</h2>
          <ul class="space-y-1 text-sm">
            <li v-for="(sale, i) in recentSales" :key="i">
              {{ formatDate(sale.endedAt) }}: {{ sale.soldFor }} pts
            </li>
            <li v-if="!recentSales.length" class="text-gray-500">No past sales.</li>
          </ul>
        </div>
      </div>

      <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />
    </template>
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

const route = useRoute()
const auctionId = route.params.id
const { user, fetchSelf } = useAuth()

const loading      = ref(true)
const auction      = ref({ ctoon: {}, winnerUsername: null, endAt: null, initialBet: 0, highestBidderId: null, highestBid: 0 })
const bids         = ref([])
const currentBid   = ref(0)   // will mirror the latest broadcast amount after first bid
const userPoints   = ref(0)
const recentSales  = ref([])
const toastMessage = ref('')
const toastType    = ref('error')

const now = ref(new Date())
let timer

const config = useRuntimeConfig()
const socket = io(
  import.meta.env.PROD ? undefined : `http://localhost:${config.public.socketPort}`,
  { autoConnect: false }
)

// Helpers
function showToast(msg, type = 'error') {
  toastMessage.value = msg
  toastType.value    = type
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
function formatDate(dt) {
  return new Date(dt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Data load
async function loadAuction() {
  await fetchSelf()
  const data = await $fetch(`/api/auction/${auctionId}`)
  const pts  = await $fetch('/api/user/points')

  auction.value = data
  bids.value    = data.bids || []
  // If backend returns currentBid, keep it; otherwise derive:
  currentBid.value = data.currentBid ?? data.highestBid ?? 0

  userPoints.value = pts.points
  recentSales.value = await $fetch(`/api/auction/${auctionId}/getRecentAuctions`)
}

// Computed
const ended = computed(() =>
  auction.value.endAt && new Date(auction.value.endAt) <= now.value
)

// Did at least one bid happen?
const hasBids = computed(() => {
  if (bids.value.length > 0) return true
  if (auction.value.highestBidderId) return true
  return (auction.value.highestBid || 0) > 0
})

// What should we *show* as the current?
const displayCurrentBid = computed(() => {
  // If there are bids, prefer live currentBid (from socket), fallback to auction.highestBid
  if (hasBids.value) return currentBid.value || auction.value.highestBid || 0
  // Otherwise show the starting price
  return auction.value.initialBet || 0
})

// Increment schedule (only matters after the opening bid)
const bidIncrement = computed(() => {
  const v = hasBids.value ? (displayCurrentBid.value) : 0
  if (!hasBids.value) return 0
  if (v < 1000) return 10
  if (v < 10000) return 100
  return 1000
})

// Amount that will be submitted to the server
const nextBidAmount = computed(() => {
  return hasBids.value
    ? (displayCurrentBid.value + bidIncrement.value)
    : (auction.value.initialBet || 0)
})

const topBidderFromHistory = computed(() => {
  if (!bids.value.length) return null
  return bids.value.reduce((max, b) => b.amount > max.amount ? b : max, bids.value[0]).user
})

const displayWinner = computed(() =>
  auction.value.winnerUsername || topBidderFromHistory.value
)

const isTopBidder = computed(() =>
  user.value?.username && topBidderFromHistory.value === user.value.username
)

const canBid = computed(() =>
  !ended.value &&
  !isTopBidder.value &&
  userPoints.value >= nextBidAmount.value
)

// Actions
async function placeBid() {
  if (!canBid.value) return
  try {
    await $fetch(`/api/auction/${auctionId}/bid`, {
      method: 'POST',
      body: { amount: nextBidAmount.value }
    })
    showToast(hasBids.value ? `Bid +${bidIncrement.value} placed!` : 'Opening bid placed!', 'success')
  } catch (err) {
    showToast(err?.data?.message || 'Bid failed.')
  }
}

// Lifecycle & sockets
onMounted(async () => {
  await loadAuction()
  loading.value = false
  timer = setInterval(() => { now.value = new Date() }, 1000)

  socket.on('connect', () => {
    socket.emit('join-auction', { auctionId })
  })

  socket.on('new-bid', payload => {
    if (payload.auctionId.toString() !== auctionId) return
    // Add to history + update the “current”
    bids.value.unshift({ user: payload.user, amount: payload.amount })
    currentBid.value = payload.amount
    if (payload.endAt) {
      auction.value.endAt = payload.endAt
    }
  })

  socket.on('auction-ended', ({ winnerUsername, winningBid }) => {
    auction.value.winnerUsername = winnerUsername || auction.value.winnerUsername
    currentBid.value = winningBid ?? currentBid.value
  })

  socket.connect()
})

onUnmounted(() => {
  clearInterval(timer)
  socket.emit('leave-auction', { auctionId })
  socket.disconnect()
})
</script>
