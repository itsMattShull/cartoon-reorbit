<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2 max-w-7xl mx-auto">
    <!-- Title -->
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div>
        <h1 class="text-base font-semibold">Initiate Trade</h1>
        <p v-if="officialUser" class="text-[11px] text-gray-600">Initiating as {{ officialUser.username }}</p>
      </div>
      <div v-if="officialUser" class="px-1.5 py-0 rounded text-[10px] font-medium border bg-indigo-100 text-indigo-800 border-indigo-200">
        Official Account: {{ officialUser.username }}
      </div>
    </div>

    <p v-if="officialError" class="mb-2 text-xs text-red-600">{{ officialError }}</p>

    <!-- Step 0: Pick a user -->
    <section class="bg-white rounded-lg shadow p-2 mb-3">
      <label class="block text-xs font-medium mb-1.5">Find a user to trade with</label>
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
          class="w-full border rounded-md px-2 py-1.5 text-sm"
        />
        <!-- suggestions -->
        <div
          v-if="showUserSuggest"
          ref="userSuggestRef"
          id="user-suggest-listbox"
          class="absolute z-20 bg-white border rounded-md w-full mt-1 max-h-64 overflow-y-auto"
          role="listbox"
        >
          <div v-if="isSearching" class="px-2 py-1.5 text-gray-600">Searching...</div>

          <template v-else-if="userResults.length">
            <button
              v-for="(u, idx) in userResults"
              :key="u.username"
              :class="[
                'w-full text-left px-2 py-1.5 flex items-center gap-2',
                highlightedIndex === idx ? 'bg-indigo-50' : 'hover:bg-indigo-50'
              ]"
              role="option"
              :aria-selected="highlightedIndex === idx"
              @mouseenter="highlightedIndex = idx"
              @click="selectTargetUser(u)"
            >
              <img :src="`/avatars/${u.avatar || 'default.png'}`" class="w-6 h-6 rounded-full border flex-shrink-0" />
              <span class="font-medium">{{ u.username }}</span>
              <span v-if="u.isBooster" class="ml-auto px-1.5 py-0 rounded text-[10px] font-medium border bg-yellow-100 text-yellow-800 border-yellow-200">Booster</span>
            </button>
          </template>

          <div v-else class="px-2 py-1.5 text-gray-600">No matches</div>
        </div>
      </div>
      <p v-if="targetError" class="mt-1.5 text-xs text-red-600">{{ targetError }}</p>

      <div v-if="targetUser" class="mt-3 flex items-center gap-2">
        <img :src="`/avatars/${targetUser.avatar || 'default.png'}`" class="w-8 h-8 rounded-full border flex-shrink-0" />
        <div class="flex items-center gap-2">
          <p class="font-semibold text-xs">Trading with {{ targetUser.username }}</p>
          <button class="px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50" @click="clearTarget(true)">Change</button>
        </div>
      </div>
    </section>

    <!-- STEP 1: Other user's collection -->
    <section v-if="targetUser && currentStep === 1" class="mb-3">
      <div class="bg-white rounded-lg shadow p-2">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div>
            <h2 class="text-sm font-semibold">1) {{ targetUser.username }}'s Collection</h2>
            <span class="text-[10px] text-gray-500">Select one or more</span>
          </div>
          <button
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            @click="currentStep = 2"
          >
            Next
          </button>
        </div>

        <FilterBar
          :context="'other'"
          :name-query="filters.target.nameQuery"
          :name-suggestions="[]"
          :set-options="filterMeta.target.sets"
          :series-options="filterMeta.target.seriesOptions"
          :rarity-options="filterMeta.target.rarities"
          :owned-filter="filters.target.owned"
          :set-value="filters.target.set"
          :series-value="filters.target.series"
          :rarity-value="filters.target.rarity"
          :duplicates-filter="filters.target.duplicates"
          @update:name-query="v => onTargetNameInput(v)"
          @update:owned-filter="v => { filters.target.owned = v; fetchTargetPage(1) }"
          @update:set-filter="v => { filters.target.set = v; fetchTargetPage(1) }"
          @update:series-filter="v => { filters.target.series = v; fetchTargetPage(1) }"
          @update:rarity-filter="v => { filters.target.rarity = v; fetchTargetPage(1) }"
          @update:duplicates-filter="v => { filters.target.duplicates = v; fetchTargetPage(1) }"
          @request-name-suggest="() => {}"
        />

        <div v-if="loading.target" class="py-16 text-center text-gray-500">Loading...</div>
        <div v-else>
          <EmptyState v-if="!targetItems.length" label="No cToons match your filters" />
          <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            <CtoonCard
              v-for="c in targetItems"
              :key="c.id"
              :ctoon="c"
              :selected="selectedTargetCtoonsMap.has(c.id)"
              :badge="c.otherOwns ? 'Owned' : 'Unowned'"
              badge-class-owned="bg-green-100 text-green-800"
              badge-class-unowned="bg-gray-200 text-gray-600"
              @toggle="toggleTargetCtoon(c)"
            />
          </div>

          <!-- Pagination -->
          <div v-if="targetTotalPages > 1" class="mt-3 flex items-center justify-center gap-2">
            <button
              class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
              :disabled="targetPage === 1"
              @click="fetchTargetPage(targetPage - 1)"
            >
              Previous
            </button>
            <span class="text-xs text-gray-600">
              Page {{ targetPage }} of {{ targetTotalPages }}
              <span class="text-gray-400">({{ targetTotal }} total)</span>
            </span>
            <button
              class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
              :disabled="targetPage >= targetTotalPages"
              @click="fetchTargetPage(targetPage + 1)"
            >
              Next
            </button>
          </div>
        </div>

        <div class="mt-3 flex justify-end">
          <button
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            @click="currentStep = 2"
          >
            Next
          </button>
        </div>
      </div>
    </section>

    <!-- STEP 2: Official collection -->
    <section v-if="targetUser && currentStep === 2" class="mb-3">
      <div class="bg-white rounded-lg shadow p-2">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 class="text-sm font-semibold">2) {{ officialUsername }}'s Collection</h2>
          <div class="flex items-center gap-2">
            <button
              class="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              :disabled="!hasAnySelection"
              @click="currentStep = 3"
            >
              Confirm Offer
            </button>
          </div>
        </div>

        <FilterBar
          :context="'self'"
          :name-query="filters.official.nameQuery"
          :name-suggestions="[]"
          :set-options="filterMeta.official.sets"
          :series-options="filterMeta.official.seriesOptions"
          :rarity-options="filterMeta.official.rarities"
          :owned-filter="filters.official.owned"
          :set-value="filters.official.set"
          :series-value="filters.official.series"
          :rarity-value="filters.official.rarity"
          :duplicates-filter="filters.official.duplicates"
          @update:name-query="v => onOfficialNameInput(v)"
          @update:owned-filter="v => { filters.official.owned = v; fetchOfficialPage(1) }"
          @update:set-filter="v => { filters.official.set = v; fetchOfficialPage(1) }"
          @update:series-filter="v => { filters.official.series = v; fetchOfficialPage(1) }"
          @update:rarity-filter="v => { filters.official.rarity = v; fetchOfficialPage(1) }"
          @update:duplicates-filter="v => { filters.official.duplicates = v; fetchOfficialPage(1) }"
          @request-name-suggest="() => {}"
        >
          <!-- Inline Wishlist control -->
          <label v-if="targetUser" class="inline-flex items-center gap-2 ml-1">
            <input
              type="checkbox"
              v-model="filters.official.wishlistOnly"
              :disabled="loadingWishlist || (!loadingWishlist && targetWishlistIds.size === 0)"
              class="h-4 w-4 border rounded"
              @change="fetchOfficialPage(1)"
            />
            <span class="text-xs font-medium">Show Their Wishlist cToons</span>
          </label>

          <span v-if="loadingWishlist" class="text-[10px] text-gray-600">Loading...</span>
          <span v-else-if="targetWishlistIds.size === 0" class="text-[10px] text-gray-600">
            {{ targetUser.username }} has no wishlist items.
          </span>
        </FilterBar>

        <div v-if="loading.official" class="py-16 text-center text-gray-500">Loading...</div>
        <div v-else>
          <EmptyState
            v-if="!officialItems.length"
            :label="filters.official.wishlistOnly
              ? `No cToons from ${targetUser?.username ?? 'user'}'s Wishlist in ${officialUsername}'s collection`
              : 'No cToons match your filters'"
          />
          <div v-else class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            <CtoonCard
              v-for="c in officialItems"
              :key="c.id"
              :ctoon="c"
              :selected="selectedOfficialCtoonsMap.has(c.id)"
              :badge="c.otherOwns ? 'Owned by User' : 'Unowned by User'"
              badge-class-owned="bg-blue-100 text-blue-800"
              badge-class-unowned="bg-gray-200 text-gray-600"
              @toggle="toggleOfficialCtoon(c)"
            />
          </div>

          <!-- Pagination -->
          <div v-if="officialTotalPages > 1" class="mt-3 flex items-center justify-center gap-2">
            <button
              class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
              :disabled="officialPage === 1"
              @click="fetchOfficialPage(officialPage - 1)"
            >
              Previous
            </button>
            <span class="text-xs text-gray-600">
              Page {{ officialPage }} of {{ officialTotalPages }}
              <span class="text-gray-400">({{ officialTotal }} total)</span>
            </span>
            <button
              class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50 disabled:opacity-50"
              :disabled="officialPage >= officialTotalPages"
              @click="fetchOfficialPage(officialPage + 1)"
            >
              Next
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between">
          <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="currentStep = 1">Back</button>
          <button
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="!hasAnySelection"
            @click="currentStep = 3"
          >
            Confirm Offer
          </button>
        </div>
      </div>
    </section>

    <!-- STEP 3: Confirm Offer -->
    <section v-if="targetUser && currentStep === 3" class="mb-3">
      <div class="bg-white rounded-lg shadow p-2">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h2 class="text-sm font-semibold">3) Confirm Offer</h2>
            <span class="text-[10px] text-gray-500">Review before sending</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <!-- Requested from other user -->
          <div>
            <h3 class="text-xs font-semibold mb-1.5">Requesting from {{ targetUser.username }}</h3>
            <div v-if="!selectedTargetCtoons.length" class="text-xs text-gray-600">
              No cToons selected from {{ targetUser.username }}.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div v-for="c in selectedTargetCtoons" :key="c.id" class="border rounded-md p-2">
                <img :src="c.assetPath" :alt="c.name" class="w-full h-24 object-contain mb-1" />
                <p class="text-xs font-medium truncate">{{ c.name }}</p>
                <p class="text-[11px] text-gray-600">{{ c.rarity }}</p>
              </div>
            </div>
          </div>

          <!-- Offering -->
          <div>
            <h3 class="text-xs font-semibold mb-1.5">Offering from {{ officialUsername }}</h3>
            <div v-if="!selectedOfficialCtoons.length" class="text-xs text-gray-600">
              No cToons offered.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div v-for="c in selectedOfficialCtoons" :key="c.id" class="border rounded-md p-2">
                <img :src="c.assetPath" :alt="c.name" class="w-full h-24 object-contain mb-1" />
                <p class="text-xs font-medium truncate">{{ c.name }}</p>
                <p class="text-[11px] text-gray-600">{{ c.rarity }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <button class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50" @click="currentStep = 2">Back</button>
          <button
            class="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            :disabled="!hasAnySelection || makingOffer"
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
      <div v-if="toast.show" class="fixed bottom-4 right-4 bg-black text-white px-3 py-2 rounded-md shadow text-xs">
        {{ toast.message }}
      </div>
    </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'

import FilterBar from '@/components/trade/FilterBar.vue'
import CtoonCard from '@/components/trade/CtoonCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const PAGE_SIZE   = 100
const MIN_CHARS   = 3
const DEBOUNCE_MS = 350

const currentStep = ref(1)

// ── User search (autocomplete) ─────────────────────────────────────────────────
const userQuery        = ref('')
const userResults      = ref([])
const showUserSuggest  = ref(false)
const isSearching      = ref(false)
const highlightedIndex = ref(-1)
const targetUser       = ref(null)
const targetError      = ref('')
const userInputRef     = ref(null)
const userSuggestRef   = ref(null)

let userSearchTimer
const userSearchCache = new Map()

const officialUser     = ref(null)
const officialError    = ref('')
const officialUsername = computed(() => officialUser.value?.username || 'Official')

async function ensureOfficial() {
  if (officialUser.value) return officialUser.value
  try {
    officialUser.value = await $fetch('/api/admin/official')
  } catch {
    officialError.value = 'Failed to load the official account.'
  }
  return officialUser.value
}

function onUserQueryInput() {
  targetError.value   = ''
  showUserSuggest.value = true
  highlightedIndex.value = -1
  clearTimeout(userSearchTimer)

  const q = userQuery.value || ''
  if (q.length < MIN_CHARS) {
    userResults.value = []
    isSearching.value  = false
    return
  }

  userSearchTimer = setTimeout(async () => {
    const key = q.toLowerCase()
    try {
      isSearching.value = true
      if (userSearchCache.has(key)) {
        userResults.value = filterOutOfficial(userSearchCache.get(key))
        return
      }
      const res   = await $fetch('/api/users/search', { params: { q, limit: 8 } })
      const items = Array.isArray(res) ? res : (res?.items || [])
      userSearchCache.set(key, items)
      userResults.value = filterOutOfficial(items)
    } catch {
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
  targetUser.value       = u
  userQuery.value        = u.username
  showUserSuggest.value  = false
  highlightedIndex.value = -1
  currentStep.value      = 1
  resetState()
  bootstrapCollections()
  loadTargetWishlist()
}

function onGlobalClick(e) {
  const inputEl = userInputRef.value
  const boxEl   = userSuggestRef.value
  if (!inputEl) return
  if (inputEl.contains(e.target) || (boxEl && boxEl.contains(e.target))) return
  showUserSuggest.value = false
}

onMounted(async () => {
  if (process.client) window.addEventListener('click', onGlobalClick)
  await ensureOfficial()
})
onBeforeUnmount(() => {
  if (process.client) window.removeEventListener('click', onGlobalClick)
})

// ── Filter state ───────────────────────────────────────────────────────────────
const filters = reactive({
  target:   { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all' },
  official: { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false }
})

// Populated from filter-meta endpoints (one fetch per user selection)
const filterMeta = reactive({
  target:   { sets: ['All'], seriesOptions: ['All'], rarities: ['All'] },
  official: { sets: ['All'], seriesOptions: ['All'], rarities: ['All'] }
})

// ── Debounced name handlers ────────────────────────────────────────────────────
let targetNameTimer
let officialNameTimer

function onTargetNameInput(v) {
  filters.target.nameQuery = v
  clearTimeout(targetNameTimer)
  targetNameTimer = setTimeout(() => fetchTargetPage(1), DEBOUNCE_MS)
}
function onOfficialNameInput(v) {
  filters.official.nameQuery = v
  clearTimeout(officialNameTimer)
  officialNameTimer = setTimeout(() => fetchOfficialPage(1), DEBOUNCE_MS)
}

// ── Collection data + pagination ───────────────────────────────────────────────
const loading = reactive({ target: false, official: false })

// Current page items (from server)
const targetItems  = ref([])
const officialItems = ref([])

// Pagination state
const targetPage        = ref(1)
const officialPage      = ref(1)
const targetTotal       = ref(0)
const officialTotal     = ref(0)
const targetTotalPages  = computed(() => Math.max(1, Math.ceil(targetTotal.value  / PAGE_SIZE)))
const officialTotalPages = computed(() => Math.max(1, Math.ceil(officialTotal.value / PAGE_SIZE)))

// ── Wishlist ───────────────────────────────────────────────────────────────────
const targetWishlistIds = ref(new Set())
const loadingWishlist   = ref(false)

async function loadTargetWishlist() {
  if (!targetUser.value) return
  loadingWishlist.value = true
  try {
    const res = await $fetch(`/api/wishlist/users/${targetUser.value.username}`)
    const items = Array.isArray(res) ? res : []
    targetWishlistIds.value = new Set(items.map(w => w?.ctoon?.id).filter(Boolean))
  } catch {
    targetWishlistIds.value = new Set()
  } finally {
    loadingWishlist.value = false
  }
}

// ── Fetch helpers ──────────────────────────────────────────────────────────────
function buildTargetParams(page) {
  const p = {
    username:      targetUser.value?.username,
    page,
    limit:         PAGE_SIZE,
    ownedByUsername: officialUser.value?.username
  }
  if (filters.target.nameQuery)                        p.name          = filters.target.nameQuery
  if (filters.target.set     && filters.target.set     !== 'All') p.set    = filters.target.set
  if (filters.target.series  && filters.target.series  !== 'All') p.series = filters.target.series
  if (filters.target.rarity  && filters.target.rarity  !== 'All') p.rarity = filters.target.rarity
  if (filters.target.duplicates === 'dups')            p.duplicatesOnly = 'true'
  if (filters.target.owned !== 'all')                  p.ownedFilter   = filters.target.owned
  return p
}

function buildOfficialParams(page) {
  const p = {
    page,
    limit:          PAGE_SIZE,
    targetUsername: targetUser.value?.username
  }
  if (filters.official.nameQuery)                           p.name          = filters.official.nameQuery
  if (filters.official.set     && filters.official.set     !== 'All') p.set    = filters.official.set
  if (filters.official.series  && filters.official.series  !== 'All') p.series = filters.official.series
  if (filters.official.rarity  && filters.official.rarity  !== 'All') p.rarity = filters.official.rarity
  if (filters.official.duplicates === 'dups')               p.duplicatesOnly = 'true'
  if (filters.official.owned !== 'all')                     p.ownedFilter   = filters.official.owned
  if (filters.official.wishlistOnly)                        p.wishlistOnly   = 'true'
  return p
}

async function fetchTargetPage(page) {
  if (!targetUser.value) return
  loading.target = true
  try {
    const res        = await $fetch('/api/admin/target-collection', { params: buildTargetParams(page) })
    targetItems.value = res.items ?? []
    targetTotal.value = res.total ?? 0
    targetPage.value  = res.page  ?? page
  } catch {
    targetItems.value = []
    targetTotal.value = 0
  } finally {
    loading.target = false
  }
}

async function fetchOfficialPage(page) {
  if (!targetUser.value) return
  loading.official = true
  try {
    const res         = await $fetch('/api/admin/official-collection', { params: buildOfficialParams(page) })
    officialItems.value = res.items ?? []
    officialTotal.value = res.total ?? 0
    officialPage.value  = res.page  ?? page
  } catch {
    officialItems.value = []
    officialTotal.value = 0
  } finally {
    loading.official = false
  }
}

async function bootstrapCollections() {
  if (!targetUser.value || !officialUser.value) return

  // Reset pagination
  targetPage.value  = 1
  officialPage.value = 1

  loading.target   = true
  loading.official = true

  try {
    // Load filter metas + first pages in parallel
    const [targetMeta, officialMeta, targetRes, officialRes] = await Promise.all([
      $fetch('/api/admin/target-collection-filters', { params: { username: targetUser.value.username } }),
      $fetch('/api/admin/official-collection-filters'),
      $fetch('/api/admin/target-collection',   { params: buildTargetParams(1) }),
      $fetch('/api/admin/official-collection', { params: buildOfficialParams(1) })
    ])

    filterMeta.target.sets          = targetMeta.sets          ?? ['All']
    filterMeta.target.seriesOptions = targetMeta.seriesOptions  ?? ['All']
    filterMeta.target.rarities      = targetMeta.rarities       ?? ['All']

    filterMeta.official.sets          = officialMeta.sets          ?? ['All']
    filterMeta.official.seriesOptions = officialMeta.seriesOptions  ?? ['All']
    filterMeta.official.rarities      = officialMeta.rarities       ?? ['All']

    targetItems.value  = targetRes.items  ?? []
    targetTotal.value  = targetRes.total  ?? 0
    targetPage.value   = targetRes.page   ?? 1

    officialItems.value = officialRes.items ?? []
    officialTotal.value = officialRes.total ?? 0
    officialPage.value  = officialRes.page  ?? 1
  } catch {
    targetItems.value   = []
    officialItems.value = []
  } finally {
    loading.target   = false
    loading.official = false
  }
}

// ── Selections ─────────────────────────────────────────────────────────────────
const selectedTargetCtoons  = ref([])
const selectedOfficialCtoons = ref([])
const selectedTargetCtoonsMap  = computed(() => new Set(selectedTargetCtoons.value.map(c => c.id)))
const selectedOfficialCtoonsMap = computed(() => new Set(selectedOfficialCtoons.value.map(c => c.id)))
const hasAnySelection = computed(() => selectedTargetCtoons.value.length + selectedOfficialCtoons.value.length > 0)

function toggleTargetCtoon(c) {
  const i = selectedTargetCtoons.value.findIndex(x => x.id === c.id)
  if (i >= 0) selectedTargetCtoons.value.splice(i, 1)
  else selectedTargetCtoons.value.push(c)
}
function toggleOfficialCtoon(c) {
  const i = selectedOfficialCtoons.value.findIndex(x => x.id === c.id)
  if (i >= 0) selectedOfficialCtoons.value.splice(i, 1)
  else selectedOfficialCtoons.value.push(c)
}

// ── Reset helpers ──────────────────────────────────────────────────────────────
function resetState() {
  selectedTargetCtoons.value  = []
  selectedOfficialCtoons.value = []
  targetItems.value   = []
  officialItems.value = []
  targetTotal.value   = 0
  officialTotal.value = 0
  targetPage.value    = 1
  officialPage.value  = 1
  targetWishlistIds.value = new Set()
  loadingWishlist.value   = false

  filters.target   = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all' }
  filters.official = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false }

  filterMeta.target   = { sets: ['All'], seriesOptions: ['All'], rarities: ['All'] }
  filterMeta.official = { sets: ['All'], seriesOptions: ['All'], rarities: ['All'] }
}

async function clearTarget(focusInput = false) {
  targetUser.value  = null
  currentStep.value = 1
  userQuery.value   = ''
  userResults.value = []
  highlightedIndex.value = -1
  showUserSuggest.value  = false
  isSearching.value      = false
  resetState()

  if (focusInput) {
    await nextTick()
    userInputRef.value?.focus()
  }
}

// ── Offer ──────────────────────────────────────────────────────────────────────
const makingOffer = ref(false)
const toast = reactive({ show: false, message: '' })

async function sendOffer() {
  if (!targetUser.value || !officialUser.value) return
  if (!hasAnySelection.value) return

  const recipient = targetUser.value.username
  const payload = {
    recipientUsername:   recipient,
    ctoonIdsRequested:   selectedTargetCtoons.value.map(c => c.id),
    ctoonIdsOffered:     selectedOfficialCtoons.value.map(c => c.id)
  }

  try {
    makingOffer.value = true
    await $fetch('/api/admin/trade-offers', { method: 'POST', body: payload })
    toast.message = 'Trade offer sent! Redirecting...'
    toast.show    = true
    await router.push(`/czone/${encodeURIComponent(recipient)}`)
  } catch {
    toast.message = 'Failed to send offer. Please try again.'
    toast.show    = true
    setTimeout(() => (toast.show = false), 3500)
  } finally {
    makingOffer.value = false
  }
}
</script>

<style>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from,  .fade-leave-to      { opacity: 0 }
</style>
