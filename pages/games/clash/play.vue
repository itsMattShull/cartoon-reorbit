<!-- pages/games/clash/play.vue -->
<template>
  <Nav />

  <!-- ───── Guard: no match loaded ───── -->
  <div v-if="!game" class="pt-20 text-center mt-16">
    <p class="text-gray-600">
      No active match.
      <NuxtLink to="/games/clash" class="text-indigo-600 underline">
        Start a new game
      </NuxtLink>.
    </p>
  </div>

  <!-- ───── Main Clash board ───── -->
  <section
    v-else
    class="pt-20 pb-16 max-w-5xl mx-auto flex flex-col gap-6 mt-16"
  >
    <!-- Turn / Phase header -->
    <h2 class="text-xl font-bold text-center mb-2">
      Turn {{ game.turn }} / {{ game.maxTurns }}
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

    <!-- Progress bar during select/setup -->
    <div v-if="isSelecting" class="h-2 w-full bg-gray-200 rounded">
      <div
        class="h-full bg-indigo-500 rounded"
        :style="{ width: progressPercent + '%' }"
      ></div>
    </div>

    <!-- Board / lanes -->
    <ClashGameBoard
      :lanes="game.lanes"
      :phase="isSelecting ? 'select' : game.phase"
      :priority="game.priority"
      :previewPlacements="placements"
      @place="handlePlace"
      :selected="selected && selected.id"
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

    <!-- Phase-aware instructions -->
    <p v-if="instructionText" class="text-center text-sm text-gray-700">
      {{ instructionText }}
    </p>

    <!-- Player hand & energy -->
    <ClashHand
      :cards="game.playerHand"
      :energy="game.energy"
      :selected="selected"
      :disabled="!isSelecting || confirmed"
      @select="c => (selected = c)"
    />

    <!-- Confirm button (select/setup only) -->
    <button
      v-if="isSelecting"
      :disabled="confirmed || !placements.length"
      @click="confirmSelections"
      class="self-center bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded disabled:opacity-50"
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
import { io } from 'socket.io-client'
import { useState, useRuntimeConfig } from '#imports'
import ClashGameBoard from '@/components/ClashGameBoard.vue'
import ClashHand from '@/components/ClashHand.vue'

// shared Nuxt state
const battleState = useState('battle-state', () => null)
const socketState = useState('clash-socket',  () => null)
const game        = ref(battleState.value)

const router  = useRouter()
const runtime = useRuntimeConfig()

// socket singleton across pages
let socket = socketState.value
if (!socket) {
  socket = io(
    import.meta.env.PROD
      ? undefined
      : `http://localhost:${runtime.public.socketPort}`
  )
  socketState.value = socket
}

// local UI refs
const selected   = ref(null)
const placements = ref([])     // [{ cardId, laneIndex }]
const confirmed  = ref(false)
const log        = ref([])
const summary    = ref(null)

// countdown
const secondsLeft = ref(30)
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

// derived flags
const isSelecting = computed(
  () => game.value
    && (game.value.phase === 'select' || game.value.phase === 'setup')
)
const progressPercent = computed(() =>
  Math.max(0, Math.min(100, (secondsLeft.value/30)*100))
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
    battleState.value = state
    game.value        = state

    if (state.phase==='select' || state.phase==='setup') {
      startTimer(state.selectEndsAt)
    } else {
      clearInterval(timerId)
      secondsLeft.value = 0
    }

    // reset selections on new window
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
  const i = placements.value.findIndex(p => p.cardId===selected.value.id)
  if (i>=0) placements.value.splice(i,1)
  else      placements.value.push({ cardId:selected.value.id, laneIndex:laneIdx })
}

function confirmSelections() {
  if (confirmed.value || !placements.value.length) return
  socket.emit('selectCards',{ selections:placements.value })
  confirmed.value = true
}

// reset
function resetLocal() {
  placements.value = []
  confirmed.value  = false
  selected.value   = null
}

// lifecycle
onMounted(() => {
  if (!battleState.value) {
    return router.replace('/games/clash')
  }
  game.value = battleState.value
  wireSocket()
})

onBeforeUnmount(() => {
  socket.off('phaseUpdate')
  socket.off('gameEnd')
  clearInterval(timerId)
})

// keep in sync if battleState changes
watch(battleState, val => { if (val) game.value = val })
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity .3s ease; }
.fade-enter-from,
.fade-leave-to     { opacity: 0; }
</style>
