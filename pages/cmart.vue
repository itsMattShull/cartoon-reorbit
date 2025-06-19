<template>
  <Nav />

  <!-- ──────────── MAIN PAGE ──────────── -->
  <div class="pt-16 px-4 py-6 max-w-7xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">cMart — gotta collect ’em&nbsp;all</h1>

    <!-- TABS + POINTS -->
    <div class="mb-6 flex items-center border-b border-gray-300">
      <div class="flex">
        <button
          v-for="tab in ['cToons', 'Packs']"
          :key="tab"
          @click="activeTab = tab"
          class="px-4 py-2 -mb-px text-sm font-medium border-b-2"
          :class=" activeTab === tab
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700' "
        >
          {{ tab }}
        </button>
      </div>
      <div class="ml-auto bg-indigo-100 text-indigo-800 font-semibold px-4 py-2 rounded text-sm">
        My Points: {{ user?.points || 0 }}
      </div>
    </div>

    <!-- ──────── LAYOUT: SIDEBAR + CONTENT ──────── -->
    <button
      class="lg:hidden mb-4 px-4 py-2 bg-indigo-600 text-white rounded"
      @click="showFilters = !showFilters"
      v-if="activeTab === 'cToons'"
    >
      {{ showFilters ? 'Hide Filters' : 'Show Filters & Sort' }}
    </button>

    <!-- ─── cToons Tab ──────────────────────────── -->
    <div v-if="activeTab === 'cToons'" class="flex flex-col lg:flex-row gap-6">
      <!-- FILTER / SORT PANEL (left) -->
      <aside
        :class="[showFilters ? 'block' : 'hidden', 'lg:block', 'w-full lg:w-1/4', 'bg-white rounded-lg shadow p-6']"
      >
        <!-- Search -->
        <div class="mb-10">
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
        <div class="mb-10">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Set</p>
          <div class="space-y-1 max-h-32 overflow-y-auto pr-2">
            <label
              v-for="s in uniqueSets"
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
        <div class="mb-10">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Series</p>
          <div class="space-y-1 max-h-32 overflow-y-auto pr-2">
            <label
              v-for="ser in uniqueSeries"
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
        <div class="mb-10">
          <p class="text-sm font-medium text-gray-700 mb-2">Filter by Rarity</p>
          <div class="space-y-1 max-h-32 overflow-y-auto pr-2">
            <label
              v-for="r in uniqueRarities"
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

        <!-- Filter by Owned / Unowned -->
        <div class="mb-10">
          <p class="text-sm font-medium text-gray-700 mb-2">Owned / Unowned</p>
          <div class="space-y-1">
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="all"
                v-model="ownedFilter"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">All</span>
            </label>
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="owned"
                v-model="ownedFilter"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">Owned</span>
            </label>
            <label class="flex items-center text-sm">
              <input
                type="radio"
                value="unowned"
                v-model="ownedFilter"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span class="ml-2">Un‐owned</span>
            </label>
          </div>
        </div>

        <!-- Sort Select -->
        <div class="mt-10">
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
            <option value="series">Series (A→Z)</option>
          </select>
        </div>
      </aside>

      <!-- CTOON GRID (right) -->
      <div class="w-full lg:w-3/4">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="ctoon in pagedCtoons"
            :key="ctoon.id"
            class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full"
          >
            <h2 class="text-xl font-semibold mb-2">{{ ctoon.name }}</h2>
            <div class="flex-grow flex items-center justify-center w-full mb-4">
              <img :src="ctoon.assetPath" class="max-w-full h-auto" />
            </div>
            <div class="mt-auto text-sm text-center">
              <p>
                <span class="capitalize">{{ ctoon.series }}</span> • 
                <span class="capitalize">{{ ctoon.rarity }}</span> • 
                <span class="capitalize">{{ ctoon.set }}</span>
              </p>
              <p>
                Minted: {{ ctoon.minted }} / 
                {{ ctoon.quantity === null ? 'Unlimited' : ctoon.quantity }}
              </p>
            </div>
            <div class="mt-6 flex w-full space-x-2">
              <!-- left: wishlist -->
              <AddToWishlist
                :ctoon-id="ctoon.id"
                class="flex-1 text-xs"
              />

              <!-- right: buy -->
              <button
                @click="buyCtoon(ctoon)"
                :disabled="(ctoon.quantity && ctoon.minted >= ctoon.quantity) || buyingCtoons.has(ctoon.id)"
                class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50 text-xs"
              >
                <span v-if="ctoon.quantity && ctoon.minted >= ctoon.quantity">
                  Sold Out
                </span>
                <span v-else-if="buyingCtoons.has(ctoon.id)">
                  Purchasing…
                </span>
                <span v-else>
                  Buy for {{ ctoon.price }} Pts
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- PAGINATION -->
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
            :disabled="(currentPage * itemsPerPage) >= filteredAndSortedCtoons.length"
            class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- ─── PACKS TAB ─────────────────────────────── -->
    <div v-if="activeTab === 'Packs'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="pack in packs"
        :key="pack.id"
        class="bg-white rounded-lg shadow p-4 flex flex-col items-center h-full cursor-pointer hover:ring-2 hover:ring-indigo-300"
        @click="openPackModal(pack)"
      >
        <h2 class="text-xl font-semibold mb-2 text-center break-words">
          {{ pack.name }}
        </h2>
        <div class="flex-grow flex items-center justify-center w-full mb-4">
          <img :src="pack.imagePath" class="max-w-full h-auto" />
        </div>
        <ul class="text-sm text-gray-700 mb-2 space-y-0.5">
          <li
            v-for="r in pack.rarityConfigs"
            :key="r.rarity"
            class="mt-2"
          >
            <strong>{{ r.rarity }}:</strong>
            {{ r.probabilityPercent }}% chance to receive {{ r.count }} cToon(s)
          </li>
        </ul>
        <button
          @click.stop="buyPack(pack)"
          :disabled="buyingPacks.has(pack.id)"
          class="mt-auto w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
        <span v-if="buyingPacks.has(pack.id)">
          Purchasing…
        </span>
        <span v-else>
          Buy Pack for {{ pack.price }} Pts
        </span>
        </button>
      </div>
    </div>

    <!-- PACK OVERLAY & MODAL -->
    <div
      v-if="overlayVisible"
      class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/70 overflow-y-auto p-4"
    >
      <div
        class="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 flex flex-col items-center"
      >
        <button
          v-if="openingStep === 'preview' || revealComplete"
          class="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
          @click="closeOverlay"
        >
          ✕
        </button>

        <!-- PREVIEW MODE -->
        <template v-if="openingStep === 'preview'">
          <h2 class="text-2xl font-semibold mb-6 text-center">
            {{ packDetails?.name }}
          </h2>
          <div
            v-for="(list, rarity) in groupedByRarity"
            :key="rarity"
            class="mb-4 w-full"
          >
            <h3 class="font-medium mb-1">{{ rarity }}</h3>
            <ul class="text-sm pl-4 space-y-0.5">
              <li
                v-for="item in list"
                :key="item.ctoonId"
                class="flex justify-between"
              >
                <span>{{ item.name }}</span>
                <span class="text-gray-600">{{ item.weight }} %</span>
              </li>
            </ul>
          </div>
          <button
            class="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded"
            @click.stop="buyPack(packDetails)"
          >
            Buy Pack for {{ packDetails?.price }} Pts
          </button>
        </template>

        <!-- PACK IMAGE BEFORE GLOW -->
        <img
          v-if="openingStep === 'pack'"
          :src="packDetails?.imagePath"
          class="max-w-full max-h-[70vh] object-contain"
        />

        <!-- REVEAL MODE -->
        <div
          v-if="openingStep === 'reveal'"
          class="grid grid-cols-2 sm:grid-cols-3 gap-6"
        >
          <div
            v-for="item in packContents"
            :key="item.id"
            class="relative flex flex-col items-center p-4 border rounded-lg bg-white"
            :class="{ 'card-glow': !item.inCmart }"
          >
            <!-- New! badge -->
            <span
              v-if="!originalOwnedSet.has(item.id)"
              class="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full"
            >
              New!
            </span>

            <!-- Image -->
            <img
              :src="item.assetPath"
              class="w-24 h-24 object-contain mb-2 mt-8"
            />

            <!-- Name -->
            <p class="font-semibold text-sm text-center">{{ item.name }}</p>

            <!-- Rarity -->
            <p class="text-xs text-gray-600 capitalize">{{ item.rarity }}</p>

            <!-- Mint # -->
            <p class="text-xs text-gray-500">Mint #{{ item.mintNumber }}</p>
          </div>
        </div>

        <!-- CLOSE BUTTON AFTER REVEAL -->
        <button
          v-if="revealComplete"
          class="mt-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded"
          @click="closeOverlay"
        >
          Close
        </button>
      </div>
    </div>

    <!-- WHITE GLOW ANIMATION -->
    <div v-if="showGlow" :class="['glow', glowStage]" />

    <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />
  </div>
</template>


<script setup>
// ────────── Nuxt Meta ──────────────────────────
definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

// ────────── Imports ─────────────────────────────
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import Toast from '@/components/Toast.vue'
import AddToWishlist from '@/components/AddToWishlist.vue'
import Nav from '@/components/Nav.vue'
import * as Sentry from '@sentry/nuxt'

const showFilters = ref(false)
const buyingCtoons = ref(new Set())
const buyingPacks  = ref(new Set())

// ────────── Auth & User ────────────────────────
const { user, fetchSelf } = useAuth()

// Track what they owned _before_ opening this pack
const originalOwnedSet = computed(() =>
  new Set((user.value.ctoons || []).map(ct => ct.ctoonId))
)

// ────────── Tabs ───────────────────────────────
const activeTab = ref('cToons')

// ────────── Toast Helper ───────────────────────
const toastMessage = ref('')
const toastType    = ref('error')
function showToast(msg, type = 'error') {
  toastType.value    = type
  toastMessage.value = msg
  setTimeout(() => {
    toastMessage.value = ''
  }, 5000)
}

// ────────── Shop Data ──────────────────────────
const ctoons = ref([])
const packs  = ref([])

// ────────── FILTER / SORT STATE ───────────────
const searchQuery      = ref('')
const selectedSets     = ref([])
const selectedSeries   = ref([])
const selectedRarities = ref([])
const ownedFilter      = ref('all')   // 'all' | 'owned' | 'unowned'
const sortBy           = ref('releaseDateDesc')
const currentPage      = ref(1)
const itemsPerPage     = 50

// ────────── DERIVE UNIQUE FILTER OPTIONS ──────
const uniqueSets = computed(() => {
  const sets = new Set()
  ctoons.value.forEach(c => {
    if (c.set) sets.add(c.set)
  })
  return Array.from(sets).sort((a, b) => a.localeCompare(b))
})
const uniqueSeries = computed(() => {
  const sers = new Set()
  ctoons.value.forEach(c => {
    if (c.series) sers.add(c.series)
  })
  return Array.from(sers).sort((a, b) => a.localeCompare(b))
})
const uniqueRarities = computed(() => {
  const rars = new Set()
  ctoons.value.forEach(c => {
    if (c.rarity) rars.add(c.rarity)
  })
  // desired order:
  const order = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
  return order.filter(r => rars.has(r))
})

// ────────── FILTERED LIST ──────────────────────
const filteredCtoons = computed(() => {
  return ctoons.value.filter(c => {
    // 1) Search by name (case-insensitive)
    const nameMatch = c.name.toLowerCase().includes(searchQuery.value.toLowerCase())

    // 2) Filter by Set
    const setMatch = selectedSets.value.length === 0
      ? true
      : selectedSets.value.includes(c.set)

    // 3) Filter by Series
    const seriesMatch = selectedSeries.value.length === 0
      ? true
      : selectedSeries.value.includes(c.series)

    // 4) Filter by Rarity
    const rarityMatch = selectedRarities.value.length === 0
      ? true
      : selectedRarities.value.includes(c.rarity)

    // 5) Filter by Owned/Unowned
    let ownedMatch = true
    if (ownedFilter.value === 'owned') {
      ownedMatch = c.owned
    } else if (ownedFilter.value === 'unowned') {
      ownedMatch = !c.owned
    }

    return nameMatch && setMatch && seriesMatch && rarityMatch && ownedMatch
  })
})

// ────────── SORTED (AND FILTERED) ─────────────
const filteredAndSortedCtoons = computed(() => {
  const list = filteredCtoons.value.slice()

  switch (sortBy.value) {
    case 'releaseDateAsc':
      return list.sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))

    case 'releaseDateDesc':
      return list.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))

    case 'priceAsc':
      return list.sort((a, b) => a.price - b.price)

    case 'priceDesc':
      return list.sort((a, b) => b.price - a.price)

    case 'series':
      return list.sort((a, b) => a.series.localeCompare(b.series))

    default:
      return list.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
  }
})

// ────────── PAGINATION ─────────────────────────
const pagedCtoons = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return filteredAndSortedCtoons.value.slice(start, start + itemsPerPage)
})

// Reset to page 1 whenever filters/sort change
watch(
  [searchQuery, selectedSets, selectedSeries, selectedRarities, ownedFilter, sortBy],
  () => {
    currentPage.value = 1
  }
)

// ────────── Overlay / Glow State ───────────────
const overlayVisible  = ref(false)
const showGlow        = ref(false)
const openingStep     = ref('preview')
const glowStage       = ref('hidden')
const revealComplete  = ref(false)

const packDetails  = ref(null)
const packContents = ref([])

const groupedByRarity = computed(() => {
  if (!packDetails.value || !packDetails.value.ctoonOptions) return {}
  return packDetails.value.ctoonOptions.reduce((acc, o) => {
    ;(acc[o.rarity] = acc[o.rarity] || []).push(o)
    return acc
  }, {})
})

function resetSequence() {
  openingStep.value    = 'preview'
  glowStage.value      = 'hidden'
  revealComplete.value = false
  showGlow.value       = false
  packContents.value   = []
}

// ────────── ON MOUNT: FETCH DATA ──────────────
onMounted(async () => {
  await fetchSelf()

  // LOAD cToons
  try {
    const ownedIds = new Set((user.value.ctoons || []).map(ct => ct.ctoonId))
    const ctoonRes = await $fetch('/api/cmart')
    ctoons.value = ctoonRes.map(c => ({
      id:          c.id,
      name:        c.name,
      set:         c.set,
      series:      c.series,
      rarity:      c.rarity,
      assetPath:   c.assetPath,
      price:       c.price,
      releaseDate: c.releaseDate,
      quantity:    c.quantity,
      owners:      c.owners,
      characters:  c.characters,
      minted:      (c.owners || []).length,
      owned:       ownedIds.has(c.id)
    }))
  } catch (err) {
    console.error('Failed to fetch cToons:', err)
    showToast('Failed to load cToons')
  }

  // LOAD PACKS
  try {
    packs.value = await $fetch('/api/cmart/packs')
  } catch (err) {
    console.error(err)
    showToast('Failed to load packs')
  }
})

// ────────── BUY SINGLE cToon ────────────────────
async function buyCtoon(ctoon) {
  if (user.value.points < ctoon.price) {
    return showToast("You don't have enough points")
  }
  buyingCtoons.value.add(ctoon.id)
  try {
    await $fetch('/api/cmart/buy', {
      method: 'POST',
      body: { ctoonId: ctoon.id }
    })
    await fetchSelf()
    user.value.points -= ctoon.price
    ctoon.minted++
    ctoon.owned = true
    showToast('Purchase successful', 'success')
  } catch (err) {
    Sentry.captureException(err)
    showToast('Failed to buy cToon')
  } finally {
    buyingCtoons.value.delete(ctoon.id)
  }
}

// ────────── Open Pack Preview Modal ─────────────
async function openPackModal(pack) {
  try {
    packDetails.value    = await $fetch('/api/cmart/packs/' + pack.id)
    resetSequence()
    overlayVisible.value = true
  } catch (err) {
    console.error(err)
    showToast('Failed to load pack details')
  }
}

// ────────── Buy Pack & Start Animation ──────────
async function buyPack(pack) {
  if (user.value.points < pack.price) {
    return showToast("You don't have enough points")
  }
  buyingPacks.value.add(pack.id)
  try {
    const res = await $fetch('/api/cmart/packs/buy', {
      method: 'POST',
      body: { packId: pack.id }
    })
    await fetchSelf()
    user.value.points -= pack.price

    // Show overlay with pack image
    if (!overlayVisible.value) {
      packDetails.value    = pack
      resetSequence()
      overlayVisible.value = true
    }
    openingStep.value = 'pack'
    glowStage.value   = 'hidden'
    showGlow.value    = true

    // 1) Expand glow after 2s
    setTimeout(() => {
      glowStage.value = 'expand'
    }, 2000)

    // 2) Reveal contents after 4s
    setTimeout(async () => {
      try {
        packContents.value = await $fetch('/api/cmart/open-pack', {
          query: { id: res.userPackId }
        })
      } catch (e) {
        console.error(e)
        showToast('Failed to open pack')
      }
      openingStep.value    = 'reveal'
      revealComplete.value = true
      glowStage.value      = 'fade'
    }, 3000)

    // 3) Hide glow after 5s
    setTimeout(() => {
      showGlow.value  = false
      glowStage.value = 'hidden'
    }, 5000)

  } catch (err) {
    Sentry.captureException(err)
    showToast('Failed to buy pack')
  } finally {
    buyingPacks.value.delete(pack.id)
  }
}

async function refreshPacks () {
  try {
    packs.value = await $fetch('/api/cmart/packs')      // <— same endpoint you use onMounted
  } catch (err) {
    console.error('Failed to refresh packs', err)
    showToast('Could not refresh packs')
  }
}

// ────────── Close Overlay ──────────────────────
function closeOverlay() {
  overlayVisible.value = false
  await refreshPacks() 
}
</script>


<style scoped>
/* ─── WHITE GLOW KEYFRAME ANIMATION ───────────── */
.glow {
  position: fixed;
  top: 50%;
  left: 50%;
  /* start as a tiny dot */
  width: 1vw;
  height: 1vh;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1000;

  /* run two animations in sequence:
     1) expand for 2s, forwards (leave end state)
     2) fade for 1s, starting at 2s, forwards */
  animation:
    expandGlow 2s ease-out forwards,
    fadeGlow   1s ease-in 2s forwards;
}

@keyframes expandGlow {
  from {
    width: 1vw;
    height: 1vh;
  }
  to {
    width: 200vw;
    height: 200vh;
  }
}

@keyframes fadeGlow {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* highlight cToons that went out of stock (inCmart=false) */
@keyframes cardGlow {
  0%   { box-shadow: 0 0 0px   rgba(255,215,0,0.5); }
  50%  { box-shadow: 0 0 10px  rgba(255,215,0,1);   }
  100% { box-shadow: 0 0 0px   rgba(255,215,0,0.5); }
}
.card-glow {
  animation: cardGlow 2s infinite ease-in-out;
}
</style>