<template>
  <Nav />
  <!-- Toast notification -->
  <Toast
    v-if="toast.visible"
    :message="toast.message"
    :type="toast.type"
  />

  <section class="pt-20 flex flex-col md:flex-row max-w-6xl mx-auto">
    <!-- Mobile: dropdown to pick or create deck -->
    <div class="md:hidden mb-4 px-4">
      <label for="mobile-decks" class="block text-sm font-medium text-gray-700 mb-1">
        Select Deck
      </label>
      <select
        id="mobile-decks"
        v-model="mobileSelection"
        @change="onMobileSelect"
        class="w-full border rounded px-3 py-2"
      >
        <option value="">-- New Deck --</option>
        <option
          v-for="d in decks"
          :key="d.id"
          :value="d.id"
        >
          {{ d.name }} ({{ d.cards.length }})
        </option>
      </select>
    </div>

    <!-- Sidebar with deck list (hidden on mobile) -->
    <aside class="hidden md:block w-1/4 pr-6 border-r">
      <h2 class="text-2xl font-bold mb-4">Your Decks</h2>

      <!-- Decks Skeleton -->
      <ul v-if="loadingDecks" class="space-y-2">
        <li
          v-for="n in 5"
          :key="n"
          class="h-8 bg-gray-200 rounded animate-pulse"
        ></li>
      </ul>

      <!-- Deck List -->
      <ul v-else-if="decks.length" class="space-y-2">
        <li
          v-for="d in decks"
          :key="d.id"
          class="flex justify-between items-center p-2 hover:bg-gray-50 rounded"
        >
          <span>{{ d.name }} ({{ d.cards.length }})</span>
          <div class="flex space-x-2">
            <button
              @click="editDeck(d)"
              class="px-3 py-1 bg-indigo-500 text-white rounded"
            >Edit</button>
            <button
              @click="confirmDeleteDeck(d)"
              class="px-3 py-1 bg-red-500 text-white rounded"
            >Delete</button>
          </div>
        </li>
      </ul>

      <!-- No decks -->
      <p v-else class="text-gray-600">No decks yet.</p>
    </aside>

    <!-- Main form & card picker -->
    <div class="flex-1 pl-0 md:pl-6">
      <div class="mb-6 text-right px-4 md:px-0">
        <button
          type="button"
          @click="goBack"
          class="inline-block bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
        >
          Back to Clash
        </button>
      </div>

      <!-- Form Skeleton -->
      <div v-if="loadingDecks" class="space-y-4 mb-6 px-4 md:px-0">
        <div class="h-8 w-1/3 bg-gray-200 rounded animate-pulse"></div>
        <div class="h-6 bg-gray-200 rounded animate-pulse w-1/6"></div>
      </div>

      <!-- Deck Form -->
      <div v-else class="px-4 md:px-0">
        <h1 class="text-3xl font-bold mb-6">
          {{ form.id ? 'Edit Deck' : 'Create New Deck' }}
        </h1>

        <div class="mb-4">
          <label class="block font-medium mb-1">Deck Name</label>
          <input
            v-model="form.name"
            type="text"
            placeholder="Enter deck name"
            class="w-full border rounded px-3 py-2"
          />
        </div>

        <p class="mb-2">Select exactly 12 gToons:</p>

        <!-- Cards Skeleton -->
        <div v-if="loadingGtoons" class="grid grid-cols-3 gap-4 mb-6">
          <div
            v-for="n in 12"
            :key="n"
            class="h-32 bg-gray-200 rounded animate-pulse"
          ></div>
        </div>

        <!-- Card Picker -->
        <div v-else class="grid grid-cols-3 gap-4 mb-6">
          <div
            v-for="c in gtoons"
            :key="c.id"
            @click="toggleCard(c)"
            :class="[
              'p-2 border rounded cursor-pointer flex flex-col items-center transition transform',
              selectedIds.includes(c.id)
                ? 'ring-4 ring-indigo-300 bg-indigo-100 scale-105'
                : 'hover:scale-105'
            ]"
          >
            <img
              :src="c.assetPath"
              :alt="c.name"
              class="w-20 h-20 object-contain mb-2"
            />
            <p class="text-sm font-semibold mb-1">{{ c.name }}</p>
            <p class="text-xs mb-1">Power: {{ c.power }}</p>
            <p class="text-xs mb-1">Cost: {{ c.cost }}</p>
            <template v-if="c.abilityKey">
              <p class="text-xs font-medium mb-1">
                {{ abilityLabels[c.abilityKey] || 'Unknown Ability' }}
              </p>
            </template>
            <p v-else class="text-xs text-gray-600">Ability: None</p>
          </div>
        </div>

        <button
          :disabled="!canSave"
          @click="saveDeck"
          class="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          {{ form.id ? 'Update Deck' : 'Create Deck' }}
        </button>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <transition name="fade">
      <div
        v-if="deckToDelete"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      >
        <div class="bg-white rounded-lg shadow-lg p-6 w-80">
          <h3 class="text-xl font-bold mb-4">Delete Deck?</h3>
          <p class="mb-6">
            Are you sure you want to delete "{{ deckToDelete.name }}"? This cannot be undone.
          </p>
          <div class="flex justify-end space-x-2">
            <button
              @click="cancelDelete"
              class="px-4 py-2 bg-gray-200 rounded"
            >Cancel</button>
            <button
              @click="deleteDeck"
              class="px-4 py-2 bg-red-600 text-white rounded"
            >Delete</button>
          </div>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Toast from '@/components/Toast.vue'
import abilitiesJson from '~/data/abilities.json'
import Nav from '@/components/Nav.vue'
import { useRouter } from 'vue-router'

definePageMeta({ middleware: 'auth', layout: 'default' })

// Toast state
const toast = ref({ visible: false, message: '', type: 'success', timeout: null })
function showToast(message, type = 'success') {
  clearTimeout(toast.value.timeout)
  toast.value = { visible: true, message, type, timeout: null }
  toast.value.timeout = setTimeout(() => {
    toast.value.visible = false
  }, 4000)
}

const router = useRouter()

// map ability keys to labels
const abilityLabels = {}
abilitiesJson.forEach(a => {
  abilityLabels[a.key] = a.label
})

function goBack() {
  // if there's a previous history entry, go back; otherwise go to rooms
  if (process.client && window.history.length > 1) {
    router.back()
  } else {
    router.push('/games/clash/rooms')
  }
}

const gtoons = ref([])
const decks  = ref([])

// loading state
const loadingDecks = ref(true)
const loadingGtoons = ref(true)

// form holds current deck
const form = ref({ id: null, name: '', cards: [] })

// track deck pending deletion
const deckToDelete = ref(null)

// mobile selection
const mobileSelection = ref('')

// computed list of selected IDs
const selectedIds = computed(() => form.value.cards.map(c => c.id))
const canSave = computed(
  () => form.value.name.trim() && form.value.cards.length === 12
)

// load user ctoons
async function loadGToons() {
  loadingGtoons.value = true
  const rows = await $fetch('/api/user/ctoons?isGtoon=true')
  gtoons.value = rows.map(r => ({
    id:             r.id,
    ctoonId:        r.ctoonId,
    assetPath:      r.assetPath,
    name:           r.name,
    mintNumber:     r.mintNumber,
    rarity:         r.rarity,
    isFirstEdition: r.isFirstEdition,
    set:            r.set,
    series:         r.series,
    releaseDate:    r.releaseDate,
    isGtoon:        r.isGtoon,
    cost:           r.cost,
    power:          r.power,
    abilityKey:     r.abilityKey,
    abilityData:    r.abilityData
  }))
  loadingGtoons.value = false
}

// load decks
async function loadDecks() {
  loadingDecks.value = true
  decks.value = await $fetch('/api/game/clash/decks')
  loadingDecks.value = false
  // reset mobile selector on reload
  mobileSelection.value = ''
}

// toggle card selection
function toggleCard(card) {
  const idx = selectedIds.value.indexOf(card.id)
  if (idx >= 0) form.value.cards.splice(idx, 1)
  else if (form.value.cards.length < 12) form.value.cards.push(card)
}

// start editing a deck
function editDeck(deck) {
  form.value.id   = deck.id
  form.value.name = deck.name
  form.value.cards = []
  const available = [...gtoons.value]
  deck.cards.forEach(dc => {
    const idx = available.findIndex(c => c.ctoonId === dc.id)
    if (idx !== -1) {
      form.value.cards.push(available[idx])
      available.splice(idx, 1)
    }
  })
  // sync mobile selector
  mobileSelection.value = deck.id
}

// handle mobile dropdown change
function onMobileSelect() {
  const id = mobileSelection.value
  if (!id) {
    form.value = { id: null, name: '', cards: [] }
  } else {
    const deck = decks.value.find(d => d.id === id)
    if (deck) editDeck(deck)
  }
}

// create or update deck
async function saveDeck() {
  const payload = { name: form.value.name, cardIds: selectedIds.value }
  if (form.value.id) payload.id = form.value.id
  try {
    await $fetch('/api/game/clash/decks', {
      method: 'POST',
      body:   JSON.stringify(payload)
    })
    showToast(form.value.id ? 'Deck updated!' : 'Deck created!')
    form.value = { id: null, name: '', cards: [] }
    await loadDecks()
  } catch {
    showToast('Failed to save deck.', 'error')
  }
}

// confirm deletion
function confirmDeleteDeck(deck) {
  deckToDelete.value = deck
}

// cancel deletion
function cancelDelete() {
  deckToDelete.value = null
}

// delete deck
async function deleteDeck() {
  if (!deckToDelete.value) return
  try {
    await $fetch(`/api/game/clash/decks?id=${deckToDelete.value.id}`, {
      method: 'DELETE'
    })
    showToast('Deck deleted', 'success')
    deckToDelete.value = null
    await loadDecks()
  } catch {
    showToast('Failed to delete deck.', 'error')
  }
}

onMounted(async () => {
  await loadGToons()
  await loadDecks()
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity .3s ease }
.fade-enter-from,
.fade-leave-to     { opacity: 0 }
</style>
