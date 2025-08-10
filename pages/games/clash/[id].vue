<template>
  <Nav />
  <!-- Pregame: deck select + ready -->
  <div v-if="!game" class="pt-20">
    <div class="max-w-3xl mx-auto bg-white border rounded p-4">
      <h2 class="text-xl font-bold mb-3">gToons Clash – Pregame</h2>
      <div class="grid md:grid-cols-2 gap-4">
        <div class="border rounded p-3">
          <h3 class="font-semibold mb-2">Your Deck</h3>
          <select v-model="selectedDeckId" class="w-full border rounded px-2 py-1">
            <option disabled value="">Select a deck…</option>
            <option v-for="d in myDecks" :key="d.id" :value="d.id">
              {{ d.name }} ({{ d.size }})
            </option>
          </select>
          <button
            class="mt-3 px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
            :disabled="!selectedDeckId || myReady"
            @click="readyUp"
          >{{ myReady ? 'Ready!' : 'Start Game' }}</button>
        </div>
        <div class="border rounded p-3">
          <h3 class="font-semibold mb-2">Opponent</h3>
          <p class="text-sm">Deck: <span class="font-medium">{{ oppHasDeck ? 'Selected' : 'Not selected' }}</span></p>
          <p class="text-sm">Ready: <span class="font-medium">{{ oppReady ? 'Yes' : 'No' }}</span></p>
        </div>
      </div>
      <p class="mt-3 text-xs text-gray-500">
        Game will start automatically when both players selected a deck and clicked <em>Start Game</em>.
      </p>
    </div>
  </div>
  <section
    v-else
    class="pt-20 pb-36 md:pb-16 max-w-5xl mx-auto flex flex-col gap-6"
  >
    <!-- Mobile header -->
    <div
      v-if="game"
      class="md:hidden sticky top-14 z-30 bg-white border-b border-gray-200"
    >
      <div class="py-2 text-center text-sm text-gray-700">
        <template v-if="isSelecting">
          Select ({{ secondsLeft }}s) - Turn {{ game.turn }} / {{ game.maxTurns }}
        </template>
        <template v-else-if="game.phase==='reveal'">
          Reveal — <span class="capitalize">{{ game.priority }}</span> goes first
        </template>
        <template v-else-if="game.phase==='setup'">
          Setup
        </template>
      </div>
      <p class="py-1 px-4 text-center text-xs text-gray-600">
        {{ instructionText }}
      </p>
      <div v-if="isSelecting" class="h-2 w-full bg-gray-200 rounded">
        <div
          class="h-full bg-indigo-500 rounded"
          :style="{ width: progressPercent + '%' }"
        />
      </div>
    </div>

    <!-- Desktop header -->
    <h2 class="hidden md:block text-xl font-bold text-center mb-2">
      gToons Clash — Turn {{ game.turn }} / {{ game.maxTurns }}
      <span v-if="isSelecting" class="text-sm font-normal text-gray-600 ml-4">
        Select ({{ secondsLeft }}s)
      </span>
      <span v-else-if="game.phase==='reveal'" class="text-sm font-normal text-gray-600 ml-4">
        Reveal — <span class="capitalize">{{ game.priority }}</span>
      </span>
      <span v-else-if="game.phase==='setup'" class="text-sm font-normal text-gray-600 ml-4">
        Setup
      </span>
    </h2>
    <p
      v-if="instructionText"
      class="hidden md:block text-center text-sm text-gray-700"
    >
      {{ instructionText }}
    </p>
    <div v-if="isSelecting" class="hidden md:block h-2 w-full bg-gray-200 rounded">
      <div
        class="h-full bg-indigo-500 rounded"
        :style="{ width: progressPercent + '%' }"
      />
    </div>

    <!-- Game board -->
    <ClashGameBoard
      :lanes="game.lanes"
      :phase="isSelecting ? 'select' : game.phase"
      :priority="game.priority"
      :previewPlacements="placements"
      @place="handlePlace"
      @info="showCardInfo"
      :selected="selected"
      :confirmed="confirmed"
    />

    <!-- Battle log -->
    <div
      v-if="log.length"
      class="max-h-40 overflow-y-auto bg-white border rounded p-2 text-xs"
    >
      <div
        v-for="(entry,i) in [...log].reverse()"
        :key="i"
        class="mb-0.5"
      >
        {{ entry }}
      </div>
    </div>

    <!-- Player hand -->
    <ClashHand
      :cards="game.playerHand"
      :energy="game.playerEnergy"
      :selected="selected"
      :remaining-energy="remainingEnergy"
      :disabled="!isSelecting || confirmed"
      @select="c => (selected = c)"
      @info="showCardInfo"
    />

    <!-- Confirm buttons -->
    <button
      v-if="isSelecting"
      :disabled="confirmed || !canConfirm"
      @click="confirmSelections"
      class="fixed bottom-4 right-4 z-50 md:hidden bg-indigo-500 hover:bg-indigo-600 text-white p-3 rounded-full disabled:opacity-50 shadow-lg"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none"
           viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 13l4 4L19 7" />
      </svg>
    </button>
    <button
      v-if="isSelecting"
      :disabled="confirmed || !canConfirm"
      @click="confirmSelections"
      class="hidden md:inline-flex self-center bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded disabled:opacity-50 z-50"
    >
      {{ confirmed ? 'Waiting…' : `Confirm (${secondsLeft}s)` }}
    </button>

    <!-- Info modal -->
    <ClashCardInfoModal
      v-if="infoCard"
      :card="infoCard"
      @close="infoCard = null"
    />

    <!-- Game-over modal -->
    <transition name="fade">
      <div
        v-if="summary"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      >
        <div class="bg-white rounded-lg shadow-lg p-8 text-center w-72">
          <h3 class="text-2xl font-bold mb-4">
            {{
              summary.winner==='player'
                ? '🏆 You Win!'
                : summary.winner==='ai'
                  ? 'Defeat'
                  : summary.winner==='incomplete'
                    ? 'Game Incomplete'
                    : 'Tie'
            }}
          </h3>

          <p class="mb-6" v-if="summary.winner==='incomplete'">
            {{ summary.reason === 'opponent_disconnect'
                ? 'The other player disconnected.'
                : 'This game did not complete.'
            }}
          </p>

          <p class="mb-6" v-else>
            Lanes Won <br>
            - You:      {{ summary.playerLanesWon }}<br>
            - Opponent: {{ summary.aiLanesWon }}
          </p>
          <NuxtLink
            to="/games/clash/rooms"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
          >Play Again</NuxtLink>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { useAuth } from '@/composables/useAuth'
import ClashGameBoard from '@/components/ClashGameBoard.vue'
import ClashHand from '@/components/ClashHand.vue'
import ClashCardInfoModal from '@/components/ClashCardInfoModal.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

// — Auth & Deck Loading —
const { user, fetchSelf } = useAuth()
await fetchSelf()

// Pregame state
const myDecks = ref([])            // [{id,name,size}]
const selectedDeckId = ref('')
const myReady = ref(false)
const awaitingTurn = ref(null)
const oppReady = ref(false)
const oppHasDeck = ref(false)

// — Routing & Socket Setup —
const route = useRoute()
const router = useRouter()
const roomId = route.params.id

const game = ref(null)

const socket = io(
  import.meta.env.PROD
    ? undefined
    : `http://localhost:${useRuntimeConfig().public.socketPort}`
)

// Handle incoming events
socket.on('gameStart', state => { 
  game.value = state 
  startTimer(state.selectEndsAt)
})
socket.on('phaseUpdate', state => { game.value = state })
socket.on('gameEnd', sum   => { game.value = { ...game.value, summary: sum } })
socket.on('clashDecks', list => { myDecks.value = list || [] })
socket.on('pvpLobbyState', snap => {
  // snap = { players, usernames, haveDeck, ready }
  const me = String(user.value.id)
  const opp = (snap.players || []).find(p => p !== me)
  myReady.value   = !!snap.ready?.[me]
  oppReady.value  = !!snap.ready?.[opp]
  oppHasDeck.value = !!snap.haveDeck?.[opp]
})

onMounted(async () => {
  // 1) join the PvP room (no deck yet)
  socket.emit('joinClashRoom', { roomId, userId: user.value.id })
  // 2) fetch my saved decks for the dropdown
  socket.emit('listClashDecks', { userId: user.value.id })
})

async function readyUp() {
  if (!selectedDeckId.value) return
  // set the deck then mark ready
  socket.emit('setPvpDeck', { roomId, userId: user.value.id, deckId: selectedDeckId.value })
  socket.emit('readyPvp',   { roomId, userId: user.value.id, ready: true })
}

// — UI State —
const selected   = ref(null)
const placements = ref([])
const confirmed  = ref(false)
const log        = ref([])
const summary    = ref(null)
const infoCard   = ref(null)

// — Timer Logic —
const secondsLeft = ref(60)
let timerId = null

function startTimer(deadline) {
  clearInterval(timerId)
  if (!deadline) return
  timerId = setInterval(() => {
    secondsLeft.value = Math.max(0,
      Math.ceil((deadline - Date.now())/1000)
    )
    if (secondsLeft.value === 0) {
      clearInterval(timerId)
    }
  }, 1000)
}

// — Computed Flags —
const isSelecting = computed(
  () => game.value && ['select','setup'].includes(game.value.phase)
)

const progressPercent = computed(
  () => Math.max(0, Math.min(100, (secondsLeft.value/60)*100))
)

const hasPlayable = computed(
  () => game.value.playerHand.some(c => c.cost <= game.value.playerEnergy)
)

const canConfirm = computed(() =>
  placements.value.length > 0 || !hasPlayable.value
)

const pendingCost = computed(() =>
  placements.value.reduce((s,p) => s + (p.card.cost || 0), 0)
)

const remainingEnergy = computed(() =>
  game.value.playerEnergy - pendingCost.value
)

const instructionText = computed(() => {
  if (!game.value) return ''
  if (game.value.phase === 'setup')
    return 'Prepare your first move – select a card and place it on a lane.'
  if (game.value.phase === 'select') {
    if (confirmed.value) return 'Waiting for opponent…'
    if (!selected.value) return 'Click a card, then a lane to place it.'
    return 'Choose a lane and confirm your selection.'
  }
  if (game.value.phase === 'reveal')
    return game.value.priority === 'player'
      ? 'You attack first – watch the reveal!'
      : 'Opponent attacks first – watch the reveal.'
  return ''
})

// — UI Actions —
function showCardInfo(card) {
  infoCard.value = card
}

function handlePlace(laneIdx) {
  if (!isSelecting.value || confirmed.value || !selected.value) return
  // toggle placement
  const idx = placements.value.findIndex(p => p.card === selected.value)
  if (idx >= 0) {
    placements.value.splice(idx, 1)
    return
  }
  // ensure within energy
  if (selected.value.cost + pendingCost.value > game.value.playerEnergy) return
  placements.value.push({ card: selected.value, laneIndex: laneIdx })
}

function confirmSelections() {
  if (confirmed.value || !canConfirm.value) return
  const selections = placements.value.map(p => ({
    cardId:    p.card.id,
    laneIndex: p.laneIndex
  }))
  socket.emit('selectPvPCards', { selections })
  confirmed.value = true
  awaitingTurn.value = game.value?.turn ?? null
}

function resetLocal() {
  placements.value = []
  confirmed.value  = false
  selected.value   = null
}

// — Real-time Sync —
socket.on('phaseUpdate', state => {
  const prevTurn = game.value?.turn ?? null
  game.value = state

  if (state.phase === 'select') {
    startTimer(state.selectEndsAt)

    // If we had confirmed for prev turn, don't re-enable the hand
    // until the server advances the turn.
    if (
      confirmed.value &&
      awaitingTurn.value != null &&
      state.turn > awaitingTurn.value
    ) {
      resetLocal()               // clears placements, sets confirmed=false
      awaitingTurn.value = null  // clear the guard for the new turn
    }
  } else {
    clearInterval(timerId)
  }
})

socket.on('gameEnd', sum => {
  summary.value = sum
  clearInterval(timerId)
})

// — Cleanup —
onBeforeUnmount(() => {
  // tell server we left this clash room
  if (roomId && user.value?.id) {
    socket.emit('leaveClashRoom', { roomId, userId: user.value.id })
  }

  socket.emit('leaveClashRoom', { roomId, userId: user.value?.id })
  socket.off('gameStart')
  socket.off('phaseUpdate')
  socket.off('gameEnd')
  clearInterval(timerId)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
