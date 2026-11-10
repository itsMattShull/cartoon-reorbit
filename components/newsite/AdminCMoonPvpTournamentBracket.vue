<template>
  <div class="tb-root space-y-2">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h3 class="font-semibold text-xs">Bracket</h3>
      <button
        v-if="canOpenRound" type="button"
        class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        :disabled="opening" @click="openRound"
      >{{ opening ? 'Opening…' : openRoundLabel }}</button>
    </div>
    <p v-if="openError" class="text-red-600">{{ openError }}</p>
    <p v-if="!rounds.length" class="text-gray-500">No rounds opened yet — close entries, then open round 1.</p>

    <div v-for="r in rounds" :key="r.roundNumber" class="space-y-1">
      <p class="text-[11px] font-semibold text-gray-600">{{ roundLabel(r.roundNumber, r.matches.length) }}</p>
      <div v-for="m in r.matches" :key="m.id" class="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
        <span class="flex-1 min-w-0 break-words">
          <span :class="{ 'font-bold text-green-700': m.winnerEntryId === m.entryAId }">{{ entryName(m.entryAId) }}</span>
          vs
          <span :class="{ 'font-bold text-green-700': m.winnerEntryId === m.entryBId }">{{ entryName(m.entryBId) }}</span>
        </span>
        <span v-if="!m.entryAId || !m.entryBId" class="text-amber-700 flex-shrink-0">bye</span>
        <span v-else-if="!m.winnerEntryId" class="text-gray-500 flex-shrink-0">in progress</span>
        <span v-else class="text-green-700 flex-shrink-0">🏆 {{ entryName(m.winnerEntryId) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// Admin bracket view + round-opener for a cMoon PvP tournament — reads the tournament's own
// CMoonPvpTournamentMatch rows (grouped by round) and offers "Open round N" once the previous
// round is fully resolved (server/api/admin/cmoon-pvp-tournaments/[id]/open-round.post.js is the
// real enforcement; this button is just when it LOOKS clickable). Each real pairing's own live
// match is linked server-side to CMoonPvpMatch via tournamentMatchId — this view only ever shows
// the bracket's outcome, never the live round-by-round combat itself.
import { computed, ref } from 'vue'

const props = defineProps({
  tournament: { type: Object, required: true },
})
const emit = defineEmits(['refresh'])

const opening = ref(false)
const openError = ref('')

const entryById = computed(() => new Map((props.tournament.entries || []).map(e => [e.id, e])))
function entryName(entryId) {
  if (!entryId) return '(bye)'
  return entryById.value.get(entryId)?.teamName || 'Unknown team'
}

const rounds = computed(() => {
  const matches = props.tournament.matches || []
  const byRound = new Map()
  for (const m of matches) {
    if (!byRound.has(m.roundNumber)) byRound.set(m.roundNumber, [])
    byRound.get(m.roundNumber).push(m)
  }
  return Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]).map(([roundNumber, roundMatches]) => ({ roundNumber, matches: roundMatches }))
})

// Mirrors bracketRoundLabel in server/utils/tournamentCore.js — kept as a small client-side copy
// rather than importing a server/utils path into the client bundle.
function roundLabel(roundNumber, matchCount) {
  if (matchCount <= 1) return 'Final'
  if (matchCount === 2) return 'Semifinals'
  if (matchCount === 4) return 'Quarterfinals'
  return `Round of ${matchCount * 2}`
}

const latestRound = computed(() => rounds.value[rounds.value.length - 1] || null)
const latestRoundComplete = computed(() => !!latestRound.value && latestRound.value.matches.every(m => !!m.winnerEntryId))

const canOpenRound = computed(() => {
  if (props.tournament.status === 'ENTRY_CLOSED') return true
  if (props.tournament.status === 'IN_PROGRESS') return latestRoundComplete.value && (latestRound.value?.matches.length || 0) > 1
  return false
})
const openRoundLabel = computed(() => {
  const next = (latestRound.value?.roundNumber || 0) + 1
  return `Open round ${next}`
})

async function openRound() {
  openError.value = ''
  opening.value = true
  try {
    await $fetch(`/api/admin/cmoon-pvp-tournaments/${props.tournament.id}/open-round`, { method: 'POST' })
    emit('refresh')
  } catch (e) {
    openError.value = e?.data?.statusMessage || 'Failed to open the next round'
  } finally {
    opening.value = false
  }
}
</script>
