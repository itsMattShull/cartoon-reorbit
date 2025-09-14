<template>
  <!-- Top bar -->
  <header class="fixed top-0 left-0 w-full h-16 backdrop-blur border-b border-[color:var(--reorbit-border)] flex items-center px-4 z-50" style="background: var(--reorbit-navy)">
    <button
      @click="isOpen = true"
      class="relative text-[var(--reorbit-deep)] focus:outline-none"
      aria-label="Open navigation"
    >
      <span
        v-if="pendingCount > 0 && !isOnTradeOffersPage"
        class="absolute -top-1 -left-1 h-7 w-7 rounded-full bg-[var(--reorbit-lime)]/70 opacity-75 animate-ping"
      />
      <svg class="w-7 h-7 relative" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>

    <NuxtLink to="/" class="flex items-center gap-3 ml-3">
      <img src="/images/logo-reorbit.png" alt="Cartoon ReOrbit logo" class="h-20 w-auto" />
      <span class="sr-only">Cartoon ReOrbit</span>
    </NuxtLink>
  </header>

  <!-- overlay -->
  <transition name="fade">
    <div v-if="isOpen" @click="close" class="fixed inset-0 bg-[var(--reorbit-deep)]/50 z-40"></div>
  </transition>

  <!-- sidebar -->
  <transition name="slide">
    <aside
      v-if="isOpen"
      class="fixed top-0 left-0 h-full w-72 bg-white text-slate-900 z-50 flex flex-col shadow-xl border-r border-[color:var(--reorbit-border)]"
    >
      <!-- brand strip -->
      <div class="h-16 px-5 flex items-center gap-3 border-b border-[color:var(--reorbit-border)]">
        <img src="/images/logo-reorbit.png" alt="Cartoon ReOrbit" class="h-8 w-auto" />
        <span class="text-sm text-[var(--reorbit-blue)] font-semibold">Cartoon ReOrbit</span>
        <button @click="close" class="ml-auto text-slate-500 hover:text-[var(--reorbit-blue)]" aria-label="Close nav">✕</button>
      </div>

      <nav class="flex-1 overflow-y-auto py-2">
        <NuxtLink
          v-for="item in links"
          :key="item.to"
          :to="item.to"
          @click="close"
          class="block px-5 py-3 transition rounded-lg mx-3 my-1 flex justify-between items-center"
          :class="isActive(item.to)
            ? 'bg-[var(--reorbit-cyan-transparent)] text-[var(--reorbit-blue)] font-semibold'
            : 'hover:bg-[var(--reorbit-tint)]'"
        >
          <span class="truncate">{{ item.label }}</span>

          <!-- trade offers badge -->
          <span
            v-if="item.to === '/trade-offers' && pendingCount > 0"
            class="inline-block bg-[var(--reorbit-purple)] text-white text-xs font-semibold px-2 py-0.5 rounded-full"
          >
            {{ pendingCount }}
          </span>

          <!-- auctions badge -->
          <span
            v-if="item.to === '/auctions' && activeCount > 0"
            class="inline-block bg-[var(--reorbit-cyan)] text-[var(--reorbit-deep)] text-xs font-semibold px-2 py-0.5 rounded-full"
          >
            {{ activeCount }}
          </span>
        </NuxtLink>
      </nav>

      <button
        @click="handleLogout"
        class="m-3 mb-4 w-auto text-[var(--reorbit-deep)] rounded-lg px-4 py-2 bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] hover:brightness-95 font-medium"
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
const close = () => { isOpen.value = false }

const { logout, user } = useAuth()
const handleLogout = async () => { await logout(); close() }

const route = useRoute()
const isOnTradeOffersPage = computed(() => route.path === '/trade-offers')
const isActive = (to) => route.path === to

const pendingCount = ref(0)
const activeCount = ref(0)

onMounted(async () => {
  if (user.value) {
    try {
      const offers = await $fetch('/api/trade/offers/incoming')
      pendingCount.value = offers.filter(o => o.status === 'PENDING').length

      const auctions = await $fetch('/api/auctions')
      activeCount.value = Array.isArray(auctions) ? auctions.length : 0
    } catch (err) {
      console.error('Failed to fetch counts:', err)
    }
  }
})

const baseLinks = [
  { label: 'Showcase', to: '/dashboard' },
  { label: 'My cZone', to: user.value?.username ? `/czone/${user.value.username}` : '/dashboard' },
  { label: 'Collection', to: '/collection' },
  { label: 'cMart', to: '/cmart' },
  { label: 'Auctions', to: '/auctions' },
  { label: 'Live Trading', to: '/live-trading' },
  { label: 'Trade Offers', to: '/trade-offers' },
  { label: 'Redeem Code', to: '/redeem' },
  { label: 'Winball', to: '/games/winball' },
  { label: 'Win Wheel', to: '/games/winwheel' },
  { label: 'gToons Clash', to: '/games/clash/rooms' }
]

const links = computed(() => {
  const all = [...baseLinks]
  if (user.value?.isAdmin) {
    all.push(
      { label: 'Admin', to: '/admin' },
      { label: 'Manage Users', to: '/admin/users' },
      { label: 'Manage cToons', to: '/admin/ctoons' },
      { label: 'Manage Starter Sets', to: '/admin/starter-sets' },
      { label: 'Manage Codes', to: '/admin/codes' },
      { label: 'Manage Packs', to: '/admin/packs' },
      { label: 'Manage Games', to: '/admin/games' },
      { label: 'Manage Holiday Events', to: '/admin/holidayevents' },
      { label: 'Manage Backgrounds', to: '/admin/backgrounds' },
      { label: 'Auction Logs', to: '/admin/auctions' },
      { label: 'Trade Logs', to: '/admin/trades' },
      { label: 'Auth Logs', to: '/admin/auth-logs' },
      { label: 'cToon Owner Logs', to: '/admin/ctoonOwnerLogs' },
      { label: 'Point Logs', to: '/admin/points-log' },
      { label: 'gToons Clash Logs', to: '/admin/gtoons-logs' },
      { label: 'Win Wheel Logs', to: '/admin/winwheellogs' }
    )
  }
  return all
})
</script>

<style scoped>
/* ping */
@keyframes ping { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(2);opacity:0} }
.animate-ping { animation: ping 1s cubic-bezier(0,0,0.2,1) infinite }

/* slide-in */
.slide-enter-from { transform: translateX(-100%) }
.slide-enter-active { transition: transform .25s ease }
.slide-leave-to { transform: translateX(-100%) }
.slide-leave-active { transition: transform .25s ease }

/* fade */
.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity .25s ease }
</style>
