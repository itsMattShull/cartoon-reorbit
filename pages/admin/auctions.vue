<template>
  <Nav />
  <div class="mt-12">&nbsp;</div>
  <div class="p-4 mt-16 md:mt-20">
    <!-- Filters -->
    <div class="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
      <div>
        <label for="ctoonNameSearch" class="block text-sm font-medium text-gray-700 mb-1">cToon Name</label>
        <input
          id="ctoonNameSearch"
          v-model="ctoonNameQuery"
          type="text"
          placeholder="Search by name…"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label for="characterSearch" class="block text-sm font-medium text-gray-700 mb-1">Characters</label>
        <input
          id="characterSearch"
          v-model="characterQuery"
          type="text"
          placeholder="e.g. Bugs, Daffy"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label for="creatorSearch" class="block text-sm font-medium text-gray-700 mb-1">Creator</label>
        <input
          id="creatorSearch"
          v-model="creatorQuery"
          type="text"
          placeholder="Type a username…"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div>
        <label for="rarityFilter" class="block text-sm font-medium text-gray-700 mb-1">Rarity</label>
        <select
          id="rarityFilter"
          v-model="selectedRarity"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All</option>
          <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>

      <div>
        <label for="statusFilter" class="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select
          id="statusFilter"
          v-model="selectedStatus"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All</option>
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </div>

      <div>
        <label for="bidderFilter" class="block text-sm font-medium text-gray-700 mb-1">Has Bidder</label>
        <select
          id="bidderFilter"
          v-model="selectedHasBidder"
          class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option v-for="opt in hasBidderOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="mb-4 text-sm text-gray-600">
      Total Results: {{ total }} auctions
    </div>

    <!-- Desktop Table -->
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full bg-white rounded shadow">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-2">cToon</th>
            <th class="px-4 py-2">Creator</th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Created</th>
            <th class="px-4 py-2">Duration</th>
            <th class="px-4 py-2">Hours Left</th>
            <th class="px-4 py-2">Highest Bidder</th>
            <th class="px-4 py-2">Highest Bid</th>
            <th class="px-4 py-2"># of Bids</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="auc in auctions" :key="auc.id" class="border-t">
            <td class="px-4 py-2">
              <img :src="auc.userCtoon.ctoon?.assetPath" alt="" class="w-12 h-12 object-cover rounded" />
            </td>
            <td class="px-4 py-2">{{ auc.creator?.username || '—' }}</td>
            <td class="px-4 py-2">{{ auc.status }}</td>
            <td class="px-4 py-2">{{ formatDate(auc.createdAt) }}</td>
            <td class="px-4 py-2">{{ auc.duration }} days</td>
            <td class="px-4 py-2">{{ hoursLeft(auc.endAt) }}</td>
            <td class="px-4 py-2">{{ auc.highestBidder?.username || '—' }}</td>
            <td class="px-4 py-2">{{ auc.highestBid }}</td>
            <td class="px-4 py-2">{{ auc.bids.length }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards -->
    <div class="md:hidden grid grid-cols-1 gap-4">
      <div v-for="auc in auctions" :key="auc.id" class="border rounded p-4 shadow">
        <div class="flex items-center mb-4">
          <img :src="auc.userCtoon.ctoon?.assetPath" alt="" class="w-16 h-16 object-cover rounded mr-4" />
          <div>
            <div class="font-semibold text-lg">{{ auc.userCtoon.ctoon?.name || 'Unknown' }}</div>
            <div class="text-sm text-gray-500">{{ hoursLeft(auc.endAt) }} hours left</div>
          </div>
        </div>
        <div class="space-y-1 text-sm text-gray-700">
          <div><span class="font-medium">Creator:</span> {{ auc.creator?.username || '—' }}</div>
          <div><span class="font-medium">Status:</span> {{ auc.status }}</div>
          <div><span class="font-medium">Created:</span> {{ formatDate(auc.createdAt) }}</div>
          <div><span class="font-medium">Duration:</span> {{ auc.duration }} days</div>
          <div><span class="font-medium">Top Bidder:</span> {{ auc.highestBidder?.username || '—' }}</div>
          <div><span class="font-medium">Highest Bid:</span> {{ auc.highestBid }}</div>
          <div><span class="font-medium"># of Bids:</span> {{ auc.bids.length }}</div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="mt-6 flex items-center justify-between">
      <div class="text-sm text-gray-600">
        Page {{ page }} of {{ totalPages }} • Showing
        {{ Math.min(total, (page-1)*pageSize + 1) }}–{{ Math.min(page*pageSize, total) }}
        of {{ total }}
      </div>
      <div class="space-x-2">
        <button class="px-3 py-1 border rounded" :disabled="page<=1" @click="prevPage">Prev</button>
        <button class="px-3 py-1 border rounded" :disabled="page>=totalPages" @click="nextPage">Next</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - Auctions', middleware: ['auth', 'admin'], layout: 'default' })

const pageSize = 100
const page = ref(1)
const total = ref(0)
const auctions = ref([])

// Filters
const ctoonNameQuery = ref('')
const characterQuery = ref('')
const creatorQuery = ref('')
const selectedRarity = ref('')
const selectedStatus = ref('')
const selectedHasBidder = ref('')

const statusOptions = ['ACTIVE', 'CLOSED', 'CANCELLED']
const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']
const hasBidderOptions = [
  { value: '', label: 'All' },
  { value: 'has', label: 'With Bidder' },
  { value: 'none', label: 'No Bidder' }
]

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function scrollTop() {
  if (process.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function fetchAuctions() {
  const res = await $fetch('/api/admin/auctions', {
    query: {
      page: page.value,
      limit: pageSize,
      creator: creatorQuery.value.trim() || undefined,
      ctoonName: ctoonNameQuery.value.trim() || undefined,
      characters: characterQuery.value.trim() || undefined,
      rarity: selectedRarity.value || undefined,
      status: selectedStatus.value || undefined,
      hasBidder: selectedHasBidder.value || undefined
    }
  })
  auctions.value = res.items || []
  total.value = res.total || 0
}

let filterDebounceId = null
function scheduleFilterFetch() {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(async () => {
    if (page.value !== 1) {
      page.value = 1
      return
    }
    await fetchAuctions()
    await nextTick()
    scrollTop()
  }, 300)
}

// React to text filters with debounce
watch([ctoonNameQuery, characterQuery, creatorQuery], () => {
  scheduleFilterFetch()
})

watch([selectedStatus, selectedHasBidder, selectedRarity], async () => {
  if (page.value !== 1) {
    page.value = 1
    return
  }
  await fetchAuctions()
  await nextTick()
  scrollTop()
})

watch(page, async () => {
  await fetchAuctions()
  await nextTick()
  scrollTop()
})

onMounted(async () => {
  await fetchAuctions()
})

// pagination controls
function prevPage() { if (page.value > 1) page.value-- }
function nextPage() { if (page.value < totalPages.value) page.value++ }

// helpers
const hoursLeft = (endAt) => {
  const diff = new Date(endAt) - new Date()
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60)) : 0
}
const formatDate = (dt) => new Date(dt).toLocaleDateString()
</script>

<style scoped>
</style>
