<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />
    <div clas="mt-16">&nbsp;</div>
    <section class="mt-20 max-w-6xl mx-auto px-4 pb-12">
      <div v-if="loading" class="text-gray-500">Loading tournament...</div>

      <template v-else>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="order-1 lg:col-start-1 bg-white border rounded-lg p-5 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 class="text-2xl font-bold">{{ tournament.name }}</h1>
              </div>
              <span class="text-xs px-2 py-1 rounded-full" :class="statusClass(tournament.status)">
                {{ statusLabel(tournament.status) }}
              </span>
            </div>

            <div class="mt-3 text-sm text-gray-600 space-y-1">
              <div>Opt-in start: {{ formatDate(tournament.optInStartAt) }} ({{ userTimeZone }})</div>
              <div>Opt-in end: {{ formatDate(tournament.optInEndAt) }} ({{ userTimeZone }})</div>
              <div>Opt-ins: <span class="font-semibold">{{ tournament.optInCount }}</span></div>
              <div v-if="tournament.format">Format: {{ formatLabel(tournament.format) }}</div>
              <div>Best of {{ tournament.bestOf }} · Swiss rounds {{ tournament.swissRounds }}</div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <button
                v-if="tournament.status === 'OPT_IN_OPEN' && user"
                @click="toggleOptIn"
                :disabled="actionLoading"
                class="px-4 py-2 rounded text-white text-sm"
                :class="tournament.isOptedIn ? 'bg-gray-600 hover:bg-gray-700' : 'bg-indigo-600 hover:bg-indigo-700'"
              >
                {{ tournament.isOptedIn ? 'Opt out' : 'Opt in' }}
              </button>
              <button
                v-else-if="tournament.status === 'OPT_IN_OPEN' && !user"
                class="px-4 py-2 rounded text-white text-sm bg-indigo-600 hover:bg-indigo-700"
                @click="login"
              >
                Sign in to opt in
              </button>
              <div v-else class="text-sm text-gray-500">Opt-in is closed.</div>
            </div>
          </div>

          <div class="order-2 lg:col-start-2 lg:row-span-2 bg-white border rounded-lg p-4 shadow-sm">
            <h2 class="text-lg font-semibold mb-2">Your current match</h2>
            <div v-if="!myMatches.length" class="text-sm text-gray-500">No active matches right now.</div>
            <div v-else class="space-y-3">
              <div v-for="match in myMatches" :key="match.id" class="border rounded p-3">
                <div class="text-sm font-semibold">
                  {{ match.playerAName }} vs {{ match.playerBName }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ match.stage }} Round {{ match.roundNumber }}
                </div>
                <div class="text-sm mt-2">Score: {{ scoreLabel(match) }}</div>
                <div v-if="match.suddenDeathActive" class="text-xs text-amber-600 mt-1">
                  Sudden death in progress
                </div>
                <div v-if="match.tiebreakNotes" class="text-xs text-red-600 mt-1">
                  {{ match.tiebreakNotes }}
                </div>
                <div class="mt-3">
                  <button
                    v-if="match.status === 'PENDING'"
                    @click="forfeitMatch(match)"
                    :disabled="forfeitLoading === match.id"
                    class="px-3 py-1.5 rounded text-white text-xs bg-red-600 hover:bg-red-700 disabled:opacity-60"
                  >
                    Forfeit
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="order-3 lg:col-start-1 bg-white border rounded-lg p-4 shadow-sm">
            <h2 class="text-lg font-semibold mb-3">Standings</h2>
            <div v-if="showBracketStats" class="overflow-x-auto mb-4">
              <div class="text-xs font-semibold text-gray-500 mb-2">Bracket</div>
              <table class="min-w-full text-xs">
                <thead>
                  <tr class="text-left text-gray-500">
                    <th class="py-1 pr-2">Player</th>
                    <th class="py-1">Bracket W-L</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in standings" :key="`bracket-${row.userId}`" class="border-t">
                    <td class="py-1 pr-2">{{ row.username }}</td>
                    <td class="py-1">{{ row.bracketWins }}-{{ row.bracketLosses }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="showSwissStats" class="overflow-x-auto">
              <div class="text-xs font-semibold text-gray-500 mb-2">Swiss</div>
              <table class="min-w-full text-xs">
                <thead>
                  <tr class="text-left text-gray-500">
                    <th class="py-1 pr-2">Player</th>
                    <th class="py-1 pr-2">Pts</th>
                    <th class="py-1 pr-2">W-L-T</th>
                    <th class="py-1 pr-2">OMW%</th>
                    <th class="py-1">GWP%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in standings" :key="`swiss-${row.userId}`" class="border-t">
                    <td class="py-1 pr-2">{{ row.username }}</td>
                    <td class="py-1 pr-2">{{ row.points }}</td>
                    <td class="py-1 pr-2">{{ row.swissWins }}-{{ row.swissLosses }}-{{ row.swissTies }}</td>
                    <td class="py-1 pr-2">{{ formatPct(row.opponentMatchWinPct) }}</td>
                    <td class="py-1">{{ formatPct(row.gameWinPct) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="mt-8 space-y-6">
          <div v-if="swissRounds.length" class="bg-white border rounded-lg p-4 shadow-sm">
            <h2 class="text-lg font-semibold mb-4">Swiss Rounds</h2>
            <div class="space-y-4">
              <div v-for="round in swissRounds" :key="round.roundNumber" class="border rounded p-3">
                <div class="text-sm font-semibold mb-2">Round {{ round.roundNumber }}</div>
                <div class="space-y-2">
                  <div v-for="match in round.matches" :key="match.id" class="text-sm flex items-center justify-between">
                    <div>
                      {{ match.playerAName }} vs {{ match.playerBName }}
                      <span v-if="match.status === 'BYE'" class="text-xs text-gray-500 ml-2">BYE</span>
                    </div>
                    <div class="text-xs text-gray-600">
                      {{ scoreLabel(match) }} · {{ outcomeLabel(match) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="bracketRounds.length" class="bg-white border rounded-lg p-4 shadow-sm">
            <h2 class="text-lg font-semibold mb-4">Bracket</h2>
            <div class="flex flex-wrap gap-6 overflow-x-auto">
              <div v-for="round in bracketRounds" :key="round.roundNumber" class="min-w-[220px]">
                <div class="text-sm font-semibold mb-2">Round {{ round.roundNumber }}</div>
                <div class="space-y-3">
                  <div v-for="match in round.matches" :key="match.id" class="border rounded p-3 text-sm">
                    <div class="font-semibold">
                      {{ match.playerAName }} vs {{ match.playerBName }}
                    </div>
                    <div class="text-xs text-gray-600 mt-1">Score: {{ scoreLabel(match) }}</div>
                    <div v-if="match.needsTiebreak" class="text-xs text-amber-600 mt-1">Sudden death in progress</div>
                    <div v-if="match.tiebreakNotes" class="text-xs text-red-600 mt-1">{{ match.tiebreakNotes }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Nav from '@/components/Nav.vue'
import { useAuth } from '@/composables/useAuth'

definePageMeta({
  title: 'gToons Clash Tournament',
  layout: 'default'
})

const route = useRoute()
const tournament = ref(null)
const standings = ref([])
const matches = ref({ SWISS: {}, BRACKET: {} })
const myMatches = ref([])
const loading = ref(true)
const actionLoading = ref(false)
const forfeitLoading = ref(null)

const { user, fetchSelf, login } = useAuth()
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'
const isBracketOnly = computed(() => tournament.value?.format === 'BRACKET_8_OR_LESS')
const isSwissTournament = computed(() => tournament.value?.format === 'SWISS_THEN_TOP8')
const showBracketStats = computed(() => {
  if (isBracketOnly.value) return true
  if (!isSwissTournament.value) return false
  return ['BRACKET_ACTIVE', 'COMPLETE'].includes(tournament.value?.status)
})
const showSwissStats = computed(() => !isBracketOnly.value)

const swissRounds = computed(() => {
  const rounds = matches.value.SWISS || {}
  return Object.keys(rounds)
    .map(r => ({ roundNumber: Number(r), matches: rounds[r] }))
    .sort((a, b) => a.roundNumber - b.roundNumber)
})

const bracketRounds = computed(() => {
  const rounds = matches.value.BRACKET || {}
  return Object.keys(rounds)
    .map(r => ({ roundNumber: Number(r), matches: rounds[r] }))
    .sort((a, b) => a.roundNumber - b.roundNumber)
})

function formatDate(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function statusLabel(status) {
  switch (status) {
    case 'OPT_IN_OPEN': return 'Opt-In Open'
    case 'OPT_IN_CLOSED': return 'Opt-In Closed'
    case 'SWISS_ACTIVE': return 'Swiss Active'
    case 'BRACKET_ACTIVE': return 'Bracket Active'
    case 'COMPLETE': return 'Complete'
    case 'CANCELLED': return 'Cancelled'
    default: return 'Draft'
  }
}

function statusClass(status) {
  switch (status) {
    case 'OPT_IN_OPEN': return 'bg-green-100 text-green-700'
    case 'SWISS_ACTIVE':
    case 'BRACKET_ACTIVE': return 'bg-blue-100 text-blue-700'
    case 'COMPLETE': return 'bg-green-100 text-green-700'
    case 'CANCELLED': return 'bg-red-100 text-red-700'
    default: return 'bg-yellow-100 text-yellow-700'
  }
}

function formatLabel(format) {
  return format === 'SWISS_THEN_TOP8' ? 'Swiss → Top 8' : 'Single Elimination'
}

function scoreLabel(match) {
  if (match.ties) return `${match.winsA}-${match.winsB}-(${match.ties})`
  return `${match.winsA}-${match.winsB}`
}

function outcomeLabel(match) {
  if (match.status === 'BYE') return 'Bye'
  if (match.outcome === 'A_WIN') return 'A Win'
  if (match.outcome === 'B_WIN') return 'B Win'
  if (match.outcome === 'TIE') return 'Tie'
  return match.status
}

function formatPct(value) {
  const n = Number(value || 0)
  return `${(n * 100).toFixed(1)}%`
}

async function loadAll() {
  loading.value = true
  try {
    const [tRes, sRes, mRes] = await Promise.all([
      $fetch(`/api/tournaments/${route.params.id}`),
      $fetch(`/api/tournaments/${route.params.id}/standings`),
      $fetch(`/api/tournaments/${route.params.id}/matches`)
    ])
    tournament.value = tRes
    standings.value = Array.isArray(sRes) ? sRes : []
    matches.value = mRes || { SWISS: {}, BRACKET: {} }

    if (user.value) {
      const myRes = await $fetch(`/api/tournaments/${route.params.id}/my-matches`)
      myMatches.value = Array.isArray(myRes) ? myRes : []
    } else {
      myMatches.value = []
    }
  } finally {
    loading.value = false
  }
}

async function toggleOptIn() {
  if (!tournament.value) return
  actionLoading.value = true
  try {
    const path = tournament.value.isOptedIn ? 'opt-out' : 'opt-in'
    await $fetch(`/api/tournaments/${tournament.value.id}/${path}`, { method: 'POST' })
    await loadAll()
  } finally {
    actionLoading.value = false
  }
}

async function forfeitMatch(match) {
  if (!match || match.status !== 'PENDING') return
  const ok = window.confirm('Forfeit this match? Your opponent will be awarded the win.')
  if (!ok) return
  forfeitLoading.value = match.id
  try {
    await $fetch(`/api/tournaments/${route.params.id}/forfeit`, {
      method: 'POST',
      body: { matchId: match.id }
    })
    await loadAll()
  } finally {
    forfeitLoading.value = null
  }
}

onMounted(async () => {
  await fetchSelf().catch(() => {})
  await loadAll()
})
</script>
