<template>
  <div class="cmart" ref="cmartEl">

    <!-- ── Toast notification ───────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="toast.visible" class="cmart-toast" :class="toast.type" :style="{ top: toast.top + 'px', left: toast.left + 'px' }">
        {{ toast.message }}
      </div>
    </Teleport>

    <!-- ── Pack opening overlay ─────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="overlayVisible" class="pack-overlay" @click.self="revealComplete && closeOverlay()">
        <div class="pack-overlay-card">
          <button v-if="revealComplete" class="pack-overlay-close" @click="closeOverlay">✕</button>

          <!-- Pack image (during animation) -->
          <template v-if="openingStep === 'pack'">
            <img :src="openingPack?.imagePath" class="pack-overlay-img" alt="Pack" />
          </template>

          <!-- Reveal grid -->
          <template v-if="openingStep === 'reveal'">
            <div class="pack-reveal-grid">
              <div
                v-for="item in packContents"
                :key="item.id"
                class="pack-reveal-card"
                :class="{ 'pack-reveal-new': !originalOwnedSet.has(item.id) }"
              >
                <span v-if="!originalOwnedSet.has(item.id)" class="pack-new-badge">New!</span>
                <img
                  v-if="item.assetPath"
                  :src="item.assetPath"
                  :alt="item.name"
                  class="pack-reveal-img"
                />
                <p class="pack-reveal-name">{{ item.name }}</p>
                <p class="pack-reveal-rarity">{{ item.rarity }}</p>
                <p class="pack-reveal-mint">Mint #{{ item.mintNumber }}</p>
              </div>
            </div>
            <button v-if="revealComplete" class="pack-reveal-close-btn" @click="closeOverlay">Close</button>
          </template>
        </div>
      </div>
      <div v-if="showGlow" class="pack-glow" :class="glowStage" />
    </Teleport>

    <!-- ── Header bar ────────────────────────────────────────────── -->
    <div class="cmart-header">Cartoon ReOrbit cMart</div>

    <!-- ── cToons grid ───────────────────────────────────────────── -->
    <div v-if="cmartTab === 'ctoons'" class="cmart-grid">
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
            <img
              v-if="c.assetPath"
              :src="c.assetPath"
              :alt="c.name"
              class="card-img"
              @click.stop="openInfo(c)"
            />
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
            <span v-else class="card-price">{{ c.price.toLocaleString() }} pts</span>
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

    <!-- ── Packs grid ────────────────────────────────────────────── -->
    <div v-else-if="cmartTab === 'packs'" class="packs-grid">
      <template v-if="packsLoading">
        <div v-for="n in 6" :key="'pskel-' + n" class="pack-card pack-card-skel">
          <div class="skel-line" style="height:14px;width:70%;margin-bottom:8px" />
          <div class="skel-img" style="height:100px;border-radius:6px;margin-bottom:8px" />
          <div class="skel-line" style="height:10px;width:90%;margin-bottom:4px" />
          <div class="skel-line" style="height:10px;width:80%;margin-bottom:4px" />
          <div class="skel-line" style="height:24px;width:100%;margin-top:auto;border-radius:4px" />
        </div>
      </template>
      <div v-else-if="!packs.length" class="cmart-status">No packs available.</div>
      <template v-else>
        <div
          v-for="pack in packs"
          :key="pack.id"
          class="pack-card"
        >
          <p class="pack-name">{{ pack.name }}</p>
          <img v-if="pack.imagePath" :src="pack.imagePath" class="pack-img" :alt="pack.name" />
          <ul class="pack-rarity-list">
            <li v-for="r in pack.rarityConfigs" :key="r.rarity">
              <strong>{{ r.rarity }}:</strong> {{ r.probabilityPercent }}% — {{ r.count }} cToon(s)
            </li>
          </ul>
          <GreenButton
            class="pack-buy-btn"
            :disabled="buyingPackIds.includes(pack.id)"
            @click="buyPack(pack)"
          >
            {{ buyingPackIds.includes(pack.id) ? 'Purchasing…' : `Buy for ${pack.price.toLocaleString()} pts` }}
          </GreenButton>
        </div>
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

const ctoonModal = useCtoonModal()
function openInfo(c) {
  ctoonModal.open({ ctoonId: c.id, assetPath: c.assetPath, name: c.name })
}

const { user, fetchSelf } = useAuth()
const cmartTab   = useState('newSiteCmartTab', () => 'ctoons')
const allCtoons  = useState('cmartCtoons', () => [])
const loading    = ref(true)
const buyingIds  = ref([])
const cmartEl    = ref(null)
const filter     = useNewSiteCtoonFilter()

// ── Packs state ──────────────────────────────────────────────
const packs          = ref([])
const packsLoading   = ref(false)
const buyingPackIds  = ref([])

// ── Pack opening state ────────────────────────────────────────
const overlayVisible  = ref(false)
const showGlow        = ref(false)
const openingStep     = ref('pack')
const glowStage       = ref('hidden')
const revealComplete  = ref(false)
const openingPack     = ref(null)
const packContents    = ref([])
const ownedCtoonIds   = ref([])

const originalOwnedSet = computed(() => new Set(ownedCtoonIds.value))

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
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    return `${h}h ${m}m`
  } else {
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}m ${s}s`
  }
}

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

  const byReleaseDateDesc = (a, b) => {
    const at = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
    const bt = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
    return bt - at
  }
  const byRarity = (a, b) => {
    const ar = RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 99
    const br = RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 99
    return ar - br
  }
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
  const tieBrk = (a, b) => byReleaseDateDesc(a, b) || byRarity(a, b) || byName(a, b)

  list = [...list].sort((a, b) => {
    if (f.sortField === 'releaseDate') {
      const ad = a.releaseDate ? new Date(a.releaseDate).getTime() : 0
      const bd = b.releaseDate ? new Date(b.releaseDate).getTime() : 0
      const dateCmp = (f.sortAsc ? 1 : -1) * (ad - bd)
      return dateCmp !== 0 ? dateCmp : byRarity(a, b) || byName(a, b)
    }
    if (f.sortField === 'price') {
      const cmp = a.price - b.price
      return (f.sortAsc ? cmp : -cmp) || tieBrk(a, b)
    }
    if (f.sortField === 'rarity') {
      const cmp = byRarity(a, b)
      return (f.sortAsc ? cmp : -cmp) || byReleaseDateDesc(a, b) || byName(a, b)
    }
    // name
    const cmp = byName(a, b)
    return (f.sortAsc ? cmp : -cmp) || tieBrk(a, b)
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

async function loadOwnedCtoonIds() {
  try {
    const res = await $fetch('/api/cmart/self/owned', { credentials: 'include' })
    ownedCtoonIds.value = Array.isArray(res?.ownedCtoonIds) ? res.ownedCtoonIds : []
  } catch {
    ownedCtoonIds.value = []
  }
}

async function fetchPacks() {
  packsLoading.value = true
  try {
    packs.value = await $fetch('/api/cmart/packs')
  } catch (err) {
    console.error('Cmart: failed to load packs', err)
  } finally {
    packsLoading.value = false
  }
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
  await fetchPacks()
  await loadOwnedCtoonIds()
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
    allCtoons.value = await $fetch('/api/cmart')
    scheduleNextRefresh()
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Purchase failed.'
    showToast(msg, 'error')
  } finally {
    buyingIds.value = buyingIds.value.filter(id => id !== ctoon.id)
  }
}

// ── Pack buying ───────────────────────────────────────────────
function resetPackSequence() {
  openingStep.value   = 'pack'
  glowStage.value     = 'hidden'
  revealComplete.value = false
  showGlow.value      = false
  packContents.value  = []
}

async function buyPack(pack) {
  if (buyingPackIds.value.includes(pack.id)) return
  if (user.value && user.value.points < pack.price) {
    showToast("You don't have enough points", 'error')
    return
  }
  buyingPackIds.value = [...buyingPackIds.value, pack.id]

  try {
    const res = await $fetch('/api/cmart/packs/buy', {
      method: 'POST',
      body: { packId: pack.id },
    })

    openingPack.value    = pack
    resetPackSequence()
    overlayVisible.value = true
    showGlow.value       = true

    setTimeout(() => { glowStage.value = 'expand' }, 2000)

    setTimeout(async () => {
      try {
        packContents.value = await $fetch('/api/cmart/open-pack', {
          query: { id: res.userPackId }
        })
      } catch (e) {
        console.error('Failed to open pack', e)
        showToast('Failed to open pack', 'error')
      }
      openingStep.value    = 'reveal'
      revealComplete.value = true
      glowStage.value      = 'fade'
    }, 3000)

    setTimeout(() => {
      showGlow.value  = false
      glowStage.value = 'hidden'
    }, 6000)

    await fetchSelf({ force: true })
    await loadOwnedCtoonIds()
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.message || 'Purchase failed.'
    showToast(msg, 'error')
  } finally {
    buyingPackIds.value = buyingPackIds.value.filter(id => id !== pack.id)
  }
}

async function closeOverlay() {
  overlayVisible.value = false
  resetPackSequence()
  await fetchPacks()
  await loadOwnedCtoonIds()
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
  position: relative;

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

/* ── cToons grid ─────────────────────────────────────────────── */
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

/* ── Packs grid ──────────────────────────────────────────────── */
.packs-grid {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue) transparent;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
  align-content: start;
}

.pack-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--OrbitDarkBlue);
  border-radius: 8px;
  padding: 10px 8px;
  box-sizing: border-box;
  gap: 6px;
}

.pack-card-skel {
  background: #1a3a58;
}

.pack-name {
  font-size: 0.8rem;
  font-weight: bold;
  color: #fff;
  text-align: center;
  margin: 0;
}

.pack-img {
  width: 100%;
  max-height: 90px;
  object-fit: contain;
  border-radius: 4px;
}

.pack-rarity-list {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  font-size: 0.6rem;
  color: #cce0ff;
  line-height: 1.4;
}

.pack-buy-btn {
  width: 100%;
  margin-top: auto;
  font-size: 0.7rem;
  padding: 4px 6px;
  white-space: nowrap;
}

/* ── Pack opening overlay ────────────────────────────────────── */
:global(.pack-overlay) {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

:global(.pack-overlay-card) {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

:global(.pack-overlay-close) {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #555;
  line-height: 1;
}

:global(.pack-overlay-img) {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}

:global(.pack-reveal-grid) {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}

:global(.pack-reveal-card) {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f5f8ff;
  border: 2px solid #c7d8f0;
  border-radius: 8px;
  padding: 10px 8px;
  gap: 4px;
}

:global(.pack-reveal-new) {
  border-color: #16a34a;
  animation: cardGlow 1.5s ease-in-out infinite alternate;
}

:global(.pack-new-badge) {
  position: absolute;
  top: 6px;
  left: 6px;
  background: #16a34a;
  color: #fff;
  font-size: 0.6rem;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 10px;
}

:global(.pack-reveal-img) {
  width: 80px;
  height: 80px;
  object-fit: contain;
  margin-top: 16px;
}

:global(.pack-reveal-name) {
  font-size: 0.75rem;
  font-weight: bold;
  text-align: center;
  color: #1a2a40;
  margin: 0;
}

:global(.pack-reveal-rarity) {
  font-size: 0.65rem;
  color: #556;
  margin: 0;
  text-transform: capitalize;
}

:global(.pack-reveal-mint) {
  font-size: 0.6rem;
  color: #889;
  margin: 0;
}

:global(.pack-reveal-close-btn) {
  margin-top: 8px;
  padding: 8px 24px;
  background: var(--OrbitDarkBlue, #336699);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: bold;
  cursor: pointer;
  align-self: stretch;
}

:global(.pack-reveal-close-btn:hover) {
  background: var(--OrbitLightBlue, #3399CC);
}

/* ── Glow effect ─────────────────────────────────────────────── */
:global(.pack-glow) {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 1vw;
  height: 1vh;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1100;
}

:global(.pack-glow.expand) {
  animation: expandGlow 2s ease-out forwards;
}

:global(.pack-glow.fade) {
  animation:
    expandGlow 2s ease-out forwards,
    fadeGlow   1s ease-in 2s forwards;
}

@keyframes expandGlow {
  from { width: 1vw; height: 1vh; opacity: 1; }
  to   { width: 300vw; height: 300vh; opacity: 1; }
}

@keyframes fadeGlow {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes cardGlow {
  from { box-shadow: 0 0 4px #16a34a; }
  to   { box-shadow: 0 0 16px #16a34a; }
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

  .packs-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  :global(.pack-reveal-grid) {
    grid-template-columns: repeat(2, 1fr);
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
