<template>
  <Nav />

  <section v-if="route.path === '/games/clash'" class="pt-20 pb-10 max-w-4xl mx-auto text-center">
    <h1 class="text-3xl font-bold mb-6">gToon Clash</h1>

    <!-- Manage Decks Button -->
    <div class="mb-6 text-right">
      <NuxtLink
        to="/games/clash/decks"
        class="inline-block bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
      >
        Manage Decks
      </NuxtLink>
    </div>

    <!-- Deck selector -->
    <div class="mb-6">
      <label class="block mb-2 font-medium">Choose Your Deck</label>
      <select v-model="selectedDeckId" class="border rounded px-3 py-2 w-full">
        <option disabled value="">-- select deck --</option>
        <option v-for="d in decks" :key="d.id" :value="d.id">
          {{ d.name }} ({{ d.cards.length }})
        </option>
      </select>
    </div>

    <!-- Deck preview / loading -->
    <div class="mb-8">
      <div v-if="loaded && deck.length === 12" class="flex flex-wrap justify-center gap-4">
        <ClashCToonCard
          v-for="(c, idx) in deck"
          :key="`${c.id}-${idx}`"
          :card="c"
          size="large"
          @info="showCardInfo"
        />
      </div>

      <div v-else-if="!loaded" class="flex flex-wrap justify-center gap-4 animate-pulse">
        <div v-for="n in 12" :key="n" class="w-24 h-32 bg-gray-200 rounded" />
      </div>

      <div v-else class="text-red-600 font-semibold">
        <p>You need exactly 12 G-toons.</p>
        <NuxtLink to="/games/clash/decks" class="underline text-indigo-600">
          Build a deck
        </NuxtLink>
        before playing.
      </div>
    </div>

    <button
      @click="startMatch"
      :disabled="starting || deck.length !== 12 || !loaded || !selectedDeckId"
      class="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-2 rounded mt-8"
    >
      {{ starting ? 'Starting…' : 'Start Match vs AI' }}
    </button>
  </section>

  <!-- Info modal -->
  <ClashCardInfoModal
    v-if="infoCard"
    :card="infoCard"
    @close="infoCard = null"
  />

  <!-- Game route -->
  <NuxtPage v-if="route.path === '/games/clash/play'" />
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useRouter, useRoute } from 'vue-router'
import { useClashSocket } from '@/composables/useClashSocket'
import ClashCToonCard from '@/components/ClashCToonCard.vue'
import Nav from '@/components/Nav.vue'
import ClashCardInfoModal from '@/components/ClashCardInfoModal.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

const { socket, battleState } = useClashSocket()
const router = useRouter()
const route = useRoute()
const { user, fetchSelf } = useAuth()
await fetchSelf()

const decks = ref([])
const selectedDeckId = ref('')
const deck = ref([])
const loaded = ref(false)
const starting = ref(false)
const infoCard = ref(null)

function showCardInfo(card) {
  infoCard.value = card
}

// Fisher–Yates shuffle helper (optional)
function shuffle(arr) {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Fetch and filter decks on mount
async function loadDecks() {
  try {
    const all = await $fetch('/api/game/clash/decks')
    decks.value = all.filter(d => d.cards.length === 12)
  } catch (e) {
    console.error('Failed to load decks:', e)
    decks.value = []
  }
}

// Replace the preview whenever selection changes
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

  // be safe: remove any previous one-off listeners
  socket.off('gameStart')
  socket.off('joinError')

  socket.once('gameStart', state => {
    battleState.value = state
    starting.value = false
    router.push('/games/clash/play')
  })

  socket.once('joinError', (err) => {
    starting.value = false
    console.error('joinPvE failed:', err)
    // swap for your toast/notifier of choice
    alert(err?.message || 'Failed to start match.')
  })
  // Normalize deck to what the server/engine expects
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
  loaded.value = false
  await loadDecks()
  deck.value = []
  loaded.value = true
})

watch(selectedDeckId, (newId) => {
  loaded.value = false
  loadDeckFromSelection(newId)
})

socket.on('gameStart', state => {
  battleState.value = state
  starting.value = false
  router.push('/games/clash/play')
})

socket.on('phaseUpdate', state => {
  battleState.value = state
})
</script>

<style scoped>
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
.animate-pulse > div { animation: pulse 1.5s ease-in-out infinite; }
</style>