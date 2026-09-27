<template>
  <div class="admin-cmoon-battle-logs bg-gray-50">
    <div class="p-2 text-xs">
      <div class="bg-white rounded-lg shadow p-3">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-base font-semibold">cMoon Battle Logs</h1>
        </div>
        <p class="text-[11px] text-gray-500 mb-2">
          Every cMoon Enemy Battle, one row per attempt. Manage the enemies themselves on the
          <NuxtLink to="/newsite/admin/cMoonEnemies" class="text-indigo-600 hover:underline">Manage cMoon Enemies</NuxtLink> page.
        </p>

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
          <div class="flex items-center">
            <label for="outcomeFilter" class="mr-1 text-[11px] font-medium">Outcome</label>
            <select id="outcomeFilter" v-model="outcomeFilter" class="border rounded px-1.5 py-0.5 text-xs">
              <option value="">All</option>
              <option value="IN_PROGRESS_ONLY">In progress</option>
              <option v-for="o in outcomes" :key="o" :value="o">{{ outcomeLabel(o) }}</option>
            </select>
          </div>
          <div class="flex items-center">
            <label for="cmoonFilter" class="mr-1 text-[11px] font-medium">cMoon</label>
            <select id="cmoonFilter" v-model="cmoonFilter" class="border rounded px-1.5 py-0.5 text-xs">
              <option value="">All</option>
              <option v-for="c in cmoons" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="flex items-center">
            <label for="enemyFilter" class="mr-1 text-[11px] font-medium">Enemy</label>
            <select id="enemyFilter" v-model="enemyFilter" class="border rounded px-1.5 py-0.5 text-xs">
              <option value="">All</option>
              <option v-for="m in enemyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>
        </div>

        <div class="mb-2 text-[11px] text-gray-600">
          Total Results: {{ total }} battles
        </div>

        <div v-if="loading" class="text-center py-2">Loading…</div>
        <div v-else-if="logs.length === 0" class="text-center py-2 text-gray-500">No battles found.</div>
        <div v-else>
          <!-- TABLE VIEW (desktop) -->
          <div class="overflow-x-auto hidden sm:block">
            <table class="min-w-full table-auto border-collapse text-[11px]">
              <thead>
                <tr class="bg-gray-100">
                  <th class="px-1.5 py-1 text-left">User</th>
                  <th class="px-1.5 py-1 text-left">cMoon</th>
                  <th class="px-1.5 py-1 text-left">Enemy</th>
                  <th class="px-1.5 py-1 text-left">Result</th>
                  <th class="px-1.5 py-1 text-right">Rounds</th>
                  <th class="px-1.5 py-1 text-right">Points</th>
                  <th class="px-1.5 py-1 text-left">Prizes</th>
                  <th class="px-1.5 py-1 text-left">Started (CDT)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in logs" :key="log.id" class="border-b hover:bg-gray-50">
                  <td class="px-1.5 py-1">{{ log.username ?? '—' }}</td>
                  <td class="px-1.5 py-1">
                    <span v-if="log.cMoonName" class="inline-flex items-center gap-1">
                      <span class="inline-block w-2 h-2 rounded-full" :style="{ backgroundColor: log.cMoonColor || '#999' }"></span>
                      {{ log.cMoonName }}
                    </span>
                    <span v-else>—</span>
                  </td>
                  <td class="px-1.5 py-1">
                    <span v-if="log.factionName" class="text-gray-500">{{ log.factionName }} — </span>{{ log.enemyName }}
                  </td>
                  <td class="px-1.5 py-1">
                    <span :class="resultClass(log)">{{ resultLabel(log) }}</span>
                  </td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ log.roundNumber }}</td>
                  <td class="px-1.5 py-1 text-right tabular-nums">{{ log.pointsAwarded ? `+${log.pointsAwarded}` : '—' }}</td>
                  <td class="px-1.5 py-1">{{ prizesSummary(log) }}</td>
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(log.startedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- CARD VIEW (mobile) -->
          <div class="space-y-2 block sm:hidden">
            <div v-for="log in logs" :key="log.id" class="bg-gray-100 rounded-lg p-3 text-xs">
              <div class="flex items-start justify-between gap-2 mb-1.5">
                <p class="font-semibold text-sm truncate">{{ log.username ?? '—' }}</p>
                <span :class="['shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold', resultBadgeClass(log)]">
                  {{ resultLabel(log) }}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-y-1 gap-x-2 mb-1.5">
                <div>
                  <p class="text-[10px] text-gray-500">cMoon</p>
                  <p class="font-medium truncate">
                    <span v-if="log.cMoonName" class="inline-flex items-center gap-1">
                      <span class="inline-block w-2 h-2 rounded-full" :style="{ backgroundColor: log.cMoonColor || '#999' }"></span>
                      {{ log.cMoonName }}
                    </span>
                    <span v-else>—</span>
                  </p>
                </div>
                <div>
                  <p class="text-[10px] text-gray-500">Points</p>
                  <p class="font-medium">{{ log.pointsAwarded ? `+${log.pointsAwarded}` : '—' }}</p>
                </div>
                <div class="col-span-2">
                  <p class="text-[10px] text-gray-500">Enemy</p>
                  <p class="font-medium break-words">
                    <span v-if="log.factionName" class="text-gray-500">{{ log.factionName }} — </span>{{ log.enemyName }}
                  </p>
                </div>
                <div class="col-span-2">
                  <p class="text-[10px] text-gray-500">Prizes</p>
                  <p class="font-medium break-words">{{ prizesSummary(log) }}</p>
                </div>
              </div>

              <p class="text-[10px] text-gray-500 border-t border-gray-200 pt-1">
                {{ formatDate(log.startedAt) }}
              </p>
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const logs = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)

const searchTerm = ref('')
const fromDate = ref('')
const toDate = ref('')
const outcomeFilter = ref('')
const cmoonFilter = ref('')
const enemyFilter = ref('')
const outcomes = ref([])
const cmoons = ref([])
const enemyMembers = ref([])

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

const OUTCOME_LABELS = { WIN: 'Win', LOSS: 'Loss', ABANDONED: 'Abandoned' }
function outcomeLabel(o) { return OUTCOME_LABELS[o] || o }

function resultLabel(log) {
  if (log.status === 'IN_PROGRESS') return 'In progress'
  return outcomeLabel(log.outcome)
}
function resultClass(log) {
  if (log.status === 'IN_PROGRESS') return 'text-indigo-600 font-medium'
  if (log.outcome === 'WIN') return 'text-green-700 font-medium'
  if (log.outcome === 'LOSS') return 'text-red-600 font-medium'
  return 'text-gray-500'
}
function resultBadgeClass(log) {
  if (log.status === 'IN_PROGRESS') return 'bg-indigo-100 text-indigo-700'
  if (log.outcome === 'WIN') return 'bg-green-100 text-green-700'
  if (log.outcome === 'LOSS') return 'bg-red-100 text-red-700'
  return 'bg-gray-200 text-gray-600'
}

function prizesSummary(log) {
  const rewards = Array.isArray(log.rewardsGranted) ? log.rewardsGranted : []
  if (!rewards.length) return '—'
  return rewards.map(r => `${r.type}${r.name ? ` (${r.name})` : ''}${r.quantity > 1 ? ` x${r.quantity}` : ''}`).join(', ')
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Chicago', timeZoneName: 'short',
  })
}

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
      to: toDate.value || undefined,
      // "In progress" is a status filter, not an outcome (an in-progress battle has no outcome
      // yet) — kept as one dropdown for a simpler filter bar, split back out here.
      outcome: (outcomeFilter.value && outcomeFilter.value !== 'IN_PROGRESS_ONLY') ? outcomeFilter.value : undefined,
      status: outcomeFilter.value === 'IN_PROGRESS_ONLY' ? 'IN_PROGRESS' : undefined,
      cMoonId: cmoonFilter.value || undefined,
      enemyMemberId: enemyFilter.value || undefined,
    }
    const res = await $fetch('/api/admin/cmoon-enemy-battle-logs', { query })
    logs.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
    if (Array.isArray(res.outcomes)) outcomes.value = res.outcomes
    if (Array.isArray(res.cmoons)) cmoons.value = res.cmoons
    if (Array.isArray(res.enemyMembers)) enemyMembers.value = res.enemyMembers
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

onBeforeUnmount(() => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
})
watch([searchTerm, fromDate, toDate, outcomeFilter, cmoonFilter, enemyFilter], () => {
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
.admin-cmoon-battle-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
th, td { vertical-align: middle; }
</style>
