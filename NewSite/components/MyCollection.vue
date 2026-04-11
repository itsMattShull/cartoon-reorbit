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

    <!-- ── Card grid ─────────────────────────────────────────────── -->
    <div class="mc-grid">
      <div v-if="loading" class="mc-status">Loading…</div>
      <div v-else-if="!ctoons.length" class="mc-status">No cToons in your collection.</div>
      <template v-else>
        <ShortCard v-for="c in ctoons" :key="c.id" :style="{ '--footer-left-width': '50%', '--footer-right-width': '50%' }">
          <template #header>
            <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="card-img" />
          </template>
          <template #middle>
            <span class="card-mint">#{{ c.mintNumber ?? '?' }}</span>
            <span class="card-name">{{ c.name }}</span>
            <span class="rarity-dot" :style="{ background: rarityColor(c.rarity) }" :title="c.rarity" />
          </template>
          <template #footer-left>
            <BlueButton class="card-btn" @click="openAuction(c)">Auction</BlueButton>
          </template>
          <template #footer-right>
            <GreenButton class="card-btn">Trade List</GreenButton>
          </template>
        </ShortCard>
      </template>
    </div>

  </div>
</template>

<script setup>
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
const filter      = useCtoonFilter()
const auctionCtoon = ref(null)

function openAuction(c) { auctionCtoon.value = c }
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
    if (f.sortField === 'price') {
      cmp = a.price - b.price
    } else if (f.sortField === 'rarity') {
      const ar = RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 99
      const br = RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 99
      cmp = ar - br
    } else {
      cmp = a.name.localeCompare(b.name)
    }
    return f.sortAsc ? cmp : -cmp
  })

  return list
})

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
  grid-template-columns: repeat(4, var(--shortcard-width));
  grid-auto-rows: var(--shortcard-height);
  grid-auto-flow: row;
  gap: 4px;
  padding: 4px;
  justify-content: center;
  box-sizing: border-box;
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
