<template>
  <Nav />

  <!-- ──────────────── MAIN PAGE ──────────────── -->
  <div class="pt-16 px-4 py-6 max-w-5xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">cMart — gotta collect ’em&nbsp;all</h1>

    <!-- TABS + POINTS -->
    <div class="mb-6 flex items-center border-b border-gray-300">
      <div class="flex">
        <button
          v-for="tab in ['cToons', 'Packs']"
          :key="tab"
          @click="activeTab = tab"
          class="px-4 py-2 -mb-px text-sm font-medium border-b-2"
          :class="activeTab === tab
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
        >
          {{ tab }}
        </button>
      </div>
      <div class="ml-auto bg-indigo-100 text-indigo-800 font-semibold px-4 py-2 rounded text-sm">
        My Points: {{ user?.points || 0 }}
      </div>
    </div>

    <!-- SORT BAR (cToons tab) -->
    <div v-if="activeTab === 'cToons'" class="flex items-center mb-4">
      <label for="sort" class="mr-2 text-sm font-medium">Sort / Filter:</label>
      <select id="sort" v-model="sortBy" class="border rounded px-2 py-1 text-sm">
        <option value="releaseDateDesc">Release Time – Desc</option>
        <option value="releaseDateAsc">Release Time – Asc</option>
        <option value="rarity">Rarity</option>
        <option value="series">Series</option>
        <option value="priceAsc">Price – Asc</option>
        <option value="priceDesc">Price – Desc</option>
        <option value="owned">Owned</option>
        <option value="unowned">Un-owned</option>
      </select>
    </div>

    <!-- CTOON GRID -->
    <div
      v-if="activeTab === 'cToons'"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
    >
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
            <span class="capitalize">{{ ctoon.rarity }}</span>
          </p>
          <p>
            Minted: {{ ctoon.minted }} /
            {{ ctoon.quantity === null ? 'Unlimited' : ctoon.quantity }}
          </p>
        </div>
        <button
          @click="buyCtoon(ctoon)"
          :disabled="ctoon.quantity && ctoon.minted >= ctoon.quantity"
          class="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Buy for {{ ctoon.price }} Pts
        </button>
      </div>
    </div>

    <!-- PACK GRID -->
    <div
      v-else
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
    >
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
          <li v-for="r in pack.rarityConfigs" :key="r.rarity" style="margin-top: 12px !important;">
            <strong>{{ r.rarity }}:</strong> {{ r.probabilityPercent }}% chance to receive {{ r.count }} cToon(s)
          </li>
        </ul>
        <button
          @click.stop="buyPack(pack)"
          class="mt-auto w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
        >
          Buy Pack for {{ pack.price }} Pts
        </button>
      </div>
    </div>

    <!-- PAGINATION -->
    <div v-if="activeTab === 'cToons'" class="mt-8 flex justify-center gap-4">
      <button
        @click="currentPage--"
        :disabled="currentPage === 1"
        class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
      >
        Previous
      </button>
      <button
        @click="currentPage++"
        :disabled="currentPage * itemsPerPage >= sortedCtoons.length"
        class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
      >
        Next
      </button>
    </div>

    <!-- PACK OVERLAY & MODAL -->
    <div
      v-if="overlayVisible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
    >
      <div
        class="relative bg-white rounded-lg shadow-xl max-w-3xl w-full p-8 flex flex-col items-center"
      >
        <!-- close button during preview or after reveal -->
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
            class="flex flex-col items-center"
          >
            <img
              :src="item.assetPath"
              class="max-w-full h-auto object-contain rounded border border-gray-300"
            />
            <p class="mt-2 text-xs text-center">{{ item.name }}</p>
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
// ────────── Nuxt Page Meta ─────────────────────────
definePageMeta({ 
  middleware: 'auth',
  layout: 'default'
})

// ────────── Imports ─────────────────────────────────
import { ref, computed, onMounted } from 'vue'
import { useAuth }        from '@/composables/useAuth'
import Toast               from '@/components/Toast.vue'
import Nav                 from '@/components/Nav.vue'
import * as Sentry         from '@sentry/nuxt'

// ────────── Auth & Points ─────────────────────────
const { user, fetchSelf } = useAuth()

// ────────── Tabs ──────────────────────────────────
const activeTab = ref('cToons')

// ────────── Toast Helper ─────────────────────────
const toastMessage = ref('')
const toastType    = ref('error')
function showToast(msg, type) {
  toastType.value    = type || 'error'
  toastMessage.value = msg
  setTimeout(function() {
    toastMessage.value = ''
  }, 5000)
}

// ────────── Shop Data ────────────────────────────
const ctoons = ref([])
const packs  = ref([])

// ────────── Sorting & Paging (cToons) ────────────
const sortBy       = ref('releaseDateDesc')
const currentPage  = ref(1)
const itemsPerPage = 50

const sortedCtoons = computed(function() {
  var list = ctoons.value.slice()
  switch (sortBy.value) {
    case 'rarity':
      return list.sort(function(a,b){ return a.rarity.localeCompare(b.rarity) })
    case 'series':
      return list.sort(function(a,b){ return a.series.localeCompare(b.series) })
    case 'priceAsc':
      return list.sort(function(a,b){ return a.price - b.price })
    case 'priceDesc':
      return list.sort(function(a,b){ return b.price - a.price })
    case 'releaseDateAsc':
      return list.sort(function(a,b){ return new Date(a.releaseDate) - new Date(b.releaseDate) })
    case 'owned':
      return list.filter(function(c){ return c.owned }).sort(function(a,b){ return a.name.localeCompare(b.name) })
    case 'unowned':
      return list.filter(function(c){ return !c.owned }).sort(function(a,b){ return a.name.localeCompare(b.name) })
    default:
      return list.sort(function(a,b){ return new Date(b.releaseDate) - new Date(a.releaseDate) })
  }
})
const pagedCtoons = computed(function() {
  var start = (currentPage.value - 1) * itemsPerPage
  return sortedCtoons.value.slice(start, start + itemsPerPage)
})

// ────────── Overlay & Animation State ───────────
const overlayVisible  = ref(false)
const showGlow        = ref(false)
const openingStep     = ref('preview')   // 'preview' | 'pack' | 'reveal'
const glowStage       = ref('hidden')    // 'hidden' | 'expand' | 'fade'
const revealComplete  = ref(false)

const packDetails  = ref(null)   // metadata for selected pack
const packContents = ref([])     // cToons after opening

const groupedByRarity = computed(function() {
  if (!packDetails.value || !packDetails.value.ctoonOptions) return {}
  return packDetails.value.ctoonOptions.reduce(function(acc, o) {
    (acc[o.rarity] = acc[o.rarity] || []).push(o)
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

// ────────── Fetch Shop Data on Mount ─────────────
onMounted(async function() {
  await fetchSelf()

  // load cToons
  var ownedIds = new Set((user.value.ctoons || []).map(function(ct){ return ct.ctoonId }))
  var ctoonRes = await $fetch('/api/cmart')
  ctoons.value = ctoonRes.map(function(c) {
    return {
      id:        c.id,
      name:      c.name,
      series:    c.series,
      rarity:    c.rarity,
      assetPath: c.assetPath,
      price:     c.price,
      releaseDate: c.releaseDate,
      quantity:  c.quantity,
      owners:    c.owners,
      minted:    (c.owners || []).length,
      owned:     ownedIds.has(c.id)
    }
  })

  // load packs
  await fetchPacks()
})

async function fetchPacks() {
  try {
    packs.value = await $fetch('/api/cmart/packs')
  } catch (err) {
    console.error(err)
    showToast('Failed to load packs')
  }
}

// ────────── Buy Single cToon ─────────────────────
async function buyCtoon(ctoon) {
  if (user.value.points < ctoon.price) {
    return showToast("You don't have enough points")
  }
  try {
    await $fetch('/api/cmart/buy', {
      method: 'POST',
      body: { ctoonId: ctoon.id }
    })
    await fetchSelf()
    user.value.points -= ctoon.price
    ctoon.minted++
    showToast('Purchase successful', 'success')
  } catch (err) {
    Sentry.captureException(err)
    showToast('Failed to buy cToon')
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
  try {
    var res = await $fetch('/api/cmart/packs/buy', {
      method: 'POST',
      body: { packId: pack.id }
    })
    await fetchSelf()
    user.value.points -= pack.price

    // ensure overlay visible & show sealed pack
    if (!overlayVisible.value) {
      packDetails.value    = pack
      resetSequence()
      overlayVisible.value = true
    }
    openingStep.value = 'pack'
    glowStage.value   = 'hidden'
    showGlow.value    = true

    // 1) after 2s: expand glow
    setTimeout(function() {
      glowStage.value = 'expand'
    }, 2000)

    // 2) after 4s: fetch contents, reveal, fade glow
    setTimeout(async function() {
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

    // 3) after 5s: hide glow
    setTimeout(function() {
      showGlow.value  = false
      glowStage.value = 'hidden'
    }, 5000)

  } catch (err) {
    Sentry.captureException(err)
    showToast('Failed to buy pack')
  }
}

// ────────── Close Overlay ──────────────────────
function closeOverlay() {
  overlayVisible.value = false
  if (activeTab.value === 'Packs') {
    fetchPacks()
  }
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
</style>
