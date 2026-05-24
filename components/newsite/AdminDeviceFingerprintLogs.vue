<template>
  <div class="admin-device-fingerprint-logs bg-gray-50">
    <div class="p-2 text-xs">
      <h1 class="text-base font-bold mb-2">Device Fingerprint Logs</h1>

      <!-- Filters -->
      <div class="mb-2 flex flex-wrap items-end gap-2">
        <div class="flex items-center">
          <label for="usernameFilter" class="mr-1 font-medium">User:</label>
          <input
            id="usernameFilter"
            v-model="usernameQuery"
            type="text"
            placeholder="Username contains…"
            class="border rounded px-1.5 py-0.5 text-xs"
          />
        </div>
        <div class="flex items-center">
          <label for="visitorIdFilter" class="mr-1 font-medium">Visitor ID:</label>
          <input
            id="visitorIdFilter"
            v-model="visitorIdQuery"
            type="text"
            placeholder="Exact match…"
            class="border rounded px-1.5 py-0.5 text-xs w-56 font-mono"
          />
        </div>
        <div class="flex items-center">
          <label for="ipFilter" class="mr-1 font-medium">IP:</label>
          <input
            id="ipFilter"
            v-model="ipQuery"
            type="text"
            placeholder="Exact match…"
            class="border rounded px-1.5 py-0.5 text-xs w-40 font-mono"
          />
        </div>
        <button
          v-if="usernameQuery || visitorIdQuery || ipQuery"
          class="px-2 py-0.5 text-[11px] border rounded"
          @click="clearFilters"
        >Reset</button>
      </div>

      <div class="mb-2 text-[11px] text-gray-600">
        Total Results: {{ total }} logs
      </div>

      <div v-if="loading" class="text-gray-500">Loading…</div>
      <div v-else-if="items.length === 0" class="text-gray-500">No fingerprint logs found.</div>
      <div v-else>
        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="min-w-full bg-white rounded shadow text-[11px]">
            <thead class="bg-gray-100 text-left">
              <tr>
                <th class="px-1.5 py-1 border-b">Captured At</th>
                <th class="px-1.5 py-1 border-b">Username</th>
                <th class="px-1.5 py-1 border-b">DiscordID</th>
                <th class="px-1.5 py-1 border-b">IP</th>
                <th class="px-1.5 py-1 border-b">Visitor ID (fingerprint)</th>
                <th class="px-1.5 py-1 border-b"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in items" :key="row.id" class="border-t align-top">
                <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(row.createdAt) }}</td>
                <td class="px-1.5 py-1 font-medium">{{ row.user?.username || '—' }}</td>
                <td class="px-1.5 py-1">
                  <span v-if="row.user?.discordUsername">{{ row.user.discordUsername }}</span>
                  <span v-else class="font-mono text-gray-500" :title="'Snowflake — user has not re-logged in since discordUsername was added'">{{ row.user?.discordId || '—' }}</span>
                </td>
                <td class="px-1.5 py-1 font-mono">{{ row.ip || '—' }}</td>
                <td class="px-1.5 py-1 font-mono break-all">{{ row.visitorId }}</td>
                <td class="px-1.5 py-1">
                  <button
                    class="px-2 py-0.5 text-[11px] border rounded hover:bg-gray-100"
                    title="Filter to all rows sharing this fingerprint"
                    @click="filterByVisitor(row.visitorId)"
                  >Match</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="md:hidden grid grid-cols-1 gap-2">
          <div v-for="row in items" :key="row.id" class="border rounded p-2 shadow text-[11px] space-y-0.5">
            <div class="text-[10px] text-gray-500">{{ formatDate(row.createdAt) }}</div>
            <div><span class="text-gray-500">User:</span> <span class="font-medium">{{ row.user?.username || '—' }}</span></div>
            <div><span class="text-gray-500">DiscordID:</span> <span class="font-mono">{{ row.user?.discordId || '—' }}</span></div>
            <div><span class="text-gray-500">IP:</span> <span class="font-mono">{{ row.ip || '—' }}</span></div>
            <div><span class="text-gray-500">Visitor ID:</span> <span class="font-mono break-all">{{ row.visitorId }}</span></div>
            <div class="pt-1">
              <button
                class="px-2 py-0.5 text-[11px] border rounded hover:bg-gray-100"
                @click="filterByVisitor(row.visitorId)"
              >Match</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="!loading && items.length" class="mt-3 flex items-center justify-between">
        <div class="text-[11px] text-gray-600">
          Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
        </div>
        <div class="space-x-1">
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page <= 1" @click="prevPage">Prev</button>
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page >= totalPages" @click="nextPage">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const items = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)

const usernameQuery  = ref('')
const visitorIdQuery = ref('')
const ipQuery        = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function formatDate(dt) {
  if (!dt) return '—'
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

async function fetchLogs() {
  if (loading.value) return
  loading.value = true
  try {
    const query = {
      page: page.value,
      limit: pageSize,
      username:  usernameQuery.value.trim()  || undefined,
      visitorId: visitorIdQuery.value.trim() || undefined,
      ip:        ipQuery.value.trim()        || undefined
    }
    const res = await $fetch('/api/admin/device-fingerprint-logs', { query })
    items.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch (e) {
    console.error('Failed to load device fingerprint logs', e)
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchLogs()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchLogs()
}

function filterByVisitor(visitorId) {
  visitorIdQuery.value = visitorId
  usernameQuery.value = ''
  ipQuery.value = ''
  // watcher handles the refetch
}

function clearFilters() {
  usernameQuery.value = ''
  visitorIdQuery.value = ''
  ipQuery.value = ''
}

let filterDebounceId = null
watch([usernameQuery, visitorIdQuery, ipQuery], () => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => {
    page.value = 1
    fetchLogs()
  }, 300)
})

onMounted(fetchLogs)
</script>

<style scoped>
.admin-device-fingerprint-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
