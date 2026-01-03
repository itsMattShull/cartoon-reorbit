<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-semibold">Claim Codes Admin</h1>
        <NuxtLink
          to="/admin/create-code"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create New Code
        </NuxtLink>
      </div>

      <!-- Tabs -->
      <div class="mb-6 border-b">
        <nav class="flex -mb-px">
          <button
            @click="activeTab = 'created'"
            :class="activeTab === 'created'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'"
            class="px-4 py-2 mr-4"
          >
            Created Codes
          </button>
          <button
            @click="activeTab = 'claimed'"
            :class="activeTab === 'claimed'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'"
            class="px-4 py-2"
          >
            Claimed Codes
          </button>
        </nav>
      </div>

      <!-- Created Codes Tab -->
      <div v-if="activeTab === 'created'">
        <div class="mb-4 flex flex-wrap items-end gap-4">
          <div class="flex-1">
            <label for="createdFilter" class="block text-sm font-medium text-gray-700 mb-1">Filter by code or cToon</label>
            <input
              id="createdFilter"
              v-model="createdQuery"
              type="text"
              placeholder="Type a code or cToon name..."
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
        <div v-if="createdError" class="text-red-600 mb-4">{{ createdError.message }}</div>
        <div v-else-if="createdLoading" class="text-gray-500">Loading…</div>
        <div v-else>
          <!-- Desktop Table -->
          <div class="hidden lg:block">
            <table
              v-if="codes.length"
              class="w-full table-auto border-collapse"
            >
              <thead>
                <tr class="bg-gray-100">
                  <th class="px-4 py-2 text-left">Code</th>
                  <th class="px-4 py-2 text-left">Expires At</th>
                  <th class="px-4 py-2 text-right"># cToons</th>
                  <th class="px-4 py-2 text-right"># of Backgrounds</th>
                  <th class="px-4 py-2 text-right">Points</th>
                  <th class="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in codes" :key="c.code" class="border-b hover:bg-gray-50">
                  <td class="px-4 py-2 break-words">{{ c.code }}</td>
                  <td class="px-4 py-2">
                    <span v-if="c.expiresAt">
                      {{ new Date(c.expiresAt).toLocaleDateString() }}
                    </span>
                    <span v-else class="text-gray-500">Never</span>
                  </td>
                  <td class="px-4 py-2 text-right">{{ countCtoons(c) }}</td>
                  <td class="px-4 py-2 text-right">{{ countBackgrounds(c) }}</td>
                  <td class="px-4 py-2 text-right">{{ countPoints(c) }}</td>
                  <td class="px-4 py-2 text-right">
                    <NuxtLink
                      :to="`/admin/edit-code?code=${encodeURIComponent(c.code)}`"
                      class="text-blue-600 hover:underline"
                    >
                      Edit
                    </NuxtLink>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="!codes.length" class="text-gray-500">
              No codes found.
            </div>
          </div>

          <!-- Mobile Cards -->
          <div class="block lg:hidden space-y-4">
            <div
              v-for="c in codes"
              :key="c.code"
              class="bg-gray-100 rounded-lg p-4 flex flex-col"
            >
              <div class="space-y-2">
                <p><strong>Code:</strong> {{ c.code }}</p>
                <p>
                  <strong>Expires:</strong>
                  <span v-if="c.expiresAt">
                    {{ new Date(c.expiresAt).toLocaleDateString() }}
                  </span>
                  <span v-else>Never</span>
                </p>
                <p><strong># cToons:</strong> {{ countCtoons(c) }}</p>
                <p><strong># Backgrounds:</strong> {{ countBackgrounds(c) }}</p>
                <p><strong>Points:</strong> {{ countPoints(c) }}</p>
              </div>
              <NuxtLink
                :to="`/admin/edit-code?code=${encodeURIComponent(c.code)}`"
                class="mt-4 self-end text-blue-600 hover:underline"
              >
                Edit
              </NuxtLink>
            </div>
            <div v-if="!codes.length" class="text-gray-500">
              No codes found.
            </div>
          </div>
        </div>

        <!-- Created Pagination -->
        <div v-if="!createdLoading && codes.length" class="mt-6 flex items-center justify-between">
          <div class="text-sm text-gray-600">
            Page {{ createdPage }} of {{ createdTotalPages }} - Showing {{ createdShowingRange }}
          </div>
          <div class="space-x-2">
            <button class="px-3 py-1 border rounded" :disabled="createdPage <= 1" @click="prevCreatedPage">Prev</button>
            <button class="px-3 py-1 border rounded" :disabled="createdPage >= createdTotalPages" @click="nextCreatedPage">Next</button>
          </div>
        </div>
      </div>

      <!-- Claimed Codes Tab -->
      <div v-if="activeTab === 'claimed'">
        <div class="mb-4 flex flex-wrap items-end gap-4">
          <div class="flex-1">
            <label for="claimedFilter" class="block text-sm font-medium text-gray-700 mb-1">Filter by username, code, or cToon</label>
            <input
              id="claimedFilter"
              v-model="claimedQuery"
              list="claimedUserSuggestions"
              type="text"
              @focus="fetchClaimedUserSuggestions"
              placeholder="Type a username, code, or cToon name..."
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
            <datalist id="claimedUserSuggestions">
              <option v-for="u in claimedUserSuggestions" :key="u" :value="u" />
            </datalist>
          </div>
        </div>

        <div v-if="claimedError" class="text-red-600 mb-4">{{ claimedError.message }}</div>
        <div v-else-if="claimedLoading" class="text-gray-500">Loading…</div>
        <div v-else>
          <!-- Desktop Table -->
          <div class="hidden lg:block">
            <table
              v-if="claimed.length"
              class="w-full table-auto border-collapse"
            >
              <thead>
                <tr class="bg-gray-100">
                  <th class="px-4 py-2 text-left">Code</th>
                  <th class="px-4 py-2 text-left">User</th>
                  <th class="px-4 py-2 text-left">Claimed At</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in claimed" :key="row.id" class="border-b hover:bg-gray-50">
                  <td class="px-4 py-2 break-words">{{ row.code }}</td>
                  <td class="px-4 py-2">{{ row.user.username }}</td>
                  <td class="px-4 py-2">
                    {{ new Date(row.claimedAt).toLocaleString() }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="!claimed.length" class="text-gray-500">
              No claims found.
            </div>
          </div>

          <!-- Mobile Cards -->
          <div class="block lg:hidden space-y-4">
            <div
              v-for="row in claimed"
              :key="row.id"
              class="bg-gray-100 rounded-lg p-4 flex flex-col"
            >
              <p><strong>Code:</strong> {{ row.code }}</p>
              <p><strong>User:</strong> {{ row.user.username }}</p>
              <p><strong>Claimed At:</strong>
                {{ new Date(row.claimedAt).toLocaleString() }}
              </p>
            </div>
            <div v-if="!claimed.length" class="text-gray-500">
              No claims found.
            </div>
          </div>
        </div>

        <!-- Claimed Pagination -->
        <div v-if="!claimedLoading && claimed.length" class="mt-6 flex items-center justify-between">
          <div class="text-sm text-gray-600">
            Page {{ claimedPage }} of {{ claimedTotalPages }} - Showing {{ claimedShowingRange }}
          </div>
          <div class="space-x-2">
            <button class="px-3 py-1 border rounded" :disabled="claimedPage <= 1" @click="prevClaimedPage">Prev</button>
            <button class="px-3 py-1 border rounded" :disabled="claimedPage >= claimedTotalPages" @click="nextClaimedPage">Next</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth','admin'],
  layout: 'default'
})

// Tab state
const activeTab = ref('created')

// Created codes
const codes = ref([])
const createdTotal = ref(0)
const createdPage = ref(1)
const createdLimit = 50
const createdLoading = ref(false)
const createdError = ref(null)
const createdQuery = ref('')

// Claimed codes
const claimed = ref([])
const claimedTotal = ref(0)
const claimedPage = ref(1)
const claimedLimit = 100
const claimedLoading = ref(false)
const claimedError = ref(null)
const claimedQuery = ref('')
const claimedUserSuggestions = ref([])

const createdTotalPages = computed(() => Math.max(1, Math.ceil(createdTotal.value / createdLimit)))
const claimedTotalPages = computed(() => Math.max(1, Math.ceil(claimedTotal.value / claimedLimit)))

const createdShowingRange = computed(() => {
  if (!createdTotal.value) return '0-0 of 0'
  const start = (createdPage.value - 1) * createdLimit + 1
  const end = Math.min(createdPage.value * createdLimit, createdTotal.value)
  return `${start}-${end} of ${createdTotal.value}`
})

const claimedShowingRange = computed(() => {
  if (!claimedTotal.value) return '0-0 of 0'
  const start = (claimedPage.value - 1) * claimedLimit + 1
  const end = Math.min(claimedPage.value * claimedLimit, claimedTotal.value)
  return `${start}-${end} of ${claimedTotal.value}`
})

async function fetchCreatedCodes() {
  createdLoading.value = true
  createdError.value = null
  try {
    const res = await $fetch('/api/admin/codes', {
      query: {
        page: createdPage.value,
        limit: createdLimit,
        q: createdQuery.value.trim() || undefined
      }
    })
    codes.value = res.items || []
    createdTotal.value = res.total || 0
    if (res.page) createdPage.value = res.page
  } catch (err) {
    createdError.value = err
    codes.value = []
    createdTotal.value = 0
  } finally {
    createdLoading.value = false
  }
}

async function fetchClaimedCodes() {
  claimedLoading.value = true
  claimedError.value = null
  try {
    const res = await $fetch('/api/admin/codes/claimed', {
      query: {
        page: claimedPage.value,
        limit: claimedLimit,
        q: claimedQuery.value.trim() || undefined
      }
    })
    claimed.value = res.items || []
    claimedTotal.value = res.total || 0
    if (res.page) claimedPage.value = res.page
  } catch (err) {
    claimedError.value = err
    claimed.value = []
    claimedTotal.value = 0
  } finally {
    claimedLoading.value = false
  }
}

async function fetchClaimedUserSuggestions() {
  const term = claimedQuery.value.trim()
  if (term.length < 3) {
    claimedUserSuggestions.value = []
    return
  }
  try {
    const res = await $fetch('/api/admin/user-mentions', { query: { q: term, limit: 10 } })
    claimedUserSuggestions.value = (res.items || []).map(item => item.username).filter(Boolean)
  } catch {
    claimedUserSuggestions.value = []
  }
}

function nextCreatedPage() {
  if (createdPage.value >= createdTotalPages.value) return
  createdPage.value += 1
  fetchCreatedCodes()
}

function prevCreatedPage() {
  if (createdPage.value <= 1) return
  createdPage.value -= 1
  fetchCreatedCodes()
}

function nextClaimedPage() {
  if (claimedPage.value >= claimedTotalPages.value) return
  claimedPage.value += 1
  fetchClaimedCodes()
}

function prevClaimedPage() {
  if (claimedPage.value <= 1) return
  claimedPage.value -= 1
  fetchClaimedCodes()
}

function countBackgrounds(code) {
  const ids = new Set()
  for (const r of (code.rewards || [])) {
    for (const rb of (r.backgrounds || [])) {
      const id =
        rb.backgroundId ||           // { backgroundId: '...' }
        rb?.background?.id ||        // { background: { id, ... } } if selected that way
        rb?.id                       // fallback if your select returns id directly
      if (id) ids.add(id)
    }
  }
  return ids.size
}

// Helper to sum up all points for a code
function countPoints(code) {
  return (code.rewards || []).reduce((sum, r) => sum + (r.points || 0), 0)
}

// Helper to sum up all cToon quantities
function countCtoons(code) {
  return (code.rewards || []).reduce(
    (sum, r) =>
      sum + ((r.ctoons || []).reduce((s2, rc) => s2 + (rc.quantity || 0), 0)),
    0
  )
}

let claimedFilterDebounceId = null
watch(claimedQuery, () => {
  if (claimedFilterDebounceId) clearTimeout(claimedFilterDebounceId)
  claimedFilterDebounceId = setTimeout(() => {
    claimedPage.value = 1
    fetchClaimedCodes()
  }, 300)
})

let createdFilterDebounceId = null
watch(createdQuery, () => {
  if (createdFilterDebounceId) clearTimeout(createdFilterDebounceId)
  createdFilterDebounceId = setTimeout(() => {
    createdPage.value = 1
    fetchCreatedCodes()
  }, 300)
})

let claimedSuggestDebounceId = null
watch(claimedQuery, () => {
  if (claimedSuggestDebounceId) clearTimeout(claimedSuggestDebounceId)
  claimedSuggestDebounceId = setTimeout(fetchClaimedUserSuggestions, 200)
})

watch(activeTab, (tab) => {
  if (tab === 'created' && !codes.value.length) fetchCreatedCodes()
  if (tab === 'claimed' && !claimed.value.length) fetchClaimedCodes()
})

onMounted(() => {
  fetchCreatedCodes()
})
</script>

<style scoped>
th,
td {
  vertical-align: middle;
}
</style>
