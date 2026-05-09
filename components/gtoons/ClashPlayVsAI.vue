<template>
  <div class="tab-content overflow-y-auto h-full px-4 py-3">
    <div class="mb-4 text-right flex justify-end gap-2">
      <button
        @click="$emit('switch-tab', 'decks')"
        class="inline-block bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded text-sm"
      >
        Manage Decks
      </button>
      <button
        @click="$emit('switch-tab', 'meta')"
        class="inline-block bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-sm"
      >
        Meta
      </button>
    </div>

    <h2 class="text-xl font-bold mb-4 text-center">gToon Clash</h2>

    <!-- Deck selector -->
    <div class="mb-4">
      <label class="block mb-2 font-medium text-sm">Choose Your Deck</label>
      <select v-model="selectedDeckId" class="border rounded px-3 py-2 w-full text-gray-800">
        <option disabled value="">-- select deck --</option>
        <option v-for="d in decks" :key="d.id" :value="d.id">
          {{ d.name }} ({{ d.cards.length }})
        </option>
      </select>
    </div>

    <!-- Deck preview / loading -->
    <div class="mb-6">
      <div v-if="loaded && deck.length === 12" class="flex flex-wrap justify-center gap-2">
        <ClashCToonCard
          v-for="(c, idx) in deck"
          :key="`${c.id}-${idx}`"
          :card="c"
          size="large"
          @info="showCardInfo"
        />
      </div>

      <div v-else-if="!loaded" class="flex flex-wrap justify-center gap-2 animate-pulse">
        <div v-for="n in 12" :key="n" class="w-20 h-28 bg-gray-200 rounded" />
      </div>

      <div v-else class="text-red-600 font-semibold text-center">
        <p>You need exactly 12 gToons.</p>
        <button
          @click="$emit('switch-tab', 'decks')"
          class="underline text-indigo-400 bg-transparent border-0 cursor-pointer"
        >
          Build a deck
        </button>
        before playing.
      </div>
    </div>

    <div class="text-center">
      <button
        @click="startMatch"
        :disabled="starting || deck.length !== 12 || !loaded || !selectedDeckId"
        class="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-2 rounded"
      >
        {{ starting ? 'Starting…' : 'Start Match vs AI' }}
      </button>
    </div>

    <!-- Info modal -->
    <ClashCardInfoModal
      v-if="infoCard"
      :card="infoCard"
      @close="infoCard = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useRouter } from 'vue-router'
import { useClashSocket } from '@/composables/useClashSocket'
import ClashCToonCard from '@/components/ClashCToonCard.vue'
import ClashCardInfoModal from '@/components/ClashCardInfoModal.vue'

const emit = defineEmits(['switch-tab'])

const { socket, battleState } = useClashSocket()
const router = useRouter()
const { user, fetchSelf } = useAuth()

const decks = ref([])
const selectedDeckId = ref('')
const deck = ref([])
const loaded = ref(false)
const starting = ref(false)
const infoCard = ref(null)

function showCardInfo(card) {
  infoCard.value = card
}

function shuffle(arr) {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

async function loadDecks() {
  try {
    const all = await $fetch('/api/game/clash/decks')
    decks.value = all.filter(d => d.cards.length === 12)
  } catch (e) {
    decks.value = []
  }
}

function loadDeckFromSelection(id) {
  if (!id) {
    deck.value = []
  } else {
    const sel = decks.value.find(d => d.id === id)
    deck.value = sel ? shuffle(sel.cards) : []
  }
  loaded.value = true
}

function startMatch() {
  if (deck.value.length !== 12) return
  starting.value = true

  socket.off('gameStart')
  socket.off('joinError')

  socket.once('gameStart', state => {
    battleState.value = state
    starting.value = false
    router.push('/newsite/gtoons/play')
  })

  socket.once('joinError', (err) => {
    starting.value = false
    alert(err?.message || 'Failed to start match.')
  })

  const base = import.meta.env.PROD
    ? 'https://www.cartoonreorbit.com'
    : 'http://localhost:3000'
  const normalized = deck.value.map(d => {
    const c = d.ctoon ?? d
    return {
      id: c.id,
      name: c.name,
      assetPath: c.assetPath
        ? (c.assetPath.startsWith('http') ? c.assetPath : `${base}${c.assetPath}`)
        : null,
      cost: c.cost ?? 1,
      power: c.power ?? 1,
      gtoonType: c.gtoonType || null,
      abilityKey: c.abilityKey || null,
      abilityData: c.abilityData || null
    }
  }).slice(0, 12)
  socket.emit('joinPvE', { deck: normalized, userId: user.value.id })
}

onMounted(async () => {
  await fetchSelf()
  loaded.value = false
  await loadDecks()
  deck.value = []
  loaded.value = true
})

watch(selectedDeckId, (newId) => {
  loaded.value = false
  loadDeckFromSelection(newId)
})
</script>

<style scoped>
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
.animate-pulse > div { animation: pulse 1.5s ease-in-out infinite; }
</style>
