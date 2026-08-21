<template>
  <div class="ah">

    <!-- ── Tabs + View toggle ─────────────────────────────────── -->
    <div class="ah-topbar">
      <div class="ah-tabs">
        <button
          v-for="t in TABS" :key="t.id"
          class="ah-tab" :class="{ active: activeTab === t.id }"
          @click="switchTab(t.id)"
        >{{ t.label }}</button>
      </div>
      <div class="ah-view-toggle">
        <button class="ah-vt-btn" :class="{ active: viewMode === 'list' }" @click="setView('list')">&#9776; List</button>
        <button class="ah-vt-btn" :class="{ active: viewMode === 'card' }" @click="setView('card')">&#8859; Cards</button>
      </div>
    </div>

    <!-- ── Top Pagination ────────────────────────────────────── -->
    <div class="ah-pagination ah-pagination--top">
      <button class="ah-pg-btn" :disabled="activePage <= 1"         @click="prevPage">‹</button>
      <span class="ah-pg-info">{{ activePage }} / {{ totalPages }}</span>
      <button class="ah-pg-btn" :disabled="activePage >= totalPages" @click="nextPage">›</button>
    </div>

    <!-- ── List view ─────────────────────────────────────────── -->
    <template v-if="viewMode === 'list'">
    <div ref="listEl" class="ah-list">

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
          <div class="ah-img-wrap" @click="openInfoModal(item)">
            <img class="ah-img" :src="item.assetPath" :alt="item.name" draggable="false" />
            <SecondEditionOverlay :ctoon="item" />
            <span
              v-if="activeTab === 'current'"
              class="ah-own-badge"
              :class="item.isOwned ? 'ah-own-badge--owned' : 'ah-own-badge--unowned'"
            >{{ item.isOwned ? 'Owned' : 'Unowned' }}</span>
          </div>

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
              <!-- owned/unowned badge moved to image overlay on current tab -->
            </div>
          </div>

          <!-- Bid info -->
          <div class="ah-bid">
            <div v-if="activeTab === 'mybids'" class="ah-bid-val">My: {{ item.myBid != null ? item.myBid + ' pts' : '—' }}</div>
            <div class="ah-bid-label">{{ Number(item.bidCount ?? 0) > 0 ? 'Current:' : 'Start:' }}</div>
            <div class="ah-bid-val">{{ Number(item.bidCount ?? 0) > 0 ? formatHighestBid(item) : (item.initialBid != null ? item.initialBid + ' pts' : '—') }}</div>
          </div>

          <!-- Time -->
          <div class="ah-time" :class="{ ended: isEnded(item.endAt) }">
            <template v-if="!isEnded(item.endAt)">{{ formatRemaining(item.endAt) }}</template>
            <template v-else>{{ formatDate(item.endAt) }}</template>
          </div>

          <!-- Actions -->
          <div class="ah-actions">
            <button class="ah-view" @click="goToAuction(item.id)">View</button>
            <button
              v-if="item.canRelist"
              class="ah-relist"
              @click.stop="openRelist(item)"
            >Re-list</button>
          </div>
        </div>
      </template>
    </div>
    </template>

    <!-- ── Card view ─────────────────────────────────────────── -->
    <template v-else>
    <div ref="cardEl" class="ah-card-grid">

      <!-- Loading skeletons -->
      <template v-if="isLoadingActive">
        <div v-for="n in 15" :key="n" class="ah-card-skeleton" />
      </template>

      <!-- Empty state -->
      <div v-else-if="paginatedItems.length === 0" class="ah-empty ah-card-empty">
        {{ hasActiveFilters ? 'No auctions match your filters.' : emptyMessage }}
      </div>

      <!-- Cards -->
      <template v-else>
        <!-- Footer split lives in the stylesheet, not an inline :style. The
             countdown ticks every second, and DYNAMIC_SLOTS force-updates every
             ShortCard on each tick, so a per-card style object here meant ~200
             identical setProperty calls a second. It also outranked the grid's
             own responsive override, which is half of why View went missing. -->
        <ShortCard
          v-for="item in paginatedItems" :key="item.id"
          :class="{ 'ah-card--has-relist': item.canRelist }"
        >
          <template #header>
            <div class="ah-card-header" @click="openInfoModal(item)">
              <img v-if="item.assetPath" :src="item.assetPath" :alt="item.name" class="ah-card-img" draggable="false" />
              <SecondEditionOverlay :ctoon="item" />
              <div class="ah-card-time-badge" :class="{ ended: isEnded(item.endAt) }">
                <template v-if="!isEnded(item.endAt)">{{ formatRemaining(item.endAt) }}</template>
                <template v-else>Ended</template>
              </div>
              <span v-if="item.isFeatured" class="ah-card-featured-tag">Featured</span>
              <span
                v-if="activeTab === 'current'"
                class="ah-own-badge ah-card-own-badge"
                :class="item.isOwned ? 'ah-own-badge--owned' : 'ah-own-badge--unowned'"
              >{{ item.isOwned ? 'Owned' : 'Unowned' }}</span>
              <span
                v-else-if="activeTab === 'mybids' && isEnded(item.endAt)"
                class="ah-own-badge ah-card-own-badge"
                :class="item.didWin ? 'ah-own-badge--won' : 'ah-own-badge--lost'"
              >{{ item.didWin ? 'Won' : 'Lost' }}</span>
              <span
                v-else-if="activeTab === 'mybids'"
                class="ah-own-badge ah-card-own-badge"
                :class="item.myBid != null && item.myBid === item.highestBid ? 'ah-own-badge--won' : 'ah-own-badge--lost'"
              >{{ item.myBid != null && item.myBid === item.highestBid ? 'Winning' : 'Losing' }}</span>
            </div>
          </template>
          <template #middle>
            <div class="ah-card-middle">
              <span class="ah-card-name">{{ item.name }}</span>
              <span class="ah-rarity ah-card-rarity" :class="`r-${rarityKey(item.rarity)}`">{{ rarityShort(item.rarity) }}</span>
            </div>
          </template>
          <template #footer-left>
            <span class="ah-card-bid-val">
              {{ Number(item.bidCount ?? 0) > 0 ? formatHighestBid(item) : (item.initialBid != null ? item.initialBid + ' pts' : '—') }}
            </span>
          </template>
          <template #footer-right>
            <div class="ah-card-actions">
              <button class="ah-card-view-btn" @click.stop="goToAuction(item.id)">View</button>
              <button
                v-if="item.canRelist"
                class="ah-card-relist-btn"
                @click.stop="openRelist(item)"
              >Re-list</button>
            </div>
          </template>
        </ShortCard>
      </template>
    </div>
    </template>

    <!-- ── Pagination ───────────────────────────────────────────── -->
    <div class="ah-pagination">
      <button class="ah-pg-btn" :disabled="activePage <= 1"          @click="prevPage">‹</button>
      <span class="ah-pg-info">{{ activePage }} / {{ totalPages }}</span>
      <button class="ah-pg-btn" :disabled="activePage >= totalPages"  @click="nextPage">›</button>
    </div>

  </div>
</template>

<script setup>
import { formatRemainingShort } from '~/server/utils/auctionDuration'
const filter   = useNewSiteCtoonFilter()
const aFilters = useAuctionHouseFilters()
const cmartCtoons = useState('cmartCtoons', () => [])
const { open: openCtoonModal } = useCtoonModal()
const { open: openAuctionModal, createdSignal: auctionCreatedSignal } = useAuctionModal()
const router = useRouter()

function goToAuction(id) {
  router.push(`/newsite/AuctionHouse/${id}`)
}

const TABS = [
  { id: 'current', label: 'Current'     },
  { id: 'mybids',  label: 'My Bids'     },
  { id: 'mine',    label: 'My Auctions' },
  { id: 'all',     label: 'All'         },
]

const PAGE_SIZE = 100

// ── Scroll refs ──────────────────────────────────────────────────
const listEl = ref(null)
const cardEl = ref(null)

// ── View mode ─────────────────────────────────────────────────────
const viewMode = ref('list')

function setView(mode) {
  viewMode.value = mode
  if (import.meta.client) localStorage.setItem('auctionHouseView', mode)
}

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

// ── Wishlist ──────────────────────────────────────────────────────
const wishlistCtoonIds  = ref([])
const isLoadingWishlist = ref(false)
const hasLoadedWishlist = ref(false)
const wishlistCtoonIdSet = computed(() => new Set(wishlistCtoonIds.value))

// ── Timer ─────────────────────────────────────────────────────────
const now = ref(new Date())
let timer = null

onMounted(() => {
  if (import.meta.client) {
    viewMode.value = localStorage.getItem('auctionHouseView') || 'list'
  }
  timer = setInterval(() => { now.value = new Date() }, 1000)
  loadAuctions()
  loadTrendingAuctions()
})
onUnmounted(() => clearInterval(timer))

// ── API helpers ───────────────────────────────────────────────────
function buildFilterParams() {
  const params = new URLSearchParams()
  const q = String(filter.value.name || '').trim()
  if (q)                                          params.set('q',        q)
  if (filter.value.rarities.length)               params.set('rarity',   filter.value.rarities.join(','))
  if (filter.value.series)                        params.set('series',   filter.value.series)
  if (filter.value.set)                           params.set('set',      filter.value.set)
  if (aFilters.value.selectedOwned !== 'all')     params.set('owned',    aFilters.value.selectedOwned)
  if (aFilters.value.featuredOnly)                params.set('featured', '1')
  if (aFilters.value.wishlistOnly)                params.set('wishlist', '1')
  if (aFilters.value.hasBidsOnly)                 params.set('hasBids',  '1')
  if (aFilters.value.gtoonsOnly)                  params.set('gtoon',    '1')
  return params
}

function loadAuctions() {
  isLoading.value = true
  const params = new URLSearchParams()
  if (aFilters.value.hasBidsOnly) params.set('hasBids', '1')
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

watch(() => filter.value.sortField, () => {
  if (activeTab.value === 'mine')   { myPage.value = 1;      loadMyAuctions() }
  if (activeTab.value === 'mybids') { myBidsPage.value = 1;  loadMyBids()     }
  if (activeTab.value === 'all')    { allPage.value = 1;     loadAllAuctions()}
})

// A re-list creates a new auction and retires the old one's re-list button.
watch(auctionCreatedSignal, () => {
  if (activeTab.value === 'mine') loadMyAuctions()
})

watch(myPage,     () => { if (activeTab.value === 'mine')   loadMyAuctions() })
watch(myBidsPage, () => { if (activeTab.value === 'mybids') loadMyBids()     })
watch(allPage,    () => { if (activeTab.value === 'all')    loadAllAuctions()})

watch(() => aFilters.value.hasBidsOnly, () => {
  loadAuctions()
  loadTrendingAuctions()
})

watch(() => aFilters.value.wishlistOnly, val => {
  if (val) loadWishlist()
})

// Sidebar filter changes → reset + reload server-side tabs, reset client page
watch(
  [
    () => filter.value.name, () => filter.value.rarities, () => filter.value.series, () => filter.value.set,
    () => filter.value.priceMin, () => filter.value.priceMax,
    () => aFilters.value.featuredOnly, () => aFilters.value.wishlistOnly,
    () => aFilters.value.gtoonsOnly,   () => aFilters.value.selectedOwned,
  ],
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
    if (series && item.series !== series)                                             return false
    if (set    && item.set    !== set)                                                return false
    if (filter.value.excludeSecondEditions && item.isSecondEdition)                  return false
    if (aFilters.value.featuredOnly  && !item.isFeatured)                            return false
    if (aFilters.value.selectedOwned === 'owned'   && !item.isOwned)                 return false
    if (aFilters.value.selectedOwned === 'unowned' && item.isOwned)                  return false
    if (aFilters.value.wishlistOnly) {
      if (!hasLoadedWishlist.value || !wishlistCtoonIdSet.value.has(item.ctoonId)) return false
    }
    if (aFilters.value.hasBidsOnly && Number(item.bidCount ?? 0) < 1)               return false
    if (aFilters.value.gtoonsOnly  && !item.isGtoon)                                 return false
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
  aFilters.value.featuredOnly || aFilters.value.wishlistOnly || aFilters.value.hasBidsOnly ||
  aFilters.value.gtoonsOnly   || aFilters.value.selectedOwned !== 'all'
))

// ── Actions ───────────────────────────────────────────────────────
function switchTab(id) {
  activeTab.value = id
  if (id === 'current') { loadAuctions(); loadTrendingAuctions() }
  else if (id === 'mybids') { myBidsPage.value = 1; loadMyBids() }
  else if (id === 'mine')   { myPage.value = 1;     loadMyAuctions() }
  else if (id === 'all')    { allPage.value = 1;     loadAllAuctions() }
}

function scrollContentToTop() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = 0
    if (cardEl.value) cardEl.value.scrollTop = 0
  })
}

function prevPage() {
  const p = activePage.value
  if (p <= 1) return
  if      (activeTab.value === 'mine')   myPage.value = p - 1
  else if (activeTab.value === 'mybids') myBidsPage.value = p - 1
  else if (activeTab.value === 'all')    allPage.value = p - 1
  else currentPage.value = p - 1
  scrollContentToTop()
}

function nextPage() {
  const p = activePage.value
  if (p >= totalPages.value) return
  if      (activeTab.value === 'mine')   myPage.value = p + 1
  else if (activeTab.value === 'mybids') myBidsPage.value = p + 1
  else if (activeTab.value === 'all')    allPage.value = p + 1
  else currentPage.value = p + 1
  scrollContentToTop()
}

function openInfoModal(item) {
  openCtoonModal({
    ctoonId:     item.ctoonId    || null,
    userCtoonId: item.userCtoonId || null,
    assetPath:   item.assetPath  || null,
    name:        item.name       || null,
    context:     { source: 'auction' },
  })
}

// Put an unsold cToon straight back up, starting from the terms it didn't sell
// under. canRelist is advisory — POST /api/auctions re-checks ownership, burned
// state, active auctions and pending trades before creating anything.
function openRelist(item) {
  if (!item?.canRelist) return
  const duration = reconstructDurationPrefill(item.createdAt, item.endAt, item.durationMinutes)
  openAuctionModal({
    ctoon: {
      id:         item.userCtoonId,
      ctoonId:    item.ctoonId,
      name:       item.name,
      assetPath:  item.assetPath,
      rarity:     item.rarity,
      mintNumber: item.mintNumber,
      price:      item.price,
    },
    prefill: {
      isRelist:       true,
      initialBet:     item.initialBid,
      durationPreset: duration.preset,
      timeframe:      duration.timeframe,
      customEndAtLocal: seedCustomEnd(duration.customMinutes),
    },
  })
}

// A re-list whose exact length isn't one of the chips reopens the calendar,
// seeded to the same length measured from now.
function seedCustomEnd(minutes) {
  if (!Number.isInteger(minutes)) return ''
  const d = new Date(Date.now() + minutes * 60000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Formatters ────────────────────────────────────────────────────
function isEnded(endAt)  { return new Date(endAt) <= now.value }
function formatDate(d)   { return new Date(d).toLocaleDateString() }

// Hours were the largest unit here, so a multi-day auction rendered as
// "167h 59m" inside a nowrap badge sitting over the card art. formatRemainingShort
// adds a day tier and is shared with the detail page, which had its own copy of
// the same bug.
function formatRemaining(endAt) {
  return formatRemainingShort(new Date(endAt) - now.value)
}

function formatHighestBid(item) {
  const count = Number(item?.bidCount ?? 0)
  if (count < 1) return 'No bids'
  const bid = item?.highestBid ?? item?.winningBid
  if (bid == null) return 'No bids'
  return `${bid} pts (${count} bid${count !== 1 ? 's' : ''})`
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

/* ── View toggle ── */
.ah-view-toggle {
  display: flex;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.ah-vt-btn {
  border: none;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.45);
  font-size: 0.6rem;
  font-weight: bold;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.ah-vt-btn.active  { background: var(--OrbitLightBlue); color: #fff; }
.ah-vt-btn:not(.active):hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }

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
  height: 106px;
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
  min-height: 106px;
  flex-shrink: 0;
  transition: background 0.12s;
}
.ah-row:hover   { background: rgba(0,0,0,0.38); }
.ah-row.trending { border-color: rgba(251,191,36,0.35); }

.ah-img {
  width: 102px;
  height: 102px;
  object-fit: contain;
  image-rendering: pixelated;
  display: block;
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

/* Action buttons */
/* Stacked rather than side by side: the row's fixed columns already consume
   nearly the full width on a phone, so a second column would push View
   off-screen. Fixed width so rows without a Re-list button don't jump. */
.ah-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 54px;
  flex-shrink: 0;
}

.ah-view, .ah-relist {
  width: 100%;
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

.ah-relist {
  border-color: var(--OrbitGreen);
  color: var(--OrbitGreen);
}
.ah-relist:hover { background: rgba(102,204,0,0.25); }

/* ── Card grid ── */
/* The column count follows the *pane*, not the viewport. The newsite layout
   gives main-content a fixed 800px on desktop and 100vw on mobile, and it
   decides which via JS (window.innerWidth x devicePixelRatio) while CSS media
   queries deliberately ignore zoom — so the two disagree under browser zoom and
   on monitor changes. A container query asks the only question that actually
   matters here: how wide is the grid? */
.ah {
  container-type: inline-size;
  container-name: ah-pane;
}

.ah-card-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: var(--shortcard-height);
  gap: 4px;
  padding: 4px;
  box-sizing: border-box;
}

.ah-card-grid :deep(.sc) {
  width: 100%;
  cursor: pointer;
  --sc-header-bg: url('/images/newsite/infocardSplash.png') top / 100% 100% no-repeat;
  --sc-footer-left-width: 60%;
  --sc-footer-right-width: 40%;
}

/* Two buttons cannot share 40% of a 151px card and stay readable — both labels
   ellipsise to "Vi…" / "R…". Give these cards the stacked footer instead: price
   on top, the two buttons side by side across the full width beneath it. Uses a
   class rather than a per-card inline style, so it costs a string compare per
   countdown tick instead of an object allocation. */
.ah-card-grid :deep(.sc.ah-card--has-relist) .sc-footer {
  flex-direction: column;
  gap: 3px;
}
.ah-card-grid :deep(.sc.ah-card--has-relist) .sc-footer-left,
.ah-card-grid :deep(.sc.ah-card--has-relist) .sc-footer-right {
  width: 100%;
  flex: 0 0 auto;
}
.ah-card-grid :deep(.sc.ah-card--has-relist) .sc-footer-left  { justify-content: center; }
.ah-card-grid :deep(.sc.ah-card--has-relist) .sc-footer-right { justify-content: flex-start; }

.ah-card-skeleton {
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  animation: ah-pulse 1.2s ease-in-out infinite;
}

.ah-card-empty {
  grid-column: 1 / -1;
}

/* Card internals */
/* `inset: 0` against .sc-header's `position: relative`, rather than
   `height: 100%` against a flex-sized `auto` parent, which WebKit resolves to
   `auto` and shrink-wraps. */
.ah-card-header {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

.ah-card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(0.7);
  image-rendering: pixelated;
}

.ah-card-time-badge {
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.52rem;
  font-weight: bold;
  background: rgba(0,0,0,0.65);
  color: #fca5a5;
  padding: 1px 5px;
  border-radius: 10px;
  white-space: nowrap;
  pointer-events: none;
}
.ah-card-time-badge.ended { color: rgba(255,255,255,0.45); }

.ah-card-featured-tag {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 0.48rem;
  font-weight: bold;
  background: #fbbf24;
  color: #000;
  padding: 1px 5px;
  border-radius: 10px;
  pointer-events: none;
  z-index: 2;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ah-card-middle {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  gap: 3px;
}

.ah-card-name {
  font-size: 0.6rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: center;
}

.ah-card-rarity {
  flex-shrink: 0;
}

/* flex + min-width:0 so the price ellipsises instead of being clipped
   mid-glyph: "125000 pts (137 bids)" overruns the bar on a phone. */
.ah-card-bid-val {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.62rem;
  font-weight: bold;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
  line-height: 1;
}

/* The buttons carry their own height rather than inheriting a percentage from
   the footer. `height: 100%` only ever worked because the footer was pinned to
   a definite 26px; the moment the halves stack it resolves against an auto
   parent and collapses to a ~13px line box (0 on WebKit). */
.ah-card-actions {
  display: flex;
  gap: 3px;
  width: 100%;
}

.ah-card-view-btn,
.ah-card-relist-btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 24px;
  padding: 0 3px;
  border-radius: 4px;
  font-size: 0.6rem;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background 0.12s;
}

/* Contrast: the old rgba(0,0,0,0.3) over --OrbitDarkBlue left the Re-list label
   at 2.5:1, and both hover states dropped *below* their resting ratio. */
.ah-card-view-btn {
  background: rgba(0,0,0,0.45);
  border: 1px solid #7FC4E8;
  color: #fff;
}
.ah-card-view-btn:hover { background: #1F5C85; }

.ah-card-relist-btn {
  background: rgba(0,0,0,0.45);
  border: 1px solid #8FE03A;
  color: #A8E86B;
}
.ah-card-relist-btn:hover { background: #24471B; color: #C6F095; }

/* Three nested `overflow: hidden` ancestors clip an outside focus ring away. */
.ah-card-view-btn:focus-visible,
.ah-card-relist-btn:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -3px;
}

/* ── Owned/Unowned image badge ── */
.ah-img-wrap {
  position: relative;
  width: 102px;
  height: 102px;
  flex-shrink: 0;
  cursor: pointer;
}
.ah-img-wrap .ah-img {
  width: 100%;
  height: 100%;
}
.ah-own-badge {
  position: absolute;
  top: 3px;
  left: 3px;
  font-size: 0.55rem;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 3px;
  pointer-events: none;
  white-space: nowrap;
  line-height: 1.4;
}
.ah-own-badge--owned {
  background: #16a34a;
  color: #fff;
  border: 1px solid #15803d;
}
.ah-own-badge--unowned {
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.3);
}
.ah-own-badge--won {
  background: #16a34a;
  color: #fff;
  border: 1px solid #15803d;
}
.ah-own-badge--lost {
  background: #dc2626;
  color: #fff;
  border: 1px solid #b91c1c;
}
.ah-card-own-badge {
  position: absolute;
  top: 4px;
  left: 4px;
}

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
.ah-pagination--top {
  border-top: none;
  border-bottom: 1px solid rgba(255,255,255,0.08);
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

/* ── Narrow pane: stack the footer ──────────────────────────────
   Two buttons cannot share a 40%-wide bar on a ~110px card, so price and
   actions become two rows. Three things this has to get right, all of which
   the previous attempt got wrong:

   - The footer must be allowed to *grow*. It used to be pinned to 26px with
     `overflow: hidden`, so stacking two 24px halves clipped the second one —
     the actions row — out of existence. ShortCard now takes a min-height floor.
   - The width override has to be a concrete `width`, not a variable, so it
     beats the per-card `--sc-footer-*-width` set on `.sc` itself.
   - The buttons need their own `min-height`. Percentages resolve to `auto`
     against a content-sized parent and collapse to a ~13px line box.

   Column ladder: 5 on the 800px desktop pane, 3 once a card would fall under
   ~140px, 2 on a phone. At 3 columns on a 360px phone a 44px tap target leaves
   ~40px of art — less than the list view's own 72px thumbnail — which is why
   phones get 2, matching MyCollection, MyWishlist and AllCtoons. */
@container ah-pane (max-width: 700px) {
  .ah-card-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: auto;
  }

  .ah-card-grid :deep(.sc) {
    width: 100%;
    height: auto;
    aspect-ratio: 3 / 4;
    --sc-footer-gap: 3px;
    /* The splash frame is square; `100% 100%` stretches it as the footer grows. */
    --sc-header-bg: url('/images/newsite/infocardSplash.png') top / 100% auto no-repeat;
  }

  /* No aspect-ratio (iOS <= 14): fall back to a fixed card rather than letting
     it collapse to a sliver. */
  @supports not (aspect-ratio: 3 / 4) {
    .ah-card-grid :deep(.sc) { height: var(--shortcard-height, 176px); }
  }

  .ah-card-grid :deep(.sc-footer) { flex-direction: column; }
  .ah-card-grid :deep(.sc-footer-left),
  .ah-card-grid :deep(.sc-footer-right) { width: 100%; flex: 0 0 auto; }
  .ah-card-grid :deep(.sc-footer-left)  { justify-content: center; }
  .ah-card-grid :deep(.sc-footer-right) { justify-content: flex-start; }

  .ah-card-view-btn,
  .ah-card-relist-btn {
    min-height: 44px;
    font-size: 0.72rem;
  }

  /* Downscaling with nearest-neighbour just drops pixels; most cToon art is
     50-135px intrinsic and is already being shrunk. */
  .ah-card-img { transform: none; }
}

@container ah-pane (max-width: 440px) {
  .ah-card-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  /* Four tabs plus the view toggle need ~390px of a 352px bar at 360px wide,
     and nothing here clips, so the labels overlapped their neighbours. */
  .ah-topbar { flex-wrap: wrap; }
  .ah-tabs { flex: 1 1 100%; }

  /* Reclaim width for the name: the row's fixed columns leave the body almost
     nothing at 360px once a second action button is in play. */
  .ah-img-wrap, .ah-img-wrap .ah-img { width: 72px; height: 72px; }
  .ah-bid  { width: 68px; }
  .ah-time { width: 52px; }

  /* Bare minimum tap targets — these buttons create a real auction. */
  .ah-view, .ah-relist { min-height: 32px; }
}
</style>
