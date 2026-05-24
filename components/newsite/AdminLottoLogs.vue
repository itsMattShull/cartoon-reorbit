<template>
  <div class="admin-lotto-logs bg-gray-50">
    <div class="p-2 text-xs">
      <h1 class="text-base font-bold mb-2">Lotto Logs</h1>

      <!-- Filters -->
      <form class="bg-white border rounded p-2 flex flex-wrap items-end gap-2 mb-2" @submit.prevent="applyRange">
        <div>
          <label class="block text-[10px] font-medium mb-0.5">From</label>
          <input type="date" v-model="from" class="border rounded px-1.5 py-0.5 text-xs" />
        </div>
        <div>
          <label class="block text-[10px] font-medium mb-0.5">To</label>
          <input type="date" v-model="to" class="border rounded px-1.5 py-0.5 text-xs" />
        </div>
        <div class="relative">
          <label class="block text-[10px] font-medium mb-0.5">User</label>
          <input
            v-model="userQuery"
            type="text"
            class="border rounded px-1.5 py-0.5 text-xs w-40"
            placeholder="3+ chars…"
            autocomplete="off"
            @input="onUserInput"
            @blur="hideUserSuggestions"
            @focus="onUserInput"
          />
          <ul
            v-if="userSuggestions.length && showUserDropdown"
            class="absolute z-20 left-0 mt-0.5 w-40 bg-white border rounded shadow max-h-40 overflow-y-auto"
          >
            <li
              v-for="u in userSuggestions"
              :key="u"
              class="px-2 py-1 text-[11px] cursor-pointer hover:bg-indigo-50"
              @mousedown.prevent="selectUser(u)"
            >{{ u }}</li>
          </ul>
        </div>
        <button class="bg-indigo-600 text-white rounded px-2 py-0.5 text-[11px]">Apply</button>
        <button type="button" class="text-[11px] text-gray-600 underline" @click="setLastNDays(30)">Last 30 days</button>
        <button v-if="userQuery" type="button" class="text-[11px] text-red-500 underline" @click="clearUser">Clear user</button>
      </form>

      <!-- Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-2">
        <div class="bg-white rounded shadow p-2 lg:col-span-2">
          <h2 class="text-sm font-semibold mb-1">Outcome Breakdown</h2>
          <p class="text-[11px] text-gray-500 mb-1">Total plays: {{ totalOutcomes }}</p>
          <div v-if="summaryLoading" class="text-gray-500">Loading…</div>
          <div v-else-if="totalOutcomes === 0" class="text-gray-500">No plays in this range.</div>
          <table v-else class="w-full text-[11px]">
            <thead>
              <tr class="text-left border-b">
                <th class="py-1">Outcome</th>
                <th class="py-1">Count</th>
                <th class="py-1">% of total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summaryRows" :key="row.key" class="border-b">
                <td class="py-0.5">{{ row.label }}</td>
                <td class="py-0.5 tabular-nums">{{ row.count }}</td>
                <td class="py-0.5 tabular-nums">{{ pct(row.count, totalOutcomes) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bg-white rounded shadow p-2">
          <h2 class="text-sm font-semibold mb-1">At a Glance</h2>
          <div class="grid grid-cols-1 gap-1.5">
            <div v-for="row in summaryRows" :key="`${row.key}-card`" class="border rounded p-1.5 bg-gray-50">
              <div class="text-[10px] text-gray-500">{{ row.label }}</div>
              <div class="text-sm font-semibold tabular-nums">{{ row.count }}</div>
              <div class="text-[10px] text-gray-500">{{ pct(row.count, totalOutcomes) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs list -->
      <div class="bg-white rounded shadow p-2">
        <div class="flex items-center justify-between mb-1.5">
          <h2 class="text-sm font-semibold">Lotto Logs</h2>
          <div class="text-[11px] text-gray-500">Showing {{ showingRange }}</div>
        </div>

        <div v-if="logsLoading" class="text-gray-500">Loading…</div>
        <div v-else-if="logs.length === 0" class="text-gray-500">No logs in this range.</div>
        <div v-else>
          <!-- Desktop table -->
          <div class="hidden md:block overflow-auto">
            <table class="min-w-full w-full border rounded text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Time (CDT)</th>
                  <th class="px-1.5 py-1 border-b">User</th>
                  <th class="px-1.5 py-1 border-b">Outcome</th>
                  <th class="px-1.5 py-1 border-b">Prize</th>
                  <th class="px-1.5 py-1 border-b">Odds Before</th>
                  <th class="px-1.5 py-1 border-b">Odds After</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in logs" :key="log.id" class="border-b">
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(log.createdAt) }}</td>
                  <td class="px-1.5 py-1">{{ displayUser(log.user) }}</td>
                  <td class="px-1.5 py-1">{{ labelFor(log.outcome) }}</td>
                  <td class="px-1.5 py-1">{{ formatPrize(log) }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ formatOdds(log.oddsBefore) }}</td>
                  <td class="px-1.5 py-1 tabular-nums">{{ formatOdds(log.oddsAfter) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="md:hidden space-y-1.5">
            <div v-for="log in logs" :key="log.id" class="border rounded bg-white p-2 text-[11px]">
              <div class="flex items-center justify-between text-[10px] text-gray-500">
                <span>{{ formatDate(log.createdAt) }}</span>
                <span>{{ labelFor(log.outcome) }}</span>
              </div>
              <div class="mt-0.5 font-medium">{{ displayUser(log.user) }}</div>
              <div v-if="log.outcome === 'CTOON' && log.userCtoon" class="mt-0.5 text-indigo-700 font-medium">
                {{ formatPrize(log) }}
              </div>
              <div class="mt-1 grid grid-cols-2 gap-1 text-[10px]">
                <div><span class="text-gray-500">Odds Before:</span> {{ formatOdds(log.oddsBefore) }}</div>
                <div><span class="text-gray-500">Odds After:</span> {{ formatOdds(log.oddsAfter) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div class="mt-2 flex items-center justify-between">
          <div class="text-[11px] text-gray-600">
            Page {{ page }} of {{ totalPages }} • Showing {{ showingRange }}
          </div>
          <div class="space-x-1">
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page <= 1" @click="prevPage">Prev</button>
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page >= totalPages" @click="nextPage">Next</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const from = ref('')
const to = ref('')
const page = ref(1)
const pageSize = 50
const userQuery = ref('')
const userSuggestions = ref([])
const showUserDropdown = ref(false)

const summaryLoading = ref(false)
const logsLoading = ref(false)
const summary = ref([])
const totalLogs = ref(0)
const logs = ref([])

const OUTCOMES = [
  { key: 'NOTHING', label: 'Nothing' },
  { key: 'POINTS', label: 'Points' },
  { key: 'CTOON', label: 'cToon' }
]

const totalOutcomes = computed(() => summary.value.reduce((sum, row) => sum + row.count, 0))
const summaryRows = computed(() => {
  const map = new Map(summary.value.map(r => [r.outcome, r.count]))
  return OUTCOMES.map(o => ({
    key: o.key,
    label: o.label,
    count: map.get(o.key) || 0
  }))
})

const totalPages = computed(() => Math.max(1, Math.ceil(totalLogs.value / pageSize)))
const showingRange = computed(() => {
  if (!totalLogs.value) return '0–0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, totalLogs.value)
  return `${start}–${end} of ${totalLogs.value}`
})

function toYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function setLastNDays(n) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (n - 1))
  from.value = toYMD(start)
  to.value = toYMD(end)
  page.value = 1
  loadAll()
}

function pct(count, total) {
  return total ? `${((count / total) * 100).toFixed(1)}%` : '—'
}

function formatDate(dt) {
  return new Date(dt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short'
  })
}

function formatOdds(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  return `${Number(val).toFixed(2)}%`
}

function labelFor(outcome) {
  const row = OUTCOMES.find(o => o.key === outcome)
  return row ? row.label : outcome
}

function displayUser(user) {
  return user?.username || user?.discordTag || user?.id || '—'
}

function formatPrize(log) {
  if (log.outcome !== 'CTOON' || !log.userCtoon) return '—'
  const name = log.userCtoon.ctoon?.name || 'Unknown'
  const mint = log.userCtoon.mintNumber != null ? `#${log.userCtoon.mintNumber}` : ''
  return mint ? `${name} ${mint}` : name
}

async function fetchSummary() {
  summaryLoading.value = true
  try {
    const res = await $fetch('/api/admin/lotto-logs-summary', {
      query: { start: from.value, end: to.value }
    })
    summary.value = res.data || []
  } catch (e) {
    console.error('Failed to load lotto summary', e)
    summary.value = []
  } finally {
    summaryLoading.value = false
  }
}

let userSuggestTimer = null
async function fetchUserSuggestions() {
  const term = userQuery.value.trim()
  if (term.length < 3) {
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

function onUserInput() {
  showUserDropdown.value = true
  if (userSuggestTimer) clearTimeout(userSuggestTimer)
  userSuggestTimer = setTimeout(fetchUserSuggestions, 200)
}

function hideUserSuggestions() {
  setTimeout(() => { showUserDropdown.value = false }, 150)
}

function selectUser(username) {
  userQuery.value = username
  showUserDropdown.value = false
  userSuggestions.value = []
  page.value = 1
  fetchLogs()
}

function clearUser() {
  userQuery.value = ''
  userSuggestions.value = []
  page.value = 1
  fetchLogs()
}

async function fetchLogs() {
  logsLoading.value = true
  try {
    const username = userQuery.value.trim()
    const res = await $fetch('/api/admin/lotto-logs', {
      query: { start: from.value, end: to.value, page: page.value, limit: pageSize, ...(username && { username }) }
    })
    logs.value = res.items || []
    totalLogs.value = res.total || 0
  } catch (e) {
    console.error('Failed to load lotto logs', e)
    logs.value = []
    totalLogs.value = 0
  } finally {
    logsLoading.value = false
  }
}

async function loadAll() {
  await Promise.all([fetchSummary(), fetchLogs()])
}

function applyRange() {
  if (!from.value || !to.value) return
  if (new Date(from.value) > new Date(to.value)) {
    const t = from.value
    from.value = to.value
    to.value = t
  }
  page.value = 1
  loadAll()
}

async function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  await fetchLogs()
}

async function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  await fetchLogs()
}

onMounted(() => {
  setLastNDays(30)
})
</script>

<style scoped>
.admin-lotto-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
