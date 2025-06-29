<!-- pages/games/clash/play.vue -->
 <template>
  <Nav />

  <!-- Mobile-only sticky timer + instructions -->
  <div
    v-if="game"
    class="md:hidden sticky top-14 z-30 bg-white border-b border-gray-200"
  >
    <!-- Timer -->
    <div class="py-2 text-center text-sm text-gray-700">
      <template v-if="isSelecting">
        Select ({{ secondsLeft }}s) - Turn {{ game.turn }} out of {{ game.maxTurns }}
      </template>
      <template v-else-if="game.phase==='reveal'">
        Reveal — <span class="capitalize">{{ game.priority }}</span> goes first
      </template>
      <template v-else-if="game.phase==='setup'">
        Setup
      </template>
    </div>

    <!-- Next steps instructions -->
    <p class="py-1 px-4 text-center text-xs text-gray-600">
      {{ instructionText }}
    </p>

    <!-- Progress bar -->
    <div v-if="isSelecting" class="md:hidden h-2 w-full bg-gray-200 rounded">
      <div
        class="h-full bg-indigo-500 rounded"
        :style="{ width: progressPercent + '%' }"
      />
    </div>
  </div>

  <!-- No-game guard -->
  <div v-if="!game" class="pt-20 text-center">
    <p class="text-gray-600">
      No active match.
      <NuxtLink to="/games/clash" class="text-indigo-600 underline">
        Start a new game
      </NuxtLink>.
    </p>
  </div>

  <!-- Main board -->
  <section
    v-else
    class="pt-20 pb-36 md:pb-16 max-w-5xl mx-auto flex flex-col gap-6"
  >
    <!-- Desktop header (hidden on mobile) -->
    <h2 class="hidden md:block text-xl font-bold text-center mb-2">
      gToons Clash — Turn {{ game.turn }} / {{ game.maxTurns }}
      <span
        v-if="isSelecting"
        class="text-sm font-normal text-gray-600 ml-4"
      >
        Select ({{ secondsLeft }}s)
      </span>
      <span
        v-else-if="game.phase==='reveal'"
        class="text-sm font-normal text-gray-600 ml-4"
      >
        Reveal — <span class="capitalize">{{ game.priority }}</span> goes first
      </span>
      <span
        v-else-if="game.phase==='setup'"
        class="text-sm font-normal text-gray-600 ml-4"
      >
        Setup
      </span>
    </h2>

    <!-- Desktop instructions (below header) -->
    <p
      v-if="instructionText"
      class="hidden md:block text-center text-sm text-gray-700"
    >
      {{ instructionText }}
    </p>

    <!-- Progress bar -->
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
      >{{ entry }}</div>
    </div>

    <!-- Player hand & energy -->
    <ClashHand
      :cards="game.playerHand"
      :energy="game.playerEnergy"
      :selected="selected"
      :remaining-energy="remainingEnergy"
      :disabled="!isSelecting || confirmed"
      @select="c => (selected = c)"
    />

    <!-- Mobile confirm button -->
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

    <!-- Desktop confirm button -->
    <button
      v-if="isSelecting"
      :disabled="confirmed || !canConfirm"
      @click="confirmSelections"
      class="
        hidden md:inline-flex
        self-center
        bg-indigo-500 hover:bg-indigo-600 text-white 
        px-6 py-2 rounded disabled:opacity-50
        z-50
      "
    >
      {{ confirmed ? 'Waiting…' : `Confirm (${secondsLeft}s)` }}
    </button>

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
                  : 'Tie'
            }}
          </h3>
          <p class="mb-6">
            Lanes Won: You {{ summary.playerLanesWon }} – AI
            {{ summary.aiLanesWon }}
          </p>
          <p v-if="summary.winner === 'player'" class="mb-4 text-indigo-600 font-medium">
            You earned {{ summary.pointsAwarded }} point
            <span v-if="summary.pointsAwarded > 1">s</span>!
          </p>
          <NuxtLink
            to="/games/clash"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
          >Play Again</NuxtLink>
        </div>
      </div>
    </transition>
    </section>
  </template>


<script setup>
// Play page for gToon Clash
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useClashSocket } from '@/composables/useClashSocket'
import ClashGameBoard from '@/components/ClashGameBoard.vue'
import ClashHand from '@/components/ClashHand.vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

// shared Nuxt state
const { socket, battleState } = useClashSocket()
const game = computed(() => battleState.value)

const router  = useRouter()

// local UI refs
const selected   = ref(null)
const placements = ref([])     // [{ cardId, laneIndex }]
const confirmed  = ref(false)
const log        = ref([])
const summary    = ref(null)

// countdown
const secondsLeft = ref(60)
let timerId = null
function startTimer(deadline) {
  clearInterval(timerId)
  if (!deadline) return
  timerId = setInterval(() => {
    secondsLeft.value = Math.max(0,
      Math.ceil((deadline - Date.now())/1000)
    )
    if (secondsLeft.value === 0) clearInterval(timerId)
  }, 1000)
}

const hasPlayable = computed(() =>
  game.value.playerHand.some(c => c.cost <= game.value.playerEnergy)
)

const canConfirm = computed(() => {
  // either we have at least one placement,
  // or there simply are no affordable cards in hand
  return placements.value.length > 0 || !hasPlayable.value
})

// total cost of all pending selections
const pendingCost = computed(() =>
  placements.value.reduce((sum, p) =>
    sum + (p.card.cost || 0)
  , 0)
)

// how much energy you have left to spend on new ghosts
const remainingEnergy = computed(() =>
  game.value.playerEnergy - pendingCost.value
)

// derived flags
const isSelecting = computed(
  () => game.value
    && (game.value.phase === 'select' || game.value.phase === 'setup')
)
const progressPercent = computed(() =>
  Math.max(0, Math.min(100, (secondsLeft.value/60)*100))
)
const instructionText = computed(() => {
  if (!game.value) return ''
  if (game.value.phase === 'setup')
    return 'Prepare your first move – select a card and place it on a lane.'
  if (game.value.phase === 'select') {
    if (confirmed.value)        return 'Waiting for opponent…'
    if (!selected.value)        return 'Click a card, then a lane to place it.'
    return 'Choose a lane and confirm your selection.'
  }
  if (game.value.phase === 'reveal')
    return game.value.priority==='player'
      ? 'You attack first – watch the reveal!'
      : 'Opponent attacks first – watch the reveal.'
  return ''
})

// socket handlers
function wireSocket() {
  socket.on('phaseUpdate', state => {
    // write into battleState only:
    battleState.value = state

    if (state.phase==='select' || state.phase==='setup') {
      startTimer(state.selectEndsAt)
    } else {
      clearInterval(timerId)
      secondsLeft.value = 0
    }

    if ((state.phase==='select'||state.phase==='setup') && confirmed.value) {
      resetLocal()
    }
  })

  socket.on('gameEnd', sum => {
    summary.value = sum
    clearInterval(timerId)
  })
}

// UI actions
function handlePlace(laneIdx) {
  if (!isSelecting.value || confirmed.value || !selected.value) return

  // are we un-placing?
  const idx = placements.value.findIndex(p => p.card?.id === selected.value.id)
  if (idx >= 0) {
    placements.value.splice(idx, 1)
    return
  }

  // otherwise, check that this new card is still affordable
  const costSum = pendingCost.value
  if (selected.value.cost + costSum > game.value.playerEnergy) {
    // optionally show a toast: “Not enough energy!”
    return
  }

  placements.value.push({
    card:    selected.value,
    laneIndex: laneIdx
  })
}

function confirmSelections() {
  if (confirmed.value || !canConfirm.value) return

  // only keep the entries that actually have a `.card`
  const good = placements.value.filter(p => p && p.card && p.laneIndex != null)

  const selections = good.map(p => ({
    cardId:    p.card.id,
    laneIndex: p.laneIndex
  }))

  socket.emit('selectCards', { selections })
  confirmed.value = true

  // clear previews if you want them to vanish immediately:
  placements.value = []
}

// reset
function resetLocal() {
  placements.value = []
  confirmed.value  = false
  selected.value   = null
}

// lifecycle
onMounted(() => {
  wireSocket()
})

onBeforeUnmount(() => {
  socket.off('phaseUpdate')
  socket.off('gameEnd')
  clearInterval(timerId)
})

// keep in sync if battleState changes
// watch(battleState, val => { if (val) game.value = val })
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity .3s ease; }
.fade-enter-from,
.fade-leave-to     { opacity: 0; }
</style>
