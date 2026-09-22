<!-- components/OgGtoonMatchBoard.vue -->
<template>
  <div class="oggtoons-board text-white h-full flex flex-col">
    <div v-if="!matchState" class="flex-1 flex items-center justify-center">
      <p class="text-gray-300 animate-pulse">Loading match...</p>
    </div>

    <template v-else>
      <!-- Top bar: round + goal colors + scores -->
      <div class="flex items-center justify-between px-3 py-2 bg-black/30 flex-shrink-0 text-sm">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full border border-white/40" :style="{ background: colorHex(matchState.you.goalColor) }"></span>
          <span class="font-semibold">{{ matchState.you.username || 'You' }}</span>
          <span class="text-gray-300">({{ youScore }})</span>
        </div>
        <div class="font-bold">
          {{ matchState.suddenDeath ? 'Sudden Death' : `Round ${matchState.round} / ${matchState.totalRounds}` }}
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-gray-300">({{ oppScore }})</span>
          <span class="font-semibold">{{ matchState.opponent.username }}</span>
          <span class="w-3 h-3 rounded-full border border-white/40" :style="{ background: colorHex(matchState.opponent.goalColor) }"></span>
        </div>
      </div>

      <div v-if="matchState.opponentDropped" class="bg-amber-500/80 text-black text-xs text-center py-1">
        Opponent disconnected — waiting for them to reconnect...
      </div>

      <!-- Board: same layout scaled down for mobile, matching ClashGameBoard's approach -->
      <div class="flex-1 overflow-y-auto flex flex-col md:flex-row gap-4 p-3 transform scale-75 md:scale-100 origin-top">
        <!-- Your side -->
        <div class="flex-1 flex flex-col items-center gap-2">
          <div class="flex items-center gap-2">
            <img v-if="matchState.you.goalCard" :src="matchState.you.goalCard.assetPath" class="h-10 w-10 object-contain rounded border border-amber-400" :title="matchState.you.goalCard.name" />
            <span class="text-xs text-gray-300">Goal: {{ matchState.you.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in matchState.totalRounds" :key="'you-'+n" class="h-20 rounded border flex items-center justify-center bg-white/5"
                 :class="youRevealed[n-1] ? 'border-indigo-400' : 'border-dashed border-white/20'">
              <img v-if="youRevealed[n-1]" :src="youRevealed[n-1].assetPath" class="h-16 object-contain" :title="`${youRevealed[n-1].name} (${youRevealed[n-1].finalValue})`" />
              <span v-else class="text-[10px] text-gray-400">{{ n }}</span>
            </div>
          </div>
          <div class="flex gap-2 items-center mt-1">
            <button
              v-if="canCommit"
              @click="commit(matchState.round)"
              class="bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded text-sm"
            >Reveal Next Card ({{ matchState.you.cardsRemaining }} left)</button>
            <span v-else-if="matchState.you.ready" class="text-xs text-amber-300">Waiting for opponent...</span>
            <button
              v-if="!matchState.you.swapUsed && canCommit"
              @click="openSwapSheet"
              class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-xs"
            >Swap (10 pts)</button>
          </div>
        </div>

        <!-- Opponent side -->
        <div class="flex-1 flex flex-col items-center gap-2">
          <div class="flex items-center gap-2">
            <img v-if="matchState.opponent.goalCard" :src="matchState.opponent.goalCard.assetPath" class="h-10 w-10 object-contain rounded border border-amber-400" :title="matchState.opponent.goalCard.name" />
            <span class="text-xs text-gray-300">Goal: {{ matchState.opponent.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in matchState.totalRounds" :key="'opp-'+n" class="h-20 rounded border flex items-center justify-center bg-white/5"
                 :class="oppRevealed[n-1] ? 'border-indigo-400' : 'border-dashed border-white/20'">
              <img v-if="oppRevealed[n-1]" :src="oppRevealed[n-1].assetPath" class="h-16 object-contain" :title="`${oppRevealed[n-1].name} (${oppRevealed[n-1].finalValue})`" />
              <span v-else class="text-[10px] text-gray-400">{{ n }}</span>
            </div>
          </div>
          <span class="text-xs" :class="matchState.opponent.ready ? 'text-green-400' : 'text-gray-400'">
            {{ matchState.opponent.ready ? 'Committed' : 'Thinking...' }}
          </span>
        </div>
      </div>

      <!-- Reveal flash -->
      <transition name="fade">
        <div v-if="lastReveal" class="px-3 py-2 bg-black/40 text-xs flex items-center justify-center gap-3 flex-shrink-0">
          <span>You: <strong>{{ lastReveal.you.name }}</strong> ({{ lastReveal.you.finalValue }})</span>
          <span class="text-gray-400">vs</span>
          <span>Opp: <strong>{{ lastReveal.opponent.name }}</strong> ({{ lastReveal.opponent.finalValue }})</span>
        </div>
      </transition>

      <!-- Collapsible match log drawer -->
      <div class="flex-shrink-0 border-t border-white/10">
        <button @click="logOpen = !logOpen" class="w-full text-xs px-3 py-1.5 bg-black/30 text-left">
          {{ logOpen ? '▼' : '▶' }} Match Log
        </button>
        <div v-if="logOpen" class="max-h-32 overflow-y-auto px-3 py-2 text-xs space-y-1 bg-black/20">
          <div v-for="(r, i) in matchLog" :key="i">
            R{{ i + 1 }}: You {{ r.you }} vs Opp {{ r.opp }}
          </div>
          <p v-if="!matchLog.length" class="text-gray-400">No rounds revealed yet.</p>
        </div>
      </div>

      <!-- Swap bottom sheet: pick a card, then confirm -->
      <transition name="fade">
        <div v-if="swapSheetOpen" class="fixed inset-0 bg-black/50 z-40" @click="closeSwapSheet"></div>
      </transition>
      <transition name="slide-up">
        <div v-if="swapSheetOpen" class="fixed inset-x-0 bottom-0 bg-gray-900 border-t border-white/20 rounded-t-xl z-50 p-4 max-h-[70vh] overflow-y-auto">
          <h3 class="font-bold mb-3">Swap your up-next card</h3>
          <p class="text-xs text-gray-400 mb-3">Costs 10 points. You can only do this once per match, and only before you commit for the round.</p>
          <div class="grid grid-cols-4 gap-2 mb-4">
            <div
              v-for="(c, idx) in swapOptions"
              :key="idx"
              @click="swapPick = idx"
              :class="[
                'h-20 rounded border-2 flex items-center justify-center cursor-pointer',
                swapPick === idx ? 'border-amber-400 bg-amber-500/10' : 'border-white/20 bg-white/5'
              ]"
            >
              <span class="text-[10px] text-gray-300">Card {{ idx + 2 }}</span>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button @click="closeSwapSheet" class="px-4 py-2 bg-gray-700 rounded text-sm">Cancel</button>
            <button
              :disabled="swapPick === null"
              @click="confirmSwap"
              class="px-4 py-2 bg-indigo-500 disabled:opacity-50 rounded text-sm"
            >Swap for 10 pts</button>
          </div>
        </div>
      </transition>

      <!-- End-of-match result screen -->
      <transition name="fade">
        <div v-if="matchEnded" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div class="bg-gray-900 border border-white/20 rounded-xl p-6 w-80 text-center">
            <h2 class="text-2xl font-bold mb-2" :class="matchEnded.won ? 'text-green-400' : (matchEnded.outcome === 'TIE' ? 'text-amber-300' : 'text-red-400')">
              {{ matchEnded.outcome === 'TIE' ? "It's a Tie!" : (matchEnded.won ? 'You Win!' : 'You Lose') }}
            </h2>
            <p class="text-sm text-gray-300 mb-1">Final Score: {{ matchEnded.player1Score }} - {{ matchEnded.player2Score }}</p>
            <p class="text-xs text-gray-400 mb-4">{{ endReasonLabel }}</p>
            <button @click="$emit('exit')" class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm">Back to Lobby</button>
          </div>
        </div>
      </transition>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

defineEmits(['exit'])

const { matchState, lastReveal, matchEnded, commit, swap } = useOgGtoonsSocket()

const COLOR_HEX = {
  BLACK: '#cccccc', SILVER: '#c0c0c0', BLUE: '#60a5fa', RED: '#f87171',
  YELLOW: '#facc15', GREEN: '#4ade80', PURPLE: '#c084fc', ORANGE: '#fb923c', PINK: '#f472b6'
}
function colorHex(c) { return COLOR_HEX[c] || '#ffffff' }

const youRevealed = computed(() => matchState.value?.you?.revealed || [])
const oppRevealed = computed(() => matchState.value?.opponent?.revealed || [])
const youScore = computed(() => youRevealed.value.reduce((a, r) => a + (r.finalValue || 0), 0))
const oppScore = computed(() => oppRevealed.value.reduce((a, r) => a + (r.finalValue || 0), 0))
const canCommit = computed(() => matchState.value && !matchState.value.you.ready && matchState.value.you.cardsRemaining > 0)

const matchLog = computed(() => {
  const n = Math.min(youRevealed.value.length, oppRevealed.value.length)
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({ you: `${youRevealed.value[i].name} (${youRevealed.value[i].finalValue})`, opp: `${oppRevealed.value[i].name} (${oppRevealed.value[i].finalValue})` })
  }
  return out
})

const logOpen = ref(false)

const endReasonLabel = computed(() => {
  const r = matchEnded.value?.endReason
  if (r === 'forfeit') return 'Your opponent left the match.'
  if (r === 'sweep') return 'The match timed out.'
  return ''
})

// Swap: two-step confirm — pick a card, then a separate confirm button actually sends it.
const swapSheetOpen = ref(false)
const swapPick = ref(null)
const swapOptions = computed(() => {
  const remaining = matchState.value?.you?.cardsRemaining || 0
  // Only the count of still-unplayed cards (positions 1..remaining-1 relative to up-next) is
  // known client-side — their identities are intentionally never revealed before they're played.
  return Math.max(0, remaining - 1)
})

function openSwapSheet() { swapSheetOpen.value = true; swapPick.value = null }
function closeSwapSheet() { swapSheetOpen.value = false; swapPick.value = null }
function confirmSwap() {
  if (swapPick.value === null) return
  swap(swapPick.value + 1) // +1: index 0 is the up-next card itself, not swappable with itself
  closeSwapSheet()
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
.slide-up-enter-active, .slide-up-leave-active { transition: transform .25s ease }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%) }
</style>
