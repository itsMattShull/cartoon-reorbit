<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">

      <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-3">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3 gap-2">
        <h1 class="text-base font-semibold">All cToons</h1>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            to="/newsite/admin/ctoons/new"
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Create cToon
          </NuxtLink>

          <NuxtLink
            to="/newsite/admin/ctoonsBulkUpload"
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Bulk Upload cToons
          </NuxtLink>

          <button
            :disabled="!isSearching"
            @click="openBulkEdit"
            :class="[
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
              isSearching
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            ]"
            :title="isSearching ? 'Bulk edit filtered cToons' : 'Apply a filter or search first to enable bulk edit'"
          >
            Bulk Edit cToons
          </button>

          <button
            :disabled="!isSearching"
            @click="openMakeSecondEdition"
            :class="[
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
              isSearching
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            ]"
            :title="isSearching ? 'Create Second Edition versions of the filtered cToons' : 'Apply a filter or search first to enable Make 2nd Ed'"
          >
            Make 2nd Ed
          </button>
        </div>
      </div>

      <!-- FILTER BAR -->
      <div class="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="text"
          v-model="searchTerm"
          placeholder="Search by name…"
          class="flex-1 border rounded-md px-2 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <select
          v-model="selectedSet"
          class="border rounded-md px-2 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 sm:max-w-[280px]"
        >
          <option value="">All Sets</option>
          <option v-for="set in setsOptions" :key="set" :value="set">
            {{ set }}
          </option>
        </select>
        <select
          v-model="selectedSeries"
          class="border rounded-md px-2 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 sm:max-w-[280px]"
        >
          <option value="">All Series</option>
          <option v-for="series in seriesOptions" :key="series" :value="series">
            {{ series }}
          </option>
        </select>
      </div>

      <!-- TABLE VIEW (desktop) -->
      <div class="overflow-x-auto hidden lg:block">
        <table class="min-w-full table-auto border-collapse text-xs">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Asset</th>
              <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Name</th>
              <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Release Date (CDT)</th>
              <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600">Rarity</th>
              <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600">Highest Mint</th>
              <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600">Quantity</th>
              <th class="px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600">In C-mart</th>
              <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600">Edit</th>
            </tr>
          </thead>
          <!-- Skeleton rows while loading or searching -->
          <tbody v-if="loading || (isSearching && searching)">
            <tr v-for="n in 8" :key="`skeleton-desktop-${n}`" class="border-b">
              <td class="px-2 py-1.5">
                <div class="h-16 w-24 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-2 py-1.5">
                <div class="h-4 w-40 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-2 py-1.5">
                <div class="h-4 w-56 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-2 py-1.5">
                <div class="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-2 py-1.5 text-right">
                <div class="h-4 w-14 ml-auto bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-2 py-1.5 text-right">
                <div class="h-4 w-16 ml-auto bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-2 py-1.5 text-center">
                <div class="h-4 w-10 mx-auto bg-gray-200 rounded animate-pulse"></div>
              </td>
              <td class="px-2 py-1.5 text-right">
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
              <td class="px-2 py-1.5">
                <div class="relative w-fit mx-auto">
                  <img
                    loading="lazy"
                    :src="c.assetPath"
                    :alt="c.name"
                    class="h-16 w-auto rounded"
                  />
                  <SecondEditionOverlay :ctoon="c" />
                </div>
              </td>
              <td class="px-2 py-1.5">{{ c.name }}</td>
              <td class="px-2 py-1.5 whitespace-nowrap">
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
              <td class="px-2 py-1.5">{{ c.rarity }}</td>
              <td class="px-2 py-1.5 text-right">{{ c.highestMint }}</td>
              <td class="px-2 py-1.5 text-right">
                {{ formatQuantity(c.quantity) }}
              </td>
              <td class="px-2 py-1.5 text-center">
                {{ c.inCmart ? 'Yes' : 'No' }}
              </td>
              <td class="px-2 py-1.5 text-right">
                <NuxtLink
                  :to="`/newsite/admin/ctoons/edit/${c.id}`"
                  class="text-blue-600 hover:text-blue-800"
                >Edit</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- CARD VIEW (mobile) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:hidden">
        <!-- Skeleton cards while loading or searching -->
        <template v-if="loading || (isSearching && searching)">
          <div
            v-for="n in 6"
            :key="`skeleton-mobile-${n}`"
            class="bg-white border rounded-lg shadow p-2 flex flex-col animate-pulse"
          >
            <div class="flex items-start gap-2">
              <div class="w-[80px] h-[80px] bg-gray-200 rounded flex-shrink-0"></div>
              <div class="flex-1 space-y-2">
                <div class="h-4 w-2/3 bg-gray-200 rounded"></div>
                <div class="h-3 w-1/2 bg-gray-200 rounded"></div>
                <div class="h-3 w-1/3 bg-gray-200 rounded"></div>
                <div class="h-3 w-1/4 bg-gray-200 rounded"></div>
                <div class="h-3 w-1/3 bg-gray-200 rounded"></div>
              </div>
            </div>
            <div class="mt-2 h-6 w-20 bg-gray-200 rounded self-end"></div>
          </div>
        </template>
        <!-- Data cards -->
        <template v-else>
          <article
            v-for="c in displayedCtoons"
            :key="c.id"
            class="bg-white border rounded-lg shadow p-2 flex flex-col"
          >
            <div class="flex items-start gap-2">
              <div class="relative w-fit flex-shrink-0">
                <img
                  loading="lazy"
                  :src="c.assetPath"
                  :alt="c.name"
                  class="max-w-[80px] w-auto object-contain rounded"
                />
                <SecondEditionOverlay :ctoon="c" />
              </div>
              <div class="flex-1 min-w-0 space-y-0.5">
                <h2 class="text-xs font-semibold truncate">{{ c.name }}</h2>
                <p class="text-[11px] text-gray-500">
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
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Rarity:</span> {{ c.rarity }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Highest Mint:</span> {{ c.highestMint }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Quantity:</span> {{ formatQuantity(c.quantity) }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">In C-mart:</span> {{ c.inCmart ? 'Yes' : 'No' }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Set:</span> {{ c.set }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Series:</span> {{ c.series }}</p>
              </div>
            </div>
            <NuxtLink
              :to="`/newsite/admin/ctoons/edit/${c.id}`"
              class="mt-2 inline-block px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 text-center self-end"
            >
              Edit
            </NuxtLink>
          </article>
        </template>
      </div>

      <!-- SEARCH STATES -->
      <div v-if="isSearching && !searching && displayedCtoons.length===0" class="text-center py-4 text-gray-500">
        No matches.
      </div>

      <!-- PAGINATION (browse only) -->
      <div v-if="!isSearching" class="mt-3 flex items-center justify-between">
        <button
          class="px-3 py-1.5 text-xs border rounded-md disabled:opacity-50"
          @click="prevPage"
          :disabled="currentPage===1 || loading"
        >
          Previous
        </button>
        <div class="text-[11px] text-gray-600">
          Page {{ currentPage }}
          <span v-if="loading" class="ml-2">Loading…</span>
        </div>
        <button
          class="px-3 py-1.5 text-xs border rounded-md disabled:opacity-50"
          @click="nextPage"
          :disabled="!hasNextPage || loading"
        >
          Next
        </button>
      </div>
      </div>
    </div>

    <!-- Bulk Edit Modal -->
    <BulkEditCtoonModal
      v-if="showBulkEditModal"
      :ctoon-ids="displayedCtoons.map(c => c.id)"
      :sets-options="setsOptions"
      :series-options="seriesOptions"
      @close="showBulkEditModal = false"
      @saved="onBulkSaved"
    />

    <!-- Make 2nd Ed Modal -->
    <MakeSecondEditionModal
      v-if="showMakeSecondEditionModal"
      :ctoon-ids="displayedCtoons.map(c => c.id)"
      @close="showMakeSecondEditionModal = false"
      @saved="onMakeSecondEditionSaved"
    />
  </div>
</template>

<script setup>

import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import BulkEditCtoonModal from '~/components/BulkEditCtoonModal.vue'
import MakeSecondEditionModal from '~/components/MakeSecondEditionModal.vue'
import { formatQuantity, TIME_BASED_CAP } from '~/utils/formatQuantity'

/* Meta options from API */
const setsOptions   = ref([])
const seriesOptions = ref([])

/* Bulk edit modal */
const showBulkEditModal = ref(false)
function openBulkEdit() {
  if (!isSearching.value) return
  showBulkEditModal.value = true
}
async function onBulkSaved() {
  showBulkEditModal.value = false
  // Re-run current search/browse to reflect updates
  if (isSearching.value) {
    const q = String(searchTerm.value || '').trim()
    await runSearch({ q: q.length >= 3 ? q : '', set: selectedSet.value, series: selectedSeries.value })
  } else {
    await loadPage(currentPage.value)
  }
}

/* Make 2nd Ed modal */
const showMakeSecondEditionModal = ref(false)
function openMakeSecondEdition() {
  if (!isSearching.value) return
  showMakeSecondEditionModal.value = true
}
async function onMakeSecondEditionSaved(result) {
  showMakeSecondEditionModal.value = false
  const created = result?.created?.length || 0
  const failed = result?.errors?.length || 0
  let msg = `Created ${created} Second Edition${created !== 1 ? 's' : ''}.`
  if (failed) msg += ` ${failed} record${failed !== 1 ? 's' : ''} could not be created.`
  alert(msg)
  // Re-run current search/browse to reflect the new records
  if (isSearching.value) {
    const q = String(searchTerm.value || '').trim()
    await runSearch({ q: q.length >= 3 ? q : '', set: selectedSet.value, series: selectedSeries.value })
  } else {
    await loadPage(currentPage.value)
  }
}

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

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
