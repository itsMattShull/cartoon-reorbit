<template>
  <div class="admin-auction-logs bg-gray-50">
    <div class="p-2 text-xs">
      <!-- Filters -->
      <div class="mb-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 items-end">
        <div>
          <label for="ctoonNameSearch" class="block text-[10px] font-medium text-gray-700 mb-0.5">cToon Name</label>
          <input
            id="ctoonNameSearch"
            v-model="ctoonNameQuery"
            type="text"
            placeholder="Search by name…"
            class="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label for="characterSearch" class="block text-[10px] font-medium text-gray-700 mb-0.5">Characters</label>
          <input
            id="characterSearch"
            v-model="characterQuery"
            type="text"
            placeholder="e.g. Bugs, Daffy"
            class="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label for="creatorSearch" class="block text-[10px] font-medium text-gray-700 mb-0.5">Creator</label>
          <input
            id="creatorSearch"
            v-model="creatorQuery"
            type="text"
            placeholder="Type a username…"
            class="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div class="relative">
          <label for="winnerSearch" class="block text-[10px] font-medium text-gray-700 mb-0.5">Winner</label>
          <input
            id="winnerSearch"
            v-model="winnerQuery"
            type="text"
            placeholder="Type a username…"
            autocomplete="off"
            class="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            @blur="hideWinnerSuggestions"
          />
          <ul
            v-if="winnerSuggestions.length > 0"
            class="absolute z-10 mt-0.5 w-full bg-white border rounded shadow-lg max-h-40 overflow-y-auto"
          >
            <li
              v-for="user in winnerSuggestions"
              :key="user.id"
              class="px-2 py-1 text-[11px] cursor-pointer hover:bg-indigo-50"
              @mousedown.prevent="selectWinner(user.username)"
            >
              {{ user.username }}
            </li>
          </ul>
        </div>

        <div>
          <label for="rarityFilter" class="block text-[10px] font-medium text-gray-700 mb-0.5">Rarity</label>
          <select
            id="rarityFilter"
            v-model="selectedRarity"
            class="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All</option>
            <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <div>
          <label for="statusFilter" class="block text-[10px] font-medium text-gray-700 mb-0.5">Status</label>
          <select
            id="statusFilter"
            v-model="selectedStatus"
            class="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All</option>
            <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
          </select>
        </div>

        <div>
          <label for="bidderFilter" class="block text-[10px] font-medium text-gray-700 mb-0.5">Has Bidder</label>
          <select
            id="bidderFilter"
            v-model="selectedHasBidder"
            class="w-full border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option v-for="opt in hasBidderOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="mb-2 text-[11px] text-gray-600">
        Total Results: {{ total }} auctions
      </div>

      <!-- Desktop Table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full bg-white rounded shadow text-[11px]">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-1.5 py-1 text-left">cToon</th>
              <th class="px-1.5 py-1 text-left">Creator</th>
              <th class="px-1.5 py-1 text-left">Status</th>
              <th class="px-1.5 py-1 text-left">Created</th>
              <th class="px-1.5 py-1 text-right">Days</th>
              <th class="px-1.5 py-1 text-right">Hrs Left</th>
              <th class="px-1.5 py-1 text-left">Top Bidder</th>
              <th class="px-1.5 py-1 text-left">Winner</th>
              <th class="px-1.5 py-1 text-right">High Bid</th>
              <th class="px-1.5 py-1 text-right"># Bids</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="auc in auctions" :key="auc.id" class="border-t">
              <td class="px-1.5 py-1">
                <img :src="auc.userCtoon.ctoon?.assetPath" alt="" class="w-8 h-8 object-cover rounded" />
              </td>
              <td class="px-1.5 py-1">{{ auc.creator?.username || '—' }}</td>
              <td class="px-1.5 py-1">{{ auc.status }}</td>
              <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(auc.createdAt) }}</td>
              <td class="px-1.5 py-1 text-right tabular-nums">{{ auc.duration }}</td>
              <td class="px-1.5 py-1 text-right tabular-nums">{{ hoursLeft(auc.endAt) }}</td>
              <td class="px-1.5 py-1">{{ auc.highestBidder?.username || '—' }}</td>
              <td class="px-1.5 py-1">{{ auc.winner?.username || '—' }}</td>
              <td class="px-1.5 py-1 text-right tabular-nums">{{ auc.highestBid }}</td>
              <td class="px-1.5 py-1 text-right tabular-nums">{{ auc.bids.length }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards -->
      <div class="md:hidden grid grid-cols-1 gap-2">
        <div v-for="auc in auctions" :key="auc.id" class="border rounded p-2 shadow text-[11px]">
          <div class="flex items-center mb-2">
            <img :src="auc.userCtoon.ctoon?.assetPath" alt="" class="w-12 h-12 object-cover rounded mr-2" />
            <div>
              <div class="font-semibold text-xs">{{ auc.userCtoon.ctoon?.name || 'Unknown' }}</div>
              <div class="text-[10px] text-gray-500">{{ hoursLeft(auc.endAt) }} hours left</div>
            </div>
          </div>
          <div class="space-y-0.5 text-gray-700">
            <div><span class="font-medium">Creator:</span> {{ auc.creator?.username || '—' }}</div>
            <div><span class="font-medium">Status:</span> {{ auc.status }}</div>
            <div><span class="font-medium">Created:</span> {{ formatDate(auc.createdAt) }}</div>
            <div><span class="font-medium">Duration:</span> {{ auc.duration }} days</div>
            <div><span class="font-medium">Top Bidder:</span> {{ auc.highestBidder?.username || '—' }}</div>
            <div><span class="font-medium">Winner:</span> {{ auc.winner?.username || '—' }}</div>
            <div><span class="font-medium">Highest Bid:</span> {{ auc.highestBid }}</div>
            <div><span class="font-medium"># of Bids:</span> {{ auc.bids.length }}</div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div class="mt-3 flex items-center justify-between">
        <div class="text-[11px] text-gray-600">
          Page {{ page }} of {{ totalPages }} • Showing
          {{ Math.min(total, (page-1)*pageSize + 1) }}–{{ Math.min(page*pageSize, total) }}
          of {{ total }}
        </div>
        <div class="space-x-1">
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page<=1" @click="prevPage">Prev</button>
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page>=totalPages" @click="nextPage">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const pageSize = 100
const page = ref(1)
const total = ref(0)
const auctions = ref([])

// Filters
const ctoonNameQuery = ref('')
const characterQuery = ref('')
const creatorQuery = ref('')
const winnerQuery = ref('')
const winnerSuggestions = ref([])
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
      winner: winnerQuery.value.trim() || undefined,
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

// Winner autocomplete
let winnerSuggestDebounceId = null

onBeforeUnmount(() => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  if (winnerSuggestDebounceId) clearTimeout(winnerSuggestDebounceId)
})
watch(winnerQuery, (val) => {
  if (winnerSuggestDebounceId) clearTimeout(winnerSuggestDebounceId)
  const trimmed = val.trim()
  if (trimmed.length < 3) {
    winnerSuggestions.value = []
    return
  }
  winnerSuggestDebounceId = setTimeout(async () => {
    const results = await $fetch('/api/admin/auction-winners', { query: { q: trimmed } })
    winnerSuggestions.value = results
  }, 300)
})

function selectWinner(username) {
  winnerQuery.value = username
  winnerSuggestions.value = []
}

function hideWinnerSuggestions() {
  setTimeout(() => { winnerSuggestions.value = [] }, 150)
}

// React to text filters with debounce
watch([ctoonNameQuery, characterQuery, creatorQuery, winnerQuery], () => {
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

function prevPage() { if (page.value > 1) page.value-- }
function nextPage() { if (page.value < totalPages.value) page.value++ }

const hoursLeft = (endAt) => {
  const diff = new Date(endAt) - new Date()
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60)) : 0
}
const formatDate = (dt) => new Date(dt).toLocaleDateString()
</script>

<style scoped>
.admin-auction-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
