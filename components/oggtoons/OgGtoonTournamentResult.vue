<!-- components/oggtoons/OgGtoonTournamentResult.vue -->
<!-- Shown in place of the normal result screen when the game that just ended was one game of a
     tournament best-of-3. It says what the series stands at, and — if there is another game to
     play — lines both players up for it (auto-ready after a short countdown, with a cancel). -->
<template>
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3" role="dialog" aria-modal="true" aria-labelledby="ogt-result-title">
    <div class="bg-gray-900 border border-white/20 rounded-xl p-5 w-[28rem] max-w-full text-center text-white">
      <p class="text-[11px] uppercase tracking-wide text-gray-400">{{ tournament.name }} · {{ tournament.label }}</p>
      <h2 id="ogt-result-title" class="text-2xl font-bold mt-1" :class="headlineClass">{{ headline }}</h2>

      <p v-if="voided" class="text-sm text-amber-300 mt-1">This game did not count and will be replayed.</p>
      <p v-else class="text-sm text-gray-300 mt-1">Game {{ tournament.gameNumber }} of up to {{ tournament.bestOf }}</p>

      <!-- Series score -->
      <div v-if="series" class="mt-4">
        <div class="flex items-center justify-center gap-4">
          <div>
            <div class="text-4xl font-bold leading-none">{{ series.you }}</div>
            <div class="text-xs text-gray-400 mt-1">You</div>
          </div>
          <div class="text-gray-500 text-xl" aria-hidden="true">–</div>
          <div>
            <div class="text-4xl font-bold leading-none">{{ series.opponentWins }}</div>
            <div class="text-xs text-gray-400 mt-1">{{ series.opponentName }}</div>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-2">First to {{ winsNeeded }} game wins takes the series.</p>
        <div class="flex justify-center gap-1.5 mt-2" aria-label="Games so far">
          <span v-for="(g, i) in series.games" :key="i" class="text-[10px] px-1.5 py-0.5 rounded"
            :class="g === 'WIN' ? 'bg-green-500/30 text-green-200' : g === 'LOSS' ? 'bg-red-500/30 text-red-200' : 'bg-gray-500/30 text-gray-200'">
            {{ g === 'WIN' ? 'W' : g === 'LOSS' ? 'L' : g === 'TIE' ? 'T' : 'Void' }}
          </span>
        </div>
      </div>
      <p v-else-if="loading" class="text-sm text-gray-400 mt-4" aria-live="polite">Counting up the series…</p>
      <p v-else class="text-sm text-gray-400 mt-4">Open the tournament to see where the series stands.</p>

      <!-- What happens next -->
      <div v-if="series && series.decided" class="mt-4 p-3 rounded bg-white/5 border border-white/10" aria-live="polite">
        <p class="font-semibold" :class="series.won ? 'text-green-300' : series.won === false ? 'text-red-300' : 'text-amber-300'">
          {{ series.won ? 'You won the series!' : series.won === false ? 'You lost the series.' : 'The series ended level.' }}
        </p>
        <p class="text-xs text-gray-400 mt-1">
          {{ series.won || series.won == null ? 'You will be told when your next opponent is set.' : 'Thanks for playing — check the tournament for how it finishes.' }}
        </p>
      </div>
      <div v-else-if="series && !series.decided" class="mt-4 p-3 rounded bg-white/5 border border-white/10" aria-live="polite">
        <template v-if="myReady">
          <p class="font-semibold text-indigo-300">
            {{ opponentReady ? 'Starting the next game…' : `Ready — waiting for ${series.opponentName}` }}
          </p>
          <p class="text-xs text-gray-400 mt-1">Stay on this page. Your opponent has been notified.</p>
          <button class="mt-2 px-3 py-1.5 rounded bg-gray-600 hover:bg-gray-500 text-sm" @click="cancelReady">Not now</button>
        </template>
        <template v-else>
          <p class="font-semibold">Game {{ series.nextGameNumber }} is next</p>
          <p v-if="countdown !== null" class="text-xs text-gray-300 mt-1">
            Getting ready automatically in {{ countdown }}s
            <span v-if="opponentReady">· {{ series.opponentName }} is already ready</span>
          </p>
          <div class="mt-2 flex justify-center gap-2">
            <button class="px-4 py-2 rounded bg-green-500 hover:bg-green-600 text-sm font-semibold" @click="readyNow">Ready now</button>
            <button v-if="countdown !== null" class="px-3 py-2 rounded bg-gray-600 hover:bg-gray-500 text-sm" @click="stopCountdown">Not yet</button>
          </div>
        </template>
        <p v-if="errorText" class="text-xs text-red-300 mt-2" role="alert">{{ errorText }}</p>
      </div>

      <div class="flex gap-2 justify-center mt-4">
        <button class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm" @click="$emit('view-board')">View board</button>
        <button class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm" @click="$emit('exit')">Back to tournament</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

const props = defineProps({
  ended: { type: Object, required: true },      // the matchEnd payload
  tournament: { type: Object, required: true }   // { matchId, tournamentId, name, label, bestOf, gameNumber }
})
defineEmits(['exit', 'view-board'])

const { lastError, tournamentStates, tournamentReady, tournamentUnready, tournamentSync } = useOgGtoonsSocket()

const WINS_NEEDED = 2
const winsNeeded = WINS_NEEDED
const AUTO_READY_SECONDS = 45

const voided = computed(() => props.ended.outcome === 'INCOMPLETE')
const headline = computed(() => {
  if (voided.value) return 'Game voided'
  if (props.ended.outcome === 'TIE') return 'This game was a tie'
  return props.ended.won ? 'You won this game!' : 'You lost this game'
})
const headlineClass = computed(() => voided.value || props.ended.outcome === 'TIE' ? 'text-amber-300' : props.ended.won ? 'text-green-400' : 'text-red-400')

/* ── The series, read from the games (right the moment the game is saved) ───────────────── */
const series = ref(null)
const loading = ref(true)
let pollTimer = null
let polls = 0
const thisGameId = computed(() => props.ended.matchId)

async function loadSeries() {
  try {
    const r = await $fetch(`/api/game/oggtoons/tournaments/${props.tournament.tournamentId}/my-match`)
    const m = r?.match
    if (m && m.id === props.tournament.matchId) {
      // The just-finished game is written a moment after the result screen appears; wait for it.
      const counted = m.games.some(g => g.id === thisGameId.value)
      if (!counted && polls < 8) return false
      series.value = {
        you: m.you.wins, opponentWins: m.opponentWins, opponentName: m.opponent?.username || 'Opponent',
        games: m.games.map(g => g.result), decided: !!m.decided, nextGameNumber: m.nextGameNumber, won: null
      }
      return true
    }
    // The pairing is no longer open: the series was decided. Use how it was recorded.
    const l = r?.lastResult
    series.value = {
      you: l?.you ?? 0, opponentWins: l?.opponentWins ?? 0, opponentName: l?.opponentName || 'your opponent',
      games: [], decided: true, won: l ? (l.result === 'WIN' ? true : l.result === 'LOSS' ? false : null) : null
    }
    return true
  } catch { return false }
}

async function poll() {
  polls += 1
  const done = await loadSeries()
  if (done || polls >= 10) {
    loading.value = false
    clearInterval(pollTimer)
    pollTimer = null
    if (series.value && !series.value.decided) startCountdown()
  }
}

/* ── Ready for the next game ─────────────────────────────────────────────────────────────── */
const state = computed(() => tournamentStates.value[props.tournament.matchId] || null)
const myReady = computed(() => !!state.value?.myReady)
const opponentReady = computed(() => !!state.value?.opponentReady)
const countdown = ref(null)
const errorText = ref('')
let countdownTimer = null

function startCountdown() {
  if (myReady.value) return
  countdown.value = AUTO_READY_SECONDS
  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    if (countdown.value === null) return
    countdown.value -= 1
    if (countdown.value <= 0) { stopCountdown(); readyNow() }
  }, 1000)
}
function stopCountdown() {
  clearInterval(countdownTimer)
  countdownTimer = null
  countdown.value = null
}
function readyNow() {
  stopCountdown()
  errorText.value = ''
  tournamentReady(props.tournament.matchId)
}
function cancelReady() {
  tournamentUnready(props.tournament.matchId)
}

watch(lastError, (e) => {
  if (!e) return
  errorText.value = e.message || 'Something went wrong.'
  stopCountdown()
})

onMounted(() => {
  tournamentSync(props.tournament.matchId)
  poll()
  pollTimer = setInterval(poll, 1500)
})
onBeforeUnmount(() => {
  clearInterval(pollTimer)
  clearInterval(countdownTimer)
})
</script>
