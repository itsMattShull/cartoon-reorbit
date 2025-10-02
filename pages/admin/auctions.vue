<template>
  <Nav />

  <div class="p-4 mt-16">
    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-4">
      <!-- Creator Autocomplete -->
      <div class="relative">
        <label for="creatorSearch" class="mr-2 font-medium">Creator:</label>
        <div class="inline-flex items-center border rounded px-2 py-1">
          <input
            id="creatorSearch"
            v-model="creatorQuery"
            @input="onCreatorInput"
            @keydown.enter.prevent="applyCreatorQuery"
            @focus="openSuggestions"
            class="outline-none"
            placeholder="Type a username…"
            autocomplete="off"
            style="min-width: 220px"
          />
          <button
            v-if="selectedCreator || creatorQuery"
            @click="clearCreator"
            class="ml-2 text-xs text-gray-500 hover:text-gray-700"
            type="button"
            title="Clear"
          >
            ×
          </button>
        </div>

        <!-- Suggestions -->
        <ul
          v-if="showCreatorSuggestions && creatorQuery.length >= 3 && filteredCreatorSuggestions.length"
          class="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-60 overflow-auto"
        >
          <li
            v-for="u in filteredCreatorSuggestions"
            :key="u.id"
            @click="selectCreator(u.username)"
            class="px-3 py-2 cursor-pointer hover:bg-gray-100"
          >
            {{ u.username }}
          </li>
        </ul>

        <!-- Active filter badge -->
        <div v-if="selectedCreator" class="text-xs text-gray-600 mt-1">
          Filter: <span class="font-medium">{{ selectedCreator }}</span>
        </div>
      </div>

      <!-- Status Filter -->
      <div class="flex items-center">
        <label for="statusFilter" class="mr-2 font-medium">Status:</label>
        <select id="statusFilter" v-model="selectedStatus" class="border rounded px-2 py-1">
          <option value="">All</option>
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </div>

      <!-- Has Bidder Filter -->
      <div class="flex items-center">
        <label for="bidderFilter" class="mr-2 font-medium">Has Bidder:</label>
        <select id="bidderFilter" v-model="selectedHasBidder" class="border rounded px-2 py-1">
          <option v-for="opt in hasBidderOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
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

definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })

const pageSize = 100
const page = ref(1)
const total = ref(0)
const auctions = ref([])

// Filters
const selectedCreator = ref('')   // applied filter
const creatorQuery = ref('')      // input text
const showCreatorSuggestions = ref(false)

const selectedStatus = ref('')
const selectedHasBidder = ref('')
const statusOptions = ['ACTIVE', 'CLOSED', 'CANCELLED']
const hasBidderOptions = [
  { value: '', label: 'All' },
  { value: 'has', label: 'With Bidder' },
  { value: 'none', label: 'No Bidder' }
]

// Suggestions source
const creators = ref([])

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const filteredCreatorSuggestions = computed(() => {
  const q = creatorQuery.value.trim().toLowerCase()
  if (q.length < 3) return []
  return creators.value
    .filter(u => (u.username || '').toLowerCase().includes(q))
    .slice(0, 20)
})

function openSuggestions() { showCreatorSuggestions.value = true }
function closeSuggestions() { showCreatorSuggestions.value = false }
function onCreatorInput() {
  showCreatorSuggestions.value = true
  if (creatorQuery.value.length === 0) selectedCreator.value = ''
}

function scrollTop() {
  if (process.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

// NEW: apply creator immediately and refetch
async function applyCreator(username) {
  creatorQuery.value = username
  selectedCreator.value = username
  page.value = 1
  await fetchAuctions()
  await nextTick()
  scrollTop()
  closeSuggestions()
}

function selectCreator(username) {
  applyCreator(username)
}

function applyCreatorQuery() {
  const q = creatorQuery.value.trim()
  if (q.length >= 3) applyCreator(q)
  else closeSuggestions()
}

async function clearCreator() {
  creatorQuery.value = ''
  selectedCreator.value = ''
  page.value = 1
  await fetchAuctions()
  await nextTick()
  scrollTop()
  openSuggestions()
}

async function fetchCreators() {
  // ensure this matches your server route
  const res = await $fetch('/api/admin/auction-creators')
  creators.value = res || []
}

async function fetchAuctions() {
  const res = await $fetch('/api/admin/auctions', {
    query: {
      page: page.value,
      limit: pageSize,
      creator: selectedCreator.value || undefined,
      status: selectedStatus.value || undefined,
      hasBidder: selectedHasBidder.value || undefined
    }
  })
  auctions.value = res.items || []
  total.value = res.total || 0
}

// React only to non-creator filters here to avoid double fetches
watch([selectedStatus, selectedHasBidder], async () => {
  page.value = 1
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
  await fetchCreators()
  await fetchAuctions()
})

// optional: close suggestions when clicking outside
if (process.client) {
  window.addEventListener('click', (e) => {
    const input = document.getElementById('creatorSearch')
    if (!input) return
    if (e.target !== input) closeSuggestions()
  })
}

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
