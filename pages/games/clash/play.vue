<template>
  <Nav />

  <!-- ───── Guard: no match loaded ───── -->
  <div v-if="!game" class="pt-20 text-center">
    <p class="text-gray-600">
      No active match. <NuxtLink to="/games/clash" class="text-indigo-600 underline">Start a new game</NuxtLink>.
    </p>
  </div>

  <!-- ───── Main Clash board ───── -->
  <section
    v-else
    class="pt-20 pb-16 max-w-5xl mx-auto flex flex-col gap-6"
  >
    <!-- Turn / Phase header -->
    <h2 class="text-xl font-bold text-center mb-2">
      Turn {{ game.turn }} / {{ game.maxTurns }}
      <span
        v-if="game.phase==='select'"
        class="text-sm font-normal text-gray-600 ml-4"
      >Select ({{ secondsLeft }}s)</span>
      <span
        v-else-if="game.phase==='reveal'"
        class="text-sm font-normal text-gray-600 ml-4"
      >Reveal &nbsp;—&nbsp; <span class="capitalize">{{ game.priority }}</span> goes first</span>
      <span
        v-else-if="game.phase==='setup'"
        class="text-sm font-normal text-gray-600 ml-4"
      >Setup</span>
    </h2>

    <!-- Progress bar during select -->
    <div v-if="game.phase==='select'" class="h-2 w-full bg-gray-200 rounded">
      <div
        class="h-full bg-indigo-500 rounded"
        :style="{ width: progressPercent + '%' }"
      ></div>
    </div>

    <!-- Board / lanes -->
    <ClashGameBoard
      :lanes="game.lanes"
      :phase="game.phase"
      :priority="game.priority"
      :preview-placements="placements"
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

    <!-- Player hand & energy -->
    <ClashHand
      :cards="game.playerHand"
      :energy="game.energy"
      :selected="selected"
      :disabled="game.phase!=='select' || confirmed"
      @select="c => (selected = c)"
    />

    <!-- Confirm button (select phase only) -->
    <button
      v-if="game.phase==='select'"
      :disabled="confirmed || !placements.length"
      @click="confirmSelections"
      class="self-center bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded disabled:opacity-50"
    >
      {{ confirmed ? 'Waiting…' : 'Confirm' }}
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
/* ------------------------------------------------------------------
   Play page for Clash – works with Select ▸ Reveal ▸ Setup phases
------------------------------------------------------------------ */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { io } from 'socket.io-client'
import ClashGameBoard from '@/components/ClashGameBoard.vue'
import ClashHand      from '@/components/ClashHand.vue'

/* shared Nuxt state for socket + initial battle */
const battleState  = useState('battle-state', () => null)
const socketState  = useState('clash-socket', () => null)
const game   = ref(battleState.value)

const router  = useRouter()
const runtime = useRuntimeConfig()

/* socket singleton across pages */
let socket = socketState.value
if (!socket) {
  socket = io(
    import.meta.env.PROD
      ? undefined
      : `http://localhost:${runtime.public.socketPort}`
  )
  socketState.value = socket
}

/* local UI refs */
const selected   = ref(null)          // selected hand card
const placements = ref([])            // [{cardId,laneIndex}]
const confirmed  = ref(false)         // after confirm button pressed
const log        = ref([])
const summary    = ref(null)

/* countdown */
const secondsLeft = ref(30)
const progressPercent = computed(() =>
  Math.max(0, Math.min(100, (secondsLeft.value / 30) * 100))
)

/* ---------------- socket handlers ---------------- */
function wireSocket () {
  socket.on('gameStart', state => {
    game.value = state
    battleState.value = state
    resetLocal()
  })

  socket.on('phaseUpdate', state => {
    game.value = state
    battleState.value = state

    /* update countdown */
    if (state.phase === 'select') {
      secondsLeft.value = Math.ceil(
        (state.selectDeadline - Date.now()) / 1000
      )
    } else {
      secondsLeft.value = 0
    }

    /* when a new select phase begins → reset UI */
    if (state.phase === 'select' && confirmed.value) {
      resetLocal()
    }
  })

  socket.on('gameEnd', sum => {
    summary.value = sum
  })
}

/* ---------------- UI actions --------------------- */
function handlePlace (laneIdx) {
  if (
    game.value.phase !== 'select' ||
    confirmed.value ||
    !selected.value
  )
    return

  /* Toggle: if already placed to that lane remove it */
  const idx = placements.value.findIndex(
    p => p.cardId === selected.value.id
  )
  if (idx >= 0) placements.value.splice(idx, 1)
  else placements.value.push({ cardId: selected.value.id, laneIndex: laneIdx })
}

function confirmSelections () {
  if (confirmed.value || !placements.value.length) return
  socket.emit('selectCards', { selections: placements.value })
  confirmed.value = true
}

/* ---------------- helpers ------------------------ */
function resetLocal () {
  placements.value = []
  confirmed.value  = false
  selected.value   = null
}

/* -------------- lifecycle ------------------------ */
onMounted(() => {
  if (!game.value) return router.replace('/games/clash')
  wireSocket()
})

onBeforeUnmount(() => {
  socket.off('gameStart')
  socket.off('phaseUpdate')
  socket.off('gameEnd')
})

/* Update reactive game ref if starting page injected new state */
watch(battleState, val => { if (val) game.value = val })
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity .3s ease; }
.fade-enter-from,
.fade-leave-to     { opacity: 0; }
</style>
