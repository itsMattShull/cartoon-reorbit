<template>
  <Nav />
  <div class="p-4 mt-16 md:mt-20">
    <!-- Filter Dropdowns -->
    <div class="mt-8 mb-4 flex flex-wrap items-end gap-4">
      <!-- User Filter -->
      <div class="flex items-center">
        <label for="userFilter" class="mr-2 font-medium">User:</label>
        <input
          id="userFilter"
          v-model="userQuery"
          list="userSuggestions"
          type="text"
          placeholder="Type a username..."
          class="border rounded px-2 py-1"
        />
        <datalist id="userSuggestions">
          <option v-for="user in userSuggestions" :key="user" :value="user" />
        </datalist>
      </div>

      <!-- Status Filter -->
      <div class="flex items-center">
        <label for="statusFilter" class="mr-2 font-medium">Status:</label>
        <select id="statusFilter" v-model="selectedStatus" class="border rounded px-2 py-1">
          <option value="">All</option>
          <option v-for="status in statusOptions" :key="status" :value="status">
            {{ status }}
          </option>
        </select>
      </div>

      <!-- Date Range -->
      <div class="flex items-center">
        <label for="fromDate" class="mr-2 font-medium">From:</label>
        <input id="fromDate" v-model="fromDate" type="date" class="border rounded px-2 py-1" />
      </div>
      <div class="flex items-center">
        <label for="toDate" class="mr-2 font-medium">To:</label>
        <input id="toDate" v-model="toDate" type="date" class="border rounded px-2 py-1" />
      </div>
    </div>

    <div class="mb-4 text-sm text-gray-600">
      Total Results: {{ total }} trades
    </div>

    <!-- Desktop + Mobile -->
    <div v-if="loading" class="text-gray-500">Loading...</div>
    <div v-else-if="trades.length === 0" class="text-gray-500">No trades found.</div>
    <div v-else>
      <!-- Desktop Table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full bg-white rounded shadow">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-2">Users</th>
              <th class="px-4 py-2">Status</th>
              <th class="px-4 py-2">Created (CST)</th>
              <th class="px-4 py-2">Accepted/Denied (CST)</th>
              <th class="px-4 py-2">Points Offered</th>
              <th class="px-4 py-2"># Offered</th>
              <th class="px-4 py-2"># Requested</th>
              <th class="px-4 py-2">Total Offered Value</th>
              <th class="px-4 py-2">Total Requested Value</th>
              <th class="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="trade in trades"
              :key="trade.id"
              class="border-t"
              :class="{
                'bg-yellow-100':
                  computeTotalValue(trade.ctoonsOffered) <
                  (trade.pointsOffered + computeTotalValue(trade.ctoonsRequested)) * 0.8
              }"
            >
              <td class="px-4 py-2 align-top">
                <div class="flex flex-col leading-tight">
                  <span class="font-medium">{{ trade.initiator.username }}</span>
                  <span class="text-[10px] text-gray-500">↓</span>
                  <span class="font-medium">{{ trade.recipient.username }}</span>
                </div>
              </td>
              <td class="px-4 py-2">{{ trade.status }}</td>
              <td class="px-4 py-2">{{ formatCST(trade.createdAt) }}</td>
              <td class="px-4 py-2">
                <span v-if="trade.decisionAt">{{ formatCST(trade.decisionAt) }}</span>
                <span v-else>-</span>
              </td>
              <td class="px-4 py-2">{{ trade.pointsOffered }}</td>
              <td class="px-4 py-2">{{ trade.ctoonsOffered.length }}</td>
              <td class="px-4 py-2">{{ trade.ctoonsRequested.length }}</td>
              <td class="px-4 py-2">
                {{ trade.pointsOffered + computeTotalValue(trade.ctoonsOffered) }}
              </td>
              <td class="px-4 py-2">
                {{ computeTotalValue(trade.ctoonsRequested) }}
              </td>
              <td class="px-4 py-2">
                <button @click="openModal(trade)" class="bg-blue-500 text-white px-3 py-1 rounded">
                  View Trade
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards (md and below) -->
      <div class="md:hidden grid grid-cols-1 gap-4">
        <div
          v-for="trade in trades"
          :key="trade.id"
          class="border rounded p-4 shadow break-words"
          :class="{
            'bg-yellow-100':
              computeTotalValue(trade.ctoonsOffered) <
              (trade.pointsOffered + computeTotalValue(trade.ctoonsRequested)) * 0.8
          }"
        >
          <div class="mb-2">
            <span class="font-medium">{{ trade.initiator.username }}</span>
            <span class="mx-2">→</span>
            <span class="font-medium">{{ trade.recipient.username }}</span>
          </div>

          <div class="mb-2 text-sm text-gray-700 space-y-1">
            <div><span class="font-medium">Status:</span> {{ trade.status }}</div>
            <div><span class="font-medium">Created (CST):</span> {{ formatCST(trade.createdAt) }}</div>
            <div>
              <span class="font-medium">Accepted/Denied (CST):</span>
              <span v-if="trade.decisionAt">{{ formatCST(trade.decisionAt) }}</span>
              <span v-else>-</span>
            </div>
          </div>

          <div class="text-sm space-y-1">
            <div><span class="font-medium">Points:</span> {{ trade.pointsOffered }}</div>
            <div><span class="font-medium">Offered:</span> {{ trade.ctoonsOffered.length }}</div>
            <div><span class="font-medium">Requested:</span> {{ trade.ctoonsRequested.length }}</div>
            <div><span class="font-medium">Total Offered Value:</span> {{ trade.pointsOffered + computeTotalValue(trade.ctoonsOffered) }}</div>
            <div><span class="font-medium">Total Requested Value:</span> {{ computeTotalValue(trade.ctoonsRequested) }}</div>
          </div>

          <button @click="openModal(trade)" class="mt-3 bg-blue-500 text-white px-3 py-1 rounded">
            View Trade
          </button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="!loading" class="mt-6 flex items-center justify-between">
      <div class="text-sm text-gray-600">
        Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
      </div>
      <div class="space-x-2">
        <button class="px-3 py-1 border rounded" :disabled="page <= 1" @click="prevPage">Prev</button>
        <button class="px-3 py-1 border rounded" :disabled="page >= totalPages" @click="nextPage">Next</button>
      </div>
    </div>

    <!-- Trade Details Modal -->
    <div v-if="showModal" class="fixed mt-16 inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-auto">
      <div class="bg-white rounded shadow-lg w-full max-w-2xl relative max-h-[80vh] flex flex-col">
        <div class="sticky top-0 z-20 bg-white flex justify-between items-center p-4 border-b shrink-0">
          <h2 class="text-xl font-semibold">Trade Details</h2>
          <button @click="closeModal" class="text-gray-500 hover:text-gray-800">×</button>
        </div>
        <div class="p-6 overflow-y-auto flex-1 min-h-0">
          <div class="mb-4 text-sm text-gray-700 space-y-1">
            <div><span class="font-medium">Created (CST):</span> {{ formatCST(selectedTrade.createdAt) }}</div>
            <div>
              <span class="font-medium">Accepted/Denied (CST):</span>
              <span v-if="selectedTrade.decisionAt">{{ formatCST(selectedTrade.decisionAt) }}</span>
              <span v-else>-</span>
            </div>
          </div>

          <!-- Initiator & Offers -->
          <div class="mb-6 p-4 border rounded">
            <h3 class="font-medium mb-2">Initiator &amp; Offers</h3>
            <div><span class="font-medium">Initiator:</span> {{ selectedTrade.initiator.username }}</div>
            <div class="mt-2"><span class="font-medium">Points Offered:</span> {{ selectedTrade.pointsOffered }}</div>
            <div class="mt-1"><span class="font-medium">cToon Value:</span> {{ computeTotalValue(selectedTrade.ctoonsOffered) }}</div>
            <div class="mt-1"><span class="font-medium">Total Offered Value:</span> {{ selectedTrade.pointsOffered + computeTotalValue(selectedTrade.ctoonsOffered) }}</div>
            <div class="font-medium mt-4">cToons Offered:</div>
            <div class="grid grid-cols-3 gap-4 mt-2">
              <div v-for="item in selectedTrade.ctoonsOffered" :key="item.id" class="text-center">
                <img :src="item.assetPath" alt class="max-w-[80px] h-auto object-contain rounded mx-auto" />
                <div class="mt-1 font-medium">{{ item.name }}</div>
                <div class="text-sm text-gray-600">{{ item.rarity }}</div>
              </div>
            </div>
          </div>

          <!-- Recipient & Requests -->
          <div class="p-4 border rounded">
            <div><span class="font-medium">Recipient:</span> {{ selectedTrade.recipient.username }}</div>
            <div class="font-medium mt-4">cToons Requested:</div>
            <div class="grid grid-cols-3 gap-4 mt-2">
              <div v-for="item in selectedTrade.ctoonsRequested" :key="item.id" class="text-center">
                <img :src="item.assetPath" alt class="max-w-[80px] h-auto object-contain rounded mx-auto" />
                <div class="mt-1 font-medium">{{ item.name }}</div>
                <div class="text-sm text-gray-600">{{ item.rarity }}</div>
              </div>
            </div>
            <div class="mt-4"><span class="font-medium">Total Requested Value:</span> {{ computeTotalValue(selectedTrade.ctoonsRequested) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })

const rarityValues = { Common: 100, Uncommon: 200, Rare: 400, 'Very Rare': 750, 'Crazy Rare': 1250 }

// Data
const trades = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)

// Filters
const userQuery = ref('')
const userSuggestions = ref([])
const selectedStatus = ref('')
const fromDate = ref('')
const toDate = ref('')
const statusOptions = ['PENDING', 'ACCEPTED', 'REJECTED']

// Derived
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function normalizeDateRange() {
  if (!fromDate.value || !toDate.value) return
  if (new Date(fromDate.value) > new Date(toDate.value)) {
    const tmp = fromDate.value
    fromDate.value = toDate.value
    toDate.value = tmp
  }
}

async function fetchTrades() {
  normalizeDateRange()
  loading.value = true
  try {
    const query = {
      page: page.value,
      limit: pageSize,
      status: selectedStatus.value || undefined,
      user: userQuery.value.trim() || undefined,
      from: fromDate.value || undefined,
      to: toDate.value || undefined
    }
    const res = await $fetch('/api/admin/trades', { query })
    trades.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch (err) {
    trades.value = []
    total.value = 0
    console.error('Failed to load trades', err)
  } finally {
    loading.value = false
  }
}

async function fetchUserSuggestions() {
  const term = userQuery.value.trim()
  if (!term) {
    userSuggestions.value = []
    return
  }
  try {
    const res = await $fetch('/api/admin/user-mentions', { query: { q: term, limit: 10 } })
    userSuggestions.value = (res.items || []).map(item => item.username).filter(Boolean)
  } catch {
    userSuggestions.value = []
  }
}

// Modal
const showModal = ref(false)
const selectedTrade = ref(null)
function openModal(trade) { selectedTrade.value = trade; showModal.value = true }
function closeModal() { showModal.value = false }

// Helpers
function computeTotalValue(arr) {
  return arr.reduce((sum, item) => sum + (rarityValues[item.rarity] || 1250), 0)
}
function formatCST(dateLike) {
  if (!dateLike) return '-'
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Chicago'
    }).format(new Date(dateLike))
  } catch { return '-' }
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchTrades()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchTrades()
}

let filterDebounceId = null
watch([userQuery, selectedStatus, fromDate, toDate], () => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => {
    page.value = 1
    fetchTrades()
  }, 300)
})

let suggestionDebounceId = null
watch(userQuery, () => {
  if (suggestionDebounceId) clearTimeout(suggestionDebounceId)
  suggestionDebounceId = setTimeout(fetchUserSuggestions, 200)
})

onMounted(() => {
  fetchTrades()
})
</script>

<style scoped>
/* no extra styles needed */
</style>
