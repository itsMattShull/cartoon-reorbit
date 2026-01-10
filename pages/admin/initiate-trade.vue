<template>
  <Nav />
  <div class="pt-20 px-4 max-w-7xl mx-auto mt-16 md:mt-20">
    <!-- Title -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Initiate Trade</h1>
        <p v-if="officialUser" class="text-sm text-gray-600">Initiating as {{ officialUser.username }}</p>
      </div>
      <div v-if="officialUser" class="text-sm bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded">
        Official Account: {{ officialUser.username }}
      </div>
    </div>

    <p v-if="officialError" class="mb-4 text-sm text-red-600">{{ officialError }}</p>

    <!-- Step 0: Pick a user -->
    <section class="bg-white rounded-xl shadow-md p-4 mb-6">
      <label class="block text-sm font-medium mb-2">Find a user to trade with</label>
      <div class="relative">
        <input
          ref="userInputRef"
          v-model.trim="userQuery"
          @input="onUserQueryInput"
          @keydown="onUserKeydown"
          type="text"
          placeholder="Type a username..."
          autocomplete="off"
          role="combobox"
          aria-expanded="showUserSuggest"
          aria-controls="user-suggest-listbox"
          aria-autocomplete="list"
          class="w-full border rounded px-3 py-2"
        />
        <!-- suggestions -->
        <div
          v-if="showUserSuggest"
          ref="userSuggestRef"
          id="user-suggest-listbox"
          class="absolute z-20 bg-white border rounded w-full mt-1 max-h-64 overflow-auto"
          role="listbox"
        >
          <div v-if="isSearching" class="px-3 py-2 text-sm text-gray-600">Searching...</div>

          <template v-else-if="userResults.length">
            <button
              v-for="(u, idx) in userResults"
              :key="u.username"
              :class="[
                'w-full text-left px-3 py-2 flex items-center gap-2',
                highlightedIndex === idx ? 'bg-indigo-50' : 'hover:bg-indigo-50'
              ]"
              role="option"
              :aria-selected="highlightedIndex === idx"
              @mouseenter="highlightedIndex = idx"
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
          <button class="text-xs px-2 py-1 border rounded hover:bg-gray-50" @click="clearTarget(true)">Change</button>
        </div>
      </div>
    </section>

    <!-- STEP 1: Other user's collection (only) -->
    <section v-if="targetUser && currentStep === 1" class="mb-6">
      <div class="bg-white rounded-xl shadow-md p-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-lg font-semibold">1) {{ targetUser.username }}'s Collection</h2>
            <span class="text-xs text-gray-500">Select one or more</span>
          </div>
          <button
            class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
            :disabled="!selectedTargetCtoons.length"
            @click="currentStep = 2"
          >
            Next
          </button>
        </div>

        <FilterBar
          :context="'other'"
          :name-query="filters.target.nameQuery"
          :name-suggestions="nameSuggestionsTarget"
          :set-options="setOptionsTarget"
          :series-options="seriesOptionsTarget"
          :rarity-options="rarityOptionsTarget"
          :owned-filter="filters.target.owned"
          :set-value="filters.target.set"
          :series-value="filters.target.series"
          :rarity-value="filters.target.rarity"
          :duplicates-filter="filters.target.duplicates"
          @update:name-query="v => (filters.target.nameQuery = v)"
          @update:owned-filter="v => (filters.target.owned = v)"
          @update:set-filter="v => (filters.target.set = v)"
          @update:series-filter="v => (filters.target.series = v)"
          @update:rarity-filter="v => (filters.target.rarity = v)"
          @update:duplicates-filter="v => (filters.target.duplicates = v)"
          @request-name-suggest="onTargetNameSuggest"
        />

        <div v-if="loading.target" class="py-16 text-center text-gray-500">Loading...</div>
        <div v-else>
          <EmptyState v-if="!filteredTarget.length" label="No cToons match your filters" />
          <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <CtoonCard
              v-for="c in filteredTarget"
              :key="c.id"
              :ctoon="c"
              :selected="selectedTargetCtoonsMap.has(c.id)"
              :badge="officialOwnedIds.has(c.ctoonId) ? 'Owned' : 'Unowned'"
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
          >
            Next
          </button>
        </div>
      </div>
    </section>

    <!-- STEP 2: Official collection (only) -->
    <section v-if="targetUser && currentStep === 2" class="mb-6">
      <div class="bg-white rounded-xl shadow-md p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">2) {{ officialUsername }}'s Collection</h2>
          <div class="flex items-center gap-3">
            <button
              class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
              :disabled="selectedOfficialCtoons.length === 0"
              @click="currentStep = 3"
            >
              Confirm Offer
            </button>
          </div>
        </div>

        <FilterBar
          :context="'self'"
          :name-query="filters.official.nameQuery"
          :name-suggestions="nameSuggestionsOfficial"
          :set-options="setOptionsOfficial"
          :series-options="seriesOptionsOfficial"
          :rarity-options="rarityOptionsOfficial"
          :owned-filter="filters.official.owned"
          :set-value="filters.official.set"
          :series-value="filters.official.series"
          :rarity-value="filters.official.rarity"
          :duplicates-filter="filters.official.duplicates"
          @update:name-query="v => (filters.official.nameQuery = v)"
          @update:owned-filter="v => (filters.official.owned = v)"
          @update:set-filter="v => (filters.official.set = v)"
          @update:series-filter="v => (filters.official.series = v)"
          @update:rarity-filter="v => (filters.official.rarity = v)"
          @update:duplicates-filter="v => (filters.official.duplicates = v)"
          @request-name-suggest="onOfficialNameSuggest"
        >
          <!-- Inline Wishlist control (same row, wraps as needed) -->
          <label v-if="targetUser" class="inline-flex items-center gap-2 ml-1">
            <input
              type="checkbox"
              v-model="filters.official.wishlistOnly"
              :disabled="loadingWishlist || (!loadingWishlist && targetWishlistIds.size === 0)"
              class="h-4 w-4 border rounded"
            />
            <span class="text-base md:text-lg font-medium">Show Their Wishlist cToons</span>
          </label>

          <span v-if="loadingWishlist" class="text-xs text-gray-600">Loading...</span>
          <span v-else-if="targetWishlistIds.size === 0" class="text-xs text-gray-600">
            {{ targetUser.username }} has no wishlist items.
          </span>
        </FilterBar>

        <div v-if="loading.official" class="py-16 text-center text-gray-500">Loading...</div>
        <div v-else>
          <EmptyState
            v-if="!filteredOfficial.length"
            :label="filters.official.wishlistOnly
              ? `No cToons from ${targetUser?.username ?? 'user'}'s Wishlist in ${officialUsername}'s collection`
              : 'No cToons match your filters'"
          />
          <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <CtoonCard
              v-for="c in filteredOfficial"
              :key="c.id"
              :ctoon="c"
              :selected="selectedOfficialCtoonsMap.has(c.id)"
              :badge="targetOwnedIds.has(c.ctoonId) ? 'Owned by User' : 'Unowned by User'"
              badge-class-owned="bg-blue-100 text-blue-800"
              badge-class-unowned="bg-gray-200 text-gray-600"
              @toggle="() => {
                const already = selectedOfficialCtoonsMap.has(c.id)
                if (!already && officialOfferLimitReached) return
                toggleOfficialCtoon(c)
              }"
            />
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <button class="px-3 py-2 rounded border hover:bg-gray-50" @click="currentStep = 1">Back</button>
          <button
            class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
            :disabled="selectedOfficialCtoons.length === 0"
            @click="currentStep = 3"
          >
            Confirm Offer
          </button>
        </div>
      </div>
    </section>

    <!-- STEP 3: Confirm Offer -->
    <section v-if="targetUser && currentStep === 3" class="mb-6">
      <div class="bg-white rounded-xl shadow-md p-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-lg font-semibold">3) Confirm Offer</h2>
            <span class="text-xs text-gray-500">Review before sending</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Requested from other user -->
          <div>
            <h3 class="font-semibold mb-2">Requesting from {{ targetUser.username }}</h3>
            <div v-if="!selectedTargetCtoons.length" class="text-sm text-gray-600">
              No cToons selected from {{ targetUser.username }}.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="c in selectedTargetCtoons" :key="c.id" class="border rounded p-2">
                <img :src="c.assetPath" :alt="c.name" class="w-full h-24 object-contain mb-1" />
                <p class="text-xs font-medium truncate">{{ c.name }}</p>
                <p class="text-[11px] text-gray-600">{{ c.rarity }}</p>
              </div>
            </div>
          </div>

          <!-- Offering -->
          <div>
            <h3 class="font-semibold mb-2">Offering from {{ officialUsername }}</h3>
            <div v-if="!selectedOfficialCtoons.length" class="text-sm text-gray-600">
              No cToons offered.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="c in selectedOfficialCtoons" :key="c.id" class="border rounded p-2">
                <img :src="c.assetPath" :alt="c.name" class="w-full h-24 object-contain mb-1" />
                <p class="text-xs font-medium truncate">{{ c.name }}</p>
                <p class="text-[11px] text-gray-600">{{ c.rarity }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 flex items-center justify-between">
          <button class="px-3 py-2 rounded border hover:bg-gray-50" @click="currentStep = 2">Back</button>
          <button
            class="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            :disabled="selectedOfficialCtoons.length === 0 || makingOffer"
            @click="sendOffer"
          >
            <span v-if="makingOffer">Making Offer...</span>
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'

// Import SFC components
import FilterBar from '@/components/trade/FilterBar.vue'
import CtoonCard from '@/components/trade/CtoonCard.vue'
import EmptyState from '@/components/EmptyState.vue'

definePageMeta({ title: 'Admin - Initiate Trade', middleware: ['auth', 'admin'], layout: 'default' })

const router = useRouter()

const currentStep = ref(1) // 1-3

// ------------------------------------------------------------------------------
// User search w/ autocomplete (3+ chars, debounced, keyboard nav)
// ------------------------------------------------------------------------------
const MIN_CHARS = 3
const DEBOUNCE_MS = 250
const MAX_OFFICIAL_OFFER = 5

const userQuery = ref('')
const userResults = ref([])
const showUserSuggest = ref(false)
const isSearching = ref(false)
const highlightedIndex = ref(-1) // for up/down nav
const targetUser = ref(null) // { username, avatar }
const targetError = ref('')

const userInputRef = ref(null)
const userSuggestRef = ref(null)

let userSearchTimer
const userSearchCache = new Map() // simple in-memory cache by query string

const officialUser = ref(null)
const officialError = ref('')
const officialUsername = computed(() => officialUser.value?.username || 'Official')

async function ensureOfficial() {
  if (officialUser.value) return officialUser.value
  try {
    officialUser.value = await $fetch('/api/admin/official')
  } catch (e) {
    officialError.value = 'Failed to load the official account.'
  }
  return officialUser.value
}

function onUserQueryInput() {
  targetError.value = ''
  showUserSuggest.value = true
  highlightedIndex.value = -1
  clearTimeout(userSearchTimer)

  const q = userQuery.value || ''
  if (q.length < MIN_CHARS) {
    userResults.value = []
    isSearching.value = false
    return
  }

  userSearchTimer = setTimeout(async () => {
    const key = q.toLowerCase()
    try {
      isSearching.value = true
      if (userSearchCache.has(key)) {
        userResults.value = filterOutOfficial(userSearchCache.get(key))
        isSearching.value = false
        return
      }

      const res = await $fetch('/api/users/search', { params: { q, limit: 8 } })
      const items = Array.isArray(res) ? res : (res?.items || [])
      userSearchCache.set(key, items)
      userResults.value = filterOutOfficial(items)
    } catch (e) {
      userResults.value = []
    } finally {
      isSearching.value = false
    }
  }, DEBOUNCE_MS)
}

function filterOutOfficial(items) {
  const official = officialUser.value?.username
  if (!official) return items || []
  return (items || []).filter(r => r.username && r.username !== official)
}

function onUserKeydown(e) {
  if (!showUserSuggest.value) return
  const max = userResults.value.length - 1
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedIndex.value = highlightedIndex.value < max ? highlightedIndex.value + 1 : 0
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value = highlightedIndex.value > 0 ? highlightedIndex.value - 1 : max
  } else if (e.key === 'Enter') {
    if (highlightedIndex.value >= 0 && highlightedIndex.value <= max) {
      e.preventDefault()
      selectTargetUser(userResults.value[highlightedIndex.value])
    }
  } else if (e.key === 'Escape') {
    showUserSuggest.value = false
  }
}

async function selectTargetUser(u) {
  await ensureOfficial()
  if (u.username === officialUser.value?.username) {
    targetError.value = "You can't trade with the official account."
    return
  }
  targetUser.value = u
  userQuery.value = u.username
  showUserSuggest.value = false
  highlightedIndex.value = -1
  currentStep.value = 1              // start at Step 1
  bootstrapCollections()
  loadTargetWishlist()
}

/**
 * Clear everything and (optionally) focus the username input
 */
async function clearTarget(focusInput = false) {
  targetUser.value = null
  currentStep.value = 1
  userQuery.value = ''
  userResults.value = []
  highlightedIndex.value = -1
  showUserSuggest.value = false
  isSearching.value = false
  selectedTargetCtoons.value = []
  selectedOfficialCtoons.value = []
  targetCtoons.value = []
  officialCtoons.value = []
  filters.target = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all' }
  filters.official = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false }

  // reset wishlist state
  targetWishlist.value = []
  loadingWishlist.value = false

  if (focusInput) {
    await nextTick()
    userInputRef.value?.focus()
  }
}

// close suggest on outside click (but not when clicking inside the list)
function onGlobalClick(e) {
  const inputEl = userInputRef.value
  const boxEl = userSuggestRef.value
  if (!inputEl) return
  const target = e.target
  if (inputEl.contains(target) || (boxEl && boxEl.contains(target))) return
  showUserSuggest.value = false
}

onMounted(async () => {
  if (process.client) window.addEventListener('click', onGlobalClick)
  await ensureOfficial()
})
onBeforeUnmount(() => {
  if (process.client) window.removeEventListener('click', onGlobalClick)
})

// ------------------------------------------------------------------------------
// Collections + ownership sets
// ------------------------------------------------------------------------------
const loading = reactive({ target: false, official: false })
const targetCtoons = ref([])
const officialCtoons = ref([])
const targetOwnedIds = computed(() => new Set(targetCtoons.value.map(c => c.ctoonId)))
const officialOwnedIds = computed(() => new Set(officialCtoons.value.map(c => c.ctoonId)))

// Target user's wishlist
const targetWishlist = ref([]) // [{ id, offeredPoints, createdAt, hasEnough, ctoon }]
const loadingWishlist = ref(false)
const targetWishlistIds = computed(() => {
  const ids = targetWishlist.value.map(w => w?.ctoon?.id).filter(Boolean)
  return new Set(ids)
})

async function loadTargetWishlist() {
  if (!targetUser.value) return
  try {
    loadingWishlist.value = true
    const res = await $fetch(`/api/wishlist/users/${targetUser.value.username}`)
    targetWishlist.value = Array.isArray(res) ? res : []
  } catch (e) {
    targetWishlist.value = []
  } finally {
    loadingWishlist.value = false
  }
}

async function bootstrapCollections() {
  if (!targetUser.value) return
  await ensureOfficial()
  if (!officialUser.value) return
  loading.target = true
  loading.official = true
  try {
    const [target, official] = await Promise.all([
      $fetch(`/api/collection/${targetUser.value.username}`),
      $fetch(`/api/collection/${officialUser.value.username}`)
    ])
    targetCtoons.value = Array.isArray(target) ? target : []
    officialCtoons.value = Array.isArray(official) ? official : []
  } finally {
    loading.target = false
    loading.official = false
  }
}

// ------------------------------------------------------------------------------
// Selections
// ------------------------------------------------------------------------------
const selectedTargetCtoons = ref([])
const selectedOfficialCtoons = ref([])
const selectedTargetCtoonsMap = computed(() => new Set(selectedTargetCtoons.value.map(c => c.id)))
const selectedOfficialCtoonsMap = computed(() => new Set(selectedOfficialCtoons.value.map(c => c.id)))

function toggleTargetCtoon(c) {
  const i = selectedTargetCtoons.value.findIndex(x => x.id === c.id)
  if (i >= 0) selectedTargetCtoons.value.splice(i, 1)
  else selectedTargetCtoons.value.push(c)
}
function toggleOfficialCtoon(c) {
  const i = selectedOfficialCtoons.value.findIndex(x => x.id === c.id)

  // unselect always allowed
  if (i >= 0) {
    selectedOfficialCtoons.value.splice(i, 1)
    return
  }

  // enforce max
  if (selectedOfficialCtoons.value.length >= MAX_OFFICIAL_OFFER) {
    toast.message = `You can only offer up to ${MAX_OFFICIAL_OFFER} cToons.`
    toast.show = true
    setTimeout(() => (toast.show = false), 2500)
    return
  }

  selectedOfficialCtoons.value.push(c)
}

const officialOfferLimitReached = computed(
  () => selectedOfficialCtoons.value.length >= MAX_OFFICIAL_OFFER
)

function sortAlpha(arr) {
  return [...arr].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
}
function uniqueTruthies(arr) {
  return [...new Set(arr.map(x => (x ?? '').toString().trim()).filter(Boolean))]
}

// compute which ctoonIds are duplicates for each list
const dupIdsTarget = computed(() => {
  const m = new Map()
  for (const c of targetCtoons.value) m.set(c.ctoonId, (m.get(c.ctoonId) || 0) + 1)
  return new Set([...m].filter(([, n]) => n > 1).map(([id]) => id))
})
const dupIdsOfficial = computed(() => {
  const m = new Map()
  for (const c of officialCtoons.value) m.set(c.ctoonId, (m.get(c.ctoonId) || 0) + 1)
  return new Set([...m].filter(([, n]) => n > 1).map(([id]) => id))
})

// helper to build rarity option list
const PRIORITY_RARITIES = ['Common','Uncommon','Rare','Very Rare','Crazy Rare']
function buildRarityOptions(list) {
  const all = Array.from(new Set(
    list.map(c => (c.rarity ?? '').toString().trim()).filter(Boolean)
  ))
  const inPriority = PRIORITY_RARITIES.filter(r => all.includes(r))
  const extras = all.filter(r => !PRIORITY_RARITIES.includes(r)).sort()
  return ['All', ...inPriority, ...extras]
}

const rarityOptionsTarget = computed(() => buildRarityOptions(targetCtoons.value))
const rarityOptionsOfficial = computed(() => buildRarityOptions(officialCtoons.value))

const filters = reactive({
  target: { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all' },
  official: { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false }
})

const setOptionsTarget = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(targetCtoons.value.map(c => c.set ?? c.setName ?? c.collectionSet)))
])
const setOptionsOfficial = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(officialCtoons.value.map(c => c.set ?? c.setName ?? c.collectionSet)))
])

const seriesOptionsTarget = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(targetCtoons.value.map(c => c.series ?? c.seriesName)))
])
const seriesOptionsOfficial = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(officialCtoons.value.map(c => c.series ?? c.seriesName)))
])

const nameSuggestionsTarget = ref([])
const nameSuggestionsOfficial = ref([])

function onTargetNameSuggest(q) {
  nameSuggestionsTarget.value = buildNameSuggestions(q, targetCtoons.value)
}
function onOfficialNameSuggest(q) {
  nameSuggestionsOfficial.value = buildNameSuggestions(q, officialCtoons.value)
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

function applyFilters(items, f, ctx) {
  const nameQ = f.nameQuery?.toLowerCase().trim()
  return items.filter(c => {
    if (nameQ && !c.name?.toLowerCase().includes(nameQ)) return false
    if (f.set && f.set !== 'All' && c.set !== f.set) return false
    if (f.series && f.series !== 'All' && c.series !== f.series) return false
    if (f.rarity && f.rarity !== 'All' && c.rarity !== f.rarity) return false
    if (f.duplicates === 'dups' && !ctx.dupIds.has(c.ctoonId)) return false

    const isOwned = ctx.ownedPredicate(c)
    if (f.owned === 'owned' && !isOwned) return false
    if (f.owned === 'unowned' && isOwned) return false
    return true
  }).sort((a,b) => {
    const aOwned = ctx.ownedPredicate(a)
    const bOwned = ctx.ownedPredicate(b)
    return aOwned === bOwned ? 0 : (aOwned ? 1 : -1)
  })
}

const filteredTarget = computed(() => applyFilters(targetCtoons.value, filters.target, {
  ownedPredicate: (c) => officialOwnedIds.value.has(c.ctoonId),
  dupIds: dupIdsTarget.value
}))
const filteredOfficial = computed(() => {
  let list = applyFilters(officialCtoons.value, filters.official, {
    ownedPredicate: (c) => targetOwnedIds.value.has(c.ctoonId),
    dupIds: dupIdsOfficial.value
  })
  if (filters.official.wishlistOnly) {
    list = list.filter(c => targetWishlistIds.value.has(c.ctoonId))
  }
  return list
})

// ------------------------------------------------------------------------------
// Offer
// ------------------------------------------------------------------------------
const makingOffer = ref(false)
const toast = reactive({ show:false, message:'' })

async function sendOffer() {
  if (!targetUser.value || !officialUser.value) return
  if (selectedTargetCtoons.value.length === 0 || selectedOfficialCtoons.value.length === 0) return

  const recipient = targetUser.value.username // capture before any reset
  const payload = {
    recipientUsername: recipient,
    ctoonIdsRequested: selectedTargetCtoons.value.map(c => c.id),
    ctoonIdsOffered: selectedOfficialCtoons.value.map(c => c.id)
  }

  try {
    makingOffer.value = true
    await $fetch('/api/admin/trade-offers', { method: 'POST', body: payload })

    toast.message = 'Trade offer sent! Redirecting...'
    toast.show = true

    await router.push(`/czone/${encodeURIComponent(recipient)}`)
  } catch (e) {
    toast.message = 'Failed to send offer. Please try again.'
    toast.show = true
    setTimeout(() => (toast.show = false), 3500)
  } finally {
    makingOffer.value = false
  }
}
</script>

<style>
.fade-enter-active,.fade-leave-active{ transition: opacity .2s ease }
.fade-enter-from,.fade-leave-to{ opacity:0 }
</style>
