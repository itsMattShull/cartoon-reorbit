<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-7xl mx-auto bg-white rounded-lg shadow p-6 mt-16">
      <!-- Page header -->
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-semibold">Manage User cToons</h1>
      </div>

      <!-- Filters & Sorting Controls -->
      <div class="flex flex-wrap gap-4 mb-6 items-end">
        <!-- Sort by -->
        <div>
          <label class="block text-sm font-medium">Sort by</label>
          <select v-model="sort" class="mt-1 block border rounded p-1">
            <option value="createdAt">Acquired</option>
            <option value="ctoonName">cToon Name</option>
            <option value="mintNumber">Mint #</option>
            <option value="rarity">Rarity</option>
            <option value="username">Owner</option>
          </select>
        </div>
        <!-- Sort direction -->
        <div>
          <label class="block text-sm font-medium">Order</label>
          <select v-model="dir" class="mt-1 block border rounded p-1">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <!-- Rarity filter -->
        <div>
          <label class="block text-sm font-medium">Rarity</label>
          <select v-model="filters.rarity" class="mt-1 block border rounded p-1">
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
          <label class="block text-sm font-medium">Owner</label>
          <input
            type="text"
            v-model="filters.owner"
            placeholder="username…"
            class="mt-1 block border rounded p-1"
          />
        </div>
        <!-- cToon name search -->
        <div>
          <label class="block text-sm font-medium">cToon Name</label>
          <input
            type="text"
            v-model="filters.ctoonName"
            placeholder="Search name…"
            class="mt-1 block border rounded p-1"
          />
        </div>
        <!-- Acquired date range -->
        <div>
          <label class="block text-sm font-medium">Acquired From</label>
          <input
            type="date"
            v-model="filters.acquiredFrom"
            class="mt-1 block border rounded p-1"
          />
        </div>
        <div>
          <label class="block text-sm font-medium">Acquired To</label>
          <input
            type="date"
            v-model="filters.acquiredTo"
            class="mt-1 block border rounded p-1"
          />
        </div>
        <!-- Apply button -->
        <button
          @click="applyFilters"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mt-6"
        >
          Apply
        </button>
      </div>

      <!-- Desktop Table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="table-auto border-collapse w-max">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-4 py-2 text-left">Asset</th>
              <th class="px-4 py-2 text-left">cToon Name</th>
              <th class="px-4 py-2 text-right">Mint #</th>
              <th class="px-4 py-2 text-left">Owner</th>
              <th class="px-4 py-2 text-left">Acquired (CDT)</th>
              <th class="px-4 py-2 text-left">Release Date (CDT)</th>
              <th class="px-4 py-2 text-left">Rarity</th>
              <th class="px-4 py-2 text-right">Highest Mint</th>
              <th class="px-4 py-2 text-right">Quantity</th>
              <th class="px-4 py-2 text-center">In C-mart</th>
              <th class="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="uc in userCtoons"
              :key="uc.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-4 py-2">
                <img
                  :src="uc.ctoon.assetPath"
                  :alt="uc.ctoon.name"
                  class="h-16 w-auto mx-auto rounded"
                />
              </td>
              <td class="px-4 py-2">{{ uc.ctoon.name }}</td>
              <td class="px-4 py-2 text-right">{{ uc.mintNumber }}</td>
              <td class="px-4 py-2">{{ uc.username }}</td>
              <td class="px-4 py-2">{{ formatDate(uc.createdAt) }}</td>
              <td class="px-4 py-2">{{ formatDate(uc.ctoon.releaseDate) }}</td>
              <td class="px-4 py-2">{{ uc.ctoon.rarity }}</td>
              <td class="px-4 py-2 text-right">{{ uc.ctoon.highestMint }}</td>
              <td class="px-4 py-2 text-right">
                {{ uc.ctoon.quantity == null ? 'Unlimited' : uc.ctoon.quantity }}
              </td>
              <td class="px-4 py-2 text-center">{{ uc.ctoon.inCmart ? 'Yes' : 'No' }}</td>
              <td class="px-4 py-2 text-right">
                <button
                  @click="deleteUserCtoon(uc.id)"
                  class="text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </td>
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
            <li><strong>Acquired:</strong> {{ formatDate(uc.createdAt) }}</li>
            <li><strong>Release:</strong> {{ formatDate(uc.ctoon.releaseDate) }}</li>
            <li><strong>Rarity:</strong> {{ uc.ctoon.rarity }}</li>
            <li><strong>Highest Mint:</strong> {{ uc.ctoon.highestMint }}</li>
            <li><strong>Quantity:</strong> {{ uc.ctoon.quantity == null ? 'Unlimited' : uc.ctoon.quantity }}</li>
            <li><strong>In C-mart:</strong> {{ uc.ctoon.inCmart ? 'Yes' : 'No' }}</li>
          </ul>
          <button
            @click="deleteUserCtoon(uc.id)"
            class="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      <!-- sentinel for infinite scroll -->
      <div ref="sentinel" class="h-2"></div>

      <!-- loading & end indicators -->
      <div v-if="loading" class="text-center py-4">Loading more…</div>
      <div v-if="finished" class="text-center py-4 text-gray-500">No more entries.</div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })
import { ref, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'

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
  if (f.rarity)      params.set('rarity', f.rarity)
  if (f.owner)       params.set('owner', f.owner)
  if (f.acquiredFrom)params.set('acquiredFrom', f.acquiredFrom)
  if (f.acquiredTo)  params.set('acquiredTo', f.acquiredTo)
  if (f.ctoonName)   params.set('ctoonName', f.ctoonName)
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

// Delete a UserCtoon
async function deleteUserCtoon(id) {
  if (!confirm('Are you sure you want to delete this entry?')) return
  const res = await fetch(`/api/admin/user-ctoons/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  if (res.ok) {
    userCtoons.value = userCtoons.value.filter(u => u.id !== id)
  } else {
    alert('Failed to delete')
  }
}

onMounted(() => {
  applyFilters()
  const obs = new IntersectionObserver(
    entries => {
      if (entries[0].isIntersecting) loadNext()
    },
    { rootMargin: '200px' }
  )
  if (sentinel.value) obs.observe(sentinel.value)
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
