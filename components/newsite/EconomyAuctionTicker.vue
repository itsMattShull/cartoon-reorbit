<template>
  <div class="aat">
    <span class="aat-label">Live Top Auctions</span>

    <!-- Native horizontal scroll (not aria-hidden): unlike the old single-card
         "Recent Sales" ticker it replaces, every item here is a real,
         independently-actionable link into a live auction, so hiding the
         track from assistive tech would hide real functionality, not just a
         decorative rotation. Tabbing through it reaches every button in
         visual order; the calm aria-live line below is only the ambient
         "what's in the lead right now" summary, on top of that. -->
    <div
      ref="trackEl"
      class="aat-track"
      @mouseenter="hovering = true"
      @mouseleave="hovering = false"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
      @touchcancel.passive="onTouchEnd"
    >
      <button
        v-for="item in auctions"
        :key="item.auctionId"
        type="button"
        class="aat-item"
        @click="openAuction(item.auctionId)"
      >
        <img
          v-if="item.assetPath"
          :src="item.assetPath"
          :alt="item.ctoonName"
          class="aat-thumb"
          draggable="false"
        />
        <span class="aat-item-text">
          <span class="aat-item-name">{{ item.ctoonName }}</span>
          <span class="aat-item-bid">{{ formatPoints(item.highestBid) }} pts</span>
        </span>
      </button>

      <span v-if="!auctions.length" class="aat-empty">
        {{ loaded ? 'No active auctions with bids right now.' : 'Loading live auctions…' }}
      </span>
    </div>

    <p class="sr-only" aria-live="polite">{{ srLiveText }}</p>

    <EconomyAuctionViewModal
      v-if="openAuctionId"
      :auction-id="openAuctionId"
      @close="closeAuction"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const POLL_MS = 15000
const TOUCH_RESUME_DELAY_MS = 2500
// Gentle enough to read a name while it passes, matching the calm pace of the
// ticker this replaces rather than a genuinely fast stock-ticker scroll.
const SCROLL_SPEED_PX_PER_SEC = 28

const config = useRuntimeConfig()

const auctions = ref([])
const loaded = ref(false)
const openAuctionId = ref(null)

const trackEl = ref(null)
const hovering = ref(false)
const touching = ref(false)
const pageHidden = ref(false)
const reducedMotion = ref(false)

const modalOpen = computed(() => openAuctionId.value != null)
const scrolling = computed(() =>
  !hovering.value && !touching.value && !pageHidden.value && !reducedMotion.value && !modalOpen.value
)

function formatPoints(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString()
}

const srLiveText = computed(() => {
  const top = auctions.value[0]
  if (!top) return loaded.value ? 'No active auctions with bids right now.' : 'Loading live auctions.'
  return `Top live auction: ${top.ctoonName}, current bid ${formatPoints(top.highestBid)} points.`
})

function openAuction(auctionId) {
  openAuctionId.value = auctionId
}
function closeAuction() {
  openAuctionId.value = null
}

// ── Auto-scroll: JS-driven (not a CSS keyframe marquee) so it can be started
// and fully stopped rather than just visually paused — no animation runs at
// all while hovering/touching/hidden/reduced-motion/a modal is open, which is
// most of the time a real visitor has this page open. ──
let rafHandle = null
let lastTs = null

function scrollStep(ts) {
  if (lastTs == null) lastTs = ts
  const dt = ts - lastTs
  lastTs = ts
  const track = trackEl.value
  if (track) {
    const maxScroll = track.scrollWidth - track.clientWidth
    if (maxScroll > 1) {
      let next = track.scrollLeft + (SCROLL_SPEED_PX_PER_SEC * dt) / 1000
      if (next >= maxScroll) next = 0
      track.scrollLeft = next
    }
  }
  rafHandle = requestAnimationFrame(scrollStep)
}

function startScroll() {
  if (rafHandle != null) return
  lastTs = null
  rafHandle = requestAnimationFrame(scrollStep)
}
function stopScroll() {
  if (rafHandle != null) cancelAnimationFrame(rafHandle)
  rafHandle = null
}

// No `immediate: true` here — this runs during setup(), which also executes
// on the server during SSR, and requestAnimationFrame doesn't exist there.
// onMounted (client-only) kicks off the initial state below instead.
watch(scrolling, (on) => { if (on) startScroll(); else stopScroll() })

let resumeTimeout = null
function onTouchStart() {
  touching.value = true
  if (resumeTimeout) {
    clearTimeout(resumeTimeout)
    resumeTimeout = null
  }
}
function onTouchEnd() {
  // Give the user a moment before the strip moves again under their thumb.
  resumeTimeout = setTimeout(() => { touching.value = false }, TOUCH_RESUME_DELAY_MS)
}

// ── Data + socket rooms ──────────────────────────────────────────────────
// The 15s poll is the safety net that catches a new auction entering the top
// 10 or the ranking reordering; the socket rooms below are what make an
// already-shown auction's bid amount update instantly instead of waiting out
// the rest of that cycle.
let socket = null
const joinedIds = new Set()

function diffSocketRooms(list) {
  if (!socket || !socket.connected) return
  const nextIds = new Set(list.map(a => String(a.auctionId)))
  for (const id of joinedIds) {
    if (!nextIds.has(id)) {
      socket.emit('leave-auction', { auctionId: id })
      joinedIds.delete(id)
    }
  }
  for (const id of nextIds) {
    if (!joinedIds.has(id)) {
      socket.emit('join-auction', { auctionId: id })
      joinedIds.add(id)
    }
  }
}

async function fetchAuctions() {
  try {
    const list = await $fetch('/api/economy/active-top-auctions')
    auctions.value = Array.isArray(list) ? list : []
    diffSocketRooms(auctions.value)
  } catch {
    // A failed poll shouldn't blank an otherwise-fine strip — keep showing
    // whatever was last loaded and just try again next cycle.
  } finally {
    loaded.value = true
  }
}

function connectSocket() {
  import('socket.io-client').then(({ io: ioFn }) => {
    const path = import.meta.env.PROD
      ? undefined
      : `http://localhost:${config.public.socketPort}`

    socket = ioFn(path, {
      autoConnect: false,
      withCredentials: true,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => diffSocketRooms(auctions.value))

    // Bidder identity is intentionally ignored here — the ticker row stays
    // anonymous like the section it replaced; only the modal (AuctionDetails)
    // shows who's leading, same as the full Auction House page already does.
    socket.on('new-bid', payload => {
      const item = auctions.value.find(a => String(a.auctionId) === String(payload.auctionId))
      if (!item || item.highestBid === payload.amount) return
      item.highestBid = payload.amount
      auctions.value.sort((a, b) => b.highestBid - a.highestBid)
    })

    socket.on('auction-ended', ({ auctionId }) => {
      const idx = auctions.value.findIndex(a => String(a.auctionId) === String(auctionId))
      if (idx === -1) return
      auctions.value.splice(idx, 1)
      const id = String(auctionId)
      if (joinedIds.has(id)) {
        socket.emit('leave-auction', { auctionId: id })
        joinedIds.delete(id)
      }
    })

    socket.connect()
  })
}

function disconnectSocket() {
  if (!socket) return
  for (const id of joinedIds) socket.emit('leave-auction', { auctionId: id })
  joinedIds.clear()
  socket.disconnect()
  socket = null
}

let pollHandle = null
let reducedMotionQuery = null

function onVisibilityChange() {
  pageHidden.value = document.hidden
  if (!pageHidden.value) fetchAuctions()
}

onMounted(() => {
  if (window.matchMedia) {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = reducedMotionQuery.matches
    reducedMotionQuery.addEventListener?.('change', e => { reducedMotion.value = e.matches })
  }

  pageHidden.value = document.hidden
  document.addEventListener('visibilitychange', onVisibilityChange)

  fetchAuctions()
  connectSocket()
  if (scrolling.value) startScroll()

  pollHandle = setInterval(() => {
    if (pageHidden.value) return
    fetchAuctions()
  }, POLL_MS)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (pollHandle) clearInterval(pollHandle)
  if (resumeTimeout) clearTimeout(resumeTimeout)
  stopScroll()
  disconnectSocket()
})
</script>

<style scoped>
.aat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-sizing: border-box;
}

.aat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
}

.aat-track {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-behavior: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue, #3399CC) transparent;
  min-height: 56px;
  align-items: center;
}

.aat-item {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 220px;
  padding: 6px 10px;
  min-height: 44px;
  border-radius: 8px;
  border: none;
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  box-sizing: border-box;
}

.aat-item:hover,
.aat-item:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  outline: none;
}

.aat-thumb {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.aat-item-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.aat-item-name {
  font-weight: 700;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aat-item-bid {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.9;
}

.aat-empty {
  font-size: 0.82rem;
  opacity: 0.7;
  padding: 4px 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .aat-item {
    max-width: 170px;
  }
}
</style>
