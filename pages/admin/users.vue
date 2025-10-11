<template>
  <Nav />

  <div class="mt-16 max-w-7xl mx-auto px-4 py-6">
    <!-- Controls -->
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
      <div class="flex items-center gap-2 w-full md:w-auto">
        <input
          v-model="filter"
          type="text"
          placeholder="Search username or Discord tag"
          class="w-full md:w-80 border rounded-md px-3 py-2"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select v-model="statusFilter" class="px-3 py-1 text-sm border rounded-md">
          <option value="all">All users</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>

        <button @click="toggle('onlyGuild')" :class="chip(onlyGuild)">In Discord</button>
        <button @click="toggle('onlyWarned')" :class="chip(onlyWarned)">Warned</button>

        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-600">Sort:</label>
          <select v-model="sortDir" class="px-3 py-1 text-sm border rounded-md">
            <option value="desc">Last activity • Newest</option>
            <option value="asc">Last activity • Oldest</option>
          </select>
        </div>

        <button @click="resetFilters" class="px-3 py-1 text-sm border rounded-md">Reset</button>
      </div>
    </div>

    <!-- Unified Card Grid (mobile and desktop) -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <article
        v-for="u in filteredSorted"
        :key="u.id"
        class="bg-white border rounded-lg shadow p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-semibold text-base leading-tight">{{ u.username || '—' }}</div>
            <div class="text-xs text-gray-500">{{ u.discordTag || 'No tag' }}</div>
          </div>
          <div class="flex items-center gap-2">
            <span :class="badgeClass(!!u.inGuild)">{{ u.inGuild ? 'Guild' : 'No guild' }}</span>
            <span :class="badgeClass(!!u.active)">{{ u.active ? 'Active' : 'Disabled' }}</span>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-gray-500 text-xs">Unique cToons</div>
            <div class="font-medium tabular-nums">{{ u.uniqueCtoons ?? 0 }}</div>
          </div>
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-gray-500 text-xs">Total cToons</div>
            <div class="font-medium tabular-nums">{{ u.totalCtoons ?? 0 }}</div>
          </div>
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-gray-500 text-xs">Total Points</div>
            <div class="font-medium tabular-nums">{{ u.points ?? 0 }}</div>
          </div>
        </div>

        <div class="mt-3 text-xs text-gray-600 space-y-1">
          <div><span class="text-gray-500">Joined:</span> {{ formatDate(u.joined) }} • {{ rel(u.joined) }}</div>
          <div><span class="text-gray-500">Last login:</span> {{ formatDate(u.lastLogin) }} • {{ rel(u.lastLogin) }}</div>
          <div class="flex items-center gap-2">
            <span class="text-gray-600"><span class="text-gray-500">Last activity:</span> {{ formatDate(u.lastActivity) }} • {{ rel(u.lastActivity) }}</span>
            <button class="ml-auto text-xs underline" @click="toggleSort()">Sort {{ sortDir==='desc' ? '↓' : '↑' }}</button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <span :class="warnClass(!!u.warning180,'amber')">180d</span>
          <span :class="warnClass(!!u.warning210,'amber')">210d</span>
          <span :class="warnClass(!!u.warning240,'red')">240d</span>
        </div>
      </article>

      <div v-if="!filteredSorted.length" class="col-span-full text-center text-gray-500 py-8">
        No users match your filters.
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAsyncData, useRequestHeaders } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const { data: raw, error } = await useAsyncData('admin-users', () =>
  $fetch('/api/admin/users', { headers })
)
if (error.value) throw error.value

const users = ref(raw.value || [])
const filter = ref('')

// filters
const statusFilter = ref('all') // 'all' | 'active' | 'inactive'
const onlyGuild = ref(false)
const onlyWarned = ref(false)

// sorting
const sortDir = ref('desc') // 'desc' newest first, 'asc' oldest first
function toggleSort() { sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc' }

// filtered + sorted
const filteredSorted = computed(() => {
  const q = filter.value.toLowerCase().trim()

  const candidate = users.value.filter(u => {
    const matchQ = !q || (u.username?.toLowerCase().includes(q) || u.discordTag?.toLowerCase().includes(q))
    const matchGuild = !onlyGuild.value || !!u.inGuild
    const warned = !!(u.warning180 || u.warning210 || u.warning240)
    const matchWarned = !onlyWarned.value || warned

    const statusOk =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'active' && !!u.active) ||
      (statusFilter.value === 'inactive' && !u.active)

    return matchQ && matchGuild && matchWarned && statusOk
  })

  const toTs = (d) => d ? new Date(d).getTime() : -Infinity
  const dir = sortDir.value === 'desc' ? -1 : 1

  return candidate.sort((a,b) => {
    const ta = toTs(a.lastActivity)
    const tb = toTs(b.lastActivity)
    const na = Number.isFinite(ta), nb = Number.isFinite(tb)
    if (!na && !nb) return 0
    if (!na) return 1
    if (!nb) return -1
    return (ta - tb) * dir
  })
})

const chip = (on) =>
  [
    'px-3 py-1 text-sm rounded-md border',
    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
  ].join(' ')

function toggle(key) {
  if (key === 'onlyGuild') onlyGuild.value = !onlyGuild.value
  if (key === 'onlyWarned') onlyWarned.value = !onlyWarned.value
}
function resetFilters() {
  filter.value = ''
  statusFilter.value = 'all'
  onlyGuild.value = false
  onlyWarned.value = false
  sortDir.value = 'desc'
}

// formatting helpers
const formatDate = dt => {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
const rel = dt => {
  if (!dt) return 'no data'
  const ms = Date.now() - new Date(dt).getTime()
  const d = Math.floor(ms / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 30) return `${d} days ago`
  const m = Math.floor(d / 30)
  return m === 1 ? '1 mo ago' : `${m} mos ago`
}

const badgeClass = (ok) =>
  [
    'px-2 py-0.5 rounded text-xs font-medium',
    ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  ].join(' ')

const warnClass = (on, tone = 'amber') => {
  const onCls = tone === 'red'
    ? 'bg-red-100 text-red-800 border-red-200'
    : 'bg-amber-100 text-amber-800 border-amber-200'
  return [
    'px-2 py-0.5 rounded text-xs border',
    on ? onCls : 'bg-gray-100 text-gray-700 border-gray-300'
  ].join(' ')
}
</script>

<style scoped>
.tabular-nums { font-variant-numeric: tabular-nums; }
</style>
