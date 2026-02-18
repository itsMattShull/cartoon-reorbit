<template>
  <div class="p-6 space-y-4">
    <Nav />

    <div>
      <h1 class="text-2xl font-bold mb-4 mt-16 md:mt-20">gToons Clash Logs</h1>

      <!-- Filters -->
      <div class="mb-4 flex flex-wrap items-end gap-4">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Search by username or outcome…"
          class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
        <div class="flex items-center">
          <label for="fromDate" class="mr-2 text-sm font-medium">From</label>
          <input id="fromDate" v-model="fromDate" type="date" class="border rounded px-2 py-1" />
        </div>
        <div class="flex items-center">
          <label for="toDate" class="mr-2 text-sm font-medium">To</label>
          <input id="toDate" v-model="toDate" type="date" class="border rounded px-2 py-1" />
        </div>
      </div>

      <div class="mb-4 text-sm text-gray-600">
        Total Results: {{ total }} games
      </div>

      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="filteredGames.length === 0" class="text-gray-500">No results.</div>

      <div v-else>
        <!-- Card view (sm/md) -->
        <div class="lg:hidden space-y-4">
          <div
            v-for="g in filteredGames"
            :key="g.id"
            class="p-4 border rounded shadow bg-white"
          >
            <p><strong>Start:</strong> {{ formatDate(g.startedAt, true) }}</p>
            <p><strong>End:</strong> {{ g.endedAt ? formatDate(g.endedAt, true) : '—' }}</p>
            <p><strong>Player 1:</strong> {{ username(g.player1) }}</p>
            <p><strong>Player 2:</strong> {{ player2Label(g) }}</p>
            <p><strong>Outcome:</strong> {{ outcomeLabel(g) }}</p>
            <p><strong>Winner:</strong> {{ winnerLabel(g) }}</p>
            <p><strong>Who Left:</strong> {{ whoLeftLabel(g) }}</p>
          </div>
        </div>

        <!-- Table view (lg+) -->
        <div class="hidden lg:block">
          <table class="min-w-full border border-gray-300 text-sm">
            <thead class="bg-gray-100 text-left">
              <tr>
                <th class="p-2 border-b">Start</th>
                <th class="p-2 border-b">End</th>
                <th class="p-2 border-b">Player 1</th>
                <th class="p-2 border-b">Player 2</th>
                <th class="p-2 border-b">Outcome</th>
                <th class="p-2 border-b">Winner</th>
                <th class="p-2 border-b">Who Left</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in filteredGames" :key="g.id">
                <td class="p-2 border-b whitespace-nowrap">
                  {{ formatDate(g.startedAt, true) }}
                </td>
                <td class="p-2 border-b whitespace-nowrap">
                  {{ g.endedAt ? formatDate(g.endedAt, true) : '—' }}
                </td>
                <td class="p-2 border-b">
                  {{ username(g.player1) }}
                </td>
                <td class="p-2 border-b">
                  {{ player2Label(g) }}
                </td>
                <td class="p-2 border-b">
                  {{ outcomeLabel(g) }}
                </td>
                <td class="p-2 border-b">
                  {{ winnerLabel(g) }}
                </td>
                <td class="p-2 border-b">{{ whoLeftLabel(g) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="!loading && games.length" class="mt-6 flex items-center justify-between">
        <div class="text-sm text-gray-600">
          Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
        </div>
        <div class="space-x-2">
          <button class="px-3 py-1 border rounded" :disabled="page <= 1" @click="prevPage">Prev</button>
          <button class="px-3 py-1 border rounded" :disabled="page >= totalPages" @click="nextPage">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import Nav from '~/components/Nav.vue'

definePageMeta({
  title: 'Admin - gToons Logs',
  middleware: ['auth', 'admin'],
  layout: 'default'
})

/**
 * Expected API shape (per game):
 * {
 *   id: string,
 *   startedAt: string,
 *   endedAt: string | null,
 *   outcome: 'player' | 'ai' | 'tie' | 'incomplete' | null,
 *   player1: { username: string | null }   // required relation
 *   player2: { username: string | null } | null // null means AI
 *   winner:  { username: string | null } | null // null for AI win or tie/incomplete
 * }
 */

const games = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 100
const loading = ref(false)
const searchTerm = ref('')
const fromDate = ref('')
const toDate = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function normalizeDateRange() {
  if (!fromDate.value || !toDate.value) return
  if (new Date(fromDate.value) > new Date(toDate.value)) {
    const tmp = fromDate.value
    fromDate.value = toDate.value
    toDate.value = tmp
  }
}

async function fetchGames() {
  if (loading.value) return
  normalizeDateRange()
  loading.value = true
  try {
    const query = {
      page: page.value,
      limit: pageSize,
      from: fromDate.value || undefined,
      to: toDate.value || undefined
    }
    const res = await $fetch('/api/admin/gtoons-logs', { query })
    games.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch {
    games.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function whoLeftLabel(g) {
  // Only meaningful when a player actually left; otherwise show em dash
  return g.whoLeft?.username || '—'
}

const filteredGames = computed(() => {
  const q = searchTerm.value.trim().toLowerCase()
  if (!q) return games.value
  return games.value.filter(g => {
    const p1 = username(g.player1).toLowerCase()
    const p2 = player2Label(g).toLowerCase()
    const w  = winnerLabel(g).toLowerCase()
    const oc = outcomeLabel(g).toLowerCase()
    const wl = whoLeftLabel(g).toLowerCase()               // ← NEW
    return (
      p1.includes(q) ||
      p2.includes(q) ||
      w.includes(q)  ||
      oc.includes(q) ||
      wl.includes(q)                                   // ← NEW
    )
  })
})

function username(user) {
  return user?.username || '—'
}

function player2Label(g) {
  // If no player2UserId relation, it's an AI opponent
  return g.player2?.username || 'AI'
}

function outcomeLabel(g) {
  if (!g.outcome) return '—'
  if (g.outcome === 'tie') return 'Tie'
  if (g.outcome === 'incomplete') return '—'
  if (g.outcome === 'player') return username(g.player1)
  if (g.outcome === 'ai') return player2Label(g)
  return g.outcome
}

function winnerLabel(g) {
  if (!g.outcome) return '—'
  if (g.outcome === 'tie') return 'Tie'
  if (g.outcome === 'incomplete') return '—'
  if (g.winner?.username) return g.winner.username
  if (g.outcome === 'ai') return player2Label(g)
  if (g.outcome === 'player') return username(g.player1)
  return '—'
}

function formatDate(input, withTime = false) {
  if (!input) return '—'
  const d = new Date(input)
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined
  })
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchGames()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchGames()
}

let filterDebounceId = null
watch([fromDate, toDate], () => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => {
    page.value = 1
    fetchGames()
  }, 300)
})

onMounted(() => {
  fetchGames()
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
