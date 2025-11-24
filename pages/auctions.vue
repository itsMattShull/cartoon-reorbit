<!-- File: pages/auctions.vue -->
<template>
  <Nav />

  <div class="mt-20 md:pt-10 px-4 py-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">Auctions</h1>

    <!-- Tabs -->
    <div class="mb-6 flex border-b">
      <button
        :class="[
          'px-4 py-2 -mb-px font-semibold',
          activeTab === 'current'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-600'
        ]"
        @click="activeTab = 'current'"
      >
        Current Auctions
      </button>

      <button
        :class="[
          'ml-6 px-4 py-2 -mb-px font-semibold',
          activeTab === 'mybids'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-600'
        ]"
        @click="activeTab = 'mybids'"
      >
        My Bids
      </button>

      <button
        :class="[
          'ml-6 px-4 py-2 -mb-px font-semibold',
          activeTab === 'mine'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-600'
        ]"
        @click="activeTab = 'mine'"
      >
        My Auctions
      </button>
    </div>

    <!-- Current Auctions -->
    <div v-if="activeTab === 'current'">
      <div class="lg:flex lg:gap-6">
        <!-- Toggle Filters on Mobile -->
        <button
          class="lg:hidden mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
          @click="showFilters = !showFilters"
        >
          {{ showFilters ? 'Hide Filters' : 'Show Filters & Sort' }}
        </button>

        <!-- Sidebar Filters -->
        <aside
          :class="[
            showFilters ? 'block' : 'hidden',
            'lg:block',
            'w-full lg:w-1/4',
            'bg-white rounded-lg shadow p-6'
          ]"
        >
          <!-- Search -->
          <div class="mb-4">
            <label for="search" class="block text-sm font-medium text-gray-700 mb-1">
              Search Auctions
            </label>
            <input
              id="search"
              type="text"
              v-model="searchQuery"
              placeholder="Type a name…"
              class="block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <!-- Filter by Series -->
          <div class="mb-4">
            <p class="text-sm font-medium text-gray-700 mb-2">Filter by Series</p>
            <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
              <label v-for="(ser, i) in uniqueSeries" :key="ser + i" class="flex items-center text-sm">
                <input
                  type="checkbox"
                  :value="ser"
                  v-model="selectedSeries"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2 capitalize">{{ ser }}</span>
              </label>
            </div>
          </div>

          <!-- Filter by Rarity -->
          <div class="mb-4">
            <p class="text-sm font-medium text-gray-700 mb-2">Filter by Rarity</p>
            <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
              <label v-for="(r, i) in uniqueRarities" :key="r + i" class="flex items-center text-sm">
                <input
                  type="checkbox"
                  :value="r"
                  v-model="selectedRarities"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2 capitalize">{{ r }}</span>
              </label>
            </div>
          </div>

          <!-- Filter by Ownership -->
          <div class="mb-4">
            <p class="text-sm font-medium text-gray-700 mb-2">Filter by Ownership</p>
            <div class="space-y-1">
              <label class="flex items-center text-sm">
                <input
                  type="radio"
                  value="all"
                  v-model="selectedOwned"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">All</span>
              </label>
              <label class="flex items-center text-sm">
                <input
                  type="radio"
                  value="owned"
                  v-model="selectedOwned"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">Owned Only</span>
              </label>
              <label class="flex items-center text-sm">
                <input
                  type="radio"
                  value="unowned"
                  v-model="selectedOwned"
                  class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <span class="ml-2">Un-owned Only</span>
              </label>
            </div>
          </div>

          <!-- Sort Select -->
          <div class="mt-6">
            <label for="sort" class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              id="sort"
              v-model="sortBy"
              class="mt-1 block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="endAsc">Ending Soonest</option>
              <option value="nameAsc">Name (A→Z)</option>
              <option value="nameDesc">Name (Z→A)</option>
              <option value="mintAsc">Mint # (Asc)</option>
              <option value="mintDesc">Mint # (Desc)</option>
              <option value="rarity">Rarity (A→Z)</option>
            </select>
          </div>
        </aside>

        <!-- Auction cards -->
        <div class="w-full lg:w-3/4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-if="isLoading">
              <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
            </template>
            <template v-else>
              <div
                v-for="auction in filteredAuctions"
                :key="auction.id"
                class="bg-white rounded-lg shadow p-4 flex flex-col justify-between h-full relative"
              >
                <span
                  v-if="auction.isOwned"
                  class="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Owned
                </span>
                <span
                  v-else
                  class="absolute top-2 right-2 bg-gray-300 text-gray-700 text-xs font-semibold px-2 py-1 rounded"
                >
                  Un-owned
                </span>

                <div class="flex-grow flex items-center justify-center">
                  <img :src="auction.assetPath" class="block max-w-full mx-auto rounded mb-4" />
                </div>

                <div class="mt-4">
                  <h2 class="text-lg font-semibold mb-1 truncate">{{ auction.name }}</h2>
                  <p class="text-sm text-gray-600 mb-1">Rarity: {{ auction.rarity }}</p>
                  <p v-if="!auction.isHolidayItem" class="text-sm text-gray-600 mb-1">
                    Mint #{{ auction.mintNumber ?? 'N/A' }}
                  </p>
                  <p class="text-sm text-gray-600 mb-1">
                    Highest Bid: {{ auction.highestBid != null ? auction.highestBid + ' points' : 'No bids' }}
                  </p>
                  <p class="text-sm text-red-600 mb-4">
                    Ending in {{ formatRemaining(auction.endAt) }}
                  </p>
                  <NuxtLink :to="`/auction/${auction.id}`" class="inline-block px-4 py-2 bg-indigo-600 text-white rounded text-center">
                    View Auction
                  </NuxtLink>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- My Bids -->
    <div v-else-if="activeTab === 'mybids'">
      <div v-if="isLoadingMyBids" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
      </div>

      <div v-else>
        <div v-if="sortedMyBids.length === 0" class="text-gray-500">
          You haven't bid on any auctions yet.
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="bid in sortedMyBids"
            :key="bid.id"
            class="relative bg-white rounded-lg shadow p-4 h-full flex flex-col"
          >
            <!-- Outcome badge (ended only) -->
            <div class="absolute top-2 right-2">
              <span
                v-if="isEnded(bid.endAt) && bid.didWin"
                class="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded"
              >
                Won
              </span>
              <span
                v-else-if="isEnded(bid.endAt) && !bid.didWin"
                class="bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded"
              >
                Lost
              </span>
            </div>

            <div class="flex-grow flex items-center justify-center mb-4">
              <img :src="bid.assetPath" class="max-w-full rounded" />
            </div>

            <h2 class="text-lg font-semibold mb-1 truncate">{{ bid.name }}</h2>
            <p class="text-sm text-gray-600 mb-1">
              Your Bid: {{ bid.myBid != null ? bid.myBid + ' points' : '—' }}
            </p>
            <p class="text-sm text-gray-600 mb-1">
              Highest Bid: {{ bid.highestBid != null ? bid.highestBid + ' points' : 'No bids' }}
            </p>

            <p
              class="text-sm mb-4"
              :class="isEnded(bid.endAt) ? 'text-gray-600' : 'text-red-600'"
            >
              <template v-if="!isEnded(bid.endAt)">
                Ending in {{ formatRemaining(bid.endAt) }}
              </template>
              <template v-else>
                Ended on {{ formatDate(bid.endAt) }}
              </template>
            </p>

            <NuxtLink
              :to="`/auction/${bid.id}`"
              class="inline-block px-4 py-2 bg-indigo-600 text-white rounded text-center mt-auto"
            >
              View Auction
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- My Auctions -->
    <div v-else>
      <div v-if="isLoadingMy" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse h-64"></div>
      </div>

      <div v-else>
        <div v-if="myAuctions.length === 0" class="text-gray-500">
          You haven't created any auctions yet.
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="auction in myAuctions"
            :key="auction.id"
            class="relative bg-white rounded-lg shadow p-4 h-full"
          >
            <!-- status badge -->
            <div class="absolute top-2 right-2">
              <span
                v-if="new Date(auction.endAt) > now"
                class="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
              >
                In Progress
              </span>
              <span v-else class="bg-gray-500 text-white text-xs font-semibold px-2 py-1 rounded">
                Ended
              </span>
            </div>

            <div class="flex-grow flex items-center justify-center mb-4">
              <img :src="auction.assetPath" class="max-w-full rounded" />
            </div>

            <h2 class="text-lg font-semibold mb-1 truncate">{{ auction.name }}</h2>
            <p class="text-sm text-gray-600 mb-1">Created: {{ formatDate(auction.createdAt) }}</p>
            <p v-if="!isEnded(auction.endAt)" class="text-sm text-red-600 mb-1">Ending in: {{ formatRemaining(auction.endAt) }}</p>
            <p class="text-sm text-gray-600 mb-1">Initial Bid: {{ auction.initialBid }} points</p>
            <p class="text-sm text-gray-600 mb-1">
              Winning Bid: {{ auction.winningBid != null ? auction.winningBid + ' points' : 'No bids' }}
            </p>
            <p v-if="auction.winningBidder" class="text-sm text-gray-600">
              Winner: {{ auction.winningBidder }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

const activeTab = ref('current')

const auctions = ref([])
const isLoading = ref(false)

const myAuctions = ref([])
const isLoadingMy = ref(false)

const myBids = ref([])
const isLoadingMyBids = ref(false)

const now = ref(new Date())
let timer = null

// Filters & sorting (Current Auctions)
const searchQuery = ref('')
const selectedSeries = ref([])
const selectedRarities = ref([])
const selectedOwned = ref('all')
const sortBy = ref('endAsc')
const showFilters = ref(false)

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  loadAuctions()
})

onUnmounted(() => {
  clearInterval(timer)
})

function loadAuctions() {
  isLoading.value = true
  $fetch('/api/auctions')
    .then(data => {
      auctions.value = data
    })
    .finally(() => {
      isLoading.value = false
    })
}

function loadMyAuctions() {
  isLoadingMy.value = true
  $fetch('/api/my-auctions')
    .then(data => {
      myAuctions.value = data
    })
    .finally(() => {
      isLoadingMy.value = false
    })
}

function loadMyBids() {
  isLoadingMyBids.value = true
  $fetch('/api/auction/mybids')
    .then(data => {
      // Expect each item to include at least:
      // { id, name, assetPath, endAt, myBid, highestBid, didWin }
      myBids.value = Array.isArray(data) ? data : []
    })
    .finally(() => {
      isLoadingMyBids.value = false
    })
}

watch(activeTab, newTab => {
  if (newTab === 'mine' && myAuctions.value.length === 0) {
    loadMyAuctions()
  }
  if (newTab === 'mybids' && myBids.value.length === 0) {
    loadMyBids()
  }
})

function isEnded(endAt) {
  return new Date(endAt) <= now.value
}

function formatRemaining(endAt) {
  const diff = new Date(endAt) - now.value
  if (diff <= 0) return 'ended'
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  if (hrs > 0)  return `${hrs}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function formatDate(date) {
  return new Date(date).toLocaleDateString()
}

const uniqueSeries = computed(() => {
  return [...new Set(auctions.value.map(a => a.series).filter(Boolean))].sort()
})
const uniqueRarities = computed(() => {
  return [...new Set(auctions.value.map(a => a.rarity).filter(Boolean))].sort()
})

const filteredAuctions = computed(() => {
  return auctions.value
    .filter(a => a.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
    .filter(a => !selectedSeries.value.length || selectedSeries.value.includes(a.series))
    .filter(a => !selectedRarities.value.length || selectedRarities.value.includes(a.rarity))
    .filter(a => {
      if (selectedOwned.value === 'owned')   return a.isOwned
      if (selectedOwned.value === 'unowned') return !a.isOwned
      return true
    })
    .sort((a, b) => {
      switch (sortBy.value) {
        case 'endAsc':   return new Date(a.endAt) - new Date(b.endAt)
        case 'nameAsc':  return a.name.localeCompare(b.name)
        case 'nameDesc': return b.name.localeCompare(a.name)
        case 'mintAsc':  return (a.mintNumber||0) - (b.mintNumber||0)
        case 'mintDesc': return (b.mintNumber||0) - (a.mintNumber||0)
        case 'rarity':   return a.rarity.localeCompare(b.rarity)
        default:         return 0
      }
    })
})

/**
 * My Bids sorting:
 *  - Active auctions first (not ended)
 *  - Within each group, ending soonest first
 */
const sortedMyBids = computed(() => {
  return [...myBids.value].sort((a, b) => {
    const aEnded = isEnded(a.endAt)
    const bEnded = isEnded(b.endAt)
    if (aEnded !== bEnded) return aEnded ? 1 : -1
    return new Date(a.endAt) - new Date(b.endAt)
  })
})
</script>

<style scoped>
/* scrollbar tweaks for filter lists */
::-webkit-scrollbar { width: 6px }
::-webkit-scrollbar-thumb { background-color: rgba(107,114,128,0.5); border-radius:3px }
</style>
