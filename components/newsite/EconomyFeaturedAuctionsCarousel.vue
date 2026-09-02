<template>
  <!-- Same Teleport-to-body approach as EconomyCtoonHistoryModal, for the same
       reason: .site-container carries a transform, which turns it into the
       containing block for position:fixed descendants and clips them. z-index
       1150 is deliberately above the history modal's 1100 — this carousel can
       be launched from the Economy page's toolbar at any time, including while
       a history chart happens to be open on top of another modal, and it reads
       naturally as the "front" surface when that happens. -->
  <Teleport to="body">
    <div class="feat-overlay" @click.self="$emit('close')">
      <div class="feat-card">
        <div class="feat-header">
          <h3 class="feat-title">★ Featured Auctions</h3>
          <button type="button" class="feat-close" @click="$emit('close')" aria-label="Close">✕</button>
        </div>

        <p v-if="loading" class="feat-empty">Loading featured auctions…</p>
        <p v-else-if="loadError" class="feat-empty feat-error">
          {{ loadError }}
          <button type="button" class="feat-retry" @click="load">Retry</button>
        </p>
        <p v-else-if="!items.length" class="feat-empty">No featured auctions right now — check back soon.</p>

        <div v-else class="feat-carousel">
          <button
            type="button"
            class="feat-arrow feat-arrow-left"
            aria-label="Scroll left"
            @click="scrollByCard(-1)"
          >‹</button>

          <div class="feat-track" ref="trackEl">
            <div v-for="item in items" :key="item.id" class="feat-item">
              <div class="feat-img-wrap">
                <img class="feat-img" :src="item.assetPath" :alt="item.ctoonName" draggable="false" />
                <span v-if="item.ended" class="feat-ended-badge">Ended</span>
              </div>

              <div class="feat-name">
                {{ item.ctoonName }}
                <span v-if="item.isSecondEdition" class="feat-2nd-badge">2nd Ed.</span>
              </div>

              <div class="feat-meta">
                <span class="feat-rarity" :class="`r-${rarityKey(item.rarity)}`">{{ item.rarity }}</span>
                <span v-if="item.mintNumber" class="feat-dim">#{{ item.mintNumber }}</span>
              </div>

              <div class="feat-bid-row">
                <span class="feat-bid-lbl">{{ hasBids(item) ? 'Current Bid' : 'Starting Bid' }}</span>
                <span class="feat-bid-amt">{{ displayedBid(item) }} pts</span>
              </div>
              <div v-if="hasBids(item) && item.highestBidderUsername" class="feat-bid-row">
                <span class="feat-bid-lbl">Top Bidder</span>
                <span class="feat-bid-amt feat-bidder-name">{{ item.highestBidderUsername }}</span>
              </div>

              <div v-if="!item.ended" class="feat-timer">Ends in {{ formatRemaining(item.endAt) }}</div>
              <div v-else class="feat-timer feat-timer-ended">Auction ended</div>

              <button
                type="button"
                class="feat-bid-btn"
                :disabled="!canBid(item)"
                @click="placeBid(item)"
              >
                <span v-if="item.bidding">Placing…</span>
                <span v-else-if="item.ended">Ended</span>
                <span v-else-if="isTopBidder(item)">You're winning</span>
                <span v-else>Bid {{ requiredBidFor(item) }} pts</span>
              </button>

              <p v-if="item.error" class="feat-item-error">{{ item.error }}</p>

              <!-- No amount-entry UI here on purpose — the only valid next bid at
                   any moment is the exact number above (server enforces this).
                   Bidding for more than the minimum happens on the full page. -->
              <NuxtLink :to="`/newsite/AuctionHouse/${item.id}`" class="feat-view-link">
                View full auction / bid more →
              </NuxtLink>
            </div>
          </div>

          <button
            type="button"
            class="feat-arrow feat-arrow-right"
            aria-label="Scroll right"
            @click="scrollByCard(1)"
          >›</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { formatRemainingShort } from '~/server/utils/auctionDuration'

defineEmits(['close'])

const { user, fetchSelf } = useAuth()
const config = useRuntimeConfig()

const items = ref([])
const loading = ref(true)
const loadError = ref('')
const now = ref(new Date())
const trackEl = ref(null)
let timer = null
let socket = null

// ── Bid math (duplicated client-side, same as AuctionDetails.vue's
// bidIncrement — server/utils/autoBid.js's incrementFor is not client-safe to
// import here since it pulls in socket.io-client at module scope) ──
function bidIncrement(v) {
  return v < 1_000 ? 10 : v < 10_000 ? 100 : 1_000
}
function hasBids(item) { return (item.highestBid ?? 0) > 0 }
function displayedBid(item) { return hasBids(item) ? item.highestBid : item.initialBet }
function requiredBidFor(item) {
  const base = displayedBid(item)
  return hasBids(item) ? base + bidIncrement(base) : base
}
function isTopBidder(item) {
  return !!user.value?.username && item.highestBidderUsername === user.value.username
}
function canBid(item) {
  return !item.ended && !item.bidding && !isTopBidder(item)
}

function rarityKey(r) { return (r || '').toLowerCase().replace(/\s+/g, '-') }

function formatRemaining(endAt) {
  const diff = new Date(endAt) - now.value
  if (diff <= 0) return '0s'
  return formatRemainingShort(diff)
}

// ── Load ──────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await $fetch('/api/auctions/featured')
    items.value = (data.items || []).map(it => ({
      ...it,
      ended: new Date(it.endAt) <= new Date(),
      bidding: false,
      error: ''
    }))
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Could not load featured auctions.'
  } finally {
    loading.value = false
  }
}

// Re-read one auction's authoritative state after a rejected bid — someone
// else may have just outbid the user, which would make the bid amount shown
// stale otherwise.
async function refreshOne(item) {
  try {
    const data = await $fetch(`/api/auction/${item.id}`)
    item.highestBid = data.highestBid ?? 0
    item.highestBidderUsername = data.highestBidderUsername ?? null
    item.endAt = data.endAt
    item.ended = data.status !== 'ACTIVE' || new Date(data.endAt) <= new Date()
  } catch {
    // Leave the card's last-known state in place rather than blanking it.
  }
}

// ── Bidding — reuses the exact same hardened endpoint every other bid UI in
// the app uses. No new bid endpoint, no eligibility logic here: bid.post.js
// already runs assertFeaturedEligibility / assertNoConcurrentFeaturedLead and
// throws a human-readable statusMessage on rejection, which we just surface. ──
async function placeBid(item) {
  if (!canBid(item)) return
  item.bidding = true
  item.error = ''
  const amount = requiredBidFor(item)
  try {
    const res = await $fetch(`/api/auction/${item.id}/bid`, {
      method: 'POST',
      body: { amount }
    })
    item.highestBid = res.highestBid ?? amount
    if (res.endAt) item.endAt = res.endAt
    // Own bid landed as leader — set optimistically. In the rare case a proxy
    // auto-bid immediately outbid it server-side, the 'new-bid' socket event
    // that bid.post.js emits right after corrects this within moments (see
    // the idempotent guard in the socket handler below).
    item.highestBidderUsername = user.value?.username || item.highestBidderUsername
  } catch (err) {
    item.error = err?.data?.statusMessage || err?.statusMessage || 'Bid failed.'
    await refreshOne(item)
  } finally {
    item.bidding = false
  }
}

// ── Carousel scrolling — native CSS scroll-snap does the swipe/drag work;
// these buttons just nudge it by one card for desktop/trackpad users. ──
function scrollByCard(dir) {
  const track = trackEl.value
  if (!track) return
  const card = track.querySelector('.feat-item')
  const gap = 12
  const width = card ? card.getBoundingClientRect().width + gap : 260
  track.scrollBy({ left: dir * width, behavior: 'smooth' })
}

// ── Socket — join every featured auction's room once when the modal opens,
// leave them all on close. A bounded, curated set (not per-scroll joins),
// per the perf note: constant join/leave churn on scroll would hammer the
// socket server for no benefit here. Mirrors AuctionDetails.vue's pattern
// exactly; server/socket-server.js is untouched, bid.post.js already emits
// 'new-bid' to auction_${id} on every successful bid (including auto-bids). ──
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

    socket.on('connect', () => {
      for (const item of items.value) {
        socket.emit('join-auction', { auctionId: item.id })
      }
    })

    socket.on('new-bid', payload => {
      const item = items.value.find(it => String(it.id) === String(payload.auctionId))
      if (!item) return
      // Idempotent-safe: applying the identical (amount, user) pair twice is a
      // harmless no-op rather than double-counting anything, but skip it
      // outright so a socket echo of our own optimistic update can't cause a
      // visible flicker.
      if (item.highestBid === payload.amount && item.highestBidderUsername === payload.user) return
      item.highestBid = payload.amount
      item.highestBidderUsername = payload.user
      if (payload.endAt) {
        const d = new Date(payload.endAt)
        if (!Number.isNaN(d.getTime())) item.endAt = d.toISOString()
      }
    })

    socket.on('auction-ended', ({ auctionId, winnerUsername, winningBid }) => {
      const item = items.value.find(it => String(it.id) === String(auctionId))
      if (!item) return
      item.ended = true
      if (Number.isFinite(winningBid)) item.highestBid = winningBid
      if (winnerUsername) item.highestBidderUsername = winnerUsername
    })

    socket.connect()
  })
}

function disconnectSocket() {
  if (!socket) return
  for (const item of items.value) {
    socket.emit('leave-auction', { auctionId: item.id })
  }
  socket.disconnect()
  socket = null
}

// ── Lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  await fetchSelf()
  await load()
  timer = setInterval(() => { now.value = new Date() }, 1000)
  if (items.value.length) connectSocket()
})

onUnmounted(() => {
  clearInterval(timer)
  disconnectSocket()
})
</script>

<style scoped>
.feat-overlay {
  position: fixed;
  inset: 0;
  z-index: 1150; /* above EconomyCtoonHistoryModal's 1100 — see template comment */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px;
  box-sizing: border-box;
}

.feat-card {
  background: #0b1f33;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 100%;
  max-width: 960px;
  max-height: 85vh;
  overflow: hidden;
  box-sizing: border-box;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feat-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.feat-title {
  margin: 0;
  flex: 1;
  font-size: 1.05rem;
  font-weight: 700;
  color: #fbbf24;
}

.feat-close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-width: 44px;
  min-height: 32px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
}

.feat-empty {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  padding: 24px 4px;
  text-align: center;
}
.feat-error { color: #fca5a5; }
.feat-retry {
  display: block;
  margin: 10px auto 0;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.75rem;
  padding: 6px 14px;
  cursor: pointer;
}

/* ── Carousel ── */
.feat-carousel {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 0;
}

.feat-track {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 4px 6px 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue, #3399CC) transparent;
}

.feat-item {
  scroll-snap-align: center;
  scroll-snap-stop: always;
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px;
  box-sizing: border-box;
}

.feat-img-wrap { position: relative; align-self: center; }
.feat-img {
  width: 110px;
  height: 110px;
  object-fit: contain;
  image-rendering: pixelated;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  padding: 4px;
  box-sizing: border-box;
  display: block;
}
.feat-ended-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  text-align: center;
  font-size: 0.6rem;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.65);
  color: rgba(255, 255, 255, 0.7);
  padding: 2px 0;
  border-radius: 4px;
}

.feat-name {
  font-size: 0.8rem;
  font-weight: bold;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feat-2nd-badge {
  display: inline-block;
  margin-left: 4px;
  background: #7c3aed;
  color: #fff;
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 1px 5px;
  border-radius: 10px;
  vertical-align: middle;
}

.feat-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.feat-rarity {
  font-size: 0.56rem;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: capitalize;
}
.r-common       { background: #6b7280; color: #fff; }
.r-uncommon     { background: #e5e7eb; color: #111; }
.r-rare         { background: #16a34a; color: #fff; }
.r-very-rare    { background: #2563eb; color: #fff; }
.r-crazy-rare   { background: #7c3aed; color: #fff; }
.r-prize-only   { background: #111;    color: #e5e7eb; }
.r-code-only    { background: #ea580c; color: #fff; }
.r-auction-only { background: #eab308; color: #111; }

.feat-dim { font-size: 0.58rem; color: rgba(255, 255, 255, 0.42); }

.feat-bid-row { display: flex; justify-content: space-between; align-items: center; }
.feat-bid-lbl { font-size: 0.58rem; color: rgba(255, 255, 255, 0.45); text-transform: uppercase; letter-spacing: 0.05em; }
.feat-bid-amt { font-size: 0.7rem; font-weight: bold; color: #fff; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feat-bidder-name { max-width: 110px; }

.feat-timer { font-size: 0.68rem; font-weight: bold; color: #fca5a5; }
.feat-timer-ended { color: rgba(255, 255, 255, 0.5); }

.feat-bid-btn {
  border: none;
  border-radius: 6px;
  background: var(--OrbitLightBlue, #3399CC);
  color: #fff;
  font-size: 0.72rem;
  font-weight: bold;
  padding: 6px 10px;
  min-height: 44px;
  cursor: pointer;
  transition: filter 0.12s;
}
.feat-bid-btn:not(:disabled):hover { filter: brightness(1.15); }
.feat-bid-btn:disabled { opacity: 0.5; cursor: default; }

.feat-item-error {
  margin: 0;
  font-size: 0.62rem;
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: 4px;
  padding: 4px 6px;
}

.feat-view-link {
  font-size: 0.62rem;
  color: var(--OrbitLightBlue, #3399CC);
  text-decoration: none;
  text-align: center;
  margin-top: auto;
  padding-top: 2px;
}
.feat-view-link:hover { text-decoration: underline; }

/* ── Arrows ── */
.feat-arrow {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.feat-arrow:hover { background: rgba(255, 255, 255, 0.18); }

@media (max-width: 768px) {
  .feat-item { flex-basis: 180px; }
  .feat-img { width: 90px; height: 90px; }
  .feat-bid-btn { min-height: 36px; }
  .feat-arrow { width: 36px; height: 36px; min-width: 36px; font-size: 1.1rem; }
  .feat-card { padding: 10px; max-height: 90vh; }
}
</style>
