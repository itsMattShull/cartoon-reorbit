<template>
  <div class="admin-cron-run-logs bg-gray-50">
    <div class="p-2 space-y-3 text-xs">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-bold">Cron Run Logs</h1>
        <button class="px-2 py-0.5 text-[11px] border rounded border-gray-400 hover:bg-gray-100" @click="refreshAll">
          Refresh
        </button>
      </div>

      <!-- Job health: one row per scheduled job. This is what shows a job that has silently
           stopped running — the history below can only show runs that actually happened. -->
      <div class="bg-white rounded border">
        <button class="w-full flex items-center justify-between px-2 py-1.5 text-left font-semibold" @click="showHealth = !showHealth">
          <span>
            Job health
            <span v-if="problemCount" class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800">
              {{ problemCount }} need attention
            </span>
            <span v-else-if="summary.length" class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-800">all on time</span>
          </span>
          <span class="text-gray-500 text-[11px]">{{ showHealth ? 'Hide' : 'Show' }}</span>
        </button>
        <div v-if="showHealth" class="overflow-x-auto border-t">
          <table class="w-full text-left">
            <thead class="bg-gray-100 text-[11px] text-gray-600">
              <tr>
                <th class="px-2 py-1">Job</th>
                <th class="px-2 py-1">Health</th>
                <th class="px-2 py-1">Schedule</th>
                <th class="px-2 py-1">Last run</th>
                <th class="px-2 py-1">Last success</th>
                <th class="px-2 py-1">Took</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="j in summary" :key="j.job" :title="j.description">
                <td class="px-2 py-1">
                  <div class="font-medium">{{ j.job }}</div>
                  <div class="text-[10px] text-gray-500">{{ j.tier }}</div>
                </td>
                <td class="px-2 py-1">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-medium" :class="healthClass(j.health)">{{ j.health }}</span>
                  <div v-if="j.health === 'failing' && j.lastError" class="text-[10px] text-red-700 max-w-xs truncate" :title="j.lastError">{{ j.lastError }}</div>
                </td>
                <td class="px-2 py-1 text-gray-600 whitespace-nowrap">
                  <code>{{ j.pattern }}</code><span v-if="j.tz" class="text-gray-400"> ({{ j.tz.split('/')[1] }})</span>
                </td>
                <td class="px-2 py-1 whitespace-nowrap">{{ j.lastStartedAt ? formatDate(j.lastStartedAt) : '—' }}</td>
                <td class="px-2 py-1 whitespace-nowrap">{{ j.lastSuccessAt ? formatDate(j.lastSuccessAt) : '—' }}</td>
                <td class="px-2 py-1 whitespace-nowrap">{{ j.lastDurationMs != null ? formatDuration(j.lastDurationMs) : '—' }}</td>
              </tr>
              <tr v-if="!summary.length && !summaryLoading">
                <td colspan="6" class="px-2 py-2 text-gray-500">No jobs registered.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Filters + bulk actions -->
      <div class="flex items-center flex-wrap gap-2">
        <select v-model="jobFilter" class="border rounded px-1 py-0.5" @change="applyFilters">
          <option value="">All jobs</option>
          <option v-for="j in jobs" :key="j" :value="j">{{ j }}</option>
        </select>
        <select v-model="statusFilter" class="border rounded px-1 py-0.5" @change="applyFilters">
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="SKIPPED">Skipped</option>
        </select>

        <label class="flex items-center gap-1 text-[11px] text-gray-700 ml-2">
          <input type="checkbox" :checked="allLoadedSelected" :indeterminate.prop="someSelected && !allLoadedSelected" :disabled="!rows.length" @change="toggleSelectAll" />
          Select all
        </label>

        <button
          class="px-2 py-0.5 text-[11px] border rounded border-red-600 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!selectionCount || deleting"
          @click="deleteSelected"
        >
          Delete selected<span v-if="selectionCount"> ({{ selectionCount }})</span>
        </button>
      </div>

      <!-- Offer to extend a "select all" past the rows currently loaded -->
      <div v-if="allLoadedSelected && !allMatching && total > rows.length" class="px-2 py-1 rounded bg-yellow-50 border border-yellow-200 text-[11px]">
        All {{ rows.length }} loaded runs are selected.
        <button class="text-indigo-700 underline" @click="selectAllMatching">Select all {{ total }} runs{{ filterActive ? ' matching this filter' : '' }}</button>
      </div>
      <div v-if="allMatching" class="px-2 py-1 rounded bg-yellow-50 border border-yellow-200 text-[11px]">
        All {{ total }} runs{{ filterActive ? ' matching this filter' : '' }} are selected.
        <button class="text-indigo-700 underline" @click="clearSelection">Clear selection</button>
      </div>

      <div v-if="loading && !rows.length" class="text-gray-500">Loading...</div>
      <div v-else-if="!rows.length" class="text-gray-500">No runs logged.</div>
      <div v-else class="bg-white rounded border divide-y">
        <div v-for="r in rows" :key="r.id" class="p-2" :class="isSelected(r.id) ? 'bg-indigo-50' : ''">
          <div class="flex flex-wrap items-center gap-2">
            <input type="checkbox" :checked="isSelected(r.id)" @change="toggleRow(r.id)" />
            <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">{{ r.job }}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium" :class="statusClass(r.status)">{{ r.status }}</span>
            <span class="text-gray-500">{{ formatDate(r.startedAt) }}</span>
            <span class="text-gray-500">{{ formatDuration(r.durationMs) }}</span>
            <span v-if="r.trigger && r.trigger !== 'schedule'" class="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800">{{ r.trigger }}</span>
            <span v-if="r.detail" class="truncate max-w-full" :class="r.status === 'FAILED' ? 'text-red-700' : 'text-gray-600'">{{ r.detail }}</span>
          </div>

          <div v-if="r.error" class="mt-1">
            <button class="text-[11px] text-indigo-600 hover:underline" @click="toggleExpand(r.id)">
              {{ expanded.has(r.id) ? 'Hide details' : 'Show details' }}
            </button>
            <pre v-if="expanded.has(r.id)" class="text-[11px] text-red-700 mt-1 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded border">{{ r.error }}</pre>
          </div>
        </div>
      </div>

      <div v-if="rows.length" class="flex items-center gap-2 text-[11px] text-gray-600">
        <span>Showing {{ rows.length }} of {{ total }}</span>
        <button v-if="rows.length < total" class="px-2 py-0.5 border rounded border-gray-400 hover:bg-gray-100" :disabled="loading" @click="loadMore">
          Load more
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const PAGE_SIZE = 100

const rows = ref([])
const total = ref(0)
const jobs = ref([])
const summary = ref([])
const loading = ref(false)
const summaryLoading = ref(false)
const deleting = ref(false)
const showHealth = ref(true)

const jobFilter = ref('')
const statusFilter = ref('')

const expanded = ref(new Set())
const selected = ref(new Set())
// True when the admin chose "select all N" across pages: deletion then goes by filter, not by id.
const allMatching = ref(false)

const filterActive = computed(() => Boolean(jobFilter.value || statusFilter.value))
const problemCount = computed(() => summary.value.filter(j => ['failing', 'late', 'stuck'].includes(j.health)).length)
const selectionCount = computed(() => (allMatching.value ? total.value : selected.value.size))
const someSelected = computed(() => allMatching.value || selected.value.size > 0)
const allLoadedSelected = computed(() =>
  rows.value.length > 0 && (allMatching.value || rows.value.every(r => selected.value.has(r.id)))
)

function filterParams(extra = {}) {
  const p = new URLSearchParams(extra)
  if (jobFilter.value) p.set('job', jobFilter.value)
  if (statusFilter.value) p.set('status', statusFilter.value)
  return p
}

async function fetchRows({ append = false } = {}) {
  loading.value = true
  try {
    const params = filterParams({ take: String(PAGE_SIZE), skip: String(append ? rows.value.length : 0) })
    const res = await fetch(`/api/admin/cron-run-logs?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) { if (!append) { rows.value = []; total.value = 0 } return }
    const data = await res.json()
    rows.value = append ? [...rows.value, ...data.rows] : data.rows
    total.value = data.total
    jobs.value = data.jobs
  } finally {
    loading.value = false
  }
}

async function fetchSummary() {
  summaryLoading.value = true
  try {
    const res = await fetch('/api/admin/cron-run-logs/summary', { credentials: 'include' })
    summary.value = res.ok ? await res.json() : []
  } finally {
    summaryLoading.value = false
  }
}

function refreshAll() {
  clearSelection()
  fetchSummary()
  fetchRows()
}

function applyFilters() {
  clearSelection()
  fetchRows()
}

function loadMore() {
  fetchRows({ append: true })
}

function isSelected(id) {
  return allMatching.value || selected.value.has(id)
}

function toggleRow(id) {
  // Un-ticking one row while "all matching" is on drops back to an explicit id selection of
  // everything loaded except that row.
  if (allMatching.value) {
    allMatching.value = false
    selected.value = new Set(rows.value.map(r => r.id))
  }
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleSelectAll() {
  if (allLoadedSelected.value) {
    clearSelection()
  } else {
    allMatching.value = false
    selected.value = new Set(rows.value.map(r => r.id))
  }
}

function selectAllMatching() {
  allMatching.value = true
}

function clearSelection() {
  allMatching.value = false
  selected.value = new Set()
}

function toggleExpand(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

async function deleteSelected() {
  const n = selectionCount.value
  if (!n) return
  const what = allMatching.value && filterActive.value ? `${n} run log(s) matching this filter` : `${n} run log(s)`
  if (!confirm(`Delete ${what}? This cannot be undone.`)) return

  deleting.value = true
  try {
    const body = allMatching.value
      ? { all: true, job: jobFilter.value || undefined, status: statusFilter.value || undefined }
      : { ids: [...selected.value] }
    const res = await fetch('/api/admin/cron-run-logs/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      alert('Failed to delete the selected run logs.')
      return
    }
    clearSelection()
    await fetchRows()
  } finally {
    deleting.value = false
  }
}

function statusClass(status) {
  if (status === 'FAILED') return 'bg-red-100 text-red-800'
  if (status === 'SKIPPED') return 'bg-yellow-100 text-yellow-800'
  return 'bg-green-100 text-green-800'
}

function healthClass(health) {
  if (health === 'ok') return 'bg-green-100 text-green-800'
  if (health === 'running') return 'bg-blue-100 text-blue-800'
  if (health === 'never') return 'bg-gray-100 text-gray-600'
  return 'bg-red-100 text-red-800' // failing, late, stuck
}

function formatDate(input) {
  const d = new Date(input)
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s - m * 60)}s`
}

onMounted(() => {
  fetchSummary()
  fetchRows()
})
</script>

<style scoped>
.admin-cron-run-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
