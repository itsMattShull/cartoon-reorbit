<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-16">
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
          class="border border-gray-300 rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Sets</option>
          <option v-for="set in uniqueSets" :key="set" :value="set">
            {{ set }}
          </option>
        </select>
        <select
          v-model="selectedSeries"
          class="border border-gray-300 rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Series</option>
          <option v-for="series in uniqueSeries" :key="series" :value="series">
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
          <tbody>
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
      </div>

      <!-- infinite scroll sentinel -->
      <div v-if="!isSearching" ref="sentinel" class="h-2"></div>

      <div v-if="isSearching && searching" class="text-center py-4">Searching…</div>
      <div v-if="isSearching && !searching && sourceCtoons.length===0" class="text-center py-4 text-gray-500">
        No matches for "{{ searchTerm }}"
      </div>

      <div v-if="!isSearching && loading" class="text-center py-4">Loading more…</div>
      <div v-if="!isSearching && finished" class="text-center py-4 text-gray-500">No more cToons.</div>

    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

import { ref, onMounted, computed, watch } from 'vue'
import Nav from '~/components/Nav.vue'

const take = 50
const skip = ref(0)
const rawCtoons = ref([])          // paged browse data
const loading   = ref(false)
const finished  = ref(false)
const sentinel  = ref(null)
const io        = ref(null)        // IntersectionObserver

// SEARCH STATE
const searchTerm     = ref('')
const isSearching    = ref(false)
const searching      = ref(false)
const searchResults  = ref([])
let   searchTimer    = null        // debounce
let   lastSearchKey  = 0           // race-guard

// FILTERS
const selectedSet    = ref('')
const selectedSeries = ref('')

// single source for derived UI: browse vs search
const sourceCtoons = computed(() => isSearching.value ? searchResults.value : rawCtoons.value)

// unique options come from *current* source
const uniqueSets = computed(() =>
  Array.from(new Set(sourceCtoons.value.map(c=>c.set).filter(Boolean))).sort()
)
const uniqueSeries = computed(() =>
  Array.from(new Set(sourceCtoons.value.map(c=>c.series).filter(Boolean))).sort()
)

// filtered list (keep local name filter so it still works for <3 chars)
const displayedCtoons = computed(() => {
  const q = (searchTerm.value || '').toLowerCase()
  return sourceCtoons.value.filter(c => {
    const matchesName   = !q || c.name.toLowerCase().includes(q)
    const matchesSet    = !selectedSet.value || c.set === selectedSet.value
    const matchesSeries = !selectedSeries.value || c.series === selectedSeries.value
    return matchesName && matchesSet && matchesSeries
  })
})

async function loadNext() {
  if (loading.value || finished.value || isSearching.value) return
  loading.value = true
  const res = await fetch(`/api/admin/all-ctoons?skip=${skip.value}&take=${take}`, { credentials: 'include' })
  if (!res.ok) { loading.value=false; return }
  const page = await res.json()
  if (page.length < take) finished.value = true
  rawCtoons.value.push(...page)
  skip.value += take
  loading.value = false
}

async function runSearch(q) {
  // race guard
  const key = ++lastSearchKey
  searching.value = true
  try {
    const res = await fetch(`/api/admin/search-ctoons?q=${encodeURIComponent(q)}`, { credentials: 'include' })
    if (!res.ok) throw new Error('Search failed')
    const data = await res.json()
    // only apply if this is the latest search
    if (key === lastSearchKey) searchResults.value = data
  } catch (e) {
    if (key === lastSearchKey) searchResults.value = []
    // optional: console.error(e)
  } finally {
    if (key === lastSearchKey) searching.value = false
  }
}

function enterSearchMode() {
  if (isSearching.value) return
  isSearching.value = true
  // pause infinite scroll
  if (io.value && sentinel.value) io.value.unobserve(sentinel.value)
}

function exitSearchMode() {
  if (!isSearching.value) return
  isSearching.value = false
  searchResults.value = []
  searching.value = false
  // resume infinite scroll
  if (io.value && sentinel.value) io.value.observe(sentinel.value)
}

// debounce searchTerm: ≥3 chars => server search, otherwise exit search
watch(searchTerm, (val) => {
  clearTimeout(searchTimer)
  const q = (val || '').trim()
  if (q.length >= 3) {
    searchTimer = setTimeout(() => {
      enterSearchMode()
      runSearch(q)
    }, 300)
  } else {
    // if user cleared or <3, snap back to scroll mode
    exitSearchMode()
  }
})

onMounted(() => {
  loadNext()
  io.value = new IntersectionObserver(
    entries => {
      if (entries[0].isIntersecting && !isSearching.value) loadNext()
    },
    { rootMargin: '200px' }
  )
  if (sentinel.value) io.value.observe(sentinel.value)
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
