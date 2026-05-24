<template>
  <div class="admin-auth-logs bg-gray-50">
    <div class="p-2 space-y-2 text-xs">
      <h1 class="text-base font-bold mb-2">Auth Logs</h1>

      <div>
        <!-- Search bar -->
        <div class="mb-2">
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Search by username…"
            class="w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div v-if="logsLoading" class="text-gray-500">Loading...</div>
        <div v-else-if="filteredLogs.length === 0" class="text-gray-500">No logs found.</div>
        <div v-else>
          <!-- Card view (small/medium) -->
          <div class="lg:hidden space-y-2">
            <div
              v-for="log in filteredLogs"
              :key="log.id"
              :class="[
                'p-2 border rounded shadow text-[11px] space-y-0.5',
                isSuspicious(log.ip) ? 'bg-yellow-100' : 'bg-white'
              ]"
            >
              <p><strong>Login Time:</strong> {{ formatDate(log.createdAt, true) }}</p>
              <p><strong>Username:</strong> {{ log.user.username || '—' }}</p>
              <p><strong>User Created:</strong> {{ formatDate(log.user.createdAt) }}</p>
              <p><strong>Discord Username:</strong> {{ log.user.discordTag || '—' }}</p>
              <p><strong>Discord Created:</strong> {{ formatDate(log.user.discordCreatedAt) }}</p>
              <p><strong>IP:</strong> {{ log.ip }}</p>
              <p v-if="isSuspicious(log.ip)" class="mt-1">
                <strong>Other Usernames:</strong>
                {{ otherKnownUsernames(log.ip, log.user.username).join(', ') }}
              </p>

              <div class="mt-1">
                <button
                  class="px-2 py-0.5 text-[11px] border rounded hover:bg-gray-100"
                  @click="openCheatSummary(log.user.username, otherKnownUsernames(log.ip, log.user.username))"
                  :disabled="!isKnown(log.user.username) || otherKnownUsernames(log.ip, log.user.username).length === 0"
                >
                  Cheat Check
                </button>
              </div>
            </div>
          </div>

          <!-- Table view (large+) -->
          <div class="hidden lg:block overflow-x-auto">
            <table class="min-w-full border border-gray-300 text-[11px]">
              <thead class="bg-gray-100 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Login Time</th>
                  <th class="px-1.5 py-1 border-b">Username</th>
                  <th class="px-1.5 py-1 border-b">User Created</th>
                  <th class="px-1.5 py-1 border-b">Discord Username</th>
                  <th class="px-1.5 py-1 border-b">Discord Created</th>
                  <th class="px-1.5 py-1 border-b">IP</th>
                  <th class="px-1.5 py-1 border-b">Other Usernames</th>
                  <th class="px-1.5 py-1 border-b"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="log in filteredLogs"
                  :key="log.id"
                  :class="isSuspicious(log.ip) ? 'bg-yellow-100' : ''"
                >
                  <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ formatDate(log.createdAt, true) }}</td>
                  <td class="px-1.5 py-1 border-b">{{ log.user.username || '—' }}</td>
                  <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ formatDate(log.user.createdAt) }}</td>
                  <td class="px-1.5 py-1 border-b">{{ log.user.discordTag || '—' }}</td>
                  <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ formatDate(log.user.discordCreatedAt) }}</td>
                  <td class="px-1.5 py-1 border-b">{{ log.ip }}</td>
                  <td class="px-1.5 py-1 border-b">
                    <span v-if="isSuspicious(log.ip)">
                      {{ otherKnownUsernames(log.ip, log.user.username).join(', ') }}
                    </span>
                    <span v-else>—</span>
                  </td>
                  <td class="px-1.5 py-1 border-b">
                    <button
                      class="px-2 py-0.5 text-[11px] border rounded hover:bg-gray-100"
                      @click="openCheatSummary(log.user.username, otherKnownUsernames(log.ip, log.user.username))"
                      :disabled="!isKnown(log.user.username) || otherKnownUsernames(log.ip, log.user.username).length === 0"
                    >
                      Cheat Check
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-2 flex items-center justify-between">
          <div class="text-[11px] text-gray-600">
            Page {{ logsPage }} of {{ logsTotalPages }} - Showing {{ logsShowingRange }}
          </div>
          <div class="space-x-1">
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="logsPage <= 1" @click="prevLogsPage">Prev</button>
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="logsPage >= logsTotalPages" @click="nextLogsPage">Next</button>
          </div>
        </div>
      </div>

      <!-- Cheat summary modal -->
      <teleport to="body">
        <div
          v-if="showCheatModal"
          class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3"
        >
          <div class="bg-white rounded-lg shadow-xl w-full max-w-xl p-3 max-h-[85vh] overflow-auto text-xs">
            <div class="flex items-start justify-between">
              <h3 class="text-sm font-semibold">Cheating Summary</h3>
              <button class="text-gray-500" @click="closeCheatModal">✕</button>
            </div>

            <div class="mt-1 text-gray-600">
              <div><strong>Target:</strong> {{ previewTarget }}</div>
              <div><strong>Sources:</strong> {{ previewSources.join(', ') || '—' }}</div>
            </div>

            <div v-if="previewLoading" class="mt-2 text-gray-500">Loading…</div>
            <div v-else-if="previewError" class="mt-2 text-red-600">{{ previewError }}</div>

            <div v-else-if="preview" class="mt-2 space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <div class="p-2 border rounded bg-gray-50">
                  <div class="font-medium">Seed items</div>
                  <div class="text-sm">{{ preview.seedCount }}</div>
                </div>
                <div class="p-2 border rounded bg-gray-50">
                  <div class="font-medium">Currently owned by target</div>
                  <div class="text-sm">{{ preview.currentOwnedCount }}</div>
                </div>
                <div class="p-2 border rounded bg-gray-50">
                  <div class="font-medium">Auction points received</div>
                  <div class="text-sm">{{ preview.auctionPoints }}</div>
                </div>
                <div class="p-2 border rounded bg-gray-50">
                  <div class="font-medium">Trade value received</div>
                  <div class="text-sm">{{ preview.tradeValue }}</div>
                </div>
              </div>

              <div>
                <h4 class="font-medium mb-1">By source</h4>
                <div
                  v-if="preview.bySource && Object.keys(preview.bySource).length"
                  class="space-y-1"
                >
                  <div
                    v-for="(row, name) in preview.bySource"
                    :key="name"
                    class="flex justify-between bg-gray-50 p-1.5 rounded border"
                  >
                    <div class="font-medium">{{ name }}</div>
                    <div class="text-right">
                      <div>Seed: {{ row.seedCount }}</div>
                      <div>Owned by target: {{ row.currentOwnedCount }}</div>
                      <div>Auction pts: {{ row.auctionPoints }}</div>
                      <div>Trade value: {{ row.tradeValue }}</div>
                    </div>
                  </div>
                </div>
                <div v-else class="text-gray-500">No breakdown.</div>
              </div>
            </div>

            <div class="mt-3 text-right">
              <button class="px-3 py-1 border rounded text-[11px]" @click="closeCheatModal">Close</button>
            </div>
          </div>
        </div>
      </teleport>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const logs             = ref([])
const logsTotal        = ref(0)
const logsPage         = ref(1)
const logsLoading      = ref(false)
const logsPageSize     = 100
const searchTerm       = ref('')

const usersLoaded     = ref(false)
const knownUsernames  = ref(new Set())

async function ensureUsersLoaded () {
  if (usersLoaded.value) return
  const res = await fetch('/api/admin/users', { credentials: 'include' })
  if (!res.ok) return
  const users = await res.json()
  const set = new Set()
  for (const u of users || []) {
    if (u?.username) set.add(u.username)
  }
  knownUsernames.value = set
  usersLoaded.value    = true
}

const isKnown = (name) => knownUsernames.value.has(name)

const showCheatModal  = ref(false)
const previewLoading  = ref(false)
const previewError    = ref('')
const preview         = ref(null)
const previewTarget   = ref('')
const previewSources  = ref([])

async function fetchAllLogs() {
  logsLoading.value = true
  try {
    const params = new URLSearchParams({
      page: String(logsPage.value),
      limit: String(logsPageSize)
    })
    const term = searchTerm.value.trim()
    if (term) params.set('username', term)

    const res = await fetch(`/api/admin/auth-logs?${params.toString()}`, { credentials: 'include' })
    if (!res.ok) {
      logs.value = []
      logsTotal.value = 0
      return
    }
    const { items, total, page } = await res.json()
    logs.value = items || []
    logsTotal.value = total || 0
    if (page) logsPage.value = page
  } finally {
    logsLoading.value = false
  }
}

const filteredLogs = computed(() =>
  logs.value.filter(l =>
    (l.user?.username ?? '')
      .toLowerCase()
      .includes(searchTerm.value.toLowerCase())
  )
)

const logsTotalPages = computed(() => Math.max(1, Math.ceil(logsTotal.value / logsPageSize)))

const logsShowingRange = computed(() => {
  if (!logsTotal.value) return '0-0 of 0'
  const start = (logsPage.value - 1) * logsPageSize + 1
  const end = Math.min(logsPage.value * logsPageSize, logsTotal.value)
  return `${start}-${end} of ${logsTotal.value}`
})

function isSuspicious(ip) {
  const users = logs.value
    .filter(l => l.ip === ip && !l.user.isAdmin)
    .map(l => l.user.username || '__null__')
  return new Set(users).size > 1
}

function otherKnownUsernames(ip, current) {
  const uniq = new Set(
    logs.value
      .filter(l => l.ip === ip && !l.user.isAdmin)
      .map(l => l.user.username || '__null__')
  )
  uniq.delete(current || '__null__')
  return Array.from(uniq).filter(u => isKnown(u))
}

async function nextLogsPage() {
  if (logsPage.value >= logsTotalPages.value) return
  logsPage.value += 1
  await fetchAllLogs()
}

async function prevLogsPage() {
  if (logsPage.value <= 1) return
  logsPage.value -= 1
  await fetchAllLogs()
}

function formatDate(input, withTime = false) {
  const d = new Date(input)
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined
  })
}

async function openCheatSummary(target, sources) {
  const t = target || ''
  const s = Array.isArray(sources) ? sources.filter(isKnown) : []

  previewTarget.value  = t
  previewSources.value = s
  previewLoading.value = true
  previewError.value   = ''
  preview.value        = null
  showCheatModal.value = true

  if (!t || !isKnown(t)) {
    previewLoading.value = false
    previewError.value = 'Target username is unknown.'
    return
  }
  if (!s.length) {
    previewLoading.value = false
    previewError.value = 'Need at least one known source username from the same IP.'
    return
  }

  try {
    const res = await fetch('/api/admin/check-cheating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ target: t, sources: s })
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.statusMessage || `HTTP ${res.status}`)
    }
    preview.value = await res.json()
  } catch (err) {
    previewError.value = err.message || 'Failed to load summary.'
  } finally {
    previewLoading.value = false
  }
}

function closeCheatModal() {
  showCheatModal.value = false
}

onMounted(() => {
  ensureUsersLoaded()
  fetchAllLogs()
})

let searchDebounceId = null
watch(searchTerm, () => {
  if (searchDebounceId) clearTimeout(searchDebounceId)
  searchDebounceId = setTimeout(() => {
    logsPage.value = 1
    fetchAllLogs()
  }, 300)
})
</script>

<style scoped>
.admin-auth-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}

th, td { vertical-align: middle; }
</style>
