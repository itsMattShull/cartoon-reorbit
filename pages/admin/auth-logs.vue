<template>
  <div class="p-6 space-y-4">
    <Nav />

    <div>
      <h1 class="text-2xl font-bold mb-4 mt-16">Auth Logs</h1>

      <!-- Tabs -->
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
            <div class="flex items-center justify-between mb-2">
              <h2 class="font-semibold">IP: {{ group.ip }}</h2>
              <span class="text-xs text-gray-500">{{ group.aliases.length }} accounts</span>
            </div>

            <ul class="space-y-1">
              <li
                v-for="alias in group.aliases"
                :key="alias.username"
                class="flex items-center justify-between gap-3 p-2 bg-gray-50 rounded"
              >
                <div class="min-w-0">
                  <div class="font-medium truncate">
                    {{ alias.username }}
                    <span class="ml-2 text-xs text-gray-600">• {{ alias.points ?? 0 }} pts</span>
                  </div>
                  <div class="text-xs text-gray-500">Last login: {{ formatDate(alias.lastLogin, true) }}</div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    v-if="alias.isKnown && otherKnownAliasesInGroup(group.aliases, alias.username).length"
                    class="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                    @click="openCheatSummary(alias.username, otherKnownAliasesInGroup(group.aliases, alias.username))"
                    title="Run check-cheating with this user as Target and the others as Sources"
                  >
                    Cheat Check
                  </button>
                </div>
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

        <!-- Card view (small/medium) -->
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
              {{ otherKnownUsernames(log.ip, log.user.username).join(', ') }}
            </p>

            <div class="mt-3">
              <button
                class="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                @click="openCheatSummary(log.user.username, otherKnownUsernames(log.ip, log.user.username))"
                :disabled="!isKnown(log.user.username) || otherKnownUsernames(log.ip, log.user.username).length === 0"
              >
                Cheat Check
              </button>
            </div>
          </div>
        </div>

        <!-- Table view (large+) -->
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
                <th class="p-2 border-b">Actions</th>
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
                    {{ otherKnownUsernames(log.ip, log.user.username).join(', ') }}
                  </span>
                  <span v-else>—</span>
                </td>
                <td class="p-2 border-b">
                  <button
                    class="px-2 py-1 border rounded hover:bg-gray-100"
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

      <!-- Cheat summary modal -->
      <teleport to="body">
        <div
          v-if="showCheatModal"
          class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        >
          <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-auto">
            <div class="flex items-start justify-between">
              <h3 class="text-lg font-semibold">Cheating Summary</h3>
              <button class="text-gray-500" @click="closeCheatModal">✕</button>
            </div>

            <div class="mt-2 text-sm text-gray-600">
              <div><strong>Target:</strong> {{ previewTarget }}</div>
              <div><strong>Sources:</strong> {{ previewSources.join(', ') || '—' }}</div>
            </div>

            <div v-if="previewLoading" class="mt-4 text-sm text-gray-500">Loading…</div>
            <div v-else-if="previewError" class="mt-4 text-sm text-red-600">{{ previewError }}</div>

            <div v-else-if="preview" class="mt-4 space-y-3">
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div class="p-3 border rounded bg-gray-50">
                  <div class="font-medium">Seed items</div>
                  <div class="text-lg">{{ preview.seedCount }}</div>
                </div>
                <div class="p-3 border rounded bg-gray-50">
                  <div class="font-medium">Currently owned by target</div>
                  <div class="text-lg">{{ preview.currentOwnedCount }}</div>
                </div>
                <div class="p-3 border rounded bg-gray-50">
                  <div class="font-medium">Auction points received</div>
                  <div class="text-lg">{{ preview.auctionPoints }}</div>
                </div>
                <div class="p-3 border rounded bg-gray-50">
                  <div class="font-medium">Trade value received</div>
                  <div class="text-lg">{{ preview.tradeValue }}</div>
                </div>
              </div>

              <div>
                <h4 class="font-medium mb-1">By source</h4>
                <div
                  v-if="preview.bySource && Object.keys(preview.bySource).length"
                  class="space-y-2 text-sm"
                >
                  <div
                    v-for="(row, name) in preview.bySource"
                    :key="name"
                    class="flex justify-between bg-gray-50 p-2 rounded border"
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
                <div v-else class="text-sm text-gray-500">No breakdown.</div>
              </div>
            </div>

            <div class="mt-5 text-right">
              <button class="px-4 py-2 border rounded" @click="closeCheatModal">Close</button>
            </div>
          </div>
        </div>
      </teleport>
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

// known users + points
const usersLoaded     = ref(false)
const pointsByName    = ref(new Map())
const knownUsernames  = ref(new Set())

async function ensureUsersLoaded () {
  if (usersLoaded.value) return
  const res = await fetch('/api/admin/users', { credentials: 'include' })
  if (!res.ok) return
  const users = await res.json()
  const map = new Map()
  const set = new Set()
  for (const u of users || []) {
    if (u?.username) {
      set.add(u.username)
      map.set(u.username, Number(u.points || 0))
    }
  }
  knownUsernames.value = set
  pointsByName.value   = map
  usersLoaded.value    = true
}

const isKnown = (name) => knownUsernames.value.has(name)

// Cheat summary modal state
const showCheatModal  = ref(false)
const previewLoading  = ref(false)
const previewError    = ref('')
const preview         = ref(null) // payload from /api/admin/check-cheating
const previewTarget   = ref('')
const previewSources  = ref([])

// ---- Fetchers ----
async function fetchDuplicateGroups() {
  await ensureUsersLoaded()

  const res = await fetch('/api/admin/duplicate-users', { credentials: 'include' })
  if (!res.ok) return
  const { groups } = await res.json()

  // attach points + isKnown, sort by points desc then lastLogin desc
  duplicateGroups.value = (groups || []).map(g => {
    const aliases = (g.aliases || [])
      .map(a => ({
        ...a,
        isKnown: isKnown(a.username),
        points: pointsByName.value.get(a.username) ?? 0
      }))
      .sort((a, b) => {
        if ((b.points ?? 0) !== (a.points ?? 0)) return (b.points ?? 0) - (a.points ?? 0)
        return new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime()
      })
    return { ...g, aliases }
  })
}

async function fetchAllLogs() {
  let offset = 0
  while (true) {
    const res = await fetch(`/api/admin/auth-logs?offset=${offset}`, { credentials: 'include' })
    if (!res.ok) break
    const { logs: page } = await res.json()
    if (!page.length) break
    logs.value.push(...page)
    offset += page.length
  }
}

// ---- Filtering / helpers ----
const filteredLogs = computed(() =>
  logs.value.filter(l =>
    (l.user?.username ?? '')
      .toLowerCase()
      .includes(searchTerm.value.toLowerCase())
  )
)

function isSuspicious(ip) {
  const users = logs.value
    .filter(l => l.ip === ip && !l.user.isAdmin)
    .map(l => l.user.username || '__null__')
  return new Set(users).size > 1
}

// Known-only helpers
function otherKnownUsernames(ip, current) {
  const uniq = new Set(
    logs.value
      .filter(l => l.ip === ip && !l.user.isAdmin)
      .map(l => l.user.username || '__null__')
  )
  uniq.delete(current || '__null__')
  return Array.from(uniq).filter(u => isKnown(u))
}

function otherKnownAliasesInGroup(aliases, currentName) {
  return (aliases || [])
    .filter(a => a.username && a.username !== currentName && a.isKnown)
    .map(a => a.username)
}

// ---- Date formatting ----
function formatDate(input, withTime = false) {
  const d = new Date(input)
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined
  })
}

// ---- Cheat summary actions ----
async function openCheatSummary(target, sources) {
  // normalize & enforce known-only
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
  fetchDuplicateGroups()
  fetchAllLogs()
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
