<template>
  <div class="admin-queue-monitor bg-gray-50">
    <div class="p-2 space-y-3 text-xs">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-bold">Queue Monitor</h1>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1 text-[11px] text-gray-600">
            <input v-model="autoRefresh" type="checkbox" /> Auto-refresh (10s)
          </label>
          <span v-if="lastUpdated" class="text-[11px] text-gray-500">Updated {{ lastUpdated }}</span>
          <button class="px-2 py-0.5 text-[11px] border rounded border-gray-400 hover:bg-gray-100" @click="refreshAll">Refresh</button>
        </div>
      </div>

      <!-- Overview: every queue at a glance. Click a row (or use the dropdown) to drill in. -->
      <div class="bg-white rounded border overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-100 text-[11px] text-gray-600">
            <tr>
              <th class="px-2 py-1">Queue</th>
              <th class="px-2 py-1">Status</th>
              <th class="px-2 py-1 text-right">Waiting</th>
              <th class="px-2 py-1 text-right">Active</th>
              <th class="px-2 py-1 text-right">Delayed</th>
              <th class="px-2 py-1 text-right">Failed</th>
              <th class="px-2 py-1 text-right">Completed</th>
              <th class="px-2 py-1">Oldest waiting</th>
              <th class="px-2 py-1 text-right">Workers</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr
              v-for="q in queues"
              :key="q.name"
              class="cursor-pointer hover:bg-indigo-50"
              :class="q.name === selectedName ? 'bg-indigo-50' : ''"
              @click="selectQueue(q.name)"
            >
              <td class="px-2 py-1">
                <div class="font-medium">{{ q.label }}</div>
                <div class="text-[10px] text-gray-500">{{ q.name }}</div>
              </td>
              <td class="px-2 py-1">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium" :class="statusClass(q.status)">{{ statusLabel(q.status) }}</span>
              </td>
              <template v-if="q.counts">
                <td class="px-2 py-1 text-right" :class="q.counts.waiting ? 'font-semibold' : 'text-gray-400'">{{ q.counts.waiting + (q.counts.prioritized || 0) }}</td>
                <td class="px-2 py-1 text-right" :class="q.counts.active ? 'font-semibold' : 'text-gray-400'">{{ q.counts.active }}</td>
                <td class="px-2 py-1 text-right" :class="q.counts.delayed ? '' : 'text-gray-400'">{{ q.counts.delayed }}</td>
                <td class="px-2 py-1 text-right" :class="q.counts.failed ? 'font-semibold text-red-700' : 'text-gray-400'">{{ q.counts.failed }}</td>
                <td class="px-2 py-1 text-right text-gray-600">{{ q.counts.completed }}</td>
                <td class="px-2 py-1 whitespace-nowrap">{{ q.oldestWaitingAgeSec != null ? formatAge(q.oldestWaitingAgeSec) : '—' }}</td>
                <td class="px-2 py-1 text-right">{{ q.workers != null ? q.workers : '?' }}</td>
              </template>
              <td v-else colspan="7" class="px-2 py-1 text-red-700">{{ q.error }}</td>
            </tr>
            <tr v-if="!queues.length && !loadingQueues"><td colspan="9" class="px-2 py-2 text-gray-500">No queues found.</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Selected queue -->
      <div class="flex items-center gap-2 flex-wrap">
        <label class="font-semibold">Queue</label>
        <select v-model="selectedName" class="border rounded px-1 py-0.5" @change="selectQueue(selectedName)">
          <option value="">Select a queue…</option>
          <option v-for="q in queues" :key="q.name" :value="q.name">{{ q.label }} ({{ q.name }})</option>
        </select>
      </div>

      <div v-if="detail" class="space-y-3">
        <div class="text-gray-600">{{ detail.description }}</div>

        <!-- Analytics -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div class="bg-white rounded border p-2">
            <div class="text-[10px] text-gray-500">Status</div>
            <div class="mt-0.5"><span class="px-1.5 py-0.5 rounded text-[11px] font-medium" :class="statusClass(detail.status)">{{ statusLabel(detail.status) }}</span></div>
            <div class="text-[10px] text-gray-500 mt-1">{{ detail.workers != null ? detail.workers + ' worker(s) attached' : 'workers unknown' }}<span v-if="detail.isPaused"> · paused</span></div>
          </div>
          <div class="bg-white rounded border p-2">
            <div class="text-[10px] text-gray-500">Finished (retained jobs)</div>
            <div class="text-sm font-semibold">{{ detail.analytics.completed.lastHour }} ok · <span :class="detail.analytics.failed.lastHour ? 'text-red-700' : ''">{{ detail.analytics.failed.lastHour }} failed</span></div>
            <div class="text-[10px] text-gray-500">last hour · {{ detail.analytics.completed.lastDay }} ok / {{ detail.analytics.failed.lastDay }} failed in 24h</div>
          </div>
          <div class="bg-white rounded border p-2">
            <div class="text-[10px] text-gray-500">Processing time</div>
            <div class="text-sm font-semibold">{{ ms(detail.analytics.completed.avgProcessMs) }} avg</div>
            <div class="text-[10px] text-gray-500">p95 {{ ms(detail.analytics.completed.p95ProcessMs) }}</div>
          </div>
          <div class="bg-white rounded border p-2">
            <div class="text-[10px] text-gray-500">Time waiting in queue</div>
            <div class="text-sm font-semibold">{{ ms(detail.analytics.completed.avgWaitMs) }} avg</div>
            <div class="text-[10px] text-gray-500">p95 {{ ms(detail.analytics.completed.p95WaitMs) }}</div>
          </div>
        </div>
        <div class="text-[10px] text-gray-500">
          Throughput and timings are computed from the {{ detail.analytics.completed.sampled }} completed / {{ detail.analytics.failed.sampled }} failed jobs BullMQ still retains
          (it keeps only the newest few hundred), so treat them as recent activity, not all-time totals.
        </div>

        <!-- Cron queues: the registered schedules and when each fires next -->
        <div v-if="detail.schedulers.length" class="bg-white rounded border overflow-x-auto">
          <div class="px-2 py-1 font-semibold bg-gray-100">Schedulers</div>
          <table class="w-full text-left">
            <tbody class="divide-y">
              <tr v-for="s in detail.schedulers" :key="s.id">
                <td class="px-2 py-1 font-medium">{{ s.id }}</td>
                <td class="px-2 py-1"><code>{{ s.pattern }}</code><span v-if="s.tz" class="text-gray-400"> ({{ s.tz }})</span></td>
                <td class="px-2 py-1 whitespace-nowrap">next: {{ s.next ? formatDate(s.next) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Jobs -->
        <div class="flex items-center gap-1 flex-wrap">
          <button
            v-for="s in STATES"
            :key="s"
            class="px-2 py-0.5 border rounded text-[11px]"
            :class="state === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-400 hover:bg-gray-100'"
            @click="setState(s)"
          >
            {{ s }} <span class="opacity-70">({{ countFor(s) }})</span>
          </button>
          <button
            v-if="state === 'failed' && countFor('failed')"
            class="ml-auto px-2 py-0.5 text-[11px] border rounded border-red-600 text-red-700 hover:bg-red-50"
            @click="cleanState('failed')"
          >Clear all failed</button>
          <button
            v-if="state === 'completed' && countFor('completed')"
            class="ml-auto px-2 py-0.5 text-[11px] border rounded border-gray-500 text-gray-700 hover:bg-gray-100"
            @click="cleanState('completed')"
          >Clear all completed</button>
        </div>

        <div v-if="loadingJobs && !jobs.length" class="text-gray-500">Loading jobs...</div>
        <div v-else-if="!jobs.length" class="text-gray-500">No {{ state }} jobs.</div>
        <div v-else class="bg-white rounded border divide-y">
          <div v-for="j in jobs" :key="j.id" class="p-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">{{ j.name }}</span>
              <span class="text-gray-500">#{{ j.id }}</span>
              <span class="text-gray-500">added {{ formatDate(j.timestamp) }}</span>
              <span v-if="j.finishedOn && j.processedOn" class="text-gray-500">took {{ ms(j.finishedOn - j.processedOn) }}</span>
              <span v-if="state === 'delayed' && j.timestamp" class="text-gray-500">runs {{ formatDate(j.timestamp + (j.delayMs || 0)) }}</span>
              <span v-if="j.attemptsMade > 1 || j.maxAttempts > 1" class="px-1.5 py-0.5 rounded text-[10px] bg-yellow-100 text-yellow-800">attempt {{ j.attemptsMade }}/{{ j.maxAttempts }}</span>
              <span v-if="j.failedReason" class="text-red-700 truncate max-w-full">{{ j.failedReason }}</span>
            </div>
            <div class="mt-1 flex items-center gap-3">
              <button class="text-[11px] text-indigo-600 hover:underline" @click="toggleExpand(j.id)">{{ expanded.has(j.id) ? 'Hide details' : 'Show details' }}</button>
              <button v-if="state === 'failed'" class="text-[11px] text-green-700 hover:underline" @click="retryJob(j)">Retry</button>
              <button v-if="state !== 'active'" class="text-[11px] text-red-600 hover:underline" @click="removeJob(j)">Remove</button>
            </div>
            <div v-if="expanded.has(j.id)" class="mt-2 space-y-1">
              <div class="text-[10px] text-gray-500">Data</div>
              <pre class="text-[11px] whitespace-pre-wrap break-words bg-gray-50 p-2 rounded border">{{ j.data }}</pre>
              <template v-if="j.returnvalue">
                <div class="text-[10px] text-gray-500">Return value</div>
                <pre class="text-[11px] whitespace-pre-wrap break-words bg-gray-50 p-2 rounded border">{{ j.returnvalue }}</pre>
              </template>
              <template v-if="j.stacktrace">
                <div class="text-[10px] text-gray-500">Stack trace</div>
                <pre class="text-[11px] text-red-700 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded border">{{ j.stacktrace }}</pre>
              </template>
            </div>
          </div>
        </div>

        <div v-if="jobs.length" class="flex items-center gap-2 text-[11px] text-gray-600">
          <span>Showing {{ jobs.length }} of {{ jobsTotal }}</span>
          <button v-if="jobs.length < jobsTotal" class="px-2 py-0.5 border rounded border-gray-400 hover:bg-gray-100" :disabled="loadingJobs" @click="loadMore">Load more</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const STATES = ['waiting', 'active', 'delayed', 'failed', 'completed']
const PAGE = 25

const queues = ref([])
const loadingQueues = ref(false)
const lastUpdated = ref('')
const autoRefresh = ref(true)

const selectedName = ref('')
const detail = ref(null)
const state = ref('failed')
const jobs = ref([])
const jobsTotal = ref(0)
const loadingJobs = ref(false)
const expanded = ref(new Set())

let timer = null

const base = () => `/api/admin/queues/${encodeURIComponent(selectedName.value)}`

async function getJson(url) {
  const res = await fetch(url, { credentials: 'include' })
  return res.ok ? res.json() : null
}

async function fetchQueues() {
  loadingQueues.value = true
  try {
    const data = await getJson('/api/admin/queues')
    if (data) {
      queues.value = data
      lastUpdated.value = new Date().toLocaleTimeString('en-US')
    }
  } finally {
    loadingQueues.value = false
  }
}

async function fetchDetail() {
  if (!selectedName.value) { detail.value = null; return }
  const data = await getJson(base())
  if (data) detail.value = data
}

async function fetchJobs({ append = false } = {}) {
  if (!selectedName.value) { jobs.value = []; jobsTotal.value = 0; return }
  loadingJobs.value = true
  try {
    const offset = append ? jobs.value.length : 0
    const data = await getJson(`${base()}/jobs?state=${state.value}&limit=${PAGE}&offset=${offset}`)
    if (!data) return
    jobs.value = append ? [...jobs.value, ...data.jobs] : data.jobs
    jobsTotal.value = data.total
  } finally {
    loadingJobs.value = false
  }
}

function selectQueue(name) {
  selectedName.value = name
  detail.value = null
  jobs.value = []
  expanded.value = new Set()
  if (!name) return
  // Open on the most useful tab: failures if there are any, otherwise what is waiting.
  const q = queues.value.find(x => x.name === name)
  state.value = q?.counts?.failed ? 'failed' : (q?.counts?.waiting ? 'waiting' : 'completed')
  fetchDetail()
  fetchJobs()
}

function setState(s) {
  state.value = s
  expanded.value = new Set()
  fetchJobs()
}

function loadMore() { fetchJobs({ append: true }) }

function refreshAll() {
  fetchQueues()
  fetchDetail()
  fetchJobs()
}

function countFor(s) {
  const c = detail.value?.counts
  if (!c) return 0
  return s === 'waiting' ? (c.waiting || 0) + (c.prioritized || 0) : (c[s] || 0)
}

function toggleExpand(id) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

async function retryJob(j) {
  const res = await fetch(`${base()}/jobs/${encodeURIComponent(j.id)}/retry`, { method: 'POST', credentials: 'include' })
  if (!res.ok) { alert('Could not retry that job.'); return }
  refreshAll()
}

async function removeJob(j) {
  if (!confirm(`Remove job #${j.id} (${j.name})? This cannot be undone.`)) return
  const res = await fetch(`${base()}/jobs/${encodeURIComponent(j.id)}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) { alert('Could not remove that job (it may be running).'); return }
  refreshAll()
}

async function cleanState(s) {
  if (!confirm(`Delete ALL ${s} jobs in this queue? This cannot be undone.`)) return
  const res = await fetch(`${base()}/clean`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s }),
  })
  if (!res.ok) { alert('Failed to clear jobs.'); return }
  refreshAll()
}

function statusLabel(s) {
  return { ok: 'healthy', 'backed-up': 'backed up', 'no-workers': 'no workers', failures: 'has failures', paused: 'paused', error: 'error' }[s] || s
}

function statusClass(s) {
  if (s === 'ok') return 'bg-green-100 text-green-800'
  if (s === 'failures' || s === 'paused') return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800' // backed-up, no-workers, error
}

function ms(v) {
  if (v == null) return '—'
  if (v < 1000) return `${v} ms`
  const s = v / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s - m * 60)}s`
}

function formatAge(sec) {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

function formatDate(input) {
  return new Date(input).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })
}

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    if (!autoRefresh.value || document.hidden) return
    fetchQueues()
    fetchDetail()
    // Keep the open job list fresh, but don't reset a paged-in list the admin is reading.
    if (jobs.value.length <= PAGE) fetchJobs()
  }, 10000)
}

function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}

watch(autoRefresh, (on) => { if (on) startTimer(); else stopTimer() })

onMounted(() => {
  fetchQueues()
  startTimer()
})
onBeforeUnmount(stopTimer)
</script>

<style scoped>
.admin-queue-monitor {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
