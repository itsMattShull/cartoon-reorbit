// pages/admin/points-log.vue
<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-16 md:mt-20">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold">Points Log</h1>
      </div>

      <!-- FILTER BAR -->
      <div class="flex flex-wrap items-end gap-4 mb-6">
        <input
          type="text"
          v-model="searchTerm"
          placeholder="Search by username…"
          class="flex-1 border border-gray-300 rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <div class="flex items-center">
          <label for="fromDate" class="mr-2 text-sm font-medium">From</label>
          <input id="fromDate" v-model="fromDate" type="date" class="border rounded px-2 py-1" />
        </div>
        <div class="flex items-center">
          <label for="toDate" class="mr-2 text-sm font-medium">To</label>
          <input id="toDate" v-model="toDate" type="date" class="border rounded px-2 py-1" />
        </div>
      </div>

      <div class="mb-4 text-sm text-gray-600">
        Total Results: {{ total }} logs
      </div>

      <div v-if="loading" class="text-center py-4">Loading…</div>
      <div v-else-if="logs.length === 0" class="text-center py-4 text-gray-500">No logs found.</div>
      <div v-else>
        <!-- TABLE VIEW (desktop) -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-full table-auto border-collapse">
            <thead>
              <tr class="bg-gray-100">
                <th class="px-4 py-2 text-left">User</th>
                <th class="px-4 py-2 text-left">Direction</th>
                <th class="px-4 py-2 text-right">Points</th>
                <th class="px-4 py-2 text-right">New Total</th>
                <th class="px-4 py-2 text-left">Method</th>
                <th class="px-4 py-2 text-left">Created At (CDT)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="log in logs"
                :key="log.id"
                class="border-b hover:bg-gray-50"
              >
                <td class="px-4 py-2">{{ log.user?.username ?? '—' }}</td>
                <td class="px-4 py-2 capitalize">{{ log.direction }}</td>
                <td class="px-4 py-2 text-right">{{ log.points }}</td>
                <td class="px-4 py-2 text-right">{{ log.total }}</td>
                <td class="px-4 py-2">{{ log.method || '—' }}</td>
                <td class="px-4 py-2 whitespace-nowrap">
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
        <div class="space-y-4 block sm:hidden">
          <div
            v-for="log in logs"
            :key="log.id"
            class="bg-gray-100 rounded-lg p-4 flex flex-col"
          >
            <div class="flex justify-between">
              <div>
                <p class="font-semibold">{{ log.user?.username ?? '—' }}</p>
                <p class="text-sm capitalize">{{ log.direction }}</p>
                <p class="text-sm">Points: {{ log.points }}</p>
                <p class="text-sm">Method: {{ log.method || '—' }}</p>
              </div>
              <p class="text-xs whitespace-nowrap">
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
      <div v-if="!loading && logs.length" class="mt-6 flex items-center justify-between">
        <div class="text-sm text-gray-600">
          Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
        </div>
        <div class="space-x-2">
          <button class="px-3 py-1 border rounded" :disabled="page <= 1" @click="prevPage">Prev</button>
          <button class="px-3 py-1 border rounded" :disabled="page >= totalPages" @click="nextPage">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

import { ref, computed, onMounted, watch } from 'vue'
import Nav from '~/components/Nav.vue'

const logs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)

// filter state
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
th, td { vertical-align: middle; }
</style>
