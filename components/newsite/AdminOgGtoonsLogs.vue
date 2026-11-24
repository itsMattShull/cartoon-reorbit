<template>
  <div class="admin-og-gtoons-logs bg-gray-50">
    <div class="p-2 space-y-2 text-xs">
      <h1 class="text-base font-bold mb-1">OG gToons Logs</h1>

      <p class="text-[11px] text-gray-600 mb-1">
        Every OG gToons PvP game, newest first. Each side stakes the same points; the winner takes
        the pot and a tie refunds both. Practice games against the bot stake nothing and are not listed.
      </p>

      <!-- Filters: stacked full-width on phones, one row from sm up -->
      <div class="mb-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2">
        <input
          v-model="username"
          type="text"
          inputmode="search"
          autocapitalize="off"
          autocomplete="off"
          placeholder="Exact username…"
          class="w-full sm:flex-1 sm:min-w-[180px] border border-gray-300 rounded px-2 py-1.5 sm:px-1.5 sm:py-0.5 text-sm sm:text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          @keyup.enter="reload"
        />
        <div class="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <label class="flex flex-col sm:flex-row sm:items-center text-[11px] font-medium">
            <span class="mb-0.5 sm:mb-0 sm:mr-1">From</span>
            <input v-model="fromDate" type="date" class="w-full border rounded px-2 py-1.5 sm:px-1.5 sm:py-0.5 text-sm sm:text-xs" @change="reload" />
          </label>
          <label class="flex flex-col sm:flex-row sm:items-center text-[11px] font-medium">
            <span class="mb-0.5 sm:mb-0 sm:mr-1">To</span>
            <input v-model="toDate" type="date" class="w-full border rounded px-2 py-1.5 sm:px-1.5 sm:py-0.5 text-sm sm:text-xs" @change="reload" />
          </label>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 sm:flex-none px-3 py-1.5 sm:px-2 sm:py-0.5 border rounded bg-white text-sm sm:text-[11px]" @click="reload">Search</button>
          <button
            v-if="username || fromDate || toDate"
            class="flex-1 sm:flex-none px-3 py-1.5 sm:px-2 sm:py-0.5 border rounded bg-white text-sm sm:text-[11px]"
            @click="clearFilters"
          >Clear</button>
        </div>
      </div>

      <div class="mb-2 text-[11px] text-gray-600">
        Total Results: {{ total }} games
      </div>

      <div v-if="error" class="text-red-700">{{ error }}</div>
      <div v-else-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="matches.length === 0" class="text-gray-500">No results.</div>

      <div v-else>
        <!-- Card view (below lg): one card per game, two columns from sm up -->
        <div class="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            v-for="m in matches"
            :key="m.id"
            class="og-log-card p-3 border rounded-lg shadow-sm bg-white text-sm space-y-2"
          >
            <div class="flex items-center justify-between gap-2 text-[11px] text-gray-500">
              <span>{{ formatDate(m.endedAt || m.startedAt) }}</span>
              <span class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{{ m.type }}</span>
            </div>

            <!-- Players and final score -->
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div class="min-w-0">
                <p class="truncate" :class="m.outcome === 'PLAYER1' ? 'font-bold text-green-700' : ''">{{ name(m.player1) }}</p>
                <p class="text-[11px] text-gray-500">Player 1</p>
              </div>
              <p class="text-lg font-bold tabular-nums whitespace-nowrap">{{ m.player1Score }}<span class="mx-1 text-gray-400">-</span>{{ m.player2Score }}</p>
              <div class="min-w-0 text-right">
                <p class="truncate" :class="m.outcome === 'PLAYER2' ? 'font-bold text-green-700' : ''">{{ name(m.player2) }}</p>
                <p class="text-[11px] text-gray-500">Player 2</p>
              </div>
            </div>

            <dl class="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px] border-t pt-2">
              <dt class="text-gray-500">Winner</dt>
              <dd class="text-right font-medium truncate">{{ winnerLabel(m) }}</dd>
              <dt class="text-gray-500">Result</dt>
              <dd class="text-right">{{ m.result }}</dd>
              <dt class="text-gray-500">Staked</dt>
              <dd class="text-right">{{ stakeLabel(m) }}</dd>
            </dl>
          </div>
        </div>

        <!-- Table view (lg+) -->
        <div class="hidden lg:block overflow-x-auto">
          <table class="min-w-full border border-gray-300 text-[11px]">
            <thead class="bg-gray-100 text-left">
              <tr>
                <th class="px-1.5 py-1 border-b">When</th>
                <th class="px-1.5 py-1 border-b">Player 1</th>
                <th class="px-1.5 py-1 border-b">Player 2</th>
                <th class="px-1.5 py-1 border-b">Winner</th>
                <th class="px-1.5 py-1 border-b">Result</th>
                <th class="px-1.5 py-1 border-b" title="Points each player put up; the winner takes the pot">Staked</th>
                <th class="px-1.5 py-1 border-b" title="Player 1 total - Player 2 total, bonuses included">Final Score</th>
                <th class="px-1.5 py-1 border-b">Type</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in matches" :key="m.id" class="odd:bg-white even:bg-gray-50">
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ formatDate(m.endedAt || m.startedAt) }}</td>
                <td class="px-1.5 py-1 border-b" :class="{ 'font-semibold': m.outcome === 'PLAYER1' }">{{ name(m.player1) }}</td>
                <td class="px-1.5 py-1 border-b" :class="{ 'font-semibold': m.outcome === 'PLAYER2' }">{{ name(m.player2) }}</td>
                <td class="px-1.5 py-1 border-b">{{ winnerLabel(m) }}</td>
                <td class="px-1.5 py-1 border-b">{{ m.result }}</td>
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ stakeLabel(m) }}</td>
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ m.score }}</td>
                <td class="px-1.5 py-1 border-b">{{ m.type }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination (server-side) -->
        <div class="mt-2 flex items-center justify-between sm:justify-start gap-2">
          <button
            class="px-4 py-1.5 sm:px-2 sm:py-0.5 border rounded bg-white disabled:opacity-40"
            :disabled="page <= 1 || loading"
            @click="go(page - 1)"
          >Prev</button>
          <span class="text-[11px]">Page {{ page }} of {{ totalPages }}</span>
          <button
            class="px-4 py-1.5 sm:px-2 sm:py-0.5 border rounded bg-white disabled:opacity-40"
            :disabled="page >= totalPages || loading"
            @click="go(page + 1)"
          >Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const matches = ref([])
const total = ref(0)
const totalPages = ref(1)
const page = ref(1)
const loading = ref(false)
const error = ref('')
const username = ref('')
const fromDate = ref('')
const toDate = ref('')

function name (u) { return u?.username || '—' }

function winnerLabel (m) {
  if (m.outcome === 'TIE') return 'Tie'
  if (m.outcome === 'INCOMPLETE' || !m.outcome) return '—'
  return m.winner || '—'
}

function stakeLabel (m) {
  if (!m.pot) return 'None'
  if (m.player1Staked === m.player2Staked) return `${m.player1Staked} each (pot ${m.pot})`
  return `${m.player1Staked} / ${m.player2Staked} (pot ${m.pot})`
}

function formatDate (d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago' })
}

async function load () {
  loading.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/admin/og-gtoons-logs', {
      query: {
        page: page.value,
        username: username.value.trim() || undefined,
        from: fromDate.value || undefined,
        to: toDate.value || undefined
      }
    })
    matches.value = res.matches || []
    total.value = res.total || 0
    totalPages.value = res.totalPages || 1
  } catch (e) {
    matches.value = []
    total.value = 0
    totalPages.value = 1
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Could not load OG gToons games.'
  } finally {
    loading.value = false
  }
}

function go (p) { page.value = p; load() }
function reload () { page.value = 1; load() }
function clearFilters () {
  username.value = ''
  fromDate.value = ''
  toDate.value = ''
  reload()
}

onMounted(load)
</script>

<style scoped>
.admin-og-gtoons-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
th, td { vertical-align: middle; }
</style>
