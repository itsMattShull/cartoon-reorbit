<template>
  <div class="p-6 space-y-4">
    <Nav />
    <div class="mt-16">
      <h1 class="mt-16 text-2xl font-bold">Auth Logs</h1>

      <!-- Card view for small/medium devices -->
      <div class="lg:hidden space-y-4 mt-8">
        <div
          v-for="log in logs"
          :key="log.id"
          :class="[
            'p-4 border rounded shadow',
            isSuspicious(log.ip) ? 'bg-yellow-100' : 'bg-white'
          ]"
        >
          <p><strong>Login Time:</strong> {{ formatDate(log.createdAt, true) }}</p>
          <p><strong>Username:</strong> {{ log.user.username || '—' }}</p>
          <p><strong>User Created:</strong> {{ formatDate(log.user.createdAt) }}</p>
          <p><strong>Discord Username:</strong> {{ log.user.discordTag || '—' }}</p>
          <p><strong>Discord Account Created:</strong> {{ formatDate(log.user.discordCreatedAt) }}</p>
          <p><strong>IP Address:</strong> {{ log.ip }}</p>
        </div>
      </div>

      <!-- Table view for large+ devices -->
      <div class="hidden lg:block mt-8">
        <table class="min-w-full border border-gray-300 text-sm">
          <thead class="bg-gray-100 text-left">
            <tr>
              <th class="p-2 border-b">Login Time</th>
              <th class="p-2 border-b">Username</th>
              <th class="p-2 border-b">User Created</th>
              <th class="p-2 border-b">Discord Username</th>
              <th class="p-2 border-b">Discord Account Created</th>
              <th class="p-2 border-b">IP Address</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in logs"
              :key="log.id"
              :class="isSuspicious(log.ip) ? 'bg-yellow-100' : ''"
            >
              <td class="p-2 border-b">{{ formatDate(log.createdAt, true) }}</td>
              <td class="p-2 border-b">{{ log.user.username || '—' }}</td>
              <td class="p-2 border-b">{{ formatDate(log.user.createdAt) }}</td>
              <td class="p-2 border-b">{{ log.user.discordTag || '—' }}</td>
              <td class="p-2 border-b">{{ formatDate(log.user.discordCreatedAt) }}</td>
              <td class="p-2 border-b">{{ log.ip }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Infinite scroll trigger -->
      <div ref="loadTrigger" class="h-8"></div>
    </div>
  </div>
</template>


<script setup>
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})
import { ref, onMounted, onBeforeUnmount } from 'vue'

const logs = ref([])
const ipMap = ref({})
const offset = ref(0)
const hasMore = ref(true)
const loadTrigger = ref(null)
let observer

async function fetchLogs() {
  if (!hasMore.value) return
  const res = await fetch(`/api/admin/auth-logs?offset=${offset.value}`)
  const data = await res.json()

  logs.value.push(...data.logs)
  offset.value += data.logs.length
  hasMore.value = data.logs.length > 0

  // Track IP -> usernames
  for (const log of data.logs) {
    const ip = log.ip
    const username = log.user.username || '__null__'
    if (!ipMap.value[ip]) {
      ipMap.value[ip] = new Set()
    }
    ipMap.value[ip].add(username)
  }
}

function isSuspicious(ip) {
  const usernames = ipMap.value[ip]
  return usernames && usernames.size > 1
}

function formatDate(str, withTime = false) {
  const d = new Date(str)
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined
  })
}

function setupObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore.value) {
      fetchLogs()
    }
  })

  if (loadTrigger.value) {
    observer.observe(loadTrigger.value)
  }
}

onMounted(async () => {
  await fetchLogs()    // wait for offset to be updated
  setupObserver()      // now the observer only ever fires on *subsequent* scrolls
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
})
</script>
