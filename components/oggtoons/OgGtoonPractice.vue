<template>
  <div class="tab-content overflow-y-auto h-full p-4 text-white">
    <Toast v-if="toast.visible" :message="toast.message" :type="toast.type" />

    <div class="mb-4 p-3 bg-amber-500/10 border border-amber-400/60 rounded text-sm">
      <strong>Practice Mode</strong> — play a full match against a computer opponent that uses a
      shuffled copy of your deck. <strong>No points are won, lost or staked</strong>, swaps are
      free, and practice matches don't count toward the leaderboard.
    </div>

    <div v-if="loadingDecks" class="h-24 bg-white/20 rounded animate-pulse mb-4"></div>
    <div v-else-if="!validDecks.length" class="mb-4 p-3 bg-red-500/20 border border-red-400 rounded text-sm">
      You need a valid 12-card deck before you can practice. Build one on the Manage Deck tab.
    </div>
    <div v-else class="space-y-6">
      <div>
        <label class="block text-sm font-medium mb-1">Your deck</label>
        <select v-model="selectedDeckId" class="w-full max-w-sm border rounded px-3 py-2 text-gray-800 text-sm">
          <option v-for="d in validDecks" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
        <p class="text-xs text-gray-300 mt-1">
          The computer plays the same 12 cards in a different order, so you'll never face a perfect mirror.
        </p>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Difficulty</label>
        <div class="grid gap-2 max-w-xl">
          <label
            v-for="o in DIFFICULTY_OPTIONS"
            :key="o.id"
            class="flex items-start gap-2 p-2 rounded border cursor-pointer"
            :class="difficulty === o.id ? 'border-amber-400 bg-amber-500/10' : 'border-white/10 bg-white/5'"
          >
            <input type="radio" v-model="difficulty" :value="o.id" class="mt-1" />
            <span>
              <span class="text-sm font-semibold">{{ o.label }}</span>
              <span class="block text-xs text-gray-300">{{ o.help }}</span>
            </span>
          </label>
        </div>
      </div>

      <button
        :disabled="!selectedDeckId || starting"
        @click="start"
        class="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-5 py-2 rounded text-sm"
      >{{ starting ? 'Starting…' : 'Start Practice Match' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from '#imports'
import Toast from '@/components/Toast.vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

const router = useRouter()
const { currentMatchId, lastError, startPractice } = useOgGtoonsSocket()

const DIFFICULTY_OPTIONS = [
  { id: 'easy',   label: 'Easy',   help: 'Plays its cards in a random order (even its goal card) and never swaps.' },
  { id: 'normal', label: 'Normal', help: 'Keeps your goal color, shuffles the rest, and swaps once if it gets a weak card.' },
  { id: 'hard',   label: 'Hard',   help: 'Leads with its best cards, favors its goal color, and swaps smartly.' }
]

const toast = ref({ visible: false, message: '', type: 'success', timeout: null })
function showToast(message, type = 'success') {
  clearTimeout(toast.value.timeout)
  toast.value = { visible: true, message, type, timeout: null }
  toast.value.timeout = setTimeout(() => { toast.value.visible = false }, 4000)
}

const decks = ref([])
const loadingDecks = ref(true)
const selectedDeckId = ref('')
const difficulty = ref('normal')
const starting = ref(false)

const validDecks = computed(() => decks.value.filter(d => d.valid))

function start() {
  if (!selectedDeckId.value || starting.value) return
  starting.value = true
  startPractice(selectedDeckId.value, difficulty.value)
  // The server answers with matchStart (navigates below) or an error (re-enables the button).
  setTimeout(() => { starting.value = false }, 4000)
}

watch(currentMatchId, (id) => {
  if (id) router.push(`/newsite/gtoons-classic/${id}`)
})

watch(lastError, (err) => {
  if (!err) return
  starting.value = false
  showToast(err.message || 'Could not start practice.', 'error')
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
