<!-- components/newsite/MyCollectionPacks.vue
     My Collection > Packs: the player's SEALED packs. Open one and it behaves exactly like opening in cMart (shared
     components/PackOpenOverlay.vue); once opened it is consumed and disappears from here.

     Data: GET /api/collection/self/packs — 24 per page, with a per-type summary (the chips and the tab badge) and
     derived `inAuction` / `inPendingTrade` flags per pack. A pack that is in an active auction or a pending trade
     cannot be opened; its button says why instead of just going dead (touch users have no tooltip).

     Phone notes: the status chip sits ON the artwork (the ShortCard middle strip is a fixed 18px, so a chip there
     would clip), buttons are 44px tall, pagination has a jump-to-page select, the type chips scroll sideways in one
     row instead of wrapping, and the list is server-paginated so a few hundred packs never render at once. -->
<template>
  <div ref="panelEl" id="mc-panel-packs" class="mcp" role="tabpanel" aria-labelledby="mc-tab-packs" tabindex="-1">

    <div v-if="summary.byPack.length > 1" class="mcp-chips" role="group" aria-label="Filter by pack type">
      <button type="button" class="mcp-chip" :aria-pressed="!filterPackId" @click="setFilter(null)">
        All <span class="mcp-chip-count">{{ summary.total }}</span>
      </button>
      <button
        v-for="g in summary.byPack"
        :key="g.packId"
        type="button"
        class="mcp-chip"
        :aria-pressed="filterPackId === g.packId"
        @click="setFilter(g.packId)"
      >{{ g.name }} <span class="mcp-chip-count">{{ g.count }}</span></button>
    </div>

    <div v-if="totalPages > 1" class="mcp-pagination">
      <button type="button" class="mcp-pg-btn" :disabled="page <= 1 || loading" aria-label="Previous page" @click="goTo(page - 1)">‹</button>
      <label class="mcp-pg-jump">
        <span class="mcp-sr">Go to page</span>
        <select :value="page" class="mcp-pg-select" @change="goTo(Number($event.target.value))">
          <option v-for="n in totalPages" :key="n" :value="n">{{ n }} / {{ totalPages }}</option>
        </select>
      </label>
      <button type="button" class="mcp-pg-btn" :disabled="page >= totalPages || loading" aria-label="Next page" @click="goTo(page + 1)">›</button>
    </div>

    <div ref="gridEl" class="mcp-grid" :aria-busy="loading ? 'true' : 'false'">
      <template v-if="loading && !items.length">
        <div v-for="n in 6" :key="'sk' + n" class="mcp-skel" aria-hidden="true" />
      </template>

      <div v-else-if="loadError" class="mcp-status mcp-status--err" role="alert">
        {{ loadError }}
        <button type="button" class="mcp-retry" @click="load()">Try again</button>
      </div>

      <div v-else-if="!items.length" class="mcp-status">
        <p class="mcp-empty-title">No packs yet</p>
        <p class="mcp-empty-sub">
          Sealed packs show up here when you win them or redeem a code.
          <NuxtLink to="/newsite/cmart" class="mcp-link">Visit cMart</NuxtLink> ·
          <NuxtLink to="/newsite/redeem" class="mcp-link">Redeem a code</NuxtLink>
        </p>
      </div>

      <template v-else>
        <ShortCard v-for="it in items" :key="it.id">
          <template #header>
            <div class="mcp-art">
              <button type="button" class="mcp-art-btn" :aria-label="`See what is in ${it.name}`" @click="previewPack = it">
                <CtoonImage v-if="it.imagePath" :ctoon="{}" :src="it.imagePath" :alt="it.name" class="mcp-art-img" loading="lazy" />
                <span v-else class="mcp-art-fallback" aria-hidden="true">🎁</span>
              </button>
              <span v-if="statusText(it)" class="mcp-chip-status" :aria-label="statusAria(it)">{{ statusText(it) }}</span>
            </div>
          </template>
          <template #middle>
            <span class="mcp-name" :title="it.name">{{ it.name }}</span>
          </template>
          <template #footer-left>
            <GreenButton class="mcp-btn mcp-open" :disabled="!!blockReason(it)" @click="startOpen(it)">
              {{ blockReason(it) || 'Open' }}
            </GreenButton>
          </template>
          <template #footer-right>
            <BlueButton class="mcp-btn mcp-auction" :disabled="!!blockReason(it)" @click="startAuction(it)">
              {{ it.inAuction ? 'Listed' : it.inPendingTrade ? 'In Trade' : 'Auction' }}
            </BlueButton>
          </template>
        </ShortCard>
      </template>
    </div>

    <div v-if="totalPages > 1" class="mcp-pagination">
      <button type="button" class="mcp-pg-btn" :disabled="page <= 1 || loading" aria-label="Previous page" @click="goTo(page - 1)">‹</button>
      <span class="mcp-pg-info">{{ page }} / {{ totalPages }}</span>
      <button type="button" class="mcp-pg-btn" :disabled="page >= totalPages || loading" aria-label="Next page" @click="goTo(page + 1)">›</button>
    </div>

    <p class="mcp-sr" role="status" aria-live="polite">{{ liveMessage }}</p>

    <PackOpenOverlay
      v-if="opening"
      :key="opening.id"
      :user-pack-id="opening.id"
      :pack="opening"
      :remaining="otherOpenable.length"
      @opened="onOpened"
      @open-next="openNext"
      @close="closeOverlay"
    />
    <PackPreviewModal v-if="previewPack" :pack-id="previewPack.packId" :name="previewPack.name" @close="previewPack = null" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import CtoonImage from '@/components/CtoonImage.vue'
import PackOpenOverlay from '@/components/PackOpenOverlay.vue'
import PackPreviewModal from '@/components/PackPreviewModal.vue'

// Shared with the tab bar in MyCollection.vue (its "Packs (N)" badge) so opening a pack updates the badge at once.
const summary = useState('myPacksSummary', () => ({ total: 0, byPack: [] }))

const items = ref([])
const page = ref(1)
const totalPages = ref(1)
const loading = ref(true)
const loadError = ref('')
const filterPackId = ref(null)
const opening = ref(null)      // the pack currently in the overlay
const previewPack = ref(null)
const liveMessage = ref('')
const panelEl = ref(null)
const gridEl = ref(null)

let seq = 0                      // drops out-of-order responses when the filter/page changes quickly

async function load ({ silent = false } = {}) {
  const mine = ++seq
  if (!silent) loading.value = true
  loadError.value = ''
  try {
    const q = new URLSearchParams({ page: String(page.value) })
    if (filterPackId.value) q.set('packId', filterPackId.value)
    const res = await $fetch(`/api/collection/self/packs?${q}`)
    if (mine !== seq) return
    items.value = res.items
    totalPages.value = res.totalPages
    summary.value = { total: res.total, byPack: res.byPack }
    if (filterPackId.value && !res.byPack.some(g => g.packId === filterPackId.value)) filterPackId.value = null
    // Fewer pages than before (we just opened the last pack on the last page): step back rather than show a blank page.
    if (page.value > res.totalPages) { page.value = res.totalPages; await load({ silent }) }
  } catch (err) {
    if (mine !== seq) return
    loadError.value = err?.data?.statusMessage || err?.statusMessage || 'Could not load your packs.'
  } finally {
    if (mine === seq) loading.value = false
  }
}

function goTo (n) {
  if (n < 1 || n > totalPages.value || n === page.value) return
  page.value = n
  if (gridEl.value) gridEl.value.scrollTop = 0
  load()
}
function setFilter (id) {
  if (filterPackId.value === id) return
  filterPackId.value = id
  page.value = 1
  load()
}

// ── state shown on a tile ─────────────────────────────────────────
const blockReason = (it) => it.inAuction ? 'In Auction' : it.inPendingTrade ? 'In Trade' : ''
const statusText = (it) => it.inAuction ? 'In Auction' : it.inPendingTrade ? 'In Trade' : ''
const statusAria = (it) => it.inAuction
  ? `${it.name} is in an active auction and cannot be opened`
  : `${it.name} is part of a pending trade and cannot be opened`

const otherOpenable = computed(() => items.value.filter(i => !blockReason(i) && i.id !== opening.value?.id))

// ── auctioning ────────────────────────────────────────────────────
// The same "Send to Auction" modal the cToons use, in its pack form (kind: 'PACK'; `id` is the sealed pack's id).
const { open: openAuctionModal, createdSignal: auctionCreatedSignal } = useAuctionModal()
function startAuction (it) {
  if (blockReason(it)) return
  openAuctionModal({ ctoon: { kind: 'PACK', id: it.id, packId: it.packId, name: it.name, assetPath: it.imagePath } })
}
// A listing was just created (here or elsewhere): that pack is now "In Auction", so refresh the flags.
watch(auctionCreatedSignal, () => { load({ silent: true }) })

// ── opening ───────────────────────────────────────────────────────
function startOpen (it) {
  if (blockReason(it) || opening.value) return
  opening.value = it
}

function onOpened () {
  // Remove the tile the moment the server confirms, not when the overlay closes — otherwise a stale, tappable "Open"
  // sits under the overlay for the length of the reveal.
  const done = opening.value
  if (!done) return
  items.value = items.value.filter(i => i.id !== done.id)
  const byPack = summary.value.byPack
    .map(g => g.packId === done.packId ? { ...g, count: g.count - 1 } : g)
    .filter(g => g.count > 0)
  summary.value = { total: Math.max(0, summary.value.total - 1), byPack }
  liveMessage.value = `${done.name} opened.`
}

function openNext () {
  const next = otherOpenable.value[0]
  opening.value = next || null
  if (!next) closeOverlay()
}

async function closeOverlay () {
  opening.value = null
  await load({ silent: true })
  // The tile the player opened is gone, so "return focus to the opener" would land nowhere. Put it on the next Open
  // button, or on the panel itself when the list is empty.
  await nextTick()
  const btn = gridEl.value?.querySelector('button.mcp-open:not([disabled])')
  ;(btn || panelEl.value)?.focus?.()
}

onMounted(() => { load() })
watch(() => summary.value.total, (n, o) => { if (o != null && n === 0) items.value = [] })
</script>

<style scoped>
.mcp {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #1a2a40;
  outline: none;
  --img-scale: 0.8;
}

/* ── Type chips: one scrolling row, never wrapped ───────────── */
.mcp-chips {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  padding: 4px 6px;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--OrbitDarkBlue);
}
.mcp-chips::-webkit-scrollbar { display: none; }
.mcp-chip {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 5px;
  min-height: 28px; padding: 2px 10px;
  border: 1px solid var(--OrbitLightBlue); border-radius: 14px;
  background: transparent; color: #fff;
  font-size: 0.72rem; font-weight: bold; white-space: nowrap; cursor: pointer;
}
.mcp-chip[aria-pressed="true"] { background: var(--OrbitLightBlue); }
.mcp-chip-count { background: rgba(0, 0, 0, 0.28); border-radius: 8px; padding: 0 6px; }

/* ── Pagination ─────────────────────────────────────────────── */
.mcp-pagination { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 3px 6px; background: var(--OrbitDarkBlue); border-top: 1px solid rgba(255, 255, 255, 0.08); }
.mcp-pg-btn { min-width: 32px; min-height: 28px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; background: rgba(0, 0, 0, 0.2); color: #fff; font-size: 1rem; line-height: 1; padding: 1px 9px; cursor: pointer; }
.mcp-pg-btn:disabled { opacity: 0.3; cursor: default; }
.mcp-pg-select { min-height: 28px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(0, 0, 0, 0.25); color: #fff; font-size: 0.8rem; padding: 0 6px; }
.mcp-pg-select option { color: #1a2a40; background: #fff; }
.mcp-pg-info { font-size: 0.7rem; color: rgba(255, 255, 255, 0.7); min-width: 55px; text-align: center; }

/* ── Grid (mirrors .mc-grid in MyCollection.vue) ─────────────── */
.mcp-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitLightBlue) transparent;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: var(--shortcard-height);
  gap: 4px;
  padding: 4px;
  box-sizing: border-box;
  --shortcard-width: 100%;
  /* Two stacked action buttons (Open / Auction), like the cToon grid, so the artwork keeps its room. */
  --shortcard-height: 214px;
}
/* Prefixed with the grid class so it beats ShortCard's own scoped rule deterministically (see MyCollection.vue). */
.mcp-grid :deep(.sc-footer) { flex-direction: column; }
.mcp-grid :deep(.sc-footer-left),
.mcp-grid :deep(.sc-footer-right) { width: 100%; flex: 0 0 auto; justify-content: flex-start; }
.mcp-grid :deep(.sc) { --sc-footer-gap: 3px; }

.mcp-art { position: relative; width: 100%; height: 100%; }
.mcp-art-btn { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.mcp-art-btn:focus-visible { outline: 3px solid #fff; outline-offset: -3px; }
.mcp-art-img { width: 100%; height: 100%; object-fit: contain; transform: scale(var(--img-scale)); }
.mcp-art-fallback { font-size: 2.4rem; }
.mcp-chip-status { position: absolute; top: 3px; left: 3px; z-index: 6; max-width: calc(100% - 6px); padding: 2px 7px; border-radius: 10px; background: #eab308; color: #111; font-size: 0.68rem; font-weight: bold; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.mcp-name { font-size: 0.62rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; width: 100%; }

.mcp-btn { width: 100%; min-height: 28px; padding: 0; font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.mcp-skel { border-radius: 8px; background: linear-gradient(90deg, #e3ecf7 25%, #f2f6fb 50%, #e3ecf7 75%); background-size: 200% 100%; animation: mcp-shimmer 1.4s linear infinite; }

.mcp-status { grid-column: 1 / -1; text-align: center; color: #1a2a40; padding: 24px 12px; }
.mcp-status--err { color: #7a1d1d; }
.mcp-empty-title { margin: 0 0 6px; font-size: 1.5rem; font-weight: bold; color: #336699; }
.mcp-empty-sub { margin: 0; font-size: 0.9rem; line-height: 1.5; color: #334; }
.mcp-link { color: #1d5fa3; font-weight: bold; text-decoration: underline; }
.mcp-retry { margin-left: 8px; min-height: 44px; padding: 0 16px; border-radius: 8px; border: 2px solid #7a1d1d; background: #fff; color: #7a1d1d; font-weight: bold; cursor: pointer; }

.mcp-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@keyframes mcp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (max-width: 768px) {
  .mcp-grid { grid-template-columns: repeat(2, 1fr); grid-auto-rows: auto; }
  .mcp-grid :deep(.sc) { height: auto; aspect-ratio: 3 / 4.4; }
  @supports not (aspect-ratio: 3 / 4.4) { .mcp-grid :deep(.sc) { height: var(--shortcard-height, 214px); } }
  .mcp-skel { aspect-ratio: 3 / 4.4; }
  /* Real tap targets on a phone (the desktop sizes above are mouse-sized). */
  .mcp-btn { min-height: 44px; font-size: 0.9rem; }
  .mcp-chip { min-height: 40px; font-size: 0.8rem; padding: 4px 14px; }
  .mcp-pg-btn { min-width: 44px; min-height: 44px; }
  .mcp-pg-select { min-height: 44px; font-size: 1rem; }
  .mcp-chip-status { font-size: 0.72rem; }
  .mcp-name { font-size: 0.7rem; }
  .mcp-empty-title { font-size: 1.15rem; }
}

@media (prefers-reduced-motion: reduce) {
  .mcp-skel { animation: none; }
}
</style>
