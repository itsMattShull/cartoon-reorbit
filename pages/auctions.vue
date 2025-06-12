<template>
  <Nav />

  <div class="pt-16 px-4 py-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">Auctions</h1>

    <div class="lg:flex lg:gap-6">
      <!-- Filters & Sort sidebar -->
      <button
        class="lg:hidden mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
        @click="showFilters = !showFilters"
      >
        {{ showFilters ? 'Hide Filters' : 'Show Filters & Sort' }}
      </button>
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
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search Auctions</label>
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
            <label
              v-for="ser in uniqueSeries"
              :key="ser"
              class="flex items-center text-sm"
            >
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
            <label
              v-for="r in uniqueRarities"
              :key="r"
              class="flex items-center text-sm"
            >
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
              class="bg-white rounded-lg shadow p-4 flex flex-col justify-between h-full"
            >
              <!-- Centered image -->
              <div class="flex-grow flex items-center justify-center">
                <img
                  :src="auction.assetPath"
                  class="block max-w-full mx-auto rounded mb-4"
                />
              </div>

              <!-- Text at bottom -->
              <div class="mt-4">
                <h2 class="text-lg font-semibold mb-1 truncate">{{ auction.name }}</h2>
                <p class="text-sm text-gray-600 mb-1">Rarity: {{ auction.rarity }}</p>
                <p class="text-sm text-gray-600 mb-1">Mint #{{ auction.mintNumber ?? 'N/A' }}</p>
                <p class="text-sm text-red-600 mb-4">
                  Ending in {{ formatRemaining(auction.endAt) }}
                </p>
                <NuxtLink
                  :to="`/auction/${auction.id}`"
                  class="inline-block px-4 py-2 bg-indigo-600 text-white rounded text-center"
                >
                  View Auction
                </NuxtLink>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Nav from '@/components/Nav.vue'
import Toast from '@/components/Toast.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

const auctions = ref([])
const isLoading = ref(false)

// for live countdown
const now = ref(new Date())
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  loadAuctions()
})

onUnmounted(() => {
  clearInterval(timer)
})

// Filters & sorting
const searchQuery = ref('')
const selectedSeries = ref([])
const selectedRarities = ref([])
const sortBy = ref('endAsc')
const showFilters = ref(false)

function loadAuctions() {
  isLoading.value = true
  $fetch('/api/auctions')
    .then((data) => { auctions.value = data })
    .finally(() => { isLoading.value = false })
}

// derive unique filter options
const uniqueSeries = computed(() => {
  const s = new Set(auctions.value.map(a => a.series).filter(Boolean))
  return [...s].sort()
})
const uniqueRarities = computed(() => {
  const r = new Set(auctions.value.map(a => a.rarity).filter(Boolean))
  return [...r].sort()
})

// helper to format remaining time with seconds
function formatRemaining(endAt) {
  const diff = new Date(endAt) - now.value
  if (diff <= 0) return 'ended'
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

// filter and sort
const filteredAuctions = computed(() => {
  return auctions.value
    .filter(a => a.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
    .filter(a => !selectedSeries.value.length || selectedSeries.value.includes(a.series))
    .filter(a => !selectedRarities.value.length || selectedRarities.value.includes(a.rarity))
    .sort((a, b) => {
      switch (sortBy.value) {
        case 'endAsc': return new Date(a.endAt) - new Date(b.endAt)
        case 'nameAsc': return a.name.localeCompare(b.name)
        case 'nameDesc': return b.name.localeCompare(a.name)
        case 'mintAsc': return (a.mintNumber||0) - (b.mintNumber||0)
        case 'mintDesc': return (b.mintNumber||0) - (a.mintNumber||0)
        case 'rarity': return a.rarity.localeCompare(b.rarity)
        default: return 0
      }
    })
})
</script>

<style scoped>
/* scrollbar tweaks for filter lists */
::-webkit-scrollbar { width: 6px }
::-webkit-scrollbar-thumb { background-color: rgba(107,114,128,0.5); border-radius:3px }
</style>
