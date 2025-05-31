<template>
  <Nav />

  <div class="pt-16 px-4 py-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">My Collections</h1>

    <!-- ─────────────────── TABS ─────────────────── -->
    <div class="mb-6 flex items-center border-b border-gray-300">
      <div class="flex space-x-4">
        <button
          @click="activeTab = 'MyCollection'"
          :class="activeTab === 'MyCollection'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          My Collection
        </button>
        <button
          @click="activeTab = 'AllSets'"
          :class="activeTab === 'AllSets'
            ? 'border-b-2 border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          class="px-4 py-2 -mb-px text-sm font-medium"
        >
          All Sets
        </button>
        <button
          @click="activeTab = 'AllSeries'"
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
              v-for="s in uniqueAllSets"
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
              v-for="ser in uniqueAllSeries"
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
              v-for="r in uniqueAllRarities"
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
            <div
              v-for="uc in pagedUserCtoons"
              :key="uc.ctoon.id"
              class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
            >
              <h2 class="text-xl font-semibold mb-2">{{ uc.ctoon.name }}</h2>
              <div class="flex-grow flex items-center justify-center w-full mb-4">
                <img :src="uc.ctoon.assetPath" class="max-w-full h-auto" />
              </div>
              <div class="mt-auto text-sm text-center">
                <p>
                  <span class="capitalize">{{ uc.ctoon.series }}</span> •
                  <span class="capitalize">{{ uc.ctoon.rarity }}</span> •
                  <span class="capitalize">{{ uc.ctoon.set }}</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Pagination for My Collection -->
          <div class="mt-8 flex justify-center gap-4">
            <button
              @click="currentPage--"
              :disabled="currentPage === 1"
              class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              @click="currentPage++"
              :disabled="(currentPage * itemsPerPage) >= filteredAndSortedUserCtoons.length"
              class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
            >
              Next
            </button>
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
              <div
                v-for="c in filteredCtoonsInSet(setName)"
                :key="c.id"
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
              <div
                v-for="c in filteredCtoonsInSeries(seriesName)"
                :key="c.id"
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
            </div>
          </div>
        </div>
      </div> <!-- /.lg:w-3/4 -->
    </div> <!-- /.lg:flex -->
  </div> <!-- /.max-w-7xl -->
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth }      from '@/composables/useAuth'
import Toast            from '@/components/Toast.vue'
import Nav              from '@/components/Nav.vue'

// ─────────── AUTH & USER ─────────────────────────
const { user, fetchSelf } = useAuth()

// ─────────── TABS ────────────────────────────────
const activeTab = ref('MyCollection')

// ─────────── TOAST HELPER ────────────────────────
const toastMessage = ref('')
const toastType    = ref('error')
function showToast(msg, type = 'error') {
  toastType.value    = type
  toastMessage.value = msg
  setTimeout(() => {
    toastMessage.value = ''
  }, 5000)
}

// ─────────── STATE: ALL CTOONS ───────────────────
const allCtoons = ref([])   // Will hold every Ctoon + its isOwned boolean

// ─────────── FILTER / SORT STATE ────────────────
const showFilters      = ref(false)
const searchQuery      = ref('')
const selectedSets     = ref([])
const selectedSeries   = ref([])
const selectedRarities = ref([])
const selectedOwned    = ref('all')   // 'all' | 'owned' | 'unowned'
const sortBy           = ref('releaseDateDesc')

// ─────────── PAGINATION (My Collection) ─────────
const currentPage  = ref(1)
const itemsPerPage = 50

// ─────────── DERIVE USER’S OWNED CTOONS ───────────
const userCtoons = computed(() => {
  return allCtoons.value
    .filter(c => c.isOwned)
    .map(c => ({ ctoon: c }))
})

// ─────────── FILTER OPTIONS (OWNED CTOONS) ─────────
const uniqueUserSets = computed(() => {
  const s = new Set()
  userCtoons.value.forEach(uc => {
    if (uc.ctoon.set) s.add(uc.ctoon.set)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const uniqueUserSeries = computed(() => {
  const s = new Set()
  userCtoons.value.forEach(uc => s.add(uc.ctoon.series))
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const uniqueUserRarities = computed(() => {
  const r = new Set()
  userCtoons.value.forEach(uc => r.add(uc.ctoon.rarity))
  return Array.from(r).sort((a, b) => a.localeCompare(b))
})

const uniqueAllSets = computed(() => {
  const s = new Set()
  allCtoons.value.forEach(c => {
    if (c.set) s.add(c.set)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})

// Derive “all series” from the full list of cToons
const uniqueAllSeries = computed(() => {
  const s = new Set()
  allCtoons.value.forEach(c => {
    if (c.series) s.add(c.series)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})

const RARITY_ORDER = [
  'Common',
  'Uncommon',
  'Rare',
  'Very Rare',
  'Crazy Rare'
]

// 2) Replace whatever you had with something like this:
const uniqueAllRarities = computed(() => {
  // Gather every rarity into a Set
  const r = new Set()
  allCtoons.value.forEach(c => {
    if (c.rarity) {
      r.add(c.rarity)
    }
  })

  // Convert to array
  return Array.from(r).sort((a, b) => {
    const indexA = RARITY_ORDER.indexOf(a)
    const indexB = RARITY_ORDER.indexOf(b)

    // If both 'a' and 'b' appear in our RARITY_ORDER, sort by that index
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB
    }

    // If only 'a' is in RARITY_ORDER, it should come before 'b'
    if (indexA !== -1 && indexB === -1) {
      return -1
    }

    // If only 'b' is in RARITY_ORDER, it should come before 'a'
    if (indexA === -1 && indexB !== -1) {
      return 1
    }

    // Neither 'a' nor 'b' is in RARITY_ORDER → fall back to alphabetical
    return a.localeCompare(b)
  })
})

// ─────────── FILTERED & SORTED “MY COLLECTION” ───────
const filteredUserCtoons = computed(() => {
  return userCtoons.value.filter(uc => {
    const c = uc.ctoon
    const nameMatch = c.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const setMatch = selectedSets.value.length === 0
      ? true
      : selectedSets.value.includes(c.set)
    const seriesMatch = selectedSeries.value.length === 0
      ? true
      : selectedSeries.value.includes(c.series)
    const rarityMatch = selectedRarities.value.length === 0
      ? true
      : selectedRarities.value.includes(c.rarity)

    let ownedMatch = true
    if (selectedOwned.value === 'owned') {
      ownedMatch = c.isOwned
    } else if (selectedOwned.value === 'unowned') {
      ownedMatch = !c.isOwned
    }

    return nameMatch && setMatch && seriesMatch && rarityMatch && ownedMatch
  })
})
const filteredAndSortedUserCtoons = computed(() => {
  const list = filteredUserCtoons.value.slice()
  switch (sortBy.value) {
    case 'releaseDateAsc':
      return list.sort((a, b) => new Date(a.ctoon.releaseDate) - new Date(b.ctoon.releaseDate))
    case 'releaseDateDesc':
      return list.sort((a, b) => new Date(b.ctoon.releaseDate) - new Date(a.ctoon.releaseDate))
    case 'priceAsc':
      return list.sort((a, b) => a.ctoon.price - b.ctoon.price)
    case 'priceDesc':
      return list.sort((a, b) => b.ctoon.price - a.ctoon.price)
    case 'rarity':
      return list.sort((a, b) => a.ctoon.rarity.localeCompare(b.ctoon.rarity))
    case 'series':
      return list.sort((a, b) => a.ctoon.series.localeCompare(b.ctoon.series))
    case 'set':
      return list.sort((a, b) => a.ctoon.set.localeCompare(b.ctoon.set))
    default:
      return list.sort((a, b) => new Date(b.ctoon.releaseDate) - new Date(a.ctoon.releaseDate))
  }
})
const pagedUserCtoons = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return filteredAndSortedUserCtoons.value.slice(start, start + itemsPerPage)
})
watch(
  [searchQuery, selectedSets, selectedSeries, selectedRarities, selectedOwned, sortBy],
  () => { currentPage.value = 1 }
)

// ─────────── FILTERED ALL CTOONS (for All Sets/All Series) ───
const filteredAllCtoons = computed(() => {
  return allCtoons.value.filter(c => {
    const nameMatch = c.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const setMatch = selectedSets.value.length === 0 || selectedSets.value.includes(c.set)
    const seriesMatch = selectedSeries.value.length === 0 || selectedSeries.value.includes(c.series)
    const rarityMatch = selectedRarities.value.length === 0 || selectedRarities.value.includes(c.rarity)

    let ownedMatch = true
    if (selectedOwned.value === 'owned') {
      ownedMatch = c.isOwned
    } else if (selectedOwned.value === 'unowned') {
      ownedMatch = !c.isOwned
    }

    return nameMatch && setMatch && seriesMatch && rarityMatch && ownedMatch
  })
})

// ─────────── DERIVE UNIQUE SETS & SERIES FROM FILTERED ALL CTOONS ──
const filteredUniqueAllSets = computed(() => {
  const s = new Set()
  filteredAllCtoons.value.forEach(c => {
    if (c.set) s.add(c.set)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})
const filteredUniqueAllSeries = computed(() => {
  const s = new Set()
  filteredAllCtoons.value.forEach(c => {
    if (c.series) s.add(c.series)
  })
  return Array.from(s).sort((a, b) => a.localeCompare(b))
})

// ─────────── HELPERS FOR “ALL SETS” ───────────────────
function filteredCtoonsInSet(setName) {
  return filteredAllCtoons.value.filter(c => c.set === setName)
}
function ownedCountBySet(setName) {
  return filteredCtoonsInSet(setName).filter(c => c.isOwned).length
}
function totalCountBySet(setName) {
  return filteredCtoonsInSet(setName).length
}
function percentageOwnedBySet(setName) {
  const total = totalCountBySet(setName)
  return total === 0 ? 0 : Math.round((ownedCountBySet(setName) / total) * 100)
}

// ─────────── HELPERS FOR “ALL SERIES” ─────────────────
function filteredCtoonsInSeries(seriesName) {
  return filteredAllCtoons.value.filter(c => c.series === seriesName)
}
function ownedCountBySeries(seriesName) {
  return filteredCtoonsInSeries(seriesName).filter(c => c.isOwned).length
}
function totalCountBySeries(seriesName) {
  return filteredCtoonsInSeries(seriesName).length
}
function percentageOwnedBySeries(seriesName) {
  const total = totalCountBySeries(seriesName)
  return total === 0 ? 0 : Math.round((ownedCountBySeries(seriesName) / total) * 100)
}

// ─────────── ON MOUNT: FETCH ALL CTOONS WITH isOwned ─────────
onMounted(async () => {
  await fetchSelf()
  try {
    // API now returns every Ctoon, each with an isOwned boolean
    const allRes = await $fetch('/api/collections')
    allCtoons.value = allRes.map(c => ({
      id:          c.id,
      name:        c.name,
      set:         c.set,
      series:      c.series,
      rarity:      c.rarity,
      assetPath:   c.assetPath,
      price:       c.price,
      releaseDate: c.releaseDate,
      quantity:    c.quantity,
      isOwned:     c.isOwned
    }))
  } catch (err) {
    console.error('Failed to fetch all Ctoons + isOwned flags:', err)
    showToast('Failed to load collections')
  }
})
</script>


<style scoped>
/* Optional: shorten scrollbar track for filter lists */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(107, 114, 128, 0.5);
  border-radius: 3px;
}
</style>
