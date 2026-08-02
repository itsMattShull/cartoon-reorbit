<template>
  <div class="admin-error-logs bg-gray-50">
    <div class="p-2 space-y-2 text-xs">
      <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h1 class="text-base font-bold">Error Logs</h1>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1 text-[11px] text-gray-600">
            <input type="checkbox" v-model="includeDismissed" @change="fetchLogs" />
            Show dismissed
          </label>
          <button
            v-if="logs.length && !includeDismissed"
            class="px-2 py-0.5 text-[11px] border rounded border-red-600 text-red-700 hover:bg-red-50"
            @click="dismissAll"
          >
            Dismiss All
          </button>
        </div>
      </div>

      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="logs.length === 0" class="text-gray-500">No errors logged.</div>
      <div v-else class="bg-white rounded border divide-y">
        <div v-for="log in logs" :key="log.id" class="p-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[11px] font-medium" :class="jobBadgeClass(log.job)">
              {{ log.job }}
            </span>
            <span class="text-gray-500">{{ formatDate(log.createdAt) }}</span>
            <span v-if="log.dismissed" class="px-1.5 py-0.5 rounded text-[10px] bg-gray-200 text-gray-600">
              Dismissed
            </span>
            <span class="text-red-700 truncate">{{ log.summary }}</span>
          </div>

          <div class="mt-1 flex items-center gap-2">
            <button class="text-[11px] text-indigo-600 hover:underline" @click="toggleExpand(log.id)">
              {{ expanded.has(log.id) ? 'Hide details' : 'Show details' }}
            </button>
            <button
              v-if="!log.dismissed"
              class="text-[11px] text-gray-500 hover:underline"
              @click="dismiss(log.id)"
            >
              Dismiss
            </button>
          </div>

          <pre
            v-if="expanded.has(log.id)"
            class="text-[11px] text-red-700 mt-2 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded border"
          >{{ log.message }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const logs = ref([])
const loading = ref(false)
const includeDismissed = ref(false)
const expanded = ref(new Set())

async function fetchLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams({ includeDismissed: String(includeDismissed.value) })
    const res = await fetch(`/api/admin/cron-error-logs?${params.toString()}`, { credentials: 'include' })
    logs.value = res.ok ? await res.json() : []
  } finally {
    loading.value = false
  }
}

function toggleExpand(id) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
  expanded.value = new Set(expanded.value)
}

async function dismiss(id) {
  const res = await fetch(`/api/admin/cron-error-logs/${id}/dismiss`, {
    method: 'POST',
    credentials: 'include'
  })
  if (!res.ok) return
  if (includeDismissed.value) {
    const log = logs.value.find(l => l.id === id)
    if (log) log.dismissed = true
  } else {
    logs.value = logs.value.filter(l => l.id !== id)
  }
}

async function dismissAll() {
  if (!confirm('Dismiss all current error logs?')) return
  const res = await fetch('/api/admin/cron-error-logs/dismiss-all', {
    method: 'POST',
    credentials: 'include'
  })
  if (!res.ok) return
  logs.value = []
}

function jobBadgeClass(job) {
  if (job === 'process') return 'bg-red-100 text-red-800'
  if (job === 'startDueAuctions') return 'bg-orange-100 text-orange-800'
  return 'bg-gray-100 text-gray-700'
}

function formatDate(input) {
  const d = new Date(input)
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(fetchLogs)
</script>

<style scoped>
.admin-error-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
