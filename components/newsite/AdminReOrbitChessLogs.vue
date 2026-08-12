<template>
  <div class="admin-chess-logs bg-gray-50">
    <div class="p-2 space-y-2 text-xs">
      <h1 class="text-base font-bold mb-1">ReOrbit Chess Logs</h1>

      <p class="text-[11px] text-gray-600 mb-1">
        Chess has a farming route the other head-to-head games do not: a game can be thrown
        deliberately in a couple of moves. Short games are the thing to look for — the ply
        count and the median move time together are the giveaway, because a genuine game has
        variable think times and lasts tens of moves. Games under the configured minimum are
        recorded but never pay, and show as <em>too short</em>. AI games are not recorded at
        all.
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
        <label class="flex items-center gap-1 text-[11px] font-medium">
          <input v-model="flaggedOnly" type="checkbox" @change="reload" />
          Flagged only
        </label>
        <button class="px-2 py-0.5 border rounded bg-white text-[11px]" @click="reload">Search</button>
      </div>

      <div class="mb-2 text-[11px] text-gray-600">
        Total Results: {{ total }} games
      </div>

      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="matches.length === 0" class="text-gray-500">No results.</div>

      <div v-else>
        <!-- Card view (sm/md) -->
        <div class="lg:hidden space-y-2">
          <div
            v-for="m in matches"
            :key="m.id"
            class="p-2 border rounded shadow bg-white text-[11px] space-y-0.5"
            :class="{ 'border-red-400 bg-red-50': isFlagged(m) }"
          >
            <p><strong>When:</strong> {{ formatDate(m.startedAt) }}</p>
            <p><strong>Players:</strong> {{ name(m.white) }} (white) vs {{ name(m.black) }} (black)</p>
            <p><strong>Result:</strong> {{ m.result }} — {{ m.endReason }}</p>
            <p><strong>Winner:</strong> {{ m.winner || '—' }}</p>
            <p><strong>Moves:</strong> {{ m.plies }} plies</p>
            <p><strong>Time control:</strong> {{ m.timeControl }}</p>
            <p><strong>Points:</strong> {{ pointsLabel(m) }}</p>
            <p><strong>Median move:</strong> {{ m.medianMoveMs == null ? '—' : m.medianMoveMs + 'ms' }}</p>
            <p v-if="isFlagged(m)" class="text-red-700 font-semibold">{{ flagLabel(m) }}</p>
          </div>
        </div>

        <!-- Table view (lg+) -->
        <div class="hidden lg:block overflow-x-auto">
          <table class="min-w-full border border-gray-300 text-[11px]">
            <thead class="bg-gray-100 text-left">
              <tr>
                <th class="px-1.5 py-1 border-b">When</th>
                <th class="px-1.5 py-1 border-b">White</th>
                <th class="px-1.5 py-1 border-b">Black</th>
                <th class="px-1.5 py-1 border-b">Result</th>
                <th class="px-1.5 py-1 border-b">Winner</th>
                <th class="px-1.5 py-1 border-b">Ended</th>
                <th class="px-1.5 py-1 border-b" title="Half-moves. A deliberately thrown game is very short.">Plies</th>
                <th class="px-1.5 py-1 border-b">TC</th>
                <th class="px-1.5 py-1 border-b" title="Median server-measured time per move">Med. ms</th>
                <th class="px-1.5 py-1 border-b">Points</th>
                <th class="px-1.5 py-1 border-b">Flags</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in matches"
                :key="m.id"
                class="odd:bg-white even:bg-gray-50"
                :class="{ '!bg-red-50': isFlagged(m) }"
              >
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ formatDate(m.startedAt) }}</td>
                <td class="px-1.5 py-1 border-b">{{ name(m.white) }}</td>
                <td class="px-1.5 py-1 border-b">{{ name(m.black) }}</td>
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ m.result }}</td>
                <td class="px-1.5 py-1 border-b">{{ m.winner || '—' }}</td>
                <td class="px-1.5 py-1 border-b">{{ m.endReason }}</td>
                <td class="px-1.5 py-1 border-b" :class="shortClass(m)">{{ m.plies }}</td>
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ m.timeControl }}</td>
                <td class="px-1.5 py-1 border-b" :class="fastClass(m)">
                  {{ m.medianMoveMs == null ? '—' : m.medianMoveMs }}
                </td>
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ pointsLabel(m) }}</td>
                <td class="px-1.5 py-1 border-b text-red-700 font-semibold whitespace-nowrap">{{ flagLabel(m) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

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
const username = ref('')
const flaggedOnly = ref(false)

const SUPPRESS_LABEL = {
  draw: 'draw',
  too_short: 'too short',
  forfeit: 'forfeit',
  pair_limit: 'pair limit',
  same_device: 'same device',
  cap_exhausted: 'cap reached',
  abandoned: 'abandoned',
  banned: 'banned'
}

function name (u) { return u?.username || '—' }

function formatDate (d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago' })
}

function pointsLabel (m) {
  if (m.pointsAwarded > 0) return `+${m.pointsAwarded}`
  return m.suppressReason ? `0 (${SUPPRESS_LABEL[m.suppressReason] || m.suppressReason})` : '0'
}

function isFlagged (m) {
  return m.sameIp || m.sameVisitorId ||
    ['pair_limit', 'same_device', 'banned', 'too_short'].includes(m.suppressReason)
}

function flagLabel (m) {
  const out = []
  if (m.sameIp) out.push('same IP')
  if (m.sameVisitorId) out.push('same device')
  if (m.suppressReason === 'pair_limit') out.push('pair limit')
  if (m.suppressReason === 'too_short') out.push('too short')
  return out.join(', ')
}

// A decisive game inside 20 plies is either a genuine miniature or a thrown game, and the
// second is far more common. It does not pay either way, but a run of them between the same
// pair is what the flagged filter is for.
function shortClass (m) {
  return m.plies < 20 && m.endReason !== 'sweep' ? 'text-red-700 font-semibold' : ''
}

// Under 400ms median across a whole game is well below the time it takes a human to read a
// board, let alone choose a move on it.
function fastClass (m) {
  return m.medianMoveMs != null && m.medianMoveMs < 400 ? 'text-red-700 font-semibold' : ''
}

async function load () {
  loading.value = true
  try {
    const res = await $fetch('/api/admin/reorbitchess-matches', {
      query: {
        page: page.value,
        flagged: flaggedOnly.value ? 'true' : undefined,
        username: username.value || undefined
      }
    })
    matches.value = res.matches
    total.value = res.total
    totalPages.value = res.totalPages
  } catch {
    matches.value = []
    total.value = 0
    totalPages.value = 1
  } finally {
    loading.value = false
  }
}

function go (p) { page.value = p; load() }
function reload () { page.value = 1; load() }

onMounted(load)
</script>
