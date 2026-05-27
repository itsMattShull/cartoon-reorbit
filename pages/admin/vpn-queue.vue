<template>
  <Nav />
  <div class="min-h-screen bg-gray-50 p-3 sm:p-6 mt-16 md:mt-20">
    <div class="max-w-5xl mx-auto space-y-6">

      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">VPN Queue Monitor</h1>
          <p class="text-sm text-gray-500 mt-0.5">
            Status of the VPN IP check queue and recent activity
          </p>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" v-model="autoRefresh" class="rounded" />
            Auto-refresh (10s)
          </label>
          <button @click="load" :disabled="loading"
            class="px-3 py-1.5 text-sm bg-white border rounded-md hover:bg-gray-50 disabled:opacity-50">
            {{ loading ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
        {{ error }}
      </div>

      <template v-if="data">

        <!-- Queue status banner -->
        <div :class="[
          'rounded-lg border p-4 flex flex-wrap items-center gap-4',
          data.queue.pending > 0
            ? 'bg-blue-50 border-blue-200'
            : 'bg-green-50 border-green-200'
        ]">
          <div class="flex items-center gap-2">
            <!-- Spinner when running, checkmark when idle -->
            <svg v-if="data.queue.pending > 0" class="animate-spin h-5 w-5 text-blue-500"
              xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <svg v-else class="h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
            </svg>
            <span class="font-semibold text-sm">
              {{ data.queue.pending > 0 ? `Processing — ${data.queue.pending} IPs pending` : 'Queue idle' }}
            </span>
          </div>
          <div v-if="data.queue.pending > 0" class="text-sm text-gray-600">
            ~{{ data.queue.estimatedMinutes }} min remaining at 20 checks/min
          </div>
          <div class="text-sm text-gray-500 ml-auto">
            Last refreshed: {{ lastRefreshed }}
          </div>
        </div>

        <!-- Stats cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Checked</div>
            <div class="text-2xl font-bold text-gray-800">{{ data.db.totalChecked.toLocaleString() }}</div>
            <div class="text-xs text-gray-400 mt-1">all time</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">VPN Flagged</div>
            <div class="text-2xl font-bold text-red-600">{{ data.db.totalFlagged.toLocaleString() }}</div>
            <div class="text-xs text-gray-400 mt-1">all time</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Checked Today</div>
            <div class="text-2xl font-bold text-gray-800">{{ data.db.checkedToday.toLocaleString() }}</div>
            <div class="text-xs text-gray-400 mt-1">since midnight</div>
          </div>
          <div class="bg-white rounded-lg shadow p-4">
            <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Flagged Today</div>
            <div class="text-2xl font-bold" :class="data.db.flaggedToday > 0 ? 'text-red-600' : 'text-gray-800'">
              {{ data.db.flaggedToday.toLocaleString() }}
            </div>
            <div class="text-xs text-gray-400 mt-1">since midnight</div>
          </div>
        </div>

        <!-- Session stats (since last server restart) -->
        <div class="bg-white rounded-lg shadow p-4 text-sm text-gray-600">
          <span class="font-medium text-gray-700">This session (since last restart):</span>
          {{ data.queue.processedThisSession.toLocaleString() }} IPs processed,
          {{ data.queue.flaggedThisSession.toLocaleString() }} flagged
        </div>

        <!-- Error log -->
        <div class="bg-white rounded-lg shadow">
          <div class="p-4 border-b flex items-center justify-between">
            <div>
              <h2 class="font-semibold">Queue Errors</h2>
              <p class="text-xs text-gray-500 mt-0.5">
                Last {{ data.errors.length }} errors (in-memory, resets on server restart)
              </p>
            </div>
            <span v-if="data.errors.length > 0"
              class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              {{ data.errors.length }}
            </span>
            <span v-else class="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              None
            </span>
          </div>
          <div v-if="data.errors.length > 0" class="divide-y max-h-72 overflow-y-auto">
            <div v-for="err in data.errors" :key="err.ts + err.userId"
              class="px-4 py-3 text-sm font-mono">
              <div class="flex flex-wrap gap-x-3 gap-y-0.5">
                <span class="text-gray-400 shrink-0">{{ fmtDate(err.ts) }}</span>
                <span class="text-red-600 break-all">{{ err.message }}</span>
              </div>
              <div class="text-xs text-gray-400 mt-0.5 truncate">
                user: {{ err.userId }} · ip: {{ err.encryptedIp?.slice(0, 16) }}…
              </div>
            </div>
          </div>
          <div v-else class="p-6 text-center text-sm text-gray-400">No errors recorded</div>
        </div>

        <!-- Recent activity -->
        <div class="bg-white rounded-lg shadow">
          <div class="p-4 border-b">
            <h2 class="font-semibold">Recent Activity</h2>
            <p class="text-xs text-gray-500 mt-0.5">Last 50 IPs checked (most recent first)</p>
          </div>
          <div v-if="data.recentActivity.length > 0" class="divide-y">
            <div v-for="entry in data.recentActivity" :key="entry.id"
              class="px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
              <!-- VPN badge -->
              <span v-if="entry.isVpn"
                class="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                VPN
              </span>
              <span v-else
                class="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                Clean
              </span>
              <!-- User -->
              <span class="font-medium text-gray-800">
                {{ entry.user?.username || entry.user?.discordTag || entry.userId }}
              </span>
              <!-- Encrypted IP (truncated) -->
              <span class="font-mono text-xs text-gray-400" :title="entry.ip">
                {{ entry.ip.slice(0, 20) }}…
              </span>
              <!-- Detection type -->
              <span v-if="entry.proxyType" class="text-xs text-orange-600">{{ entry.proxyType }}</span>
              <!-- ISP -->
              <span v-if="entry.isp" class="text-xs text-gray-500 truncate max-w-xs">{{ entry.isp }}</span>
              <!-- Country -->
              <span v-if="entry.country" class="text-xs text-gray-400">{{ entry.country }}</span>
              <!-- Timestamp -->
              <span class="text-xs text-gray-400 ml-auto shrink-0">{{ fmtDate(entry.detectedAt) }}</span>
            </div>
          </div>
          <div v-else class="p-6 text-center text-sm text-gray-400">No activity yet</div>
        </div>

      </template>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'admin' })

const data = ref(null)
const loading = ref(false)
const error = ref(null)
const autoRefresh = ref(true)
const lastRefreshed = ref('—')

let refreshTimer = null

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await $fetch('/api/admin/vpn-queue-status')
    lastRefreshed.value = new Date().toLocaleTimeString()
  } catch (e) {
    error.value = e?.data?.statusMessage || e?.message || 'Failed to load status'
  } finally {
    loading.value = false
  }
}

function fmtDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

watch(autoRefresh, (val) => {
  clearInterval(refreshTimer)
  if (val) refreshTimer = setInterval(load, 10_000)
})

onMounted(() => {
  load()
  refreshTimer = setInterval(load, 10_000)
})

onUnmounted(() => {
  clearInterval(refreshTimer)
})
</script>
