<template>
  <Nav />
  <div class="container mt-16 mx-auto p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Live Trading Rooms</h1>
      <div class="flex items-center">
        <span class="text-gray-600 mr-4">{{ statusText }}</span>
        <button
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          @click="createTradeRoom"
        >
          Create Trade Room
        </button>
      </div>
    </div>

    <div v-if="rooms.length === 0" class="text-gray-500">No active trade rooms yet.</div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="room in rooms"
        :key="room.name"
        class="bg-white p-4 rounded-lg shadow-md flex flex-col justify-between h-full"
      >
        <div>
          <h2 class="text-xl font-semibold text-gray-900">{{ room.name }}</h2>
          <div class="text-sm text-gray-600">
            Traders:
            <div v-if="room.traderA">
              <img
                :src="`/avatars/${room.traderA.avatar}`"
                alt="Trader A avatar"
                class="inline-block w-4 h-4 rounded-full mr-1"
              /> 
              {{ room.traderA.username }}
            </div>
            <div v-else>...</div>
            <div v-if="room.traderB">
               &amp; 
              <img
                :src="`/avatars/${room.traderB.avatar}`"
                alt="Trader B avatar"
                class="inline-block w-4 h-4 rounded-full mr-1"
              /> 
              {{ room.traderB.username }}
            </div>
            <br />
            Spectators: {{ room.spectators || 0 }}
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <button
            class="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
            @click="joinRoom(room.name)"
          >
            Join Room
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: 'auth',
  layout: 'default'
})
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Nav from '@/components/Nav.vue'

const config = useRuntimeConfig()
const router = useRouter()
const rooms = ref([])

const refreshInterval = 30
const countdown = ref(refreshInterval)
const statusText = computed(() =>
  countdown.value > 0
    ? `Refreshing in ${countdown.value} seconds...`
    : 'Refreshing rooms...'
)
let timer = null

const fetchRooms = async () => {
  const res = await fetch('/api/trade/rooms')
  const data = await res.json()
  rooms.value = data.rooms
}

const createTradeRoom = async () => {
  const res = await fetch('/api/trade/create-room', { method: 'POST' })
  const data = await res.json()
  if (data.name) router.push(`/trade/${data.name}`)
}

const joinRoom = async (name) => {
  try {
    const res = await fetch('/api/trade/rooms')
    if (!res.ok) throw new Error('Network response was not ok')
    const data = await res.json()
    const isActive = data.rooms.some(room => room.name === name)
    if (isActive) {
      router.push(`/trade/${name}`)
    } else {
      alert('This trade room is no longer active.')
      fetchRooms()
    }
  } catch (err) {
    console.error('Failed to verify room status:', err)
    alert('Could not verify room status. Please try again.')
  }
}

onMounted(() => {
  fetchRooms()
  timer = setInterval(async () => {
    if (countdown.value > 1) {
      countdown.value--
    } else {
      countdown.value = 0
      await fetchRooms()
      countdown.value = refreshInterval
    }
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>

<style scoped>
</style>
