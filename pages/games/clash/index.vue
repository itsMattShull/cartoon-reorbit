<template>
  <Nav />

  <section v-if="route.path === '/games/clash'" class="pt-20 pb-10 max-w-4xl mx-auto text-center">
    <h1 class="text-3xl font-bold mb-6">gToon Clash</h1>

    <!-- Deck preview or loading skeleton -->
    <div class="mb-8">
      <!-- Actual cards once loaded -->
      <div v-if="loaded && deck.length" class="flex flex-wrap justify-center gap-4">
        <ClashCToonCard
          v-for="c in deck"
          :key="c.id"
          :card="c"
          size="large"
        />
        <!-- <div
          v-for="c in deck"
          :key="c.id"
          class="w-24 h-32 border rounded flex flex-col items-center justify-center text-xs bg-white shadow"
        >
          <img :src="c.assetPath" :alt="c.name" class="w-20 h-20 object-contain mb-1" />
          <span class="font-semibold truncate w-full px-1">{{ c.name }}</span>
          <span class="text-[10px] text-gray-500">P{{ c.power }} · C{{ c.cost }}</span>
        </div> -->
      </div>

      <!-- Loading skeleton (12 card placeholders) -->
      <div v-else-if="!loaded" class="flex flex-wrap justify-center gap-4 animate-pulse">
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

    <!-- Not enough G‑toons notice -->
    <p
      v-if="loaded && deck.length < 12"
      class="mt-6 text-red-600 font-semibold max-w-md mx-auto"
    >
      You need at least <strong>12 G‑toons</strong> to play Clash. Acquire more in the <NuxtLink to="/shop" class="text-indigo-600 underline">cMart</NuxtLink> and come back!
    </p>

    <!-- Start button -->
    <button
      @click="startMatch"
      :disabled="starting || deck.length < 12 || !loaded"
      class="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-2 rounded mt-8"
    >
      {{ starting ? 'Starting…' : 'Start Match vs AI' }}
    </button>
  </section>
  <!-- where the child route (/play) gets injected -->
  <NuxtPage v-if="route.path !== '/games/clash'" />  
</template>

<script setup>
/* --------------------------------------------------------------
   • Fetch up to 10 owned G‑toons (isGtoon=true)
   • Disable play if < 10 or still loading
   • Connect via socket.io, store battle state, route to play page
-------------------------------------------------------------- */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import ClashCToonCard from '@/components/ClashCToonCard.vue'

const route   = useRoute() 
const router   = useRouter()
const deck     = ref([])
const starting = ref(false)
const loaded   = ref(false)

// --- socket connection (follows existing app convention) ------
const runtime = useRuntimeConfig()
const socket  = io(
  import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`
)

// share battle state across pages via Nuxt useState()
const battleState = useState('battle-state', () => null)

// --- Fetch up to 10 G‑toons -----------------------------------
async function loadDeck () {
  try {
    const all = await $fetch('/api/user/ctoons?isGtoon=true')
    deck.value = shuffle(all).slice(0, 12)
  } catch (err) {
    console.error('Failed to load G‑toons:', err)
    deck.value = []
  } finally {
    loaded.value = true
  }
}

function shuffle (arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

// --- Start the match -----------------------------------------
function startMatch () {
  if (deck.value.length < 12) return
  starting.value = true
  socket.emit('joinPvE', { deck: deck.value })
}

// --- Handle socket events ------------------------------------
socket.on('gameStart', (state) => {
  battleState.value = state
  console.log('battle state: ', battleState.value)
  console.log('sending to /play')
  router.push('/games/clash/play')
})

onMounted(loadDeck)

onBeforeUnmount(() => {
  if (socket?.connected) socket.disconnect()
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
