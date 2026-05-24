<template>
  <div class="admin-cheat-finder bg-gray-50">
    <div class="p-2 text-xs">
      <h1 class="text-base font-bold mb-2">Cheat Finder</h1>

      <!-- Tabs -->
      <div class="flex space-x-3 border-b border-gray-300 mb-2 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="activeTab === tab.id
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'text-gray-500 hover:text-gray-700'"
          class="pb-1 px-1 text-xs font-medium whitespace-nowrap"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Duplicate IPs tab -->
      <div v-if="activeTab === 'duplicateIps'">
      <div class="mb-2">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Search usernames…"
          class="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div v-if="loading" class="text-gray-500">Loading…</div>
      <div v-else-if="groups.length === 0" class="text-gray-500">No IPs with multiple users found.</div>

      <div v-else class="space-y-2">
        <div
          v-for="group in groups"
          :key="group.ip"
          class="bg-white border rounded shadow p-2"
        >
          <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <div class="flex items-baseline gap-2 min-w-0">
              <h2 class="font-mono font-semibold text-xs shrink-0">{{ group.ip }}</h2>
              <span class="text-[10px] text-gray-500 truncate">{{ whoisDisplay(group.ip) }}</span>
            </div>
            <span class="text-[10px] text-gray-500 shrink-0">{{ group.aliases.length }} accounts</span>
          </div>

          <!-- Desktop table -->
          <div class="hidden md:block overflow-x-auto">
            <table class="min-w-full text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Username</th>
                  <th class="px-1.5 py-1 border-b">Joined</th>
                  <th class="px-1.5 py-1 border-b">Discord Username</th>
                  <th class="px-1.5 py-1 border-b">Discord Account Created</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="alias in group.aliases" :key="alias.username" class="border-b last:border-b-0">
                  <td class="px-1.5 py-1 font-medium">{{ alias.username }}</td>
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(alias.joined) }}</td>
                  <td class="px-1.5 py-1">{{ alias.discordTag || '—' }}</td>
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(alias.discordCreatedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="md:hidden space-y-1.5">
            <div
              v-for="alias in group.aliases"
              :key="alias.username"
              class="border rounded p-1.5 bg-gray-50"
            >
              <div class="font-medium text-[11px]">{{ alias.username }}</div>
              <div class="mt-0.5 grid grid-cols-1 gap-0.5 text-[10px] text-gray-700">
                <div><span class="text-gray-500">Joined:</span> {{ formatDate(alias.joined) }}</div>
                <div><span class="text-gray-500">Discord:</span> {{ alias.discordTag || '—' }}</div>
                <div><span class="text-gray-500">Discord Created:</span> {{ formatDate(alias.discordCreatedAt) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && total > 0" class="mt-3 flex items-center justify-between">
        <div class="text-[11px] text-gray-600">
          Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
        </div>
        <div class="space-x-1">
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page <= 1" @click="prevPage">Prev</button>
          <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page >= totalPages" @click="nextPage">Next</button>
        </div>
      </div>
      </div>

      <!-- Placeholder tabs -->
      <div v-else class="text-gray-500 py-8 text-center">
        Placeholder
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const tabs = [
  { id: 'duplicateIps', label: 'Duplicate IPs' },
  { id: 'placeholder-1', label: 'Placeholder' },
  { id: 'placeholder-2', label: 'Placeholder' },
  { id: 'placeholder-3', label: 'Placeholder' },
  { id: 'placeholder-4', label: 'Placeholder' },
  { id: 'placeholder-5', label: 'Placeholder' }
]
const activeTab = ref('duplicateIps')

const groups = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)
const searchTerm = ref('')
const whoisByIp = ref({})

function whoisDisplay(ip) {
  const w = whoisByIp.value[ip]
  if (!w) return ''
  if (w.error) return `(${w.error})`
  const place = [w.city, w.region, w.country].filter(Boolean).join(', ')
  const parts = []
  if (w.isp) parts.push(w.isp)
  if (place) parts.push(place)
  return parts.join(' · ')
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function fetchGroups() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(pageSize)
    })
    const term = searchTerm.value.trim()
    if (term) params.set('username', term)

    const res = await fetch(`/api/admin/duplicate-users?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) {
      groups.value = []
      total.value = 0
      return
    }
    const data = await res.json()
    groups.value = data.groups || []
    total.value = data.total || 0
    if (data.page) page.value = data.page
    fetchWhois()
  } catch (e) {
    console.error('Failed to load duplicate users', e)
    groups.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function fetchWhois() {
  // Only look up IPs not already cached client-side
  const missing = groups.value
    .map(g => g.ip)
    .filter(ip => ip && !whoisByIp.value[ip])
  if (!missing.length) return
  try {
    const params = new URLSearchParams({ ips: missing.join(',') })
    const res = await fetch(`/api/admin/ip-whois?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    whoisByIp.value = { ...whoisByIp.value, ...data }
  } catch (e) {
    console.error('Failed to load IP whois', e)
  }
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchGroups()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchGroups()
}

let searchDebounceId = null
watch(searchTerm, () => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  searchDebounceId = setTimeout(() => {
    page.value = 1
    fetchGroups()
  }, 300)
})

onMounted(fetchGroups)
</script>

<style scoped>
.admin-cheat-finder {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
