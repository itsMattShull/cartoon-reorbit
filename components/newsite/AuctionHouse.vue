<template>
  <div class="ah">

    <!-- ── Detail view ────────────────────────────────────────────── -->
    <AuctionDetails
      v-if="selectedAuctionId"
      :auction-id="selectedAuctionId"
      @back="selectedAuctionId = null"
    />

    <!-- ── List view ─────────────────────────────────────────────── -->
    <template v-if="!selectedAuctionId">

    <!-- ── Tabs + Sort ─────────────────────────────────────────── -->
    <div class="ah-topbar">
      <div class="ah-tabs">
        <button
          v-for="t in TABS" :key="t.id"
          class="ah-tab" :class="{ active: activeTab === t.id }"
          @click="switchTab(t.id)"
        >{{ t.label }}</button>
      </div>
    </div>

    <!-- ── Auction-specific filters ───────────────────────────── -->
    <div class="ah-xfilters">
      <button class="ah-pill" :class="{ active: featuredOnly  }" @click="featuredOnly  = !featuredOnly" >★ Feat.</button>
      <button class="ah-pill" :class="{ active: hasBidsOnly   }" @click="hasBidsOnly   = !hasBidsOnly"  >Has Bids</button>
      <button class="ah-pill" :class="{ active: gtoonsOnly    }" @click="gtoonsOnly    = !gtoonsOnly"   >gToons</button>
      <button class="ah-pill" :class="{ active: wishlistOnly  }" @click="toggleWishlist">Wishlist</button>
      <div class="ah-owned">
        <button class="ah-owned-opt" :class="{ active: selectedOwned === 'all'     }" @click="selectedOwned = 'all'"    >All</button>
        <button class="ah-owned-opt" :class="{ active: selectedOwned === 'owned'   }" @click="selectedOwned = 'owned'"  >Owned</button>
        <button class="ah-owned-opt" :class="{ active: selectedOwned === 'unowned' }" @click="selectedOwned = 'unowned'">Unowned</button>
      </div>
    </div>

    <!-- ── Auction list ────────────────────────────────────────── -->
    <div class="ah-list">

      <!-- Loading skeletons -->
      <template v-if="isLoadingActive">
        <div v-for="n in 9" :key="n" class="ah-skeleton" />
      </template>

      <!-- Empty state -->
      <div v-else-if="paginatedItems.length === 0" class="ah-empty">
        {{ hasActiveFilters ? 'No auctions match your filters.' : emptyMessage }}
      </div>

      <!-- Rows -->
      <template v-else>
        <div
          v-for="item in paginatedItems" :key="item.id"
          class="ah-row" :class="{ trending: trendingIds.has(item.id) }"
        >
          <!-- Thumbnail -->
          <img class="ah-img" :src="item.assetPath" :alt="item.name" draggable="false" />

          <!-- Name + meta -->
          <div class="ah-body">
            <div class="ah-name">{{ item.name }}</div>
            <div class="ah-meta">
              <span class="ah-rarity" :class="`r-${rarityKey(item.rarity)}`">{{ rarityShort(item.rarity) }}</span>
              <span v-if="!item.isHolidayItem && item.mintNumber" class="ah-dim">#{{ item.mintNumber }}</span>
              <span v-if="item.isFeatured" class="ah-feat">★</span>
              <!-- Tab-specific status badge -->
              <span v-if="activeTab === 'mybids' && isEnded(item.endAt)"
                class="ah-badge" :class="item.didWin ? 'badge-won' : 'badge-lost'"
              >{{ item.didWin ? 'Won' : 'Lost' }}</span>
              <span v-else-if="activeTab === 'mybids'"
                class="ah-badge" :class="item.myBid != null && item.myBid === item.highestBid ? 'badge-won' : 'badge-lost'"
              >{{ item.myBid != null && item.myBid === item.highestBid ? 'Winning' : 'Losing' }}</span>
              <span v-else-if="activeTab === 'mine' || activeTab === 'all'"
                class="ah-badge" :class="!isEnded(item.endAt) ? 'badge-active' : 'badge-ended'"
              >{{ !isEnded(item.endAt) ? 'Active' : 'Ended' }}</span>
              <span v-else-if="item.isOwned" class="ah-badge badge-won">Owned</span>
            </div>
          </div>

          <!-- Bid info -->
          <div class="ah-bid">
            <div v-if="activeTab === 'mybids'" class="ah-bid-val">My: {{ item.myBid != null ? item.myBid + ' pts' : '—' }}</div>
            <div class="ah-bid-label">{{ Number(item.bidCount ?? 0) > 0 ? 'Current:' : 'Start:' }}</div>
            <div class="ah-bid-val">{{ Number(item.bidCount ?? 0) > 0 ? formatHighestBid(item) : (item.initialBid != null ? item.initialBid + ' pts' : '—') }}</div>
            <div class="ah-bid-ct">{{ item.bidCount ?? 0 }} bid{{ item.bidCount !== 1 ? 's' : '' }}</div>
          </div>

          <!-- Time -->
          <div class="ah-time" :class="{ ended: isEnded(item.endAt) }">
            <template v-if="!isEnded(item.endAt)">{{ formatRemaining(item.endAt) }}</template>
            <template v-else>{{ formatDate(item.endAt) }}</template>
          </div>

          <!-- View button -->
          <button class="ah-view" @click="selectedAuctionId = item.id">View</button>
        </div>
      </template>
    </div>

    <!-- ── Pagination ───────────────────────────────────────────── -->
    <div class="ah-pagination">
      <button class="ah-pg-btn" :disabled="activePage <= 1"          @click="prevPage">‹</button>
      <span class="ah-pg-info">{{ activePage }} / {{ totalPages }}</span>
      <button class="ah-pg-btn" :disabled="activePage >= totalPages"  @click="nextPage">›</button>
    </div>

    </template><!-- end list view -->

  </div>
</template>

<script setup>
const filter      = useNewSiteCtoonFilter()
const cmartCtoons = useState('cmartCtoons', () => [])

const selectedAuctionId = ref(null)

const TABS = [
  { id: 'current', label: 'Current'     },
  { id: 'mybids',  label: 'My Bids'     },
  { id: 'mine',    label: 'My Auctions' },
  { id: 'all',     label: 'All'         },
]

const PAGE_SIZE = 20

// ── Tab ──────────────────────────────────────────────────────────
const activeTab = ref('current')

// ── Raw data ──────────────────────────────────────────────────────
const auctions         = ref([])
const trendingAuctions = ref([])
const myAuctions       = ref([])
const myBids           = ref([])
const allAuctions      = ref([])

// ── Loading flags ─────────────────────────────────────────────────
const isLoading        = ref(false)
const isLoadingTrending = ref(false)
const isLoadingMy      = ref(false)
const isLoadingMyBids  = ref(false)
const isLoadingAll     = ref(false)

// ── Server-side pagination (mine / mybids / all) ──────────────────
const myPage           = ref(1)
const myTotalPages     = ref(1)
const myBidsPage       = ref(1)
const myBidsTotalPages = ref(1)
const allPage          = ref(1)
const allTotalPages    = ref(1)

// ── Client-side pagination (current) ─────────────────────────────
const currentPage = ref(1)

// ── Auction-specific filters ──────────────────────────────────────
const featuredOnly  = ref(false)
const wishlistOnly  = ref(false)
const hasBidsOnly   = ref(false)
const gtoonsOnly    = ref(false)
const selectedOwned = ref('all')

// ── Wishlist ──────────────────────────────────────────────────────
const wishlistCtoonIds  = ref([])
const isLoadingWishlist = ref(false)
const hasLoadedWishlist = ref(false)
const wishlistCtoonIdSet = computed(() => new Set(wishlistCtoonIds.value))

// ── Timer ─────────────────────────────────────────────────────────
const now = ref(new Date())
let timer = null

onMounted(() => {
  timer = setInterval(() => { now.value = new Date() }, 1000)
  loadAuctions()
  loadTrendingAuctions()
})
onUnmounted(() => clearInterval(timer))

// ── API helpers ───────────────────────────────────────────────────
function buildFilterParams() {
  const params = new URLSearchParams()
  const q = String(filter.value.name || '').trim()
  if (q)                              params.set('q',        q)
  if (filter.value.rarities.length)   params.set('rarity',   filter.value.rarities.join(','))
  if (filter.value.series)            params.set('series',   filter.value.series)
  if (filter.value.set)               params.set('set',      filter.value.set)
  if (selectedOwned.value !== 'all')  params.set('owned',    selectedOwned.value)
  if (featuredOnly.value)             params.set('featured', '1')
  if (wishlistOnly.value)             params.set('wishlist', '1')
  if (hasBidsOnly.value)              params.set('hasBids',  '1')
  if (gtoonsOnly.value)               params.set('gtoon',    '1')
  return params
}

function loadAuctions() {
  isLoading.value = true
  const params = new URLSearchParams()
  if (hasBidsOnly.value) params.set('hasBids', '1')
  const qs = params.toString()
  $fetch(qs ? `/api/auctions?${qs}` : '/api/auctions')
    .then(data => { auctions.value = Array.isArray(data) ? data : []; syncCmartCtoons() })
    .finally(() => { isLoading.value = false })
}

function loadTrendingAuctions() {
  isLoadingTrending.value = true
  $fetch('/api/auctions/trending')
    .then(data => { trendingAuctions.value = Array.isArray(data) ? data : [] })
    .finally(() => { isLoadingTrending.value = false })
}

function loadMyAuctions() {
  isLoadingMy.value = true
  const params = buildFilterParams()
  params.set('page',  String(myPage.value))
  params.set('limit', String(PAGE_SIZE))
  params.set('sort',  filter.value.sortField)
  $fetch(`/api/my-auctions?${params.toString()}`)
    .then(data => {
      myAuctions.value  = Array.isArray(data?.items) ? data.items : []
      myTotalPages.value = data?.totalPages ?? 1
      syncCmartCtoons()
    })
    .finally(() => { isLoadingMy.value = false })
}

function loadMyBids() {
  isLoadingMyBids.value = true
  const params = buildFilterParams()
  params.set('page',  String(myBidsPage.value))
  params.set('limit', String(PAGE_SIZE))
  params.set('sort',  filter.value.sortField)
  $fetch(`/api/auction/mybids?${params.toString()}`)
    .then(data => {
      myBids.value           = Array.isArray(data?.items) ? data.items : []
      myBidsTotalPages.value = data?.totalPages ?? 1
      syncCmartCtoons()
    })
    .finally(() => { isLoadingMyBids.value = false })
}

function loadAllAuctions() {
  isLoadingAll.value = true
  const params = buildFilterParams()
  params.set('page',  String(allPage.value))
  params.set('limit', String(PAGE_SIZE))
  params.set('sort',  filter.value.sortField)
  $fetch(`/api/auctions/all?${params.toString()}`)
    .then(data => {
      allAuctions.value  = Array.isArray(data?.items) ? data.items : []
      allTotalPages.value = data?.totalPages ?? 1
      syncCmartCtoons()
    })
    .finally(() => { isLoadingAll.value = false })
}

async function loadWishlist() {
  if (isLoadingWishlist.value || hasLoadedWishlist.value) return
  isLoadingWishlist.value = true
  try {
    const items = await $fetch('/api/wishlist')
    wishlistCtoonIds.value  = Array.isArray(items) ? items.map(i => i?.id).filter(Boolean) : []
    hasLoadedWishlist.value = true
  } finally {
    isLoadingWishlist.value = false
  }
}

// Populate cmartCtoons so CtoonFilter's series/set dropdowns are relevant
function syncCmartCtoons() {
  const seen = new Set()
  cmartCtoons.value = [
    ...auctions.value,
    ...trendingAuctions.value,
    ...myAuctions.value,
    ...myBids.value,
    ...allAuctions.value,
  ].filter(a => {
    if (!a?.ctoonId || seen.has(a.ctoonId)) return false
    seen.add(a.ctoonId)
    return true
  })
}

// ── Watchers ──────────────────────────────────────────────────────
watch(activeTab, tab => {
  if (tab === 'mine')   loadMyAuctions()
  if (tab === 'mybids') loadMyBids()
  if (tab === 'all')    loadAllAuctions()
})

watch(hasBidsOnly, () => {
  loadAuctions()
  loadTrendingAuctions()
})

watch(() => filter.value.sortField, () => {
  if (activeTab.value === 'mine')   { myPage.value = 1;      loadMyAuctions() }
  if (activeTab.value === 'mybids') { myBidsPage.value = 1;  loadMyBids()     }
  if (activeTab.value === 'all')    { allPage.value = 1;     loadAllAuctions()}
})

watch(myPage,     () => { if (activeTab.value === 'mine')   loadMyAuctions() })
watch(myBidsPage, () => { if (activeTab.value === 'mybids') loadMyBids()     })
watch(allPage,    () => { if (activeTab.value === 'all')    loadAllAuctions()})

// Sidebar filter changes → reset + reload server-side tabs, reset client page
watch(
  [() => filter.value.name, () => filter.value.rarities, () => filter.value.series, () => filter.value.set,
   () => filter.value.priceMin, () => filter.value.priceMax,
   featuredOnly, wishlistOnly, gtoonsOnly, selectedOwned],
  () => {
    currentPage.value = 1
    if (activeTab.value === 'mine')   { myPage.value = 1;     loadMyAuctions() }
    if (activeTab.value === 'mybids') { myBidsPage.value = 1; loadMyBids()     }
    if (activeTab.value === 'all')    { allPage.value = 1;    loadAllAuctions()}
  },
  { deep: true }
)

// ── Client-side filter + sort (current tab) ───────────────────────
function applyFilters(items) {
  const term     = (filter.value.name || '').toLowerCase().trim()
  const rarities = filter.value.rarities
  const series   = filter.value.series
  const set      = filter.value.set

  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item) return false
    if (term) {
      const chars = Array.isArray(item.characters) ? item.characters : []
      if (!(item.name || '').toLowerCase().includes(term) &&
          !chars.some(c => String(c || '').toLowerCase().includes(term))) return false
    }
    if (rarities.length && !rarities.includes((item.rarity || '').toLowerCase()))    return false
    if (series && item.series !== series)                       return false
    if (set    && item.set    !== set)                          return false
    if (featuredOnly.value  && !item.isFeatured)               return false
    if (selectedOwned.value === 'owned'   && !item.isOwned)    return false
    if (selectedOwned.value === 'unowned' && item.isOwned)     return false
    if (wishlistOnly.value) {
      if (!hasLoadedWishlist.value || !wishlistCtoonIdSet.value.has(item.ctoonId)) return false
    }
    if (hasBidsOnly.value && Number(item.bidCount ?? 0) < 1) return false
    if (gtoonsOnly.value  && !item.isGtoon)                  return false
    const currentPrice = Number(item.highestBid > 0 ? item.highestBid : item.initialBid) || 0
    if (filter.value.priceMin !== '' && currentPrice < Number(filter.value.priceMin)) return false
    if (filter.value.priceMax !== '' && currentPrice > Number(filter.value.priceMax)) return false
    return true
  })
}

function sortItems(items, sort = filter.value.sortField) {
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'endAsc':    return new Date(a.endAt) - new Date(b.endAt)
      case 'endNewest': return new Date(b.endAt) - new Date(a.endAt)
      case 'nameAsc':   return (a.name || '').localeCompare(b.name || '')
      case 'nameDesc':  return (b.name || '').localeCompare(a.name || '')
      case 'mintAsc':   return (a.mintNumber ?? 0) - (b.mintNumber ?? 0)
      case 'mintDesc':  return (b.mintNumber ?? 0) - (a.mintNumber ?? 0)
      case 'rarity':    return (a.rarity || '').localeCompare(b.rarity || '')
      case 'priceAsc':  return (Number(a.highestBid > 0 ? a.highestBid : a.initialBid) || 0) - (Number(b.highestBid > 0 ? b.highestBid : b.initialBid) || 0)
      case 'priceDesc': return (Number(b.highestBid > 0 ? b.highestBid : b.initialBid) || 0) - (Number(a.highestBid > 0 ? a.highestBid : a.initialBid) || 0)
      default:          return 0
    }
  })
}

// ── Derived ───────────────────────────────────────────────────────
const isLoadingActive = computed(() => ({
  current: isLoading.value,
  mybids:  isLoadingMyBids.value,
  mine:    isLoadingMy.value,
  all:     isLoadingAll.value,
}[activeTab.value] ?? false))

const trendingIds = computed(() => new Set(trendingAuctions.value.map(a => a.id)))

const filteredCurrent = computed(() => {
  const sort = filter.value.sortField // explicit dependency
  return sortItems(applyFilters(auctions.value), sort)
})

const visibleItems = computed(() => ({
  current: filteredCurrent.value,
  mybids:  myBids.value,
  mine:    myAuctions.value,
  all:     allAuctions.value,
}[activeTab.value] ?? []))

const activePage = computed(() => ({
  mine:   myPage.value,
  mybids: myBidsPage.value,
  all:    allPage.value,
}[activeTab.value] ?? currentPage.value))

const totalPages = computed(() => {
  if (activeTab.value === 'mine')   return myTotalPages.value
  if (activeTab.value === 'mybids') return myBidsTotalPages.value
  if (activeTab.value === 'all')    return allTotalPages.value
  return Math.max(1, Math.ceil(filteredCurrent.value.length / PAGE_SIZE))
})

const paginatedItems = computed(() => {
  if (activeTab.value !== 'current') return visibleItems.value
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredCurrent.value.slice(start, start + PAGE_SIZE)
})

const emptyMessage = computed(() => ({
  mybids:  "You haven't bid on any auctions yet.",
  mine:    "You haven't created any auctions yet.",
}[activeTab.value] ?? 'No auctions found.'))

const hasActiveFilters = computed(() => !!(
  filter.value.name || filter.value.rarities.length || filter.value.series || filter.value.set ||
  featuredOnly.value || wishlistOnly.value || hasBidsOnly.value || gtoonsOnly.value ||
  selectedOwned.value !== 'all'
))

// ── Actions ───────────────────────────────────────────────────────
function switchTab(id) { activeTab.value = id }

function toggleWishlist() {
  wishlistOnly.value = !wishlistOnly.value
  if (wishlistOnly.value) loadWishlist()
}

function prevPage() {
  const p = activePage.value
  if (p <= 1) return
  if      (activeTab.value === 'mine')   myPage.value = p - 1
  else if (activeTab.value === 'mybids') myBidsPage.value = p - 1
  else if (activeTab.value === 'all')    allPage.value = p - 1
  else currentPage.value = p - 1
}

function nextPage() {
  const p = activePage.value
  if (p >= totalPages.value) return
  if      (activeTab.value === 'mine')   myPage.value = p + 1
  else if (activeTab.value === 'mybids') myBidsPage.value = p + 1
  else if (activeTab.value === 'all')    allPage.value = p + 1
  else currentPage.value = p + 1
}

// ── Formatters ────────────────────────────────────────────────────
function isEnded(endAt)  { return new Date(endAt) <= now.value }
function formatDate(d)   { return new Date(d).toLocaleDateString() }

function formatRemaining(endAt) {
  const diff = new Date(endAt) - now.value
  if (diff <= 0) return 'ended'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0)  return `${h}h ${m}m`
  if (m > 0)  return `${m}m ${s}s`
  return `${s}s`
}

function formatHighestBid(item) {
  if (Number(item?.bidCount ?? 0) < 1) return 'No bids'
  return item?.highestBid != null ? `${item.highestBid} pts` : 'No bids'
}

const RARITY_MAP = {
  'common': 'C', 'uncommon': 'U', 'rare': 'R', 'very rare': 'VR',
  'crazy rare': 'CR', 'prize only': 'PO', 'code only': 'CO', 'auction only': 'AO',
}
function rarityShort(r) { return RARITY_MAP[(r || '').toLowerCase()] || r || '?' }
function rarityKey(r)   { return (r || '').toLowerCase().replace(/\s+/g, '-') }
</script>

<style scoped>
.ah {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

/* ── Top bar ── */
.ah-topbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: var(--OrbitDarkBlue);
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
}

.ah-tabs { display: flex; flex: 1; gap: 2px; }

.ah-tab {
  padding: 3px 8px;
  border: none;
  border-radius: 4px 4px 0 0;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.45);
  font-size: 0.62rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.ah-tab.active { background: var(--OrbitLightBlue); color: #fff; }
.ah-tab:not(.active):hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }

/* ── Extra filters ── */
.ah-xfilters {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: rgba(0,0,0,0.12);
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}

.ah-pill {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 10px;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 0.58rem;
  font-weight: bold;
  padding: 1px 7px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.ah-pill.active { background: var(--OrbitLightBlue); border-color: var(--OrbitLightBlue); color: #fff; }
.ah-pill:not(.active):hover { color: rgba(255,255,255,0.85); }

.ah-owned {
  display: flex;
  margin-left: auto;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 10px;
  overflow: hidden;
}
.ah-owned-opt {
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.45);
  font-size: 0.58rem;
  font-weight: bold;
  padding: 1px 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.ah-owned-opt.active { background: var(--OrbitLightBlue); color: #fff; }

/* ── List ── */
.ah-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
  padding: 4px 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ah-skeleton {
  height: 38px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  animation: ah-pulse 1.2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes ah-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.ah-empty {
  color: rgba(255,255,255,0.4);
  font-size: 0.72rem;
  font-style: italic;
  text-align: center;
  padding: 16px 4px;
}

/* ── Row ── */
.ah-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 4px;
  min-height: 38px;
  flex-shrink: 0;
  transition: background 0.12s;
}
.ah-row:hover   { background: rgba(0,0,0,0.38); }
.ah-row.trending { border-color: rgba(251,191,36,0.35); }

.ah-img {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
  image-rendering: pixelated;
}

.ah-body { flex: 1; min-width: 0; }

.ah-name {
  font-size: 0.72rem;
  font-weight: bold;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ah-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 1px;
}

/* Rarity badge */
.ah-rarity {
  font-size: 0.55rem;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}
.r-common       { background: #6b7280; color: #fff; }
.r-uncommon     { background: #e5e7eb; color: #111; }
.r-rare         { background: #16a34a; color: #fff; }
.r-very-rare    { background: #2563eb; color: #fff; }
.r-crazy-rare   { background: #7c3aed; color: #fff; }
.r-prize-only   { background: #111;    color: #e5e7eb; }
.r-code-only    { background: #ea580c; color: #fff; }
.r-auction-only { background: #eab308; color: #111; }

.ah-dim  { font-size: 0.58rem; color: rgba(255,255,255,0.4); }
.ah-feat { color: #fbbf24; font-size: 0.62rem; }

.ah-badge {
  font-size: 0.55rem;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}
.badge-won    { background: #16a34a; color: #fff; }
.badge-lost   { background: #dc2626; color: #fff; }
.badge-active { background: #16a34a; color: #fff; }
.badge-ended  { background: #6b7280; color: #fff; }

/* Bid column */
.ah-bid { width: 88px; flex-shrink: 0; text-align: right; }
.ah-bid-label { font-size: 0.52rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.38); line-height: 1.2; }
.ah-bid-val { font-size: 0.65rem; font-weight: bold; color: #fff; line-height: 1.3; }
.ah-bid-ct  { font-size: 0.57rem; color: rgba(255,255,255,0.4); }

/* Time column */
.ah-time {
  width: 62px;
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: bold;
  color: #fca5a5;
  text-align: center;
  white-space: nowrap;
}
.ah-time.ended { color: rgba(255,255,255,0.38); font-size: 0.57rem; font-weight: normal; }

/* View button */
.ah-view {
  flex-shrink: 0;
  padding: 3px 8px;
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--OrbitLightBlue);
  border-radius: 4px;
  color: #fff;
  font-size: 0.6rem;
  font-weight: bold;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s;
}
.ah-view:hover { background: var(--OrbitLightBlue); }

/* ── Pagination ── */
.ah-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3px 6px;
  border-top: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.ah-pg-btn {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  background: rgba(0,0,0,0.2);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
  padding: 1px 9px;
  cursor: pointer;
  transition: background 0.12s;
}
.ah-pg-btn:disabled { opacity: 0.3; cursor: default; }
.ah-pg-btn:not(:disabled):hover { background: rgba(255,255,255,0.1); }

.ah-pg-info {
  font-size: 0.63rem;
  color: rgba(255,255,255,0.55);
  min-width: 55px;
  text-align: center;
}
</style>
