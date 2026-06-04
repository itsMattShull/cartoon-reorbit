<template>
  <div class="adet">

    <!-- ── Header ── -->
    <div class="adet-header">
      <button class="adet-back" @click="$emit('back')">‹ Back</button>
      <span class="adet-title">{{ loading ? 'Auction' : auction.ctoon.name }}</span>
      <span v-if="!loading && auction.isFeatured" class="adet-feat">★ Featured</span>
    </div>

    <!-- ── Loading ── -->
    <div v-if="loading" class="adet-body adet-loading">
      <div v-for="n in 6" :key="n" class="adet-skeleton" />
    </div>

    <!-- ── Content ── -->
    <div v-else class="adet-body">

      <!-- Top section: image + details + bid actions -->
      <div class="adet-top">

        <!-- cToon image -->
        <div class="adet-img-wrap adet-img-clickable" @click="openInfoModal">
          <img class="adet-img" :src="auction.ctoon.assetPath" :alt="auction.ctoon.name" draggable="false" />
          <div v-if="ended" class="adet-ended-badge">Ended</div>
        </div>

        <!-- Details + actions -->
        <div class="adet-info">
          <div class="adet-name">{{ auction.ctoon.name }}</div>

          <div class="adet-meta">
            <span class="adet-rarity" :class="`r-${rarityKey(auction.ctoon.rarity)}`">{{ auction.ctoon.rarity }}</span>
            <span v-if="!auction.isHolidayItem && auction.ctoon.mintNumber" class="adet-dim">#{{ auction.ctoon.mintNumber }}</span>
            <span v-if="auction.ctoon.series" class="adet-dim">{{ auction.ctoon.series }}</span>
          </div>

          <!-- Timer / winner -->
          <div v-if="!ended" class="adet-timer">Ends in {{ formatRemaining(auction.endAt) }}</div>
          <div v-else class="adet-winner">
            🎉 Winner:
            <span class="adet-winner-name">{{ displayWinner ?? '—' }}</span>
          </div>

          <!-- Bid info -->
          <div class="adet-bid-info">
            <div class="adet-bid-row">
              <span class="adet-bid-lbl">{{ hasBids ? 'Current Bid' : 'Starting Bid' }}</span>
              <span class="adet-bid-amt">{{ displayedBid }} pts</span>
            </div>
            <div v-if="hasBids && currentTopBidder" class="adet-bid-row">
              <span class="adet-bid-lbl">Top Bidder</span>
              <span class="adet-bid-amt">{{ currentTopBidder }}</span>
            </div>
          </div>

          <!-- Featured notice -->
          <div v-if="auction.isFeatured" class="adet-featured-notice">
            ⭐ Featured — bidding restricted to users who haven't owned 2 mints in the last 30 days.
          </div>

          <!-- ── Place bid ── -->
          <div v-if="!ended" class="adet-actions">
            <button
              class="adet-bid-btn"
              :disabled="!canBid"
              @click="placeBid"
            >
              {{ hasBids ? `Raise to ${nextBidAmount} pts` : `Bid ${nextBidAmount} pts` }}
            </button>
            <div v-if="isTopBidder" class="adet-hint">You are the highest bidder.</div>
            <div v-else-if="!canBid" class="adet-hint warn">Need {{ Math.max(0, nextBidAmount - userPoints) }} more pts (have {{ userPoints }}).</div>
          </div>

          <!-- ── Auto-bid ── -->
          <div v-if="!ended" class="adet-autobid">
            <div class="adet-autobid-label">Max Auto-Bid</div>
            <div class="adet-autobid-row">
              <input
                class="adet-autobid-input"
                type="number"
                v-model.number="autoBidInput"
                :placeholder="`> ${displayedBid} pts`"
                min="0"
              />
              <button class="adet-autobid-set" :disabled="!canSaveAutoBid" @click="saveAutoBid">
                {{ myAutoBid ? 'Update' : 'Set' }}
              </button>
              <button v-if="myAutoBid" class="adet-autobid-dis" @click="disableAutoBid">Off</button>
            </div>
            <div v-if="myAutoBid" class="adet-autobid-current">
              Max: {{ myAutoBid.maxAmount }} pts
              <span v-if="!myAutoBid.isActive" class="adet-dim"> (inactive)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Bottom: bid history + recent sales ── -->
      <div class="adet-bottom">
        <div class="adet-card">
          <div class="adet-card-title">Bid History</div>
          <div v-if="!bids.length" class="adet-empty">No bids yet.</div>
          <div v-for="(b, i) in bids" :key="i" class="adet-history-row">
            <span class="adet-history-user">{{ b.user }}</span>
            <span class="adet-history-amt">{{ b.amount }} pts</span>
          </div>
        </div>
        <div class="adet-card">
          <div class="adet-card-title">Recent Sales</div>
          <div v-if="!recentSales.length" class="adet-empty">No past sales.</div>
          <div v-for="(s, i) in recentSales" :key="i" class="adet-history-row">
            <span class="adet-dim">{{ formatDate(s.endedAt) }}</span>
            <span class="adet-history-amt">{{ s.soldFor }} pts</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Toast -->
    <div v-if="toast.message" class="adet-toast" :class="toast.type">{{ toast.message }}</div>

    <ScavengerHuntModal v-if="scavenger.isOpen && scavenger.sessionId" />
  </div>
</template>

<script setup>
const props = defineProps({
  auctionId: { type: [String, Number], required: true },
})
defineEmits(['back'])

const { user, fetchSelf } = useAuth()
const config  = useRuntimeConfig()
const scavenger = useScavengerHunt()
const { open: openCtoonModal } = useCtoonModal()

const loading  = ref(true)
const auction  = ref({ ctoon: {}, winnerUsername: null, endAt: null, highestBid: 0, initialBet: 0 })
const bids     = ref([])
const userPoints  = ref(0)
const recentSales = ref([])
const myAutoBid   = ref(null)
const autoBidInput = ref(null)
const currentTopBidder = ref(null)
const toast = reactive({ message: '', type: 'success' })
const now   = ref(new Date())
let timer, socket

// ── Computed ─────────────────────────────────────────────────────
const ended = computed(() => auction.value.endAt && new Date(auction.value.endAt) <= now.value)
const hasBids = computed(() => (auction.value?.highestBid ?? 0) > 0)
const displayedBid = computed(() => {
  const hb = auction.value?.highestBid ?? 0
  return hb > 0 ? hb : (auction.value?.initialBet ?? 0)
})
const bidIncrement = computed(() => {
  const v = displayedBid.value
  return v < 1_000 ? 10 : v < 10_000 ? 100 : 1_000
})
const nextBidAmount = computed(() =>
  hasBids.value ? displayedBid.value + bidIncrement.value : displayedBid.value
)
const topBidderFromHistory = computed(() => {
  if (!bids.value.length) return null
  return bids.value.reduce((max, b) => b.amount > max.amount ? b : max, bids.value[0]).user
})
const displayWinner = computed(() =>
  auction.value.winnerUsername || currentTopBidder.value || topBidderFromHistory.value
)
const isTopBidder = computed(() =>
  user.value?.username && currentTopBidder.value === user.value.username
)
const canBid = computed(() =>
  !ended.value && !isTopBidder.value && userPoints.value >= nextBidAmount.value
)
const canSaveAutoBid = computed(() => {
  if (ended.value) return false
  const v = Number(autoBidInput.value)
  return Number.isFinite(v) && v > displayedBid.value && v <= userPoints.value
})

// ── Helpers ───────────────────────────────────────────────────────
function showToast(message, type = 'error') {
  toast.message = message
  toast.type    = type
  setTimeout(() => { toast.message = '' }, 4000)
}

function formatRemaining(endAt) {
  const diff = new Date(endAt) - now.value
  if (diff <= 0) return '0s'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0)  return `${h}h ${m}m ${s}s`
  if (m > 0)  return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function rarityKey(r) { return (r || '').toLowerCase().replace(/\s+/g, '-') }

// ── Data loading ──────────────────────────────────────────────────
async function loadAuction() {
  await fetchSelf()
  const [data, pts] = await Promise.all([
    $fetch(`/api/auction/${props.auctionId}`),
    $fetch('/api/user/points'),
  ])
  auction.value = data
  auction.value.highestBid = data.highestBid ?? data.currentBid ?? 0
  bids.value       = data.bids || []
  userPoints.value = pts.points
  currentTopBidder.value = topBidderFromHistory.value ?? data.highestBidderUsername ?? null
  recentSales.value = await $fetch(`/api/auction/${props.auctionId}/getRecentAuctions`)
  try {
    const ab = await $fetch(`/api/auction/${props.auctionId}/autobid`)
    myAutoBid.value    = ab || null
    autoBidInput.value = ab?.maxAmount ?? null
  } catch {}
}

// ── Actions ───────────────────────────────────────────────────────
function openInfoModal() {
  openCtoonModal({
    ctoonId:     auction.value.ctoon.id         || null,
    userCtoonId: auction.value.ctoon.userCtoonId || null,
    assetPath:   auction.value.ctoon.assetPath   || null,
    name:        auction.value.ctoon.name        || null,
  })
}

async function placeBid() {
  if (!canBid.value) return
  try {
    await $fetch(`/api/auction/${props.auctionId}/bid`, {
      method: 'POST',
      body: { amount: nextBidAmount.value },
    })
    showToast(hasBids.value ? `Bid raised to ${nextBidAmount.value} pts!` : `Bid of ${nextBidAmount.value} pts placed!`, 'success')
    await scavenger.maybeTrigger('auction_bid', { open: true })
  } catch (err) {
    showToast(err.data?.message || 'Bid failed.', 'error')
  }
}

async function saveAutoBid() {
  try {
    await $fetch(`/api/auction/${props.auctionId}/autobid`, {
      method: 'POST',
      body: { maxAmount: Number(autoBidInput.value) },
    })
    myAutoBid.value = { maxAmount: Number(autoBidInput.value), isActive: true }
    showToast('Max Auto-Bid saved.', 'success')
    await scavenger.maybeTrigger('auction_bid', { open: true })
  } catch (err) {
    showToast(err.data?.message || 'Failed to save Auto-Bid.', 'error')
  }
}

async function disableAutoBid() {
  try {
    await $fetch(`/api/auction/${props.auctionId}/autobid`, { method: 'DELETE' })
    myAutoBid.value    = null
    autoBidInput.value = null
    showToast('Auto-Bid disabled.', 'success')
  } catch (err) {
    showToast(err.data?.message || 'Failed to disable Auto-Bid.', 'error')
  }
}

// ── Socket ────────────────────────────────────────────────────────
function connectSocket() {
  const { io } = window.socketIOClient ? window : {}
  // Use dynamic import so it doesn't break SSR
  import('socket.io-client').then(({ io: ioFn }) => {
    const path = import.meta.env.PROD
      ? undefined
      : `http://localhost:${config.public.socketPort}`

    socket = ioFn(path, {
      autoConnect: false,
      withCredentials: true,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => socket.emit('join-auction', { auctionId: props.auctionId }))

    socket.on('new-bid', payload => {
      if (String(payload.auctionId) !== String(props.auctionId)) return
      bids.value.unshift({ user: payload.user, amount: payload.amount })
      auction.value.highestBid  = payload.amount
      currentTopBidder.value    = payload.user
      if (payload.endAt) {
        const d = new Date(payload.endAt)
        if (!Number.isNaN(d.getTime())) auction.value.endAt = d.toISOString()
      }
    })

    socket.on('auction-ended', ({ winnerUsername, winningBid }) => {
      auction.value.winnerUsername = winnerUsername || auction.value.winnerUsername
      if (Number.isFinite(winningBid)) auction.value.highestBid = winningBid
    })

    socket.connect()
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────
onMounted(async () => {
  scavenger.reset()
  await loadAuction()
  loading.value = false
  timer = setInterval(() => { now.value = new Date() }, 1000)
  connectSocket()
})

onUnmounted(() => {
  clearInterval(timer)
  if (socket) {
    socket.emit('leave-auction', { auctionId: props.auctionId })
    socket.disconnect()
  }
})
</script>

<style scoped>
.adet {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

/* ── Header ── */
.adet-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: var(--OrbitDarkBlue);
  border-bottom: 2px solid var(--OrbitLightBlue);
  flex-shrink: 0;
}

.adet-back {
  background: none;
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 4px;
  color: #fff;
  font-size: 0.7rem;
  padding: 2px 8px;
  cursor: pointer;
  transition: background 0.12s;
  white-space: nowrap;
  flex-shrink: 0;
}
.adet-back:hover { background: rgba(255,255,255,0.1); }

.adet-title {
  font-size: 0.8rem;
  font-weight: bold;
  color: #fff;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.adet-feat {
  font-size: 0.62rem;
  font-weight: bold;
  color: #fbbf24;
  flex-shrink: 0;
}

/* ── Body ── */
.adet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  box-sizing: border-box;
}

.adet-loading { gap: 6px; }
.adet-skeleton {
  height: 28px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  animation: adet-pulse 1.2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes adet-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

/* ── Top section ── */
.adet-top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.adet-img-wrap {
  position: relative;
  flex-shrink: 0;
  width: 120px;
}

.adet-img-clickable { cursor: pointer; }

.adet-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  image-rendering: pixelated;
  background: rgba(0,0,0,0.25);
  border-radius: 6px;
  padding: 4px;
  box-sizing: border-box;
  display: block;
}

.adet-ended-badge {
  position: absolute;
  bottom: 4px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.6rem;
  font-weight: bold;
  background: rgba(0,0,0,0.65);
  color: rgba(255,255,255,0.7);
  padding: 2px 0;
  border-radius: 0 0 4px 4px;
}

.adet-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.adet-name {
  font-size: 0.85rem;
  font-weight: bold;
  color: #fff;
}

.adet-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }

.adet-rarity {
  font-size: 0.58rem;
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

.adet-dim { font-size: 0.6rem; color: rgba(255,255,255,0.42); }

.adet-timer { font-size: 0.7rem; font-weight: bold; color: #fca5a5; }
.adet-winner { font-size: 0.72rem; font-weight: bold; color: var(--OrbitGreen); }
.adet-winner-name { color: #fff; }

.adet-bid-info { display: flex; flex-direction: column; gap: 2px; }
.adet-bid-row  { display: flex; justify-content: space-between; align-items: center; }
.adet-bid-lbl  { font-size: 0.6rem; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.05em; }
.adet-bid-amt  { font-size: 0.72rem; font-weight: bold; color: #fff; }

.adet-featured-notice {
  font-size: 0.6rem;
  color: #fbbf24;
  background: rgba(251,191,36,0.1);
  border: 1px solid rgba(251,191,36,0.3);
  border-radius: 4px;
  padding: 4px 6px;
}

/* ── Bid button ── */
.adet-actions { display: flex; flex-direction: column; gap: 3px; }

.adet-bid-btn {
  border: none;
  border-radius: 6px;
  background: var(--OrbitLightBlue);
  color: #fff;
  font-size: 0.7rem;
  font-weight: bold;
  padding: 6px 12px;
  cursor: pointer;
  transition: filter 0.12s;
  align-self: flex-start;
}
.adet-bid-btn:not(:disabled):hover { filter: brightness(1.15); }
.adet-bid-btn:disabled { opacity: 0.4; cursor: default; }

.adet-hint { font-size: 0.6rem; color: rgba(255,255,255,0.45); }
.adet-hint.warn { color: #fca5a5; }

/* ── Auto-bid ── */
.adet-autobid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
}

.adet-autobid-label {
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255,255,255,0.4);
}

.adet-autobid-row { display: flex; gap: 4px; align-items: center; }

.adet-autobid-input {
  flex: 1;
  min-width: 0;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: #fff;
  font-size: 0.7rem;
  padding: 3px 6px;
  outline: none;
}
.adet-autobid-input:focus { border-color: var(--OrbitLightBlue); }

.adet-autobid-set {
  border: none;
  border-radius: 4px;
  background: var(--OrbitGreen);
  color: #fff;
  font-size: 0.62rem;
  font-weight: bold;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
}
.adet-autobid-set:disabled { opacity: 0.4; cursor: default; }
.adet-autobid-set:not(:disabled):hover { filter: brightness(1.1); }

.adet-autobid-dis {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.6);
  font-size: 0.62rem;
  padding: 3px 7px;
  cursor: pointer;
}
.adet-autobid-dis:hover { background: rgba(255,255,255,0.14); color: #fff; }

.adet-autobid-current { font-size: 0.62rem; color: rgba(255,255,255,0.55); }

/* ── Bottom cards ── */
.adet-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.adet-card {
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 160px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.adet-card-title {
  font-size: 0.62rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
  margin-bottom: 2px;
}

.adet-history-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.65rem;
}

.adet-history-user { color: rgba(255,255,255,0.8); }
.adet-history-amt  { font-weight: bold; color: #fff; }

.adet-empty {
  font-size: 0.65rem;
  color: rgba(255,255,255,0.35);
  font-style: italic;
}

/* ── Toast ── */
.adet-toast {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: bold;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
.adet-toast.success { background: #16a34a; color: #fff; }
.adet-toast.error   { background: #dc2626; color: #fff; }
</style>
