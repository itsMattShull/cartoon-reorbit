<template>
  <div class="all-ctoons">

    <div class="ac-header">All cToons</div>

    <!-- ── Pagination (top) ─────────────────────────────────────── -->
    <div class="ac-pagination">
      <button class="ac-pg-btn" :disabled="groupPage <= 1" @click="prevGroupPage">‹</button>
      <span class="ac-pg-info">{{ groupPage }} / {{ totalGroupPages }}</span>
      <button class="ac-pg-btn" :disabled="groupPage >= totalGroupPages" @click="nextGroupPage">›</button>
    </div>

    <div class="ac-scroll">
      <div v-if="loading" class="ac-status">Loading…</div>
      <div v-else-if="!filteredCtoons.length" class="ac-status">No cToons found.</div>

      <template v-else>
        <div v-for="groupName in pagedGroupNames" :key="groupName" class="ac-group">
          <div class="ac-group-header">
            <span class="ac-group-name">{{ groupName }}</span>
            <span class="ac-group-count">
              {{ ownedInGroup(groupName) }}/{{ totalInGroup(groupName) }} owned
            </span>
          </div>
          <div class="ac-grid">
            <ShortCard
              v-for="c in itemsInGroup(groupName)"
              :key="c.id"
              :style="{ '--footer-left-width': '100%', '--footer-right-width': '0%' }"
            >
              <template #header>
                <div class="card-header-wrap" @click="openInfo(c)">
                  <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="card-img" />
                  <span
                    class="owned-badge"
                    :class="c.isOwned ? 'owned-badge--owned' : 'owned-badge--unowned'"
                  >{{ c.isOwned ? 'Owned' : 'Unowned' }}</span>
                </div>
              </template>
              <template #middle>
                <span class="card-name">{{ c.name }}</span>
                <span class="rarity-dot" :style="{ background: rarityColor(c.rarity) }" :title="c.rarity" />
              </template>
              <template #footer-left>
                <button
                  class="wishlist-btn"
                  :class="inWishlist(c.id) ? 'wishlist-btn--remove' : 'wishlist-btn--add'"
                  :disabled="wishlistLoading || processing.has(c.id)"
                  @click.stop="toggleWishlist(c)"
                >
                  {{ inWishlist(c.id) ? 'Remove from Wishlist' : 'Add to Wishlist' }}
                </button>
              </template>
            </ShortCard>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Pagination (bottom) ───────────────────────────────────── -->
    <div class="ac-pagination">
      <button class="ac-pg-btn" :disabled="groupPage <= 1" @click="prevGroupPage">‹</button>
      <span class="ac-pg-info">{{ groupPage }} / {{ totalGroupPages }}</span>
      <button class="ac-pg-btn" :disabled="groupPage >= totalGroupPages" @click="nextGroupPage">›</button>
    </div>

  </div>

  <WishlistModal
    v-if="wishlistModalCtoon"
    :ctoon="wishlistModalCtoon"
    @close="wishlistModalCtoon = null"
    @added="wishlistModalCtoon = null"
  />
</template>

<script setup>
const { open: openCtoonModal } = useCtoonModal()
const activeTab = useAllCtoonsTab()
const filter    = useAllCtoonsFilter()

function openInfo(c) {
  openCtoonModal({ ctoonId: c.id, assetPath: c.assetPath, name: c.name })
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

const RARITY_ORDER = {
  'common': 0, 'uncommon': 1, 'rare': 2, 'very rare': 3,
  'crazy rare': 4, 'prize only': 5, 'code only': 6, 'auction only': 7,
}

const { wishlist, loading: wishlistLoading, remove: wishlistRemove } = useWishlist()
const processing = ref(new Set())

const wishlistModalCtoon = ref(null)

function inWishlist(ctoonId) {
  return wishlist.value.includes(ctoonId)
}

async function toggleWishlist(c) {
  if (processing.value.has(c.id)) return
  if (inWishlist(c.id)) {
    processing.value = new Set([...processing.value, c.id])
    try {
      await wishlistRemove(c.id)
    } finally {
      const next = new Set(processing.value)
      next.delete(c.id)
      processing.value = next
    }
  } else {
    wishlistModalCtoon.value = c
  }
}

const GROUPS_PER_PAGE = 5
const groupPage       = ref(1)

watch([filter, activeTab], () => { groupPage.value = 1 }, { deep: true })

const totalGroupPages = computed(() => Math.max(1, Math.ceil(groupNames.value.length / GROUPS_PER_PAGE)))

const pagedGroupNames = computed(() => {
  const start = (groupPage.value - 1) * GROUPS_PER_PAGE
  return groupNames.value.slice(start, start + GROUPS_PER_PAGE)
})

function prevGroupPage() { if (groupPage.value > 1) groupPage.value-- }
function nextGroupPage() { if (groupPage.value < totalGroupPages.value) groupPage.value++ }

const allCtoons = ref([])
const loading   = ref(true)

const filteredCtoons = computed(() => {
  const f = filter.value
  return allCtoons.value.filter(c => {
    const nm = !f.name || c.name.toLowerCase().includes(f.name.toLowerCase())
    const r  = !f.rarities.length || f.rarities.includes((c.rarity || '').toLowerCase())
    const o  = f.owned === 'all'
      ? true
      : f.owned === 'owned' ? c.isOwned : !c.isOwned
    const w  = !f.wishlist || wishlist.value.includes(c.id)
    return nm && r && o && w
  })
})

function sortedItems(list) {
  const f = filter.value
  return list.slice().sort((a, b) => {
    let cmp = 0
    if (f.sortField === 'rarity') {
      const ar = RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 99
      const br = RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 99
      cmp = ar - br
    } else if (f.sortField === 'releaseDate') {
      const at = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const bt = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      cmp = at - bt
    } else {
      cmp = (a.name || '').localeCompare(b.name || '')
    }
    return f.sortAsc ? cmp : -cmp
  })
}

const groupNames = computed(() => {
  const key   = activeTab.value === 'AllSeries' ? 'series' : 'set'
  const f     = filter.value
  const names = [...new Set(filteredCtoons.value.map(c => c[key]).filter(Boolean))]

  if (f.sortField === 'releaseDate') {
    const groupMinDate = {}
    for (const c of filteredCtoons.value) {
      const grp = c[key]
      if (!grp) continue
      const t = c.releaseDate ? new Date(c.releaseDate).getTime() : 0
      if (groupMinDate[grp] === undefined || t < groupMinDate[grp]) groupMinDate[grp] = t
    }
    return names.sort((a, b) => {
      const diff = (groupMinDate[a] ?? 0) - (groupMinDate[b] ?? 0)
      return f.sortAsc ? diff : -diff
    })
  }

  return names.sort()
})

function itemsInGroup(groupName) {
  const key = activeTab.value === 'AllSeries' ? 'series' : 'set'
  return sortedItems(filteredCtoons.value.filter(c => c[key] === groupName))
}

function ownedInGroup(groupName) {
  return itemsInGroup(groupName).filter(c => c.isOwned).length
}

function totalInGroup(groupName) {
  return itemsInGroup(groupName).length
}

onMounted(async () => {
  try {
    allCtoons.value = await $fetch('/api/collections/all', {
      query: {
        sortField: filter.value.sortField,
        sortAsc:   String(filter.value.sortAsc),
      }
    })
  } catch (err) {
    console.error('AllCtoons: failed to load', err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.all-ctoons {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: white;
  box-sizing: border-box;
  overflow: hidden;
}

.ac-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3px 6px;
  background: var(--OrbitDarkBlue);
  border-top: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

.ac-pg-btn {
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
.ac-pg-btn:disabled { opacity: 0.3; cursor: default; }
.ac-pg-btn:not(:disabled):hover { background: rgba(255,255,255,0.1); }

.ac-pg-info {
  font-size: 0.63rem;
  color: rgba(255,255,255,0.55);
  min-width: 55px;
  text-align: center;
}

.ac-header {
  flex-shrink: 0;
  width: 100%;
  height: 23px;
  line-height: 21px;
  padding-bottom: 2px;
  overflow: hidden;
  text-align: center;
  font-size: 1.6rem;
  font-weight: bold;
  color: #fff;
  background: var(--OrbitLightBlue);
  box-sizing: border-box;
}

.ac-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue) transparent;
  padding: 6px;
  box-sizing: border-box;
}

.ac-status {
  text-align: center;
  color: #336699;
  font-size: 2rem;
  padding: 20px;
}

/* ── Group ── */
.ac-group {
  margin-bottom: 12px;
}

.ac-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  background: var(--OrbitDarkBlue);
  border-radius: 4px;
  margin-bottom: 4px;
}

.ac-group-name {
  font-size: 0.75rem;
  font-weight: bold;
  color: #fff;
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ac-group-count {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
  margin-left: 6px;
}

/* ── Grid ── */
.ac-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-auto-rows: var(--shortcard-height);
  gap: 4px;
  --shortcard-width: 100%;
}

@media (max-width: 768px) {
  .ac-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ── Card contents ── */
.card-header-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(0.7);
}

.card-header-wrap:hover .card-img { filter: brightness(1.12); }

.owned-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 0.5rem;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.4;
  pointer-events: none;
}

.owned-badge--owned   { background: #16a34a;            color: #fff; }
.owned-badge--unowned { background: rgba(0, 0, 0, 0.55); color: rgba(255, 255, 255, 0.75); }

.card-name {
  font-size: 0.6rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: center;
}

.rarity-dot {
  width: 8px;
  height: 8px;
  min-width: 8px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

/* ── Wishlist button ── */
.wishlist-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  font-size: 0.65rem;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: none;
  cursor: pointer;
  user-select: none;
}

.wishlist-btn--add    { background: var(--OrbitGreen); color: #fff; }
.wishlist-btn--remove { background: #f47b00;           color: #fff; }
.wishlist-btn:disabled { opacity: 0.5; cursor: default; }
.wishlist-btn:not(:disabled):hover { filter: brightness(1.1); }
</style>
