<template>
  <div class="my-collection">

    <!-- ── Header bar ────────────────────────────────────────────── -->
    <div class="mc-header">My Collection</div>

    <!-- ── Auction modal ──────────────────────────────────────────── -->
    <AuctionModal
      v-if="auctionCtoon"
      :ctoon="auctionCtoon"
      @close="auctionCtoon = null"
      @created="onAuctionCreated"
    />

    <!-- ── Pagination (top) ─────────────────────────────────────── -->
    <div class="mc-pagination">
      <button class="mc-pg-btn" :disabled="currentPage <= 1" @click="prevPage">‹</button>
      <span class="mc-pg-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="mc-pg-btn" :disabled="currentPage >= totalPages" @click="nextPage">›</button>
    </div>

    <!-- ── Card grid ─────────────────────────────────────────────── -->
    <div class="mc-grid">
      <div v-if="loading" class="mc-status">Loading…</div>
      <div v-else-if="!ctoons.length" class="mc-status">No cToons in your collection.</div>
      <template v-else>
        <ShortCard v-for="c in paginatedCtoons" :key="c.id" :style="{ '--footer-left-width': '50%', '--footer-right-width': '50%' }">
          <template #header>
            <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="card-img card-img--clickable" @click="openInfo(c)" />
          </template>
          <template #middle>
            <span class="card-mint">#{{ c.mintNumber ?? '?' }}</span>
            <span class="card-name">{{ c.name }}</span>
            <span class="rarity-dot" :style="{ background: rarityColor(c.rarity) }" :title="c.rarity" />
          </template>
          <template #footer-left>
            <BlueButton class="card-btn" :disabled="hasActiveAuction(c)" @click="openAuction(c)">Auction</BlueButton>
          </template>
          <template #footer-right>
            <GreenButton class="card-btn" :disabled="tradeListLoading" @click="toggleTradeList(c)">
              {{ tradeList.includes(c.id) ? 'Remove Tradable' : 'Make Tradable' }}
            </GreenButton>
          </template>
        </ShortCard>
      </template>
    </div>

    <!-- ── Pagination (bottom) ───────────────────────────────────── -->
    <div class="mc-pagination">
      <button class="mc-pg-btn" :disabled="currentPage <= 1" @click="prevPage">‹</button>
      <span class="mc-pg-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="mc-pg-btn" :disabled="currentPage >= totalPages" @click="nextPage">›</button>
    </div>

  </div>
</template>

<script setup>
const { open: openCtoonModal } = useCtoonModal()
const { tradeList, loading: tradeListLoading, add: addToTradeList, remove: removeFromTradeList } = useTradeList()

function openInfo(c) {
  openCtoonModal({ ctoonId: c.ctoonId, userCtoonId: c.id, assetPath: c.assetPath, name: c.name })
}

const RARITY_ORDER = {
  'common': 0, 'uncommon': 1, 'rare': 2, 'very rare': 3,
  'crazy rare': 4, 'prize only': 5, 'code only': 6, 'auction only': 7,
}

const RARITY_COLORS = {
  'common':       '#aaaaaa',
  'uncommon':     '#33cc33',
  'rare':         '#3399ff',
  'very rare':    '#aa44ff',
  'crazy rare':   '#ffaa00',
  'prize only':   '#ff3366',
  'code only':    '#00cccc',
  'auction only': '#ff6600',
}

function rarityColor(rarity) {
  return RARITY_COLORS[(rarity || '').toLowerCase()] || '#aaaaaa'
}

const allCtoons   = useState('myCollectionCtoons', () => [])
const loading     = ref(true)
const filter      = useNewSiteCtoonFilter()
const auctionCtoon = ref(null)

const PAGE_SIZE   = 30
const currentPage = ref(1)

watch(filter, () => { currentPage.value = 1 }, { deep: true })

function hasActiveAuction(c) {
  return (c.auctions && c.auctions.length > 0) || !!c.hasActiveAuction
}

function openAuction(c) {
  if (hasActiveAuction(c)) return
  auctionCtoon.value = c
}

async function toggleTradeList(c) {
  if (tradeList.value.includes(c.id)) {
    await removeFromTradeList(c.id)
  } else {
    await addToTradeList(c.id)
  }
}

function onAuctionCreated(userCtoonId) {
  // Mark the ctoon as having an active auction so button could be disabled in future
  const ctoon = allCtoons.value.find(c => c.id === userCtoonId)
  if (ctoon) ctoon.hasActiveAuction = true
  auctionCtoon.value = null
}

const ctoons = computed(() => {
  const f = filter.value
  let list = allCtoons.value

  if (f.name)
    list = list.filter(c => c.name.toLowerCase().includes(f.name.toLowerCase()))

  if (f.rarities.length)
    list = list.filter(c => f.rarities.includes((c.rarity || '').toLowerCase()))

  if (f.series)
    list = list.filter(c => c.series === f.series)

  if (f.set)
    list = list.filter(c => c.set === f.set)

  if (f.priceMin !== '')
    list = list.filter(c => c.price >= Number(f.priceMin))

  if (f.priceMax !== '')
    list = list.filter(c => c.price <= Number(f.priceMax))

  list = [...list].sort((a, b) => {
    let cmp = 0
    if (f.sortField === 'acquiredDate') {
      cmp = new Date(a.acquiredAt) - new Date(b.acquiredAt)
    } else if (f.sortField === 'price') {
      cmp = a.price - b.price
    } else if (f.sortField === 'rarity') {
      const ar = RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 99
      const br = RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 99
      cmp = ar - br
    } else if (f.sortField === 'acquiredAt') {
      const at = a.acquiredAt ? new Date(a.acquiredAt).getTime() : 0
      const bt = b.acquiredAt ? new Date(b.acquiredAt).getTime() : 0
      cmp = at - bt
    } else if (f.sortField === 'mintNumber') {
      // Primary: mint number (direction controlled by sortAsc)
      const am = a.mintNumber ?? Infinity
      const bm = b.mintNumber ?? Infinity
      const primaryCmp = f.sortAsc ? (am - bm) : (bm - am)
      if (primaryCmp !== 0) return primaryCmp
      // Secondary: acquisition date descending (fixed)
      const at = a.acquiredAt ? new Date(a.acquiredAt).getTime() : 0
      const bt = b.acquiredAt ? new Date(b.acquiredAt).getTime() : 0
      const secondaryCmp = bt - at
      if (secondaryCmp !== 0) return secondaryCmp
      // Tertiary: name ascending (fixed)
      return a.name.localeCompare(b.name)
    } else {
      cmp = a.name.localeCompare(b.name)
    }
    return f.sortAsc ? cmp : -cmp
  })

  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(ctoons.value.length / PAGE_SIZE)))

const paginatedCtoons = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return ctoons.value.slice(start, start + PAGE_SIZE)
})

function prevPage() { if (currentPage.value > 1) currentPage.value-- }
function nextPage() { if (currentPage.value < totalPages.value) currentPage.value++ }

onMounted(async () => {
  try {
    allCtoons.value = await $fetch('/api/collections')
  } catch (err) {
    console.error('MyCollection: failed to load', err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.my-collection {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: white;
  box-sizing: border-box;
  overflow: hidden;

  --img-scale: 0.7;
}

.mc-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3px 6px;
  background: var(--OrbitDarkBlue);
  border-top: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.mc-pg-btn {
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
.mc-pg-btn:disabled { opacity: 0.3; cursor: default; }
.mc-pg-btn:not(:disabled):hover { background: rgba(255,255,255,0.1); }

.mc-pg-info {
  font-size: 0.63rem;
  color: rgba(255,255,255,0.55);
  min-width: 55px;
  text-align: center;
}

.mc-header {
  flex-shrink: 0;
  width: 100%;
  height: 23px;
  line-height: 21px;
  padding-bottom: 2px;
  overflow: hidden;
  text-align: center;
  font-size: 1.6rem;
  font-weight: bold;
  color: #ffffff;
  background: var(--OrbitLightBlue);
  box-sizing: border-box;
}

.mc-grid {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue) transparent;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: var(--shortcard-height);
  grid-auto-flow: row;
  gap: 4px;
  padding: 4px;
  box-sizing: border-box;
  --shortcard-width: 100%;
}

@media (max-width: 768px) {
  .mc-grid {
    grid-template-columns: repeat(2, 1fr);
    --footer-height: 52px;
    --footer-left-width: 100%;
    --footer-right-width: 100%;
  }

  :deep(.sc-footer) {
    flex-direction: column;
  }

  :deep(.sc-footer-right) {
    justify-content: flex-start;
  }
}

/* ── Status ──────────────────────────────────────────────────── */
.mc-status {
  grid-column: 1 / -1;
  text-align: center;
  color: #336699;
  font-size: 2rem;
  padding: 20px;
}

/* ── Card contents ───────────────────────────────────────────── */
.rarity-dot {
  width: 8px;
  height: 8px;
  min-width: 8px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(var(--img-scale));
}

.card-img--clickable {
  cursor: pointer;
}
.card-img--clickable:hover {
  filter: brightness(1.12);
}

.card-btn {
  width: 100%;
  height: 100%;
  padding: 0;
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-mint {
  font-size: 0.7rem;
  color: #fff;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 0 2px;
}

.card-name {
  font-size: 0.6rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: center;
}

</style>
