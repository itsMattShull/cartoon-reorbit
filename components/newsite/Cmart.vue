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
                <span v-if="!item.inCmart" class="pack-exclusive-badge">Pack Exclusive</span>
                <div class="pack-reveal-img-wrap">
                  <img
                    v-if="item.assetPath"
                    :src="item.assetPath"
                    :alt="item.name"
                    class="pack-reveal-img"
                  />
                  <SecondEditionOverlay :ctoon="item" />
                </div>
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

    <!-- ── Pack preview modal ─────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="packPreviewVisible" class="pack-preview-overlay" @click.self="packPreviewVisible = false">
        <div class="pack-preview-card">
          <button class="pack-overlay-close" @click="packPreviewVisible = false">✕</button>
          <p class="pack-preview-name">{{ packPreviewPack?.name }}</p>
          <div
            v-for="(list, rarity) in previewGroupedByRarity"
            :key="rarity"
            class="pack-preview-rarity-group"
          >
            <h3 class="pack-preview-rarity-title">{{ rarity }}</h3>
            <p class="pack-preview-rarity-prob">
              {{ previewRarityProbMap[rarity] ?? 0 }}% chance to receive
              {{ previewRarityCountMap[rarity] ?? 0 }} cToon(s)
            </p>
            <div class="pack-preview-ctoon-grid">
              <div
                v-for="item in list"
                :key="item.ctoonId"
                class="pack-preview-ctoon-card"
              >
                <span
                  class="owned-badge"
                  :class="originalOwnedSet.has(item.ctoonId) ? 'owned-badge--owned' : 'owned-badge--unowned'"
                >{{ originalOwnedSet.has(item.ctoonId) ? 'Owned' : 'Unowned' }}</span>
                <span v-if="item.inCmart === false" class="pack-exclusive-badge pack-exclusive-badge--preview">Pack Exclusive</span>
                <img v-if="item.assetPath" :src="item.assetPath" :alt="item.name" class="pack-preview-ctoon-img" />
                <SecondEditionOverlay :ctoon="item" />
                <p class="pack-preview-ctoon-name">{{ item.name }}</p>
                <p class="pack-preview-ctoon-weight">{{ item.weight }}% chance</p>
              </div>
            </div>
          </div>
          <GreenButton
            class="pack-preview-buy-btn"
            :disabled="buyingPackIds.includes(packPreviewPack?.id)"
            @click="packPreviewVisible = false; buyPack(packPreviewPack)"
          >
            <template v-if="buyingPackIds.includes(packPreviewPack?.id)">Purchasing…</template>
            <template v-else>
              Buy for {{ displayPrice(packBasePrice(packPreviewPack)).toLocaleString() }} pts
              <span
                v-if="packPreviewPack && displayPrice(packBasePrice(packPreviewPack)) !== packPreviewPack.price"
                class="pack-price-original"
              >{{ packPreviewPack.price.toLocaleString() }}</span>
            </template>
          </GreenButton>
        </div>
      </div>
    </Teleport>

    <!-- ── Section nav (moved here from the sidebar) ───────────────── -->
    <div class="cm-nav">
      <GreenButton :active="cmartTab === 'ctoons'" @click="cmartTab = 'ctoons'">cToons</GreenButton>
      <GreenButton :active="cmartTab === 'packs'" @click="cmartTab = 'packs'">Packs</GreenButton>
      <GreenButton :active="cmartTab === 'upgrades'" @click="cmartTab = 'upgrades'">Upgrades</GreenButton>
      <GreenButton
        v-if="holidayEvent"
        :active="cmartTab === 'holiday'"
        @click="cmartTab = 'holiday'"
      >{{ holidayEvent.name }}</GreenButton>
    </div>

    <!-- ── Header bar ────────────────────────────────────────────── -->
    <div class="cmart-header">Cartoon ReOrbit cMart</div>
    <div v-if="cmartHalfPriceEnabled" class="cmart-sale-banner">🏷️ 50% Off Sale! All prices are half price.</div>

    <!-- ── Active Sale banner — floats over the top-right corner of the
         whole panel (overlapping the header), positioned here (rather than
         inside .cmart-grid) so it isn't clipped by that scroll container ── -->
    <div v-if="cmartTab === 'ctoons' && !loading && activeSale" class="sale-banner">
      <img
        v-if="activeSale.imagePath && !saleImageFailed"
        :src="activeSale.imagePath"
        :alt="activeSale.name"
        class="sale-banner-img"
        @error="saleImageFailed = true"
      />
      <div v-else class="sale-banner-title sale-banner-title--fallback">🔥 {{ activeSale.name }}</div>
    </div>

    <!-- ── cToons grid ───────────────────────────────────────────── -->
    <div v-if="cmartTab === 'ctoons'" class="cmart-grid">
      <!-- ── Active Sale showcase (sits above the cards grid, sized to its
           own content — not a grid item, see .cmart-grid CSS note) ────── -->
      <div v-if="!loading && activeSale" class="sale-showcase">
        <div class="sale-grid">
            <ShortCard
              v-for="item in activeSale.items"
              :key="'sale-' + item.ctoon.id"
              :style="isSaleItemSoldOut(item)
                ? { '--sc-footer-left-width': '100%', '--sc-footer-right-width': '0%' }
                : {}"
            >
              <template #header>
                <div class="card-header-wrap" @click.stop="openInfo(item.ctoon)">
                  <img
                    v-if="item.ctoon.assetPath"
                    :src="item.ctoon.assetPath"
                    :alt="item.ctoon.name"
                    class="card-img"
                  />
                  <SecondEditionOverlay :ctoon="item.ctoon" />
                  <span
                    class="owned-badge"
                    :class="originalOwnedSet.has(item.ctoon.id) ? 'owned-badge--owned' : 'owned-badge--unowned'"
                  >{{ originalOwnedSet.has(item.ctoon.id) ? 'Owned' : 'Unowned' }}</span>
                </div>
              </template>
              <template #middle>
                <div class="card-middle-row">
                  <span class="card-name">{{ item.ctoon.name }}</span>
                  <span
                    class="rarity-badge"
                    :style="{ background: rarityInfo(item.ctoon.rarity).bg, color: rarityInfo(item.ctoon.rarity).fg }"
                    :title="item.ctoon.rarity"
                  >{{ rarityInfo(item.ctoon.rarity).label }}</span>
                </div>
              </template>
              <template #footer-left>
                <span v-if="isSaleItemSoldOut(item)" class="card-sold-out">Sold Out</span>
                <span v-else class="card-price sale-price-stack">
                  <span class="sale-price-now">{{ item.price.toLocaleString() }} pts</span>
                  <span v-if="item.price !== item.ctoon.price" class="pack-price-original">{{ item.ctoon.price.toLocaleString() }}</span>
                </span>
              </template>
              <template #footer-right>
                <button
                  v-if="!isSaleItemSoldOut(item) && saleIsUpcoming"
                  class="card-countdown"
                  disabled
                >
                  {{ formatSaleCountdown() }}
                </button>
                <GreenButton
                  v-else-if="!isSaleItemSoldOut(item)"
                  class="card-buy"
                  :disabled="buyingIds.includes(item.ctoon.id)"
                  @click="buy(item.ctoon, item.price)"
                >
                  {{ buyingIds.includes(item.ctoon.id) ? '…' : 'Buy' }}
                </GreenButton>
              </template>
            </ShortCard>
        </div>
      </div>

      <div v-if="loading" class="cmart-cards-grid">
        <ShortCard v-for="n in 100" :key="'skel-' + n" class="skel-card">
          <template #header><div class="skel-img" /></template>
          <template #middle><div class="skel-line skel-name" /></template>
          <template #footer-left><div class="skel-line skel-price" /></template>
          <template #footer-right><div class="skel-line skel-btn" /></template>
        </ShortCard>
      </div>
      <div v-else-if="!ctoons.length" class="cmart-status">No cToons available.</div>
      <div v-else class="cmart-cards-grid">
        <ShortCard
          v-for="c in ctoons"
          :key="c.id"
          :style="isSoldOut(c) && !hasCountdown(c)
            ? { '--sc-footer-left-width': '100%', '--sc-footer-right-width': '0%' }
            : {}"
        >
          <template #header>
            <div class="card-header-wrap" @click.stop="openInfo(c)">
              <img
                v-if="c.assetPath"
                :src="c.assetPath"
                :alt="c.name"
                class="card-img"
              />
              <SecondEditionOverlay :ctoon="c" />
              <span
                class="owned-badge"
                :class="originalOwnedSet.has(c.id) ? 'owned-badge--owned' : 'owned-badge--unowned'"
              >{{ originalOwnedSet.has(c.id) ? 'Owned' : 'Unowned' }}</span>
            </div>
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
            <template v-else>
              <span class="card-price" :class="{ 'card-price--sale': cmartHalfPriceEnabled }">{{ displayPrice(c.price).toLocaleString() }} pts</span>
            </template>
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
      </div>
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
          <img v-if="pack.imagePath" :src="pack.imagePath" class="pack-img pack-img--clickable" :alt="pack.name" @click="openPackPreview(pack)" />
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
            <template v-if="buyingPackIds.includes(pack.id)">Purchasing…</template>
            <template v-else>
              Buy for {{ displayPrice(packBasePrice(pack)).toLocaleString() }} pts
              <span
                v-if="displayPrice(packBasePrice(pack)) !== pack.price"
                class="pack-price-original"
              >{{ pack.price.toLocaleString() }}</span>
            </template>
          </GreenButton>
        </div>
      </template>
    </div>

    <!-- ── Upgrades ──────────────────────────────────────────────── -->
    <div v-else-if="cmartTab === 'upgrades'" class="upgrade-grid">
      <div class="upgrade-card">
        <p class="upgrade-name">Additional cZone</p>
        <p class="upgrade-desc">
          Add another cZone to your account so you can build and manage more than one.
        </p>
        <p class="upgrade-count">You currently have {{ additionalCzones }} additional cZone{{ additionalCzones === 1 ? '' : 's' }}.</p>
        <GreenButton
          class="upgrade-buy-btn"
          :disabled="buyingCzone"
          @click="buyCzone"
        >
          <template v-if="buyingCzone">Purchasing…</template>
          <template v-else>Buy for {{ nextCzoneCost.toLocaleString() }} pts</template>
        </GreenButton>
      </div>
    </div>

    <!-- ── Holiday Event cToons ─────────────────────────────────────── -->
    <div v-else-if="cmartTab === 'holiday'" class="cmart-grid">
      <div v-if="holidayLoading" class="cmart-cards-grid">
        <ShortCard v-for="n in 10" :key="'hskel-' + n" class="skel-card">
          <template #header><div class="skel-img" /></template>
          <template #middle><div class="skel-line skel-name" /></template>
          <template #footer-left><div class="skel-line skel-price" /></template>
          <template #footer-right><div class="skel-line skel-btn" /></template>
        </ShortCard>
      </div>
      <div v-else-if="!holidayEvent || !holidayEvent.shopCtoons.length" class="cmart-status">No holiday cToons available.</div>
      <div v-else class="cmart-cards-grid">
        <ShortCard
          v-for="c in holidayEvent.shopCtoons"
          :key="c.id"
          :style="isHolidaySoldOut(c)
            ? { '--sc-footer-left-width': '100%', '--sc-footer-right-width': '0%' }
            : {}"
        >
          <template #header>
            <div class="card-header-wrap" @click.stop="openInfo(c)">
              <img
                v-if="c.assetPath"
                :src="c.assetPath"
                :alt="c.name"
                class="card-img"
              />
              <SecondEditionOverlay :ctoon="c" />
              <span
                class="owned-badge"
                :class="originalOwnedSet.has(c.id) ? 'owned-badge--owned' : 'owned-badge--unowned'"
              >{{ originalOwnedSet.has(c.id) ? 'Owned' : 'Unowned' }}</span>
            </div>
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
            <span v-if="isHolidaySoldOut(c)" class="card-sold-out">Sold Out</span>
            <span v-else class="card-price" :class="{ 'card-price--sale': cmartHalfPriceEnabled }">{{ displayPrice(c.price).toLocaleString() }} pts</span>
          </template>
          <template #footer-right>
            <GreenButton
              v-if="!isHolidaySoldOut(c)"
              class="card-buy"
              :disabled="buyingIds.includes(c.id)"
              @click="buy(c)"
            >
              {{ buyingIds.includes(c.id) ? '…' : 'Buy' }}
            </GreenButton>
          </template>
        </ShortCard>
      </div>
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
const aFilters   = useAuctionHouseFilters()

// Lazily loaded list of ctoonIds the user has wishlisted (for the Wishlist pill)
const wishlistCtoonIds = ref([])
let wishlistLoaded = false
async function loadWishlist() {
  if (wishlistLoaded) return
  try {
    const items = await $fetch('/api/wishlist')
    wishlistCtoonIds.value = Array.isArray(items) ? items.map(i => i?.id).filter(Boolean) : []
  } finally {
    wishlistLoaded = true
  }
}
watch(() => aFilters.value.wishlistOnly, val => { if (val) loadWishlist() })

// ── Half-price setting ─────────────────────────────────────────
const cmartHalfPriceEnabled = ref(false)

function displayPrice(originalPrice) {
  return cmartHalfPriceEnabled.value ? Math.floor(originalPrice / 2) : originalPrice
}

// ── Upgrades: additional cZone ──────────────────────────────────
const firstAdditionalCzoneCost      = ref(25000)
const subsequentAdditionalCzoneCost = ref(50000)
const buyingCzone = ref(false)

const additionalCzones = computed(() => user.value?.additionalCzones ?? 0)
const nextCzoneCost = computed(() =>
  additionalCzones.value < 1 ? firstAdditionalCzoneCost.value : subsequentAdditionalCzoneCost.value
)

async function buyCzone() {
  if (buyingCzone.value) return
  const cost = nextCzoneCost.value
  if (user.value && user.value.points < cost) {
    showToast(`Not enough points — this upgrade costs ${cost.toLocaleString()} pts.`, 'error')
    return
  }
  buyingCzone.value = true
  try {
    await $fetch('/api/cmart/czones/buy', { method: 'POST' })
    showToast('Additional cZone added!', 'success')
    await fetchSelf({ force: true })
  } catch (err) {
    showToast(describePurchaseError(err, 'upgrade'), 'error')
  } finally {
    buyingCzone.value = false
  }
}

// ── Holiday Event cToons ────────────────────────────────────────
const holidayEvent   = ref(null)
const holidayLoading = ref(true)

function isHolidaySoldOut(c) {
  return c.quantity != null && c.minted >= c.quantity
}

async function loadHolidayEvent() {
  try {
    holidayEvent.value = await $fetch('/api/holiday/active')
  } catch (err) {
    console.error('Cmart: failed to load holiday event', err)
    holidayEvent.value = null
  } finally {
    holidayLoading.value = false
  }
}

// Packs decay in price over time server-side; use the decayed price
// (effectivePrice) as the basis for display/half-price, falling back to
// the base price if it hasn't been fetched yet.
function packBasePrice(pack) {
  return pack?.effectivePrice ?? pack?.price ?? 0
}

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

// ── Pack preview modal ────────────────────────────────────────
const packPreviewVisible = ref(false)
const packPreviewPack    = ref(null)
const packPreviewLoading = ref(false)

const previewGroupedByRarity = computed(() => {
  if (!packPreviewPack.value?.ctoonOptions) return {}
  return packPreviewPack.value.ctoonOptions.reduce((acc, o) => {
    ;(acc[o.rarity] = acc[o.rarity] || []).push(o)
    return acc
  }, {})
})

const previewRarityProbMap = computed(() => {
  const map = {}
  for (const rc of packPreviewPack.value?.rarityConfigs || []) map[rc.rarity] = rc.probabilityPercent
  return map
})

const previewRarityCountMap = computed(() => {
  const map = {}
  for (const rc of packPreviewPack.value?.rarityConfigs || []) map[rc.rarity] = rc.count
  return map
})

async function openPackPreview(pack) {
  if (packPreviewLoading.value) return
  packPreviewLoading.value = true
  try {
    packPreviewPack.value    = await $fetch('/api/cmart/packs/' + pack.id)
    packPreviewVisible.value = true
  } catch (err) {
    console.error('Failed to load pack details', err)
    showToast('Failed to load pack details', 'error')
  } finally {
    packPreviewLoading.value = false
  }
}

const originalOwnedSet = computed(() => new Set(ownedCtoonIds.value))

// ── Active Sale showcase ─────────────────────────────────────
const activeSale = ref(null)
const saleImageFailed = ref(false)

function isSaleItemSoldOut(item) {
  const c = item.ctoon
  return c.quantity != null && c.totalMinted >= c.quantity
}

// True while the featured sale hasn't started yet (server sends it up to 24h
// ahead of startAt so the showcase can display a countdown instead of Buy).
const saleIsUpcoming = computed(() => {
  if (!activeSale.value?.startAt) return false
  return new Date(activeSale.value.startAt).getTime() > nowTs.value
})

function formatSaleCountdown() {
  if (!activeSale.value?.startAt) return ''
  const ms = new Date(activeSale.value.startAt).getTime() - nowTs.value
  if (ms <= 0) return ''

  const totalSec = Math.floor(ms / 1000)
  if (ms >= 60 * 60 * 1000) {
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    return `${h}h ${m}m`
  }
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${s}s`
}

// Fires a one-off refresh right as the featured sale's startAt passes, so the
// countdown button swaps to Buy promptly instead of waiting on the 60s poll.
let _saleTransitionTimer = null
function scheduleSaleTransition() {
  if (_saleTransitionTimer) clearTimeout(_saleTransitionTimer)
  const startTs = activeSale.value?.startAt ? new Date(activeSale.value.startAt).getTime() : null
  if (!startTs || startTs <= Date.now()) return

  _saleTransitionTimer = setTimeout(async () => {
    await loadActiveSale()
    try {
      allCtoons.value = await $fetch('/api/cmart')
    } catch {}
  }, Math.max(startTs - Date.now() + 1000, 1000))
}

async function loadActiveSale() {
  try {
    const sale = await $fetch('/api/cmart/active-sale')
    if (sale?.id !== activeSale.value?.id) saleImageFailed.value = false
    activeSale.value = sale
    scheduleSaleTransition()
  } catch (err) {
    console.error('Cmart: failed to load active sale', err)
  }
}

// ── Reactive clock for countdowns ────────────────────────────
const nowTs = ref(Date.now())
let _tick = null
let _refreshTimer = null
let _saleRefreshTimer = null

// Only Defined Number Limit cToons have a 2-phase cap guard.
// Returns the currently-active cap: initialCap before finalReleaseAt, full
// quantity after.  Time-Based Limit cToons simply return their raw quantity
// (or Infinity when unlimited) so they are never artificially capped.
function currentAllowedCap(c) {
  if (c.quantity == null) return Infinity
  if (c.mintLimitType !== 'defined') return Number(c.quantity)
  const finalAt = c.finalReleaseAt ? new Date(c.finalReleaseAt).getTime() : null
  const beforeFinal = finalAt ? nowTs.value < finalAt : false
  const initCap = Number(c.initialCap ?? 0)
  return beforeFinal ? (initCap || 0) : Number(c.quantity)
}

function isSoldOut(c) {
  if (c.quantity == null) return false
  if (c.mintLimitType === 'defined') {
    // Defined Number Limit: respect the 2-phase cap guard
    return c.totalMinted >= currentAllowedCap(c)
  }
  // Time-Based Limit: no phase cap — check raw quantity only
  return c.totalMinted >= c.quantity
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

  if (aFilters.value.gtoonsOnly)
    list = list.filter(c => c.isGtoon)

  if (aFilters.value.wishlistOnly) {
    const wishSet = new Set(wishlistCtoonIds.value)
    list = list.filter(c => wishSet.has(c.id))
  }

  if (aFilters.value.selectedOwned === 'owned')
    list = list.filter(c => originalOwnedSet.value.has(c.id))
  else if (aFilters.value.selectedOwned === 'unowned')
    list = list.filter(c => !originalOwnedSet.value.has(c.id))

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
  // Clamp to the top of the viewport so the toast is always visible even
  // when the page has been scrolled down (e.g. on mobile, where the whole
  // page scrolls and main-content's top can move off-screen).
  toast.top  = Math.max(rect ? rect.top + 16 : 16, 16)
  toast.left = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
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
  try {
    const [ctoonRes, upgradesRes] = await Promise.all([
      $fetch('/api/cmart'),
      $fetch('/api/cmart/upgrades-config').catch(() => ({})),
      loadActiveSale(),
      loadHolidayEvent()
    ])
    allCtoons.value = ctoonRes
    cmartHalfPriceEnabled.value = upgradesRes?.cmartHalfPriceEnabled === true
    firstAdditionalCzoneCost.value      = upgradesRes?.firstAdditionalCzoneCost      ?? firstAdditionalCzoneCost.value
    subsequentAdditionalCzoneCost.value = upgradesRes?.subsequentAdditionalCzoneCost ?? subsequentAdditionalCzoneCost.value
    scheduleNextRefresh()
  } catch (err) {
    console.error('Cmart: failed to load', err)
  } finally {
    loading.value = false
  }
  await fetchPacks()
  await loadOwnedCtoonIds()
  _tick = setInterval(() => { nowTs.value = Date.now() }, 1000)
  // The Sale's start/end boundary isn't tied to any cToon's own release timer,
  // so it needs its own light poll (separate from scheduleNextRefresh) to pick
  // up a sale starting/ending mid-session.
  _saleRefreshTimer = setInterval(async () => {
    await loadActiveSale()
    await loadHolidayEvent()
    try {
      allCtoons.value = await $fetch('/api/cmart')
    } catch {}
  }, 60000)
})

onUnmounted(() => {
  if (_tick) clearInterval(_tick)
  if (_refreshTimer) clearTimeout(_refreshTimer)
  if (_saleRefreshTimer) clearInterval(_saleRefreshTimer)
  if (_saleTransitionTimer) clearTimeout(_saleTransitionTimer)
})

function describePurchaseError(err, kind = 'cToon') {
  const status = err?.statusCode || err?.response?.status || err?.data?.statusCode
  const raw   = err?.data?.statusMessage || err?.statusMessage || err?.message || ''
  const low   = raw.toLowerCase()

  if (status === 401 || /not authenticated|unauthorized/.test(low)) {
    return 'You need to be signed in to make a purchase.'
  }
  if (/not enough available points|insufficient points/.test(low)) {
    return `Not enough available points — some of your points may be locked in active trades or auctions.`
  }
  if (status === 429 || /daily limit/.test(low)) {
    return raw || 'Daily purchase limit reached (resets at 8pm CST).'
  }
  if (/not released/.test(low)) {
    return `This ${kind} has not been released yet.`
  }
  if (/holiday item/.test(low)) {
    return 'This item can only be minted while its holiday event is active.'
  }
  if (/initial window sold out/.test(low)) {
    return 'The initial release is sold out — please wait for the final release.'
  }
  if (/sold out/.test(low)) {
    return `This ${kind} is sold out.`
  }
  if (/minting period/.test(low)) {
    return `The minting period for this ${kind} has ended.`
  }
  if (/purchase limit/.test(low)) {
    return raw
  }
  if (status === 404 || /not for sale|not found|invalid or not-for-sale/.test(low)) {
    return `This ${kind} is no longer available for purchase.`
  }
  if (status === 400 && /missing|required/.test(low)) {
    return `Something went wrong sending the purchase request. Please refresh and try again.`
  }
  return raw || `Couldn't complete the ${kind} purchase. Please try again.`
}

async function buy(ctoon, priceOverride = null) {
  if (buyingIds.value.includes(ctoon.id)) return
  // priceOverride is used for Sale showcase purchases (the sale price, not the
  // normal displayPrice()/half-price calculation) — the server always resolves
  // the authoritative charge itself regardless of what's sent here.
  const price = priceOverride != null ? priceOverride : displayPrice(ctoon.price)
  if (user.value && user.value.points < price) {
    showToast(`Not enough points — this cToon costs ${price.toLocaleString()} pts.`, 'error')
    return
  }
  buyingIds.value = [...buyingIds.value, ctoon.id]

  try {
    await $fetch('/api/cmart/buy', {
      method: 'POST',
      body: { ctoonId: ctoon.id },
    })
    showToast(`${ctoon.name} purchased!`, 'success')
    const [ctoonRes] = await Promise.all([
      $fetch('/api/cmart'),
      fetchSelf({ force: true }),
      loadOwnedCtoonIds(),
      loadActiveSale(),
      loadHolidayEvent()
    ])
    allCtoons.value = ctoonRes
    scheduleNextRefresh()
  } catch (err) {
    showToast(describePurchaseError(err, 'cToon'), 'error')
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
  const price = displayPrice(packBasePrice(pack))
  if (user.value && user.value.points < price) {
    showToast(`Not enough points — this pack costs ${price.toLocaleString()} pts.`, 'error')
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
    showToast(describePurchaseError(err, 'pack'), 'error')
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

.cm-nav {
  display: flex;
  flex-direction: row;
  gap: 6px;
  padding: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
  background: var(--bg-color);
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

/* ── Sale showcase ───────────────────────────────────────────── */
.sale-showcase {
  flex-shrink: 0;
  padding: 6px;
  margin-bottom: 4px;
  border-radius: 8px;
  background: var(--OrbitDarkBlue, #336699);
  border-bottom: 2px solid var(--OrbitLightBlue, #3399CC);
}

/* Floats over the top-right corner of the whole panel, overlapping the
   header bar, rather than being scoped to the sale showcase box below it
   (which scrolls out of view inside .cmart-grid) — the badge is sized to
   its own natural image dimensions. Positioned relative to .cmart. */
.sale-banner {
  --sale-banner-top: 5px;
  position: absolute;
  top: var(--sale-banner-top);
  right: -6px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(10deg);
  pointer-events: none;
}

.sale-banner-img {
  display: block;
  width: auto;
  height: auto;
  max-width: 200px;
  max-height: 160px;
}

.sale-banner-title {
  padding: 4px 8px;
  text-align: center;
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
}

.sale-banner-title--fallback {
  border-radius: 6px;
  padding: 14px 8px;
  font-size: 1.15rem;
}

.sale-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: var(--shortcard-height);
  gap: 4px;
  flex-shrink: 0;
}

.sale-price-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.15;
}

.sale-price-now {
  font-size: 0.75rem;
  color: #ffd700;
  white-space: nowrap;
}

.cmart-sale-banner {
  flex-shrink: 0;
  width: 100%;
  text-align: center;
  font-size: 0.7rem;
  font-weight: bold;
  color: #fff;
  background: #b91c1c;
  padding: 2px 4px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-price--sale {
  color: #ffd700;
}

.pack-price-original {
  text-decoration: line-through;
  opacity: 0.6;
  font-size: 0.65em;
  margin-left: 3px;
}

/* ── cToons grid ─────────────────────────────────────────────── */
/* .cmart-grid is just the scroll container (flex column) so the sale
   showcase can sit above the regular-cards grid, sized to its own natural
   content, while both still scroll away together. It used to be the grid
   itself with the sale-showcase as a full-width spanning grid item, but
   CSS Grid's "auto" row-track sizing badly under-measured that item's
   actual (deeply-nested, variable-row-count) content height, which then
   either clipped it or made it overlap the row below — a nested grid inside
   a flex column just isn't something Grid's intrinsic sizing handles well. */
.cmart-grid {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue) transparent;
  display: flex;
  flex-direction: column;
  padding: 4px;
  box-sizing: border-box;
}

.cmart-cards-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: var(--shortcard-height);
  grid-auto-flow: row;
  gap: 4px;
}

.cmart-cards-grid :deep(.sc) {
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

.pack-img--clickable {
  cursor: pointer;
  transition: opacity 0.15s;
}
.pack-img--clickable:hover {
  opacity: 0.8;
}

/* ── Upgrades grid ───────────────────────────────────────────── */
.upgrade-grid {
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

.upgrade-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--OrbitDarkBlue);
  border-radius: 8px;
  padding: 14px 10px;
  box-sizing: border-box;
  gap: 8px;
  text-align: center;
}

.upgrade-name {
  font-size: 0.9rem;
  font-weight: bold;
  color: #fff;
  margin: 0;
}

.upgrade-desc {
  font-size: 0.7rem;
  color: #cce0ff;
  margin: 0;
  line-height: 1.4;
}

.upgrade-count {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
}

.upgrade-buy-btn {
  width: 100%;
  margin-top: auto;
  font-size: 0.75rem;
  padding: 6px 8px;
  white-space: nowrap;
}

/* ── Pack preview modal ──────────────────────────────────────── */
:global(.pack-preview-overlay) {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

:global(.pack-preview-card) {
  position: relative;
  background: var(--OrbitDarkBlue, #003466);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  color: #fff;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.2) transparent;
}

.pack-preview-name {
  font-size: 1rem;
  font-weight: bold;
  text-align: center;
  color: #fff;
  margin: 0;
}

.pack-preview-rarity-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pack-preview-rarity-title {
  font-size: 0.85rem;
  font-weight: bold;
  color: #cce0ff;
  margin: 0;
}

.pack-preview-rarity-prob {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
  margin: 0;
}

.pack-preview-ctoon-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.pack-preview-ctoon-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 8px 6px 6px;
  gap: 3px;
}

.pack-preview-ctoon-img {
  width: 70px;
  height: 70px;
  object-fit: contain;
  margin-top: 14px;
  image-rendering: pixelated;
}

.pack-preview-ctoon-name {
  font-size: 0.65rem;
  font-weight: bold;
  text-align: center;
  color: #fff;
  margin: 0;
}

.pack-preview-ctoon-weight {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.pack-preview-buy-btn {
  width: 100%;
  font-size: 0.8rem;
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

:global(.pack-exclusive-badge) {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #7c3aed;
  color: #fff;
  font-size: 0.56rem;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 10px;
  text-align: right;
}

:global(.pack-exclusive-badge--preview) {
  top: 4px;
  right: auto;
  left: 4px;
  text-align: left;
}

:global(.pack-reveal-img-wrap) {
  position: relative;
  display: inline-block;
  margin-top: 16px;
}

:global(.pack-reveal-img) {
  width: 80px;
  height: 80px;
  object-fit: contain;
  display: block;
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
  .cmart-cards-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: auto;
  }

  .cmart-cards-grid :deep(.sc) {
    width: 100%;
    height: auto;
    aspect-ratio: 3 / 4;
  }

  .packs-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .upgrade-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  :global(.pack-reveal-grid) {
    grid-template-columns: repeat(2, 1fr);
  }

  .pack-preview-ctoon-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .sale-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: auto;
  }

  .sale-grid :deep(.sc) {
    width: 100%;
    height: auto;
    aspect-ratio: 3 / 4;
  }

  .sale-banner {
    --sale-banner-top: 41px;
  }

  .sale-banner-img {
    max-width: 130px;
    max-height: 110px;
  }

  .sale-banner-title {
    font-size: 0.85rem;
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
  transform: scale(var(--img-scale));
}

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

.owned-badge--owned {
  background: #16a34a;
  color: #fff;
}

.owned-badge--unowned {
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.75);
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
