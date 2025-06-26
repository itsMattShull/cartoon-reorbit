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
      <aside :class="[ showFilters ? 'block' : 'hidden', 'lg:block', 'w-full lg:w-1/4', 'bg-white rounded-lg shadow p-6' ]">
        <!-- Search -->
        <div class="mb-4">
          <label for="search" class="block text-sm font-medium text-gray-700 mb-1">Search cToons</label>
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
              v-for="s in activeTab==='MyCollection' ? uniqueUserSets : activeTab==='MyWishlist' ? uniqueWishlistSets : uniqueAllSets"
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
              v-for="ser in activeTab==='MyCollection' ? uniqueUserSeries : uniqueAllSeries"
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
              v-for="r in activeTab==='MyCollection' ? uniqueUserRarities : uniqueAllRarities"
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
              <input type="radio" value="all" v-model="selectedOwned" class="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
              <span class="ml-2">All</span>
            </label>
            <label class="flex items-center text-sm">
              <input type="radio" value="owned" v-model="selectedOwned" class="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
              <span class="ml-2">Owned Only</span>
            </label>
            <label class="flex items-center text-sm">
              <input type="radio" value="unowned" v-model="selectedOwned" class="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
              <span class="ml-2">Un-owned Only</span>
            </label>
          </div>
        </div>

        <!-- Sort -->
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
            <option value="name">Name (A→Z, then Mint #)</option>
          </select>
        </div>

        <!-- Unique Toggle -->
        <div class="mt-4">
          <button
            @click="toggleUnique"
            class="w-full px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium"
          >
            {{ showUnique ? 'Show All cToons' : 'Show Unique cToons' }}
          </button>
        </div>
      </aside>

      <!-- ─────────────────── TAB CONTENTS ─────────────────── -->
      <div class="w-full lg:w-3/4">
        <!-- My Collection -->
        <div v-if="activeTab==='MyCollection'">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- initial loading skeletons -->
            <template v-if="pageUser===0 && isLoadingUserCtoons">
              <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse">
                <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                <div class="bg-gray-200 rounded w-1/2 h-4"></div>
              </div>
            </template>

            <!-- actual UserCtoon cards -->
            <template v-else>
              <div
                v-for="uc in filteredAndSortedUserCtoons"
                :key="uc.id"
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
                  <p v-if="uc.isFirstEdition" class="text-indigo-600 font-semibold">First Edition</p>
                </div>
                <div class="mt-auto flex space-x-2">
                  <AddToAuction
                    :userCtoon="uc"
                    :isOwner="uc.userId===user.id"
                    :hasActiveAuction="uc.auctions.length>0"
                    @auctionCreated="loadMoreUser"
                  />
                </div>
              </div>

              <!-- loading more skeletons -->
              <template v-if="isLoadingMoreUser">
                <div v-for="n in 3" :key="n" class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full animate-pulse">
                  <div class="bg-gray-200 rounded w-3/4 h-6 mb-4"></div>
                  <div class="bg-gray-200 rounded w-full h-32 mb-4"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4 mb-2"></div>
                  <div class="bg-gray-200 rounded w-1/2 h-4"></div>
                </div>
              </template>
            </template>
          </div>
        </div>

        <!-- My Wishlist -->
        <div v-if="activeTab === 'MyWishlist'">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- loading skeleton -->
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

            <!-- actual wishlist cards -->
            <template v-else>
              <div
                v-for="wc in filteredAndSortedWishlistCtoons"
                :key="wc.id"
                class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
              >
                <h2 class="text-xl font-semibold mb-2">{{ wc.name }}</h2>
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
        <div v-if="activeTab==='AllSets'">
          <div v-for="setName in uniqueAllSets" :key="setName" class="mb-8">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ setName }}</h2>
              <p class="text-gray-700">{{ ownedCountBySet(setName) }} / {{ totalCountBySet(setName) }} owned ({{ percentageOwnedBySet(setName) }}%)</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <template v-if="pageAll===0 && isLoadingAllCtoons">
                <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse"></div>
              </template>
              <template v-else>
                <div
                  v-for="c in filteredAllCtoons"
                  :key="c.id"
                  v-show="c.set === setName"
                  class="relative bg-white rounded-lg shadow p-4 flex flex-col h-full"
                >
                  <!-- Owned/Un-owned badge top-right -->
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

                  <!-- Title -->
                  <h3 class="text-lg font-semibold mb-2 mt-6">{{ c.name }}</h3>

                  <!-- Centered image -->
                  <div class="flex-grow flex items-center justify-center">
                    <img
                      loading="lazy"
                      :src="c.assetPath"
                      class="max-h-48 object-contain"
                      alt=""
                    />
                  </div>

                  <!-- Info under image -->
                  <p class="text-sm mt-2 text-center">
                    {{ c.series }} • {{ c.rarity }}
                  </p>

                  <!-- Add to Wishlist under info -->
                  <div class="mt-2 text-center">
                    <AddToWishlist :ctoon-id="c.id" />
                  </div>
                </div>

                <!-- Loading skeletons -->
                <div
                  v-if="isLoadingMoreAll"
                  v-for="n in 3"
                  :key="n"
                  class="bg-white rounded-lg shadow p-4 animate-pulse"
                ></div>
              </template>
            </div>
          </div>
        </div>

        <!-- All Series -->
        <div v-if="activeTab==='AllSeries'">
          <div v-for="seriesName in uniqueAllSeries" :key="seriesName" class="mb-8">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-semibold capitalize">{{ seriesName }}</h2>
              <p class="text-gray-700">{{ ownedCountBySeries(seriesName) }} / {{ totalCountBySeries(seriesName) }} owned ({{ percentageOwnedBySeries(seriesName) }}%)</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <template v-if="pageAll===0 && isLoadingAllCtoons">
                <div v-for="n in 6" :key="n" class="bg-white rounded-lg shadow p-4 animate-pulse"></div>
              </template>
              <template v-else>
                <div
                  v-for="c in filteredAllCtoons"
                  :key="c.id"
                  v-show="c.series === seriesName"
                  class="relative bg-white rounded-lg shadow p-4 flex flex-col h-full"
                >
                  <!-- Owned/Un‐owned badge top‐right -->
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

                  <!-- Title at top -->
                  <h3 class="text-lg font-semibold mb-2 mt-6">{{ c.name }}</h3>

                  <!-- Image wrapper takes remaining space and centers image -->
                  <div class="flex-grow flex items-center justify-center">
                    <img
                      loading="lazy"
                      :src="c.assetPath"
                      class="max-h-48 object-contain"
                      alt=""
                    />
                  </div>

                  <!-- Footer info under image -->
                  <p class="text-sm mt-2 text-center">
                    {{ c.set }} • {{ c.rarity }}
                  </p>

                  <!-- Add to Wishlist button under info -->
                  <div class="mt-2 text-center">
                    <AddToWishlist :ctoon-id="c.id" />
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import Toast from '@/components/Toast.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import AddToAuction from '@/components/AddToAuction.vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: 'auth', layout: 'default' })

// AUTH
const { user, fetchSelf } = useAuth()

// STATE
const activeTab = ref('MyCollection')
const showFilters = ref(false)
const searchQuery = ref('')
const selectedSets = ref([])
const selectedSeries = ref([])
const selectedRarities = ref([])
const selectedOwned = ref('all')
const sortBy = ref('releaseDateDesc')
const filterMeta = ref({ sets: [], series: [], rarities: [] })

const allCtoons = ref([])
const pageAll = ref(0)
const isLoadingAllCtoons = ref(false)
const isLoadingMoreAll = ref(false)
const noMoreAll = ref(false)

const userCtoons = ref([])
const pageUser = ref(0)
const isLoadingUserCtoons = ref(false)
const isLoadingMoreUser = ref(false)
const noMoreUser = ref(false)

const wishlistCtoons = ref([])
const isLoadingWishlist = ref(false)

const TAKE = 50

// COMPUTED FILTER LISTS
const uniqueAllSets = computed(() => filterMeta.value.sets)
const uniqueAllSeries = computed(() => filterMeta.value.series)

// User & Wishlist filter lists
const uniqueUserSets = computed(() => Array.from(new Set(userCtoons.value.map(u => u.set))).sort())
const uniqueUserSeries = computed(() => Array.from(new Set(userCtoons.value.map(u => u.series))).sort())
const uniqueUserRarities = computed(() => Array.from(new Set(userCtoons.value.map(u => u.rarity))).sort())
const uniqueWishlistSets = computed(() => Array.from(new Set(wishlistCtoons.value.map(w => w.set))).sort())
const uniqueWishlistSeries = computed(() => Array.from(new Set(wishlistCtoons.value.map(w => w.series))).sort())
const uniqueWishlistRarities = computed(() => Array.from(new Set(wishlistCtoons.value.map(w => w.rarity))).sort())


// FILTERED DATA
const filteredAllCtoons = computed(() => {
  return allCtoons.value.filter(c => {
    const nm = c.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    const sm = !selectedSets.value.length || selectedSets.value.includes(c.set)
    const se = !selectedSeries.value.length || selectedSeries.value.includes(c.series)
    const r  = !selectedRarities.value.length || selectedRarities.value.includes(c.rarity)
    const o  = selectedOwned.value==='all' || (selectedOwned.value==='owned'?c.isOwned:!c.isOwned)
    return nm && sm && se && r && o
  })
})

const filteredUserCtoons = computed(() => userCtoons.value.filter(uc => {
  const nm = uc.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  const sm = !selectedSets.value.length || selectedSets.value.includes(uc.set)
  const se = !selectedSeries.value.length || selectedSeries.value.includes(uc.series)
  const r  = !selectedRarities.value.length || selectedRarities.value.includes(uc.rarity)
  return nm && sm && se && r
}))

const filteredAndSortedUserCtoons = computed(() => {
  const list = filteredUserCtoons.value.slice()
  switch (sortBy.value) {
    case 'releaseDateAsc':   return list.sort((a,b)=>new Date(a.releaseDate)-new Date(b.releaseDate))
    case 'releaseDateDesc':  return list.sort((a,b)=>new Date(b.releaseDate)-new Date(a.releaseDate))
    case 'priceAsc':         return list.sort((a,b)=>a.price-b.price)
    case 'priceDesc':        return list.sort((a,b)=>b.price-a.price)
    case 'rarity':           return list.sort((a,b)=>a.rarity.localeCompare(b.rarity))
    case 'series':           return list.sort((a,b)=>a.series.localeCompare(b.series))
    case 'set':              return list.sort((a,b)=>a.set.localeCompare(b.set))
    case 'name':
     return list.sort((a, b) => {
       // first by name
       const cmp = a.name.localeCompare(b.name)
       if (cmp !== 0) return cmp
       // tie-break on mint number
       return (a.mintNumber || 0) - (b.mintNumber || 0)
     })
    default:                 return list
  }
})

const filteredWishlistCtoons = computed(() => wishlistCtoons.value.filter(wc => wc.name.toLowerCase().includes(searchQuery.value.toLowerCase())))
const filteredAndSortedWishlistCtoons = computed(() => {
  const list = filteredWishlistCtoons.value.slice()
  if (sortBy.value === 'name') {
    return list.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name)
      return cmp !== 0 ? cmp : (a.mintNumber || 0) - (b.mintNumber || 0)
    })
  }
  // or just return list if you don’t care about other sorts
  return list
})


// HELPERS FOR COUNTS
function filteredCtoonsInSet(name) { return filteredAllCtoons.value.filter(c=>c.set===name) }
function ownedCountBySet(name)    { return filteredCtoonsInSet(name).filter(c=>c.isOwned).length }
function totalCountBySet(name)    { return filteredCtoonsInSet(name).length }
function percentageOwnedBySet(name){ const t=totalCountBySet(name); return t?Math.round(ownedCountBySet(name)/t*100):0 }

function filteredCtoonsInSeries(name){ return filteredAllCtoons.value.filter(c=>c.series===name) }
function ownedCountBySeries(name)   { return filteredCtoonsInSeries(name).filter(c=>c.isOwned).length }
function totalCountBySeries(name)   { return filteredCtoonsInSeries(name).length }
function percentageOwnedBySeries(name){ const t=totalCountBySeries(name); return t?Math.round(ownedCountBySeries(name)/t*100):0 }

// TAB SWITCH
function switchTab(tab) {
  activeTab.value = tab
  // Reset and load depending on tab
  if (tab === 'AllSets' || tab === 'AllSeries') {
    // clear previous cards
    allCtoons.value = [];
    pageAll.value = 0;
    noMoreAll.value = false;
    loadMoreAll();
  }
  if (tab==='MyCollection') loadMoreUser()
  if (tab==='MyWishlist') loadWishlist()
}

// LOADERS
async function loadMoreAll() {
  isLoadingAllCtoons.value = pageAll.value===0
  isLoadingMoreAll.value  = pageAll.value>0
  const skip = allCtoons.value.length
  try {
    const res = await $fetch(`/api/collections/all?skip=${skip}&take=${TAKE}`)
    if (res.length) {
      allCtoons.value.push(...res)
      pageAll.value++
      if (res.length< TAKE) noMoreAll.value=true
    }
  } finally {
    isLoadingAllCtoons.value=false
    isLoadingMoreAll.value=false
  }
}

async function loadMoreUser() {
  isLoadingUserCtoons.value = pageUser.value===0
  isLoadingMoreUser.value   = pageUser.value>0
  const next = pageUser.value+1
  try {
    const res = await $fetch(`/api/collections?page=${next}`)
    if (res.length) {
      userCtoons.value.push(...res)
      pageUser.value++
      if (res.length< TAKE) noMoreUser.value=true
    }
  } finally {
    isLoadingUserCtoons.value=false
    isLoadingMoreUser.value=false
  }
}

async function loadWishlist() {
  isLoadingWishlist.value=true
  wishlistCtoons.value = await $fetch('/api/wishlist')
  isLoadingWishlist.value=false
}

// INITIAL MOUNT
onMounted(async () => {
  await fetchSelf()
  filterMeta.value = await $fetch('/api/collections/meta')
  loadMoreUser()
  window.addEventListener('scroll', () => {
    if ((activeTab.value==='AllSets'||activeTab.value==='AllSeries') &&
        window.innerHeight+window.scrollY+100>=document.body.offsetHeight &&
        !isLoadingAllCtoons.value && !isLoadingMoreAll.value && !noMoreAll.value) {
      loadMoreAll()
    }
    if (activeTab.value==='MyCollection' &&
        window.innerHeight+window.scrollY+100>=document.body.offsetHeight &&
        !isLoadingUserCtoons.value && !isLoadingMoreUser.value && !noMoreUser.value) {
      loadMoreUser()
    }
  })
})

onBeforeUnmount(() => window.removeEventListener('scroll', ()=>{}))

// WATCH FILTER/SORT
watch([searchQuery,selectedSets,selectedSeries,selectedRarities,selectedOwned,sortBy],()=>{})
</script>

<style scoped>
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background-color: rgba(107,114,128,0.5); border-radius: 3px; }
</style>
