/* =======================================
   pages/games/clash/rooms.vue
   ======================================= */
<template>
  <Nav />
  <section class="pt-20 max-w-3xl mx-auto px-4">
    <h1 class="text-2xl font-bold mb-4">gToons Clash Rooms</h1>

    <div class="flex gap-2 mb-6">
      <button @click="createRoom" class="px-4 py-2 bg-indigo-500 text-white rounded">
        Create New Room
      </button>
      <button @click="$router.push('/games/clash')" class="px-4 py-2 bg-indigo-500 text-white rounded">
        Play vs AI
      </button>
      <button @click="$router.push('/games/clash/leaderboard')" class="px-4 py-2 bg-indigo-500 text-white rounded">
        Leaderboards
      </button>
      <button @click="$router.push('/games/clash/decks')" class="px-4 py-2 bg-indigo-500 text-white rounded">
        Manage Decks
      </button>
    </div>

    <!-- Cards grid -->
    <div v-if="rooms.length" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div
        v-for="r in rooms"
        :key="r.id"
        class="p-4 border rounded-lg shadow-sm bg-white flex items-center justify-between"
      >
        <div>
          <div class="text-xs uppercase tracking-wide text-gray-500">Player waiting</div>
          <div class="font-semibold">
            {{ r.owner }}
            <span v-if="isMyRoom(r)" class="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">You</span>
          </div>
        </div>

        <button
          @click="joinRoom(r.id)"
          :disabled="isMyRoom(r)"
          class="px-3 py-1.5 rounded text-white transition"
          :class="isMyRoom(r)
            ? 'bg-gray-400 cursor-not-allowed opacity-60'
            : 'bg-green-500 hover:bg-green-600'"
          :title="isMyRoom(r) ? `You can't join your own room` : 'Join this room'"
        >
          Join
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-gray-500">No open rooms right now. Create one!</div>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useClashSocket } from '@/composables/useClashSocket'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

const rooms = ref([])
const router = useRouter()

// auth
const { user, fetchSelf } = useAuth()

// use the same client-safe socket composable you use in play.vue
const { socket } = useClashSocket()

function isMyRoom(r) {
  return r?.owner && user.value?.username && r.owner === user.value.username
}

// extra guard so clicking does nothing if somehow enabled
function joinRoom(id) {
  const r = rooms.value.find(x => x.id === id)
  if (r && isMyRoom(r)) return
  router.push(`/games/clash/${id}`)
}

function requestRooms() {
  socket.emit('listClashRooms')
}

function createRoom() {
  const roomId = Date.now().toString()

  // NOTE: add your actual deck if you need it; leaving it out avoids referencing an undefined var
  socket.emit('createClashRoom', {
    roomId,
    userId: user.value?.id,
    // deck
  })

  router.push(`/games/clash/${roomId}`)
}

onMounted(async () => {
  // keep it client-side to avoid SSR issues
  await fetchSelf()

  // listeners
  socket.on('clashRooms', (list) => {
    rooms.value = Array.isArray(list) ? list : []
  })
  // push-new room (someone else just created one)
  socket.on('roomCreated', (room) => {
    console.log('New room created:', room)
    // de-dupe then add to top
    rooms.value = [{ id: room.id, owner: room.owner }, ...rooms.value.filter(r => r.id !== room.id)]
  })
  // remove a room that just filled (2nd player joined)
  socket.on('roomRemoved', ({ id }) => {
    console.log('Room removed:', id)
    rooms.value = rooms.value.filter(r => r.id !== id)
  })

  requestRooms()
})

onBeforeUnmount(() => {
  socket.off('clashRooms')
  socket.off('roomCreated')
  socket.off('roomRemoved')
})
</script>