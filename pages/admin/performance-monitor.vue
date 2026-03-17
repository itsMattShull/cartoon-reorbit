<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />

    <div class="px-6 py-6 mt-16 md:mt-20">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold">Performance Monitor</h1>
          <p class="text-sm text-gray-500 mt-1">
            CPU &amp; memory impact per page / API endpoint — sorted by highest impact first.
            Data accumulates since last server restart.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span v-if="generatedAt" class="text-xs text-gray-400">
            Last updated: {{ relativeTime }}
          </span>
          <button
            @click="load"
            :disabled="loading"
            class="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {{ loading ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-xs text-gray-500 uppercase tracking-wide">Endpoints Tracked</p>
          <p class="text-2xl font-bold mt-1">{{ metrics.length }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-xs text-gray-500 uppercase tracking-wide">Total Requests</p>
          <p class="text-2xl font-bold mt-1">{{ totalRequests.toLocaleString() }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-xs text-gray-500 uppercase tracking-wide">Total CPU Time</p>
          <p class="text-2xl font-bold mt-1">{{ formatDuration(totalCpuMs) }}</p>
        </div>
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-xs text-gray-500 uppercase tracking-wide">High-Impact Routes</p>
          <p class="text-2xl font-bold mt-1 text-red-600">{{ highImpactCount }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <input
          v-model="search"
          type="text"
          placeholder="Filter by route…"
          class="border rounded-lg px-3 py-1.5 text-sm w-56"
        />
        <label class="flex items-center gap-2 text-sm">
          <input v-model="onlyHighImpact" type="checkbox" class="rounded" />
          Only high-impact
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="onlyErrors" type="checkbox" class="rounded" />
          Only with errors
        </label>
        <select v-model="sortKey" class="border rounded-lg px-3 py-1.5 text-sm">
          <option value="impactScore">Sort: Impact score</option>
          <option value="avgDurationMs">Sort: Avg latency</option>
          <option value="p95DurationMs">Sort: P95 latency</option>
          <option value="count">Sort: Request count</option>
          <option value="errorCount">Sort: Errors</option>
          <option value="avgHeapUsedMb">Sort: Avg heap (MB)</option>
        </select>
      </div>

      <!-- Legend -->
      <div class="flex gap-4 mb-3 text-xs text-gray-500">
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-3 rounded bg-red-100 border border-red-400"></span>
          High impact (2× avg)
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-3 rounded bg-yellow-50 border border-yellow-400"></span>
          Elevated (1× avg)
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-3 rounded bg-white border border-gray-200"></span>
          Normal
        </span>
      </div>

      <!-- Table -->
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <div v-if="loading && !metrics.length" class="p-10 text-center text-gray-400">
          Loading metrics…
        </div>
        <div v-else-if="!metrics.length" class="p-10 text-center text-gray-400">
          No metrics recorded yet. Traffic needs to flow through the server first.
        </div>
        <div v-else>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-100 text-xs text-gray-600 uppercase">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold">#</th>
                  <th class="px-4 py-3 text-left font-semibold">Route</th>
                  <th class="px-4 py-3 text-right font-semibold">Requests</th>
                  <th class="px-4 py-3 text-right font-semibold">Errors</th>
                  <th class="px-4 py-3 text-right font-semibold">Avg (ms)</th>
                  <th class="px-4 py-3 text-right font-semibold">P95 (ms)</th>
                  <th class="px-4 py-3 text-right font-semibold">Max (ms)</th>
                  <th class="px-4 py-3 text-right font-semibold">Total CPU</th>
                  <th class="px-4 py-3 text-right font-semibold">Avg Heap (MB)</th>
                  <th class="px-4 py-3 text-right font-semibold">Impact Score</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, idx) in filtered"
                  :key="row.route"
                  :class="rowClass(row)"
                  class="border-t border-gray-100"
                >
                  <td class="px-4 py-3 text-gray-400">{{ idx + 1 }}</td>
                  <td class="px-4 py-3 font-mono text-xs break-all">
                    <span class="flex items-center gap-2">
                      {{ row.route }}
                      <span
                        v-if="isHigh(row)"
                        class="shrink-0 text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded"
                      >HIGH</span>
                      <span
                        v-else-if="isElevated(row)"
                        class="shrink-0 text-xs font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded"
                      >ELEVATED</span>
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">{{ row.count.toLocaleString() }}</td>
                  <td class="px-4 py-3 text-right" :class="row.errorCount > 0 ? 'text-red-600 font-semibold' : ''">
                    {{ row.errorCount }}
                  </td>
                  <td class="px-4 py-3 text-right">{{ row.avgDurationMs }}</td>
                  <td class="px-4 py-3 text-right">{{ row.p95DurationMs }}</td>
                  <td class="px-4 py-3 text-right">{{ row.maxDurationMs }}</td>
                  <td class="px-4 py-3 text-right">{{ formatDuration(row.totalDurationMs) }}</td>
                  <td class="px-4 py-3 text-right">
                    {{ row.avgHeapUsedMb != null ? row.avgHeapUsedMb + ' MB' : '—' }}
                  </td>
                  <td class="px-4 py-3 text-right font-semibold">
                    <div class="flex items-center justify-end gap-2">
                      {{ row.impactScore.toLocaleString() }}
                      <div class="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          class="h-1.5 rounded-full"
                          :class="isHigh(row) ? 'bg-red-500' : isElevated(row) ? 'bg-yellow-400' : 'bg-indigo-400'"
                          :style="{ width: impactBarWidth(row) }"
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="filtered.length === 0" class="p-6 text-center text-gray-400 text-sm">
            No routes match the current filters.
          </div>
        </div>
      </div>

      <p class="mt-4 text-xs text-gray-400">
        <strong>Impact Score</strong> = request count × average latency (ms). A higher score means more total CPU time consumed.
        Heap figures are sampled at response time and represent the process-wide V8 heap — not a per-request allocation.
        Latency is wall-clock time from first byte received to response finish.
      </p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: 'admin' })

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const metrics = ref([])
const thresholds = ref({ highImpact: 0 })
const generatedAt = ref(null)
const loading = ref(false)
const search = ref('')
const onlyHighImpact = ref(false)
const onlyErrors = ref(false)
const sortKey = ref('impactScore')

let interval = null

async function load() {
  loading.value = true
  try {
    const data = await $fetch('/api/admin/performance-metrics')
    metrics.value = data.metrics
    thresholds.value = data.thresholds
    generatedAt.value = data.generatedAt
  } catch (e) {
    console.error('Failed to load performance metrics', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  interval = setInterval(load, 30_000)
})

onBeforeUnmount(() => {
  clearInterval(interval)
})

const relativeTime = computed(() => {
  if (!generatedAt.value) return ''
  const diff = Math.round((Date.now() - new Date(generatedAt.value).getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  return `${Math.round(diff / 60)}m ago`
})

const totalRequests = computed(() => metrics.value.reduce((s, m) => s + m.count, 0))
const totalCpuMs = computed(() => metrics.value.reduce((s, m) => s + m.totalDurationMs, 0))
const highImpactCount = computed(() => metrics.value.filter(m => isHigh(m)).length)
const maxImpact = computed(() => Math.max(...metrics.value.map(m => m.impactScore), 1))

// Elevated = above average (0.5× high threshold)
const elevatedThreshold = computed(() => thresholds.value.highImpact / 2)

function isHigh(row) {
  return row.impactScore > 0 && row.impactScore >= thresholds.value.highImpact
}

function isElevated(row) {
  return !isHigh(row) && row.impactScore > 0 && row.impactScore >= elevatedThreshold.value
}

function rowClass(row) {
  if (isHigh(row)) return 'bg-red-50'
  if (isElevated(row)) return 'bg-yellow-50'
  return ''
}

function impactBarWidth(row) {
  const pct = (row.impactScore / maxImpact.value) * 100
  return `${Math.min(100, pct)}%`
}

function formatDuration(ms) {
  if (!ms) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

const sorted = computed(() => {
  const key = sortKey.value
  return metrics.value.slice().sort((a, b) => {
    const av = a[key] ?? 0
    const bv = b[key] ?? 0
    return bv - av
  })
})

const filtered = computed(() => {
  let list = sorted.value
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(m => m.route.toLowerCase().includes(q))
  }
  if (onlyHighImpact.value) {
    list = list.filter(m => isHigh(m))
  }
  if (onlyErrors.value) {
    list = list.filter(m => m.errorCount > 0)
  }
  return list
})
</script>
