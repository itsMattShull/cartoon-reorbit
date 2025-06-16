<template>
  <!-- hamburger button / top bar -->
  <header class="fixed top-0 left-0 w-full h-14 bg-gray-800 flex items-center px-4 z-40">
    <button
      @click="isOpen = true"
      class="relative text-white focus:outline-none"
      aria-label="Open navigation"
    >
      <!-- sparkle animation only if NOT on Trade Offers page AND there are pending offers -->
      <span
        v-if="pendingCount > 0 && !isOnTradeOffersPage"
        class="absolute inset-0 rounded-full bg-yellow-400 opacity-75 animate-ping"
        style="top: -4px; left: -5px"
      ></span>
      <!-- hamburger icon -->
      <svg
        class="w-7 h-7 relative"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
    <h1 class="text-white text-xl font-semibold ml-4">Cartoon ReOrbit</h1>
  </header>

  <!-- overlay -->
  <transition name="fade">
    <div
      v-if="isOpen"
      @click="close"
      class="fixed inset-0 bg-black bg-opacity-50 z-40"
    ></div>
  </transition>

  <!-- sidebar -->
  <transition name="slide">
    <aside
      v-if="isOpen"
      class="fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-50 flex flex-col pt-16 shadow-lg"
    >
      <nav class="flex-1 overflow-y-auto">
        <NuxtLink
          v-for="item in links"
          :key="item.to"
          :to="item.to"
          class="block px-6 py-3 hover:bg-gray-800 flex justify-between items-center"
          @click.native="close"
        >
          <span>{{ item.label }}</span>

          <!-- badge for trade-offers -->
          <span
            v-if="item.to === '/trade-offers' && pendingCount > 0"
            class="inline-block bg-red-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full"
          >
            {{ pendingCount }}
          </span>

          <!-- badge for auctions -->
          <span
            v-if="item.to === '/auctions' && activeCount > 0"
            class="inline-block bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full"
          >
            {{ activeCount }}
          </span>
        </NuxtLink>
      </nav>
      <button
        @click="handleLogout"
        class="w-full text-left px-6 py-3 bg-red-600 hover:bg-red-700"
      >
        Logout
      </button>
    </aside>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useRoute } from 'vue-router'

const isOpen = ref(false)
function close() {
  isOpen.value = false
}

const { logout, user } = useAuth()
async function handleLogout() {
  await logout()
  close()
}

// detect if we're on /trade-offers
const route = useRoute()
const isOnTradeOffersPage = computed(() => route.path === '/trade-offers')

// pending incoming offers count
const pendingCount = ref(0)
// active auctions count
const activeCount = ref(0)

onMounted(async () => {
  if (user.value) {
    try {
      // fetch incoming trade offers
      const offers = await $fetch('/api/trade/offers/incoming')
      pendingCount.value = offers.filter(o => o.status === 'PENDING').length

      // fetch active auctions
      const auctions = await $fetch('/api/auctions')
      activeCount.value = Array.isArray(auctions) ? auctions.length : 0
    } catch (err) {
      console.error('Failed to fetch counts:', err)
    }
  }
})

const baseLinks = [
  { label: 'Showcase', to: '/dashboard' },
  {
    label: 'My cZone',
    to: user.value?.username ? `/czone/${user.value.username}` : '/dashboard'
  },
  { label: 'Collection', to: '/collection' },
  { label: 'cMart', to: '/cmart' },
  { label: 'Auctions', to: '/auctions' },
  { label: 'Live Trading', to: '/live-trading' },
  { label: 'Trade Offers', to: '/trade-offers' },
  { label: 'Redeem Code', to: '/redeem' },
  { label: 'Winball', to: '/games/winball' }
]

const links = computed(() => {
  const all = [...baseLinks]
  if (user.value?.isAdmin) {
    all.push(
      { label: 'Admin', to: '/admin' },
      { label: 'Manage cToons', to: '/admin/ctoons' },
      { label: 'Manage Codes', to: '/admin/codes' },
      { label: 'Manage Packs', to: '/admin/packs' },
      { label: 'Manage Games', to: '/admin/games' },
      { label: 'Auction Logs', to: '/admin/auctions' },
      { label: 'Trade Logs', to: '/admin/trades' },
      { label: 'Auth Logs', to: '/admin/auth-logs' }
    )
  }
  return all
})
</script>

<style scoped>
/* sparkle ping effect */
.animate-ping {
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes ping {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* slide-in sidebar */
.slide-enter-from { transform: translateX(-100%); }
.slide-enter-active { transition: transform 0.25s ease; }
.slide-leave-to { transform: translateX(-100%); }
.slide-leave-active { transition: transform 0.25s ease; }

/* fade overlay */
.fade-enter-from, .fade-leave-to { opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
</style>
