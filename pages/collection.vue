<template>
  <Nav />

  <div class="mt-20 md:pt-10 px-4 py-6 max-w-7xl mx-auto">
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
         :disabled="isLoadingWishlist"
         :class="[
           activeTab === 'MyWishlist'
             ? 'border-b-2 border-indigo-600 text-indigo-600'
             : 'border-transparent text-gray-500 hover:text-gray-700',
           isLoadingWishlist && 'cursor-not-allowed opacity-50'
         ]"
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

        <!-- Duplicates Only (applies to My Collection) -->
        <div class="mb-4">
          <p class="text-sm font-medium text-gray-700 mb-2">Duplicates</p>
          <label class="flex items-center text-sm">
            <input
              type="checkbox"
              v-model="duplicatesOnly"
              class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span class="ml-2">Show duplicates only</span>
          </label>
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
            <template v-if="isLoadingUserCtoons && pagedUser.length === 0">
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
                v-for="uc in pagedUser"
                :key="uc.id"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <h2 class="text-xl font-semibold mb-2">{{ uc.name }}</h2>
                <div class="flex-grow flex items-center justify-center w-full mb-2">
                  <ProgressiveImage
                    :src="uc.assetPath"
                    alt=""
                    image-class="max-w-full h-auto"
                    placeholder-height="8rem"
                  />
                </div>
                <div class="text-sm text-center mb-2">
                  <p>
                    <span class="capitalize">{{ uc.series }}</span> •
                    <span class="capitalize">{{ uc.rarity }}</span> •
                    <span class="capitalize">{{ uc.set }}</span>
                  </p>
                </div>
                <div class="mt-auto text-sm text-center">
                  <p v-if="!uc.isHolidayItem">Mint #{{ uc.mintNumber ?? 'N/A' }}</p>
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

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageUser === 1"
              @click="prevUserPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageUser }} of {{ totalPagesUser }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageUser === totalPagesUser"
              @click="nextUserPage()"
            >
              Next Page
            </button>
          </div>
        </div>

        <!-- My Wishlist -->
        <div v-if="activeTab === 'MyWishlist'">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-if="isLoadingWishlist && pagedWishlist.length === 0">
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
                v-for="wc in pagedWishlist"
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
                  <ProgressiveImage
                    :src="wc.assetPath"
                    alt=""
                    image-class="max-w-full h-auto"
                    placeholder-height="8rem"
                  />
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

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageWishlist === 1"
              @click="prevWishlistPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageWishlist }} of {{ totalPagesWishlist }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageWishlist === totalPagesWishlist"
              @click="nextWishlistPage()"
            >
              Next Page
            </button>
          </div>
        </div>

        <!-- All Sets -->
        <div v-if="activeTab === 'AllSets'">
          <div
            v-for="setName in pageSetsWithItems"
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
              <template v-if="isLoadingAllCtoons && pagedAll.length === 0">
                <div
                  v-for="n in 6"
                  :key="n"
                  class="bg-white rounded-lg shadow p-4 animate-pulse"
                ></div>
              </template>
              <template v-else>
                <div
                  v-for="c in itemsInSetSorted(setName)"
                  :key="c.id"
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
                    <ProgressiveImage
                      :src="c.assetPath"
                      alt=""
                      image-class="max-h-48 object-contain"
                      placeholder-height="8rem"
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

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === 1"
              @click="prevAllPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageAll }} of {{ totalPagesAll }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === totalPagesAll"
              @click="nextAllPage()"
            >
              Next Page
            </button>
          </div>
        </div>

        <!-- All Series -->
        <div v-if="activeTab === 'AllSeries'">
          <div
            v-for="seriesName in pageSeriesWithItems"
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
              <template v-if="isLoadingAllCtoons && pagedAll.length === 0">
                <div
                  v-for="n in 6"
                  :key="n"
                  class="bg-white rounded-lg shadow p-4 animate-pulse"
                ></div>
              </template>
              <template v-else>
                <div
                  v-for="c in itemsInSeriesSorted(seriesName)"
                  :key="c.id"
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
                    <ProgressiveImage
                      :src="c.assetPath"
                      alt=""
                      image-class="max-h-48 object-contain"
                      placeholder-height="8rem"
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

          <!-- Pager -->
          <div class="mt-6 flex items-center justify-center gap-4">
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === 1"
              @click="prevAllPage()"
            >
              Previous Page
            </button>
            <span class="text-sm">Page {{ pageAll }} of {{ totalPagesAll }}</span>
            <button
              class="bg-white border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
              :disabled="pageAll === totalPagesAll"
              @click="nextAllPage()"
            >
              Next Page
            </button>
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
          <span v-if="!owner.isHolidayItem" class="text-sm text-gray-600">Mint #{{ owner.mintNumber }}</span>
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
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useAuth } from '@/composables/useAuth'
import Nav from '@/components/Nav.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import AddToAuction from '@/components/AddToAuction.vue'
import ProgressiveImage from '@/components/ProgressiveImage.vue'

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
const sortBy         = ref('name') // default: Name A→Z, then Mint #
const duplicatesOnly = ref(false)  // My Collection: only show duplicate holdings

const filterMeta       = ref({ sets: [], series: [], rarities: [] })

const allCtoons        = ref([])
const isLoadingAllCtoons = ref(false)

const userCtoons       = ref([])
const isLoadingUserCtoons = ref(false)

const wishlistCtoons   = ref([])
const isLoadingWishlist = ref(false)
const hasLoadedWishlist = ref(false)

// Pagination
const PAGE_SIZE   = 18
const pageUser    = ref(1)
const pageAll     = ref(1)
const pageWishlist= ref(1)

// Owners panel
const ownersPanelVisible   = ref(false)
const ownersList           = ref([])
const ownersLoading        = ref(false)
const currentOwnersCtoon   = ref(null)

// ─── ROUTE QUERY SYNC ─────────────────────────────────────────────────────────
const route  = useRoute()
const router = useRouter()

function normalizeListParam(v) {
  if (Array.isArray(v)) return v.filter(Boolean)
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function updateUrlQueryFromFilters() {
  const newQuery = { ...route.query }

  const q = String(searchQuery.value || '').trim()
  if (q) newQuery.q = q; else delete newQuery.q

  if (selectedSets.value.length) newQuery.set = selectedSets.value
  else delete newQuery.set

  if (selectedSeries.value.length) newQuery.series = selectedSeries.value
  else delete newQuery.series

  if (selectedRarities.value.length) newQuery.rarity = selectedRarities.value
  else delete newQuery.rarity

  if (selectedOwned.value && selectedOwned.value !== 'all') newQuery.owned = selectedOwned.value
  else delete newQuery.owned

  if (sortBy.value && sortBy.value !== 'name') newQuery.sort = sortBy.value
  else delete newQuery.sort

  // My Collection: duplicates-only toggle
  if (duplicatesOnly.value) newQuery.dupes = '1'; else delete newQuery.dupes

  const current = JSON.stringify(route.query)
  const next    = JSON.stringify(newQuery)
  if (current !== next) router.replace({ path: route.path, query: newQuery })
}

// collections.vue <script setup> — add helpers near top of sort code
function sortCmp(a, b, { useMintTie = false } = {}) {
  const getTimeAsc  = v => v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER
  const getTimeDesc = v => v ? new Date(v).getTime() : -Number.MAX_SAFE_INTEGER
  const numAsc  = (x,y) => (x ?? Number.POSITIVE_INFINITY) - (y ?? Number.POSITIVE_INFINITY)
  const numDesc = (x,y) => (y ?? Number.NEGATIVE_INFINITY) - (x ?? Number.NEGATIVE_INFINITY)

  switch (sortBy.value) {
    case 'releaseDateAsc':  return getTimeAsc(a.releaseDate)  - getTimeAsc(b.releaseDate)
    case 'releaseDateDesc': return getTimeDesc(b.releaseDate) - getTimeDesc(a.releaseDate)
    case 'priceAsc':        return numAsc(a.price, b.price)
    case 'priceDesc':       return numDesc(a.price, b.price)
    case 'rarity': {
      const cmp = (a.rarity || '').localeCompare(b.rarity || '')
      return cmp || (a.name || '').localeCompare(b.name || '')
    }
    case 'series': {
      const cmp = (a.series || '').localeCompare(b.series || '')
      return cmp || (a.name || '').localeCompare(b.name || '')
    }
    case 'set': {
      const cmp = (a.set || '').localeCompare(b.set || '')
      return cmp || (a.name || '').localeCompare(b.name || '')
    }
    case 'name':
    default: {
      const cmp = (a.name || '').localeCompare(b.name || '')
      if (!cmp && useMintTie) return (a.mintNumber ?? 0) - (b.mintNumber ?? 0)
      return cmp
    }
  }
}

const sortedOwners = computed(() =>
  ownersList.value.slice().sort((a, b) => a.mintNumber - b.mintNumber)
)

async function openOwners(ctoon) {
  currentOwnersCtoon.value = ctoon
  ownersLoading.value      = true
  ownersPanelVisible.value = true
  try {
    const res = await $fetch(`/api/collections/owners?cToonId=${ctoon.id}`)
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

// ─── COMPUTED: All cToons ─────────────────────────────────────────────────────
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
const sortedAll = computed(() =>
  filteredAllCtoons.value.slice().sort((a, b) => sortCmp(a, b))
)
const totalPagesAll = computed(() =>
  Math.max(1, Math.ceil(sortedAll.value.length / PAGE_SIZE))
)
const pagedAll = computed(() => {
  const start = (pageAll.value - 1) * PAGE_SIZE
  return sortedAll.value.slice(start, start + PAGE_SIZE)
})

// Sets/Series present on the current page only
const pageSetsWithItems = computed(() =>
  Array.from(new Set(pagedAll.value.map(c => c.set))).filter(Boolean)
)
const pageSeriesWithItems = computed(() =>
  Array.from(new Set(pagedAll.value.map(c => c.series))).filter(Boolean)
)

// ─── SORTED GROUP HELPERS FOR ALL TABS ────────────────────────────────────────
function itemsInSetSorted(setName) {
  return pagedAll.value.filter(x => x.set === setName).slice().sort((a,b) => sortCmp(a,b))
}
function itemsInSeriesSorted(seriesName) {
  return pagedAll.value.filter(x => x.series === seriesName).slice().sort((a,b) => sortCmp(a,b))
}

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
const sortedUserAll = computed(() =>
  filteredUserCtoons.value.slice().sort((a, b) => sortCmp(a, b, { useMintTie: true }))
)
const totalPagesUser = computed(() =>
  Math.max(1, Math.ceil(sortedUserAll.value.length / PAGE_SIZE))
)
const pagedUser = computed(() => {
  const start = (pageUser.value - 1) * PAGE_SIZE
  return sortedUserAll.value.slice(start, start + PAGE_SIZE)
})

// ─── COMPUTED: Wishlist ───────────────────────────────────────────────────────
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
  filteredWishlistCtoons.value.slice().sort((a, b) => sortCmp(a, b))
)
const totalPagesWishlist = computed(() =>
  Math.max(1, Math.ceil(filteredAndSortedWishlistCtoons.value.length / PAGE_SIZE))
)
const pagedWishlist = computed(() => {
  const start = (pageWishlist.value - 1) * PAGE_SIZE
  return filteredAndSortedWishlistCtoons.value.slice(start, start + PAGE_SIZE)
})

// ─── HELPERS: ownership stats ────────────────────────────────────────────────
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

// ─── TAB SWITCH & DATA LOADERS ────────────────────────────────────────────────
function switchTab(tab) {
  activeTab.value = tab

  if (tab === 'MyCollection') {
    if (!userCtoons.value.length) loadUser()
    pageUser.value = 1
  } else if (tab === 'MyWishlist') {
    if (!wishlistCtoons.value.length && !isLoadingWishlist.value) loadWishlist()
    pageWishlist.value = 1
  } else if (tab === 'AllSets' || tab === 'AllSeries') {
    if (!allCtoons.value.length) loadAll()
    pageAll.value = 1
  }
}
function loadMoreUser() {
  loadUser()
}

async function loadAll() {
  isLoadingAllCtoons.value = true
  try {
    allCtoons.value = await $fetch('/api/collections/all')
  } finally {
    isLoadingAllCtoons.value = false
  }
}
async function loadUser() {
  isLoadingUserCtoons.value = true
  try {
    const qs = duplicatesOnly.value ? '?duplicatesOnly=1' : ''
    userCtoons.value = await $fetch(`/api/collections${qs}`)
  } finally {
    isLoadingUserCtoons.value = false
  }
}
async function loadWishlist() {
  if (isLoadingWishlist.value || hasLoadedWishlist.value) return
  isLoadingWishlist.value = true
  try {
    wishlistCtoons.value = await $fetch('/api/wishlist')
    hasLoadedWishlist.value = true
  } finally {
    isLoadingWishlist.value = false
  }
}

// Reset page when filters or sort change
watch([searchQuery, selectedSets, selectedSeries, selectedRarities, selectedOwned], () => {
  if (activeTab.value === 'MyCollection') pageUser.value = 1
  if (activeTab.value === 'MyWishlist') pageWishlist.value = 1
  if (activeTab.value === 'AllSets' || activeTab.value === 'AllSeries') pageAll.value = 1
  updateUrlQueryFromFilters()
}, { deep: true })
watch(sortBy, () => {
  if (activeTab.value === 'MyCollection') pageUser.value = 1
  if (activeTab.value === 'MyWishlist') pageWishlist.value = 1
  if (activeTab.value === 'AllSets' || activeTab.value === 'AllSeries') pageAll.value = 1
  updateUrlQueryFromFilters()
})

// Reload user items when duplicates-only changes
watch(duplicatesOnly, () => {
  if (activeTab.value === 'MyCollection') {
    pageUser.value = 1
    updateUrlQueryFromFilters()
    loadUser()
  } else {
    updateUrlQueryFromFilters()
  }
})

// ─── MOUNT ────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await fetchSelf()
  filterMeta.value = await $fetch('/api/collections/meta')

  // Initialize from URL query (supports repeated params or comma-separated)
  const qParam      = typeof route.query.q === 'string' ? route.query.q : ''
  const setParam    = route.query.set ?? route.query.sets
  const seriesParam = route.query.series
  const rarityParam = route.query.rarity
  const ownedParam  = typeof route.query.owned === 'string' ? route.query.owned : ''
  const sortParam   = typeof route.query.sort === 'string' ? route.query.sort : ''
  const dupesParam  = typeof route.query.dupes === 'string' ? route.query.dupes : ''

  if (qParam.trim()) searchQuery.value = qParam.trim()

  const initSets     = normalizeListParam(setParam)
  const initSeries   = normalizeListParam(seriesParam)
  const initRarities = normalizeListParam(rarityParam)
  if (initSets.length)     selectedSets.value = initSets
  if (initSeries.length)   selectedSeries.value = initSeries
  if (initRarities.length) selectedRarities.value = initRarities

  if (['all','owned','unowned'].includes(ownedParam)) selectedOwned.value = ownedParam

  const validSorts = ['releaseDateDesc','releaseDateAsc','priceDesc','priceAsc','rarity','series','set','name']
  if (validSorts.includes(sortParam)) sortBy.value = sortParam

  if (['1', 'true'].includes(dupesParam.toLowerCase ? dupesParam.toLowerCase() : dupesParam)) {
    duplicatesOnly.value = true
  }

  // Normalize URL now to reflect initialized values
  updateUrlQueryFromFilters()

  loadUser()
})

// Scroll helpers for pagination
function scrollToTop () {
  if (typeof window === 'undefined') return
  // Wait for DOM update, then scroll immediately and fire a scroll event
  nextTick().then(() => {
    requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch { window.scrollTo(0, 0) }
      window.dispatchEvent(new Event('scroll'))
    })
  })
}
function prevUserPage () {
  if (pageUser.value > 1) { pageUser.value--; scrollToTop() }
}
function nextUserPage () {
  if (pageUser.value < totalPagesUser.value) { pageUser.value++; scrollToTop() }
}
function prevWishlistPage () {
  if (pageWishlist.value > 1) { pageWishlist.value--; scrollToTop() }
}
function nextWishlistPage () {
  if (pageWishlist.value < totalPagesWishlist.value) { pageWishlist.value++; scrollToTop() }
}
function prevAllPage () {
  if (pageAll.value > 1) { pageAll.value--; scrollToTop() }
}
function nextAllPage () {
  if (pageAll.value < totalPagesAll.value) { pageAll.value++; scrollToTop() }
}
</script>

<style scoped>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background-color: rgba(107,114,128,0.5); border-radius: 3px; }
</style>
