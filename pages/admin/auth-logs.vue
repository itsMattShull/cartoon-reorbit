<template>
  <div class="p-6 space-y-4">
    <Nav />

    <div>
      <h1 class="text-2xl font-bold mb-4 mt-16">Auth Logs</h1>

      <!-- Tabs (Duplicate first) -->
      <div class="flex space-x-4 border-b border-gray-300 mb-6">
        <button
          @click="activeTab = 'Duplicates'"
          :class="activeTab === 'Duplicates'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-500 hover:text-gray-700'"
          class="pb-2 px-1 text-sm font-medium"
        >
          Duplicate Users
        </button>
        <button
          @click="activeTab = 'AllLogs'"
          :class="activeTab === 'AllLogs'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-500 hover:text-gray-700'"
          class="pb-2 px-1 text-sm font-medium"
        >
          All Logs
        </button>
      </div>

      <!-- Duplicate Users Tab -->
      <div v-if="activeTab === 'Duplicates'">
        <div v-if="duplicateGroups.length" class="space-y-6">
          <div
            v-for="group in duplicateGroups"
            :key="group.ip"
            class="p-4 border rounded shadow bg-white"
          >
            <h2 class="font-semibold mb-2">IP: {{ group.ip }}</h2>
            <ul class="space-y-1">
              <li
                v-for="alias in group.aliases"
                :key="alias.username"
                class="flex justify-between p-2 bg-gray-50 rounded"
              >
                <span class="font-medium">{{ alias.username }}</span>
                <span class="text-sm">{{ formatDate(alias.lastLogin, true) }}</span>
              </li>
            </ul>
          </div>
        </div>
        <div v-else class="text-gray-500">
          No duplicate users found.
        </div>
      </div>

      <!-- All Logs Tab -->
      <div v-else>
        <!-- Search bar -->
        <div class="mb-4">
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Search by username…"
            class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <!-- Card view for small/medium devices -->
        <div class="lg:hidden space-y-4">
          <div
            v-for="log in filteredLogs"
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
            <p v-if="isSuspicious(log.ip)" class="mt-2 text-sm">
              <strong>Other Usernames:</strong>
              {{ otherUsernames(log.ip, log.user.username).join(', ') }}
            </p>
          </div>
        </div>

        <!-- Table view for large+ devices -->
        <div class="hidden lg:block">
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
                v-for="log in filteredLogs"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})

const logs            = ref([])
const duplicateGroups = ref([])
const activeTab       = ref('Duplicates')
const searchTerm      = ref('')

// pagination-free fetch for duplicates
async function fetchDuplicateGroups() {
  const res = await fetch('/api/admin/duplicate-users', {
    credentials: 'include'
  })
  if (!res.ok) return
  const { groups } = await res.json()
  duplicateGroups.value = groups
}

// original paginated fetch for all logs
async function fetchAllLogs() {
  let offset = 0
  while (true) {
    const res = await fetch(`/api/admin/auth-logs?offset=${offset}`, {
      credentials: 'include'
    })
    if (!res.ok) break
    const { logs: page } = await res.json()
    if (!page.length) break
    logs.value.push(...page)
    offset += page.length
  }
}

// filtered list for the All Logs tab
const filteredLogs = computed(() =>
  logs.value.filter(l =>
    (l.user?.username ?? '')
      .toLowerCase()
      .includes(searchTerm.value.toLowerCase())
  )
)

// helpers to flag & list duplicates in All Logs tab
function isSuspicious(ip) {
  const users = logs.value
    .filter(l => l.ip === ip && !l.user.isAdmin)
    .map(l => l.user.username || '__null__')
  return new Set(users).size > 1
}
function otherUsernames(ip, current) {
  const users = logs.value
    .filter(l => l.ip === ip && !l.user.isAdmin)
    .map(l => l.user.username || '__null__')
  return Array.from(new Set(users)).filter(u => u !== (current || '__null__'))
}

// date formatting
function formatDate(input, withTime = false) {
  const d = new Date(input)
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined
  })
}

onMounted(() => {
  fetchDuplicateGroups()
  fetchAllLogs()
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
