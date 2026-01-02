<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />

    <div class="px-6 mt-16 md:mt-20 pb-10">
      <h1 class="text-2xl font-bold mb-4">Lotto Logs</h1>

      <!-- Date range filter -->
      <form class="bg-white border rounded p-4 flex flex-wrap items-end gap-4 mb-6" @submit.prevent="applyRange">
        <div>
          <label class="block text-sm font-medium mb-1">From</label>
          <input type="date" v-model="from" class="border rounded px-2 py-1" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">To</label>
          <input type="date" v-model="to" class="border rounded px-2 py-1" />
        </div>
        <button class="bg-indigo-600 text-white rounded px-4 py-2">Apply</button>
        <button type="button" class="text-sm text-gray-600 underline" @click="setLastNDays(30)">Last 30 days</button>
      </form>

      <!-- Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div class="bg-white rounded shadow p-4 lg:col-span-2">
          <h2 class="text-xl font-semibold mb-2">Outcome Breakdown</h2>
          <p class="text-sm text-gray-500 mb-3">Total plays: {{ totalOutcomes }}</p>
          <div v-if="summaryLoading" class="text-gray-500">Loading…</div>
          <div v-else-if="totalOutcomes === 0" class="text-gray-500">No plays in this range.</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2">Outcome</th>
                <th class="py-2">Count</th>
                <th class="py-2">% of total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summaryRows" :key="row.key" class="border-b">
                <td class="py-1">{{ row.label }}</td>
                <td class="py-1">{{ row.count }}</td>
                <td class="py-1">{{ pct(row.count, totalOutcomes) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="bg-white rounded shadow p-4">
          <h2 class="text-xl font-semibold mb-2">At a Glance</h2>
          <div class="grid grid-cols-1 gap-3">
            <div v-for="row in summaryRows" :key="`${row.key}-card`" class="border rounded p-3 bg-gray-50">
              <div class="text-sm text-gray-500">{{ row.label }}</div>
              <div class="text-2xl font-semibold">{{ row.count }}</div>
              <div class="text-xs text-gray-500">{{ pct(row.count, totalOutcomes) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs list -->
      <div class="bg-white rounded shadow p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-semibold">Lotto Logs</h2>
          <div class="text-sm text-gray-500">Showing {{ showingRange }}</div>
        </div>

        <div v-if="logsLoading" class="text-gray-500">Loading…</div>
        <div v-else-if="logs.length === 0" class="text-gray-500">No logs in this range.</div>
        <div v-else>
          <!-- Desktop table -->
          <div class="hidden md:block overflow-auto">
            <table class="min-w-[900px] w-full border rounded">
              <thead class="bg-gray-50 text-left text-sm">
                <tr>
                  <th class="px-3 py-2 border-b">Time (CDT)</th>
                  <th class="px-3 py-2 border-b">User</th>
                  <th class="px-3 py-2 border-b">Outcome</th>
                  <th class="px-3 py-2 border-b">Odds Before</th>
                  <th class="px-3 py-2 border-b">Odds After</th>
                </tr>
              </thead>
              <tbody class="text-sm">
                <tr v-for="log in logs" :key="log.id" class="border-b">
                  <td class="px-3 py-2 whitespace-nowrap">{{ formatDate(log.createdAt) }}</td>
                  <td class="px-3 py-2">{{ displayUser(log.user) }}</td>
                  <td class="px-3 py-2">{{ labelFor(log.outcome) }}</td>
                  <td class="px-3 py-2">{{ formatOdds(log.oddsBefore) }}</td>
                  <td class="px-3 py-2">{{ formatOdds(log.oddsAfter) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="md:hidden space-y-3">
            <div v-for="log in logs" :key="log.id" class="border rounded bg-white p-3">
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span>{{ formatDate(log.createdAt) }}</span>
                <span>{{ labelFor(log.outcome) }}</span>
              </div>
              <div class="mt-1 text-sm font-medium">{{ displayUser(log.user) }}</div>
              <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><span class="text-gray-500">Odds Before:</span> {{ formatOdds(log.oddsBefore) }}</div>
                <div><span class="text-gray-500">Odds After:</span> {{ formatOdds(log.oddsAfter) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div class="mt-4 flex items-center justify-between">
          <div class="text-sm text-gray-600">
            Page {{ page }} of {{ totalPages }} • Showing {{ showingRange }}
          </div>
          <div class="space-x-2">
            <button class="px-3 py-1 border rounded" :disabled="page <= 1" @click="prevPage">Prev</button>
            <button class="px-3 py-1 border rounded" :disabled="page >= totalPages" @click="nextPage">Next</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })

const from = ref('')
const to = ref('')
const page = ref(1)
const pageSize = 50

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

async function fetchLogs() {
  logsLoading.value = true
  try {
    const res = await $fetch('/api/admin/lotto-logs', {
      query: { start: from.value, end: to.value, page: page.value, limit: pageSize }
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
