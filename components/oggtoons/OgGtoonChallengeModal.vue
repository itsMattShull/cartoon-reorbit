<!-- components/oggtoons/OgGtoonChallengeModal.vue -->
<!-- Mounted once on the gToons hub page, so a match request pops up on whichever tab the player is on.
     Shows who is asking and the stake; "Start Match" starts the game for both players, "Decline" tells the
     challenger. Also toasts what happened to a request YOU sent (declined, opponent got busy, expired). -->
<template>
  <div>
    <Toast v-if="toast.visible" :message="toast.message" :type="toast.type" />

    <transition name="fade">
      <div
        v-if="incoming"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="og-challenge-title"
      >
        <div class="bg-white text-gray-800 rounded-xl shadow-lg p-5 w-full max-w-sm">
          <h3 id="og-challenge-title" class="text-lg font-bold mb-2">gToons Match Request</h3>
          <p class="mb-1"><strong>{{ incoming.fromUsername }}</strong> wants to play you!</p>
          <p class="mb-3 text-sm text-gray-600">Stake: <strong>{{ incoming.stake }} points</strong></p>

          <template v-if="validDecks.length">
            <label for="og-challenge-deck" class="block text-sm font-medium mb-1">Your deck</label>
            <select id="og-challenge-deck" v-model="selectedDeckId" class="w-full border rounded px-3 py-2 mb-4 text-sm text-gray-800">
              <option v-for="d in validDecks" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </template>
          <p v-else class="mb-4 text-sm text-red-600">
            {{ loadingDecks ? 'Loading your decks…' : 'You need a valid 12-card deck to play. Build one on the Manage Deck tab.' }}
          </p>

          <div class="flex justify-end gap-2">
            <button type="button" class="px-4 py-2 bg-gray-200 rounded" @click="declineChallenge(incoming.id)">Decline</button>
            <button
              type="button"
              :disabled="!selectedDeckId"
              class="px-4 py-2 bg-green-500 disabled:opacity-50 text-white rounded font-semibold"
              @click="acceptChallenge(incoming.id, selectedDeckId)"
            >Start Match</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Toast from '@/components/Toast.vue'
import { useOgGtoonsRoomSocket } from '@/composables/useOgGtoonsRoomSocket'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

const props = defineProps({
  // The Matchmaking tab already toasts socket errors itself; every other tab relies on this component.
  showErrors: { type: Boolean, default: true }
})

const { lobbyState, challengeNotice, acceptChallenge, declineChallenge } = useOgGtoonsRoomSocket()
const { lastError } = useOgGtoonsSocket()

const incoming = computed(() => lobbyState.value?.incomingChallenges?.[0] || null)

// Same selection the Matchmaking tab uses, so the deck picked there is the one offered here.
const selectedDeckId = useState('ogGtoonSelectedDeckId', () => '')
const decks = ref([])
const loadingDecks = ref(false)
const validDecks = computed(() => decks.value.filter(d => d.valid))

// Decks are fetched when a request arrives, so edits made since the page loaded are respected.
watch(() => incoming.value?.id, async (id) => {
  if (!id) return
  loadingDecks.value = true
  try {
    decks.value = await $fetch('/api/game/oggtoons/decks')
  } catch {
    decks.value = []
  }
  loadingDecks.value = false
  if (!validDecks.value.some(d => d.id === selectedDeckId.value)) selectedDeckId.value = validDecks.value[0]?.id || ''
}, { immediate: true })

const toast = ref({ visible: false, message: '', type: 'success', timeout: null })
function showToast(message, type = 'success') {
  clearTimeout(toast.value.timeout)
  toast.value = { visible: true, message, type, timeout: null }
  toast.value.timeout = setTimeout(() => { toast.value.visible = false }, 4000)
}

watch(challengeNotice, (n) => {
  if (!n) return
  const text = n.kind === 'expired' ? `Your match request to ${n.username} expired.`
    : n.kind === 'busy' ? `${n.username} is no longer available.`
      : `${n.username} declined your match request.`
  showToast(text, 'error')
})

watch(lastError, (err) => {
  if (err && props.showErrors) showToast(err.message || 'Something went wrong.', 'error')
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
