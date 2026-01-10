<template>
  <!-- Top bar -->
  <header
    id="nav-root"
    class="fixed top-0 left-0 w-full backdrop-blur border-b border-[color:var(--reorbit-border)] z-50"
    style="background: var(--reorbit-navy)"
  >
    <div class="mx-auto w-full max-w-[1200px] flex items-center px-4 lg:px-0 lg:pl-10 py-6 md:py-8 relative">
      <button @click="isOpen = true" class="relative focus:outline-none" aria-label="Open navigation">
        <span v-if="pendingCount > 0 && !isOnTradeOffersPage" class="absolute -top-1 -left-1 h-7 w-7 rounded-full bg-[var(--reorbit-lime)]/70 opacity-75 animate-ping"/>
        <svg
          class="w-7 h-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <!-- increased spacing: y=4,12,20 -->
          <line x1="3" y1="4"  x2="21" y2="4"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="20" x2="21" y2="20" />
        </svg>
      </button>

      <!-- logo: right on small, centered on md+ -->
      <NuxtLink
        v-if="!hasAdUrl"
        to="/dashboard"
        class="absolute inset-y-0 left-1/2 -translate-x-1/2 right-auto flex items-center gap-3"
      >
        <img :src="currentAdSrc || '/images/logo-reorbit.png'" alt="Cartoon ReOrbit logo" class="max-h-20 max-w-[300px] w-auto h-auto object-contain md:h-20 md:max-h-none md:max-w-none" />
        <span class="sr-only">Cartoon ReOrbit</span>
      </NuxtLink>
      <a
        v-else
        :href="currentAdUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="absolute inset-y-0 left-1/2 -translate-x-1/2 right-auto flex items-center gap-3"
      >
        <img :src="currentAdSrc || '/images/logo-reorbit.png'" alt="Cartoon ReOrbit logo" class="max-h-20 max-w-[300px] w-auto h-auto object-contain md:h-20 md:max-h-none md:max-w-none" />
        <span class="sr-only">Cartoon ReOrbit</span>
      </a>

      <div
        class="hidden md:block ml-auto inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--reorbit-deep)]
              bg-gradient-to-br from-[var(--reorbit-lime)] to-[var(--reorbit-green-2)] shadow hover:brightness-95"
        aria-label="Sign in with Discord"
      >
        Points: {{ user?.points ?? 0 }}
      </div>
    </div>
  </header>

  <!-- overlay -->
  <transition name="fade">
    <div v-if="isOpen" @click="close" class="fixed inset-0 bg-[var(--reorbit-deep)]/50 z-40"></div>
  </transition>
  

  <!-- sidebar -->
  <transition name="slide">
    <aside
      v-if="isOpen"
      id="nav-drawer"
      class="fixed inset-y-0 left-0 w-80 bg-white text-slate-900 z-50 flex flex-col shadow-xl border-r border-[color:var(--reorbit-border)]"
    >
      <!-- brand -->
      <div class="h-16 px-5 flex items-center gap-3 border-b border-[color:var(--reorbit-border)]">
        <img src='/images/logo-reorbit.png' alt="Cartoon ReOrbit" class="h-8 w-auto" />
        <span class="text-sm text-[var(--reorbit-blue)] font-semibold">Cartoon ReOrbit</span>
        <button @click="close" class="ml-auto text-slate-500 hover:text-[var(--reorbit-blue)]" aria-label="Close nav">✕</button>
      </div>

      <!-- links -->
      <nav class="flex-1 overflow-y-auto py-2 space-y-4">
        <!-- main -->
        <div>
          <NuxtLink
            v-for="item in filteredMain"
            :key="item.to"
            :to="item.to"
            @click="close"
            class="block px-5 py-2.5 transition rounded-lg mx-3 my-0.5 flex justify-between items-center"
            :class="isActive(item.to)
              ? 'bg-[var(--reorbit-cyan-transparent)] text-[var(--reorbit-blue)] font-semibold'
              : 'hover:bg-[var(--reorbit-tint)]'"
          >
            <span class="truncate">{{ item.label }}</span>

            <span
              v-if="item.to === '/trade-offers' && pendingCount > 0"
              class="inline-block bg-[var(--reorbit-purple)] text-white text-xs font-semibold px-2 py-0.5 rounded-full"
            >{{ pendingCount }}</span>

            <span
              v-if="item.to === '/auctions' && activeCount > 0"
              class="inline-block bg-[var(--reorbit-cyan)] text-[var(--reorbit-deep)] text-xs font-semibold px-2 py-0.5 rounded-full"
            >{{ activeCount }}</span>
          </NuxtLink>
        </div>

        <!-- admin groups -->
        <template v-if="user?.isAdmin">
          <div
            v-for="group in adminGroups"
            :key="group.key"
            class="pt-2 border-t border-[color:var(--reorbit-border)]"
          >
            <button
              class="w-full flex items-center justify-between px-5 py-2 text-left text-sm font-semibold"
              @click="toggle(group.key)"
            >
              <span>{{ group.title }}</span>
              <span class="text-slate-400">{{ open[group.key] || q ? '−' : '+' }}</span>
            </button>

            <div v-show="open[group.key] || q">
              <NuxtLink
                v-for="item in filteredAdmin(group)"
                :key="item.to"
                :to="item.to"
                @click="close"
                class="block px-5 py-2.5 transition rounded-lg mx-3 my-0.5 hover:bg-[var(--reorbit-tint)]"
                :class="isActive(item.to)
                  ? 'bg-[var(--reorbit-cyan-transparent)] text-[var(--reorbit-blue)] font-semibold'
                  : ''"
              >
                <span class="truncate">{{ item.label }}</span>
              </NuxtLink>
            </div>
          </div>
        </template>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useRoute } from 'vue-router'

const isOpen = ref(false)
const close  = () => { isOpen.value = false }

const { logout, user, fetchSelf } = useAuth()
await fetchSelf().catch(() => {})

const handleLogout = async () => { await logout(); close() }

const route = useRoute()
const isOnTradeOffersPage = computed(() => route.path === '/trade-offers')
const isActive = (to) => route.path === to

const pendingCount = ref(0)
const activeCount  = ref(0)

onMounted(async () => {
  if (user.value) {
    try {
      const offers = await $fetch('/api/trade/offers/incoming')
      pendingCount.value = offers.filter(o => o.status === 'PENDING').length
    } catch {}
    try {
      const auctions = await $fetch('/api/auctions')
      activeCount.value = Array.isArray(auctions) ? auctions.length : 0
    } catch {}
  }
})

/* search */
const q = ref('')

/* main links */
const mainLinks = [
  { label: 'Showcase', to: '/dashboard' },
  { label: 'My cZone', to: user.value?.username ? `/czone/${user.value.username}` : '/dashboard' },
  { label: 'Collection', to: '/collection' },
  { label: 'Achievements', to: '/achievements' },
  { label: 'cMart', to: '/cmart' },
  { label: 'Auctions', to: '/auctions' },
  { label: 'Live Trading', to: '/live-trading' },
  { label: 'Trade Offers', to: '/trade-offers' },
  { label: 'Redeem Code', to: '/redeem' },
  { label: 'Winball', to: '/games/winball' },
  { label: 'Win Wheel', to: '/games/winwheel' },
  { label: 'Lottery', to: '/lottery' },
  { label: 'Monsters', to: '/monsters' },
  { label: 'gToons Clash', to: '/games/clash/rooms' }, 
  { label: 'Settings', to: '/settings' }
]

const filteredMain = computed(() =>
  !q.value
    ? mainLinks
    : mainLinks.filter(l => l.label.toLowerCase().includes(q.value.toLowerCase()))
)

/* admin grouped */
const adminGroups = [
  {
    key: 'admin-core',
    title: 'Admin — Core',
    items: [
      { label: 'Analytics', to: '/admin' },
      { label: 'Manage Users', to: '/admin/users' },
      { label: 'Manage Homepage', to: '/admin/manage-homepage' },
      { label: 'Global Settings', to: '/admin/global-settings' },
      { label: 'Manage Ads', to: '/admin/manage-ads' },
      { label: 'Manage Announcements', to: '/admin/announcements' },
      { label: 'Admin Changes', to: '/admin/admin-changes' }
    ]
  },
      {
        key: 'content',
        title: 'Admin — Content',
        items: [
          { label: 'Manage cToons', to: '/admin/ctoons' },
          { label: 'Initiate Trade', to: '/admin/initiate-trade' },
          { label: 'Manage Packs', to: '/admin/packs' },
          { label: 'Manage Starter Sets', to: '/admin/starter-sets' },
          { label: 'Manage Backgrounds', to: '/admin/backgrounds' },
          { label: 'Manage Codes', to: '/admin/codes' },
          { label: 'Manage Monsters', to: '/admin/manage-monster' },
          { label: 'Manage Lotto', to: '/admin/manage-lotto' },
          { label: 'Manage Games', to: '/admin/games' },
          { label: 'Manage Scavenger Hunt', to: '/admin/scavenger' },
          { label: 'Manage Holiday Events', to: '/admin/holidayevents' },
          { label: 'Manage Auction Only', to: '/admin/manage-auctions' },
      { label: 'Manage Achievements', to: '/admin/achievements' }
    ]
  },
  {
    key: 'logs',
    title: 'Admin — Logs',
    items: [
      { label: 'Check Cheating', to: '/admin/check-cheating' },
      { label: 'Auction Logs', to: '/admin/auctions' },
      { label: 'Trade Logs', to: '/admin/trades' },
      { label: 'Auth Logs', to: '/admin/auth-logs' },
      { label: 'cToon Owner Logs', to: '/admin/ctoonOwnerLogs' },
      { label: 'Point Logs', to: '/admin/points-log' },
      { label: 'Achievement Logs', to: '/admin/achievement-logs' },
      { label: 'gToons Clash Logs', to: '/admin/gtoons-logs' },
      { label: 'Monster Battle Logs', to: '/admin/manage-monster-battles' },
      { label: 'Lotto Logs', to: '/admin/lotto-logs' },
      { label: 'Win Wheel Logs', to: '/admin/winwheellogs' },
      { label: 'Scavenger Logs', to: '/admin/scavenger-logs' }
    ]
  }
]

/* accordion state */
const open = ref({
  'admin-core': false,
  content: false,
  games: false,
  logs: false,
  tools: false
})

function toggle(key) { open.value[key] = !open.value[key] }

/* filter per group */
function filteredAdmin(group) {
  if (!q.value) return group.items
  const term = q.value.toLowerCase()
  return group.items.filter(i => i.label.toLowerCase().includes(term))
}

/* ──────────────────────────────────────────────────────────────
   Ad image rotation for logo
   - Pull from /api/ads
   - GIF: rotate after one loop duration
   - PNG/JPG/JPEG/WEBP/SVG: rotate every 8s
   ──────────────────────────────────────────────────────────── */
const currentAdSrc = ref('')
const currentAdUrl = ref('')
const hasAdUrl = computed(() => !!currentAdUrl.value)
let adOrder = []
let adIdx = 0
let timer = null
const gifDurCache = new Map() // url -> ms
const abortCtrl = new AbortController()

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nextAd() {
  if (!adOrder.length) return
  adIdx = (adIdx + 1) % adOrder.length
  const current = adOrder[adIdx]
  currentAdSrc.value = current?.imagePath || ''
  currentAdUrl.value = (current?.url || '').trim()
  scheduleNext()
}

function extOf(url) {
  try {
    const u = new URL(url, window.location.origin)
    const pathname = u.pathname.toLowerCase()
    const m = pathname.match(/\.(gif|png|jpe?g|webp|svg)$/i)
    return m ? m[1] : ''
  } catch {
    const m = (url || '').toLowerCase().match(/\.(gif|png|jpe?g|webp|svg)(?:\?|#|$)/i)
    return m ? m[1] : ''
  }
}

// Minimal GIF duration parser (sum frame delays once)
async function getGifDurationMs(url) {
  if (gifDurCache.has(url)) return gifDurCache.get(url)
  const res = await fetch(url, { signal: abortCtrl.signal })
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  // header check
  if (bytes.length < 6 || (String.fromCharCode(...bytes.slice(0,3)) !== 'GIF')) {
    gifDurCache.set(url, 6000) // fallback 6s
    return 6000
  }
  let i = 6 + 7 // skip header + logical screen descriptor
  // skip global color table if present
  const gctFlag = (bytes[10] & 0x80) !== 0
  if (gctFlag) {
    const gctSize = 3 * (2 ** ((bytes[10] & 0x07) + 1))
    i += gctSize
  }
  let totalHundredths = 0
  let lastDelay = 0
  while (i < bytes.length) {
    const b = bytes[i++]
    if (b === 0x3B) break // trailer
    if (b === 0x21) { // extension
      const label = bytes[i++]
      if (label === 0xF9) { // Graphic Control Extension
        const blockSize = bytes[i++] // should be 4
        if (blockSize === 4) {
          const packed = bytes[i]     // not used
          const delayLo = bytes[i+1]
          const delayHi = bytes[i+2]
          lastDelay = (delayHi << 8) | delayLo // hundredths
          i += 4 // skip rest of GCE (delay, trans idx)
        } else {
          i += blockSize
        }
        i++ // block terminator 0x00
      } else {
        // skip sub-blocks
        let size = bytes[i++]
        while (size && i < bytes.length) {
          i += size
          size = bytes[i++]
        }
      }
    } else if (b === 0x2C) { // Image Descriptor
      // consume descriptor (9 bytes)
      i += 9
      // local color table?
      const packed = bytes[i-1]
      if ((packed & 0x80) !== 0) {
        const lctSize = 3 * (2 ** ((packed & 0x07) + 1))
        i += lctSize
      }
      // LZW min code size
      i++
      // image data sub-blocks
      let size = bytes[i++]
      while (size && i < bytes.length) {
        i += size
        size = bytes[i++]
      }
      // add delay for this frame; browsers treat 0 as 10 (100ms) commonly
      const d = Math.max(lastDelay, 1) // at least 1 hundredth
      totalHundredths += d
      lastDelay = 0
    } else {
      // unknown block, stop to be safe
      break
    }
  }
  const ms = Math.max(totalHundredths * 10, 500) // min 0.5s safety
  gifDurCache.set(url, ms)
  return ms
}

async function scheduleNext() {
  clearTimeout(timer)
  const src = currentAdSrc.value
  if (!src) return
  const extension = extOf(src)
  try {
    if (extension === 'gif') {
      const ms = await getGifDurationMs(src)
      timer = setTimeout(nextAd, ms)
    } else {
      timer = setTimeout(nextAd, 8000)
    }
  } catch {
    // fallback
    timer = setTimeout(nextAd, 8000)
  }
}

async function initAds() {
  try {
    const res = await $fetch('/api/ads', { params: { take: 100 } })
    const items = Array.isArray(res?.items) ? res.items : []
    const ads = items
      .filter(i => i?.imagePath)
      .map(i => ({ imagePath: i.imagePath, url: i?.url || '' }))
    if (!ads.length) return
    adOrder = shuffle(ads)
    adIdx = Math.floor(Math.random() * adOrder.length)
    const current = adOrder[adIdx]
    currentAdSrc.value = current?.imagePath || ''
    currentAdUrl.value = (current?.url || '').trim()
    scheduleNext()
  } catch {
    // ignore, keep default logo
  }
}

onMounted(() => { initAds() })
onBeforeUnmount(() => {
  clearTimeout(timer)
  abortCtrl.abort()
})
</script>

<style scoped>
@keyframes ping { 0%{transform:scale(1);opacity:1} 75%,100%{transform:scale(2);opacity:0} }
.animate-ping { animation: ping 1s cubic-bezier(0,0,0.2,1) infinite }

.slide-enter-from { transform: translateX(-100%) }
.slide-enter-active { transition: transform .25s ease }
.slide-leave-to { transform: translateX(-100%) }
.slide-leave-active { transition: transform .25s ease }

.fade-enter-from, .fade-leave-to { opacity: 0 }
.fade-enter-active, .fade-leave-active { transition: opacity .25s ease }

/* force theme */
#nav-root { background: var(--reorbit-navy) !important; color: #fff !important; border-color: var(--reorbit-border) !important; }
#nav-root svg { stroke: #fff !important; }

#nav-drawer {
  background: #fff !important; color: #0f172a !important; border-color: var(--reorbit-border) !important;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / .1), 0 4px 6px -4px rgb(0 0 0 / .1) !important;
  height: 100dvh; padding-bottom: env(safe-area-inset-bottom);
}

/* badges colors */
#nav-drawer .bg-\[var\(--reorbit-purple\)\] { background: var(--reorbit-purple) !important; color: #fff !important; }
#nav-drawer .bg-\[var\(--reorbit-cyan\)\]   { background: var(--reorbit-cyan) !important; color: var(--reorbit-deep) !important; }

/* keep link colors consistent */
#nav-drawer a, #nav-drawer button { color: inherit !important; }
</style>
