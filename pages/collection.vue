<template>
  <Nav />

  <div class="pt-16 px-4 py-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">My Collections</h1>

    <!-- ─────────────────── TABS ─────────────────── -->
    <div class="mb-6 flex items-center border-b border-gray-300">
      <div class="flex space-x-4">
        <button
          @click="switchTab('MyCollection')"
          :class="activeTab === 'MyCollection'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          My Collection
        </button>
        <button
          @click="switchTab('MyWishlist')"
          :class="activeTab === 'MyWishlist'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          My Wishlist
        </button>
        <button
          @click="switchTab('AllSets')"
          :class="activeTab === 'AllSets'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          All Sets
        </button>
        <button
          @click="switchTab('AllSeries')"
          :class="activeTab === 'AllSeries'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          All Series
        </button>
      </div>
    </div>

    <div class="lg:flex lg:gap-6">
      <!-- Toggle Filters on Mobile -->
      <button
        class="lg:hidden mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
        @click="showFilters = !showFilters"
      >
        {{ showFilters ? 'Hide Filters' : 'Show Filters & Sort' }}
      </button>

      <!-- Sidebar Filters -->
      <aside
        :class="[
          showFilters ? 'block' : 'hidden',
          'lg:block w-full lg:w-1/4 bg-white rounded-lg shadow p-6'
        ]"
      >
        <!-- Search -->
        <div class="mb-4">
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">
            Search cToons
          </label>
          <input
            id="search"
            type="text"
            v-model="searchQuery"
            placeholder="Type a name…"
            class="block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <!-- Filter by Set -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Set</p>
          <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
            <label
              v-for="s in filterMeta.sets"
              :key="s"
              class="flex items-center text-sm"
            >
              <input
                type="checkbox"
                :value="s"
                v-model="selectedSets"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2 capitalize">{{ s }}</span>
            </label>
          </div>
        </div>

        <!-- Filter by Series -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Series</p>
          <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
            <label
              v-for="ser in filterMeta.series"
              :key="ser"
              class="flex items-center text-sm"
            >
              <input
                type="checkbox"
                :value="ser"
                v-model="selectedSeries"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2 capitalize">{{ ser }}</span>
            </label>
          </div>
        </div>

        <!-- Filter by Rarity -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Rarity</p>
          <div class="space-y-1 max-h-28 overflow-y-auto pr-2">
            <label
              v-for="r in filterMeta.rarities"
              :key="r"
              class="flex items-center text-sm"
            >
              <input
                type="checkbox"
                :value="r"
                v-model="selectedRarities"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2 capitalize">{{ r }}</span>
            </label>
          </div>
        </div>

        <!-- Filter by Ownership -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Ownership</p>
          <div class="space-y-1">
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="all"
                v-model="selectedOwned"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">All</span>
            </label>
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="owned"
                v-model="selectedOwned"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">Owned Only</span>
            </label>
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="unowned"
                v-model="selectedOwned"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">Un-owned Only</span>
            </label>
          </div>
        </div>

        <!-- Sort -->
        <div class="mt-6">
          <label for="sort" class="block text-sm font-medium text-gray-700 mb-1">
            Sort By
          </label>
          <select
            id="sort"
            v-model="sortBy"
            class="mt-1 block w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="releaseDateDesc">Release Date – Descending</option>
            <option value="releaseDateAsc">Release Date – Ascending</option>
            <option value="priceDesc">Price – Descending</option>
            <option value="priceAsc">Price – Ascending</option>
            <option value="rarity">Rarity (A→Z)</option>
            <option value="series">Series (A→Z)</option>
            <option value="set">Set (A→Z)</option>
            <option value="name">Name (A→Z, then Mint #)</option>
          </select>
        </div>

        <!-- Unique Toggle -->
        <div class="mt-4">
          <button
            @click="showUnique = !showUnique"
            class="w-full px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium"
          >
            {{ showUnique ? 'Show All cToons' : 'Show Unique cToons' }}
          </button>
        </div>
      </aside>

      <!-- TAB CONTENTS -->
      <div class="w-full lg:w-3/4">
        <!-- My Collection -->
        <div v-if="activeTab === 'MyCollection'">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- loading skeletons -->
            <template v-if="visibleUser === 0 && isLoadingUserCtoons">
              <div
                v-for="n in 6"
                :key="n"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
              >
                <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4"></div>
              </div>
            </template>

            <!-- user cToon cards -->
            <template v-else>
              <div
                v-for="uc in visibleAndFilteredUser"
                :key="uc.id"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <h2 class="text-xl font-semibold mb-2">{{ uc.name }}</h2>
                <div class="flex-grow flex items-center justify-center w-full mb-2">
                  <img loading="lazy" :src="uc.assetPath" class="max-w-full h-auto" />
                </div>
                <div class="text-sm text-center mb-2">
                  <p>
                    <span class="capitalize">{{ uc.series }}</span> •
                    <span class="capitalize">{{ uc.rarity }}</span> •
                    <span class="capitalize">{{ uc.set }}</span>
                  </p>
                </div>
                <div class="mt-auto text-sm text-center">
                  <p>Mint #{{ uc.mintNumber ?? 'N/A' }}</p>
                  <p v-if="uc.isFirstEdition" class="text-indigo-600 font-semibold">
                    First Edition
                  </p>
                </div>
                <div class="mt-auto flex space-x-2">
                  <AddToAuction
                    :userCtoon="uc"
                    :isOwner="uc.userId === user.id"
                    :hasActiveAuction="uc.auctions.length > 0"
                    @auctionCreated="loadMoreUser"
                  />
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- My Wishlist -->
        <div v-if="activeTab === 'MyWishlist'">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-if="isLoadingWishlist">
              <div
                v-for="n in 6"
                :key="n"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
              >
                <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4"></div>
              </div>
            </template>
            <template v-else>
              <div
                v-for="wc in filteredAndSortedWishlistCtoons"
                :key="wc.id"
                class="relative bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <!-- Owned / Un-owned badge -->
                <span
                  v-if="wc.isOwned"
                  class="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Owned
                </span>
                <span
                  v-else
                  class="absolute top-2 right-2 bg-gray-300 text-gray-700 text-xs font-semibold px-2 py-1 rounded"
                >
                  Un-owned
                </span>
                <h2 class="text-xl font-semibold mb-2 mt-6">{{ wc.name }}</h2>
                <div class="flex-grow flex items-center justify-center w-full mb-2">
                  <img loading="lazy" :src="wc.assetPath" class="max-w-full h-auto" />
                </div>
                <div class="text-sm text-center mb-2">
                  <p>
                    <span class="capitalize">{{ wc.series }}</span> •
                    <span class="capitalize">{{ wc.rarity }}</span> •
                    <span class="capitalize">{{ wc.set }}</span>
                  </p>
                </div>
                <AddToWishlist :ctoon-id="wc.id" class="mt-auto" />
              </div>
            </template>
          </div>
        </div>

        <!-- All Sets -->
        <div v-if="activeTab === 'AllSets'">
          <div
            v-for="setName in setsWithItems"
            :key="setName"
            class="mb-8"
          >
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ setName }}</h2>
              <p class="text-gray-700">
                {{ ownedCountBySet(setName) }} /
                {{ totalCountBySet(setName) }} owned
                ({{ percentageOwnedBySet(setName) }}%)
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <template v-if="visibleAll === 0 && isLoadingAllCtoons">
                <div
                  v-for="n in 6"
                  :key="n"
                  class="bg-white rounded-lg shadow p-4 animate-pulse"
                ></div>
              </template>
              <template v-else>
                <div
                  v-for="c in visibleAndFilteredAll"
                  :key="c.id"
                  v-show="c.set === setName"
                  class="relative bg-white rounded-lg shadow p-4 flex flex-col h-full"
                >
                  <span
                    v-if="c.isOwned"
                    class="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
                  >
                    Owned
                  </span>
                  <span
                    v-else
                    class="absolute top-2 right-2 bg-gray-300 text-gray-700 text-xs font-semibold px-2 py-1 rounded"
                  >
                    Un-owned
                  </span>
                  <h3 class="text-lg font-semibold mb-2 mt-6">{{ c.name }}</h3>
                  <div class="flex-grow flex items-center justify-center">
                    <img
                      loading="lazy"
                      :src="c.assetPath"
                      class="max-h-48 object-contain"
                      alt=""
                    />
                  </div>
                  <p class="text-sm mt-2 text-center">
                    {{ c.series }} • {{ c.rarity }}
                    <span class="block">
                      Highest Mint #: {{ c.highestMint }}
                    </span>
                  </p>
                  <div class="mt-2 flex justify-between items-center">
                    <AddToWishlist :ctoon-id="c.id" />
                    <button
                      class="bg-white border border-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-50"
                      @click="openOwners(c)"
                    >
                      View Owners
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- All Series -->
        <div v-if="activeTab === 'AllSeries'">
          <div
            v-for="seriesName in seriesWithItems"
            :key="seriesName"
            class="mb-8"
          >
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ seriesName }}</h2>
              <p class="text-gray-700">
                {{ ownedCountBySeries(seriesName) }} /
                {{ totalCountBySeries(seriesName) }} owned
                ({{ percentageOwnedBySeries(seriesName) }}%)
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <template v-if="visibleAll === 0 && isLoadingAllCtoons">
                <div
                  v-for="n in 6"
                  :key="n"
                  class="bg-white rounded-lg shadow p-4 animate-pulse"
                ></div>
              </template>
              <template v-else>
                <div
                  v-for="c in visibleAndFilteredAll"
                  :key="c.id"
                  v-show="c.series === seriesName"
                  class="relative bg-white rounded-lg shadow p-4 flex flex-col h-full"
                >
                  <span
                    v-if="c.isOwned"
                    class="absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded"
                  >
                    Owned
                  </span>
                  <span
                    v-else
                    class="absolute top-2 right-2 bg-gray-300 text-gray-700 text-xs font-semibold px-2 py-1 rounded"
                  >
                    Un-owned
                  </span>
                  <h3 class="text-lg font-semibold mb-2 mt-6">{{ c.name }}</h3>
                  <div class="flex-grow flex items-center justify-center">
                    <img
                      loading="lazy"
                      :src="c.assetPath"
                      class="max-h-48 object-contain"
                      alt=""
                    />
                  </div>
                  <p class="text-sm mt-2 text-center">
                    {{ c.set }} • {{ c.rarity }}
                    <span class="block">
                      Highest Mint #: {{ c.highestMint }}
                    </span>
                  </p>
                  <div class="mt-2 flex justify-between items-center">
                    <AddToWishlist :ctoon-id="c.id" />
                    <button
                      class="bg-white border border-gray-300 px-3 py-1 rounded text-sm hover:bg-gray-50"
                      @click="openOwners(c)"
                    >
                      View Owners
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Owners Side-Panel -->
   <transition name="fade">
    <div
      v-if="ownersPanelVisible"
      class="fixed inset-0 bg-black bg-opacity-50 z-40"
      @click="closeOwners"
    />
  </transition>
  
  <transition name="slide-panel">
    <div
      v-if="ownersPanelVisible"
      class="fixed top-0 right-0 h-full w-auto min-w-[450px] max-w-[85%] bg-white shadow-xl z-50 p-12 overflow-y-auto"
    >
      <button
        class="absolute top-3 right-3 text-gray-500 hover:text-black"
        @click="closeOwners"
      >✕</button>
      <h2 class="text-xl font-bold mb-4">
        Owners of {{ currentOwnersCtoon?.name }}
      </h2>
      <div v-if="ownersLoading" class="text-center py-6">Loading…</div>
      <ul v-else class="space-y-2">
        <li
          v-for="owner in sortedOwners"
          :key="owner.userId + '-' + owner.mintNumber"
          class="flex justify-between max-w-[250px] mx-auto"
        >
          <span class="text-sm text-gray-600">Mint #{{ owner.mintNumber }}</span>
          <NuxtLink
            :to="`/czone/${owner.username}`"
            class="text-indigo-600 hover:underline"
          >
            <span>{{ owner.username }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </transition>

</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuth } from '@/composables/useAuth'
import Nav from '@/components/Nav.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import AddToAuction from '@/components/AddToAuction.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const { user, fetchSelf } = useAuth()

// ─── STATE ────────────────────────────────────────────────────────────────────
const activeTab      = ref('MyCollection')
const showFilters    = ref(false)
const searchQuery    = ref('')
const showUnique     = ref(false)
const selectedSets   = ref([])
const selectedSeries = ref([])
const selectedRarities = ref([])
const selectedOwned  = ref('all')
const sortBy         = ref('releaseDateDesc')

const filterMeta       = ref({ sets: [], series: [], rarities: [] })

const allCtoons        = ref([])
const isLoadingAllCtoons = ref(false)
const visibleAll       = ref(0)

const userCtoons       = ref([])
const isLoadingUserCtoons = ref(false)
const visibleUser      = ref(0)

const wishlistCtoons   = ref([])
const isLoadingWishlist = ref(false)

const TAKE = 50

const ownersPanelVisible   = ref(false)
const ownersList           = ref([])
const ownersLoading        = ref(false)
const currentOwnersCtoon   = ref(null)

const sortedOwners = computed(() =>
  ownersList.value.slice().sort((a, b) => a.mintNumber - b.mintNumber)
)

async function openOwners(ctoon) {
  currentOwnersCtoon.value = ctoon
  ownersLoading.value      = true
  ownersPanelVisible.value = true
  try {
    const res = await $fetch(`/api/collections/owners?cToonId=${ctoon.id}`)
    // expect res = [{ userId, username, mintNumber }, …]
    ownersList.value = res
  } catch (err) {
    console.error('Failed to load owners', err)
    ownersList.value = []
  } finally {
    ownersLoading.value = false
  }
}

function closeOwners() {
  ownersPanelVisible.value = false
  ownersList.value         = []
  currentOwnersCtoon.value = null
}

// ─── COMPUTED: All cToons ──────────────────────────────────────────────────────
const filteredAllCtoons = computed(() => {
  return allCtoons.value.filter(c => {
    const nm = c.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(c.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(c.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(c.rarity)
    const o  = selectedOwned.value === 'all'
      ? true
      : selectedOwned.value === 'owned'
        ? c.isOwned
        : !c.isOwned
    return nm && sm && se && r && o
  })
})
const visibleAndFilteredAll = computed(() =>
  filteredAllCtoons.value.slice(0, visibleAll.value)
)

// ─── COMPUTED: My Collection ──────────────────────────────────────────────────
const filteredUserCtoons = computed(() =>
  userCtoons.value.filter(uc => {
    const nm = uc.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(uc.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(uc.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(uc.rarity)
    return nm && sm && se && r
  })
)
const filteredAndSortedUser = computed(() =>
  filteredUserCtoons.value
    .sort((a, b) => {
      switch (sortBy.value) {
        case 'releaseDateAsc':   return new Date(a.releaseDate) - new Date(b.releaseDate)
        case 'releaseDateDesc':  return new Date(b.releaseDate) - new Date(a.releaseDate)
        case 'priceAsc':         return a.price - b.price
        case 'priceDesc':        return b.price - a.price
        case 'rarity':           return a.rarity.localeCompare(b.rarity)
        case 'series':           return a.series.localeCompare(b.series)
        case 'set':              return a.set.localeCompare(b.set)
        case 'name': {
          const cmp = a.name.localeCompare(b.name)
          return cmp || ((a.mintNumber ?? 0) - (b.mintNumber ?? 0))
        }
        default: return 0
      }
    })
    .slice(0, visibleUser.value)
)

const visibleAndFilteredUser = filteredAndSortedUser

// ─── COMPUTED: Wishlist ────────────────────────────────────────────────────────
const filteredWishlistCtoons = computed(() =>
  wishlistCtoons.value.filter(wc => {
    const nm = wc.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(wc.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(wc.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(wc.rarity)
    return nm && sm && se && r
  })
)
const filteredAndSortedWishlistCtoons = computed(() =>
  filteredWishlistCtoons.value.sort((a, b) => {
    switch (sortBy.value) {
      case 'releaseDateAsc':   return new Date(a.releaseDate) - new Date(b.releaseDate)
      case 'releaseDateDesc':  return new Date(b.releaseDate) - new Date(a.releaseDate)
      case 'priceAsc':         return a.price - b.price
      case 'priceDesc':        return b.price - a.price
      case 'rarity':           return a.rarity.localeCompare(b.rarity)
      case 'series':           return a.series.localeCompare(b.series)
      case 'set':              return a.set.localeCompare(b.set)
      case 'name': {
        const cmp = a.name.localeCompare(b.name)
        return cmp || ((a.mintNumber ?? 0) - (b.mintNumber ?? 0))
      }
      default: return 0
    }
  })
)

// ─── TAB SWITCH & DATA LOADERS ─────────────────────────────────────────────────
function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'AllSets' || tab === 'AllSeries') {
    if (!allCtoons.value.length) loadAll()
    else visibleAll.value = TAKE
  }
  if (tab === 'MyCollection') {
    if (!userCtoons.value.length) loadUser()
    else visibleUser.value = TAKE
  }
  if (tab === 'MyWishlist') {
    loadWishlist()
  }
}
function loadMoreUser() {
  loadUser()
}

async function loadAll() {
  isLoadingAllCtoons.value = true
  allCtoons.value = await $fetch('/api/collections/all')
  visibleAll.value = TAKE
  isLoadingAllCtoons.value = false
}
async function loadUser() {
  isLoadingUserCtoons.value = true
  userCtoons.value = await $fetch('/api/collections')
  visibleUser.value = TAKE
  isLoadingUserCtoons.value = false
}
async function loadWishlist() {
  isLoadingWishlist.value = true
  wishlistCtoons.value = await $fetch('/api/wishlist')
  isLoadingWishlist.value = false
}

// ─── HELPERS: ownership stats ─────────────────────────────────────────────────
function totalCountBySet(setName) {
  return allCtoons.value.filter(c => c.set === setName).length
}
function ownedCountBySet(setName) {
  return allCtoons.value.filter(c => c.set === setName && c.isOwned).length
}
function percentageOwnedBySet(setName) {
  const t = totalCountBySet(setName)
  return t ? Math.round((ownedCountBySet(setName) / t) * 100) : 0
}
function totalCountBySeries(seriesName) {
  return allCtoons.value.filter(c => c.series === seriesName).length
}
function ownedCountBySeries(seriesName) {
  return allCtoons.value.filter(c => c.series === seriesName && c.isOwned).length
}
function percentageOwnedBySeries(seriesName) {
  const t = totalCountBySeries(seriesName)
  return t ? Math.round((ownedCountBySeries(seriesName) / t) * 100) : 0
}

// only show sets that have at least one cToon under them
const setsWithItems = computed(() =>
  filterMeta.value.sets.filter(setName =>
    filteredAllCtoons.value.some(c => c.set === setName)
  )
)

// only show series that have at least one cToon under them
const seriesWithItems = computed(() =>
  filterMeta.value.series.filter(seriesName =>
    filteredAllCtoons.value.some(c => c.series === seriesName)
  )
)

// ─── MOUNT & INFINITE SCROLL ─────────────────────────────────────────────────
onMounted(async () => {
  await fetchSelf()
  filterMeta.value = await $fetch('/api/collections/meta')
  loadUser()

  const onScroll = () => {
    const atBottom = window.innerHeight + window.scrollY + 100 >= document.body.offsetHeight
    if (!atBottom) return

    // All Sets / All Series
    if ((activeTab.value === 'AllSets' || activeTab.value === 'AllSeries') &&
        visibleAll.value < filteredAllCtoons.value.length) {
      visibleAll.value += TAKE
    }
    // My Collection (now compares against raw userCtoons)
    if (activeTab.value === 'MyCollection' &&
        visibleUser.value < userCtoons.value.length) {
      visibleUser.value += TAKE
    }
  }

  window.addEventListener('scroll', onScroll)
  onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
})
</script>

<style scoped>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background-color: rgba(107,114,128,0.5); border-radius: 3px; }
</style>
