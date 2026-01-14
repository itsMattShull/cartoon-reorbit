<template>
  <Nav />
  <div class="pt-20 px-4 max-w-7xl mx-auto mt-16 md:mt-20">
    <!-- Title -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Create Trade</h1>
      <div class="text-sm bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded">
        My Points: {{ user?.points ?? 0 }}
      </div>
    </div>

    <!-- Step 0: Pick a user -->
    <section class="bg-white rounded-xl shadow-md p-4 mb-6">
      <div class="flex items-center gap-2 mb-4">
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-semibold rounded-full border"
          :class="findTab === 'user' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
          @click="setFindTab('user')"
        >
          Find User
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-semibold rounded-full border"
          :class="findTab === 'ctoon' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-700 hover:bg-gray-50'"
          @click="setFindTab('ctoon')"
        >
          Find cToon
        </button>
      </div>

      <div v-if="findTab === 'user'">
        <label class="block text-sm font-medium mb-2">Find a user to trade with</label>
        <div class="relative">
          <input
            ref="userInputRef"
            v-model.trim="userQuery"
            @input="onUserQueryInput"
            @keydown="onUserKeydown"
            type="text"
            placeholder="Type a username…"
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
            <div v-if="isSearching" class="px-3 py-2 text-sm text-gray-600">Searching…</div>

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
      </div>

      <div v-else>
        <label class="block text-sm font-medium mb-2">Find a cToon to trade for</label>
        <div class="relative">
          <input
            ref="ctoonInputRef"
            v-model.trim="ctoonQuery"
            @input="onCtoonQueryInput"
            @keydown="onCtoonKeydown"
            type="text"
            placeholder="Type a cToon name or character…"
            autocomplete="off"
            role="combobox"
            aria-expanded="showCtoonSuggest"
            aria-controls="ctoon-suggest-listbox"
            aria-autocomplete="list"
            class="w-full border rounded px-3 py-2"
          />
          <!-- suggestions -->
          <div
            v-if="showCtoonSuggest"
            ref="ctoonSuggestRef"
            id="ctoon-suggest-listbox"
            class="absolute z-20 bg-white border rounded w-full mt-1 max-h-72 overflow-auto"
            role="listbox"
            @click.stop
          >
            <div v-if="isSearchingCtoon" class="px-3 py-2 text-sm text-gray-600">Searching…</div>
            <template v-else>
              <div
                v-if="ctoonMode === 'mint'"
                class="px-3 py-2 border-b flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  class="text-xs text-indigo-600 hover:underline"
                  @click="resetCtoonMode"
                >
                  Back to results
                </button>
                <span class="text-xs text-gray-600 truncate">
                  Mints for {{ activeCtoon?.name || 'cToon' }}
                </span>
              </div>

              <template v-if="ctoonMode === 'ctoon' && ctoonResults.length">
                <button
                  v-for="(c, idx) in ctoonResults"
                  :key="c.ctoonId"
                  :class="[
                    'w-full text-left px-3 py-2 flex items-center gap-3',
                    highlightedCtoonIndex === idx ? 'bg-indigo-50' : 'hover:bg-indigo-50'
                  ]"
                  role="option"
                  :aria-selected="highlightedCtoonIndex === idx"
                  @mouseenter="highlightedCtoonIndex = idx"
                  @click="selectCtoonSummary(c)"
                >
                  <img :src="c.assetPath" :alt="c.name" class="w-10 h-10 rounded border object-contain bg-white" />
                  <div class="min-w-0">
                    <div class="font-medium truncate">{{ c.name }}</div>
                    <div class="text-xs text-gray-600">
                      Highest Mint #{{ c.highestMint ?? '—' }}
                    </div>
                  </div>
                </button>
              </template>

              <template v-else-if="ctoonMode === 'mint' && ctoonMintResults.length">
                <button
                  v-for="(c, idx) in ctoonMintResults"
                  :key="c.userCtoonId"
                  :class="[
                    'w-full text-left px-3 py-2 flex items-center gap-3',
                    highlightedCtoonIndex === idx ? 'bg-indigo-50' : 'hover:bg-indigo-50'
                  ]"
                  role="option"
                  :aria-selected="highlightedCtoonIndex === idx"
                  @mouseenter="highlightedCtoonIndex = idx"
                  @click="selectCtoonMint(c)"
                >
                  <img :src="c.assetPath" :alt="c.name" class="w-10 h-10 rounded border object-contain bg-white" />
                  <div class="min-w-0">
                    <div class="font-medium truncate">Mint #{{ c.mintNumber ?? '—' }}</div>
                    <div class="text-xs text-gray-600">
                      {{ c.ownerUsername }}
                    </div>
                  </div>
                </button>
              </template>

              <div v-else class="px-3 py-2 text-sm text-gray-600">No matches</div>
            </template>
          </div>
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
            <h2 class="text-lg font-semibold">1) {{ targetUser.username }}’s Collection</h2>
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
          :name-query="filters.other.nameQuery"
          :name-suggestions="nameSuggestionsOther"
          :set-options="setOptionsOther"
          :series-options="seriesOptionsOther"
          :rarity-options="rarityOptionsOther"
          :owned-filter="filters.other.owned"
          :set-value="filters.other.set"
          :series-value="filters.other.series"
          :rarity-value="filters.other.rarity"
          :duplicates-filter="filters.other.duplicates"
          @update:name-query="v => (filters.other.nameQuery = v)"
          @update:owned-filter="v => (filters.other.owned = v)"
          @update:set-filter="v => (filters.other.set = v)"
          @update:series-filter="v => (filters.other.series = v)"
          @update:rarity-filter="v => (filters.other.rarity = v)"
          @update:duplicates-filter="v => (filters.other.duplicates = v)"
          @request-name-suggest="onOtherNameSuggest"
        />

        <div v-if="loading.other" class="py-16 text-center text-gray-500">Loading…</div>
        <div v-else>
          <EmptyState v-if="!filteredOther.length" label="No cToons match your filters" />
          <div v-else>
            <div ref="otherListTopRef" class="flex flex-wrap items-center justify-between gap-3 text-sm mb-3">
              <span class="text-gray-600">Showing {{ otherShowingRange }}</span>
              <div class="flex items-center gap-3">
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageOther === 1"
                  @click="prevOtherPage"
                >
                  Prev
                </button>
                <span>Page {{ pageOther }} of {{ totalPagesOther }}</span>
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageOther === totalPagesOther"
                  @click="nextOtherPage"
                >
                  Next
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <CtoonCard
                v-for="c in pagedOther"
                :key="c.id"
                :ctoon="c"
                :selected="selectedTargetCtoonsMap.has(c.id)"
                :badge="selfOwnedIds.has(c.ctoonId) ? 'Owned' : 'Unowned'"
                badge-class-owned="bg-green-100 text-green-800"
                badge-class-unowned="bg-gray-200 text-gray-600"
                @toggle="toggleTargetCtoon(c)"
              />
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span class="text-gray-600">Showing {{ otherShowingRange }}</span>
              <div class="flex items-center gap-3">
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageOther === 1"
                  @click="prevOtherPage"
                >
                  Prev
                </button>
                <span>Page {{ pageOther }} of {{ totalPagesOther }}</span>
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageOther === totalPagesOther"
                  @click="nextOtherPage"
                >
                  Next
                </button>
              </div>
            </div>
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

    <!-- STEP 2: Your collection & points (only) -->
    <section v-if="targetUser && currentStep === 2" class="mb-6">
      <div class="bg-white rounded-xl shadow-md p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">2) Your Collection & Points</h2>
          <div class="flex items-center gap-3">
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
            <button
              class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
              :disabled="(selectedInitiatorCtoons.length === 0 && pointsToOffer === 0) || makingOffer"
              @click="currentStep = 3"
            >
              <span v-if="makingOffer">Preparing…</span>
              <span v-else>Confirm Offer</span>
            </button>
          </div>
        </div>

        <FilterBar
          :context="'self'"
          :name-query="filters.self.nameQuery"
          :name-suggestions="nameSuggestionsSelf"
          :set-options="setOptionsSelf"
          :series-options="seriesOptionsSelf"
          :rarity-options="rarityOptionsSelf"
          :owned-filter="filters.self.owned"
          :set-value="filters.self.set"
          :series-value="filters.self.series"
          :rarity-value="filters.self.rarity"
          :duplicates-filter="filters.self.duplicates"
          @update:name-query="v => (filters.self.nameQuery = v)"
          @update:owned-filter="v => (filters.self.owned = v)"
          @update:set-filter="v => (filters.self.set = v)"
          @update:series-filter="v => (filters.self.series = v)"
          @update:rarity-filter="v => (filters.self.rarity = v)"
          @update:duplicates-filter="v => (filters.self.duplicates = v)"
          @request-name-suggest="onSelfNameSuggest"
        >
          <!-- Inline Wishlist control (same row, wraps as needed) -->
          <label v-if="targetUser" class="inline-flex items-center gap-2 ml-1">
            <input
              type="checkbox"
              v-model="filters.self.wishlistOnly"
              :disabled="loadingWishlist || (!loadingWishlist && targetWishlistIds.size === 0)"
              class="h-4 w-4 border rounded"
            />
            <span class="text-base md:text-lg font-medium">Show Their Wishlist cToons</span>
          </label>

          <span v-if="loadingWishlist" class="text-xs text-gray-600">Loading…</span>
          <span v-else-if="targetWishlistIds.size === 0" class="text-xs text-gray-600">
            {{ targetUser.username }} has no wishlist items.
          </span>
        </FilterBar>


        <div v-if="loading.self" class="py-16 text-center text-gray-500">Loading…</div>
        <div v-else>
          <EmptyState
            v-if="!filteredSelf.length"
            :label="filters.self.wishlistOnly
              ? `No cToons from ${targetUser?.username ?? 'user'}’s Wishlist in your collection`
              : 'No cToons match your filters'"
          />
          <div v-else>
            <div ref="selfListTopRef" class="flex flex-wrap items-center justify-between gap-3 text-sm mb-3">
              <span class="text-gray-600">Showing {{ selfShowingRange }}</span>
              <div class="flex items-center gap-3">
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageSelf === 1"
                  @click="prevSelfPage"
                >
                  Prev
                </button>
                <span>Page {{ pageSelf }} of {{ totalPagesSelf }}</span>
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageSelf === totalPagesSelf"
                  @click="nextSelfPage"
                >
                  Next
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <CtoonCard
                v-for="c in pagedSelf"
                :key="c.id"
                :ctoon="c"
                :selected="selectedInitiatorCtoonsMap.has(c.id)"
                :badge="targetOwnedIds.has(c.ctoonId) ? 'Owned by User' : 'Unowned by User'"
                badge-class-owned="bg-blue-100 text-blue-800"
                badge-class-unowned="bg-gray-200 text-gray-600"
                @toggle="toggleInitiatorCtoon(c)"
              />
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span class="text-gray-600">Showing {{ selfShowingRange }}</span>
              <div class="flex items-center gap-3">
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageSelf === 1"
                  @click="prevSelfPage"
                >
                  Prev
                </button>
                <span>Page {{ pageSelf }} of {{ totalPagesSelf }}</span>
                <button
                  class="bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
                  :disabled="pageSelf === totalPagesSelf"
                  @click="nextSelfPage"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <button class="px-3 py-2 rounded border hover:bg-gray-50" @click="currentStep = 1">Back</button>
          <button
            class="px-4 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
            :disabled="(selectedInitiatorCtoons.length === 0 && pointsToOffer === 0) || makingOffer"
            @click="currentStep = 3"
          >
            <span v-if="makingOffer">Preparing…</span>
            <span v-else>Confirm Offer</span>
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
            <h3 class="font-semibold mb-2">You’re Offering</h3>
            <div class="mb-3 text-sm">
              <span class="font-medium">Points:</span>
              <span>{{ pointsToOffer }}</span>
            </div>
            <div v-if="!selectedInitiatorCtoons.length" class="text-sm text-gray-600">
              No cToons offered.
            </div>
            <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="c in selectedInitiatorCtoons" :key="c.id" class="border rounded p-2">
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
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

// Import SFC components
import FilterBar from '@/components/trade/FilterBar.vue'
import CtoonCard from '@/components/trade/CtoonCard.vue'
import EmptyState from '@/components/EmptyState.vue'

definePageMeta({ title: 'Create Trade', middleware: 'auth', layout: 'default' })

const router = useRouter()
const route = useRoute()
const { user, fetchSelf } = useAuth()

const currentStep = ref(1) // 1 or 2
const findTab = ref('user')
const preselectUserCtoonId = computed(() => {
  const val = route.query.userCtoonId
  if (!val) return null
  return Array.isArray(val) ? String(val[0]) : String(val)
})
const manualPreselectUserCtoonId = ref(null)

// ────────────────────────────────────────────────────────────────────────────────
// User search w/ autocomplete (3+ chars, debounced, keyboard nav)
// ────────────────────────────────────────────────────────────────────────────────
const MIN_CHARS = 3
const DEBOUNCE_MS = 250
const PAGE_SIZE = 50

const userQuery = ref('')
const userResults = ref([])
const showUserSuggest = ref(false)
const isSearching = ref(false)
const highlightedIndex = ref(-1) // for ↑/↓ nav
const targetUser = ref(null) // { username, avatar }
const targetError = ref('')

const userInputRef = ref(null)
const userSuggestRef = ref(null)

const ctoonQuery = ref('')
const ctoonResults = ref([])
const ctoonMintResults = ref([])
const ctoonMode = ref('ctoon')
const activeCtoon = ref(null)
const showCtoonSuggest = ref(false)
const isSearchingCtoon = ref(false)
const highlightedCtoonIndex = ref(-1)
const ctoonInputRef = ref(null)
const ctoonSuggestRef = ref(null)
const otherListTopRef = ref(null)
const selfListTopRef = ref(null)
const suppressCtoonInput = ref(false)

let ctoonSearchTimer
const ctoonSearchCache = new Map()
const ctoonMintCache = new Map()

let userSearchTimer
const userSearchCache = new Map() // simple in-memory cache by query string

async function setFindTab(tab) {
  if (findTab.value === tab) return
  findTab.value = tab
  targetError.value = ''
  showUserSuggest.value = false
  showCtoonSuggest.value = false
  highlightedIndex.value = -1
  highlightedCtoonIndex.value = -1
  await nextTick()
  if (tab === 'user') userInputRef.value?.focus()
  if (tab === 'ctoon') ctoonInputRef.value?.focus()
}

async function ensureSelfLoaded() {
  if (user.value?.username) return
  try {
    await fetchSelf()
  } catch {}
}

function isSelfUsername(name) {
  const me = (user.value?.username || '').toLowerCase()
  return !!me && String(name || '').toLowerCase() === me
}

// add rarity to both sides
const filters = reactive({
  other: { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all' },
  self:  { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false }
})

const pageOther = ref(1)
const pageSelf = ref(1)

// compute which ctoonIds are duplicates for each list
const dupIdsOther = computed(() => {
  const m = new Map()
  for (const c of otherCtoons.value) m.set(c.ctoonId, (m.get(c.ctoonId) || 0) + 1)
  return new Set([...m].filter(([, n]) => n > 1).map(([id]) => id))
})
const dupIdsSelf = computed(() => {
  const m = new Map()
  for (const c of selfCtoons.value) m.set(c.ctoonId, (m.get(c.ctoonId) || 0) + 1)
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

const rarityOptionsOther = computed(() => buildRarityOptions(otherCtoons.value))
const rarityOptionsSelf  = computed(() => buildRarityOptions(selfCtoons.value))

async function initFromRoute() {
  const param = route.params.username
  const raw = Array.isArray(param) ? param[0] : param
  if (!raw) {
    await nextTick()
    userInputRef.value?.focus()
    return
  }
  const uname = String(raw).trim()
  if (!uname) {
    await nextTick()
    userInputRef.value?.focus()
    return
  }

  await ensureSelfLoaded()

  // Prefill the input
  userQuery.value = uname

  // If it’s you, don’t auto-select
  if (isSelfUsername(uname)) {
    targetError.value = "You can't trade with yourself."
    targetUser.value = null
    currentStep.value = 1
    showUserSuggest.value = false
    return
  }

  // Try to auto-select exact username (case-insensitive)
  try {
    isSearching.value = true
    const res = await $fetch('/api/users/search', { params: { q: uname, limit: 8 } })
    const items = Array.isArray(res) ? res : (res?.items || [])
    const match = items.find(u => u.username?.toLowerCase() === uname.toLowerCase())

    if (match) {
      await selectTargetUser(match)
    } else {
      // No exact match: open suggestions with whatever is typed
      showUserSuggest.value = true
      onUserQueryInput()
    }
  } catch {
    // Fallback: just open suggestions
    showUserSuggest.value = true
    onUserQueryInput()
  } finally {
    isSearching.value = false
  }
}

watch(() => route.params.username, async () => {
  await clearTarget(false)
  await initFromRoute()
})

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
        userResults.value = filterOutSelf(userSearchCache.get(key))
        isSearching.value = false
        return
      }

      const res = await $fetch('/api/users/search', { params: { q, limit: 8 } })
      const items = Array.isArray(res) ? res : (res?.items || [])
      userSearchCache.set(key, items)
      userResults.value = filterOutSelf(items)
    } catch (e) {
      userResults.value = []
    } finally {
      isSearching.value = false
    }
  }, DEBOUNCE_MS)
}

function filterOutSelf(items) {
  return (items || []).filter(r => r.username && !isSelfUsername(r.username))
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

async function selectTargetUser(u, options = {}) {
  await ensureSelfLoaded()
  if (isSelfUsername(u.username)) {
    targetError.value = "You can't trade with yourself."
    return
  }
  if (!options.keepPreselect) manualPreselectUserCtoonId.value = null
  targetUser.value = u
  pageOther.value = 1
  pageSelf.value = 1
  userQuery.value = u.username
  showUserSuggest.value = false
  showCtoonSuggest.value = false
  highlightedIndex.value = -1
  currentStep.value = 1              // start at Step 1
  bootstrapCollections()
  loadTargetWishlist()
}

function onCtoonQueryInput() {
  if (suppressCtoonInput.value) {
    suppressCtoonInput.value = false
    return
  }
  targetError.value = ''
  showCtoonSuggest.value = true
  resetCtoonMode()
  clearTimeout(ctoonSearchTimer)

  const q = ctoonQuery.value || ''
  if (q.length < MIN_CHARS) {
    ctoonResults.value = []
    isSearchingCtoon.value = false
    return
  }

  ctoonSearchTimer = setTimeout(async () => {
    const key = q.toLowerCase()
    try {
      isSearchingCtoon.value = true
      if (ctoonSearchCache.has(key)) {
        ctoonResults.value = ctoonSearchCache.get(key)
        isSearchingCtoon.value = false
        return
      }

      const res = await $fetch('/api/trade/search-ctoons', { params: { q, limit: 50 } })
      const items = Array.isArray(res) ? res : (res?.items || [])
      ctoonSearchCache.set(key, items)
      ctoonResults.value = items
    } catch (e) {
      ctoonResults.value = []
    } finally {
      isSearchingCtoon.value = false
    }
  }, DEBOUNCE_MS)
}

function onCtoonKeydown(e) {
  if (!showCtoonSuggest.value) return
  const list = ctoonMode.value === 'mint' ? ctoonMintResults.value : ctoonResults.value
  const max = list.length - 1
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedCtoonIndex.value = highlightedCtoonIndex.value < max ? highlightedCtoonIndex.value + 1 : 0
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedCtoonIndex.value = highlightedCtoonIndex.value > 0 ? highlightedCtoonIndex.value - 1 : max
  } else if (e.key === 'Enter') {
    if (highlightedCtoonIndex.value === -1 && list.length) {
      e.preventDefault()
      const item = list[0]
      if (ctoonMode.value === 'mint') selectCtoonMint(item)
      else selectCtoonSummary(item)
      return
    }
    if (highlightedCtoonIndex.value >= 0 && highlightedCtoonIndex.value <= max) {
      e.preventDefault()
      const item = list[highlightedCtoonIndex.value]
      if (ctoonMode.value === 'mint') selectCtoonMint(item)
      else selectCtoonSummary(item)
    }
  } else if (e.key === 'Escape') {
    showCtoonSuggest.value = false
  }
}

function resetCtoonMode() {
  ctoonMode.value = 'ctoon'
  activeCtoon.value = null
  ctoonMintResults.value = []
  highlightedCtoonIndex.value = -1
}

async function selectCtoonSummary(item) {
  if (!item?.ctoonId) return
  ctoonMode.value = 'mint'
  activeCtoon.value = { ctoonId: item.ctoonId, name: item.name, assetPath: item.assetPath }
  suppressCtoonInput.value = true
  ctoonQuery.value = item.name || ctoonQuery.value
  setTimeout(() => { suppressCtoonInput.value = false }, 0)
  highlightedCtoonIndex.value = -1
  showCtoonSuggest.value = true

  const key = String(item.ctoonId)
  try {
    isSearchingCtoon.value = true
    if (ctoonMintCache.has(key)) {
      ctoonMintResults.value = sortMintResults(ctoonMintCache.get(key))
      return
    }

    const res = await $fetch('/api/trade/search-ctoons', { params: { ctoonId: item.ctoonId } })
    const items = Array.isArray(res) ? res : (res?.items || [])
    const sorted = sortMintResults(items)
    ctoonMintCache.set(key, sorted)
    ctoonMintResults.value = sorted
  } catch (e) {
    ctoonMintResults.value = []
  } finally {
    isSearchingCtoon.value = false
  }
}

async function selectCtoonMint(item) {
  await ensureSelfLoaded()
  if (!item?.ownerUsername) return
  if (isSelfUsername(item.ownerUsername)) {
    targetError.value = "You can't trade with yourself."
    return
  }

  await clearTarget(false)
  manualPreselectUserCtoonId.value = item.userCtoonId
  ctoonQuery.value = item.name || ctoonQuery.value
  showCtoonSuggest.value = false
  highlightedCtoonIndex.value = -1
  await selectTargetUser({ username: item.ownerUsername, avatar: item.ownerAvatar }, { keepPreselect: true })
}

/**
 * Clear everything and (optionally) focus the active tab input
 */
async function clearTarget(focusInput = false) {
  targetUser.value = null
  currentStep.value = 1
  targetError.value = ''
  userQuery.value = ''
  userResults.value = []
  highlightedIndex.value = -1
  showUserSuggest.value = false
  isSearching.value = false
  ctoonQuery.value = ''
  ctoonResults.value = []
  ctoonMintResults.value = []
  ctoonMode.value = 'ctoon'
  activeCtoon.value = null
  highlightedCtoonIndex.value = -1
  showCtoonSuggest.value = false
  isSearchingCtoon.value = false
  manualPreselectUserCtoonId.value = null
  selectedTargetCtoons.value = []
  selectedInitiatorCtoons.value = []
  pointsToOffer.value = 0
  otherCtoons.value = []
  selfCtoons.value = []
  pageOther.value = 1
  pageSelf.value = 1
  filters.other = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all' }
  filters.self  = { nameQuery: '', set: 'All', series: 'All', rarity: 'All', duplicates: 'all', owned: 'all', wishlistOnly: false }

  // reset wishlist state
  targetWishlist.value = []
  loadingWishlist.value = false

  if (focusInput) {
    await nextTick()
    if (findTab.value === 'ctoon') ctoonInputRef.value?.focus()
    else userInputRef.value?.focus()
  }
}

// close suggest on outside click (but not when clicking inside the list)
function onGlobalClick(e) {
  const target = e.target
  const userInputEl = userInputRef.value
  const userBoxEl = userSuggestRef.value
  const ctoonInputEl = ctoonInputRef.value
  const ctoonBoxEl = ctoonSuggestRef.value
  const inUser =
    (userInputEl && userInputEl.contains(target)) ||
    (userBoxEl && userBoxEl.contains(target))
  const inCtoon =
    (ctoonInputEl && ctoonInputEl.contains(target)) ||
    (ctoonBoxEl && ctoonBoxEl.contains(target))
  if (!inUser) showUserSuggest.value = false
  if (!inCtoon) showCtoonSuggest.value = false
}

onMounted(async () => {
  if (process.client) window.addEventListener('click', onGlobalClick)
  // Autofill from /create-trade/:username (optional)
  await initFromRoute()
})
onBeforeUnmount(() => {
  if (process.client) window.removeEventListener('click', onGlobalClick)
})

// ────────────────────────────────────────────────────────────────────────────────
// Collections + ownership sets
// ────────────────────────────────────────────────────────────────────────────────
const loading = reactive({ other: false, self: false })
const otherCtoons = ref([])
const selfCtoons = ref([])
const targetOwnedIds = computed(() => new Set(otherCtoons.value.map(c => c.ctoonId)))
const selfOwnedIds = computed(() => new Set(selfCtoons.value.map(c => c.ctoonId)))

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
    applyPreselectedTargetCtoon()
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

function applyPreselectedTargetCtoon() {
  const preselectId = manualPreselectUserCtoonId.value || preselectUserCtoonId.value
  if (!preselectId) return
  const match = otherCtoons.value.find(c => c.id === preselectId)
  if (!match) return
  if (!selectedTargetCtoonsMap.value.has(match.id)) {
    selectedTargetCtoons.value.push(match)
  }
}

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

function sortAlpha(arr) {
  return [...arr].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
}
function uniqueTruthies(arr) {
  return [...new Set(arr.map(x => (x ?? '').toString().trim()).filter(Boolean))]
}

const setOptionsOther = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(otherCtoons.value.map(c => c.set ?? c.setName ?? c.collectionSet)))
])
const setOptionsSelf = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(selfCtoons.value.map(c => c.set ?? c.setName ?? c.collectionSet)))
])

const seriesOptionsOther = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(otherCtoons.value.map(c => c.series ?? c.seriesName)))
])
const seriesOptionsSelf = computed(() => [
  'All',
  ...sortAlpha(uniqueTruthies(selfCtoons.value.map(c => c.series ?? c.seriesName)))
])

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

const filteredOther = computed(() => applyFilters(otherCtoons.value, filters.other, {
  ownedPredicate: (c) => selfOwnedIds.value.has(c.ctoonId),
  dupIds: dupIdsOther.value
}))
const filteredSelf = computed(() => {
  let list = applyFilters(selfCtoons.value, filters.self, {
    ownedPredicate: (c) => targetOwnedIds.value.has(c.ctoonId),
    dupIds: dupIdsSelf.value
  })
  if (filters.self.wishlistOnly) {
    list = list.filter(c => targetWishlistIds.value.has(c.ctoonId))
  }
  return list
})

const totalPagesOther = computed(() => Math.max(1, Math.ceil(filteredOther.value.length / PAGE_SIZE)))
const totalPagesSelf = computed(() => Math.max(1, Math.ceil(filteredSelf.value.length / PAGE_SIZE)))

const pagedOther = computed(() => {
  const start = (pageOther.value - 1) * PAGE_SIZE
  return filteredOther.value.slice(start, start + PAGE_SIZE)
})
const pagedSelf = computed(() => {
  const start = (pageSelf.value - 1) * PAGE_SIZE
  return filteredSelf.value.slice(start, start + PAGE_SIZE)
})

const otherShowingRange = computed(() => {
  const total = filteredOther.value.length
  if (!total) return '0-0 of 0'
  const start = (pageOther.value - 1) * PAGE_SIZE + 1
  const end = Math.min(pageOther.value * PAGE_SIZE, total)
  return `${start}-${end} of ${total}`
})
const selfShowingRange = computed(() => {
  const total = filteredSelf.value.length
  if (!total) return '0-0 of 0'
  const start = (pageSelf.value - 1) * PAGE_SIZE + 1
  const end = Math.min(pageSelf.value * PAGE_SIZE, total)
  return `${start}-${end} of ${total}`
})

watch(() => filters.other, () => {
  pageOther.value = 1
}, { deep: true })
watch(() => filters.self, () => {
  pageSelf.value = 1
}, { deep: true })

watch(totalPagesOther, (total) => {
  if (pageOther.value > total) pageOther.value = total
})
watch(totalPagesSelf, (total) => {
  if (pageSelf.value > total) pageSelf.value = total
})

function prevOtherPage() {
  if (pageOther.value > 1) {
    pageOther.value -= 1
    scrollToListTop('other')
  }
}
function nextOtherPage() {
  if (pageOther.value < totalPagesOther.value) {
    pageOther.value += 1
    scrollToListTop('other')
  }
}
function prevSelfPage() {
  if (pageSelf.value > 1) {
    pageSelf.value -= 1
    scrollToListTop('self')
  }
}
function nextSelfPage() {
  if (pageSelf.value < totalPagesSelf.value) {
    pageSelf.value += 1
    scrollToListTop('self')
  }
}

function scrollToListTop(which) {
  const el = which === 'self' ? selfListTopRef.value : otherListTopRef.value
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function sortMintResults(list) {
  return [...(list || [])].sort((a, b) => {
    const aMint = a?.mintNumber ?? Number.POSITIVE_INFINITY
    const bMint = b?.mintNumber ?? Number.POSITIVE_INFINITY
    if (aMint !== bMint) return aMint - bMint
    const aOwner = (a?.ownerUsername || '').toString()
    const bOwner = (b?.ownerUsername || '').toString()
    return aOwner.localeCompare(bOwner, undefined, { sensitivity: 'base' })
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

  const recipient = targetUser.value.username // capture before any reset
  const payload = {
    recipientUsername: recipient,
    ctoonIdsRequested: selectedTargetCtoons.value.map(c => c.id),
    ctoonIdsOffered:   selectedInitiatorCtoons.value.map(c => c.id),
    pointsOffered:     pointsToOffer.value
  }

  try {
    makingOffer.value = true
    await $fetch('/api/trade/offers', { method: 'POST', body: payload })

    toast.message = 'Trade offer sent! Redirecting…'
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
