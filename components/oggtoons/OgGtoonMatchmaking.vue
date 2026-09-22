<template>
  <div class="tab-content overflow-y-auto h-full p-4 text-white">
    <Toast v-if="toast.visible" :message="toast.message" :type="toast.type" />

    <div v-if="loadingDecks" class="h-24 bg-white/20 rounded animate-pulse mb-4"></div>
    <div v-else-if="!validDecks.length" class="mb-4 p-3 bg-red-500/20 border border-red-400 rounded text-sm">
      You need a valid 12-card deck before you can play. Build one on the Manage Deck tab.
    </div>
    <div v-else class="space-y-6">
      <!-- Deck picker -->
      <div>
        <label class="block text-sm font-medium mb-1">Deck</label>
        <select v-model="selectedDeckId" class="w-full max-w-sm border rounded px-3 py-2 text-gray-800 text-sm">
          <option v-for="d in validDecks" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>

      <!-- Random queue -->
      <div class="p-3 bg-white/5 rounded border border-white/10">
        <h3 class="font-bold mb-2">Random Match</h3>
        <div class="flex items-center gap-2 flex-wrap">
          <label class="text-sm">Stake:</label>
          <input v-model.number="queueStake" type="number" min="0" class="w-24 border rounded px-2 py-1 text-gray-800 text-sm" />
          <button
            v-if="!lobbyState?.inQueue"
            :disabled="!selectedDeckId"
            @click="joinQueue(selectedDeckId, queueStake)"
            class="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
          >Find Match</button>
          <button v-else @click="leaveQueue" class="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded text-sm">
            Leave Queue
          </button>
          <span v-if="lobbyState?.inQueue" class="text-xs text-amber-300 animate-pulse">Searching for an opponent...</span>
        </div>
      </div>

      <!-- Direct challenge -->
      <div class="p-3 bg-white/5 rounded border border-white/10">
        <h3 class="font-bold mb-2">Challenge a Player</h3>
        <div class="flex items-center gap-2 flex-wrap">
          <input v-model="challengeTarget" type="text" placeholder="Username" class="border rounded px-2 py-1 text-gray-800 text-sm w-40" />
          <label class="text-sm">Stake:</label>
          <input v-model.number="challengeStake" type="number" min="0" class="w-24 border rounded px-2 py-1 text-gray-800 text-sm" />
          <button
            :disabled="!challengeTarget.trim() || !selectedDeckId"
            @click="sendChallengeClick"
            class="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
          >Send Challenge</button>
        </div>

        <div v-if="lobbyState?.sentChallenges?.length" class="mt-3 space-y-1">
          <p class="text-xs text-gray-300">Pending challenges you sent:</p>
          <div v-for="c in lobbyState.sentChallenges" :key="c.id" class="flex items-center justify-between text-sm bg-white/5 rounded px-2 py-1">
            <span>{{ c.toUsername }} ({{ c.stake }} pts)</span>
            <button @click="cancelChallenge(c.id)" class="text-red-400 text-xs">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Incoming challenge — compact mobile-safe bottom-aligned modal, not a full-screen takeover -->
    <transition name="fade">
      <div
        v-if="activeIncoming"
        class="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50"
      >
        <div class="bg-white text-gray-800 rounded-t-xl md:rounded-xl shadow-lg p-5 w-full md:w-96 mx-auto">
          <h3 class="text-lg font-bold mb-2">gToons Challenge</h3>
          <p class="mb-1"><strong>{{ activeIncoming.fromUsername }}</strong> has challenged you!</p>
          <p class="mb-4 text-sm text-gray-600">Stake: <strong>{{ activeIncoming.stake }} points</strong></p>
          <div class="flex justify-end gap-2">
            <button @click="declineChallenge(activeIncoming.id)" class="px-4 py-2 bg-gray-200 rounded">Decline</button>
            <button
              :disabled="!selectedDeckId"
              @click="acceptChallenge(activeIncoming.id, selectedDeckId)"
              class="px-4 py-2 bg-green-500 disabled:opacity-50 text-white rounded"
            >Accept</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from '#imports'
import Toast from '@/components/Toast.vue'
import { useOgGtoonsRoomSocket } from '@/composables/useOgGtoonsRoomSocket'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

const router = useRouter()
const {
  lobbyState, joinQueue, leaveQueue, sendChallenge, acceptChallenge, declineChallenge, cancelChallenge
} = useOgGtoonsRoomSocket()
const { currentMatchId } = useOgGtoonsSocket()

const toast = ref({ visible: false, message: '', type: 'success', timeout: null })
function showToast(message, type = 'success') {
  clearTimeout(toast.value.timeout)
  toast.value = { visible: true, message, type, timeout: null }
  toast.value.timeout = setTimeout(() => { toast.value.visible = false }, 4000)
}

const decks = ref([])
const loadingDecks = ref(true)
const selectedDeckId = ref('')
const queueStake = ref(0)
const challengeTarget = ref('')
const challengeStake = ref(0)

const validDecks = computed(() => decks.value.filter(d => d.valid))
const activeIncoming = computed(() => lobbyState.value?.incomingChallenges?.[0] || null)

function sendChallengeClick() {
  sendChallenge(challengeTarget.value.trim(), selectedDeckId.value, challengeStake.value)
  challengeTarget.value = ''
}

watch(currentMatchId, (id) => {
  if (id) router.push(`/newsite/gtoons-classic/${id}`)
})

onMounted(async () => {
  loadingDecks.value = true
  try {
    decks.value = await $fetch('/api/game/oggtoons/decks')
    if (validDecks.value.length) selectedDeckId.value = validDecks.value[0].id
  } catch {
    showToast('Failed to load decks.', 'error')
  }
  loadingDecks.value = false
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
