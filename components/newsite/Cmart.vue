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
      <template v-if="loading">
        <ShortCard v-for="n in 100" :key="'skel-' + n" class="skel-card">
          <template #header><div class="skel-img" /></template>
          <template #middle><div class="skel-line skel-name" /></template>
          <template #footer-left><div class="skel-line skel-price" /></template>
          <template #footer-right><div class="skel-line skel-btn" /></template>
        </ShortCard>
      </template>
      <div v-else-if="!ctoons.length" class="cmart-status">No cToons available.</div>
      <template v-else>
        <ShortCard
          v-for="c in ctoons"
          :key="c.id"
          :style="isSoldOut(c) && !hasCountdown(c)
            ? { '--footer-left-width': '100%', '--footer-right-width': '0%' }
            : {}"
        >
          <template #header>
            <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="card-img" />
          </template>
          <template #middle>
            <div class="card-middle-row">
              <span class="card-name">{{ c.name }}</span>
              <span
                class="rarity-badge"
                :style="{ background: rarityInfo(c.rarity).bg, color: rarityInfo(c.rarity).fg }"
                :title="c.rarity"
              >{{ rarityInfo(c.rarity).label }}</span>
            </div>
          </template>
          <template #footer-left>
            <span v-if="isSoldOut(c) && !hasCountdown(c)" class="card-sold-out">Sold Out</span>
            <span v-else class="card-price">{{ c.price }} pts</span>
          </template>
          <template #footer-right>
            <template v-if="!isSoldOut(c) || hasCountdown(c)">
              <button
                v-if="hasCountdown(c)"
                class="card-countdown"
                disabled
              >
                {{ formatCountdown(c) }}
              </button>
              <GreenButton
                v-else
                class="card-buy"
                :disabled="buyingIds.includes(c.id)"
                @click="buy(c)"
              >
                {{ buyingIds.includes(c.id) ? '…' : 'Buy' }}
              </GreenButton>
            </template>
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

const RARITIES_MAP = {
  'common':       { label: 'C',  bg: '#6b7280', fg: '#fff'    },
  'uncommon':     { label: 'U',  bg: '#e5e7eb', fg: '#111'    },
  'rare':         { label: 'R',  bg: '#16a34a', fg: '#fff'    },
  'very rare':    { label: 'VR', bg: '#2563eb', fg: '#fff'    },
  'crazy rare':   { label: 'CR', bg: '#7c3aed', fg: '#fff'    },
  'prize only':   { label: 'PO', bg: '#111',    fg: '#e5e7eb' },
  'code only':    { label: 'CO', bg: '#ea580c', fg: '#fff'    },
  'auction only': { label: 'AO', bg: '#eab308', fg: '#111'    },
}

function rarityInfo(rarity) {
  return RARITIES_MAP[(rarity || '').toLowerCase()] || { label: '?', bg: '#aaaaaa', fg: '#fff' }
}

const allCtoons = useState('cmartCtoons', () => [])
const loading   = ref(true)
const buyingIds = ref([])
const cmartEl   = ref(null)
const filter    = useNewSiteCtoonFilter()

// ── Reactive clock for countdowns ────────────────────────────
const nowTs = ref(Date.now())
let _tick = null
let _refreshTimer = null

function isSoldOut(c) {
  return c.quantity != null && c.totalMinted >= c.quantity
}

function hasCountdown(c) {
  if (!c.nextReleaseAt) return false
  return new Date(c.nextReleaseAt).getTime() > nowTs.value
}

function formatCountdown(c) {
  if (!c.nextReleaseAt) return ''
  const ms = new Date(c.nextReleaseAt).getTime() - nowTs.value
  if (ms <= 0) return ''

  const totalSec = Math.floor(ms / 1000)

  if (ms >= 60 * 60 * 1000) {
    // >= 60 minutes: show "Xh Ym"
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    return `${h}h ${m}m`
  } else {
    // < 60 minutes: show "Xm Ys"
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}m ${s}s`
  }
}

// Schedule a data refresh when the next countdown expires
function scheduleNextRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer)

  const upcoming = allCtoons.value
    .filter(c => c.nextReleaseAt)
    .map(c => new Date(c.nextReleaseAt).getTime())
    .filter(t => t > Date.now())

  if (!upcoming.length) return

  const earliest = Math.min(...upcoming)
  const delay = Math.max(earliest - Date.now() + 1000, 1000)

  _refreshTimer = setTimeout(async () => {
    try {
      allCtoons.value = await $fetch('/api/cmart')
      scheduleNextRefresh()
    } catch (err) {
      console.error('Cmart: failed to refresh', err)
    }
  }, delay)
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

  if (f.hideUnavailable)
    list = list.filter(c => !c.nextReleaseAt && !(c.quantity != null && c.totalMinted >= c.quantity))

  list = [...list].sort((a, b) => {
    if (f.sortField === 'releaseDate') {
      const ad = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const bd = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      const dateCmp = (f.sortAsc ? 1 : -1) * (ad - bd)
      if (dateCmp !== 0) return dateCmp
      // Secondary: rarity ascending (common → uncommon → rare → very rare → crazy rare → others)
      const ar = RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 99
      const br = RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 99
      return ar - br
    }
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
  filter.value.sortField = 'releaseDate'
  filter.value.sortAsc   = false
  try {
    allCtoons.value = await $fetch('/api/cmart')
    scheduleNextRefresh()
  } catch (err) {
    console.error('Cmart: failed to load', err)
  } finally {
    loading.value = false
  }
  _tick = setInterval(() => { nowTs.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (_tick) clearInterval(_tick)
  if (_refreshTimer) clearTimeout(_refreshTimer)
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
    scheduleNextRefresh()
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

  --img-scale: 0.7;
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
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: var(--shortcard-height);
  grid-auto-flow: row;
  gap: 4px;
  padding: 4px;
  box-sizing: border-box;
}

.cmart-grid :deep(.sc) {
  width: 100%;
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
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: auto;
  }

  .cmart-grid :deep(.sc) {
    width: 100%;
    height: auto;
    aspect-ratio: 3 / 4;
  }
}

/* ── Skeleton loaders ────────────────────────────────────────── */
@keyframes skel-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

.skel-img,
.skel-line {
  background: linear-gradient(90deg, #1a3a5a 25%, #2a5a8a 50%, #1a3a5a 75%);
  background-size: 200% 100%;
  animation: skel-shimmer 1.4s ease-in-out infinite;
  border-radius: 3px;
}

.skel-img {
  width: 100%;
  height: 100%;
}

.skel-name {
  width: 70%;
  height: 8px;
}

.skel-price {
  width: 60%;
  height: 8px;
  margin-left: 4px;
}

.skel-btn {
  width: 80%;
  height: 14px;
  border-radius: 4px;
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
:deep(.sc) {
  cursor: default;
}

.card-middle-row {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rarity-badge {
  position: absolute;
  right: 0;
  font-size: 0.55rem;
  font-weight: bold;
  padding: 1px 3px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.2;
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(var(--img-scale));
  cursor: pointer;
}

.card-name {
  font-size: 0.8rem;
  line-height: 1;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  max-width: calc(100% - 24px);
}

.card-price {
  font-size: 0.8rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
  padding: 0 2px;
  width: 100%;
  text-align: center;
}

.card-sold-out {
  font-size: 0.8rem;
  font-weight: bold;
  color: #ffaaaa;
  white-space: nowrap;
  width: 100%;
  text-align: center;
  line-height: 1;
}

.card-buy {
  width: 100%;
  height: 100%;
  padding: 0;
  font-size: 0.8rem;
  border-radius: 4px;
}

.card-countdown {
  width: 100%;
  height: 100%;
  padding: 0;
  font-size: 0.7rem;
  font-weight: bold;
  border-radius: 4px;
  border: 1px solid #1a4a7a;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.75);
  cursor: default;
  white-space: nowrap;
}
</style>
