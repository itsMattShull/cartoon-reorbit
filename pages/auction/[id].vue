<template>
  <Nav />

  <div class="pt-16 px-4 py-6 max-w-3xl mx-auto">
    <!-- Skeleton when loading -->
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
      <!-- Auction Header -->
      <h1 class="text-3xl font-bold mb-4">Auction: {{ auction.ctoon.name }}</h1>

      <!-- Countdown / Ended Message -->
      <div class="mb-6">
        <p v-if="!ended" class="text-sm text-red-600">
          {{ `Ending in ${formatRemaining(auction.endAt)}` }}
        </p>
        <span
          v-else
          class="inline-block bg-green-100 text-green-800 text-xl font-bold px-4 py-2 rounded-full"
        >
          🎉 Winner: {{ displayWinner || '—' }} 🎉
        </span>
      </div>

      <!-- Ctoon Image Centered -->
      <div class="flex justify-center mb-6">
        <img
          :src="auction.ctoon.assetPath"
          :alt="auction.ctoon.name"
          class="block max-w-full mx-auto rounded"
        />
      </div>

      <!-- Details -->
      <div class="mb-6 space-y-2">
        <p><strong>Series:</strong> {{ auction.ctoon.series }}</p>
        <p><strong>Rarity:</strong> {{ auction.ctoon.rarity }}</p>
        <p><strong>Mint #:</strong> {{ auction.ctoon.mintNumber ?? 'N/A' }}</p>
        <p><strong>Current Highest Bid:</strong> {{ currentBid }} pts</p>
        <p v-if="currentTopBidder">
          <strong>Top Bidder:</strong> {{ currentTopBidder }}
        </p>
      </div>

      <!-- Bid + Auto-bid Section -->
      <div v-if="!ended" class="mb-8 space-y-6">
        <!-- Manual Bid -->
        <div class="bg-white shadow rounded p-4">
          <h2 class="text-lg font-semibold mb-3">Place Bid</h2>
          <button
            @click="placeBid"
            :disabled="!canBid"
            class="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
          >
            Increase bid to {{ currentBid + bidIncrement }} pts
          </button>
          <p v-if="isTopBidder" class="text-sm text-gray-500 mt-2">
            You are currently the highest bidder and cannot bid again.
          </p>
          <p v-if="!canBid && !isTopBidder" class="text-sm text-red-500 mt-2">
            You only have {{ userPoints }} pts.
          </p>
          <p v-if="!ended" class="text-sm text-red-600">
            {{ `Ending in ${formatRemaining(auction.endAt)}` }}
          </p>
        </div>

        <!-- Max Auto Bid -->
        <div class="bg-white shadow rounded p-4">
          <h2 class="text-lg font-semibold mb-3">Max Auto Bid</h2>

          <div class="mb-2 text-sm text-gray-600">
            When someone outbids you, we'll automatically raise your bid by the next increment
            ({{ bidIncrement }} pts at the current level), up to your max — but only if you have
            enough points at that moment.
          </div>

          <div class="flex items-center gap-3 mb-3">
            <input
              v-model.number="autoBidInput"
              type="number"
              min="0"
              class="border rounded px-3 py-2 w-48"
              :disabled="ended"
              :placeholder="currentBid + bidIncrement"
            />
            <button
              @click="saveAutoBid"
              :disabled="!canSaveAutoBid"
              class="px-4 py-2 bg-emerald-600 text-white rounded disabled:opacity-50"
            >
              {{ myAutoBid ? 'Update Max' : 'Set Max' }}
            </button>
            <button
              v-if="myAutoBid"
              @click="disableAutoBid"
              class="px-4 py-2 bg-gray-200 text-gray-800 rounded"
            >
              Disable
            </button>
          </div>

          <div class="text-sm">
            <p v-if="myAutoBid">
              <strong>Your current Max:</strong> {{ myAutoBid.maxAmount }} pts
              <span v-if="!myAutoBid.isActive" class="ml-2 inline-block px-2 py-0.5 text-xs bg-gray-100 rounded">inactive</span>
            </p>
            <p v-else class="text-gray-500">No Max Auto Bid set.</p>
          </div>

          <ul class="mt-3 text-xs text-gray-500 list-disc list-inside">
            <li>Must be &gt; current bid ({{ currentBid }} pts).</li>
            <li>We recommend setting ≤ your current points ({{ userPoints }} pts).</li>
            <li>Priority when multiple users have auto-bids: first created goes first each step.</li>
          </ul>
        </div>
      </div>

      <!-- History & Sales Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- Bid History Card -->
        <div class="bg-white shadow rounded p-4">
          <h2 class="text-xl font-semibold mb-2">Bid History</h2>
          <ul class="space-y-1 text-sm">
            <li v-for="(b, i) in bids" :key="i">
              {{ b.user }}: {{ b.amount }} pts
            </li>
            <li v-if="!bids.length" class="text-gray-500">No bids yet.</li>
          </ul>
        </div>

        <!-- Recent Sales Card -->
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

      <!-- Toast -->
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

// --- Setup & state ---
const route       = useRoute()
const auctionId   = route.params.id
const { user, fetchSelf } = useAuth()

const loading      = ref(true)
const auction      = ref({ ctoon: {}, winnerUsername: null, endAt: null })
const bids         = ref([])
const currentBid   = ref(0)
const currentTopBidder = ref(null)  // live top bidder username (from socket / server)
const userPoints   = ref(0)
const recentSales  = ref([])
const toastMessage = ref('')
const toastType    = ref('error')

// Auto-bid state
const myAutoBid    = ref(null)       // { maxAmount, isActive } or null
const autoBidInput = ref(null)

const now = ref(new Date())
let timer

// --- Socket.IO client ---
const config = useRuntimeConfig()
const socket = io(
  import.meta.env.PROD
    ? undefined
    : `http://localhost:${config.public.socketPort}`,
  { autoConnect: false }
)

// --- Computed ---
const ended = computed(() =>
  auction.value.endAt && new Date(auction.value.endAt) <= now.value
)

// Prefer the live field; fallback to winner or history for display only
const displayWinner = computed(() =>
  auction.value.winnerUsername || currentTopBidder.value || topBidderFromHistory.value
)

// Keep as a fallback for display; logic uses currentTopBidder instead
const topBidderFromHistory = computed(() => {
  if (!bids.value.length) return null
  return bids.value.reduce((max, b) => b.amount > max.amount ? b : max, bids.value[0]).user
})

const isTopBidder = computed(() =>
  user.value?.username && currentTopBidder.value === user.value.username
)

const bidIncrement = computed(() =>
  currentBid.value < 1_000   ? 10  :
  currentBid.value < 10_000  ? 100 :
                              1_000
)

const canBid = computed(() =>
  !ended.value &&
  !isTopBidder.value &&
  userPoints.value >= bidIncrement.value
)

const canSaveAutoBid = computed(() => {
  if (ended.value) return false
  const v = Number(autoBidInput.value)
  if (!Number.isFinite(v)) return false
  if (v <= currentBid.value) return false
  // UI nudge: don't allow setting above balance (server will also check per step)
  if (v > userPoints.value) return false
  return true
})

// --- Helpers ---
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

// --- Data loading & actions ---
async function loadAuction() {
  await fetchSelf()
  const data = await $fetch(`/api/auction/${auctionId}`)
  const pts  = await $fetch('/api/user/points')

  console.log('Loaded auction:', data)

  auction.value    = data
  bids.value       = data.bids || []
  currentBid.value = data.currentBid ?? data.highestBid ?? 0
  userPoints.value = pts.points

  // use server-provided if available; else try to infer
  currentTopBidder.value = data.topBidderUsername || (bids.value[0]?.user ?? null)

  // last 3 sales
  recentSales.value = await $fetch(`/api/auction/${auctionId}/getRecentAuctions`)

  // Load my current auto-bid (if endpoint present)
  try {
    const ab = await $fetch(`/api/auction/${auctionId}/autobid`)
    myAutoBid.value = ab || null
    autoBidInput.value = ab?.maxAmount ?? null
  } catch {
    // endpoint might not exist yet; ignore
  }
}

async function placeBid() {
  if (!canBid.value) return
  console.log({ currentBid: currentBid.value, bidIncrement: bidIncrement.value })
  try {
    await $fetch(`/api/auction/${auctionId}/bid`, {
      method: 'POST',
      body: { amount: currentBid.value + bidIncrement.value }
    })
    showToast(`Bid +${bidIncrement.value} placed!`, 'success')
  } catch (err) {
    showToast(err.data?.message || 'Bid failed.')
  }
}

// Auto-bid API
async function saveAutoBid() {
  try {
    await $fetch(`/api/auction/${auctionId}/autobid`, {
      method: 'POST',
      body: { maxAmount: Number(autoBidInput.value) }
    })
    myAutoBid.value = { maxAmount: Number(autoBidInput.value), isActive: true }
    showToast('Max Auto Bid saved.', 'success')
  } catch (err) {
    showToast(err.data?.message || 'Failed to save Max Auto Bid.')
  }
}

async function disableAutoBid() {
  try {
    await $fetch(`/api/auction/${auctionId}/autobid`, { method: 'DELETE' })
    myAutoBid.value = null
    autoBidInput.value = null
    showToast('Max Auto Bid disabled.', 'success')
  } catch (err) {
    showToast(err.data?.message || 'Failed to disable Max Auto Bid.')
  }
}

// --- Lifecycle ---
onMounted(async () => {
  await loadAuction()
  loading.value = false
  timer = setInterval(() => { now.value = new Date() }, 1000)

  socket.on('connect', () => {
    socket.emit('join-auction', { auctionId })
  })

  socket.on('new-bid', payload => {
    // Only handle for this auction
    if (String(payload.auctionId) !== String(auctionId)) return

    // Update local state
    bids.value.unshift({ user: payload.user, amount: payload.amount })
    currentBid.value = payload.amount
    currentTopBidder.value = payload.user

    // Update end time if extended
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

<style scoped>
/* Basic styling */
</style>
