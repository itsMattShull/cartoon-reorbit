<template>
  <div class="admin-user-ctoons bg-gray-50 text-xs text-gray-900">
    <div class="p-2">
      <div class="bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-2 text-gray-900">Manage User cToons</h1>

      <!-- Filters & Sorting Controls -->
      <div class="flex flex-wrap gap-3 mb-3 items-end">
        <!-- Sort by -->
        <div>
          <label class="block text-xs font-medium text-gray-800">Sort by</label>
          <select v-model="sort" class="mt-0.5 block border rounded px-1.5 py-0.5 text-xs text-gray-900">
            <option value="createdAt">Acquired</option>
            <option value="ctoonName">cToon Name</option>
            <option value="mintNumber">Mint #</option>
            <option value="rarity">Rarity</option>
            <option value="username">Owner</option>
          </select>
        </div>
        <!-- Sort direction -->
        <div>
          <label class="block text-xs font-medium text-gray-800">Order</label>
          <select v-model="dir" class="mt-0.5 block border rounded px-1.5 py-0.5 text-xs text-gray-900">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <!-- Rarity filter -->
        <div>
          <label class="block text-xs font-medium text-gray-800">Rarity</label>
          <select v-model="filters.rarity" class="mt-0.5 block border rounded px-1.5 py-0.5 text-xs text-gray-900">
            <option value="">All</option>
            <option>Common</option>
            <option>Uncommon</option>
            <option>Rare</option>
            <option>Epic</option>
            <option>Legendary</option>
          </select>
        </div>
        <!-- Owner filter -->
        <div>
          <label class="block text-xs font-medium text-gray-800">Owner</label>
          <input
            type="text"
            v-model="filters.owner"
            placeholder="username…"
            class="mt-0.5 block border rounded px-1.5 py-0.5 text-xs text-gray-900"
          />
        </div>
        <!-- cToon name search -->
        <div>
          <label class="block text-xs font-medium text-gray-800">cToon Name</label>
          <input
            type="text"
            v-model="filters.ctoonName"
            placeholder="Search name…"
            class="mt-0.5 block border rounded px-1.5 py-0.5 text-xs text-gray-900"
          />
        </div>
        <!-- Acquired date range -->
        <div>
          <label class="block text-xs font-medium text-gray-800">Acquired From</label>
          <input
            type="date"
            v-model="filters.acquiredFrom"
            class="mt-0.5 block border rounded px-1.5 py-0.5 text-xs text-gray-900"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-800">Acquired To</label>
          <input
            type="date"
            v-model="filters.acquiredTo"
            class="mt-0.5 block border rounded px-1.5 py-0.5 text-xs text-gray-900"
          />
        </div>
        <!-- Apply button -->
        <button
          @click="applyFilters"
          class="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
        >
          Apply
        </button>
      </div>

      <!-- Desktop Table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="table-auto border-collapse w-max">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-3 py-1.5 text-left">Asset</th>
              <th class="px-3 py-1.5 text-left">cToon Name</th>
              <th class="px-3 py-1.5 text-right">Mint #</th>
              <th class="px-3 py-1.5 text-left">Owner</th>
              <th class="px-3 py-1.5 text-center">1st Edition</th>
              <th class="px-3 py-1.5 text-left">Acquired (CDT)</th>
              <th class="px-3 py-1.5 text-left">Release Date (CDT)</th>
              <th class="px-3 py-1.5 text-left">Rarity</th>
              <th class="px-3 py-1.5 text-right">Highest Mint</th>
              <th class="px-3 py-1.5 text-right">Quantity</th>
              <th class="px-3 py-1.5 text-center">In C-mart</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="uc in userCtoons"
              :key="uc.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-3 py-1.5">
                <img
                  :src="uc.ctoon.assetPath"
                  :alt="uc.ctoon.name"
                  class="h-16 w-auto mx-auto rounded"
                />
              </td>
              <td class="px-3 py-1.5">{{ uc.ctoon.name }}</td>
              <td class="px-3 py-1.5 text-right">{{ uc.mintNumber }}</td>
              <td class="px-3 py-1.5">{{ uc.username }}</td>
              <td class="px-3 py-1.5 text-center">
                {{ uc.isFirstEdition ? 'Yes' : 'No' }}
              </td>
              <td class="px-3 py-1.5">{{ formatDate(uc.createdAt) }}</td>
              <td class="px-3 py-1.5">{{ formatDate(uc.ctoon.releaseDate) }}</td>
              <td class="px-3 py-1.5">{{ uc.ctoon.rarity }}</td>
              <td class="px-3 py-1.5 text-right">{{ uc.ctoon.highestMint }}</td>
              <td class="px-3 py-1.5 text-right">
                {{ formatQuantity(uc.ctoon.quantity) }}
              </td>
              <td class="px-3 py-1.5 text-center">{{ uc.ctoon.inCmart ? 'Yes' : 'No' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards -->
      <div class="flex flex-col gap-4 md:hidden">
        <div
          v-for="uc in userCtoons"
          :key="uc.id"
          class="bg-white border rounded-lg shadow p-4"
        >
          <div class="flex items-center mb-4">
            <img
              :src="uc.ctoon.assetPath"
              :alt="uc.ctoon.name"
              class="h-16 w-auto rounded mr-4"
            />
            <div>
              <h2 class="text-lg font-semibold">{{ uc.ctoon.name }}</h2>
              <p class="text-sm text-gray-600">Owner: {{ uc.username }}</p>
            </div>
          </div>
          <ul class="text-sm space-y-1 mb-4">
            <li><strong>Mint #:</strong> {{ uc.mintNumber }}</li>
            <li><strong>1st Edition:</strong> {{ uc.isFirstEdition ? 'Yes' : 'No' }}</li>
            <li><strong>Acquired:</strong> {{ formatDate(uc.createdAt) }}</li>
            <li><strong>Release:</strong> {{ formatDate(uc.ctoon.releaseDate) }}</li>
            <li><strong>Rarity:</strong> {{ uc.ctoon.rarity }}</li>
            <li><strong>Highest Mint:</strong> {{ uc.ctoon.highestMint }}</li>
            <li><strong>Quantity:</strong> {{ formatQuantity(uc.ctoon.quantity) }}</li>
            <li><strong>In C-mart:</strong> {{ uc.ctoon.inCmart ? 'Yes' : 'No' }}</li>
          </ul>
        </div>
      </div>

      <!-- sentinel for infinite scroll -->
      <div ref="sentinel" class="h-2"></div>

      <!-- loading & end indicators -->
      <div v-if="loading" class="text-center py-4">Loading more…</div>
      <div v-if="finished" class="text-center py-4 text-gray-500">No more entries.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { formatQuantity, TIME_BASED_CAP } from '~/utils/formatQuantity'

const take = 20
const skip = ref(0)
const userCtoons = ref([])
const loading = ref(false)
const finished = ref(false)
const sentinel = ref(null)

// Default sort to Acquired date/time descending
const sort = ref('createdAt')
const dir  = ref('desc')

// Filtering state
const filters = ref({
  rarity: '',
  owner: '',
  acquiredFrom: '',
  acquiredTo: '',
  ctoonName: ''
})

// Utility: format dates
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Chicago', timeZoneName: 'short'
  })
}

// Build query string with pagination, sort, filter
function buildQuery() {
  const params = new URLSearchParams({
    skip: skip.value.toString(),
    take: take.toString(),
    sort: sort.value,
    dir:  dir.value
  })
  const f = filters.value
  if (f.rarity)       params.set('rarity', f.rarity)
  if (f.owner)        params.set('owner', f.owner)
  if (f.acquiredFrom) params.set('acquiredFrom', f.acquiredFrom)
  if (f.acquiredTo)   params.set('acquiredTo', f.acquiredTo)
  if (f.ctoonName)    params.set('ctoonName', f.ctoonName)
  return params.toString()
}

// Load next page
async function loadNext() {
  if (loading.value || finished.value) return
  loading.value = true

  const res = await fetch(`/api/admin/user-ctoons?${buildQuery()}`, {
    credentials: 'include'
  })
  if (!res.ok) {
    loading.value = false
    return
  }
  const page = await res.json()
  if (page.length < take) finished.value = true
  userCtoons.value.push(...page)
  skip.value += take
  loading.value = false
}

// Apply filters: reset & reload
function applyFilters() {
  skip.value = 0
  finished.value = false
  userCtoons.value = []
  loadNext()
}

let observer = null

onMounted(() => {
  applyFilters()
  observer = new IntersectionObserver(
    entries => {
      if (entries[0].isIntersecting) loadNext()
    },
    { rootMargin: '200px' }
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onBeforeUnmount(() => {
  if (observer) { observer.disconnect(); observer = null }
})
</script>

<style scoped>
/* vertical centering */
th, td { vertical-align: middle; }

/* pin first column */
table th:first-child,
table td:first-child {
  position: sticky;
  left: 0;
  background: white;
  z-index: 10;
}

/* pin second column */
table th:nth-child(2),
table td:nth-child(2) {
  position: sticky;
  left: 80px; /* adjust to match your first column width */
  background: white;
  z-index: 10;
}
</style>
