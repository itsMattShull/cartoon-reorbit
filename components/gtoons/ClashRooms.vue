<template>
  <div class="tab-content overflow-y-auto h-full px-4 py-3">
    <h2 class="text-xl font-bold mb-4">gToons Clash Rooms</h2>

    <div class="mb-4">
      <button @click="openStakeModal" class="px-4 py-2 bg-indigo-500 text-white rounded text-sm">
        Create New Room
      </button>
    </div>

    <!-- Cards grid -->
    <div v-if="rooms.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div
        v-for="r in rooms"
        :key="r.id"
        class="p-3 border rounded-lg shadow-sm bg-white text-gray-900 flex items-center justify-between"
      >
        <div>
          <div class="text-xs uppercase tracking-wide text-gray-500">Player waiting</div>
          <div class="font-semibold text-gray-800">
            {{ r.owner }}
            <span
              v-if="isMyRoom(r)"
              class="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
            >You</span>
          </div>
          <div class="text-xs text-gray-600 mt-1">
            <template v-if="requiredStake(r) > 0">
              Stake: <span class="font-medium">{{ requiredStake(r).toLocaleString() }}</span> pts
            </template>
            <template v-else>
              No stake required
            </template>
          </div>
        </div>

        <button
          @click="!joinDisabled(r) && joinRoom(r.id)"
          :disabled="joinDisabled(r)"
          class="px-3 py-1.5 rounded text-white transition text-sm"
          :class="joinDisabled(r)
            ? 'bg-gray-400 cursor-not-allowed opacity-60'
            : 'bg-green-500 hover:bg-green-600'"
          :title="joinTitle(r)"
        >
          Join
        </button>
      </div>
    </div>

    <div v-else class="text-gray-400">No open rooms right now. Create one!</div>

    <!-- Stake Points Modal -->
    <div
      v-if="showStakeModal"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div class="absolute inset-0 bg-black/40" @click="closeStakeModal"></div>

      <div class="relative w-full max-w-md bg-white rounded-xl shadow-xl p-5 text-gray-800">
        <div class="flex items-start justify-between">
          <h2 class="text-lg font-semibold text-gray-800">Stake Points (optional)</h2>
          <button @click="closeStakeModal" class="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        <p class="mt-2 text-sm text-gray-600">
          You have <span class="font-medium">{{ maxPoints.toLocaleString() }}</span> points available.
          Enter how many points you want to stake for this room.
        </p>

        <div class="mt-4">
          <label class="block text-sm font-medium mb-1 text-gray-700">Points to stake</label>
          <div class="flex gap-2">
            <input
              v-model.number="stakePoints"
              @input="sanitizeStake"
              type="number"
              min="0"
              :max="maxPoints"
              step="1"
              inputmode="numeric"
              class="w-full border rounded px-3 py-2 text-gray-800"
              placeholder="0"
            />
            <button
              type="button"
              class="px-3 py-2 border rounded hover:bg-gray-50 text-gray-700"
              @click="stakePoints = maxPoints"
              :disabled="maxPoints === 0"
            >
              Max
            </button>
          </div>
          <p class="mt-1 text-xs text-gray-500">Allowed range: 0 – {{ maxPoints.toLocaleString() }}</p>
          <p v-if="stakeError" class="mt-1 text-xs text-red-600">{{ stakeError }}</p>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button @click="closeStakeModal" class="px-4 py-2 rounded border text-gray-700">Cancel</button>
          <button
            @click="confirmCreateRoom"
            :disabled="!!stakeError"
            class="px-4 py-2 rounded text-white transition"
            :class="stakeError ? 'bg-gray-400 cursor-not-allowed opacity-60' : 'bg-indigo-600 hover:bg-indigo-700'"
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useClashSocket } from '@/composables/useClashSocket'

const rooms = ref([])
const router = useRouter()

const { user, fetchSelf } = useAuth()
const { socket } = useClashSocket()

function isMyRoom(r) {
  return r?.owner && user.value?.username && r.owner === user.value.username
}

const myPoints = computed(() => {
  const n = Number(user.value?.points ?? 0)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
})
const requiredStake = (r) => Math.max(0, Math.floor(Number(r?.points ?? 0)))
const hasEnough = (r) => myPoints.value >= requiredStake(r)
const joinDisabled = (r) => isMyRoom(r) || !hasEnough(r)
const joinTitle = (r) => {
  if (isMyRoom(r)) return `You can't join your own room`
  const need = requiredStake(r)
  if (need > 0 && !hasEnough(r)) return `Need ${need.toLocaleString()} points to join`
  return 'Join this room'
}

function joinRoom(id) {
  const r = rooms.value.find(x => x.id === id)
  if (!r || joinDisabled(r)) return
  router.push(`/newsite/gtoons/${id}`)
}

function requestRooms() {
  socket.emit('listClashRooms')
}

const showStakeModal = ref(false)
const stakePoints = ref(0)
const maxPoints = computed(() => myPoints.value)

const stakeError = computed(() => {
  const n = Number(stakePoints.value)
  if (!Number.isFinite(n)) return 'Enter a valid number.'
  if (n < 0) return 'Stake cannot be negative.'
  if (n > maxPoints.value) return `You can stake at most ${maxPoints.value.toLocaleString()} points.`
  if (!Number.isInteger(n)) return 'Stake must be a whole number.'
  return ''
})

function sanitizeStake() {
  let n = Number(stakePoints.value)
  if (!Number.isFinite(n)) n = 0
  if (n < 0) n = 0
  if (n > maxPoints.value) n = maxPoints.value
  stakePoints.value = Math.floor(n)
}

function openStakeModal() {
  stakePoints.value = 0
  showStakeModal.value = true
}

function closeStakeModal() {
  showStakeModal.value = false
}

function confirmCreateRoom() {
  sanitizeStake()
  if (stakeError.value) return

  const roomId = Date.now().toString()
  socket.emit('createClashRoom', {
    roomId,
    userId: user.value?.id,
    points: stakePoints.value,
  })

  showStakeModal.value = false
  router.push(`/newsite/gtoons/${roomId}`)
}

onMounted(async () => {
  await fetchSelf()

  socket.on('clashRooms', (list) => {
    rooms.value = Array.isArray(list)
      ? list.map(r => ({ id: r.id, owner: r.owner, points: Number(r.points ?? 0) }))
      : []
  })

  socket.on('roomCreated', (room) => {
    rooms.value = [
      { id: room.id, owner: room.owner, points: Number(room.points ?? 0) },
      ...rooms.value.filter(r => r.id !== room.id)
    ]
  })

  socket.on('roomRemoved', ({ id }) => {
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
