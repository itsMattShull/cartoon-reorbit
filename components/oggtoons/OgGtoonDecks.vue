<template>
  <div class="tab-content overflow-y-auto h-full">
    <Toast v-if="toast.visible" :message="toast.message" :type="toast.type" />

    <div class="flex flex-col md:flex-row h-full">
      <!-- Mobile: dropdown to pick or create deck -->
      <div class="md:hidden mb-4 px-4 pt-3">
        <label for="mobile-decks" class="block text-sm font-medium text-gray-300 mb-1">Select Deck</label>
        <select
          id="mobile-decks"
          v-model="mobileSelection"
          @change="onMobileSelect"
          class="w-full border rounded px-3 py-2 text-gray-800"
        >
          <option value="">-- New Deck --</option>
          <option v-for="d in decks" :key="d.id" :value="d.id">
            {{ d.name }} {{ d.valid ? '' : '(invalid)' }}
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
          <li v-for="d in decks" :key="d.id" class="flex justify-between items-center p-2 hover:bg-white/10 rounded">
            <span class="text-sm truncate">
              {{ d.name }}
              <span v-if="!d.valid" class="text-red-400 text-xs ml-1">invalid</span>
            </span>
            <div class="flex space-x-1 flex-shrink-0">
              <button @click="editDeck(d)" class="px-2 py-1 bg-indigo-500 text-white rounded text-xs">Edit</button>
              <button @click="confirmDeleteDeck(d)" class="px-2 py-1 bg-red-500 text-white rounded text-xs">Del</button>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-gray-300">No decks yet.</p>
      </aside>

      <!-- Main: 12-slot deck + tap-to-add owned-card grid -->
      <div class="flex-1 overflow-y-auto px-4 pt-3">
        <div v-if="loadingDecks || loadingGtoons" class="space-y-4 mb-4">
          <div class="h-6 w-1/3 bg-white/20 rounded animate-pulse"></div>
          <div class="grid grid-cols-6 gap-2">
            <div v-for="n in 12" :key="n" class="h-24 bg-white/20 rounded animate-pulse"></div>
          </div>
        </div>

        <div v-else>
          <h2 class="text-lg font-bold mb-2">{{ form.id ? 'Edit Deck' : 'Create New Deck' }}</h2>

          <p class="mb-3 text-xs flex items-start gap-2 bg-amber-500/10 border border-amber-400/50 rounded px-2 py-1.5" data-tut="duplicate-character-legend">
            <span class="og-warn flex-shrink-0" aria-hidden="true">{{ WARN_ICON }}</span>
            <span>
              This icon means your deck already has a gToon with the same character as that card.
              You can still add it, but you may want to pick a different one.
            </span>
          </p>

          <div class="mb-3">
            <label class="block font-medium mb-1 text-sm">Deck Name</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="Enter deck name"
              class="w-full border rounded px-3 py-2 text-gray-800 text-sm"
            />
          </div>

          <p class="mb-1 text-sm">
            Tap a gToon below to add it to the next open slot. Tap a filled slot to remove it.
            Slot order doesn't matter: your 12 cards are shuffled and 6 are dealt to your hand at the start of a match.
            At the start of a match one random card from each player's deck is picked as their Goal Card, and its color sets that player's goal color.
          </p>

          <!-- The 12 ordered slots -->
          <div class="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-4 mt-2">
            <div
              v-for="pos in 12"
              :key="pos"
              v-on="slots[pos-1] ? gestureFor(slots[pos-1]).events : {}"
              @click.capture="slots[pos-1] && gestureFor(slots[pos-1]).clickCapture($event)"
              @click="slots[pos-1] && removeFromSlot(pos-1)"
              style="-webkit-touch-callout: none; -webkit-user-select: none; user-select: none"
              :class="[
                'relative border-2 rounded flex flex-col items-center justify-center h-24 cursor-pointer transition',
                slots[pos-1] ? 'border-indigo-400 bg-white/5' : 'border-dashed border-white/30 bg-white/5'
              ]"
            >
              <template v-if="slots[pos-1]">
                <span
                  v-if="sharedCharacters(slots[pos-1], slots).length"
                  class="og-warn absolute top-0.5 right-0.5 z-10"
                  role="img"
                  :title="duplicateText(slots[pos-1])"
                  :aria-label="duplicateText(slots[pos-1])"
                >{{ WARN_ICON }}</span>
                <CtoonImage :ctoon="slots[pos-1]" class="h-14 og-inspectable" hover-fx />
                <p class="text-[10px] text-center truncate w-full px-1">{{ slots[pos-1].name }}</p>
              </template>
              <span v-else class="text-xs text-gray-400">Slot {{ pos }}</span>
            </div>
          </div>

          <p class="mb-2 text-sm">
            Your gToons:
            <span v-if="filtersActive && gtoons.length" class="text-xs text-gray-300">
              (showing {{ visibleGtoons.length }} of {{ gtoons.length }})
            </span>
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div
              v-for="c in visibleGtoons"
              :key="c.id"
              v-on="gestureFor(c).events"
              @click.capture="gestureFor(c).clickCapture($event)"
              @click="addCard(c)"
              style="-webkit-touch-callout: none; -webkit-user-select: none; user-select: none"
              :class="[
                'relative p-1 border rounded cursor-pointer flex flex-col items-center transition transform',
                usedIds.includes(c.ctoonId)
                  ? 'opacity-30 cursor-not-allowed'
                  : 'hover:scale-105 bg-white/5'
              ]"
            >
              <span
                v-if="!usedIds.includes(c.ctoonId) && sharedCharacters(c, slots).length"
                class="og-warn absolute top-1 right-1 z-10"
                role="img"
                :title="duplicateText(c)"
                :aria-label="duplicateText(c)"
              >{{ WARN_ICON }}</span>
              <CtoonImage :ctoon="c" class="object-contain h-28 sm:h-16 mb-1 og-inspectable" hover-fx />
              <p class="text-xs font-semibold text-center truncate w-full">{{ c.name }}</p>
              <p class="text-[10px]" :style="{ color: colorHex(c.gtoonColor) }">{{ c.gtoonColor }}</p>
              <p class="text-[10px] text-gray-300">Value: {{ c.gtoonValue }}</p>
              <p v-if="c.isSlamGtoon" class="text-[10px] font-bold text-yellow-300">SLAM</p>
              <p
                class="text-[10px] text-center w-full mt-0.5 sm:line-clamp-2"
                :class="c.powerDescription ? 'text-white/90' : 'text-gray-400'"
                :title="c.powerDescription || undefined"
              >{{ c.powerDescription || 'No power' }}</p>
            </div>
          </div>
          <p v-if="!loadingGtoons && !gtoons.length" class="text-sm text-gray-400 mb-4">
            You don't own any gToons yet.
          </p>
          <p v-else-if="!loadingGtoons && !visibleGtoons.length" class="text-sm text-gray-400 mb-4">
            No gToons match your filters.
          </p>

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
      <div v-if="deckToDelete" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-lg p-6 w-80 text-gray-800">
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

    <!-- Printed properties of a card (right-click / long-press) -->
    <OgGtoonInfoModal />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Toast from '@/components/Toast.vue'
import CtoonImage from '@/components/CtoonImage.vue'
import OgGtoonInfoModal from '@/components/oggtoons/OgGtoonInfoModal.vue'
import { useOgGtoonInfo } from '@/composables/useOgGtoonInfo'
import { matchesDeckFilter, sharedCharacters, isDeckFilterActive, emptyDeckFilter } from '@/utils/ogGtoonDeckFilter'

// Right-click / long-press a card for its printed properties; one gesture handler set per card object.
const { inspectGesture } = useOgGtoonInfo()
const gestureCache = new WeakMap()
function gestureFor(card) {
  let g = gestureCache.get(card)
  if (!g) {
    const { clickCapture, ...events } = inspectGesture(() => card)
    g = { events, clickCapture }
    gestureCache.set(card, g)
  }
  return g
}

const toast = ref({ visible: false, message: '', type: 'success', timeout: null })
function showToast(message, type = 'success') {
  clearTimeout(toast.value.timeout)
  toast.value = { visible: true, message, type, timeout: null }
  toast.value.timeout = setTimeout(() => { toast.value.visible = false }, 4000)
}

const COLOR_HEX = {
  BLACK: '#cccccc', SILVER: '#c0c0c0', BLUE: '#60a5fa', RED: '#f87171',
  YELLOW: '#facc15', GREEN: '#4ade80', PURPLE: '#c084fc', ORANGE: '#fb923c', PINK: '#f472b6'
}
function colorHex(c) { return COLOR_HEX[c] || '#ffffff' }

const gtoons = ref([])
const decks = ref([])
const loadingDecks = ref(true)
const loadingGtoons = ref(true)
const form = ref({ id: null, name: '' })
// slots[i] holds the card object (or undefined) for deck position i (0-11)
const slots = ref(new Array(12).fill(undefined))
const deckToDelete = ref(null)
const mobileSelection = ref('')

// Search/filter controls live in the left sidebar (components/newsite/OgGtoonDeckSidebar.vue).
const filter = useOgGtoonDeckFilter()
const filterMeta = useOgGtoonDeckMeta()
const visibleGtoons = computed(() => gtoons.value.filter(c => matchesDeckFilter(c, filter.value)))
const filtersActive = computed(() => isDeckFilterActive(filter.value))

const WARN_ICON = '\u26A0\uFE0F'
// "Your deck already has Batman" — the characters this card shares with a different card in the deck.
function duplicateText(card) {
  return `Your deck already has ${sharedCharacters(card, slots.value).join(', ')}`
}

const usedIds = computed(() => slots.value.filter(Boolean).map(c => c.ctoonId))
const filledCount = computed(() => slots.value.filter(Boolean).length)
const canSave = computed(() => form.value.name.trim() && filledCount.value === 12)

async function loadGToons() {
  loadingGtoons.value = true
  const rows = await $fetch('/api/user/ctoons?isOgGtoon=true')
  gtoons.value = rows
  const values = rows.map(r => Number(r.gtoonValue)).filter(Number.isFinite)
  filterMeta.value = {
    sets: [...new Set(rows.map(r => r.set).filter(Boolean))].sort(),
    series: [...new Set(rows.map(r => r.series).filter(Boolean))].sort(),
    minNumber: values.length ? Math.min(...values) : 0,
    maxNumber: values.length ? Math.max(...values) : 0
  }
  loadingGtoons.value = false
}

async function loadDecks() {
  loadingDecks.value = true
  decks.value = await $fetch('/api/game/oggtoons/decks')
  loadingDecks.value = false
  mobileSelection.value = ''
}

function addCard(card) {
  if (usedIds.value.includes(card.ctoonId)) return
  const nextIdx = slots.value.findIndex(s => !s)
  if (nextIdx === -1) return
  slots.value[nextIdx] = card
}

function removeFromSlot(idx) {
  slots.value[idx] = undefined
}

function editDeck(deck) {
  form.value.id = deck.id
  form.value.name = deck.name
  const next = new Array(12).fill(undefined)
  for (const dc of deck.cards) {
    next[dc.position] = {
      ctoonId: dc.id, name: dc.name, assetPath: dc.assetPath, characters: dc.characters || [],
      gtoonColor: dc.gtoonColor, gtoonValue: dc.gtoonValue, isSlamGtoon: dc.isSlamGtoon,
      isOgGtoon: dc.isOgGtoon, gtoonCardStyle: dc.gtoonCardStyle
    }
  }
  slots.value = next
  mobileSelection.value = deck.id
}

function onMobileSelect() {
  const id = mobileSelection.value
  if (!id) {
    form.value = { id: null, name: '' }
    slots.value = new Array(12).fill(undefined)
  } else {
    const deck = decks.value.find(d => d.id === id)
    if (deck) editDeck(deck)
  }
}

async function saveDeck() {
  const cards = slots.value.map((c, position) => ({ ctoonId: c.ctoonId, position }))
  const payload = { name: form.value.name, cards }
  if (form.value.id) payload.id = form.value.id
  try {
    await $fetch('/api/game/oggtoons/decks', { method: 'POST', body: JSON.stringify(payload) })
    showToast(form.value.id ? 'Deck updated!' : 'Deck created!')
    form.value = { id: null, name: '' }
    slots.value = new Array(12).fill(undefined)
    await loadDecks()
  } catch (err) {
    showToast(err?.data?.statusMessage || 'Failed to save deck.', 'error')
  }
}

function confirmDeleteDeck(deck) { deckToDelete.value = deck }
function cancelDelete() { deckToDelete.value = null }

async function deleteDeck() {
  if (!deckToDelete.value) return
  try {
    await $fetch(`/api/game/oggtoons/decks?id=${deckToDelete.value.id}`, { method: 'DELETE' })
    showToast('Deck deleted', 'success')
    deckToDelete.value = null
    await loadDecks()
  } catch {
    showToast('Failed to delete deck.', 'error')
  }
}

onMounted(async () => {
  Object.assign(filter.value, emptyDeckFilter())
  await loadGToons()
  await loadDecks()
})
</script>

<style scoped>
/* Same-character warning, pinned to a card's top-right corner. */
.og-warn { font-size: 0.95rem; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); cursor: help; }
.fade-enter-active, .fade-leave-active { transition: opacity .3s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
