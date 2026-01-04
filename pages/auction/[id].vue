<template>
  <Nav />

  <div class="pt-16 px-4 py-6 max-w-3xl mx-auto mt-16 md:mt-20">
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
        <p v-if="!auction.isHolidayItem">
          <strong>Mint #:</strong> {{ auction.ctoon.mintNumber ?? 'N/A' }}
        </p>
        <p><strong>Current Highest Bid:</strong> {{ displayedBid }} pts</p>
        <p v-if="hasBids && currentTopBidder">
          <strong>Top Bidder:</strong> {{ currentTopBidder }}
        </p>
      </div>

      <!-- Featured auction notice -->
      <div
        v-if="auction.isFeatured"
        class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <div class="font-semibold mb-1">
          ⭐ Featured Auction
        </div>
        <p>
          This is a featured auction. You’ll only be allowed to bid if you
          haven’t owned more than one copy of this cToon in the last 30 days.
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
            <template v-if="!hasBids">
              Bid {{ nextBidAmount }} pts
            </template>
            <template v-else>
              Increase bid to {{ nextBidAmount }} pts
            </template>
          </button>
          <p v-if="isTopBidder" class="text-sm text-gray-500 mt-2">
            You are currently the highest bidder and cannot bid again.
          </p>
          <p v-if="!canBid && !isTopBidder" class="text-sm text-red-500 mt-2">
            You need {{ Math.max(0, nextBidAmount - userPoints) }} more pts (you have {{ userPoints }}).
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
              :placeholder="displayedBid + bidIncrement"
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
            <li>Must be &gt; current price ({{ displayedBid }} pts).</li>
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
      <!-- Scavenger Hunt Modal -->
      <ScavengerHuntModal v-if="scavenger.isOpen && scavenger.sessionId" />
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
import ScavengerHuntModal from '@/components/ScavengerHuntModal.vue'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

definePageMeta({ title: 'Auction Details', middleware: ['auth'], layout: 'default' })

// --- Setup & state ---
const route       = useRoute()
const auctionId   = route.params.id
const { user, fetchSelf } = useAuth()
const scavenger = useScavengerHunt()

const loading      = ref(true)
const auction      = ref({ ctoon: {}, winnerUsername: null, endAt: null, highestBid: 0, initialBet: 0 })
const bids         = ref([])
const userPoints   = ref(0)
const recentSales  = ref([])
const toastMessage = ref('')
const toastType    = ref('error')

const currentTopBidder = ref(null)  // live top bidder username (socket/server)

// Auto-bid state
const myAutoBid    = ref(null)       // { maxAmount, isActive } or null
const autoBidInput = ref(null)

const now = ref(new Date())
let timer

// --- Socket.IO client ---
const config = useRuntimeConfig()
let socket

// --- Computed ---
const ended = computed(() =>
  auction.value.endAt && new Date(auction.value.endAt) <= now.value
)

// Do we have any bids yet?
const hasBids = computed(() => (auction.value?.highestBid ?? 0) > 0)

// Price to show as "current": highestBid if present, else initialBet
const displayedBid = computed(() => {
  const hb = auction.value?.highestBid ?? 0
  return hb > 0 ? hb : (auction.value?.initialBet ?? 0)
})

// Increment schedule based on displayed price
const bidIncrement = computed(() => {
  const v = displayedBid.value
  return v < 1_000 ? 10 : v < 10_000 ? 100 : 1_000
})

// Next amount the button will submit
// - first bid: exactly initial price (displayedBid)
// - subsequent bids: displayedBid + increment
const nextBidAmount = computed(() => {
  return hasBids.value ? displayedBid.value + bidIncrement.value : displayedBid.value
})

// Prefer live top-bidder; fallback to winner or history for display
const topBidderFromHistory = computed(() => {
  if (!bids.value.length) return null
  return bids.value.reduce((max, b) => (b.amount > max.amount ? b : max), bids.value[0]).user
})

const displayWinner = computed(() =>
  auction.value.winnerUsername || currentTopBidder.value || topBidderFromHistory.value
)

const isTopBidder = computed(() =>
  user.value?.username && currentTopBidder.value === user.value.username
)

// Can bid if not ended, not already top, and can afford the whole nextBidAmount
const canBid = computed(() =>
  !ended.value &&
  !isTopBidder.value &&
  userPoints.value >= nextBidAmount.value
)

// Auto-bid must be strictly greater than current displayed price, and ≤ balance (UI guard)
const canSaveAutoBid = computed(() => {
  if (ended.value) return false
  const v = Number(autoBidInput.value)
  if (!Number.isFinite(v)) return false
  if (v <= displayedBid.value) return false
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

  auction.value = data
  // 👇 Ensure the computed price uses the correct source on first render
  auction.value.highestBid = data.highestBid ?? data.currentBid ?? 0

  bids.value        = data.bids || []
  userPoints.value  = pts.points

  // Prefer API-provided current leader if available
  const histTop = topBidderFromHistory.value
  currentTopBidder.value = histTop ?? data.highestBidderUsername ?? null

  recentSales.value = await $fetch(`/api/auction/${auctionId}/getRecentAuctions`)

  try {
    const ab = await $fetch(`/api/auction/${auctionId}/autobid`)
    myAutoBid.value = ab || null
    autoBidInput.value = ab?.maxAmount ?? null
  } catch {}
}


async function placeBid() {
  if (!canBid.value) return
  try {
    await $fetch(`/api/auction/${auctionId}/bid`, {
      method: 'POST',
      body: { amount: nextBidAmount.value }
    })
    showToast(!hasBids.value ? `Bid ${nextBidAmount.value} placed!` : `Bid +${bidIncrement.value} placed!`, 'success')
    // Trigger scavenger immediately (no result modal here)
    await scavenger.maybeTrigger('auction_bid', { open: true })
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
    // Trigger scavenger chance after setting/updating auto-bid
    await scavenger.maybeTrigger('auction_bid', { open: true })
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
  // Clear any stale scavenger state on page entry
  scavenger.reset()
  await loadAuction()
  loading.value = false
  timer = setInterval(() => { now.value = new Date() }, 1000)

  const path = import.meta.env.PROD
      ? undefined
      : `http://localhost:${config.public.socketPort}`

  socket = io(path, {
    autoConnect: false,
    withCredentials: true,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling']
  })

  socket.on('connect', () => {
    socket.emit('join-auction', { auctionId })
  })

  socket.on('new-bid', payload => {
    if (String(payload.auctionId) !== String(auctionId)) return

    bids.value.unshift({ user: payload.user, amount: payload.amount })
    auction.value.highestBid = payload.amount
    currentTopBidder.value   = payload.user

    if (payload.endAt) {
      const d = new Date(payload.endAt)
      if (!Number.isNaN(d.getTime())) {
        auction.value.endAt = d.toISOString()
      }
    }
  })

  socket.on('auction-ended', ({ winnerUsername, winningBid }) => {
    auction.value.winnerUsername = winnerUsername || auction.value.winnerUsername
    if (Number.isFinite(winningBid)) {
      auction.value.highestBid = winningBid
    }
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
