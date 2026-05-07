<template>
  <NuxtLayout name="newsite-template">
    <template #main-content>
      <div class="play-wrapper">
        <!-- Mobile-only sticky timer + instructions -->
        <div
          v-if="game"
          class="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200"
        >
          <div class="py-2 text-center text-sm text-gray-700">
            <template v-if="isSelecting">
              Select ({{ secondsLeft }}s) - Turn {{ game.turn }} out of {{ game.maxTurns }}
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

        <!-- No-game guard -->
        <div v-if="!game" class="flex items-center justify-center h-full">
          <p class="text-gray-400">
            No active match.
            <NuxtLink to="/newsite/gtoons" class="text-indigo-400 underline">
              Start a new game
            </NuxtLink>.
          </p>
        </div>

        <!-- Main board -->
        <div v-else class="play-board">
          <!-- Desktop header -->
          <h2 class="hidden md:block text-lg font-bold text-center mb-2">
            gToons Clash — Turn {{ game.turn }} / {{ game.maxTurns }}
            <span v-if="isSelecting" class="text-sm font-normal text-gray-400 ml-4">
              Select ({{ secondsLeft }}s)
            </span>
            <span v-else-if="game.phase === 'reveal'" class="text-sm font-normal text-gray-400 ml-4">
              Reveal — <span class="capitalize">{{ game.priority }}</span> goes first
            </span>
            <span v-else-if="game.phase === 'setup'" class="text-sm font-normal text-gray-400 ml-4">
              Setup
            </span>
          </h2>

          <!-- Progress bar -->
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
            @info="showCardInfo"
            @unplace="handleUnplace"
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

          <!-- Player hand & energy -->
          <ClashHand
            :cards="game.playerHand"
            :energy="game.playerEnergy"
            :status="instructionText"
            :selected="selected"
            :remaining-energy="remainingEnergy"
            :disabled="!isSelecting || confirmed"
            @select="c => (selected = c)"
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

          <!-- card-info modal -->
          <CardInfoModal
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
                <h3 class="text-2xl font-bold mb-4 text-gray-800">
                  {{
                    summary.winner === 'player'
                      ? '🏆 You Win!'
                      : summary.winner === 'ai'
                        ? 'Defeat'
                        : 'Tie'
                  }}
                </h3>
                <p class="mb-6 text-gray-700">
                  Lanes Won: You {{ summary.playerLanesWon }} – AI {{ summary.aiLanesWon }}
                </p>
                <div v-if="laneScores.length" class="mb-6 text-left text-sm">
                  <p class="text-center font-medium text-gray-700 mb-2">Lane Scores</p>
                  <div class="space-y-1">
                    <div
                      v-for="(lane, index) in laneScores"
                      :key="`${lane.name}-${index}`"
                      class="flex items-center justify-between gap-3"
                    >
                      <span class="font-medium text-gray-700">{{ lane.name }}</span>
                      <span class="text-gray-700">You {{ lane.playerScore }} - AI {{ lane.aiScore }}</span>
                    </div>
                  </div>
                </div>
                <p v-if="summary.winner === 'player'" class="mb-4 text-indigo-600 font-medium">
                  You earned {{ summary.pointsAwarded }} point<span v-if="summary.pointsAwarded !== 1">s</span>!
                </p>
                <NuxtLink
                  to="/newsite/gtoons"
                  class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
                >
                  Play Again
                </NuxtLink>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </template>
  </NuxtLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useClashSocket } from '@/composables/useClashSocket'
import { useAuth } from '@/composables/useAuth'
import ClashGameBoard from '@/components/ClashGameBoard.vue'
import ClashHand from '@/components/ClashHand.vue'
import CardInfoModal from '@/components/ClashCardInfoModal.vue'

definePageMeta({
  layout: false,
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  showSidebar: false,
  showFooter: false,
  mainContentBorder: false,
})

const { socket, battleState } = useClashSocket()
const { user } = useAuth()
const game = computed(() => battleState.value)

const selected = ref(null)
const placements = ref([])
const confirmed = ref(false)
const log = ref([])
const summary = ref(null)
const infoCard = ref(null)

function showCardInfo(card) {
  infoCard.value = card
}

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

const MAX_PER_LANE = 4
const playerLaneCount = lane => (lane.player?.length ?? lane.playerCards?.length ?? 0)

const hasOpenLane = computed(() => !!game.value?.lanes?.some(l => playerLaneCount(l) < MAX_PER_LANE))
const allPlayerLanesFull = computed(() => !!game.value?.lanes?.every(l => playerLaneCount(l) >= MAX_PER_LANE))
const hasPlayable = computed(() =>
  hasOpenLane.value && game.value.playerHand.some(c => c.cost <= game.value.playerEnergy)
)
const canConfirm = computed(() => placements.value.length > 0 || !hasPlayable.value)

const pendingCost = computed(() => placements.value.reduce((sum, p) => sum + (p.card.cost || 0), 0))
const remainingEnergy = computed(() => game.value.playerEnergy - pendingCost.value)

const isSelecting = computed(
  () => game.value && (game.value.phase === 'select' || game.value.phase === 'setup')
)
const progressPercent = computed(() => Math.max(0, Math.min(100, (secondsLeft.value / 60) * 100)))

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

function wireSocket() {
  socket.on('connect', () => {
    if (battleState.value?.id && !summary.value && user.value?.id) {
      socket.emit('pve:rejoin', { gameId: battleState.value.id, userId: user.value.id })
    }
  })

  socket.on('phaseUpdate', state => {
    battleState.value = state
    if (state.phase === 'select' || state.phase === 'setup') {
      startTimer(state.selectEndsAt)
    } else {
      clearInterval(timerId)
      secondsLeft.value = 0
    }
    if ((state.phase === 'select' || state.phase === 'setup') && confirmed.value) {
      resetLocal()
    }
  })

  socket.on('gameEnd', sum => {
    summary.value = sum
    clearInterval(timerId)
  })
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

  const sameCard = (a, b) =>
    !!a && !!b && (a === b || (a.userCtoonId && b.userCtoonId && a.userCtoonId === b.userCtoonId))
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
  const good = placements.value.filter(p => p && p.card && p.laneIndex != null)
  const selections = good.map(p => ({
    cardId: p.card.userCtoonId ?? p.card.instanceId ?? p.card.id ?? p.card.ctoonId,
    laneIndex: p.laneIndex
  }))
  socket.emit('selectCards', { selections })
  confirmed.value = true
  placements.value = []
}

function resetLocal() {
  placements.value = []
  confirmed.value = false
  selected.value = null
}

onMounted(() => { wireSocket() })

onBeforeUnmount(() => {
  socket.off('connect')
  socket.off('phaseUpdate')
  socket.off('gameEnd')
  clearInterval(timerId)
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

.play-board {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  gap: 8px;
}

.fade-enter-active,
.fade-leave-active { transition: opacity .3s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
