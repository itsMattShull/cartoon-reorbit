<template>
  <div class="my-collection">

    <!-- ── Header bar ────────────────────────────────────────────── -->
    <div class="mc-header">My Collection</div>

    <!-- ── Active "duplicates only" indicator ─────────────────────── -->
    <div v-if="filter.duplicatesOnly" class="mc-active-filter">
      <button class="mc-chip" title="Turn off the duplicates filter" @click="filter.duplicatesOnly = false">
        Duplicates only
        <span class="mc-chip-count">{{ ctoons.length }}</span>
        <span class="mc-chip-x" aria-hidden="true">✕</span>
      </button>
    </div>

    <!-- ── Pagination (top) ─────────────────────────────────────── -->
    <div class="mc-pagination">
      <button class="mc-pg-btn" :disabled="currentPage <= 1" @click="prevPage">‹</button>
      <span class="mc-pg-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="mc-pg-btn" :disabled="currentPage >= totalPages" @click="nextPage">›</button>
    </div>

    <!-- ── Card grid ─────────────────────────────────────────────── -->
    <div ref="gridEl" class="mc-grid">
      <div v-if="loading" class="mc-status">Loading…</div>
      <div v-else-if="!ctoons.length" class="mc-status">{{ emptyMessage }}</div>
      <template v-else>
        <ShortCard v-for="c in paginatedCtoons" :key="c.id">
          <template #header>
            <div class="card-img-wrap">
              <img v-if="c.assetPath" :src="c.assetPath" :alt="c.name" class="card-img card-img--clickable" @click="openInfo(c)" />
              <SecondEditionOverlay :ctoon="c" />
              <!-- Overlaid on the artwork rather than added to the footer: the
                   footer's two buttons are stacked at every width now, so a
                   third row would take another ~35px straight out of the
                   artwork. Top-right is free (SecondEditionOverlay defaults to
                   bottom-right). -->
              <button
                class="mc-lock"
                :class="{ 'mc-lock--on': c.isLocked }"
                :aria-pressed="c.isLocked ? 'true' : 'false'"
                :aria-label="(c.isLocked ? 'Unlock ' : 'Lock ') + c.name + ' #' + (c.mintNumber ?? '?')"
                :title="c.isLocked ? 'Unlock — let others request this cToon in a trade' : 'Lock — stop others requesting this cToon in a trade'"
                :disabled="lockPending.has(c.id)"
                @click.stop="toggleLock(c)"
              >
                <LockIcon :locked="c.isLocked" :filled="c.isLocked" />
              </button>
            </div>
          </template>
          <template #middle>
            <span class="card-mint">#{{ c.mintNumber ?? '?' }}</span>
            <span class="card-name">{{ c.name }}</span>
            <span class="rarity-dot" :style="{ background: rarityColor(c.rarity) }" :title="c.rarity" />
          </template>
          <template #footer-left>
            <BlueButton class="card-btn" :disabled="hasActiveAuction(c) || c.isLocked" @click="openAuction(c)">
              {{ hasActiveAuction(c) ? 'In Auction' : c.isLocked ? 'Locked' : 'Auction' }}
            </BlueButton>
          </template>
          <template #footer-right>
            <GreenButton class="card-btn" :disabled="tradeListLoading || c.isLocked" @click="toggleTradeList(c)">
              {{ c.isLocked ? 'Locked' : tradeList.includes(c.id) ? 'Remove Tradable' : 'Make Tradable' }}
            </GreenButton>
          </template>
        </ShortCard>
      </template>
    </div>

    <Teleport to="body">
      <div class="mc-toast-live" role="status" aria-live="polite" aria-atomic="true">
        <div v-if="toast.show" class="mc-toast" :class="`mc-toast--${toast.type}`">{{ toast.message }}</div>
      </div>
    </Teleport>

    <!-- ── Pagination (bottom) ───────────────────────────────────── -->
    <div class="mc-pagination">
      <button class="mc-pg-btn" :disabled="currentPage <= 1" @click="prevPage">‹</button>
      <span class="mc-pg-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="mc-pg-btn" :disabled="currentPage >= totalPages" @click="nextPage">›</button>
    </div>

  </div>
</template>

<script setup>
import { duplicateCtoonIds, groupByCtoonId } from '@/utils/duplicateCtoonIds'

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
// The modal itself is mounted once in layouts/newsite-template.vue.
const { open: openAuctionModal, createdSignal, lastCreated } = useAuctionModal()

const PAGE_SIZE   = 30
const currentPage = ref(1)
const gridEl      = ref(null)

// Duplicate status is derived from the FULL collection, so narrowing by name,
// rarity, set, etc. never changes what counts as a duplicate — it only decides
// which duplicates are shown. Depends solely on allCtoons, so toggling any
// filter key (including duplicatesOnly itself) does not recompute it.
const duplicateIds = computed(() => duplicateCtoonIds(allCtoons.value))

watch(filter, () => {
  currentPage.value = 1
  // A shrinking list otherwise strands the user at a scroll offset that no
  // longer points at anything.
  if (gridEl.value) gridEl.value.scrollTop = 0
}, { deep: true })

// On mobile the sidebar stacks *above* the grid, so ticking the box in an
// expanded sidebar changes something the user cannot see. Bring the grid into
// view instead of collapsing the sidebar out from under them.
watch(() => filter.value.duplicatesOnly, (on) => {
  if (!on || !process.client) return
  if (!window.matchMedia('(max-width: 768px)').matches) return
  nextTick(() => gridEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
})

function hasActiveAuction(c) {
  return (c.auctions && c.auctions.length > 0) || !!c.hasActiveAuction
}

function openAuction(c) {
  if (hasActiveAuction(c)) return
  openAuctionModal({ ctoon: c })
}

async function toggleTradeList(c) {
  // The trade-list endpoints refuse a locked copy, and the button is disabled
  // for one — but a wrapper keeps a stray call from surfacing as an unhandled
  // rejection, which is what happens today.
  try {
    if (tradeList.value.includes(c.id)) {
      await removeFromTradeList(c.id)
    } else {
      await addToTradeList(c.id)
    }
  } catch (err) {
    showToast(errMessage(err, 'Could not update your trade list.'), 'error')
  }
}

// ── Locks ─────────────────────────────────────────────────────
// No shared composable and no /api/locks GET: isLocked already rides on
// the /api/collections payload these cards are built from, and a load-once
// singleton (the shape composables/useTradeList.js uses) would go stale the
// moment a trade or auction moved the cToon, leaving a lit lock on a copy the
// user no longer owns.
const lockPending = ref(new Set())

function errMessage(err, fallback) {
  return err?.data?.statusMessage || err?.statusMessage || err?.message || fallback
}

const toast = reactive({ show: false, message: '', type: 'success' })
let toastTimer = null
function showToast(message, type = 'success') {
  toast.show = true; toast.message = message; toast.type = type
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.show = false; toastTimer = null }, 4000)
}
onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer) })

async function toggleLock(c) {
  // Per-id guard, not a global `loading`. Nothing visibly changes for a moment
  // after a tap, and mobile users double-tap when that happens; a shared flag
  // would let the second tap fire the opposite request.
  if (lockPending.value.has(c.id)) return
  const was = !!c.isLocked

  // Optimistic: this is a single UPDATE, and a spinner on a 170px card is noise.
  // The rollback below is what makes that safe — the POST really can 409 when
  // the copy is in an active auction.
  lockPending.value = new Set(lockPending.value).add(c.id)
  c.isLocked = !was
  try {
    const res = await $fetch(`/api/locks/${encodeURIComponent(c.id)}`, {
      method: was ? 'DELETE' : 'POST'
    })
    c.isLocked = !!res?.isLocked
    if (!was) {
      // Locking drops the copy off the public trade list server-side, so the
      // shared list has to lose it too or the button keeps offering "Remove
      // Tradable" for a listing that no longer exists.
      if (tradeList.value.includes(c.id)) {
        tradeList.value = tradeList.value.filter(id => id !== c.id)
      }
      showToast(
        res?.inPendingTrade
          ? 'Locked. Heads up: this cToon is in a pending trade, and that offer can still be accepted.'
          : 'Locked. Other players can no longer request this cToon in a trade.',
        'success'
      )
    } else {
      showToast('Lock removed.', 'success')
    }
  } catch (err) {
    c.isLocked = was
    showToast(errMessage(err, 'Could not update this lock.'), 'error')
  } finally {
    const next = new Set(lockPending.value); next.delete(c.id); lockPending.value = next
  }
}

// Mark the ctoon as having an active auction so its button stays disabled.
watch(createdSignal, () => {
  const ctoon = allCtoons.value.find(c => c.id === lastCreated.value)
  if (ctoon) ctoon.hasActiveAuction = true
})

const ctoons = computed(() => {
  const f = filter.value
  let list = allCtoons.value

  if (f.duplicatesOnly)
    list = list.filter(c => duplicateIds.value.has(c.ctoonId))

  if (f.name)
    list = list.filter(c => c.name.toLowerCase().includes(f.name.toLowerCase()))

  if (f.rarities.length)
    list = list.filter(c => f.rarities.includes((c.rarity || '').toLowerCase()))

  if (f.series)
    list = list.filter(c => c.series === f.series)

  if (f.set)
    list = list.filter(c => c.set === f.set)

  if (f.cMoon === '__none__')
    list = list.filter(c => !c.cMoon)
  else if (f.cMoon)
    list = list.filter(c => c.cMoon?.id === f.cMoon)

  if (f.priceMin !== '')
    list = list.filter(c => c.price >= Number(f.priceMin))

  if (f.priceMax !== '')
    list = list.filter(c => c.price <= Number(f.priceMax))

  if (f.excludeSecondEditions)
    list = list.filter(c => !c.isSecondEdition)

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

  // The whole point of the duplicates view is comparing copies of the same
  // cToon to decide which to keep, so cluster them. Group order and in-group
  // order both follow the sort chosen above.
  if (f.duplicatesOnly) list = groupByCtoonId(list)

  return list
})

const hasNarrowingFilters = computed(() => {
  const f = filter.value
  return !!(
    f.name || f.rarities.length || f.series || f.set ||
    f.priceMin !== '' || f.priceMax !== '' || f.excludeSecondEditions
  )
})

const emptyMessage = computed(() => {
  if (!allCtoons.value.length) return 'No cToons in your collection.'
  if (filter.value.duplicatesOnly) {
    if (!duplicateIds.value.size) return 'You have no duplicate cToons.'
    if (hasNarrowingFilters.value) return 'All your duplicates are hidden by your other filters.'
  }
  return 'No cToons match your filters.'
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

/* ── Active filter chip ──────────────────────────────────────── */
.mc-active-filter {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  background: var(--OrbitDarkBlue);
}

.mc-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--OrbitLightBlue);
  border-radius: 10px;
  background: var(--OrbitLightBlue);
  color: #fff;
  font-size: 0.62rem;
  font-weight: bold;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
}

.mc-chip-count {
  background: rgba(0, 0, 0, 0.28);
  border-radius: 8px;
  padding: 0 5px;
}

.mc-chip-x { opacity: 0.75; }
.mc-chip:hover .mc-chip-x { opacity: 1; }

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
  /* Taller than the 176px default because the two action buttons stack rather
     than sit side by side (see below). Without this the extra row would come
     straight out of `.sc-header`, which is the artwork. */
  --shortcard-height: 214px;
}

/* Stacked at every width, not just on phones. Full-width buttons give both
   actions a real label instead of two ~46px halves that ellipsise "Remove
   Tradable" on any card narrower than about 200px.

   The `.mc-grid` prefix is load-bearing. A bare `:deep(.sc-footer)` compiles to
   `[data-v-mc] .sc-footer`, which ties ShortCard's own `.sc-footer[data-v-sc]`
   at (0,2,0) — so which one wins is decided purely by the order Rollup happens
   to emit the two chunks' CSS in. Prefixed, it is (0,3,0) and deterministic. */
.mc-grid :deep(.sc-footer) { flex-direction: column; }
.mc-grid :deep(.sc-footer-left),
.mc-grid :deep(.sc-footer-right) { width: 100%; flex: 0 0 auto; }
.mc-grid :deep(.sc-footer-right) { justify-content: flex-start; }
.mc-grid :deep(.sc) { --sc-footer-gap: 3px; }

@media (max-width: 768px) {
  .mc-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: auto;
  }

  /* Stacking now comes from the base rules; the phone layout only relaxes the
     fixed height so the card can breathe at two columns. */
  .mc-grid :deep(.sc) {
    height: auto;
    aspect-ratio: 3 / 4.4;
  }

  @supports not (aspect-ratio: 3 / 4.4) {
    .mc-grid :deep(.sc) { height: var(--shortcard-height, 214px); }
  }

  .mc-chip {
    font-size: 0.78rem;
    padding: 6px 12px;
  }

}

/* ── Lock toggle (overlaid on the artwork) ───────────────── */
.mc-lock {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 6;
  width: 30px;
  height: 30px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.45);
  background: rgba(0,0,0,0.45);
  color: rgba(255,255,255,0.55);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
}

/* Solid gold, matching .tc-lock on the trade card so the two surfaces agree. */
.mc-lock--on {
  background: #eab308;
  color: #111;
  border-color: #a16207;
}

.mc-lock:disabled { opacity: 0.5; cursor: progress; }

/* Must stay AFTER the base rule above — equal specificity, so source order
   decides, exactly as with .card-btn further down. A 30px circle is under the
   practical touch floor. */
@media (max-width: 768px) {
  .mc-lock {
    width: 40px;
    height: 40px;
    font-size: 1.15rem;
  }
}

/* ── Toast ───────────────────────────────────────────────────── */
.mc-toast-live {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 12000;
  pointer-events: none;
}

.mc-toast {
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 0.82rem;
  color: #fff;
  max-width: min(92vw, 460px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.45);
}

.mc-toast--success { background: #15803d; border: 1px solid #166534; }
.mc-toast--error   { background: #991b1b; border: 1px solid #7f1d1d; }

/* ── Status ──────────────────────────────────────────────────── */
.mc-status {
  grid-column: 1 / -1;
  text-align: center;
  color: #336699;
  font-size: 2rem;
  padding: 20px;
}

/* Must stay after the base rule above — equal specificity, so source order
   decides. 2rem across a 2-column grid wraps the longer empty-state copy into
   a broken-looking block. */
@media (max-width: 768px) {
  .mc-status {
    font-size: 1.15rem;
    padding: 16px 12px;
  }
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

.card-img-wrap {
  position: relative;
  width: 100%;
  height: 100%;
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

/* Explicit min-height rather than `height: 100%`: the footer is content-sized
   now, so a percentage would resolve to `auto` and collapse the button to an
   18px line box. */
.card-btn {
  width: 100%;
  min-height: 24px;
  padding: 0;
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Must stay after the base rule above — equal specificity, so source order
   decides. Both buttons stack on a phone, so they get a real tap target. */
@media (max-width: 768px) {
  .card-btn { min-height: 32px; }
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
