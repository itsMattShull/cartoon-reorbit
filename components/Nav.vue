<template>
  <!-- hamburger button / top bar -->
  <header class="fixed top-0 left-0 w-full h-14 bg-gray-800 flex items-center px-4 z-40">
    <button @click="isOpen = true" class="text-white focus:outline-none" aria-label="Open navigation">
      <!-- hamburger icon -->
      <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
    <h1 class="text-white text-xl font-semibold ml-4">Cartoon ReOrbit</h1>
  </header>

  <!-- overlay -->
  <transition name="fade">
    <div v-if="isOpen" @click="close" class="fixed inset-0 bg-black bg-opacity-50 z-40"></div>
  </transition>

  <!-- sidebar -->
  <transition name="slide">
    <aside v-if="isOpen" class="fixed top-0 left-0 h-full w-64 bg-gray-900 text-white z-50 flex flex-col pt-16 shadow-lg">
      <nav class="flex-1 overflow-y-auto">
        <NuxtLink
          v-for="item in links"
          :key="item.to"
          :to="item.to"
          class="block px-6 py-3 hover:bg-gray-800"
          @click.native="close"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
      <button @click="handleLogout" class="w-full text-left px-6 py-3 bg-red-600 hover:bg-red-700">
        Logout
      </button>
    </aside>
  </transition>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuth } from '~/composables/useAuth'

const isOpen = ref(false)
function close() {
  isOpen.value = false
}

const { logout, user } = useAuth()

async function handleLogout() {
  await logout()
  close()
}

const baseLinks = [
  { label: 'Showcase', to: '/dashboard' },
  { label: 'My cZone', to: user.value?.username ? `/czone/${user.value.username}` : '/dashboard' },
  { label: 'Collection', to: '/collection' },
  { label: 'cMart', to: '/cmart' },
  { label: 'Live Trading', to: '/live-trading' },
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
      { label: 'Auth Logs', to: '/admin/auth-logs' }
    )
  }
  return all
})
</script>

<style scoped>
/* slide-in sidebar */
.slide-enter-from { transform: translateX(-100%); }
.slide-enter-active { transition: transform 0.25s ease; }
.slide-leave-to { transform: translateX(-100%); }
.slide-leave-active { transition: transform 0.25s ease; }

/* fade overlay */
.fade-enter-from, .fade-leave-to { opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
</style>
