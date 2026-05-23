<template>
  <div class="admin-achievement-logs bg-gray-50">
    <div class="p-2 text-xs">
      <div class="flex items-center justify-between mb-2">
        <h1 class="text-base font-bold">Achievement Logs</h1>
        <div class="text-[11px] text-gray-500">Showing {{ showingRange }}</div>
      </div>

      <div class="bg-white rounded shadow p-2">
        <div v-if="loading" class="text-gray-500">Loading…</div>
        <div v-else-if="logs.length === 0" class="text-gray-500">No logs found.</div>
        <div v-else>
          <!-- Desktop table -->
          <div class="hidden lg:block overflow-auto">
            <table class="min-w-full w-full border rounded text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Achieved At (CDT)</th>
                  <th class="px-1.5 py-1 border-b">User</th>
                  <th class="px-1.5 py-1 border-b">Achievement</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in logs" :key="log.id" class="border-b">
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(log.achievedAt) }}</td>
                  <td class="px-1.5 py-1">
                    <div class="font-medium">{{ displayUser(log.user) }}</div>
                    <div class="text-[10px] text-gray-500">{{ log.user?.id || '—' }}</div>
                  </td>
                  <td class="px-1.5 py-1">
                    <div class="font-medium">{{ log.achievement?.title || '—' }}</div>
                    <div class="text-[10px] text-gray-500">{{ log.achievement?.slug || log.achievement?.id || '—' }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="lg:hidden space-y-2">
            <div v-for="log in logs" :key="log.id" class="border rounded bg-white p-2 text-[11px]">
              <div class="flex items-center justify-between text-[10px] text-gray-500">
                <span>{{ formatDate(log.achievedAt) }}</span>
                <span>{{ log.achievement?.slug || '—' }}</span>
              </div>
              <div class="mt-1">
                <div class="font-semibold">{{ log.achievement?.title || '—' }}</div>
                <div class="text-[10px] text-gray-500">{{ log.achievement?.id || '—' }}</div>
              </div>
              <div class="mt-1.5">
                <div class="font-medium">{{ displayUser(log.user) }}</div>
                <div class="text-[10px] text-gray-500">{{ log.user?.id || '—' }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between">
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

const logs = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = 100

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0–0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}–${end} of ${total.value}`
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

function displayUser(user) {
  return user?.username || user?.discordTag || user?.id || '—'
}

async function fetchLogs() {
  loading.value = true
  try {
    const res = await $fetch('/api/admin/achievement-logs', {
      query: { page: String(page.value) }
    })
    logs.value = res.items || []
    total.value = res.total || 0
  } catch (e) {
    console.error('Failed to load achievement logs', e)
    logs.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
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

onMounted(fetchLogs)
</script>

<style scoped>
.admin-achievement-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
