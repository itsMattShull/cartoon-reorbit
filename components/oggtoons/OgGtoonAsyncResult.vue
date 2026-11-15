<!-- components/oggtoons/OgGtoonAsyncResult.vue -->
<!-- Shown when an async + live tournament game is over. Unlike the both-online result card there is no "get ready" countdown:
     the next game is created for you the moment this one ends (if the round has time for it), so this says where the series
     stands and links straight to it. It also covers a game that was CLOSED because the match was decided some other way
     (deadline, forfeit, admin) — which is not "voided, will be replayed". -->
<template>
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3" role="dialog" aria-modal="true" aria-labelledby="ogt-async-title">
    <div class="bg-gray-900 border border-white/20 rounded-xl p-5 w-[28rem] max-w-full max-h-[calc(100dvh-1rem)] overflow-y-auto text-center text-white">
      <p class="text-[11px] uppercase tracking-wide text-gray-400">{{ tournament.name }} · {{ tournament.label }}</p>
      <h2 id="ogt-async-title" class="text-2xl font-bold mt-1" :class="headlineClass">{{ headline }}</h2>
      <p v-if="!closed" class="text-sm text-gray-300 mt-1">Game {{ tournament.gameNumber }} of up to {{ tournament.bestOf }}</p>
      <p v-else class="text-sm text-amber-200 mt-2">{{ closedText }}</p>

      <div v-if="series" class="mt-4">
        <div class="flex items-center justify-center gap-4">
          <div><div class="text-4xl font-bold leading-none">{{ series.you }}</div><div class="text-xs text-gray-400 mt-1">You</div></div>
          <div class="text-gray-500 text-xl" aria-hidden="true">–</div>
          <div><div class="text-4xl font-bold leading-none">{{ series.opponentWins }}</div><div class="text-xs text-gray-400 mt-1">{{ series.opponentName }}</div></div>
        </div>
        <p class="text-xs text-gray-400 mt-2">First to 2 game wins takes the series.</p>
      </div>
      <p v-else-if="loading" class="text-sm text-gray-400 mt-4" aria-live="polite">Counting up the series…</p>

      <div class="mt-4 p-3 rounded bg-white/5 border border-white/10" aria-live="polite">
        <template v-if="series && series.decided">
          <p class="font-semibold" :class="series.won ? 'text-green-300' : series.won === false ? 'text-red-300' : 'text-amber-300'">
            {{ series.won ? 'You won the match!' : series.won === false ? 'You lost the match.' : 'The match ended level.' }}
          </p>
          <p class="text-xs text-gray-400 mt-1">{{ series.won || series.won == null ? 'You will be told when your next opponent is set.' : 'Thanks for playing — check the tournament for how it finishes.' }}</p>
        </template>
        <template v-else-if="nextGameId">
          <p class="font-semibold text-green-300">The next game is ready.</p>
          <p class="text-xs text-gray-400 mt-1">No need to press Start again. Play it now, or any time before the deadline.</p>
          <button class="mt-2 px-4 py-2 rounded bg-green-500 hover:bg-green-600 text-sm font-semibold" @click="$emit('open-game', nextGameId)">Go to the next game</button>
        </template>
        <template v-else>
          <p class="font-semibold">Waiting on the match</p>
          <p class="text-xs text-gray-400 mt-1">The next game starts as soon as it can; if the round has run too short for another game, the match is decided from the score. Check the tournament page for where it stands.</p>
        </template>
      </div>

      <div class="flex gap-2 justify-center mt-4">
        <button class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm" @click="$emit('view-board')">View board</button>
        <button class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm" @click="$emit('exit')">Back to tournament</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  ended: { type: Object, required: true },       // the game's final view: { over, closed, closedResolution, outcome, won, ... }
  tournament: { type: Object, required: true },  // { matchId, tournamentId, name, label, bestOf, gameNumber }
  nextGameId: { type: String, default: null }    // the next game of the series, once there is one
})
defineEmits(['exit', 'view-board', 'open-game'])

const closed = computed(() => !!props.ended.closed)
const headline = computed(() => {
  if (closed.value) return 'This game was closed'
  if (props.ended.outcome === 'TIE') return 'This game was a tie'
  return props.ended.won ? 'You won this game!' : 'You lost this game'
})
const headlineClass = computed(() => closed.value || props.ended.outcome === 'TIE' ? 'text-amber-300' : props.ended.won ? 'text-green-400' : 'text-red-400')

const HOW = {
  FORFEIT: 'a forfeit',
  WALKOVER: 'a walkover (one player did not press Start in time)',
  DEADLINE: 'the deadline',
  ADMIN: 'an admin decision'
}
const closedText = computed(() => {
  const how = HOW[props.ended.closedResolution]
  return how
    ? `The match was decided by ${how}, so this unfinished game does not count.`
    : 'The match was decided before this game finished, so it does not count.'
})

/* The series, read from the pairing (right as soon as the game is saved: it is written in the same step as the result). */
const series = ref(null)
const loading = ref(true)
onMounted(async () => {
  try {
    const r = await $fetch(`/api/game/oggtoons/tournaments/${props.tournament.tournamentId}/my-match`)
    const m = r?.match
    if (m && m.id === props.tournament.matchId) {
      series.value = { you: m.you.wins, opponentWins: m.opponentWins, opponentName: m.opponent?.username || 'Opponent', decided: !!m.decided, won: null }
    } else {
      // The pairing is no longer open: the match was decided. Use how it was recorded.
      const l = r?.lastResult
      series.value = {
        you: l?.you ?? 0, opponentWins: l?.opponentWins ?? 0, opponentName: l?.opponentName || 'your opponent', decided: true,
        won: l ? (l.result === 'WIN' ? true : l.result === 'LOSS' ? false : null) : null
      }
    }
  } catch { /* the card still says what happened to this game */ }
  loading.value = false
})
</script>
