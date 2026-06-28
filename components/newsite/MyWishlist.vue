<template>
  <div class="my-wishlist">

    <div class="mwl-header">My Wishlist</div>

    <div class="mwl-scroll">
      <div v-if="loading" class="mwl-status">Loading…</div>
      <div v-else-if="!filteredItems.length && !allItems.length" class="mwl-status">Your wishlist is empty.</div>
      <div v-else-if="!filteredItems.length" class="mwl-status">No cToons match your filters.</div>

      <div v-else class="mwl-grid">
        <ShortCard
          v-for="c in filteredItems"
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
              class="remove-btn"
              :disabled="processing.has(c.id)"
              @click.stop="removeItem(c)"
            >Remove from Wishlist</button>
          </template>
        </ShortCard>
      </div>
    </div>

  </div>
</template>

<script setup>
const { open: openCtoonModal } = useCtoonModal()
const filter = useMyWishlistFilter()
const { remove: wishlistRemove } = useWishlist()

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

const allItems  = ref([])
const loading   = ref(true)
const processing = ref(new Set())

const filteredItems = computed(() => {
  const f = filter.value
  let list = allItems.value.filter(c => {
    const nm = !f.name || c.name.toLowerCase().includes(f.name.toLowerCase())
    const r  = !f.rarities.length || f.rarities.includes((c.rarity || '').toLowerCase())
    const tr = !f.tradable || c.hasTradableOwner
    return nm && r && tr
  })

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
})

async function removeItem(c) {
  if (processing.value.has(c.id)) return
  processing.value = new Set([...processing.value, c.id])
  try {
    await wishlistRemove(c.id)
    allItems.value = allItems.value.filter(item => item.id !== c.id)
  } finally {
    const next = new Set(processing.value)
    next.delete(c.id)
    processing.value = next
  }
}

onMounted(async () => {
  try {
    allItems.value = await $fetch('/api/wishlist')
  } catch (err) {
    console.error('MyWishlist: failed to load', err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.my-wishlist {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: white;
  box-sizing: border-box;
  overflow: hidden;
}

.mwl-header {
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

.mwl-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue) transparent;
  padding: 6px;
  box-sizing: border-box;
}

.mwl-status {
  text-align: center;
  color: #336699;
  font-size: 2rem;
  padding: 20px;
}

/* ── Grid ── */
.mwl-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-auto-rows: var(--shortcard-height);
  gap: 4px;
  --shortcard-width: 100%;
}

@media (max-width: 768px) {
  .mwl-grid {
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

/* ── Remove button ── */
.remove-btn {
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
  background: #f47b00;
  color: #fff;
  cursor: pointer;
  user-select: none;
}

.remove-btn:disabled { opacity: 0.5; cursor: default; }
.remove-btn:not(:disabled):hover { filter: brightness(1.1); }
</style>
