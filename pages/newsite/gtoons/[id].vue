<template>
  <div class="play-wrapper">
        <!-- Pregame: deck select + ready -->
        <div v-if="!game" class="pregame-panel">
          <div class="max-w-2xl mx-auto bg-white/10 border border-white/20 rounded-lg p-5">
            <h2 class="text-lg font-bold mb-3">gToons Clash – Pregame</h2>
            <div class="grid md:grid-cols-2 gap-4">
              <div class="border border-white/20 rounded p-3">
                <h3 class="font-semibold mb-2 text-sm">Your Deck</h3>
                <select v-model="selectedDeckId" class="w-full border rounded px-2 py-1 text-gray-800 text-sm">
                  <option disabled value="">Select a deck…</option>
                  <option v-for="d in myDecks" :key="d.id" :value="d.id">
                    {{ d.name }} ({{ d.size }})
                  </option>
                </select>

                <p v-if="roomStake > 0 && !myReady" class="mt-2 text-xs text-gray-300">
                  By clicking this button you agree to bet
                  <span class="font-semibold">{{ roomStake.toLocaleString() }}</span> points.
                </p>

                <button
                  class="mt-3 px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50 text-sm"
                  :disabled="!selectedDeckId || myReady"
                  @click="readyUp"
                >{{ myReady ? 'Ready!' : 'Start Game' }}</button>
                <p v-if="matchError" class="mt-2 text-xs text-red-400">{{ matchError }}</p>
              </div>
              <div class="border border-white/20 rounded p-3">
                <h3 class="font-semibold mb-2 text-sm">Opponent</h3>
                <p class="text-sm text-gray-300">User: <span class="font-medium text-white">{{ oppUsername || 'Waiting…' }}</span></p>
                <p class="text-sm text-gray-300">Deck: <span class="font-medium text-white">{{ oppHasDeck ? 'Selected' : 'Not selected' }}</span></p>
                <p class="text-sm text-gray-300">Ready: <span class="font-medium text-white">{{ oppReady ? 'Yes' : 'No' }}</span></p>
              </div>
            </div>
            <p class="mt-3 text-xs text-gray-400">
              Game will start automatically when both players selected a deck and clicked <em>Start Game</em>.
            </p>
          </div>
        </div>

        <!-- Active game board -->
        <div v-else class="play-board">
          <!-- Mobile sticky header -->
          <div class="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200">
            <div class="py-2 text-center text-sm text-gray-700">
              <template v-if="isSelecting">
                Select ({{ secondsLeft }}s) - Turn {{ game.turn }} / {{ game.maxTurns }}
              </template>
              <template v-else-if="game.phase === 'reveal'">
                Reveal — <span class="capitalize">{{ game.priority }}</span> goes first
              </template>
              <template v-else-if="game.phase === 'setup'">
                Setup
              </template>
            </div>
            <div v-if="isSelecting" class="h-2 w-full bg-gray-200 rounded">
              <div class="h-full bg-indigo-500 rounded" :style="{ width: progressPercent + '%' }" />
            </div>
          </div>

          <!-- Desktop header -->
          <h2 class="hidden md:block text-lg font-bold text-center mb-2">
            gToons Clash — Turn {{ game.turn }} / {{ game.maxTurns }}
            <span v-if="isSelecting" class="text-sm font-normal text-gray-400 ml-4">
              Select ({{ secondsLeft }}s)
            </span>
            <span v-else-if="game.phase === 'reveal'" class="text-sm font-normal text-gray-400 ml-4">
              Reveal — <span class="capitalize">{{ game.priority }}</span>
            </span>
            <span v-else-if="game.phase === 'setup'" class="text-sm font-normal text-gray-400 ml-4">
              Setup
            </span>
          </h2>

          <div v-if="isSelecting" class="hidden md:block h-2 w-full bg-gray-200 rounded mb-2">
            <div class="h-full bg-indigo-500 rounded" :style="{ width: progressPercent + '%' }" />
          </div>

          <!-- Game board -->
          <ClashGameBoard
            :lanes="game.lanes"
            :phase="isSelecting ? 'select' : game.phase"
            :priority="game.priority"
            :previewPlacements="placements"
            @place="handlePlace"
            @unplace="handleUnplace"
            @info="showCardInfo"
            :selected="selected"
            :confirmed="confirmed"
          />

          <!-- Battle log -->
          <div
            v-if="log.length"
            class="max-h-28 overflow-y-auto bg-white/10 border border-white/20 rounded p-2 text-xs mt-2"
          >
            <div v-for="(entry, i) in [...log].reverse()" :key="i" class="mb-0.5">{{ entry }}</div>
          </div>

          <!-- Player hand -->
          <ClashHand
            :cards="game.playerHand"
            :energy="game.playerEnergy"
            :selected="selected"
            :status="instructionText"
            :remaining-energy="remainingEnergy"
            :disabled="!isSelecting || confirmed"
            @select="selectFromHand"
            @info="showCardInfo"
          />

          <!-- Mobile confirm button -->
          <button
            v-if="isSelecting"
            :disabled="confirmed || !canConfirm"
            @click="confirmSelections"
            class="fixed bottom-4 right-4 z-50 md:hidden bg-indigo-500 hover:bg-indigo-600 text-white p-3 rounded-full disabled:opacity-50 shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </button>

          <!-- Desktop confirm button -->
          <button
            v-if="isSelecting"
            :disabled="confirmed || !canConfirm"
            @click="confirmSelections"
            class="hidden md:inline-flex self-center bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded disabled:opacity-50 mt-2"
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
            <div v-if="summary" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div class="bg-white rounded-lg shadow-lg p-8 text-center w-72">
                <h3 class="text-2xl font-bold mb-4 text-gray-800">
                  {{
                    summary.winner === 'player'
                      ? '🏆 You Win!'
                      : summary.winner === 'ai'
                        ? 'Defeat'
                        : summary.winner === 'incomplete'
                          ? 'Game Incomplete'
                          : 'Tie'
                  }}
                </h3>

                <div class="mb-6 space-y-2">
                  <template v-if="summary.winner === 'incomplete'">
                    <p class="text-gray-700">
                      {{ summary.reason === 'opponent_disconnect'
                          ? 'The other player disconnected.'
                          : 'This game did not complete.' }}
                    </p>
                    <div v-if="laneScores.length" class="mt-3 text-left text-sm">
                      <p class="text-center font-medium text-gray-700 mb-2">Lane Scores</p>
                      <div class="space-y-1">
                        <div
                          v-for="(lane, index) in laneScores"
                          :key="`${lane.name}-${index}`"
                          class="flex items-center justify-between gap-3"
                        >
                          <span class="font-medium text-gray-700">{{ lane.name }}</span>
                          <span class="text-gray-700">You {{ lane.playerScore }} - Opponent {{ lane.aiScore }}</span>
                        </div>
                      </div>
                    </div>
                    <p v-if="Number(summary.stakeAwarded) > 0" class="mt-1 text-gray-700">
                      You were awarded
                      <strong>{{ Number(summary.stakeAwarded).toLocaleString() }}</strong>
                      points from the stake.
                    </p>
                  </template>

                  <template v-else>
                    <p class="text-gray-700">
                      Lanes Won<br>
                      - You: {{ summary.playerLanesWon }}<br>
                      - Opponent: {{ summary.aiLanesWon }}
                    </p>
                    <div v-if="laneScores.length" class="mt-3 text-left text-sm">
                      <p class="text-center font-medium text-gray-700 mb-2">Lane Scores</p>
                      <div class="space-y-1">
                        <div
                          v-for="(lane, index) in laneScores"
                          :key="`${lane.name}-${index}`"
                          class="flex items-center justify-between gap-3"
                        >
                          <span class="font-medium text-gray-700">{{ lane.name }}</span>
                          <span class="text-gray-700">You {{ lane.playerScore }} - Opponent {{ lane.aiScore }}</span>
                        </div>
                      </div>
                    </div>
                    <p v-if="Number(summary.stakeAwarded) > 0" class="mt-1 text-gray-700">
                      {{ summary.winner === 'tie' ? 'Returned' : 'You won' }}
                      <strong>{{ Number(summary.stakeAwarded).toLocaleString() }}</strong>
                      points.
                    </p>
                    <p v-if="Number(summary.pointsAwarded) > 0" class="mt-1 text-sm text-gray-600">
                      (+{{ Number(summary.pointsAwarded).toLocaleString() }} bonus points)
                    </p>
                  </template>
                </div>

                <NuxtLink
                  to="/newsite/gtoons"
                  class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
                >Play Again</NuxtLink>
              </div>
            </div>
          </transition>
        </div>
      </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'
import { useAuth } from '@/composables/useAuth'
import ClashGameBoard from '@/components/ClashGameBoard.vue'
import ClashHand from '@/components/ClashHand.vue'
import ClashCardInfoModal from '@/components/ClashCardInfoModal.vue'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  showSidebar: false,
  showFooter: false,
  mainContentBorder: false,
  title: 'gToons Clash Match',
  description: 'Live gToons Clash card battle match on Cartoon ReOrbit.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const { user, fetchSelf } = useAuth()
await fetchSelf()

const myDecks = ref([])
const selectedDeckId = ref('')
const myReady = ref(false)
const awaitingTurn = ref(null)
const oppReady = ref(false)
const oppHasDeck = ref(false)
const oppUsername = ref('')
const roomStake = ref(0)
const matchError = ref('')

const route = useRoute()
const roomId = route.params.id
const game = ref(null)

const MAX_PER_LANE = 4
const playerLaneCount = lane => (lane.player?.length ?? lane.playerCards?.length ?? 0)

const hasOpenLane = computed(() => !!game.value?.lanes?.some(l => playerLaneCount(l) < MAX_PER_LANE))
const allPlayerLanesFull = computed(() => !!game.value?.lanes?.every(l => playerLaneCount(l) >= MAX_PER_LANE))

const socket = io(
  import.meta.env.PROD
    ? undefined
    : `http://localhost:${useRuntimeConfig().public.socketPort}`
)

socket.on('gameStart', state => {
  matchError.value = ''
  game.value = state
  startTimer(state.selectEndsAt)
})

socket.on('clashDecks', list => { myDecks.value = list || [] })

socket.on('pvpStakeError', ({ message }) => {
  matchError.value = message || 'Failed to start match.'
  myReady.value = false
})

socket.on('deckError', ({ message }) => {
  matchError.value = message || 'Invalid deck selection.'
  myReady.value = false
})

socket.on('joinError', ({ message }) => {
  matchError.value = message || 'Could not join room.'
})

socket.on('pvpLobbyState', snap => {
  const me  = String(user.value.id)
  const opp = (snap.players || []).find(p => p !== me)
  myReady.value    = !!snap.ready?.[me]
  oppReady.value   = !!snap.ready?.[opp]
  oppHasDeck.value = !!snap.haveDeck?.[opp]
  oppUsername.value = opp ? (snap.usernames?.[opp] || 'Unknown') : 'Waiting…'
  const raw = Number(snap.points ?? snap.stakePoints ?? 0)
  roomStake.value = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
})

onMounted(() => {
  socket.emit('joinClashRoom', { roomId, userId: user.value.id })
  socket.emit('listClashDecks', { userId: user.value.id })
  socket.on('connect', () => {
    socket.emit('joinClashRoom', { roomId, userId: user.value.id })
    socket.emit('listClashDecks', { userId: user.value.id })
  })
})

function readyUp() {
  if (!selectedDeckId.value) return
  matchError.value = ''
  socket.emit('readyUpWithDeck', { roomId, userId: user.value.id, deckId: selectedDeckId.value })
}

const selected   = ref(null)
const placements = ref([])
const confirmed  = ref(false)
const log        = ref([])
const summary    = ref(null)
const infoCard   = ref(null)

const secondsLeft = ref(60)
let timerId = null

function startTimer(deadline) {
  clearInterval(timerId)
  if (!deadline) return
  timerId = setInterval(() => {
    secondsLeft.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (secondsLeft.value === 0) clearInterval(timerId)
  }, 1000)
}

const isSelecting = computed(() => game.value && ['select', 'setup'].includes(game.value.phase))
const progressPercent = computed(() => Math.max(0, Math.min(100, (secondsLeft.value / 60) * 100)))

const hasPlayable = computed(() =>
  hasOpenLane.value && game.value.playerHand.some(c => c.cost <= game.value.playerEnergy)
)
const canConfirm = computed(() => placements.value.length > 0 || !hasPlayable.value)
const pendingCost = computed(() => placements.value.reduce((s, p) => s + (p.card.cost || 0), 0))
const remainingEnergy = computed(() => game.value.playerEnergy - pendingCost.value)

const instructionText = computed(() => {
  if (!game.value) return ''
  if (game.value.phase === 'setup') return 'Prepare your first move – select a card and place it on a lane.'
  if (game.value.phase === 'select') {
    if (confirmed.value) return 'Waiting for opponent…'
    if (allPlayerLanesFull.value) return 'All your lanes are full — confirm to end your turn without placing.'
    if (!selected.value) return 'Click a card, then a lane to place it.'
    return 'Choose a lane and confirm your selection.'
  }
  if (game.value.phase === 'reveal')
    return game.value.priority === 'player' ? 'You attack first – watch the reveal!' : 'Opponent attacks first – watch the reveal.'
  return ''
})

const laneScores = computed(() => {
  if (!game.value?.lanes?.length) return []
  return game.value.lanes.map((lane, index) => {
    const playerScore = (lane.player || []).reduce((sum, card) => sum + (card.power || 0), 0)
    const aiScore = (lane.ai || []).reduce((sum, card) => sum + (card.power || 0), 0)
    return { name: lane.name || `Lane ${index + 1}`, playerScore, aiScore }
  })
})

function showCardInfo(card) { infoCard.value = card }

function sameCard(a, b) {
  if (!a || !b) return false
  return (
    a === b ||
    (a.userCtoonId && b.userCtoonId && a.userCtoonId === b.userCtoonId) ||
    (a.instanceId && b.instanceId && a.instanceId === b.instanceId)
  )
}

function selectFromHand(c) {
  selected.value = sameCard(selected.value, c) ? null : c
}

function handlePlace(laneIdx) {
  if (!isSelecting.value || confirmed.value || !selected.value) return
  const lane = game.value?.lanes?.[laneIdx]
  if (!lane) return
  const pendingInLane = placements.value.filter(p => p.laneIndex === laneIdx).length
  if (playerLaneCount(lane) + pendingInLane >= MAX_PER_LANE) {
    log.value.push('That lane is full.')
    return
  }
  const idx = placements.value.findIndex(p => sameCard(p.card, selected.value))
  if (idx >= 0) {
    placements.value.splice(idx, 1)
    return
  }
  placements.value.push({ card: selected.value, laneIndex: laneIdx })
  selected.value = null
}

function handleUnplace(laneIdx) {
  if (!isSelecting.value || confirmed.value) return
  for (let i = placements.value.length - 1; i >= 0; i--) {
    if (placements.value[i].laneIndex === laneIdx) {
      const [removed] = placements.value.splice(i, 1)
      selected.value = removed.card
      break
    }
  }
}

function confirmSelections() {
  if (confirmed.value || !canConfirm.value) return
  const selections = placements.value.map(p => ({
    cardId: p.card.userCtoonId ?? p.card.instanceId ?? p.card.id ?? p.card.ctoonId,
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

socket.on('phaseUpdate', state => {
  const prevTurn = game.value?.turn ?? null
  game.value = state
  if (state.phase === 'select') {
    startTimer(state.selectEndsAt)
    if (confirmed.value && awaitingTurn.value != null && state.turn > awaitingTurn.value) {
      resetLocal()
      awaitingTurn.value = null
    }
  } else {
    clearInterval(timerId)
  }
})

socket.on('gameEnd', sum => {
  summary.value = sum
  clearInterval(timerId)
})

onBeforeUnmount(() => {
  if (roomId && user.value?.id) {
    socket.emit('leaveClashRoom', { roomId, userId: user.value.id })
  }
  clearInterval(timerId)
  socket.disconnect()
})
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.play-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  color: white;
}

.pregame-panel {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  align-items: flex-start;
}

.play-board {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  gap: 8px;
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
