<template>
  <Nav />
  <div class="p-4 mt-16 md:mt-20">
    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-4">
      <!-- User Filter -->
      <div class="flex items-center">
        <label for="userFilter" class="mr-2 font-medium">User:</label>
        <select id="userFilter" v-model="selectedUser" class="border rounded px-2 py-1">
          <option value="">All</option>
          <option v-for="u in users" :key="u" :value="u">{{ u }}</option>
        </select>
      </div>

      <!-- cToon Filter -->
      <div class="flex items-center">
        <label for="ctoonFilter" class="mr-2 font-medium">cToon:</label>
        <select id="ctoonFilter" v-model="selectedCtoon" class="border rounded px-2 py-1">
          <option value="">All</option>
          <option v-for="n in ctoonNames" :key="n" :value="n">{{ n }}</option>
        </select>
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
    </div>

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
          <!-- show while fetching more -->
          <tr v-if="isLoading && !isInitialLoad">
            <td class="px-4 py-3 text-center text-gray-500" colspan="7">Loading more…</td>
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
      <div v-if="isLoading && !isInitialLoad" class="text-center text-gray-500">Loading more…</div>
    </div>

    <!-- Bottom sentinel -->
    <div ref="loadMoreEl" class="h-10"></div>

    <!-- Empty state -->
    <div v-if="!logs.length && !isLoading" class="text-center text-gray-500 mt-10">
      No logs match the current filters.
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

    <!-- Empty state -->
    <div v-if="!logs.length" class="text-center text-gray-500 mt-10">
      No logs match the current filters.
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })

// ── State ─────────────────────────────────────────────────────────────
const logs = ref([])
const isLoading = ref(false)
const isInitialLoad = ref(true)
const hasMore = ref(true)
const page = ref(1)
const LIMIT = 100

// Filters
const selectedUser = ref('')
const selectedCtoon = ref('')
const mintFilter = ref(null)
const idSearch = ref('')

// Options (from currently-loaded page set)
const users = computed(() => {
  const set = new Set()
  logs.value.forEach(l => l.user?.username && set.add(l.user.username))
  return Array.from(set).sort()
})
const ctoonNames = computed(() => {
  const set = new Set()
  logs.value.forEach(l => l.ctoon?.name && set.add(l.ctoon.name))
  return Array.from(set).sort()
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

// ── Fetching ──────────────────────────────────────────────────────────
async function fetchPage({ reset = false } = {}) {
  if (isLoading.value) return
  if (reset) {
    logs.value = []
    page.value = 1
    hasMore.value = true
    isInitialLoad.value = true
  }
  if (!hasMore.value) return

  isLoading.value = true
  try {
    const params = {
      limit: LIMIT,
      page: page.value,
      ...(selectedUser.value && { username: selectedUser.value }),
      ...(selectedCtoon.value && { ctoonName: selectedCtoon.value }),
      ...(mintFilter.value && { mintNumber: Number(mintFilter.value) }),
      ...(idSearch.value && { userCtoonId: idSearch.value })
    }
    const batch = await $fetch('/api/admin/ctoonOwnerLogs', { params })

    if (Array.isArray(batch) && batch.length) {
      logs.value.push(...batch)
      page.value += 1
      hasMore.value = batch.length === LIMIT
    } else {
      hasMore.value = false
    }
  } finally {
    isLoading.value = false
    isInitialLoad.value = false
  }
}

// Reset and refetch when filters change (debounced)
let t = null
watch([selectedUser, selectedCtoon, mintFilter, idSearch], () => {
  clearTimeout(t)
  t = setTimeout(() => fetchPage({ reset: true }), 300)
})

// ── Infinite scroll sentinel ──────────────────────────────────────────
const loadMoreEl = ref(null)
let observer = null

onMounted(async () => {
  await fetchPage({ reset: true })
  observer = new IntersectionObserver(entries => {
    const entry = entries[0]
    if (entry?.isIntersecting && hasMore.value && !isLoading.value) {
      // tell user we’re loading more via the UI rows/cards above
      fetchPage()
    }
  }, { root: null, rootMargin: '300px', threshold: 0 })
  if (loadMoreEl.value) observer.observe(loadMoreEl.value)
})

onBeforeUnmount(() => {
  if (observer && loadMoreEl.value) observer.unobserve(loadMoreEl.value)
  observer = null
})
</script>

<style scoped>
/* minimal extras if needed */
</style>
