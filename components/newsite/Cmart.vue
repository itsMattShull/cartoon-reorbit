<template>
  <div class="cmart" ref="cmartEl">

    <!-- ── Toast notification ───────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="toast.visible" class="cmart-toast" :class="toast.type" :style="{ top: toast.top + 'px', left: toast.left + 'px' }">
        {{ toast.message }}
      </div>
    </Teleport>

    <!-- ── Header bar ────────────────────────────────────────────── -->
    <div class="cmart-header">Cartoon Reorbit cMart</div>

    <!-- ── Card grid ─────────────────────────────────────────────── -->
    <div class="cmart-grid">
      <div v-if="loading" class="cmart-status">Loading…</div>
      <div v-else-if="!ctoons.length" class="cmart-status">No cToons available.</div>
      <template v-else>
        <ShortCard v-for="c in ctoons" :key="c.id">
          <template #header>
            <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="card-img" />
          </template>
          <template #middle>
            <span class="card-name">{{ c.name }}</span>
            <span class="rarity-dot" :style="{ background: rarityColor(c.rarity) }" :title="c.rarity" />
          </template>
          <template #footer-left>
            <span class="card-price">{{ c.price }} pts</span>
          </template>
          <template #footer-right>
            <GreenButton
              class="card-buy"
              :disabled="buyingIds.includes(c.id)"
              @click="buy(c)"
            >
              {{ buyingIds.includes(c.id) ? '…' : 'Buy' }}
            </GreenButton>
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

const allCtoons = useState('cmartCtoons', () => [])
const loading   = ref(true)
const buyingIds = ref([])
const cmartEl   = ref(null)
const filter    = useNewSiteCtoonFilter()

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

  if (f.hideUnavailable)
    list = list.filter(c => !c.nextReleaseAt && !(c.quantity != null && c.totalMinted >= c.quantity))

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

const toast = reactive({ visible: false, message: '', type: 'success', top: 0, left: 0 })
let toastTimer = null

function showToast(message, type = 'success') {
  if (toastTimer) clearTimeout(toastTimer)
  const rect = cmartEl.value?.closest('.main-content')?.getBoundingClientRect()
  if (rect) {
    toast.top  = rect.top + 16
    toast.left = rect.left + rect.width / 2
  }
  toast.message = message
  toast.type    = type
  toast.visible = true
  toastTimer = setTimeout(() => { toast.visible = false }, 2000)
}

onMounted(async () => {
  try {
    allCtoons.value = await $fetch('/api/cmart')
  } catch (err) {
    console.error('Cmart: failed to load', err)
  } finally {
    loading.value = false
  }
})

async function buy(ctoon) {
  if (buyingIds.value.includes(ctoon.id)) return
  buyingIds.value = [...buyingIds.value, ctoon.id]

  try {
    await $fetch('/api/cmart/buy', {
      method: 'POST',
      body: { ctoonId: ctoon.id },
    })
    showToast(`${ctoon.name} purchased!`, 'success')
    // Refresh listing so sold-out states update
    allCtoons.value = await $fetch('/api/cmart')
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Purchase failed.'
    showToast(msg, 'error')
  } finally {
    buyingIds.value = buyingIds.value.filter(id => id !== ctoon.id)
  }
}
</script>

<style scoped>
.cmart {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: white;
  box-sizing: border-box;
  overflow: hidden;

  --price-font-size:  1rem;
  --img-scale:        0.7;
}

.cmart-header {
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

.cmart-grid {
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


/* ── Toast ───────────────────────────────────────────────────── */
:global(.cmart-toast) {
  position: fixed;
  transform: translateX(-50%);
  text-align: center;
  font-size: 0.8rem;
  font-weight: bold;
  padding: 10px 20px;
  border-radius: 8px;
  z-index: 9999;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: toast-in 0.2s ease;
  white-space: nowrap;
}

:global(.cmart-toast.success) {
  background: #1a6a30;
  color: #aaffbb;
  border: 1px solid #2a8a40;
}

:global(.cmart-toast.error) {
  background: #6a1a1a;
  color: #ffaaaa;
  border: 1px solid #8a2a2a;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@media (max-width: 768px) {
  .cmart-grid {
    grid-template-columns: repeat(2, var(--shortcard-width));
  }
}

/* ── Status ──────────────────────────────────────────────────── */
.cmart-status {
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
  margin-left: auto;
  flex-shrink: 0;
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(var(--img-scale));
}

.card-name {
  font-size: 0.6rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  text-align: center;
}

.card-price {
  font-size: var(--price-font-size);
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  padding: 0 2px;
  width: 100%;
  text-align: center;
}

.card-buy {
  width: 100%;
  height: 100%;
  padding: 0;
  font-size: 0.85rem;
  border-radius: 4px;
}
</style>

