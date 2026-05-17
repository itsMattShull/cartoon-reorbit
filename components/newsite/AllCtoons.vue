<template>
  <div class="all-ctoons">

    <!-- Header bar -->
    <div class="ac-header">All cToons</div>

    <!-- Wishlist modal -->
    <WishlistModal
      v-if="wishlistTarget"
      :ctoon="wishlistTarget"
      @close="wishlistTarget = null"
      @added="onWishlistAdded"
    />

    <!-- Card grid -->
    <div class="ac-grid">
      <div v-if="loading" class="ac-status">Loading…</div>
      <div v-else-if="!ctoons.length" class="ac-status">No cToons found.</div>
      <template v-else>
        <ShortCard
          v-for="c in ctoons"
          :key="c.id"
          :style="{ '--footer-left-width': '65%', '--footer-right-width': '35%' }"
        >
          <template #header>
            <img
              v-if="c.assetPath"
              :src="c.assetPath"
              :alt="c.name"
              class="card-img card-img--clickable"
              @click="openInfo(c)"
            />
          </template>
          <template #middle>
            <span class="card-mint">{{ c.highestMint ? `/${c.highestMint}` : '' }}</span>
            <span class="card-name">{{ c.name }}</span>
            <span class="rarity-dot" :style="{ background: rarityColor(c.rarity) }" :title="c.rarity" />
          </template>
          <template #footer-left>
            <button
              class="card-btn"
              :class="inWishlist(c.id) ? 'card-btn--remove' : 'card-btn--add'"
              :disabled="wishlistLoading || processingId === c.id"
              @click.stop="handleWishlist(c)"
            >
              {{ wishlistBtnText(c.id) }}
            </button>
          </template>
          <template #footer-right>
            <button class="card-btn card-btn--info" @click.stop="openInfo(c)">Info</button>
          </template>
        </ShortCard>
      </template>
    </div>

  </div>
</template>

<script setup>
const { open: openCtoonModal } = useCtoonModal()
const { wishlist, loading: wishlistLoading, remove } = useWishlist()

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

const allCtoons = useState('allCtoonsCtoons', () => [])
const loading = ref(true)
const filter = useNewSiteCtoonFilter()
const wishlistTarget = ref(null)
const processingId = ref(null)

function openInfo(c) {
  openCtoonModal({ ctoonId: c.id, assetPath: c.assetPath, name: c.name })
}

function inWishlist(ctoonId) {
  return !wishlistLoading.value && wishlist.value.includes(ctoonId)
}

function wishlistBtnText(ctoonId) {
  if (processingId.value === ctoonId) return '…'
  return inWishlist(ctoonId) ? 'Unwishlist' : '+ Wishlist'
}

async function handleWishlist(c) {
  if (wishlistLoading.value || processingId.value === c.id) return
  if (inWishlist(c.id)) {
    processingId.value = c.id
    try {
      await remove(c.id)
    } finally {
      processingId.value = null
    }
  } else {
    wishlistTarget.value = c
  }
}

function onWishlistAdded() {
  wishlistTarget.value = null
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
    if (f.sortField === 'price') {
      cmp = a.price - b.price
    } else if (f.sortField === 'rarity') {
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

  return list
})

onMounted(async () => {
  try {
    allCtoons.value = await $fetch('/api/collections/all')
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

  --img-scale: 0.7;
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
  color: #ffffff;
  background: var(--OrbitLightBlue);
  box-sizing: border-box;
}

.ac-grid {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue) transparent;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-auto-rows: var(--shortcard-height);
  grid-auto-flow: row;
  gap: 4px;
  padding: 4px;
  box-sizing: border-box;
  --shortcard-width: 100%;
}

@media (max-width: 768px) {
  .ac-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.ac-status {
  grid-column: 1 / -1;
  text-align: center;
  color: #336699;
  font-size: 2rem;
  padding: 20px;
}

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
  font-size: 0.7rem;
  font-weight: bold;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: filter 0.12s;
}
.card-btn:disabled { opacity: 0.5; cursor: default; }
.card-btn:not(:disabled):hover { filter: brightness(1.12); }

.card-btn--add {
  background: var(--OrbitGreen, #66CC00);
  color: #fff;
}

.card-btn--remove {
  background: #cc3300;
  color: #fff;
}

.card-btn--info {
  background: var(--OrbitDarkBlue, #336699);
  color: #fff;
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
