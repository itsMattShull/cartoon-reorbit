<template>
  <div class="tab-content overflow-y-auto h-full">
    <!-- Toast notification -->
    <Toast
      v-if="toast.visible"
      :message="toast.message"
      :type="toast.type"
    />

    <div class="flex flex-col md:flex-row h-full">
      <!-- Mobile: dropdown to pick or create deck -->
      <div class="md:hidden mb-4 px-4 pt-3">
        <label for="mobile-decks" class="block text-sm font-medium text-gray-300 mb-1">
          Select Deck
        </label>
        <select
          id="mobile-decks"
          v-model="mobileSelection"
          @change="onMobileSelect"
          class="w-full border rounded px-3 py-2 text-gray-800"
        >
          <option value="">-- New Deck --</option>
          <option v-for="d in decks" :key="d.id" :value="d.id">
            {{ d.name }} ({{ d.cards.length }})
          </option>
        </select>
      </div>

      <!-- Sidebar with deck list (hidden on mobile) -->
      <aside class="hidden md:flex md:flex-col w-1/4 pr-3 border-r border-white/20 pt-3 pl-3 overflow-y-auto flex-shrink-0">
        <h2 class="text-lg font-bold mb-3">Your Decks</h2>

        <ul v-if="loadingDecks" class="space-y-2">
          <li v-for="n in 5" :key="n" class="h-8 bg-white/20 rounded animate-pulse"></li>
        </ul>

        <ul v-else-if="decks.length" class="space-y-1">
          <li
            v-for="d in decks"
            :key="d.id"
            class="flex justify-between items-center p-2 hover:bg-white/10 rounded"
          >
            <span class="text-sm truncate">{{ d.name }} ({{ d.cards.length }})</span>
            <div class="flex space-x-1 flex-shrink-0">
              <button @click="editDeck(d)" class="px-2 py-1 bg-indigo-500 text-white rounded text-xs">Edit</button>
              <button @click="confirmDeleteDeck(d)" class="px-2 py-1 bg-red-500 text-white rounded text-xs">Del</button>
            </div>
          </li>
        </ul>

        <p v-else class="text-sm text-gray-300">No decks yet.</p>
      </aside>

      <!-- Main form & card picker -->
      <div class="flex-1 overflow-y-auto px-4 pt-3">
        <div v-if="loadingDecks" class="space-y-4 mb-4">
          <div class="h-6 w-1/3 bg-white/20 rounded animate-pulse"></div>
          <div class="h-4 bg-white/20 rounded animate-pulse w-1/6"></div>
        </div>

        <div v-else>
          <h2 class="text-lg font-bold mb-3">
            {{ form.id ? 'Edit Deck' : 'Create New Deck' }}
          </h2>

          <div class="mb-3">
            <label class="block font-medium mb-1 text-sm">Deck Name</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="Enter deck name"
              class="w-full border rounded px-3 py-2 text-gray-800 text-sm"
            />
          </div>

          <p class="mb-2 text-sm">Select exactly 12 gToons:</p>

          <div v-if="loadingGtoons" class="grid grid-cols-3 gap-2 mb-4">
            <div v-for="n in 12" :key="n" class="h-28 bg-white/20 rounded animate-pulse"></div>
          </div>

          <div v-else class="grid grid-cols-3 gap-2 mb-4">
            <div
              v-for="c in gtoons"
              :key="c.id"
              @click="toggleCard(c)"
              :class="[
                'p-1 border rounded cursor-pointer flex flex-col items-center transition transform',
                selectedIds.includes(c.id)
                  ? 'ring-4 ring-indigo-300 bg-indigo-100 scale-105'
                  : 'hover:scale-105 bg-white/5'
              ]"
            >
              <div class="relative inline-flex items-center justify-center mb-1">
                <img :src="c.assetPath" :alt="c.name" class="object-contain h-20" />
                <GtoonOverlay v-if="c.isGtoon" :power="c.power" :cost="c.cost" />
              </div>
              <p class="text-xs font-semibold mb-0.5 text-center"
                 :class="selectedIds.includes(c.id) ? 'text-gray-900' : ''">{{ c.name }}</p>
              <p class="text-xs"
                 :class="selectedIds.includes(c.id) ? 'text-gray-600' : 'text-gray-300'">PWR: {{ c.power }} / Cost: {{ c.cost }}</p>
              <p v-if="c.abilityKey" class="text-xs font-medium"
                 :class="selectedIds.includes(c.id) ? 'text-indigo-700' : 'text-indigo-300'">
                {{ abilityLabels[c.abilityKey] || 'Unknown Ability' }}
              </p>
              <p v-else class="text-xs"
                 :class="selectedIds.includes(c.id) ? 'text-gray-600' : 'text-gray-400'">No Ability</p>
            </div>
          </div>

          <button
            :disabled="!canSave"
            @click="saveDeck"
            class="bg-green-500 hover:bg-green-600 text-white px-5 py-2 rounded disabled:opacity-50 text-sm mb-4"
          >
            {{ form.id ? 'Update Deck' : 'Create Deck' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <transition name="fade">
      <div
        v-if="deckToDelete"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      >
        <div class="bg-white rounded-lg shadow-lg p-6 w-80">
          <h3 class="text-xl font-bold mb-4 text-gray-800">Delete Deck?</h3>
          <p class="mb-6 text-gray-700">
            Are you sure you want to delete "{{ deckToDelete.name }}"? This cannot be undone.
          </p>
          <div class="flex justify-end space-x-2">
            <button @click="cancelDelete" class="px-4 py-2 bg-gray-200 rounded text-gray-700">Cancel</button>
            <button @click="deleteDeck" class="px-4 py-2 bg-red-600 text-white rounded">Delete</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Toast from '@/components/Toast.vue'
import abilitiesJson from '~/data/abilities.json'
import GtoonOverlay from '@/components/GtoonOverlay.vue'

const toast = ref({ visible: false, message: '', type: 'success', timeout: null })
function showToast(message, type = 'success') {
  clearTimeout(toast.value.timeout)
  toast.value = { visible: true, message, type, timeout: null }
  toast.value.timeout = setTimeout(() => { toast.value.visible = false }, 4000)
}

const abilityLabels = {}
abilitiesJson.forEach(a => { abilityLabels[a.key] = a.label })

const gtoons = ref([])
const decks = ref([])
const loadingDecks = ref(true)
const loadingGtoons = ref(true)
const form = ref({ id: null, name: '', cards: [] })
const deckToDelete = ref(null)
const mobileSelection = ref('')

const selectedIds = computed(() => form.value.cards.map(c => c.id))
const canSave = computed(() => form.value.name.trim() && form.value.cards.length === 12)

async function loadGToons() {
  loadingGtoons.value = true
  const rows = await $fetch('/api/user/ctoons?isGtoon=true')
  gtoons.value = rows.map(r => ({
    id: r.id, ctoonId: r.ctoonId, assetPath: r.assetPath, name: r.name,
    mintNumber: r.mintNumber, rarity: r.rarity, isFirstEdition: r.isFirstEdition,
    set: r.set, series: r.series, releaseDate: r.releaseDate, isGtoon: r.isGtoon,
    cost: r.cost, power: r.power, abilityKey: r.abilityKey, abilityData: r.abilityData
  }))
  loadingGtoons.value = false
}

async function loadDecks() {
  loadingDecks.value = true
  decks.value = await $fetch('/api/game/clash/decks')
  loadingDecks.value = false
  mobileSelection.value = ''
}

function toggleCard(card) {
  const idx = selectedIds.value.indexOf(card.id)
  if (idx >= 0) form.value.cards.splice(idx, 1)
  else if (form.value.cards.length < 12) form.value.cards.push(card)
}

function editDeck(deck) {
  form.value.id = deck.id
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
  mobileSelection.value = deck.id
}

function onMobileSelect() {
  const id = mobileSelection.value
  if (!id) {
    form.value = { id: null, name: '', cards: [] }
  } else {
    const deck = decks.value.find(d => d.id === id)
    if (deck) editDeck(deck)
  }
}

async function saveDeck() {
  const payload = { name: form.value.name, cardIds: selectedIds.value }
  if (form.value.id) payload.id = form.value.id
  try {
    await $fetch('/api/game/clash/decks', { method: 'POST', body: JSON.stringify(payload) })
    showToast(form.value.id ? 'Deck updated!' : 'Deck created!')
    form.value = { id: null, name: '', cards: [] }
    await loadDecks()
  } catch {
    showToast('Failed to save deck.', 'error')
  }
}

function confirmDeleteDeck(deck) { deckToDelete.value = deck }
function cancelDelete() { deckToDelete.value = null }

async function deleteDeck() {
  if (!deckToDelete.value) return
  try {
    await $fetch(`/api/game/clash/decks?id=${deckToDelete.value.id}`, { method: 'DELETE' })
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
.fade-enter-active, .fade-leave-active { transition: opacity .3s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
