<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-6xl mx-auto mt-6 space-y-6">
      <div class="bg-white rounded-lg shadow p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold">Manage gToons Clash Tournaments</h1>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="px-3 py-2 rounded border text-sm hover:bg-gray-50"
              @click="loadTournaments"
            >
              Refresh
            </button>
            <button
              type="button"
              class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              @click="openCreateModal"
            >
              Create Tournament
            </button>
            <button
              type="button"
              class="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700"
              @click="openResolveModal"
            >
              Resolve Match
            </button>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow">
        <div class="px-5 py-3 border-b flex items-center justify-between">
          <h2 class="text-lg font-semibold">Existing Tournaments</h2>
          <span class="text-xs text-gray-500">Total: {{ tournaments.length }}</span>
        </div>

        <div v-if="loading" class="p-5 text-gray-500">Loading tournaments...</div>
        <div v-else-if="!tournaments.length" class="p-5 text-gray-500">No tournaments yet.</div>
        <div v-else class="divide-y">
          <div v-for="t in tournaments" :key="t.id" class="p-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-semibold text-lg">{{ t.name }}</span>
                <span class="text-xs px-2 py-1 rounded-full" :class="statusClass(t.status)">{{ statusLabel(t.status) }}</span>
              </div>
              <div class="text-sm text-gray-600 mt-1">Opt-in (CST): {{ formatDate(t.optInStartAt) }} → {{ formatDate(t.optInEndAt) }}</div>
              <div class="text-sm text-gray-600 mt-1">Opt-ins: <span class="font-semibold">{{ t.optInCount }}</span></div>
              <div v-if="t.format" class="text-sm text-gray-600 mt-1">Format: {{ formatLabel(t.format) }}</div>
            </div>

            <div class="flex flex-wrap gap-2">
              <NuxtLink
                :to="`/games/clash/tournaments/${t.id}`"
                class="px-3 py-2 rounded border text-sm hover:bg-gray-50"
              >
                View
              </NuxtLink>
              <button
                type="button"
                class="px-3 py-2 rounded border text-sm hover:bg-gray-50"
                @click="openEditModal(t)"
              >
                Edit
              </button>
              <button
                type="button"
                class="px-3 py-2 rounded border text-sm hover:bg-gray-50"
                @click="recompute(t.id)"
                :disabled="actionLoading"
              >
                Recompute
              </button>
              <button
                type="button"
                class="px-3 py-2 rounded border border-red-500 text-red-600 text-sm hover:bg-red-50"
                @click="cancelTournament(t.id)"
                :disabled="actionLoading"
                v-if="t.status !== 'CANCELLED'"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40" @click="closeCreateModal"></div>
    <div class="relative w-full max-w-lg bg-white rounded-lg shadow-lg flex flex-col max-h-[90vh]">
      <div class="px-6 py-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold">Create Tournament</h2>
        <button class="text-gray-500 hover:text-gray-700" @click="closeCreateModal">✕</button>
      </div>

      <div class="px-6 py-4 overflow-y-auto">
        <form @submit.prevent="createTournament" class="grid grid-cols-1 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Name</label>
            <input v-model="form.name" type="text" class="w-full border rounded p-2" required />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Opt-in start</label>
            <input v-model="form.optInStartAt" type="datetime-local" class="w-full border rounded p-2" required />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Opt-in end</label>
            <input v-model="form.optInEndAt" type="datetime-local" class="w-full border rounded p-2" required />
          </div>
          <span v-if="saveError" class="text-red-600 text-sm">{{ saveError }}</span>
        </form>
      </div>

      <div class="px-6 py-4 border-t flex items-center justify-end gap-2">
        <button type="button" class="px-4 py-2 rounded border" @click="closeCreateModal">Cancel</button>
        <button
          type="button"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          :disabled="saving"
          @click="createTournament"
        >
          Create Tournament
        </button>
      </div>
    </div>
  </div>

  <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40" @click="closeEditModal"></div>
    <div class="relative w-full max-w-lg bg-white rounded-lg shadow-lg flex flex-col max-h-[90vh]">
      <div class="px-6 py-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold">Edit Tournament</h2>
        <button class="text-gray-500 hover:text-gray-700" @click="closeEditModal">✕</button>
      </div>

      <div class="px-6 py-4 overflow-y-auto">
        <form @submit.prevent="saveEdit" class="grid grid-cols-1 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Name</label>
            <input v-model="editForm.name" type="text" class="w-full border rounded p-2" required />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Opt-in start</label>
            <input v-model="editForm.optInStartAt" type="datetime-local" class="w-full border rounded p-2" required />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Opt-in end</label>
            <input v-model="editForm.optInEndAt" type="datetime-local" class="w-full border rounded p-2" required />
          </div>
          <span v-if="editError" class="text-red-600 text-sm">{{ editError }}</span>
        </form>
      </div>

      <div class="px-6 py-4 border-t flex items-center justify-end gap-2">
        <button type="button" class="px-4 py-2 rounded border" @click="closeEditModal">Cancel</button>
        <button
          type="button"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          :disabled="editSaving"
          @click="saveEdit"
        >
          Save Changes
        </button>
      </div>
    </div>
  </div>

  <div v-if="showResolveModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40" @click="closeResolveModal"></div>
    <div class="relative w-full max-w-lg bg-white rounded-lg shadow-lg flex flex-col max-h-[90vh]">
      <div class="px-6 py-4 border-b flex items-center justify-between">
        <h2 class="text-lg font-semibold">Resolve Match (Admin Select)</h2>
        <button class="text-gray-500 hover:text-gray-700" @click="closeResolveModal">✕</button>
      </div>

      <div class="px-6 py-4 overflow-y-auto">
        <form @submit.prevent="resolveMatch" class="grid grid-cols-1 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Select Tournament</label>
            <select
              class="w-full border rounded p-2"
              :value="selectedTournamentId"
              @change="selectResolveTournament($event.target.value)"
            >
              <option value="">Select a tournament</option>
              <option v-for="t in tournaments" :key="t.id" :value="t.id">{{ t.name }} ({{ t.id }})</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Select Match</label>
            <select
              class="w-full border rounded p-2"
              :value="selectedMatchId"
              @change="selectResolveMatch($event.target.value)"
              :disabled="!resolveMatches.length"
            >
              <option value="">{{ resolveMatches.length ? 'Select a match' : 'No matches found' }}</option>
              <option v-for="m in resolveMatches" :key="m.id" :value="m.id">
                {{ m.stage === 'SWISS' ? 'Swiss' : 'Bracket' }} Round {{ m.roundNumber }} · {{ m.playerAName }} vs {{ m.playerBName }} ({{ m.status }})
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Select User To Make Winner</label>
            <select
              class="w-full border rounded p-2"
              :value="selectedWinnerId"
              @change="selectResolveWinner($event.target.value)"
              :disabled="!selectedMatch"
            >
              <option value="">{{ selectedMatch ? 'Select a winner' : 'Select a match first' }}</option>
              <option v-if="selectedMatch" :value="selectedMatch.playerAUserId">
                {{ selectedMatch.playerAName }} ({{ selectedMatch.playerAUserId }})
              </option>
              <option v-if="selectedMatch" :value="selectedMatch.playerBUserId">
                {{ selectedMatch.playerBName }} ({{ selectedMatch.playerBUserId }})
              </option>
              <option v-if="selectedMatch && selectedMatch.stage === 'SWISS'" value="TIE">
                Tie
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Notes (optional)</label>
            <input v-model="resolveForm.notes" type="text" class="w-full border rounded p-2" />
          </div>
          <span v-if="resolveError" class="text-red-600 text-sm">{{ resolveError }}</span>
        </form>
      </div>

      <div class="px-6 py-4 border-t flex items-center justify-end gap-2">
        <button type="button" class="px-4 py-2 rounded border" @click="closeResolveModal">Cancel</button>
        <button
          type="button"
          class="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 disabled:opacity-50"
          :disabled="actionLoading"
          @click="resolveMatch"
        >
          Resolve Match
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - gToons Clash Tournaments', middleware: ['auth', 'admin'], layout: 'default' })

const tournaments = ref([])
const loading = ref(true)
const saving = ref(false)
const actionLoading = ref(false)
const saveError = ref('')
const resolveError = ref('')
const showCreateModal = ref(false)
const showResolveModal = ref(false)
const showEditModal = ref(false)
const editSaving = ref(false)
const editError = ref('')

const form = ref({
  name: '',
  optInStartAt: '',
  optInEndAt: ''
})

const resolveForm = ref({
  tournamentId: '',
  matchId: '',
  winnerUserId: '',
  outcome: '',
  notes: ''
})

const editForm = ref({
  id: '',
  name: '',
  optInStartAt: '',
  optInEndAt: ''
})

const resolveMatches = ref([])
const selectedTournamentId = ref('')
const selectedMatchId = ref('')
const selectedWinnerId = ref('')

const selectedMatch = computed(() =>
  resolveMatches.value.find(m => m.id === selectedMatchId.value) || null
)

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

function formatDate(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBD'
  return date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function loadTournaments() {
  loading.value = true
  try {
    const data = await $fetch('/api/admin/tournaments')
    tournaments.value = Array.isArray(data) ? data : []
  } finally {
    loading.value = false
  }
}

async function loadResolveMatches(tournamentId) {
  resolveMatches.value = []
  if (!tournamentId) return
  try {
    const data = await $fetch(`/api/tournaments/${tournamentId}/matches`)
    const flat = []
    const bracket = data?.BRACKET || {}
    const swiss = data?.SWISS || {}
    const stageBuckets = [
      { stage: 'BRACKET', rounds: bracket },
      { stage: 'SWISS', rounds: swiss }
    ]
    for (const bucket of stageBuckets) {
      const roundKeys = Object.keys(bucket.rounds || {}).sort((a, b) => Number(a) - Number(b))
      for (const roundKey of roundKeys) {
        const roundMatches = bucket.rounds[roundKey] || []
        for (const match of roundMatches) {
          flat.push({
            id: match.id,
            stage: match.stage || bucket.stage,
            roundNumber: match.roundNumber,
            status: match.status,
            playerAName: match.playerAName,
            playerBName: match.playerBName,
            playerAUserId: match.playerAUserId,
            playerBUserId: match.playerBUserId,
            needsTiebreak: match.needsTiebreak,
            tiebreakNotes: match.tiebreakNotes
          })
        }
      }
    }
    resolveMatches.value = flat.filter(m => {
      if (m.stage === 'SWISS') {
        return m.status !== 'COMPLETE'
      }
      return m.needsTiebreak || m.tiebreakNotes || m.status !== 'COMPLETE'
    })
  } catch {
    resolveMatches.value = []
  }
}

function selectResolveTournament(value) {
  selectedTournamentId.value = value
  resolveForm.value.tournamentId = value
  selectedMatchId.value = ''
  selectedWinnerId.value = ''
  resolveForm.value.matchId = ''
  resolveForm.value.winnerUserId = ''
  resolveForm.value.outcome = ''
  loadResolveMatches(value)
}

function selectResolveMatch(value) {
  selectedMatchId.value = value
  resolveForm.value.matchId = value
  selectedWinnerId.value = ''
  resolveForm.value.winnerUserId = ''
  resolveForm.value.outcome = ''
}

function selectResolveWinner(value) {
  selectedWinnerId.value = value
  if (value === 'TIE') {
    resolveForm.value.winnerUserId = ''
    resolveForm.value.outcome = 'TIE'
    return
  }
  resolveForm.value.winnerUserId = value
  resolveForm.value.outcome = ''
}

async function createTournament() {
  saveError.value = ''
  saving.value = true
  try {
    const startIso = new Date(form.value.optInStartAt).toISOString()
    const endIso = new Date(form.value.optInEndAt).toISOString()
    await $fetch('/api/admin/tournaments', {
      method: 'POST',
      body: {
        name: form.value.name,
        optInStartAt: startIso,
        optInEndAt: endIso
      }
    })
    form.value = { name: '', optInStartAt: '', optInEndAt: '' }
    await loadTournaments()
    showCreateModal.value = false
  } catch (err) {
    saveError.value = err?.data?.statusMessage || err?.message || 'Failed to create tournament'
  } finally {
    saving.value = false
  }
}

async function saveEdit() {
  editError.value = ''
  editSaving.value = true
  try {
    const startIso = new Date(editForm.value.optInStartAt).toISOString()
    const endIso = new Date(editForm.value.optInEndAt).toISOString()
    await $fetch(`/api/admin/tournaments/${editForm.value.id}`, {
      method: 'PUT',
      body: {
        name: editForm.value.name,
        optInStartAt: startIso,
        optInEndAt: endIso
      }
    })
    await loadTournaments()
    showEditModal.value = false
  } catch (err) {
    editError.value = err?.data?.statusMessage || err?.message || 'Failed to update tournament'
  } finally {
    editSaving.value = false
  }
}

function openCreateModal() {
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
}

function openResolveModal() {
  showResolveModal.value = true
}

function closeResolveModal() {
  showResolveModal.value = false
}

function toLocalInputValue(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function openEditModal(tournament) {
  editError.value = ''
  editForm.value = {
    id: tournament.id,
    name: tournament.name,
    optInStartAt: toLocalInputValue(tournament.optInStartAt),
    optInEndAt: toLocalInputValue(tournament.optInEndAt)
  }
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
}

async function cancelTournament(id) {
  actionLoading.value = true
  try {
    await $fetch(`/api/admin/tournaments/${id}/cancel`, { method: 'POST' })
    await loadTournaments()
  } finally {
    actionLoading.value = false
  }
}

async function recompute(id) {
  actionLoading.value = true
  try {
    await $fetch(`/api/admin/tournaments/${id}/recompute`, { method: 'POST' })
  } finally {
    actionLoading.value = false
  }
}

async function resolveMatch() {
  resolveError.value = ''
  actionLoading.value = true
  try {
    await $fetch(`/api/admin/tournaments/${resolveForm.value.tournamentId}/resolve-match`, {
      method: 'POST',
      body: {
        matchId: resolveForm.value.matchId,
        winnerUserId: resolveForm.value.winnerUserId,
        outcome: resolveForm.value.outcome,
        notes: resolveForm.value.notes
      }
    })
    resolveForm.value = { tournamentId: '', matchId: '', winnerUserId: '', outcome: '', notes: '' }
    resolveMatches.value = []
    selectedTournamentId.value = ''
    selectedMatchId.value = ''
    selectedWinnerId.value = ''
    showResolveModal.value = false
  } catch (err) {
    resolveError.value = err?.data?.statusMessage || err?.message || 'Failed to resolve match'
  } finally {
    actionLoading.value = false
  }
}

onMounted(loadTournaments)
</script>
