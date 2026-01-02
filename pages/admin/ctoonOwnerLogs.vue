<template>
  <Nav />
  <div class="p-4 mt-16 md:mt-20">
    <!-- Filters -->
    <div class="mt-8 mb-4 flex flex-wrap items-center gap-4">
      <!-- User Filter -->
      <div class="flex items-center">
        <label for="userFilter" class="mr-2 font-medium">User:</label>
        <input
          id="userFilter"
          v-model="userQuery"
          list="userSuggestions"
          type="text"
          class="border rounded px-2 py-1"
          placeholder="Type a username..."
        />
        <datalist id="userSuggestions">
          <option v-for="u in userSuggestions" :key="u" :value="u" />
        </datalist>
      </div>

      <!-- cToon Filter -->
      <div class="flex items-center">
        <label for="ctoonFilter" class="mr-2 font-medium">cToon:</label>
        <input
          id="ctoonFilter"
          v-model="ctoonQuery"
          list="ctoonSuggestions"
          type="text"
          class="border rounded px-2 py-1"
          placeholder="Type 3+ characters"
        />
        <datalist id="ctoonSuggestions">
          <option v-for="n in ctoonSuggestions" :key="n" :value="n" />
        </datalist>
      </div>

      <!-- Mint # Filter -->
      <div class="flex items-center">
        <label for="mintFilter" class="mr-2 font-medium">Mint #:</label>
        <input
          id="mintFilter"
          v-model.number="mintFilter"
          type="number"
          min="1"
          class="border rounded px-2 py-1 w-28"
          placeholder="Any"
        />
      </div>

      <!-- Search (UserCtoonId) -->
      <div class="flex items-center">
        <label for="idSearch" class="mr-2 font-medium">UserCtoonId:</label>
        <input
          id="idSearch"
          v-model="idSearch"
          type="text"
          class="border rounded px-2 py-1 w-56"
          placeholder="Contains…"
        />
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
      Total Results: {{ total }} logs
    </div>

    <!-- Desktop + Mobile -->
    <div v-if="isLoading" class="text-gray-500">Loading...</div>
    <div v-else-if="!logs.length" class="text-center text-gray-500 mt-10">
      No logs match the current filters.
    </div>
    <div v-else>
      <!-- Desktop table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full bg-white rounded shadow">
          <thead class="bg-gray-100">
            <tr>
              <th class="px-4 py-2 text-left">Time</th>
              <th class="px-4 py-2 text-left">User</th>
              <th class="px-4 py-2 text-left">cToon</th>
              <th class="px-4 py-2 text-left">Rarity</th>
              <th class="px-4 py-2 text-left">Mint #</th>
              <th class="px-4 py-2 text-left">UserCtoonId</th>
              <th class="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in logs"
              :key="log.id"
              class="border-t"
            >
              <td class="px-4 py-2 whitespace-nowrap">{{ formatTs(log.createdAt) }}</td>
              <td class="px-4 py-2 break-words">{{ log.user?.username || 'Unknown' }}</td>
              <td class="px-4 py-2">
                <div class="flex items-center gap-2">
                  <img
                    v-if="log.ctoon?.assetPath"
                    :src="img(log.ctoon.assetPath)"
                    alt
                    class="w-8 h-8 object-contain rounded"
                  />
                  <span class="break-words">{{ log.ctoon?.name || 'Unknown' }}</span>
                </div>
              </td>
              <td class="px-4 py-2">{{ log.ctoon?.rarity || '-' }}</td>
              <td class="px-4 py-2">{{ log.mintNumber ?? '—' }}</td>
              <td class="px-4 py-2 font-mono">
                <span class="truncate inline-block max-w-[180px]" :title="log.userCtoonId">
                  {{ shorten(log.userCtoonId) }}
                </span>
              </td>
              <td class="px-4 py-2">
                <button class="bg-blue-500 text-white px-3 py-1 rounded" @click="openModal(log)">
                  View
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="md:hidden grid grid-cols-1 gap-4">
        <div v-for="log in logs" :key="log.id" class="border rounded p-4 shadow">
          <div class="text-sm text-gray-500 mb-2">{{ formatTs(log.createdAt) }}</div>
          <div class="mb-1"><span class="font-medium">User:</span> {{ log.user?.username || 'Unknown' }}</div>
          <div class="mb-1 flex items-center gap-2">
            <span class="font-medium">cToon:</span>
            <img
              v-if="log.ctoon?.assetPath"
              :src="img(log.ctoon.assetPath)"
              alt
              class="w-8 h-8 object-contain rounded"
            />
            <span>{{ log.ctoon?.name || 'Unknown' }} <span class="text-gray-500">({{ log.ctoon?.rarity || '-' }})</span></span>
          </div>
          <div class="mb-1"><span class="font-medium">Mint #:</span> {{ log.mintNumber ?? '—' }}</div>
          <div class="mb-2"><span class="font-medium">UserCtoonId:</span> <span class="font-mono">{{ shorten(log.userCtoonId) }}</span></div>
          <button class="bg-blue-500 text-white px-3 py-1 rounded" @click="openModal(log)">View</button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="!isLoading && logs.length" class="mt-6 flex items-center justify-between">
      <div class="text-sm text-gray-600">
        Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
      </div>
      <div class="space-x-2">
        <button class="px-3 py-1 border rounded" :disabled="page <= 1" @click="prevPage">Prev</button>
        <button class="px-3 py-1 border rounded" :disabled="page >= totalPages" @click="nextPage">Next</button>
      </div>
    </div>

    <!-- Details modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 overflow-auto">
      <div class="bg-white rounded shadow-lg w-full max-w-2xl relative max-h-[80vh]">
        <div class="sticky top-0 z-20 bg-white flex justify-between items-center p-4 border-b">
          <h2 class="text-xl font-semibold">Ownership Log</h2>
          <button @click="closeModal" class="text-gray-500 hover:text-gray-800">×</button>
        </div>
        <div class="p-6 overflow-y-auto" style="max-height: calc(80vh - 64px);">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div class="md:col-span-1 flex justify-center">
              <img
                v-if="selected?.ctoon?.assetPath"
                :src="img(selected.ctoon.assetPath)"
                alt
                class="max-w-[160px] h-auto object-contain rounded"
              />
            </div>
            <div class="md:col-span-2 space-y-2">
              <div><span class="font-medium">When:</span> {{ formatTs(selected?.createdAt) }}</div>
              <div><span class="font-medium">User:</span> {{ selected?.user?.username || 'Unknown' }}</div>
              <div><span class="font-medium">cToon:</span> {{ selected?.ctoon?.name || 'Unknown' }} <span class="text-gray-500">({{ selected?.ctoon?.rarity || '-' }})</span></div>
              <div><span class="font-medium">Mint #:</span> {{ selected?.mintNumber ?? '—' }}</div>
              <div><span class="font-medium">UserCtoonId:</span> <span class="font-mono break-all">{{ selected?.userCtoonId }}</span></div>
              <div class="text-sm text-gray-500"><span class="font-medium">cToon ID:</span> <span class="font-mono break-all">{{ selected?.ctoonId }}</span></div>
              <div class="text-sm text-gray-500"><span class="font-medium">User ID:</span> <span class="font-mono break-all">{{ selected?.userId }}</span></div>
            </div>
          </div>
          <div class="mt-6 flex gap-2">
            <button class="border px-3 py-1 rounded" @click="copy(selected?.userCtoonId)">Copy UserCtoonId</button>
            <button class="border px-3 py-1 rounded" @click="copy(selected?.ctoonId)">Copy cToonId</button>
            <button class="border px-3 py-1 rounded" @click="copy(selected?.userId)">Copy UserId</button>
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

// ── State ─────────────────────────────────────────────────────────────
const logs = ref([])
const total = ref(0)
const isLoading = ref(false)
const page = ref(1)
const PAGE_SIZE = 100

// Filters
const userQuery = ref('')
const userSuggestions = ref([])
const ctoonQuery = ref('')
const ctoonSuggestions = ref([])
const mintFilter = ref(null)
const idSearch = ref('')
const fromDate = ref('')
const toDate = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * PAGE_SIZE + 1
  const end = Math.min(page.value * PAGE_SIZE, total.value)
  return `${start}-${end} of ${total.value}`
})

// Modal
const showModal = ref(false)
const selected = ref(null)
function openModal(log) { selected.value = log; showModal.value = true }
function closeModal() { showModal.value = false }

// Helpers
function shorten(id) { return !id ? '' : (id.length > 12 ? `${id.slice(0,6)}…${id.slice(-4)}` : id) }
function formatTs(ts) { try { return new Date(ts).toLocaleString() } catch { return String(ts || '') } }
function img(p) { return !p ? '' : (p.startsWith('http') ? p : p) }
async function copy(text) { if (text) try { await navigator.clipboard.writeText(text) } catch {} }

function normalizeDateRange() {
  if (!fromDate.value || !toDate.value) return
  if (new Date(fromDate.value) > new Date(toDate.value)) {
    const tmp = fromDate.value
    fromDate.value = toDate.value
    toDate.value = tmp
  }
}

// ── Fetching ──────────────────────────────────────────────────────────
async function fetchLogs() {
  if (isLoading.value) return
  normalizeDateRange()
  isLoading.value = true
  try {
    const userTerm = userQuery.value.trim()
    const ctoonTerm = ctoonQuery.value.trim()
    const idTerm = idSearch.value.trim()
    const params = {
      limit: PAGE_SIZE,
      page: page.value,
      ...(userTerm && { username: userTerm }),
      ...(ctoonTerm && { ctoonName: ctoonTerm }),
      ...(mintFilter.value && { mintNumber: Number(mintFilter.value) }),
      ...(idTerm && { userCtoonId: idTerm }),
      ...(fromDate.value && { from: fromDate.value }),
      ...(toDate.value && { to: toDate.value })
    }
    const res = await $fetch('/api/admin/ctoonOwnerLogs', { params })
    logs.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } finally {
    isLoading.value = false
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

async function fetchCtoonSuggestions() {
  const term = ctoonQuery.value.trim()
  if (term.length < 3) {
    ctoonSuggestions.value = []
    return
  }
  try {
    const res = await $fetch(`/api/admin/search-ctoons?q=${encodeURIComponent(term)}`)
    const names = (Array.isArray(res) ? res : []).map(ct => ct.name).filter(Boolean)
    ctoonSuggestions.value = Array.from(new Set(names))
  } catch {
    ctoonSuggestions.value = []
  }
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchLogs()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchLogs()
}

// Reset and refetch when filters change (debounced)
let filterDebounceId = null
watch([userQuery, ctoonQuery, mintFilter, idSearch, fromDate, toDate], () => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => {
    page.value = 1
    fetchLogs()
  }, 300)
})

let userSuggestDebounceId = null
watch(userQuery, () => {
  if (userSuggestDebounceId) clearTimeout(userSuggestDebounceId)
  userSuggestDebounceId = setTimeout(fetchUserSuggestions, 200)
})

let ctoonSuggestDebounceId = null
watch(ctoonQuery, () => {
  if (ctoonSuggestDebounceId) clearTimeout(ctoonSuggestDebounceId)
  ctoonSuggestDebounceId = setTimeout(fetchCtoonSuggestions, 250)
})

onMounted(() => {
  fetchLogs()
})
</script>

<style scoped>
/* minimal extras if needed */
</style>
