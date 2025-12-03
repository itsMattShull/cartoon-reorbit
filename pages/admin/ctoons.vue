<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-16 md:mt-20">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 space-y-4 sm:space-y-0">
        <h1 class="text-2xl font-semibold">All cToons</h1>
        <div class="flex space-x-2">
          <NuxtLink
            to="/admin/addCtoon"
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create cToon
          </NuxtLink>

          <NuxtLink
            to="/admin/bulk-upload-ctoons"
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Bulk Upload cToons
          </NuxtLink>
        </div>
      </div>

      <!-- FILTER BAR -->
      <div class="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          type="text"
          v-model="searchTerm"
          placeholder="Search by name…"
          class="flex-1 border border-gray-300 rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <select
          v-model="selectedSet"
          class="border border-gray-300 rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 max-w-[350px]"
        >
          <option value="">All Sets</option>
          <option v-for="set in setsOptions" :key="set" :value="set">
            {{ set }}
          </option>
        </select>
        <select
          v-model="selectedSeries"
          class="border border-gray-300 rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 max-w-[350px]"
        >
          <option value="">All Series</option>
          <option v-for="series in seriesOptions" :key="series" :value="series">
            {{ series }}
          </option>
        </select>
      </div>

      <!-- TABLE VIEW (desktop) -->
      <div class="overflow-x-auto hidden sm:block">
        <table class="min-w-full table-auto border-collapse">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-4 py-2 text-left">Asset</th>
              <th class="px-4 py-2 text-left">Name</th>
              <th class="px-4 py-2 text-left">Release Date (CDT)</th>
              <th class="px-4 py-2 text-left">Rarity</th>
              <th class="px-4 py-2 text-right">Highest Mint</th>
              <th class="px-4 py-2 text-right">Quantity</th>
              <th class="px-4 py-2 text-center">In C-mart</th>
              <th class="px-4 py-2 text-right">Edit</th>
            </tr>
          </thead>
          <!-- Skeleton rows while loading or searching -->
          <tbody v-if="loading || (isSearching && searching)">
            <tr v-for="n in 8" :key="`skeleton-desktop-${n}`" class="border-b">
              <td class="px-4 py-2">
                <div class="h-16 w-24 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-4 py-2">
                <div class="h-4 w-40 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-4 py-2">
                <div class="h-4 w-56 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-4 py-2">
                <div class="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-4 py-2 text-right">
                <div class="h-4 w-14 ml-auto bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-4 py-2 text-right">
                <div class="h-4 w-16 ml-auto bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-4 py-2 text-center">
                <div class="h-4 w-10 mx-auto bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-4 py-2 text-right">
                <div class="h-4 w-10 ml-auto bg-gray-200 rounded animate-pulse"></div>
              </td>
            </tr>
          </tbody>
          <!-- Data rows -->
          <tbody v-else>
            <tr
              v-for="c in displayedCtoons"
              :key="c.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-4 py-2">
                <img
                  loading="lazy"
                  :src="c.assetPath"
                  :alt="c.name"
                  class="h-16 w-auto mx-auto rounded"
                />
              </td>
              <td class="px-4 py-2">{{ c.name }}</td>
              <td class="px-4 py-2 whitespace-nowrap">
                {{
                  new Date(c.releaseDate).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Chicago',
                    timeZoneName: 'short'
                  })
                }}
              </td>
              <td class="px-4 py-2">{{ c.rarity }}</td>
              <td class="px-4 py-2 text-right">{{ c.highestMint }}</td>
              <td class="px-4 py-2 text-right">
                {{ c.quantity == null ? 'Unlimited' : c.quantity }}
              </td>
              <td class="px-4 py-2 text-center">
                {{ c.inCmart ? 'Yes' : 'No' }}
              </td>
              <td class="px-4 py-2 text-right">
                <NuxtLink
                  :to="`/admin/editCtoon/${c.id}`"
                  class="text-blue-600 hover:text-blue-800"
                >Edit</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- CARD VIEW (mobile) -->
      <div class="space-y-4 block sm:hidden">
        <!-- Skeleton cards while loading or searching -->
        <template v-if="loading || (isSearching && searching)">
          <div
            v-for="n in 6"
            :key="`skeleton-mobile-${n}`"
            class="bg-gray-100 rounded-lg p-4 flex flex-col animate-pulse"
          >
            <div class="flex items-start space-x-4">
              <div class="w-[80px] h-[80px] bg-gray-200 rounded"></div>
              <div class="flex-1 space-y-2">
                <div class="h-5 w-2/3 bg-gray-200 rounded"></div>
                <div class="h-4 w-1/2 bg-gray-200 rounded"></div>
                <div class="h-4 w-1/3 bg-gray-200 rounded"></div>
                <div class="h-4 w-1/4 bg-gray-200 rounded"></div>
                <div class="h-4 w-1/3 bg-gray-200 rounded"></div>
              </div>
            </div>
            <div class="mt-4 h-8 w-24 bg-gray-200 rounded self-end"></div>
          </div>
        </template>
        <!-- Data cards -->
        <template v-else>
          <div
            v-for="c in displayedCtoons"
            :key="c.id"
            class="bg-gray-100 rounded-lg p-4 flex flex-col"
          >
            <div class="flex items-start space-x-4">
              <img
                loading="lazy"
                :src="c.assetPath"
                :alt="c.name"
                class="max-w-[80px] w-auto flex-shrink-0 object-contain rounded"
              />
              <div class="flex-1 space-y-1">
                <h2 class="text-lg font-semibold">{{ c.name }}</h2>
                <p class="text-sm text-gray-600">
                  {{
                    new Date(c.releaseDate).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Chicago'
                    })
                  }}
                </p>
                <p class="text-sm"><strong>Rarity:</strong> {{ c.rarity }}</p>
                <p class="text-sm"><strong>Highest Mint:</strong> {{ c.highestMint }}</p>
                <p class="text-sm"><strong>Quantity:</strong> {{ c.quantity == null ? 'Unlimited' : c.quantity }}</p>
                <p class="text-sm"><strong>In C-mart:</strong> {{ c.inCmart ? 'Yes' : 'No' }}</p>
                <p class="text-sm"><strong>Set:</strong> {{ c.set }}</p>
                <p class="text-sm"><strong>Series:</strong> {{ c.series }}</p>
              </div>
            </div>
            <NuxtLink
              :to="`/admin/editCtoon/${c.id}`"
              class="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-center text-sm font-medium self-end"
            >
              Edit
            </NuxtLink>
          </div>
        </template>
      </div>

      <!-- SEARCH STATES -->
      <div v-if="isSearching && !searching && displayedCtoons.length===0" class="text-center py-4 text-gray-500">
        No matches.
      </div>

      <!-- PAGINATION (browse only) -->
      <div v-if="!isSearching" class="mt-6 flex items-center justify-between">
        <button
          class="px-4 py-2 border rounded disabled:opacity-50"
          @click="prevPage"
          :disabled="currentPage===1 || loading"
        >
          Previous
        </button>
        <div class="text-sm text-gray-600">
          Page {{ currentPage }}
          <span v-if="loading" class="ml-2">Loading…</span>
        </div>
        <button
          class="px-4 py-2 border rounded disabled:opacity-50"
          @click="nextPage"
          :disabled="!hasNextPage || loading"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

import { ref, onMounted, computed, watch, nextTick } from 'vue'
import Nav from '~/components/Nav.vue'

/* Meta options from API */
const setsOptions   = ref([])
const seriesOptions = ref([])

/* Route helpers */
const route = useRoute()
const router = useRouter()

function updateUrlQuery(q, set, series) {
  const newQuery = { ...route.query }
  const qTrim = String(q || '').trim()
  if (qTrim) newQuery.q = qTrim; else delete newQuery.q
  if (set) newQuery.set = set; else delete newQuery.set
  if (series) newQuery.series = series; else delete newQuery.series

  // Avoid unnecessary navigations
  const current = JSON.stringify(route.query)
  const next = JSON.stringify(newQuery)
  if (current !== next) router.replace({ path: route.path, query: newQuery })
}

async function loadMeta() {
  const res = await fetch('/api/collections/meta', { credentials: 'include' })
  if (!res.ok) return
  const meta = await res.json()
  setsOptions.value = (meta.sets || []).filter(s => s && String(s).trim().length > 0)
  seriesOptions.value = (meta.series || []).filter(s => s && String(s).trim().length > 0)
}

/* Paging */
const pageSize     = 50
const currentPage  = ref(1)
const hasNextPage  = ref(false)
const loading      = ref(false)
const rawCtoons    = ref([])

/* Search + filters */
const searchTerm     = ref('')
const selectedSet    = ref('')
const selectedSeries = ref('')
const isSearching    = ref(false)
const searching      = ref(false)
const searchResults  = ref([])
let   searchTimer    = null
let   lastSearchKey  = 0

/* Source list */
const sourceCtoons = computed(() => isSearching.value ? searchResults.value : rawCtoons.value)

/* Displayed list */
const displayedCtoons = computed(() => {
  if (isSearching.value) return sourceCtoons.value
  const q = (searchTerm.value || '').toLowerCase()
  return sourceCtoons.value.filter(c => !q || c.name.toLowerCase().includes(q))
})

/* Browse paging */
async function loadPage(n = 1) {
  loading.value = true
  const skip = (n - 1) * pageSize
  const take = pageSize + 1
  const res = await fetch(`/api/admin/all-ctoons?skip=${skip}&take=${take}`, { credentials: 'include' })
  if (!res.ok) { loading.value = false; return }
  const page = await res.json()
  hasNextPage.value = page.length > pageSize
  rawCtoons.value = hasNextPage.value ? page.slice(0, pageSize) : page
  currentPage.value = n
  loading.value = false
}
function scrollToTop() {
  if (typeof window === 'undefined') return
  nextTick().then(() => {
    requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch { window.scrollTo(0, 0) }
      window.dispatchEvent(new Event('scroll'))
    })
  })
}
async function nextPage() {
  if (hasNextPage.value && !loading.value) {
    await loadPage(currentPage.value + 1)
    await nextTick()
    scrollToTop()
  }
}
async function prevPage() {
  if (currentPage.value > 1 && !loading.value) {
    await loadPage(currentPage.value - 1)
    await nextTick()
    scrollToTop()
  }
}

/* Search */
async function runSearch({ q, set, series }) {
  const key = ++lastSearchKey
  searching.value = true
  try {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (set) params.set('set', set)
    if (series) params.set('series', series)
    const res = await fetch(`/api/admin/search-ctoons?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) throw new Error('Search failed')
    const data = await res.json()
    if (key === lastSearchKey) searchResults.value = data
  } catch {
    if (key === lastSearchKey) searchResults.value = []
  } finally {
    if (key === lastSearchKey) searching.value = false
  }
}
function enterSearchMode() { isSearching.value = true }
function exitSearchMode() { isSearching.value = false; searchResults.value = []; searching.value = false }

/* React to name + filters */
watch([searchTerm, selectedSet, selectedSeries], ([nameQ, setVal, seriesVal]) => {
  clearTimeout(searchTimer)
  const q = String(nameQ || '').trim()
  const filtersActive = !!(setVal || seriesVal)

  if (q.length >= 3 || filtersActive) {
    enterSearchMode()
    if (q.length >= 3) {
      searchTimer = setTimeout(() => runSearch({ q, set: setVal, series: seriesVal }), 300)
    } else {
      runSearch({ q: '', set: setVal, series: seriesVal })
    }
  } else {
    exitSearchMode()
  }

  // Sync URL query params to reflect current filters/search
  updateUrlQuery(q, setVal, seriesVal)
})

onMounted(() => {
  loadMeta()
  // Initialize fields from URL query
  const q = String(route.query.q || '')
  const set = String(route.query.set || '')
  const series = String(route.query.series || '')
  if (q) searchTerm.value = q
  if (set) selectedSet.value = set
  if (series) selectedSeries.value = series
  loadPage(1)
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
