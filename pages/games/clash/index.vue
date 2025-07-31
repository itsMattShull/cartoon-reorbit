<template>
  <Nav />

  <section
    v-if="route.path === '/games/clash'"
    class="pt-20 pb-10 max-w-4xl mx-auto text-center"
  >
    <h1 class="text-3xl font-bold mb-6">gToon Clash</h1>

    <!-- Deck preview or loading skeleton -->
    <div class="mb-8">
      <!-- Actual cards once loaded -->
      <div
        v-if="loaded && deck.length"
        class="flex flex-wrap justify-center gap-4"
      >
        <ClashCToonCard
          v-for="c in deck"
          :key="c.id"
          :card="c"
          size="large"
          @info="showCardInfo"
        />
      </div>

      <!-- Loading skeleton (12 card placeholders) -->
      <div
        v-else-if="!loaded"
        class="flex flex-wrap justify-center gap-4 animate-pulse"
      >
        <div
          v-for="n in 12"
          :key="n"
          class="w-24 h-32 bg-gray-200 rounded flex flex-col items-center justify-center"
        >
          <div class="w-20 h-20 bg-gray-300 rounded mb-1" />
          <div class="h-3 w-16 bg-gray-300 rounded mb-1" />
          <div class="h-2 w-12 bg-gray-300 rounded" />
        </div>
      </div>
    </div>

    <!-- Not enough G-toons notice -->
    <p
      v-if="loaded && deck.length < 12"
      class="mt-6 text-red-600 font-semibold max-w-md mx-auto"
    >
      You need at least <strong>12 G-toons</strong> to play Clash. Acquire more in the
      <NuxtLink to="/shop" class="text-indigo-600 underline">cMart</NuxtLink> and come back!
    </p>

    <!-- Start button -->
    <button
      @click="startMatch"
      :disabled="starting || deck.length < 12 || !loaded"
      class="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-2 rounded mt-8"
    >
      {{ starting ? 'Starting…' : 'Start Match vs AI' }}
    </button>
  </section>

  <!-- Info modal for long-presses on the lobby cards -->
  <ClashCardInfoModal
    v-if="infoCard"
    :card="infoCard"
    @close="infoCard = null"
  />

  <!-- Child route for /games/clash/play -->
  <NuxtPage v-if="route.path === '/games/clash/play'" />
</template>

<script setup>
// ⚔️ gToon Clash Lobby
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useRouter, useRoute } from 'vue-router'
import { useClashSocket } from '@/composables/useClashSocket'
import ClashCToonCard from '@/components/ClashCToonCard.vue'
import Nav from '@/components/Nav.vue'
import ClashCardInfoModal from '@/components/ClashCardInfoModal.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

const { socket, battleState } = useClashSocket()
const router  = useRouter()
const route   = useRoute()
const { user, fetchSelf } = useAuth()
await fetchSelf()

const deck     = ref([])
const loaded   = ref(false)
const starting = ref(false)

// which card (if any) is being shown in the info modal
const infoCard = ref(null)
function showCardInfo(card) {
  infoCard.value = card
}

// Fisher–Yates shuffle
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function loadDeck() {
  try {
    const all = await $fetch('/api/user/ctoons?isGtoon=true')
    deck.value = shuffle(all).slice(0, 12)
  } catch (err) {
    console.error('Failed to load G-toons:', err)
    deck.value = []
  } finally {
    loaded.value = true
  }
}

function startMatch() {
  if (deck.value.length < 12) return
  starting.value = true
  socket.emit('joinPvE', { deck: deck.value, userId: user.value.id })
}

onMounted(() => {
  loadDeck()

  // only now will socket be non-null, so register handlers here
  socket.on('gameStart', state => {
    battleState.value = state
    starting.value    = false
    router.push('/games/clash/play')
  })

  socket.on('phaseUpdate', state => {
    battleState.value = state
  })
})

onBeforeUnmount(() => {
  // clean up listeners so they don't pile up if you come back
  socket.off('gameStart')
  socket.off('phaseUpdate')
})
</script>

<style scoped>
/***** Skeleton animation *****/
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
.animate-pulse > div { animation: pulse 1.5s ease-in-out infinite; }
</style>
