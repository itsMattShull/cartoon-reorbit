<template>
  <div class="admin-edrps-logs bg-gray-50">
    <div class="p-2 space-y-2 text-xs">
      <h1 class="text-base font-bold mb-1">Ed, Edd n Eddy RPS Logs</h1>

      <p class="text-[11px] text-gray-600 mb-1">
        Two accounts trading wins is the cheapest way to farm this game. Rows are flagged when
        both sides share an IP or a device fingerprint, and the median response time is the
        giveaway for a script — humans on a {{ '15' }}-second timer do not throw in 40ms.
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
        Total Results: {{ total }} matches
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
            <p><strong>Players:</strong> {{ name(m.player1) }} ({{ m.player1Character }}) vs {{ name(m.player2) }} ({{ m.player2Character }})</p>
            <p><strong>Score:</strong> {{ m.score }}</p>
            <p><strong>Winner:</strong> {{ m.winner || '—' }}</p>
            <p><strong>Ended:</strong> {{ m.endReason }}</p>
            <p><strong>Points:</strong> {{ pointsLabel(m) }}</p>
            <p><strong>Median response:</strong> {{ m.medianResponseMs == null ? '—' : m.medianResponseMs + 'ms' }}</p>
            <p v-if="isFlagged(m)" class="text-red-700 font-semibold">{{ flagLabel(m) }}</p>
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
                <th class="px-1.5 py-1 border-b">Score</th>
                <th class="px-1.5 py-1 border-b">Winner</th>
                <th class="px-1.5 py-1 border-b">Ended</th>
                <th class="px-1.5 py-1 border-b">Rounds</th>
                <th class="px-1.5 py-1 border-b" title="Median server-measured throw latency across both players">Med. ms</th>
                <th class="px-1.5 py-1 border-b" title="Rounds where at least one hand was auto-thrown on timeout">Auto</th>
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
                <td class="px-1.5 py-1 border-b">{{ name(m.player1) }} <span class="text-gray-500">({{ m.player1Character }})</span></td>
                <td class="px-1.5 py-1 border-b">{{ name(m.player2) }} <span class="text-gray-500">({{ m.player2Character }})</span></td>
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ m.score }}</td>
                <td class="px-1.5 py-1 border-b">{{ m.winner || '—' }}</td>
                <td class="px-1.5 py-1 border-b">{{ m.endReason }}</td>
                <td class="px-1.5 py-1 border-b">{{ m.roundCount }}</td>
                <td class="px-1.5 py-1 border-b" :class="fastClass(m)">
                  {{ m.medianResponseMs == null ? '—' : m.medianResponseMs }}
                </td>
                <td class="px-1.5 py-1 border-b">{{ m.autoThrows || '' }}</td>
                <td class="px-1.5 py-1 border-b whitespace-nowrap">{{ pointsLabel(m) }}</td>
                <td class="px-1.5 py-1 border-b text-red-700 font-semibold whitespace-nowrap">{{ flagLabel(m) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination. Server-side, unlike the Clash log's flat take-50: this table grows far
             faster and client-side paging stops working early. -->
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
  forfeit: 'forfeit',
  pair_limit: 'pair limit',
  same_device: 'same device',
  cap_exhausted: 'cap reached',
  abandoned: 'abandoned',
  banned: 'banned'
}

function name(u) { return u?.username || '—' }

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago' })
}

function pointsLabel(m) {
  if (m.pointsAwarded > 0) return `+${m.pointsAwarded}`
  return m.suppressReason ? `0 (${SUPPRESS_LABEL[m.suppressReason] || m.suppressReason})` : '0'
}

function isFlagged(m) {
  return m.sameIp || m.sameVisitorId || ['pair_limit', 'same_device', 'banned'].includes(m.suppressReason)
}

function flagLabel(m) {
  const out = []
  if (m.sameIp) out.push('same IP')
  if (m.sameVisitorId) out.push('same device')
  if (m.suppressReason === 'pair_limit') out.push('pair limit')
  return out.join(', ')
}

// Anything under 250ms median across a whole match is well below human reaction time on a
// deliberate choice, let alone one made after reading the screen.
function fastClass(m) {
  return m.medianResponseMs != null && m.medianResponseMs < 250 ? 'text-red-700 font-semibold' : ''
}

async function load() {
  loading.value = true
  try {
    const res = await $fetch('/api/admin/edrps-matches', {
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

function go(p) { page.value = p; load() }
function reload() { page.value = 1; load() }

onMounted(load)
</script>
