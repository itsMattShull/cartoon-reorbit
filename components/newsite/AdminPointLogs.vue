<template>
  <div class="admin-point-logs bg-gray-50">
    <div class="p-2 text-xs">
      <div class="bg-white rounded-lg shadow p-3">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-base font-semibold">Points Log</h1>
        </div>

        <!-- FILTER BAR -->
        <div class="flex flex-wrap items-end gap-2 mb-2">
          <input
            type="text"
            v-model="searchTerm"
            placeholder="Search by username…"
            class="flex-1 min-w-[160px] border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div class="flex items-center">
            <label for="fromDate" class="mr-1 text-[11px] font-medium">From</label>
            <input id="fromDate" v-model="fromDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" />
          </div>
          <div class="flex items-center">
            <label for="toDate" class="mr-1 text-[11px] font-medium">To</label>
            <input id="toDate" v-model="toDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" />
          </div>
        </div>

        <div class="mb-2 text-[11px] text-gray-600">
          Total Results: {{ total }} logs
        </div>

        <div v-if="loading" class="text-center py-2">Loading…</div>
        <div v-else-if="logs.length === 0" class="text-center py-2 text-gray-500">No logs found.</div>
        <div v-else>
          <!-- TABLE VIEW (desktop) -->
          <div class="overflow-x-auto hidden sm:block">
            <table class="min-w-full table-auto border-collapse text-[11px]">
              <thead>
                <tr class="bg-gray-100">
                  <th class="px-1.5 py-1 text-left">User</th>
                  <th class="px-1.5 py-1 text-left">Direction</th>
                  <th class="px-1.5 py-1 text-right">Points</th>
                  <th class="px-1.5 py-1 text-right">New Total</th>
                  <th class="px-1.5 py-1 text-left">Method</th>
                  <th class="px-1.5 py-1 text-left">Created At (CDT)</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="log in logs"
                  :key="log.id"
                  class="border-b hover:bg-gray-50"
                >
                  <td class="px-1.5 py-1">{{ log.user?.username ?? '—' }}</td>
                  <td class="px-1.5 py-1 capitalize">{{ log.direction }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ log.points }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ log.total }}</td>
                  <td class="px-1.5 py-1">{{ log.method || '—' }}</td>
                  <td class="px-1.5 py-1 whitespace-nowrap">
                    {{ new Date(log.createdAt).toLocaleString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                      timeZone: 'America/Chicago', timeZoneName: 'short'
                    }) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- CARD VIEW (mobile) -->
          <div class="space-y-2 block sm:hidden">
            <div
              v-for="log in logs"
              :key="log.id"
              class="bg-gray-100 rounded-lg p-2 flex flex-col text-[11px]"
            >
              <div class="flex justify-between">
                <div>
                  <p class="font-semibold">{{ log.user?.username ?? '—' }}</p>
                  <p class="capitalize">{{ log.direction }}</p>
                  <p>Points: {{ log.points }}</p>
                  <p>Method: {{ log.method || '—' }}</p>
                </div>
                <p class="text-[10px] whitespace-nowrap">
                  {{ new Date(log.createdAt).toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                    timeZone: 'America/Chicago'
                  }) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="!loading && logs.length" class="mt-3 flex items-center justify-between">
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const logs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)

const searchTerm = ref('')
const fromDate = ref('')
const toDate = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function normalizeDateRange() {
  if (!fromDate.value || !toDate.value) return
  if (new Date(fromDate.value) > new Date(toDate.value)) {
    const tmp = fromDate.value
    fromDate.value = toDate.value
    toDate.value = tmp
  }
}

async function fetchLogs() {
  if (loading.value) return
  normalizeDateRange()
  loading.value = true
  try {
    const query = {
      page: page.value,
      limit: pageSize,
      username: searchTerm.value.trim() || undefined,
      from: fromDate.value || undefined,
      to: toDate.value || undefined
    }
    const res = await $fetch('/api/admin/points-log', { query })
    logs.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch {
    logs.value = []
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

let filterDebounceId = null
watch([searchTerm, fromDate, toDate], () => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => {
    page.value = 1
    fetchLogs()
  }, 300)
})

onMounted(() => {
  fetchLogs()
})
</script>

<style scoped>
.admin-point-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
th, td { vertical-align: middle; }
</style>
