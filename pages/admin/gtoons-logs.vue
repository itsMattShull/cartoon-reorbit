<template>
  <div class="p-6 space-y-4">
    <Nav />

    <div>
      <h1 class="text-2xl font-bold mb-4 mt-16 md:mt-20">gToons Clash Logs</h1>

      <!-- Search -->
      <div class="mb-4">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Search by username or outcome…"
          class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

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
          <p><strong>Outcome:</strong> {{ g.outcome || '—' }}</p>
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
              <td class="p-2 border-b capitalize">
                {{ g.outcome || '—' }}
              </td>
              <td class="p-2 border-b">
                {{ winnerLabel(g) }}
              </td>
              <td class="p-2 border-b">{{ whoLeftLabel(g) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="!filteredGames.length" class="text-gray-500 mt-4">
          No results.
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
const searchTerm = ref('')

async function fetchAllGames() {
  // paginated fetch like your auth-logs page
  let offset = 0
  while (true) {
    const res = await fetch(`/api/admin/gtoons-logs?offset=${offset}`, {
      credentials: 'include'
    })
    if (!res.ok) break
    const { games: page } = await res.json()
    if (!page?.length) break
    games.value.push(...page)
    offset += page.length
  }

  // Default sort: newest first
  games.value.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
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
    const oc = (g.outcome || '').toLowerCase()
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

function winnerLabel(g) {
  if (!g.outcome) return '—'
  if (g.outcome === 'tie') return 'Tie'
  if (g.outcome === 'incomplete') return '—'
  if (g.outcome === 'ai') return 'AI'
  // outcome === 'player' → winner relation should be player1 user in PvP,
  // but we rely on the API's winner relation; if null, fall back to '—'
  return g.winner?.username || '—'
}

function formatDate(input, withTime = false) {
  if (!input) return '—'
  const d = new Date(input)
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined
  })
}

onMounted(() => {
  fetchAllGames()
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
