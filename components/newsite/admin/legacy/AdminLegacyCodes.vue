<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">

      <div class="bg-white rounded border p-3">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h1 class="text-base font-semibold">Claim Codes Admin</h1>
          <NuxtLink
            to="/admin/codes/new"
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Create New Code
          </NuxtLink>
        </div>

        <!-- Tabs -->
        <div class="mb-3 border-b">
          <nav class="flex -mb-px">
            <button
              @click="activeTab = 'created'"
              :class="activeTab === 'created'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'"
              class="px-3 py-1.5 text-xs mr-2"
            >
              Created Codes
            </button>
            <button
              @click="activeTab = 'claimed'"
              :class="activeTab === 'claimed'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'"
              class="px-3 py-1.5 text-xs mr-2"
            >
              Claimed Codes
            </button>
            <button
              @click="activeTab = 'failed'"
              :class="activeTab === 'failed'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'"
              class="px-3 py-1.5 text-xs"
            >
              Failed Attempts
            </button>
          </nav>
        </div>

        <!-- Created Codes Tab -->
        <div v-if="activeTab === 'created'">
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end mb-2">
            <div class="flex-1 flex flex-col gap-1">
              <label for="createdFilter" class="text-xs font-medium">Filter by code or cToon</label>
              <input
                id="createdFilter"
                v-model="createdQuery"
                type="text"
                placeholder="Type a code or cToon name..."
                class="text-xs border rounded-md px-1.5 py-1"
              />
            </div>
            <div class="w-full sm:w-60 flex flex-col gap-1">
              <label for="createdSort" class="text-xs font-medium">Sort by</label>
              <select
                id="createdSort"
                v-model="createdSort"
                class="text-xs border rounded-md px-1.5 py-1 bg-white"
              >
                <option value="created">Created date</option>
                <option value="expires">Expiration date</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>
          <div v-if="createdError" class="text-red-600 mb-2 text-[11px]">{{ createdError.message }}</div>
          <div v-else-if="createdLoading" class="text-gray-500 py-6 text-center">Loading…</div>
          <div v-else>
            <!-- Desktop Table -->
            <div class="hidden lg:block overflow-x-auto">
              <table
                v-if="codes.length"
                class="w-full text-xs"
              >
                <thead>
                  <tr>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Code</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Available At (CST)</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Expires At</th>
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100"># cToons</th>
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100"># Packs</th>
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100"># of Backgrounds</th>
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100">Points</th>
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100">Redeemed</th>
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr v-for="c in codes" :key="c.code" class="hover:bg-gray-50">
                    <td class="px-2 py-1.5 max-w-[15ch] truncate" :title="c.code">{{ c.code }}</td>
                    <td class="px-2 py-1.5">
                      <span v-if="c.startsAt">
                        {{ formatCST(c.startsAt) }}
                      </span>
                      <span v-else class="text-gray-500">Immediately</span>
                    </td>
                    <td class="px-2 py-1.5">
                      <span v-if="c.expiresAt">
                        {{ new Date(c.expiresAt).toLocaleDateString() }}
                      </span>
                      <span v-else class="text-gray-500">Never</span>
                    </td>
                    <td class="px-2 py-1.5 text-right">{{ countCtoons(c) }}</td>
                    <td class="px-2 py-1.5 text-right" :title="packTitle(c)">{{ countPacks(c) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ countBackgrounds(c) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ countPoints(c) }}</td>
                    <td class="px-2 py-1.5 text-right">{{ redeemedCount(c) }} / {{ c.maxClaims }}</td>
                    <td class="px-2 py-1.5 text-right">
                      <NuxtLink
                        :to="`/admin/codes/edit?code=${encodeURIComponent(c.code)}`"
                        class="px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50"
                      >
                        Edit
                      </NuxtLink>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="!codes.length" class="text-gray-500 py-6 text-center">
                No codes found.
              </div>
            </div>

            <!-- Mobile Cards -->
            <div class="block lg:hidden grid grid-cols-1 gap-2">
              <div
                v-for="c in codes"
                :key="c.code"
                class="bg-white border rounded-lg shadow p-2 flex flex-col gap-1"
              >
                <div class="text-[11px] space-y-0.5">
                  <p><strong>Code:</strong> {{ c.code }}</p>
                  <p>
                    <strong>Available At:</strong>
                    <span v-if="c.startsAt">{{ formatCST(c.startsAt) }}</span>
                    <span v-else>Immediately</span>
                  </p>
                  <p>
                    <strong>Expires:</strong>
                    <span v-if="c.expiresAt">
                      {{ new Date(c.expiresAt).toLocaleDateString() }}
                    </span>
                    <span v-else>Never</span>
                  </p>
                  <p><strong># cToons:</strong> {{ countCtoons(c) }}</p>
                  <p><strong># Packs:</strong> {{ countPacks(c) }}<span v-if="packTitle(c)" class="text-gray-500"> ({{ packTitle(c) }})</span></p>
                  <p><strong># Backgrounds:</strong> {{ countBackgrounds(c) }}</p>
                  <p><strong>Points:</strong> {{ countPoints(c) }}</p>
                  <p><strong>Redeemed:</strong> {{ redeemedCount(c) }} / {{ c.maxClaims }}</p>
                </div>
                <NuxtLink
                  :to="`/admin/codes/edit?code=${encodeURIComponent(c.code)}`"
                  class="self-end px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50"
                >
                  Edit
                </NuxtLink>
              </div>
              <div v-if="!codes.length" class="text-gray-500 py-6 text-center">
                No codes found.
              </div>
            </div>
          </div>

          <!-- Created Pagination -->
          <div v-if="!createdLoading && codes.length" class="mt-3 flex items-center justify-between">
            <div class="text-[11px] text-gray-600">
              Page {{ createdPage }} of {{ createdTotalPages }} - Showing {{ createdShowingRange }}
            </div>
            <div class="space-x-1">
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="createdPage <= 1" @click="prevCreatedPage">Prev</button>
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="createdPage >= createdTotalPages" @click="nextCreatedPage">Next</button>
            </div>
          </div>
        </div>

        <!-- Claimed Codes Tab -->
        <div v-if="activeTab === 'claimed'">
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end mb-2">
            <div class="flex-1 flex flex-col gap-1">
              <label for="claimedFilter" class="text-xs font-medium">Filter by username, code, or cToon</label>
              <input
                id="claimedFilter"
                v-model="claimedQuery"
                list="claimedUserSuggestions"
                type="text"
                @focus="fetchClaimedUserSuggestions"
                placeholder="Type a username, code, or cToon name..."
                class="text-xs border rounded-md px-1.5 py-1"
              />
              <datalist id="claimedUserSuggestions">
                <option v-for="u in claimedUserSuggestions" :key="u" :value="u" />
              </datalist>
            </div>
          </div>

          <div v-if="claimedError" class="text-red-600 mb-2 text-[11px]">{{ claimedError.message }}</div>
          <div v-else-if="claimedLoading" class="text-gray-500 py-6 text-center">Loading…</div>
          <div v-else>
            <!-- Desktop Table -->
            <div class="hidden lg:block overflow-x-auto">
              <table
                v-if="claimed.length"
                class="w-full text-xs"
              >
                <thead>
                  <tr>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Code</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">User</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Claimed At</th>
                    <th class="px-2 py-1.5 text-right text-[11px] font-semibold text-gray-600 bg-gray-100">Packs granted</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr v-for="row in claimed" :key="row.id" class="hover:bg-gray-50">
                    <td class="px-2 py-1.5 break-words">{{ row.code }}</td>
                    <td class="px-2 py-1.5">{{ row.user.username }}</td>
                    <td class="px-2 py-1.5">
                      {{ new Date(row.claimedAt).toLocaleString() }}
                    </td>
                    <td class="px-2 py-1.5 text-right">{{ row.packsGranted || 0 }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="!claimed.length" class="text-gray-500 py-6 text-center">
                No claims found.
              </div>
            </div>

            <!-- Mobile Cards -->
            <div class="block lg:hidden grid grid-cols-1 gap-2">
              <div
                v-for="row in claimed"
                :key="row.id"
                class="bg-white border rounded-lg shadow p-2 flex flex-col gap-0.5 text-[11px]"
              >
                <p><strong>Code:</strong> {{ row.code }}</p>
                <p><strong>User:</strong> {{ row.user.username }}</p>
                <p><strong>Claimed At:</strong>
                  {{ new Date(row.claimedAt).toLocaleString() }}
                </p>
                <p><strong>Packs granted:</strong> {{ row.packsGranted || 0 }}</p>
              </div>
              <div v-if="!claimed.length" class="text-gray-500 py-6 text-center">
                No claims found.
              </div>
            </div>
          </div>

          <!-- Claimed Pagination -->
          <div v-if="!claimedLoading && claimed.length" class="mt-3 flex items-center justify-between">
            <div class="text-[11px] text-gray-600">
              Page {{ claimedPage }} of {{ claimedTotalPages }} - Showing {{ claimedShowingRange }}
            </div>
            <div class="space-x-1">
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="claimedPage <= 1" @click="prevClaimedPage">Prev</button>
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="claimedPage >= claimedTotalPages" @click="nextClaimedPage">Next</button>
            </div>
          </div>
        </div>

        <!-- Failed Attempts Tab -->
        <div v-if="activeTab === 'failed'">
          <p class="text-[11px] text-gray-600 mb-2">
            Every failed redeem. <strong>Before start</strong> means the player submitted a real code before it went live, so
            they had it early. <strong>No browser headers</strong> means the request didn't come from a normal page visit,
            which usually means a script.
          </p>
          <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end mb-2">
            <div class="flex-1 flex flex-col gap-1">
              <label for="failedFilter" class="text-xs font-medium">Filter by username or code typed</label>
              <input
                id="failedFilter"
                v-model="failedQuery"
                type="text"
                placeholder="Type a username or code..."
                class="text-xs border rounded-md px-1.5 py-1"
              />
            </div>
            <div class="w-full sm:w-60 flex flex-col gap-1">
              <label for="failedReason" class="text-xs font-medium">Reason</label>
              <select
                id="failedReason"
                v-model="failedReason"
                class="text-xs border rounded-md px-1.5 py-1 bg-white"
              >
                <option value="">All reasons</option>
                <option v-for="r in FAILURE_REASONS" :key="r" :value="r">{{ reasonLabel(r) }}</option>
              </select>
            </div>
          </div>

          <div v-if="failedError" class="text-red-600 mb-2 text-[11px]">{{ failedError.message }}</div>
          <div v-else-if="failedLoading" class="text-gray-500 py-6 text-center">Loading…</div>
          <div v-else>
            <!-- Desktop Table -->
            <div class="hidden lg:block overflow-x-auto">
              <table v-if="failed.length" class="w-full text-xs">
                <thead>
                  <tr>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Attempted At</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">User</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Code Typed</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Reason</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Before Start</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">IP Tag</th>
                    <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Client</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr v-for="row in failed" :key="row.id" class="hover:bg-gray-50">
                    <td class="px-2 py-1.5 whitespace-nowrap">{{ formatPrecise(row.createdAt) }}</td>
                    <td class="px-2 py-1.5">{{ row.user?.username || '—' }}</td>
                    <td class="px-2 py-1.5 max-w-[20ch] truncate" :title="row.codeText">{{ row.codeText || '(empty)' }}</td>
                    <td class="px-2 py-1.5">
                      <span :class="reasonClass(row.reason)" class="px-1.5 py-0.5 rounded text-[10px] font-semibold" :title="row.message">
                        {{ reasonLabel(row.reason) }}
                      </span>
                    </td>
                    <td class="px-2 py-1.5">
                      <span v-if="row.secsBeforeStart != null" class="text-red-700 font-semibold">{{ formatDuration(row.secsBeforeStart) }}</span>
                      <span v-else class="text-gray-400">—</span>
                    </td>
                    <td class="px-2 py-1.5 font-mono">{{ row.ipTag || '—' }}</td>
                    <td class="px-2 py-1.5" :title="clientTitle(row)">
                      <span v-if="isBrowserRequest(row)" class="text-gray-600">Browser</span>
                      <span v-else class="text-amber-700 font-semibold">No browser headers</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="!failed.length" class="text-gray-500 py-6 text-center">
                No failed attempts found.
              </div>
            </div>

            <!-- Mobile Cards -->
            <div class="block lg:hidden grid grid-cols-1 gap-2">
              <div
                v-for="row in failed"
                :key="row.id"
                class="bg-white border rounded-lg shadow p-2 flex flex-col gap-0.5 text-[11px]"
              >
                <p><strong>Attempted At:</strong> {{ formatPrecise(row.createdAt) }}</p>
                <p><strong>User:</strong> {{ row.user?.username || '—' }}</p>
                <p class="break-all"><strong>Code Typed:</strong> {{ row.codeText || '(empty)' }}</p>
                <p>
                  <strong>Reason:</strong>
                  <span :class="reasonClass(row.reason)" class="px-1.5 py-0.5 rounded text-[10px] font-semibold">{{ reasonLabel(row.reason) }}</span>
                </p>
                <p v-if="row.secsBeforeStart != null" class="text-red-700"><strong>Before Start:</strong> {{ formatDuration(row.secsBeforeStart) }}</p>
                <p><strong>IP Tag:</strong> <span class="font-mono">{{ row.ipTag || '—' }}</span></p>
                <p>
                  <strong>Client:</strong>
                  <span v-if="isBrowserRequest(row)">Browser</span>
                  <span v-else class="text-amber-700 font-semibold">No browser headers</span>
                </p>
                <p class="text-gray-500 break-all">{{ row.userAgent || 'No user agent' }}</p>
              </div>
              <div v-if="!failed.length" class="text-gray-500 py-6 text-center">
                No failed attempts found.
              </div>
            </div>
          </div>

          <!-- Failed Pagination -->
          <div v-if="!failedLoading && failed.length" class="mt-3 flex items-center justify-between">
            <div class="text-[11px] text-gray-600">
              Page {{ failedPage }} of {{ failedTotalPages }} - Showing {{ failedShowingRange }}
            </div>
            <div class="space-x-1">
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="failedPage <= 1" @click="prevFailedPage">Prev</button>
              <button class="px-2 py-0.5 text-[11px] border rounded-md" :disabled="failedPage >= failedTotalPages" @click="nextFailedPage">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

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
const createdSort = ref('created')

// Claimed codes
const claimed = ref([])
const claimedTotal = ref(0)
const claimedPage = ref(1)
const claimedLimit = 100
const claimedLoading = ref(false)
const claimedError = ref(null)
const claimedQuery = ref('')
const claimedUserSuggestions = ref([])

// Failed redeem attempts (server/api/admin/codes/failed-attempts.get.js)
const FAILURE_REASONS = ['INVALID', 'NOT_STARTED', 'EXPIRED', 'PREREQ', 'FULL', 'ALREADY_REDEEMED', 'MISSING', 'ERROR']
const failed = ref([])
const failedTotal = ref(0)
const failedPage = ref(1)
const failedLimit = 100
const failedLoading = ref(false)
const failedError = ref(null)
const failedQuery = ref('')
const failedReason = ref('')

const createdTotalPages = computed(() => Math.max(1, Math.ceil(createdTotal.value / createdLimit)))
const claimedTotalPages = computed(() => Math.max(1, Math.ceil(claimedTotal.value / claimedLimit)))
const failedTotalPages = computed(() => Math.max(1, Math.ceil(failedTotal.value / failedLimit)))

const failedShowingRange = computed(() => {
  if (!failedTotal.value) return '0-0 of 0'
  const start = (failedPage.value - 1) * failedLimit + 1
  const end = Math.min(failedPage.value * failedLimit, failedTotal.value)
  return `${start}-${end} of ${failedTotal.value}`
})

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
        q: createdQuery.value.trim() || undefined,
        sort: createdSort.value
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

async function fetchFailedAttempts() {
  failedLoading.value = true
  failedError.value = null
  try {
    const res = await $fetch('/api/admin/codes/failed-attempts', {
      query: {
        page: failedPage.value,
        limit: failedLimit,
        q: failedQuery.value.trim() || undefined,
        reason: failedReason.value || undefined
      }
    })
    failed.value = res.items || []
    failedTotal.value = res.total || 0
    if (res.page) failedPage.value = res.page
  } catch (err) {
    failedError.value = err
    failed.value = []
    failedTotal.value = 0
  } finally {
    failedLoading.value = false
  }
}

function nextFailedPage() {
  if (failedPage.value >= failedTotalPages.value) return
  failedPage.value += 1
  fetchFailedAttempts()
}

function prevFailedPage() {
  if (failedPage.value <= 1) return
  failedPage.value -= 1
  fetchFailedAttempts()
}

const REASON_LABELS = {
  INVALID: 'Invalid code',
  NOT_STARTED: 'Before start',
  EXPIRED: 'Expired',
  PREREQ: 'Missing prereqs',
  FULL: 'Fully redeemed',
  ALREADY_REDEEMED: 'Already redeemed',
  MISSING: 'Empty',
  ERROR: 'Error'
}
function reasonLabel(r) { return REASON_LABELS[r] || r }
function reasonClass(r) {
  if (r === 'NOT_STARTED') return 'bg-red-100 text-red-800'
  if (r === 'INVALID') return 'bg-amber-100 text-amber-800'
  if (r === 'ERROR') return 'bg-gray-200 text-gray-800'
  return 'bg-gray-100 text-gray-700'
}

// Timing matters here (a script lands within milliseconds), so show seconds and milliseconds.
function formatPrecise(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  }).replace(/ (AM|PM)$/, `.${String(d.getMilliseconds()).padStart(3, '0')} $1`) + ' CST'
}
function formatDuration(secs) {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  if (secs < 86400) return `${Math.round(secs / 360) / 10}h`
  return `${Math.round(secs / 8640) / 10}d`
}

// A normal page visit from a browser always sends Sec-Fetch-Site (and Origin on a POST).
function isBrowserRequest(row) {
  return Boolean(row.secFetchSite && row.origin)
}
function clientTitle(row) {
  return [
    `User agent: ${row.userAgent || '(none)'}`,
    `Origin: ${row.origin || '(none)'}`,
    `Referer: ${row.referer || '(none)'}`,
    `Sec-Fetch-Site: ${row.secFetchSite || '(none)'}`
  ].join('\n')
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

function formatCST(iso) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }) + ' CST'
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

// Total completed redemptions (server/api/admin/codes.get.js's `_count.claims`) — how many
// distinct players have actually redeemed this code, out of its maxClaims limit.
function redeemedCount(code) {
  return code._count?.claims ?? 0
}

// Sealed packs a code awards (summed across reward batches), and a "2× Pack A, 1× Pack B" tooltip for them.
function countPacks(code) {
  return (code.rewards || []).reduce((sum, r) => sum + (r.packs || []).reduce((s2, p) => s2 + (p.quantity || 0), 0), 0)
}
function packTitle(code) {
  const byName = new Map()
  for (const r of (code.rewards || [])) {
    for (const p of (r.packs || [])) {
      const name = p.pack?.name || 'Pack'
      byName.set(name, (byName.get(name) || 0) + (p.quantity || 0))
    }
  }
  return [...byName].map(([n, q]) => `${q}× ${n}`).join(', ')
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

watch(createdSort, () => {
  createdPage.value = 1
  if (activeTab.value === 'created') fetchCreatedCodes()
})

let claimedSuggestDebounceId = null
watch(claimedQuery, () => {
  if (claimedSuggestDebounceId) clearTimeout(claimedSuggestDebounceId)
  claimedSuggestDebounceId = setTimeout(fetchClaimedUserSuggestions, 200)
})

let failedFilterDebounceId = null
watch(failedQuery, () => {
  if (failedFilterDebounceId) clearTimeout(failedFilterDebounceId)
  failedFilterDebounceId = setTimeout(() => {
    failedPage.value = 1
    fetchFailedAttempts()
  }, 300)
})

watch(failedReason, () => {
  failedPage.value = 1
  fetchFailedAttempts()
})

watch(activeTab, (tab) => {
  if (tab === 'created' && !codes.value.length) fetchCreatedCodes()
  if (tab === 'claimed' && !claimed.value.length) fetchClaimedCodes()
  // Always refetch: this tab is watched live while a code goes out.
  if (tab === 'failed') fetchFailedAttempts()
})

onMounted(() => {
  fetchCreatedCodes()
})

onBeforeUnmount(() => {
  if (claimedFilterDebounceId) clearTimeout(claimedFilterDebounceId)
  if (createdFilterDebounceId) clearTimeout(createdFilterDebounceId)
  if (claimedSuggestDebounceId) clearTimeout(claimedSuggestDebounceId)
  if (failedFilterDebounceId) clearTimeout(failedFilterDebounceId)
})
</script>

<style scoped>
th,
td {
  vertical-align: middle;
}
</style>
