<template>
  <div class="pt-20 px-4 max-w-7xl mx-auto">
    <!-- Title -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Create Trade</h1>
      <div class="text-sm bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded">
        My Points: {{ user?.points ?? 0 }}
      </div>
    </div>

    <!-- Step 0: Pick a user -->
    <section class="bg-white rounded-xl shadow-md p-4 mb-6">
      <label class="block text-sm font-medium mb-2">Find a user to trade with</label>
      <div class="relative">
        <input
          v-model.trim="userQuery"
          @input="onUserQueryInput"
          type="text"
          placeholder="Type a username…"
          class="w-full border rounded px-3 py-2"
        />
        <!-- suggestions -->
        <div v-if="showUserSuggest" class="absolute z-20 bg-white border rounded w-full mt-1 max-h-64 overflow-auto">
          <template v-if="userResults.length">
            <button
              v-for="u in userResults"
              :key="u.username"
              class="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2"
              @click="selectTargetUser(u)"
            >
              <img :src="`/avatars/${u.avatar || 'default.png'}`" class="w-6 h-6 rounded-full border" />
              <span class="font-medium">{{ u.username }}</span>
              <span v-if="u.isBooster" class="ml-auto text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">Booster</span>
            </button>
          </template>
          <div v-else class="px-3 py-2 text-sm text-gray-600">No matches</div>
        </div>
      </div>
      <p v-if="targetError" class="mt-2 text-sm text-red-600">{{ targetError }}</p>

      <div v-if="targetUser" class="mt-4 flex items-center gap-3">
        <img :src="`/avatars/${targetUser.avatar || 'default.png'}`" class="w-10 h-10 rounded-full border" />
        <div class="flex items-center gap-2">
          <p class="font-semibold">Trading with {{ targetUser.username }}</p>
          <button class="text-xs px-2 py-1 border rounded hover:bg-gray-50" @click="clearTarget">Change</button>
        </div>
      </div>
    </section>

    <!-- Steps -->
    <section v-if="targetUser" class="grid lg:grid-cols-2 gap-6">
      <!-- STEP 1: Pick their cToons -->
      <div class="bg-white rounded-xl shadow-md p-4">
        <div class="flex items-baseline justify-between mb-3">
          <h2 class="text-lg font-semibold">1) {{ targetUser.username }}’s Collection</h2>
          <span class="text-xs text-gray-500">Select one or more</span>
        </div>

        <FilterBar
          :context="'other'"
          :name-query="filters.other.nameQuery"
          :name-suggestions="nameSuggestionsOther"
          :set-options="setOptionsOther"
          :series-options="seriesOptionsOther"
          :owned-filter="filters.other.owned"
          @update:name-query="v => (filters.other.nameQuery = v)"
          @update:owned-filter="v => (filters.other.owned = v)"
          @update:set-filter="v => (filters.other.set = v)"
          @update:series-filter="v => (filters.other.series = v)"
          @request-name-suggest="onOtherNameSuggest"
        />

        <div v-if="loading.other" class="py-16 text-center text-gray-500">Loading…</div>
        <div v-else>
          <EmptyState v-if="!filteredOther.length" label="No cToons match your filters" />
          <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <CtoonCard
              v-for="c in filteredOther"
              :key="c.id"
              :ctoon="c"
              :selected="selectedTargetCtoonsMap.has(c.id)"
              :badge="selfOwnedIds.has(c.ctoonId) ? 'Owned' : 'Unowned'"
              badge-class-owned="bg-green-100 text-green-800"
              badge-class-unowned="bg-gray-200 text-gray-600"
              @toggle="toggleTargetCtoon(c)"
            />
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <button
            class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
            :disabled="!selectedTargetCtoons.length"
            @click="currentStep = 2"
          >Next</button>
        </div>
      </div>

      <!-- STEP 2: Pick your cToons + points -->
      <div class="bg-white rounded-xl shadow-md p-4" :class="{'opacity-50 pointer-events-none': currentStep !== 2}">
        <div class="flex items-baseline justify-between mb-3">
          <h2 class="text-lg font-semibold">2) Your Collection & Points</h2>
          <div class="flex items-center gap-2">
            <label class="text-sm">Points to offer</label>
            <input
              type="number"
              v-model.number="pointsToOffer"
              :max="user?.points || 0"
              min="0"
              @input="pointsToOffer = Math.max(0, pointsToOffer)"
              class="w-24 border rounded px-2 py-1"
              placeholder="0"
            />
          </div>
        </div>

        <FilterBar
          :context="'self'"
          :name-query="filters.self.nameQuery"
          :name-suggestions="nameSuggestionsSelf"
          :set-options="setOptionsSelf"
          :series-options="seriesOptionsSelf"
          :owned-filter="filters.self.owned"
          @update:name-query="v => (filters.self.nameQuery = v)"
          @update:owned-filter="v => (filters.self.owned = v)"
          @update:set-filter="v => (filters.self.set = v)"
          @update:series-filter="v => (filters.self.series = v)"
          @request-name-suggest="onSelfNameSuggest"
        />

        <div v-if="loading.self" class="py-16 text-center text-gray-500">Loading…</div>
        <div v-else>
          <EmptyState v-if="!filteredSelf.length" label="No cToons match your filters" />
          <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <CtoonCard
              v-for="c in filteredSelf"
              :key="c.id"
              :ctoon="c"
              :selected="selectedInitiatorCtoonsMap.has(c.id)"
              :badge="targetOwnedIds.has(c.ctoonId) ? 'Owned by User' : 'Unowned by User'"
              badge-class-owned="bg-blue-100 text-blue-800"
              badge-class-unowned="bg-gray-200 text-gray-600"
              @toggle="toggleInitiatorCtoon(c)"
            />
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <button class="px-3 py-2 rounded border hover:bg-gray-50" @click="currentStep = 1">Back</button>
          <button
            class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
            :disabled="(selectedInitiatorCtoons.length === 0 && pointsToOffer === 0) || makingOffer"
            @click="sendOffer"
          >
            <span v-if="makingOffer">Making Offer…</span>
            <span v-else>Make Offer</span>
          </button>
        </div>
      </div>
    </section>

    <!-- Toast -->
    <transition name="fade">
      <div v-if="toast.show" class="fixed bottom-4 right-4 bg-black text-white px-4 py-2 rounded shadow">
        {{ toast.message }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

/**
 * Trading API endpoints used here (same shapes as your existing cZone page):
 *  - GET  /api/collection/:username         -> array of cToons in that user's collection
 *  - POST /api/trade/offers                 -> { recipientUsername, ctoonIdsRequested, ctoonIdsOffered, pointsOffered }
 *  - GET  /api/users/search?q=<query>       -> array of { username, avatar, isBooster? }
 */

definePageMeta({ middleware: 'auth', layout: 'default' })

const router = useRouter()
const { user, fetchSelf } = useAuth()

const currentStep = ref(1) // 1 or 2

// ────────────────────────────────────────────────────────────────────────────────
// User search w/ autocomplete
// ────────────────────────────────────────────────────────────────────────────────
const userQuery = ref('')
const userResults = ref([])
const showUserSuggest = ref(false)
const targetUser = ref(null) // { username, avatar }
const targetError = ref('')
let userSearchTimer

function onUserQueryInput() {
  targetError.value = ''
  showUserSuggest.value = true
  clearTimeout(userSearchTimer)
  const q = userQuery.value
  if (!q || q.length < 2) {
    userResults.value = []
    return
  }
  userSearchTimer = setTimeout(async () => {
    try {
      const res = await $fetch(`/api/users/search`, { params: { q } })
      // Eliminate yourself from suggestions
      userResults.value = (res || []).filter(r => r.username !== user.value?.username)
    } catch (e) {
      userResults.value = []
    }
  }, 250)
}

function selectTargetUser(u) {
  if (u.username === user.value?.username) {
    targetError.value = "You can't trade with yourself."
    return
  }
  targetUser.value = u
  userQuery.value = u.username
  showUserSuggest.value = false
  bootstrapCollections()
}

function clearTarget() {
  targetUser.value = null
  currentStep.value = 1
  userQuery.value = ''
  userResults.value = []
  selfCtoons.value = []
  otherCtoons.value = []
  selectedTargetCtoons.value = []
  selectedInitiatorCtoons.value = []
  pointsToOffer.value = 0
}

// close suggest on outside click
if (process.client) {
  window.addEventListener('click', (e) => {
    const inputEl = document.querySelector('input[placeholder="Type a username…"]')
    if (!inputEl) return
    if (!inputEl.contains(e.target)) {
      showUserSuggest.value = false
    }
  })
}

// ────────────────────────────────────────────────────────────────────────────────
// Collections + ownership sets
// ────────────────────────────────────────────────────────────────────────────────
const loading = reactive({ other: false, self: false })
const otherCtoons = ref([])
const selfCtoons = ref([])
const targetOwnedIds = computed(() => new Set(otherCtoons.value.map(c => c.ctoonId)))
const selfOwnedIds = computed(() => new Set(selfCtoons.value.map(c => c.ctoonId)))

async function bootstrapCollections() {
  if (!targetUser.value) return
  loading.other = true
  loading.self = true
  try {
    await fetchSelf()
    const [other, self] = await Promise.all([
      $fetch(`/api/collection/${targetUser.value.username}`),
      $fetch(`/api/collection/${user.value.username}`)
    ])
    otherCtoons.value = Array.isArray(other) ? other : []
    selfCtoons.value = Array.isArray(self) ? self : []
  } finally {
    loading.other = false
    loading.self = false
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Selections
// ────────────────────────────────────────────────────────────────────────────────
const selectedTargetCtoons = ref([])
const selectedInitiatorCtoons = ref([])
const selectedTargetCtoonsMap = computed(() => new Set(selectedTargetCtoons.value.map(c => c.id)))
const selectedInitiatorCtoonsMap = computed(() => new Set(selectedInitiatorCtoons.value.map(c => c.id)))

function toggleTargetCtoon(c) {
  const i = selectedTargetCtoons.value.findIndex(x => x.id === c.id)
  if (i >= 0) selectedTargetCtoons.value.splice(i, 1)
  else selectedTargetCtoons.value.push(c)
}
function toggleInitiatorCtoon(c) {
  const i = selectedInitiatorCtoons.value.findIndex(x => x.id === c.id)
  if (i >= 0) selectedInitiatorCtoons.value.splice(i, 1)
  else selectedInitiatorCtoons.value.push(c)
}

// ────────────────────────────────────────────────────────────────────────────────
// Filters (both sides): name (w/ 3+ char suggestion), set, series, owned/unowned
// ────────────────────────────────────────────────────────────────────────────────
const filters = reactive({
  other: { nameQuery: '', set: 'All', series: 'All', owned: 'all' },
  self:  { nameQuery: '', set: 'All', series: 'All', owned: 'all' }
})

// options
const setOptionsOther = computed(() => ['All', ...uniqueTruthies(otherCtoons.value.map(c => c.set))])
const seriesOptionsOther = computed(() => ['All', ...uniqueTruthies(otherCtoons.value.map(c => c.series))])
const setOptionsSelf = computed(() => ['All', ...uniqueTruthies(selfCtoons.value.map(c => c.set))])
const seriesOptionsSelf = computed(() => ['All', ...uniqueTruthies(selfCtoons.value.map(c => c.series))])

function uniqueTruthies(arr) { return [...new Set(arr.filter(Boolean))] }

// name suggestions (after 3 chars)
const nameSuggestionsOther = ref([])
const nameSuggestionsSelf = ref([])

function onOtherNameSuggest(q) {
  nameSuggestionsOther.value = buildNameSuggestions(q, otherCtoons.value)
}
function onSelfNameSuggest(q) {
  nameSuggestionsSelf.value = buildNameSuggestions(q, selfCtoons.value)
}
function buildNameSuggestions(q, list) {
  if (!q || q.length < 3) return []
  const lower = q.toLowerCase()
  return list
    .map(c => c.name)
    .filter(Boolean)
    .filter(n => n.toLowerCase().includes(lower))
    .slice(0, 8)
}

// filtered lists
const filteredOther = computed(() => applyFilters(otherCtoons.value, filters.other, {
  ownedPredicate: (c) => selfOwnedIds.value.has(c.ctoonId) // Owned (by viewer)
}))

const filteredSelf = computed(() => applyFilters(selfCtoons.value, filters.self, {
  ownedPredicate: (c) => targetOwnedIds.value.has(c.ctoonId) // Owned (by target user)
}))

function applyFilters(items, f, ctx) {
  const nameQ = f.nameQuery?.toLowerCase().trim()
  return items.filter(c => {
    if (nameQ && !c.name?.toLowerCase().includes(nameQ)) return false
    if (f.set && f.set !== 'All' && c.set !== f.set) return false
    if (f.series && f.series !== 'All' && c.series !== f.series) return false

    const isOwned = ctx.ownedPredicate(c)
    if (f.owned === 'owned' && !isOwned) return false
    if (f.owned === 'unowned' && isOwned) return false
    return true
  }).sort((a,b) => {
    // Prefer unowned first in both contexts to surface likely-tradables
    const aOwned = ctx.ownedPredicate(a)
    const bOwned = ctx.ownedPredicate(b)
    return aOwned === bOwned ? 0 : (aOwned ? 1 : -1)
  })
}

// ────────────────────────────────────────────────────────────────────────────────
// Offer
// ────────────────────────────────────────────────────────────────────────────────
const pointsToOffer = ref(0)
const makingOffer = ref(false)
const toast = reactive({ show:false, message:'' })

async function sendOffer() {
  if (!targetUser.value) return
  if (pointsToOffer.value < 0) return

  const payload = {
    recipientUsername: targetUser.value.username,
    ctoonIdsRequested: selectedTargetCtoons.value.map(c => c.id),
    ctoonIdsOffered:   selectedInitiatorCtoons.value.map(c => c.id),
    pointsOffered:     pointsToOffer.value
  }
  try {
    makingOffer.value = true
    await $fetch('/api/trade/offers', { method: 'POST', body: payload })
    toast.message = 'Trade offer sent!'
    toast.show = true
    setTimeout(() => (toast.show = false), 3000)

    // Reset state but keep you on the page
    selectedTargetCtoons.value = []
    selectedInitiatorCtoons.value = []
    pointsToOffer.value = 0
    currentStep.value = 1
  } catch (e) {
    toast.message = 'Failed to send offer. Please try again.'
    toast.show = true
    setTimeout(() => (toast.show = false), 3500)
  } finally {
    makingOffer.value = false
  }
}
</script>

<script>
// Local components for tidy SFC: FilterBar, CtoonCard, EmptyState
export default {
  components: {
    FilterBar: {
      props: {
        context: { type: String, required: true }, // 'other' | 'self'
        nameQuery: { type: String, default: '' },
        nameSuggestions: { type: Array, default: () => [] },
        setOptions: { type: Array, default: () => ['All'] },
        seriesOptions: { type: Array, default: () => ['All'] },
        ownedFilter: { type: String, default: 'all' },
      },
      emits: ['update:name-query','update:set-filter','update:series-filter','update:owned-filter','request-name-suggest'],
      data() {
        return { internalName: this.nameQuery, showSuggest: false }
      },
      watch: {
        nameQuery(n) { this.internalName = n }
      },
      methods: {
        onNameInput() {
          this.$emit('update:name-query', this.internalName)
          this.showSuggest = true
          this.$emit('request-name-suggest', this.internalName)
        },
        applySuggestion(s) {
          this.internalName = s
          this.$emit('update:name-query', s)
          this.showSuggest = false
        }
      },
      template: `
        <div class="flex flex-col md:flex-row md:items-end gap-3 mb-4">
          <div class="flex-1">
            <label class="block text-xs font-medium mb-1">cToon Name</label>
            <div class="relative">
              <input
                :value="internalName"
                @input="(e)=>{ internalName = e.target.value; onNameInput() }"
                type="text" placeholder="Type at least 3 characters…"
                class="w-full border rounded px-3 py-2"
              />
              <div v-if="showSuggest && nameSuggestions.length" class="absolute z-10 w-full bg-white border rounded mt-1 max-h-48 overflow-auto">
                <button v-for="s in nameSuggestions" :key="s" class="w-full text-left px-3 py-1.5 hover:bg-indigo-50" @click="applySuggestion(s)">{{ s }}</button>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Set</label>
            <select class="border rounded px-3 py-2" @change="$emit('update:set-filter', $event.target.value)">
              <option v-for="opt in setOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Series</label>
            <select class="border rounded px-3 py-2" @change="$emit('update:series-filter', $event.target.value)">
              <option v-for="opt in seriesOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">{{ context === 'other' ? 'Owned (by you)' : 'Owned by User' }}</label>
            <select class="border rounded px-3 py-2" :value="ownedFilter" @change="$emit('update:owned-filter', $event.target.value)">
              <option value="all">All</option>
              <option value="owned">Owned</option>
              <option value="unowned">Unowned</option>
            </select>
          </div>
        </div>
      `
    },
    CtoonCard: {
      props: {
        ctoon: { type: Object, required: true },
        selected: { type: Boolean, default: false },
        badge: { type: String, default: '' },
        badgeClassOwned: { type: String, default: 'bg-green-100 text-green-800' },
        badgeClassUnowned: { type: String, default: 'bg-gray-200 text-gray-600' },
      },
      emits: ['toggle'],
      computed: {
        badgeClass() {
          return this.badge.toLowerCase().includes('unowned') ? this.badgeClassUnowned : this.badgeClassOwned
        }
      },
      methods: {
        editionLabel(c) { return c.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }
      },
      template: `
        <button @click="$emit('toggle')" :class="['relative w-full text-left border rounded p-2 hover:shadow transition', selected ? 'border-indigo-500 bg-indigo-50' : '']">
          <span class="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold rounded-full" :class="badgeClass">{{ badge }}</span>
          <img :src="ctoon.assetPath" class="w-full h-28 object-contain mb-2 mt-6" :alt="ctoon.name" />
          <p class="text-sm font-medium leading-tight">{{ ctoon.name }}</p>
          <p class="text-xs text-gray-600">{{ ctoon.rarity }}</p>
          <p class="text-xs text-gray-600">Mint #{{ ctoon.mintNumber }} of {{ ctoon.quantity !== null ? ctoon.quantity : 'Unlimited' }}</p>
          <p class="text-xs text-gray-600">{{ editionLabel(ctoon) }}</p>
          <div v-if="selected" class="absolute -top-2 -left-2 bg-indigo-500 text-white text-xs px-2 py-0.5 rounded">Selected</div>
        </button>
      `
    },
    EmptyState: {
      props: { label: { type:String, default:'Nothing here' } },
      template: `<div class="py-12 text-center text-gray-500">{{ label }}</div>`
    }
  }
}
</script>

<style>
.fade-enter-active,.fade-leave-active{ transition: opacity .2s ease }
.fade-enter-from,.fade-leave-to{ opacity:0 }
</style>
