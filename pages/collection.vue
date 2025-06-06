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

    <!-- ──────────── FILTER & SORT PANEL (collapsible on mobile) ──────────── -->
    <div class="lg:flex lg:gap-6">
      <!-- Toggle button on mobile -->
      <button
        class="lg:hidden mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
        @click="showFilters = !showFilters"
      >
        {{ showFilters ? 'Hide Filters' : 'Show Filters & Sort' }}
      </button>

      <!-- Sidebar: always visible on lg+, collapsible on sm -->
      <aside
        :class="[
          showFilters ? 'block' : 'hidden',
          'lg:block',
          'w-full lg:w-1/4',
          'bg-white rounded-lg shadow p-6'
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
              v-for="s in activeTab === 'MyCollection' ? uniqueUserSets : uniqueAllSets"
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
              v-for="ser in activeTab === 'MyCollection' ? uniqueUserSeries : uniqueAllSeries"
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
              v-for="r in activeTab === 'MyCollection' ? uniqueUserRarities : uniqueAllRarities"
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

        <!-- Filter by Owned / Un‐owned -->
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
              <span class="ml-2">Un‐owned Only</span>
            </label>
          </div>
        </div>

        <!-- Sort Select -->
        <div class="mt-6">
          <label for="sort" class="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
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
          </select>
        </div>
      </aside>

      <!-- ─────────────────── TAB CONTENTS ─────────────────── -->
      <div class="w-full lg:w-3/4">
        <!-- ─────────────────── My Collection ─────────────────── -->
        <div v-if="activeTab === 'MyCollection'">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- ─── initial loading skeletons (before first page) ─── -->
            <template v-if="pageUser === 0 && isLoadingUserCtoons">
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

            <!-- ─── actual UserCtoon cards ─── -->
            <template v-else>
              <div
                v-for="uc in filteredAndSortedUserCtoons"
                :key="uc.id"
                v-show="matchesUserFilters(uc)"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <h2 class="text-xl font-semibold mb-2">{{ uc.name }}</h2>
                <div class="flex-grow flex items-center justify-center w-full mb-2">
                  <img :src="uc.assetPath" class="max-w-full h-auto" />
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
              </div>

              <!-- ── “loading more” skeletons at bottom (pages ≥ 2) ── -->
              <template v-if="isLoadingMoreUser">
                <div
                  v-for="n in 3"
                  :key="`more-skel-${n}`"
                  class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
                >
                  <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                  <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4"></div>
                </div>
              </template>
            </template>
          </div>
        </div>

        <!-- ─────────────────── All Sets ─────────────────── -->
        <div v-if="activeTab === 'AllSets'">
          <div
            v-for="setName in filteredUniqueAllSets"
            :key="setName"
            class="mb-8"
          >
            <!-- Header: Set name and owned count -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ setName }}</h2>
              <p class="text-gray-700">
                {{ ownedCountBySet(setName) }} out of {{ totalCountBySet(setName) }} owned
                ({{ percentageOwnedBySet(setName) }}%)
              </p>
            </div>

            <!-- Grid of cToons in this set after filtering -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <!-- ─── initial loading skeletons (before first page) ─── -->
              <template v-if="pageAll === 0 && isLoadingAllCtoons">
                <div
                  v-for="n in 6"
                  :key="`init-skel-all-${n}`"
                  class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
                >
                  <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                  <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4"></div>
                </div>
              </template>

              <!-- ─── actual Ctoon cards for AllSets ─── -->
              <template v-else>
                <div
                  v-for="c in filteredAllCtoons"
                  :key="c.id"
                  v-show="c.set === setName && matchesAllFilters(c)"
                  class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full relative"
                >
                  <h3 class="text-lg font-semibold mb-2">{{ c.name }}</h3>
                  <div class="flex-grow flex items-center justify-center w-full mb-4">
                    <img :src="c.assetPath" class="max-w-full h-auto" />
                  </div>
                  <div class="text-sm text-center mb-2">
                    <p>
                      <span class="capitalize">{{ c.series }}</span> •
                      <span class="capitalize">{{ c.rarity }}</span>
                    </p>
                  </div>
                  <!-- Owned badge -->
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
                    Un‐owned
                  </span>
                </div>

                <!-- ── “loading more” skeletons at bottom (pages ≥ 2) ── -->
                <template v-if="isLoadingMoreAll">
                  <div
                    v-for="n in 3"
                    :key="`more-skel-all-${n}`"
                    class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
                  >
                    <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                    <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                    <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                    <div class="bg-gray-200 rounded w-1/2 h-4"></div>
                  </div>
                </template>
              </template>
            </div>
          </div>
        </div>

        <!-- ─────────────────── All Series ─────────────────── -->
        <div v-if="activeTab === 'AllSeries'">
          <div
            v-for="seriesName in filteredUniqueAllSeries"
            :key="seriesName"
            class="mb-8"
          >
            <!-- Header: Series name and owned count -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ seriesName }}</h2>
              <p class="text-gray-700">
                {{ ownedCountBySeries(seriesName) }} out of {{ totalCountBySeries(seriesName) }} owned
                ({{ percentageOwnedBySeries(seriesName) }}%)
              </p>
            </div>

            <!-- Grid of cToons in this series after filtering -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <!-- ─── initial loading skeletons (before first page) ─── -->
              <template v-if="pageAll === 0 && isLoadingAllCtoons">
                <div
                  v-for="n in 6"
                  :key="`init-skel-ser-${n}`"
                  class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
                >
                  <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                  <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4"></div>
                </div>
              </template>

              <!-- ─── actual Ctoon cards for AllSeries ─── -->
              <template v-else>
                <div
                  v-for="c in filteredAllCtoons"
                  :key="c.id"
                  v-show="c.series === seriesName && matchesAllFilters(c)"
                  class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full relative"
                >
                  <h3 class="text-lg font-semibold mb-2">{{ c.name }}</h3>
                  <div class="flex-grow flex items-center justify-center w-full mb-4">
                    <img :src="c.assetPath" class="max-w-full h-auto" />
                  </div>
                  <div class="text-sm text-center mb-2">
                    <p>
                      <span class="capitalize">{{ c.set }}</span> •
                      <span class="capitalize">{{ c.rarity }}</span>
                    </p>
                  </div>
                  <!-- Owned badge -->
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
                    Un‐owned
                  </span>
                </div>

                <!-- ── “loading more” skeletons at bottom (pages ≥ 2) ── -->
                <template v-if="isLoadingMoreAll">
                  <div
                    v-for="n in 3"
                    :key="`more-skel-ser-${n}`"
                    class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse"
                  >
                    <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                    <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                    <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                    <div class="bg-gray-200 rounded w-1/2 h-4"></div>
                  </div>
                </template>
              </template>
            </div>
          </div>
        </div>
      </div> <!-- /.lg:w-3/4 -->
    </div> <!-- /.lg:flex -->
  </div> <!-- /.max-w-7xl -->
</template>

<script setup>
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { useAuth }      from '@/composables/useAuth'
import Toast            from '@/components/Toast.vue'
import Nav              from '@/components/Nav.vue'

/***** AUTH & USER *****/
const { user, fetchSelf } = useAuth()

/***** TABS *****/
const activeTab = ref('MyCollection')
function switchTab(tab) {
  activeTab.value = tab
  // Immediately load page 1 for AllSets/AllSeries when first clicked
  if ((tab === 'AllSets' || tab === 'AllSeries') && pageAll.value === 0) {
    loadMoreAll()
  }
  // Immediately load page 1 for MyCollection if not yet loaded
  if (tab === 'MyCollection' && pageUser.value === 0) {
    loadMoreUser()
  }
}

/***** TOAST HELPER *****/
const toastMessage = ref('')
const toastType    = ref('error')
function showToast(msg, type = 'error') {
  toastType.value    = type
  toastMessage.value = msg
  setTimeout(() => {
    toastMessage.value = ''
  }, 5000)
}

/***** FILTER / SORT STATE *****/
const showFilters      = ref(false)
const searchQuery      = ref('')
const selectedSets     = ref([])
const selectedSeries   = ref([])
const selectedRarities = ref([])
const selectedOwned    = ref('all')   // 'all' | 'owned' | 'unowned'
const sortBy           = ref('releaseDateDesc')

/***** “ALL CTOONS” (AllSets / AllSeries) INFINITE‐SCROLL *****/
const allCtoons           = ref([])       // accumulated pages
const pageAll             = ref(0)        // 0 = not loaded; 1,2,3…
const isLoadingAllCtoons  = ref(false)    // loading initial page
const isLoadingMoreAll    = ref(false)    // loading subsequent pages
const noMoreAll           = ref(false)    // reached empty response

/*** “USER CTOONS” (MyCollection) INFINITE‐SCROLL ***/
const userCtoons           = ref([])      // accumulated pages
const pageUser             = ref(0)
const isLoadingUserCtoons  = ref(false)
const isLoadingMoreUser    = ref(false)
const noMoreUser           = ref(false)

/***** PAGINATION PARAMETERS *****/
const TAKE = 25 // always fetch 25 at a time

/***** DERIVE FILTER OPTIONS FROM userCtoons (for MyCollection) *****/
const uniqueUserSets = computed(() => {
  const s = new Set()
  userCtoons.value.forEach((uc) => {
    if (uc.set) s.add(uc.set)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const uniqueUserSeries = computed(() => {
  const s = new Set()
  userCtoons.value.forEach((uc) => {
    if (uc.series) s.add(uc.series)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const uniqueUserRarities = computed(() => {
  const r = new Set()
  userCtoons.value.forEach((uc) => {
    if (uc.rarity) r.add(uc.rarity)
  })
  return Array.from(r).sort((a, b) => a.localeCompare(b))
})

/***** DERIVE FILTER OPTIONS FROM allCtoons (for AllSets / AllSeries) *****/
const uniqueAllSets = computed(() => {
  const s = new Set()
  allCtoons.value.forEach((c) => {
    if (c.set) s.add(c.set)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const uniqueAllSeries = computed(() => {
  const s = new Set()
  allCtoons.value.forEach((c) => {
    if (c.series) s.add(c.series)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
const uniqueAllRarities = computed(() => {
  const r = new Set()
  allCtoons.value.forEach((c) => {
    if (c.rarity) r.add(c.rarity)
  })
  return Array.from(r).sort((a, b) => {
    const iA = RARITY_ORDER.indexOf(a),
      iB = RARITY_ORDER.indexOf(b)
    if (iA !== -1 && iB !== -1) return iA - iB
    if (iA !== -1 && iB === -1) return -1
    if (iA === -1 && iB !== -1) return 1
    return a.localeCompare(b)
  })
})

/***** FILTERED & SORTED “ALL CTOONS” (after accumulation) *****/
const filteredAllCtoons = computed(() => {
  return allCtoons.value.filter((c) => {
    const nameMatch = c.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const setMatch = selectedSets.value.length === 0 || selectedSets.value.includes(c.set)
    const seriesMatch =
      selectedSeries.value.length === 0 || selectedSeries.value.includes(c.series)
    const rarityMatch =
      selectedRarities.value.length === 0 || selectedRarities.value.includes(c.rarity)

    let ownedMatch = true
    if (selectedOwned.value === 'owned') {
      ownedMatch = c.isOwned
    } else if (selectedOwned.value === 'unowned') {
      ownedMatch = !c.isOwned
    }
    return nameMatch && setMatch && seriesMatch && rarityMatch && ownedMatch
  })
})

// Helpers for “AllSets”
const filteredUniqueAllSets = computed(() => {
  const s = new Set()
  filteredAllCtoons.value.forEach((c) => {
    if (c.set) s.add(c.set)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const filteredUniqueAllSeries = computed(() => {
  const s = new Set()
  filteredAllCtoons.value.forEach((c) => {
    if (c.series) s.add(c.series)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
function filteredCtoonsInSet(setName) {
  return filteredAllCtoons.value.filter((c) => c.set === setName)
}
function ownedCountBySet(setName) {
  return filteredCtoonsInSet(setName).filter((c) => c.isOwned).length
}
function totalCountBySet(setName) {
  return filteredCtoonsInSet(setName).length
}
function percentageOwnedBySet(setName) {
  const tot = totalCountBySet(setName)
  return tot === 0 ? 0 : Math.round((ownedCountBySet(setName) / tot) * 100)
}

// Helpers for “AllSeries”
function filteredCtoonsInSeries(seriesName) {
  return filteredAllCtoons.value.filter((c) => c.series === seriesName)
}
function ownedCountBySeries(seriesName) {
  return filteredCtoonsInSeries(seriesName).filter((c) => c.isOwned).length
}
function totalCountBySeries(seriesName) {
  return filteredCtoonsInSeries(seriesName).length
}
function percentageOwnedBySeries(seriesName) {
  const tot = totalCountBySeries(seriesName)
  return tot === 0 ? 0 : Math.round((ownedCountBySeries(seriesName) / tot) * 100)
}
// The computed itself has already applied the filters above, so matchesAllFilters can just return true
function matchesAllFilters(c) {
  return true
}

/***** FILTERED & SORTED “USER CTOONS” (after accumulation) *****/
const filteredUserCtoons = computed(() => {
  return userCtoons.value.filter((uc) => {
    const nameMatch = uc.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const setMatch = selectedSets.value.length === 0 || selectedSets.value.includes(uc.set)
    const seriesMatch =
      selectedSeries.value.length === 0 || selectedSeries.value.includes(uc.series)
    const rarityMatch =
      selectedRarities.value.length === 0 || selectedRarities.value.includes(uc.rarity)

    // Everything here is owned. If “unowned” is selected, filter out all.
    let ownedMatch = true
    if (selectedOwned.value === 'owned') {
      ownedMatch = true
    } else if (selectedOwned.value === 'unowned') {
      ownedMatch = false
    }

    return nameMatch && setMatch && seriesMatch && rarityMatch && ownedMatch
  })
})
const filteredAndSortedUserCtoons = computed(() => {
  const list = filteredUserCtoons.value.slice()
  switch (sortBy.value) {
    case 'releaseDateAsc':
      return list.sort(
        (a, b) => new Date(a.releaseDate) - new Date(b.releaseDate)
      )
    case 'releaseDateDesc':
      return list.sort(
        (a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)
      )
    case 'priceAsc':
      return list.sort((a, b) => a.price - b.price)
    case 'priceDesc':
      return list.sort((a, b) => b.price - a.price)
    case 'rarity':
      return list.sort((a, b) => a.rarity.localeCompare(b.rarity))
    case 'series':
      return list.sort((a, b) => a.series.localeCompare(b.series))
    case 'set':
      return list.sort((a, b) => a.set.localeCompare(b.set))
    default:
      return list.sort(
        (a, b) => new Date(b.releaseDate) - new Date(a.releaseDate)
      )
  }
})
// All items in userCtoons are owned; matchesUserFilters just returns true
function matchesUserFilters(uc) {
  return true
}

/***** SCROLL HANDLER FOR INFINITE‐SCROLL *****/
function onScroll() {
  const scrolledToBottom =
    window.innerHeight + window.scrollY + 100 >= document.body.offsetHeight
  if (!scrolledToBottom) return

  if (activeTab.value === 'MyCollection') {
    if (
      !isLoadingUserCtoons.value &&
      !isLoadingMoreUser.value &&
      !noMoreUser.value
    ) {
      loadMoreUser()
    }
  } else if (
    activeTab.value === 'AllSets' ||
    activeTab.value === 'AllSeries'
  ) {
    if (
      !isLoadingAllCtoons.value &&
      !isLoadingMoreAll.value &&
      !noMoreAll.value
    ) {
      loadMoreAll()
    }
  }
}

onMounted(async () => {
  await fetchSelf()

  // 1) If the initial activeTab is “MyCollection”, load its first page immediately
  if (activeTab.value === 'MyCollection') {
    loadMoreUser()
  } else {
    // If you prefer to preload AllSets/AllSeries on mount, call loadMoreAll() here
  }

  // 2) Attach scroll listener once
  window.addEventListener('scroll', onScroll)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
})

/***** FUNCTIONS TO FETCH NEXT PAGE *****/
async function loadMoreUser() {
  // If pageUser.value === 0 → that means “first page” loading
  if (pageUser.value === 0) {
    isLoadingUserCtoons.value = true
  } else {
    isLoadingMoreUser.value = true
  }
  const nextPage = pageUser.value + 1

  try {
    const res = await $fetch(`/api/collections?page=${nextPage}`)
    if (Array.isArray(res) && res.length > 0) {
      userCtoons.value.push(...res)
      pageUser.value = nextPage
      if (res.length < TAKE) {
        noMoreUser.value = true
      }
    } else {
      noMoreUser.value = true
    }
  } catch (err) {
    console.error('Failed to fetch user ctoons page ' + nextPage, err)
    showToast('Failed to load more of your collection')
  } finally {
    isLoadingUserCtoons.value = false
    isLoadingMoreUser.value = false
  }
}

async function loadMoreAll() {
  // If pageAll.value === 0 → initial load; else loading more
  if (pageAll.value === 0) {
    isLoadingAllCtoons.value = true
  } else {
    isLoadingMoreAll.value = true
  }
  const nextPage = pageAll.value + 1

  try {
    const res = await $fetch(`/api/collections/all?page=${nextPage}`)
    if (Array.isArray(res) && res.length > 0) {
      allCtoons.value.push(...res)
      pageAll.value = nextPage
      if (res.length < TAKE) {
        noMoreAll.value = true
      }
    } else {
      noMoreAll.value = true
    }
  } catch (err) {
    console.error('Failed to fetch all ctoons page ' + nextPage, err)
    showToast('Failed to load more cToons')
  } finally {
    isLoadingAllCtoons.value = false
    isLoadingMoreAll.value = false
  }
}

/***** WATCH FILTERS (no refetch needed—they update computed lists) *****/
watch(
  [searchQuery, selectedSets, selectedSeries, selectedRarities, selectedOwned, sortBy],
  () => {
    // Filtering and sorting happen in the computed properties above,
    // so we do not need to re‐fetch anything here.
  }
)
</script>

<style scoped>
/* shorten scrollbar track for filter lists */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(107, 114, 128, 0.5);
  border-radius: 3px;
}
</style>
