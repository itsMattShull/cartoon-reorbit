<template>
  <div class="admin-og-gtoons-logs bg-gray-50">
    <div class="p-2 space-y-2 text-xs">
      <h1 class="text-base font-bold mb-1">OG gToons Logs</h1>

      <p class="text-[11px] text-gray-600 mb-1">
        Every OG gToons PvP game, newest first. Each side stakes the same points; the winner takes
        the pot and a tie refunds both. Practice games against the bot stake nothing and are not listed.
      </p>

      <!-- Filters -->
      <div class="mb-2 flex flex-wrap items-end gap-2">
        <input
          v-model="username"
          type="text"
          placeholder="Exact username…"
          class="flex-1 min-w-[180px] border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          @keyup.enter="reload"
        />
        <div class="flex items-center">
          <label for="ogFromDate" class="mr-1 text-[11px] font-medium">From</label>
          <input id="ogFromDate" v-model="fromDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" @change="reload" />
        </div>
        <div class="flex items-center">
          <label for="ogToDate" class="mr-1 text-[11px] font-medium">To</label>
          <input id="ogToDate" v-model="toDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" @change="reload" />
        </div>
        <button class="px-2 py-0.5 border rounded bg-white text-[11px]" @click="reload">Search</button>
        <button
          v-if="username || fromDate || toDate"
          class="px-2 py-0.5 border rounded bg-white text-[11px]"
          @click="clearFilters"
        >Clear</button>
      </div>

      <div class="mb-2 text-[11px] text-gray-600">
        Total Results: {{ total }} games
      </div>

      <div v-if="error" class="text-red-700">{{ error }}</div>
      <div v-else-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="matches.length === 0" class="text-gray-500">No results.</div>

      <div v-else>
        <!-- Card view (sm/md) -->
        <div class="lg:hidden space-y-2">
          <div
            v-for="m in matches"
            :key="m.id"
            class="p-2 border rounded shadow bg-white text-[11px] space-y-0.5"
          >
            <p><strong>When:</strong> {{ formatDate(m.endedAt || m.startedAt) }}</p>
            <p><strong>Players:</strong> {{ name(m.player1) }} vs {{ name(m.player2) }}</p>
            <p><strong>Winner:</strong> {{ winnerLabel(m) }}</p>
            <p><strong>Result:</strong> {{ m.result }}</p>
            <p><strong>Staked:</strong> {{ stakeLabel(m) }}</p>
            <p><strong>Final score:</strong> {{ m.score }}</p>
            <p><strong>Type:</strong> {{ m.type }}</p>
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
        <div class="mt-2 flex items-center gap-2">
          <button
            class="px-2 py-0.5 border rounded bg-white disabled:opacity-40"
            :disabled="page <= 1 || loading"
            @click="go(page - 1)"
          >Prev</button>
          <span class="text-[11px]">Page {{ page }} of {{ totalPages }}</span>
          <button
            class="px-2 py-0.5 border rounded bg-white disabled:opacity-40"
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
