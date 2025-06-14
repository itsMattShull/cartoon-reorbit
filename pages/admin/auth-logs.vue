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
          <p
            v-if="isSuspicious(log.ip)"
            class="mt-2 text-sm"
          >
            <strong>Other Usernames:</strong>
            {{ otherUsernames(log.ip, log.user.username).join(', ') }}
          </p>
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
              <th class="p-2 border-b">Other Usernames</th>
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
              <td class="p-2 border-b">
                <span v-if="isSuspicious(log.ip)">
                  {{ otherUsernames(log.ip, log.user.username).join(', ') }}
                </span>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const logs = ref([])
const ipMap = ref({})

async function fetchAllLogs() {
  let offset = 0
  while (true) {
    const res = await fetch(`/api/admin/auth-logs?offset=${offset}`)
    const { logs: page } = await res.json()
    if (!page.length) break
    logs.value.push(...page)
    offset += page.length

    // Populate IP -> usernames map
    for (const log of page) {
      const ip = log.ip
      const username = log.user.username || '__null__'
      if (!ipMap.value[ip]) ipMap.value[ip] = new Set()
      ipMap.value[ip].add(username)
    }
  }
}

function isSuspicious(ip) {
  const users = ipMap.value[ip]
  return users && users.size > 1
}

function otherUsernames(ip, current) {
  const users = ipMap.value[ip] || new Set()
  return Array.from(users).filter(u => u !== (current || '__null__'))
}

function formatDate(str, withTime = false) {
  const d = new Date(str)
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined
  })
}

onMounted(fetchAllLogs)
</script>
