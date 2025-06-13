<template>
  <Nav />

  <!-- Mobile Layout Only -->
  <div
    v-if="!loading"
    class="lg:hidden pt-20 py-6 max-w-6xl mx-auto flex flex-col gap-6"
  >
    <!-- Owner Section -->
    <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4 mx-4">
      <div
        class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t"
      >
        OWNER
      </div>
      <img
        :src="`/avatars/${ownerAvatar}`"
        alt="Owner Avatar"
        class="w-14 h-14 rounded-full border border-blue-300"
      />
      <div class="text-xl font-semibold text-blue-700">{{ ownerName }}</div>
    </div>

    <!-- Zone navigation arrows, only if Zone 2 or Zone 3 have any cToons -->
    <div
          v-if="hasOtherZones"
          class="flex justify-center items-center gap-4 mt-2"
        >
          <button
            class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
            @click="goToPrevious"
            :disabled="!hasPrevious"
          >
            ← Zone {{ currentZoneIndex + 1 }}
          </button>
          <span class="text-sm">Zone {{ currentZoneIndex + 1 }} of 3</span>
          <button
            class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
            @click="goToNext"
            :disabled="!hasNext"
          >
            Zone {{ currentZoneIndex + 1 }} →
          </button>
        </div>

    <!-- CZone Canvas -->
    <div class="flex">
      <!-- scale wrapper: only on small screens -->
      <div :style="scaleStyle">
        <div
          class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto mb-4"
          :style="canvasBackgroundStyle"
        >
          <div class="absolute inset-0">
            <div
              v-for="(item, index) in cZoneItems"
              :key="index"
              class="absolute"
              :style="item.style"
            >
              <img
                :src="item.assetPath"
                :alt="item.name"
                class="object-contain cursor-pointer max-w-[initial]"
                @click="openSidebar(item)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation and Points -->
    <div class="flex justify-between items-center text-sm flex-wrap gap-4 mb-6 mx-4">
      <div class="flex gap-2 flex-wrap">
        <button
          class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
          @click="goToPreviousUser"
        >
          Previous cZone
        </button>
        <button
          class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
          @click="goToRandomUser"
        >
          Random cZone
        </button>
        <button
          class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
          @click="goToNextUser"
        >
          Next cZone
        </button>
        <button
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded ml-2"
          @click="openWishlist"
        >
          View Wishlist
        </button>
        <button v-if="user?.id !== ownerId" @click="openCollection" class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded ml-2">
          View Collection
        </button>
        <button
          v-if="user?.id === ownerId"
          @click="navigateTo(editPath)"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded flex items-center gap-1"
        >
          ✏️ Edit cZone
        </button>
      </div>
      <div
        class="bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded shadow text-sm"
      >
        My Points: {{ user?.points ?? 0 }}
      </div>
    </div>
  </div>

  <!-- Desktop Layout -->
  <div
    v-if="!loading"
    class="hidden lg:flex pt-20 px-4 py-6 max-w-6xl mx-auto flex gap-6"
  >
    <ClientOnly>
      <!-- Left Column: Chat and Visitors -->
      <div class="w-1/3 bg-white rounded-xl shadow-md p-4 flex flex-col">
        <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4 mb-4">
          <div
            class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t"
          >
            OWNER
          </div>
          <img
            :src="`/avatars/${ownerAvatar}`"
            alt="Owner Avatar"
            class="w-14 h-14 rounded-full border border-blue-300"
          />
          <div class="text-xl font-semibold text-blue-700">{{ ownerName }}</div>
        </div>
        <h2 class="text-lg font-bold mb-2">Visitors: {{ visitorCount }}</h2>
        <div
          :ref="(el) => { if (el && chatContainer) chatContainer.value = el }"
          class="overflow-y-auto border rounded p-2 mb-4 text-sm h-96 flex flex-col-reverse"
        >
          <div
            v-for="(msg, index) in [...chatMessages].reverse()"
            :key="index"
            class="mb-1 flex gap-2 text-sm items-start"
          >
            <NuxtLink
              :to="`/czone/${msg.user}`"
              class="font-bold text-indigo-700 min-w-[80px] hover:underline-none no-underline"
            >
              {{ msg.user }}
            </NuxtLink>
            <div class="flex-1 break-words">{{ msg.message }}</div>
          </div>
        </div>
        <form @submit.prevent="sendMessage" class="flex gap-2 items-center">
          <select
            v-model="newMessage"
            class="flex-1 border px-2 py-1 rounded text-sm"
          >
            <option value="" disabled selected>Select a message</option>
            <option v-for="msg in predefinedMessages" :key="msg" :value="msg">
              {{ msg }}
            </option>
          </select>
          <button
            type="submit"
            :disabled="!newMessage"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded text-sm"
          >
            Send
          </button>
        </form>
      </div>
    </ClientOnly>

    <!-- Right Column: CZone Display -->
    <div class="min-w-[800px] bg-white rounded-xl shadow-md">
      <!-- Zone navigation arrows, only if Zone 2 or Zone 3 have any cToons -->
      <div
        v-if="hasOtherZones"
        class="flex justify-center items-center gap-4 mt-2 mb-4"
      >
        <button
          class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
          @click="goToPrevious"
          :disabled="!hasPrevious"
        >
          ← Zone {{ currentZoneIndex + 1 }}
        </button>
        <span class="text-sm">Zone {{ currentZoneIndex + 1 }} of 3</span>
        <button
          class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
          @click="goToNext"
          :disabled="!hasNext"
        >
          Zone {{ currentZoneIndex + 1 }} →
        </button>
      </div>
      <div class="flex justify-center overflow-hidden mb-4">
        <div
          class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto"
          :style="canvasBackgroundStyle"
        >
          <!-- Fixed-size CZone canvas/display -->
          <div class="absolute top-0 left-0">
            <div
              v-for="(item, index) in cZoneItems"
              :key="index"
              class="absolute"
              :style="item.style"
            >
              <img
                :src="item.assetPath"
                :alt="item.name"
                class="object-contain cursor-pointer max-w-[initial]"
                @click="openSidebar(item)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-between items-start text-sm mb-6 px-4">
        <!-- Left side: two vertical groups -->
        <div class="flex flex-col gap-6">
          <!-- Group 1: zone nav buttons -->
          <div class="flex gap-2">
            <button
              class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
              @click="goToPreviousUser"
            >
              Previous cZone
            </button>
            <button
              class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
              @click="goToRandomUser"
            >
              Random cZone
            </button>
            <button
              class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
              @click="goToNextUser"
            >
              Next cZone
            </button>
          </div>

          <!-- Group 2: wishlist / collection / edit -->
          <div class="flex gap-2">
            <button
              class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded"
              @click="openWishlist"
            >
              View Wishlist
            </button>
            <button
              v-if="user?.id !== ownerId"
              class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded"
              @click="openCollection"
            >
              View Collection
            </button>
            <button
              v-if="user?.id === ownerId"
              @click="navigateTo(editPath)"
              class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded flex items-center gap-1"
            >
              ✏️ Edit cZone
            </button>
          </div>
        </div>

        <!-- Right side: points badge -->
        <div class="bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded shadow text-sm">
          My Points: {{ user?.points ?? 0 }}
        </div>
      </div>
    </div>
  </div>

  <!-- Loading Skeleton -->
  <div v-else class="pt-16 px-4 py-6 max-w-6xl mx-auto flex gap-6">
    <div class="w-1/3 bg-white rounded-xl shadow-md p-4">
      <div class="h-6 bg-gray-300 rounded w-32 mb-4"></div>
      <div class="h-10 bg-gray-300 rounded w-full mb-4"></div>
      <div class="h-48 bg-gray-200 rounded mb-4"></div>
      <div class="h-8 bg-gray-300 rounded w-full"></div>
    </div>
    <div class="w-2/3 bg-white rounded-xl shadow-md p-4">
      <div class="h-[400px] bg-gray-200 rounded mb-4"></div>
      <div class="h-8 bg-gray-300 rounded w-full"></div>
    </div>
  </div>

  <!-- Overlay for Sidebar -->
  <transition name="fade">
    <div
      v-if="showSidebar"
      class="fixed inset-0 bg-black bg-opacity-50 z-40"
      @click="showSidebar = false"
    ></div>
  </transition>

  <!-- Sidebar with cToon Details -->
  <transition name="slide-panel">
    <div
      v-if="showSidebar"
      class="fixed top-0 right-0 h-screen w-80 bg-white shadow-lg border-l p-4 overflow-y-auto z-50"
    >
      <button
        class="absolute top-2 right-2 text-gray-500 hover:text-black"
        @click="showSidebar = false"
      >
        ✖
      </button>
      <div v-if="selectedCtoon">
        <img
          :src="selectedCtoon.assetPath"
          class="max-w-full mb-4 mx-auto"
          :alt="selectedCtoon.name"
        />
        <h3 class="text-xl font-bold mb-2">{{ selectedCtoon.name }}</h3>
        <p><strong>Series:</strong> {{ selectedCtoon.series }}</p>
        <p v-if="selectedCtoon.set"><strong>Set:</strong> {{ selectedCtoon.set }}</p>
        <p>
          <strong>Rarity:</strong>
          <span class="capitalize">{{ selectedCtoon.rarity }}</span>
        </p>
        <p>
          <strong>Mint #:</strong>
          <span v-if="selectedCtoon.quantity === null">
            {{ selectedCtoon.mintNumber }} of Unlimited
          </span>
          <span
            v-else-if="
              selectedCtoon.mintNumber !== null &&
              selectedCtoon.quantity !== null
            "
          >
            {{ selectedCtoon.mintNumber }} of {{ selectedCtoon.quantity }}
          </span>
          <span v-else>Unknown</span>
        </p>
        <p>
          <strong>Edition:</strong>
          {{ selectedCtoon.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
        </p>
        <p v-if="selectedCtoon.releaseDate">
          <strong>Release Date:</strong> {{ formatDate(selectedCtoon.releaseDate) }}
        </p>
        <div class="mt-4">
          <AddToWishlist :ctoon-id="selectedCtoon.ctoonId" />
        </div>
      </div>
    </div>
  </transition>
  <!-- Wishlist modal -->
  <transition name="fade">
    <div
      v-if="wishlistModalVisible"
      class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/50 overflow-y-auto p-4"
    >
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <button
          class="absolute top-3 right-3 text-gray-500 hover:text-black"
          @click="closeWishlist"
        >✕</button>
        <h2 class="text-xl font-semibold mb-4">🎁 {{ ownerName }}’s Wishlist</h2>

        <div v-if="isLoadingWishlist" class="text-center py-10">
          Loading…
        </div>
        <div v-else-if="wishlistCtoons.length === 0" class="text-center py-10">
          No cToons on their wishlist.
        </div>
        <div v-else class="grid grid-cols-2 gap-4">
          <div
            v-for="c in wishlistCtoons"
            :key="c.id"
            class="flex flex-col items-center"
          >
            <img :src="c.assetPath" class="w-20 h-20 object-contain mb-2" />
            <p class="text-sm text-center">{{ c.name }}</p>
          </div>
        </div>
      </div>
    </div>
  </transition>
  <!-- Collection & Trade Modal -->
  <transition name="fade">
    <div
      v-if="collectionModalVisible"
      class="fixed inset-0 z-50 flex sm:items-center items-start justify-center bg-black/50 overflow-y-auto p-4"
    >
      <div
        class="relative bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 flex flex-col max-h-[80vh] overflow-y-auto"
      >
        <!-- Close -->
        <button
          class="absolute top-3 right-3 text-gray-500 hover:text-black"
          @click="closeCollection"
        >
          ✕
        </button>

        <!-- Header -->
        <h2 class="text-xl font-semibold mb-4">
          {{ tradeStep === 1
              ? `${ownerName}’s Collection`
              : 'Your Collection'
          }}
        </h2>

        <!-- STEP 1: Select target’s cToons -->
        <div v-if="tradeStep === 1" class="flex-1 overflow-y-auto">
          <div v-if="isLoadingCollection" class="text-center py-10">Loading…</div>
          <div v-else-if="collectionCtoons.length === 0" class="text-center py-10">
            No cToons in their collection.
          </div>
          <div v-else class="grid grid-cols-4 gap-4">
            <div
              v-for="c in collectionCtoons"
              :key="c.id"
              @click="selectTargetCtoon(c)"
              class="relative flex flex-col items-center p-2 cursor-pointer border rounded hover:shadow"
              :class="selectedTargetCtoons.includes(c) ? 'border-indigo-500 bg-indigo-50' : ''"
            >
              <!-- Owned / Unowned badge -->
              <span
                class="absolute top-1 right-1 px-2 py-0.5 text-xs font-semibold rounded-full"
                :class="selfOwnedIds.has(c.ctoonId)
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-200 text-gray-600'"
              >
                {{ selfOwnedIds.has(c.ctoonId) ? 'Owned' : 'Unowned' }}
              </span>

              <img :src="c.assetPath" class="w-16 h-16 object-contain mb-1 mt-8" />
              <p class="text-sm text-center">{{ c.name }}</p>
              <p class="text-xs text-gray-600">{{ c.rarity }}</p>
              <p class="text-xs text-gray-600">
                Mint #{{ c.mintNumber }} of {{ c.quantity !== null ? c.quantity : 'Unlimited' }}
              </p>
              <p class="text-xs text-gray-600">
                {{ c.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
              </p>
            </div>
          </div>
        </div>
        <div v-if="tradeStep === 1" class="mt-4 text-right">
          <button
            :disabled="!selectedTargetCtoons.length"
            @click="startTrade"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Create Trade
          </button>
        </div>

        <!-- STEP 2: Select your cToons + points -->
        <div v-else class="flex-1 overflow-y-auto">
          <div v-if="isLoadingSelfCollection" class="text-center py-10">Loading…</div>
          <div v-else-if="selfCtoons.length === 0" class="text-center py-10">
            You have no cToons to trade.
          </div>
          <div v-else class="grid grid-cols-4 gap-4 mb-20">
            <div
              v-for="c in selfCtoons"
              :key="c.id"
              @click="selectInitiatorCtoon(c)"
              :class="[
                'flex flex-col items-center p-2 cursor-pointer border rounded',
                selectedInitiatorCtoons.includes(c)
                  ? 'border-green-500 bg-green-100'
                  : ''
              ]"
            >
              <img :src="c.assetPath" class="w-16 h-16 object-contain mb-1" />
              <p class="text-sm text-center">{{ c.name }}</p>
              <p class="text-xs text-gray-600">
                {{ c.rarity }}
              </p>
              <p class="text-xs text-gray-600">
                Mint #{{ c.mintNumber }} of {{ c.quantity !== null ? c.quantity : 'Unlimited' }}
              </p>
              <p class="text-xs text-gray-600">
                {{ c.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Bottom bar: points + send -->
        <div
          v-if="tradeStep === 2"
          class="absolute bottom-4 left-6 right-6 flex items-center justify-between bg-white pt-4 border-t"
        >
          <div>
            Points to Offer
            <input
              type="number"
              v-model.number="pointsToOffer"
              :max="user?.points || 0"
              min="0"
              @input="pointsToOffer = Math.max(0, pointsToOffer)"
              placeholder="Points"
              class="border px-2 py-1 rounded w-24"
            />
          </div>
          <button
            :disabled="pointsToOffer < 0 || (selectedInitiatorCtoons.length === 0 && pointsToOffer === 0)"
            @click="sendOffer"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Send Offer
          </button>
        </div>
      </div>
    </div>
  </transition>
  <!-- Toast -->
  <Toast
    v-if="showToast"
    :message="toastMessage"
    :type="toastType"
  />
</template>


<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { io } from 'socket.io-client'
import { useAuth } from '@/composables/useAuth'
import AddToWishlist from '@/components/AddToWishlist.vue'
import Toast from '@/components/Toast.vue'

definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

// ——— Date formatter ———
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// ——— Scale logic for mobile ———
const scale = ref(1)
const recalcScale = () => {
  scale.value = Math.min(1, window.innerWidth / 800)
}
const scaleStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left'
}))

// ——— Routing + Auth ———
const route = useRoute()
const router = useRouter()
const username = ref(route.params.username)
const { user, fetchSelf } = useAuth()

// ——— Loading indicator ———
const loading = ref(true)

// ——— Owner & chat state ———
const ownerName = ref(username.value)
const ownerAvatar = ref('/avatars/default.png')
const ownerId = ref(null)
const visitorCount = ref(0)
const chatMessages = ref([])
const newMessage = ref('')
const chatContainer = ref(null)

// ——— Sidebar state ———
const showSidebar = ref(false)
const selectedCtoon = ref(null)

// —— Trade modal state ——
const collectionModalVisible     = ref(false)
const tradeStep                  = ref(1)      // 1 = select target’s, 2 = select yours
const collectionCtoons           = ref([])
const isLoadingCollection        = ref(false)
const selectedTargetCtoons       = ref([])
const selfCtoons                 = ref([])
const isLoadingSelfCollection    = ref(false)
const isLoadingSelf              = ref(false)
const selectedInitiatorCtoons    = ref([])
const pointsToOffer              = ref(0)

const showToast        = ref(false)
const toastMessage     = ref('')
const toastType        = ref('success') // 'success' or 'error'

function displayToast(message, type = 'success') {
  toastMessage.value = message
  toastType.value    = type
  showToast.value    = true
  // auto-hide after 4s
  setTimeout(() => {
    showToast.value = false
  }, 4000)
}

// —— Load someone’s collection ——
async function loadCollection(userToLoad) {
  isLoadingCollection.value = true
  collectionCtoons.value     = await $fetch(`/api/collection/${userToLoad}`)
  isLoadingCollection.value = false
}

// —— Open / reset ——
function openCollection() {
  tradeStep.value              = 1
  selectedTargetCtoons.value   = []
  loadCollection(username.value)
  loadSelfCollection()
  collectionModalVisible.value = true
}
function closeCollection() {
  collectionModalVisible.value = false
  tradeStep.value              = 1
}

// —— Select/deselect target’s cToon ——
function selectTargetCtoon(ct) {
  const idx = selectedTargetCtoons.value.findIndex(t => t.id === ct.id)
  if (idx >= 0) selectedTargetCtoons.value.splice(idx, 1)
  else selectedTargetCtoons.value.push(ct)
}

// —— Move to step 2 —— 
function startTrade() {
  tradeStep.value             = 2
  selectedInitiatorCtoons.value = []
  pointsToOffer.value         = 0
  loadSelfCollection()
}

// fetch the viewing user’s own collection
async function loadSelfCollection() {
  isLoadingSelf.value = true
  isLoadingSelfCollection.value = true
  selfCtoons.value    = await $fetch(`/api/collection/${user.value.username}`)
  isLoadingSelf.value = false
  isLoadingSelfCollection.value = false
}

// a Set of ctoonIds the viewer owns
const selfOwnedIds = computed(() =>
  new Set(selfCtoons.value.map(sc => sc.ctoonId))
)

// —— Select/deselect your cToon ——
function selectInitiatorCtoon(ct) {
  const idx = selectedInitiatorCtoons.value.findIndex(t => t.id === ct.id)
  if (idx >= 0) selectedInitiatorCtoons.value.splice(idx, 1)
  else selectedInitiatorCtoons.value.push(ct)
}

// —— Send the trade offer —— 
async function sendOffer() {
  const payload = {
    recipientUsername: username.value,
    ctoonIdsRequested: selectedTargetCtoons.value.map(c => c.id),
    ctoonIdsOffered:   selectedInitiatorCtoons.value.map(c => c.id),
    pointsOffered:     pointsToOffer.value
  }

  try {
    await $fetch('/api/trade/offers', {
      method: 'POST',
      body: payload
    })
    closeCollection()
    displayToast('Trade offer sent!', 'success')
  } catch (err) {
    console.error('Trade offer failed', err)
    displayToast('Failed to send trade offer. Please try again.', 'error')
  }
}

// ——— Zones state ———
// Start out with three empty zones by default:
const zones = ref([
  { background: '', toons: [] },
  { background: '', toons: [] },
  { background: '', toons: [] }
])

const wishlistModalVisible  = ref(false)
const wishlistCtoons        = ref([])
const isLoadingWishlist     = ref(false)

async function loadUserWishlist() {
  isLoadingWishlist.value = true
  wishlistCtoons.value = await $fetch(`/api/wishlist/users/${username.value}`)
  isLoadingWishlist.value = false
}

function openWishlist() {
  loadUserWishlist()
  wishlistModalVisible.value = true
}
function closeWishlist() {
  wishlistModalVisible.value = false
}


// Which zone index is currently displayed (0, 1, or 2)
const currentZoneIndex = ref(0)
const currentZone = computed(() => zones.value[currentZoneIndex.value])

// Build a list of “renderable” cToon items for the current zone
const cZoneItems = computed(() => {
  return (currentZone.value.toons || []).map(item => ({
    ...item,
    style: `top: ${item.y}px; left: ${item.x}px; width: ${item.width}px; height: ${item.height}px;`
  }))
})

// ——— Show arrows only if another zone (besides the current one) has ≥1 toon ———
const hasOtherZones = computed(() => {
  // (Uncomment to debug in console)
  // console.log('computed hasOtherZones → zones are', JSON.stringify(zones.value))

  return zones.value.some((zone, idx) => {
    return idx !== currentZoneIndex.value
      && Array.isArray(zone.toons)
      && zone.toons.length > 0
  })
})

// Helper booleans for “Next” / “Previous” arrow enable/disable
const hasNext = computed(() => {
  for (let i = currentZoneIndex.value + 1; i < 3; i++) {
    if (zones.value[i].toons.length > 0) return true
  }
  return false
})
const hasPrevious = computed(() => {
  for (let i = currentZoneIndex.value - 1; i >= 0; i--) {
    if (zones.value[i].toons.length > 0) return true
  }
  return false
})

// Functions to advance to the next/previous non‐empty zone
function goToNext() {
  for (let i = currentZoneIndex.value + 1; i < 3; i++) {
    if (zones.value[i].toons.length > 0) {
      currentZoneIndex.value = i
      return
    }
  }
}
function goToPrevious() {
  for (let i = currentZoneIndex.value - 1; i >= 0; i--) {
    if (zones.value[i].toons.length > 0) {
      currentZoneIndex.value = i
      return
    }
  }
}
function goToRandom() {
  const nonEmpty = zones.value
    .map((z, idx) => (z.toons.length > 0 ? idx : -1))
    .filter(idx => idx >= 0)
  if (nonEmpty.length > 0) {
    currentZoneIndex.value =
      nonEmpty[Math.floor(Math.random() * nonEmpty.length)]
  }
}

// ——— Chat/send logic ———
const predefinedMessages = [
  'Cool cZone!', 'Love your cToons!', 'Nice layout!', 'Wow!', 'Awesome collection!',
  'Want to trade?', 'Thanks!', "You're Welcome :-)", 'This place rocks!', 'So nostalgic!',
  'Love the vibe here!', 'Totally bringing back memories!', 'Such a clean setup!',
  'You’ve got style!', 'Trade you a rare for this one?', 'This collection is fire!',
  'Whoa, didn’t expect that one!', 'Classic combo!', 'Can’t stop looking at these!',
  'Great theme!', 'I need that cToon!', "You're a collector pro!", 'Impressive layout!',
  'Cartoon goals right here!', 'This gave me chills!', 'Super unique choices!',
  'Totally underrated!', 'I wish I had this setup!', 'Nice flex!', "You're a legend!",
  '10/10 would visit again!', 'Mind if I screenshot this?', 'One word: EPIC!'
]
const socket = io(import.meta.env.PROD
  ? undefined
  : `http://localhost:${useRuntimeConfig().public.socketPort}`
)

function openSidebar(item) {
  selectedCtoon.value = item
  showSidebar.value = true
}
function closeSidebar() {
  showSidebar.value = false
  selectedCtoon.value = null
}
function sendMessage() {
  if (!user.value || !socket) return
  const msg = {
    zone: username.value,
    user: user.value.username,
    message: newMessage.value
  }
  socket.emit('chat-message', msg)
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
  newMessage.value = ''
}

// ——— Per‐user cZone navigation (Previous/Next/Random viewer) ———
async function goToPreviousUser() {
  try {
    const res = await $fetch(`/api/czone/${username.value}/previous`)
    if (res?.username) {
      router.push(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch previous user:', err)
  }
}
async function goToNextUser() {
  try {
    const res = await $fetch(`/api/czone/${username.value}/next`)
    if (res?.username) {
      router.push(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch next user:', err)
  }
}
async function goToRandomUser() {
  try {
    const res = await $fetch(`/api/czone/${username.value}/random`)
    if (res?.username) {
      router.push(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch random user:', err)
  }
}

const editPath = computed(() => `/edit`)

const canvasBackgroundStyle = computed(() => {
  const bg = currentZone.value.background
  if (!bg || typeof bg !== 'string') {
    return { backgroundColor: 'transparent' }
  }
  return {
    backgroundImage: `url(/backgrounds/${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
})

onMounted(async () => {
  recalcScale()
  window.addEventListener('resize', recalcScale)

  await fetchSelf()

  // 1) Fetch the owner’s cZone from your back end
  try {
    const res = await $fetch(`/api/czone/${username.value}`)
    ownerName.value = res.ownerName
    ownerAvatar.value = res.avatar || '/avatars/default.png'
    ownerId.value = res.ownerId

    if (
      res.cZone?.zones &&
      Array.isArray(res.cZone.zones) &&
      res.cZone.zones.length === 3
    ) {
      // Overwrite the three‐zone array in one go
      zones.value = res.cZone.zones.map(z => ({
        background: typeof z.background === 'string' ? z.background : '',
        toons: Array.isArray(z.toons) ? z.toons : []
      }))
    } else {
      // Fallback to old shape if needed
      zones.value = [
        { background: res.cZone?.background || '', toons: res.cZone?.layoutData || [] },
        { background: '', toons: [] },
        { background: '', toons: [] }
      ]
    }

    // Award a visit if viewer ≠ owner
    if (user.value && res.ownerId !== user.value.id) {
      await $fetch('/api/points/visit', {
        method: 'POST',
        body: { zoneOwnerId: res.ownerId }
      })
      await fetchSelf()
    }
  } catch (err) {
    console.error('Failed to fetch cZone:', err)
    // Clear out if something went wrong
    zones.value = [
      { background: '', toons: [] },
      { background: '', toons: [] },
      { background: '', toons: [] }
    ]
    ownerAvatar.value = '/avatars/default.png'
  } finally {
    loading.value = false
  }

  // 2) Set up socket.io listeners for chats/visitor count
  socket.emit('join-zone', { zone: username.value })
  socket.on('visitor-count', count => {
    visitorCount.value = count
  })
  socket.on('chat-message', msg => {
    chatMessages.value.push(msg)
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
})

onBeforeUnmount(() => {
  if (socket && username.value) {
    socket.emit('leave-zone', { zone: username.value })
  }
  window.removeEventListener('resize', recalcScale)
})

// 3) Watch for route changes if the user navigates to a different person’s cZone
watch(
  () => route.params.username,
  async (newUsername, oldUsername) => {
    if (socket && oldUsername) {
      socket.emit('leave-zone', { zone: oldUsername })
    }
    username.value = newUsername
    loading.value = true

    try {
      const res = await $fetch(`/api/czone/${newUsername}`)
      ownerName.value = res.ownerName
      ownerAvatar.value = res.avatar || '/avatars/default.png'
      ownerId.value = res.ownerId

      if (
        res.cZone?.zones &&
        Array.isArray(res.cZone.zones) &&
        res.cZone.zones.length === 3
      ) {
        zones.value = res.cZone.zones.map(z => ({
          background: typeof z.background === 'string' ? z.background : '',
          toons: Array.isArray(z.toons) ? z.toons : []
        }))
      } else {
        zones.value = [
          { background: res.cZone?.background || '', toons: res.cZone?.layoutData || [] },
          { background: '', toons: [] },
          { background: '', toons: [] }
        ]
      }

      if (socket && socket.connected) {
        await nextTick()
        socket.emit('join-zone', { zone: newUsername })
      }
    } catch (err) {
      console.error('Failed to fetch cZone on route change:', err)
      zones.value = [
        { background: '', toons: [] },
        { background: '', toons: [] },
        { background: '', toons: [] }
      ]
    } finally {
      loading.value = false
    }
  }
)
</script>


<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}
.slide-enter-from {
  transform: translateX(100%);
}
.slide-leave-to {
  transform: translateX(100%);
}
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 0.3s ease;
}
.slide-panel-enter-from {
  transform: translateX(100%);
}
.slide-panel-leave-to {
  transform: translateX(100%);
}
</style>
