<template>
  <div class="economy">
    <div class="economy-header">
      <h1 class="economy-title">Economy</h1>
      <div class="window-toggle" role="group" aria-label="Time window">
        <button
          v-for="opt in windowOptions"
          :key="opt.value"
          type="button"
          class="window-pill"
          :class="{ 'window-pill--active': windowValue === opt.value }"
          @click="windowValue = opt.value"
        >{{ opt.label }}</button>
      </div>
    </div>

    <!-- Filters & sort. v-show rather than v-if so the id in aria-controls
         always resolves to a real element. -->
    <button
      type="button"
      class="filter-toggle"
      :class="{ 'filter-toggle--active': activeFilterCount > 0 }"
      :aria-expanded="filtersOpen ? 'true' : 'false'"
      aria-controls="economy-filters"
      @click="filtersOpen = !filtersOpen"
    >
      <span aria-hidden="true">{{ filtersOpen ? '▲' : '▼' }}</span>
      <span>Filters &amp; Sort</span>
      <span v-if="activeFilterCount" class="filter-badge" aria-hidden="true">{{ activeFilterCount }}</span>
      <span v-if="activeFilterCount" class="sr-only">, {{ activeFilterCount }} active</span>
    </button>

    <div id="economy-filters" v-show="filtersOpen" class="filter-panel">
      <div class="filter-group">
        <label class="filter-label" for="economy-sort">Sort Browse All cToons</label>
        <select id="economy-sort" v-model="filter.sort" class="filter-select">
          <option v-for="opt in ECONOMY_SORTS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <fieldset class="filter-group filter-fieldset">
        <legend class="filter-label">Hide from Trending, Top 10 and Browse</legend>
        <label class="filter-check">
          <input type="checkbox" v-model="filter.hideGtoons" />
          <span>Hide gToons</span>
        </label>
        <label class="filter-check">
          <input type="checkbox" v-model="filter.hidePokemon" />
          <span>Hide Pokémon cToons</span>
        </label>
      </fieldset>

      <button type="button" class="filter-clear" :disabled="!activeFilterCount" @click="clearFilters">
        Clear Filters
      </button>
    </div>

    <!-- Stat tiles -->
    <p class="stat-note">Site-wide totals — the filters above don't apply here.</p>
    <div class="stat-row">
      <div class="stat-card">
        <div class="stat-label">Avg Points / Player</div>
        <div class="stat-value">{{ summary ? formatNumber(summary.avgPointsPerPlayer, 0) : '—' }}</div>
        <div v-if="summary" class="stat-foot">Median {{ formatNumber(summary.medianPointsPerPlayer) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Net Points (7d)</div>
        <div class="stat-value" :class="netPointsClass">
          {{ summary ? formatSigned(summary.netPoints7d) : '—' }}
        </div>
        <div v-if="summary" class="stat-foot">Issued minus spent</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Trades</div>
        <div class="stat-value">{{ summary ? formatNumber(summary.totalTradeVolume) : '—' }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Auctions Sold</div>
        <div class="stat-value">{{ summary ? formatNumber(summary.totalAuctionVolume) : '—' }}</div>
      </div>
    </div>

    <!-- Active exclusions stay visible while the panel is collapsed: they change
         what every list below means, so hiding that in a closed accordion would
         make them invisible global state. Each chip is its own undo. -->
    <div v-if="exclusionChips.length" class="filter-chip-row" aria-live="polite">
      <span class="filter-chip-label">Filters:</span>
      <button
        v-for="chip in exclusionChips"
        :key="chip.key"
        type="button"
        class="filter-chip"
        @click="filter[chip.key] = false"
      >
        {{ chip.label }} <span aria-hidden="true">×</span><span class="sr-only">, remove filter</span>
      </button>
    </div>

    <!-- Trending -->
    <section class="economy-section">
      <h2 class="section-title">Trending cToons</h2>
      <p class="section-sub">
        By combined trade + auction activity ({{ windowLabel }}){{ exclusionSuffix }}
      </p>
      <ul v-if="trending?.length" class="ctoon-list">
        <li
          v-for="(row, idx) in trending"
          :key="row.ctoonId"
          class="ctoon-row"
          tabindex="0"
          @click="openHistory(row.ctoonId)"
          @keyup.enter="openHistory(row.ctoonId)"
        >
          <span class="ctoon-rank">{{ idx + 1 }}</span>
          <img v-if="row.assetPath" class="ctoon-thumb" :src="row.assetPath" :alt="row.name" />
          <span class="ctoon-name">{{ row.name }}</span>
          <span class="ctoon-metric">{{ row.volume }} txns</span>
        </li>
      </ul>
      <p v-else class="empty-note">
        {{ activeExclusionCount
          ? 'No trending cToons match your filters.'
          : 'Not enough activity yet to show trends.' }}
      </p>
    </section>

    <!-- Top 10 -->
    <section class="economy-section">
      <h2 class="section-title">Top 10 Most Valuable</h2>
      <p v-if="activeExclusionCount" class="section-sub">Ranked among cToons matching your filters.</p>
      <div class="top10-buttons">
        <GreenButton @click="openTopValuable('AUCTION')">By Auction</GreenButton>
        <GreenButton @click="openTopValuable('TRADE')">By Trade</GreenButton>
      </div>
    </section>

    <!-- Browse all -->
    <section class="economy-section">
      <h2 class="section-title">Browse All cToons</h2>
      <p class="section-sub">
        {{ browseSortLabel }} · all-time figures — the time window above applies to
        Trending and Top 10 only{{ exclusionSuffix }}
      </p>
      <input
        v-model="searchInput"
        type="text"
        inputmode="search"
        autocomplete="off"
        placeholder="Search cToon name…"
        class="search-input"
      />
      <ul v-if="browseResults.length" class="ctoon-list">
        <li
          v-for="row in browseResults"
          :key="row.ctoonId"
          class="ctoon-row ctoon-row--browse"
          tabindex="0"
          @click="openHistory(row.ctoonId)"
          @keyup.enter="openHistory(row.ctoonId)"
        >
          <img v-if="row.assetPath" class="ctoon-thumb" :src="row.assetPath" :alt="row.name" />
          <span class="ctoon-name">{{ row.name }}</span>
          <!-- Show the key the list was ordered by, or a volume sort looks like
               it did nothing — most rows' prices read "N/A". -->
          <span v-if="isVolumeSort" class="ctoon-price-chip ctoon-price-chip--sort">
            <span class="chip-label">{{ volumeChipLabel }}</span>
            <span>{{ formatVolume(row.sortVolume) }}</span>
          </span>
          <span class="ctoon-price-chip">
            <span class="chip-label">Auction</span>
            <span>{{ formatPrice(row.avgAuctionPrice) }}</span>
          </span>
          <span class="ctoon-price-chip">
            <span class="chip-label">Trade</span>
            <span>{{ formatPrice(row.avgTradePrice) }}</span>
          </span>
        </li>
      </ul>
      <p v-else-if="browseError" class="empty-note">
        Couldn't load cToons just now — {{ browseError }}
      </p>
      <p v-else-if="!browsePending" class="empty-note">
        {{ activeExclusionCount ? 'No cToons match your filters.' : 'No cToons found.' }}
      </p>
      <div v-if="browseTotal > pageSize" class="pagination">
        <button type="button" :disabled="browsePage <= 1" @click="browsePage--">Prev</button>
        <span>Page {{ browsePage }} of {{ totalPages }}</span>
        <button type="button" :disabled="browsePage >= totalPages" @click="browsePage++">Next</button>
      </div>
    </section>

    <EconomyTopValuableModal
      v-if="showTopValuable"
      :source="topValuableSource"
      :window="windowValue"
      :hide-gtoons="filter.hideGtoons"
      :hide-pokemon="filter.hidePokemon"
      @close="showTopValuable = false"
      @select="openHistory"
    />

    <EconomyCtoonHistoryModal
      v-if="historyCtoonId"
      :ctoon-id="historyCtoonId"
      @close="historyCtoonId = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRequestHeaders } from '#app'

const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const windowOptions = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' }
]
const windowValue = ref('7d')
const windowLabel = computed(() => windowOptions.find(o => o.value === windowValue.value)?.label || '')

// Modals — tracked so polling can pause while either is open (avoids
// re-rendering/losing scroll position under a user's thumb mid-read).
const showTopValuable = ref(false)
const topValuableSource = ref('AUCTION')
const historyCtoonId = ref(null)
const anyModalOpen = computed(() => showTopValuable.value || !!historyCtoonId.value)

function openTopValuable(source) {
  topValuableSource.value = source
  showTopValuable.value = true
}

function openHistory(ctoonId) {
  showTopValuable.value = false
  historyCtoonId.value = ctoonId
}

// Sort + exclusion state, shared with pages/newsite/economy.vue for URL sync.
const filter = useEconomyFilter()
const filtersOpen = ref(false)

// Sent as the app's usual `1` flag, or omitted entirely when off.
const hideGtoonsParam = computed(() => (filter.value.hideGtoons ? '1' : undefined))
const hidePokemonParam = computed(() => (filter.value.hidePokemon ? '1' : undefined))

const activeExclusionCount = computed(
  () => (filter.value.hideGtoons ? 1 : 0) + (filter.value.hidePokemon ? 1 : 0)
)
const activeFilterCount = computed(
  () => activeExclusionCount.value + (filter.value.sort !== ECONOMY_FILTER_DEFAULTS.sort ? 1 : 0)
)

const exclusionChips = computed(() => {
  const chips = []
  if (filter.value.hideGtoons) chips.push({ key: 'hideGtoons', label: 'gToons hidden' })
  if (filter.value.hidePokemon) chips.push({ key: 'hidePokemon', label: 'Pokémon hidden' })
  return chips
})

const exclusionSuffix = computed(() => {
  const parts = []
  if (filter.value.hideGtoons) parts.push('gToons')
  if (filter.value.hidePokemon) parts.push('Pokémon')
  if (!parts.length) return ''
  return ` · excluding ${parts.join(' and ')}`
})

const browseSortLabel = computed(
  () => ECONOMY_SORTS.find(s => s.value === filter.value.sort)?.label || ''
)
const isVolumeSort = computed(
  () => filter.value.sort === 'tradeVolume' || filter.value.sort === 'auctionVolume'
)
const volumeChipLabel = computed(() => (filter.value.sort === 'tradeVolume' ? 'Trades' : 'Auctions'))

function clearFilters() {
  Object.assign(filter.value, ECONOMY_FILTER_DEFAULTS)
}

// Summary + trending. useFetch already refetches when a reactive `query` value
// changes — an extra manual watch here would double every request.
const { data: summary, refresh: refreshSummary } = useFetch('/api/economy/summary', { headers })
const { data: trending, refresh: refreshTrending } = useFetch('/api/economy/trending', {
  query: { window: windowValue, hideGtoons: hideGtoonsParam, hidePokemon: hidePokemonParam },
  headers
})

const netPointsClass = computed(() => {
  const v = summary.value?.netPoints7d
  if (v == null) return ''
  return v >= 0 ? 'stat-value--pos' : 'stat-value--neg'
})

let pollHandle = null
onMounted(() => {
  pollHandle = setInterval(() => {
    if (anyModalOpen.value) return
    refreshSummary()
    refreshTrending()
  }, 60000)
})
onBeforeUnmount(() => {
  if (pollHandle) clearInterval(pollHandle)
})

// Browse all cToons
const searchInput = ref('')
const debouncedQuery = ref('')
let debounceHandle = null
watch(searchInput, (val) => {
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => { debouncedQuery.value = val; browsePage.value = 1 }, 300)
})

const browsePage = ref(1)
const pageSize = ref(20)
const browseResults = ref([])
const browseTotal = ref(0)
// Starts true so the "No cToons found." note doesn't flash before the first load.
const browsePending = ref(true)
const browseError = ref('')
const totalPages = computed(() => Math.max(1, Math.ceil(browseTotal.value / pageSize.value)))

// Filter toggles and the sort dropdown fire discrete events, so without both a
// sequence guard and an abort a user flipping three of them can have the first
// response land last, and a stale `finally` can clear the spinner while a newer
// request is still in flight.
let browseReqId = 0
let browseAbort = null

async function loadBrowse() {
  const myId = ++browseReqId
  browseAbort?.abort()
  browseAbort = new AbortController()
  browsePending.value = true
  try {
    const res = await $fetch('/api/economy/ctoons/search', {
      query: {
        q: debouncedQuery.value,
        page: browsePage.value,
        sort: filter.value.sort,
        hideGtoons: hideGtoonsParam.value,
        hidePokemon: hidePokemonParam.value
      },
      headers,
      signal: browseAbort.signal
    })
    if (myId !== browseReqId) return
    browseResults.value = res.results
    browseTotal.value = Number(res.total) || 0
    pageSize.value = res.pageSize
    browseError.value = ''
  } catch (err) {
    if (err?.name === 'AbortError' || myId !== browseReqId) return
    // Keep the previous results on screen. Blanking the list would render
    // "No cToons found." for what is actually a rate limit or a server error.
    browseError.value = err?.statusCode === 429
      ? 'too many requests, give it a moment.'
      : 'please try again.'
  } finally {
    if (myId === browseReqId) browsePending.value = false
  }
}

// The filter controls aren't debounced by the search box's timer, and the
// endpoint caps volume sorts at 10 requests/minute, so coalesce bursts here.
let browseScheduleHandle = null
function scheduleBrowse() {
  if (browseScheduleHandle) clearTimeout(browseScheduleHandle)
  browseScheduleHandle = setTimeout(loadBrowse, 200)
}

watch([debouncedQuery, browsePage], scheduleBrowse)
watch(
  () => [filter.value.sort, filter.value.hideGtoons, filter.value.hidePokemon],
  () => {
    // Reset synchronously here rather than in a watcher on browsePage: a
    // separate watcher would queue a second load for the page change.
    browsePage.value = 1
    scheduleBrowse()
  }
)
// Client-only: the response can't be awaited from setup, so an SSR fetch here
// would never reach the rendered HTML — it would just be a wasted round trip on
// every page render.
if (process.client) loadBrowse()

onBeforeUnmount(() => {
  if (browseScheduleHandle) clearTimeout(browseScheduleHandle)
  browseAbort?.abort()
})

function formatNumber(n, maximumFractionDigits = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits })
}

function formatSigned(n) {
  if (n == null) return '—'
  const v = Number(n)
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString()}`
}

// Prices below MIN_SAMPLE_SIZE transactions are withheld server-side to keep
// individual trades anonymous, so a missing price means "not enough data yet",
// not "free".
function formatPrice(n) {
  if (n == null) return '—'
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} pts`
}

function formatVolume(n) {
  if (n == null) return '< 3'
  return Number(n).toLocaleString()
}
</script>

<style scoped>
/* Fluid, like every other newsite page component (.ah, .cmart, .all-ctoons,
   .leaderboards). On desktop the layout's .main-content is a fixed
   var(--main-content-width) box, so this still resolves to 800px and the
   internal vertical scroll is unchanged; at <=768px .main-content switches to
   width:100% + overflow-x:auto, and a fixed min-width here is what used to
   leave ~half the page off-screen behind a horizontal pan. */
.economy {
  width: 100%;
  max-width: var(--main-content-width, 800px);
  min-width: 0;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: var(--text-color, #fff);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.economy-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.economy-title {
  font-size: 1.6rem;
  font-weight: 800;
  margin: 0;
}

.window-toggle {
  display: flex;
  gap: 6px;
}

.window-pill {
  padding: 6px 12px;
  min-height: 36px;
  border-radius: 999px;
  border: 2px solid var(--OrbitLightBlue, #3399CC);
  background: transparent;
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.window-pill--active {
  background: var(--OrbitLightBlue, #3399CC);
}

/* Filters & sort. The panel is capped well under the container width because
   full-width form controls read as broken at 800px; it shrinks with the page on
   narrow screens rather than being pinned to a breakpoint. */
.filter-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  margin-bottom: 10px;
  border-radius: 999px;
  border: 2px solid var(--OrbitLightBlue, #3399CC);
  background: transparent;
  color: #fff;
  font-family: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}

/* Filled as well as badged, so the active state doesn't rely on colour alone. */
.filter-toggle--active {
  background: var(--OrbitLightBlue, #3399CC);
}

.filter-toggle:focus-visible,
.filter-select:focus-visible,
.filter-check input:focus-visible,
.filter-clear:focus-visible,
.filter-chip:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #fff;
  color: #003466;
  font-size: 0.75rem;
  font-weight: 800;
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 340px;
  padding: 12px;
  margin-bottom: 12px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.filter-fieldset {
  border: 0;
  margin: 0;
  padding: 0;
}

.filter-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.75;
  padding: 0;
}

.filter-select {
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: inherit;
  font-size: 1rem; /* >=16px so iOS Safari doesn't auto-zoom on focus */
}

.filter-select option {
  background: #003466;
  color: #fff;
}

.filter-check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px; /* whole label is the tap target */
  font-size: 0.95rem;
  cursor: pointer;
}

.filter-check input {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  accent-color: var(--OrbitLightBlue, #3399CC);
}

.filter-clear {
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.filter-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Wraps rather than scrolls, so no chip can end up off-screen on a narrow
   viewport where it's also the only visible undo for an active filter. */
.filter-chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
}

.filter-chip-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

.filter-chip {
  min-height: 36px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--OrbitLightBlue, #3399CC);
  background: var(--OrbitLightBlue, #3399CC);
  color: #fff;
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.stat-note {
  font-size: 0.7rem;
  opacity: 0.6;
  margin: 0 0 6px;
}

/* Horizontally-scrollable row instead of stacked full-width cards, so the
   trending list isn't pushed below the fold on small screens. */
.stat-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 18px;
  -webkit-overflow-scrolling: touch;
}

.stat-card {
  flex: 0 0 auto;
  min-width: 140px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 10px 14px;
}

.stat-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.75;
}

.stat-value {
  font-size: 1.3rem;
  font-weight: 800;
}

.stat-value--pos {
  color: #8CE046;
}

.stat-value--neg {
  color: #FF8A7A;
}

.stat-foot {
  margin-top: 2px;
  font-size: 0.68rem;
  opacity: 0.6;
}

.economy-section {
  margin-bottom: 22px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0 0 2px;
}

.section-sub {
  font-size: 0.78rem;
  opacity: 0.7;
  margin: 0 0 10px;
}

.top10-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ctoon-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ctoon-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  min-height: 44px;
  box-sizing: border-box;
}

.ctoon-row:hover,
.ctoon-row:focus-visible {
  background: rgba(255, 255, 255, 0.14);
  outline: none;
}

.ctoon-rank {
  width: 20px;
  text-align: center;
  font-weight: 700;
  opacity: 0.8;
  flex-shrink: 0;
}

.ctoon-thumb {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}

.ctoon-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.ctoon-metric {
  flex-shrink: 0;
  font-size: 0.85rem;
  opacity: 0.85;
}

.ctoon-row--browse {
  flex-wrap: wrap;
}

.ctoon-price-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.78rem;
  line-height: 1.15;
  min-width: 70px;
}

.chip-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  opacity: 0.65;
}

.ctoon-price-chip--sort {
  color: var(--OrbitLightGreen, #8CE046);
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 1rem; /* >=16px so iOS Safari doesn't auto-zoom on focus */
  margin-bottom: 10px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.55);
}

.empty-note {
  opacity: 0.7;
  font-size: 0.85rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 0.85rem;
}

.pagination button {
  min-height: 36px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 768px is the layout's own MOBILE_BREAKPOINT (layouts/newsite-template.vue) —
   the point where .main-content stops being a fixed 800px box and starts
   tracking the viewport. Below it this component is genuinely narrow; above it
   it's always 800px no matter how wide the window is, so a smaller breakpoint
   here would fire in a range where nothing had actually changed size. */
@media (max-width: 768px) {
  .economy {
    padding: 12px;
  }

  .economy-title {
    font-size: 1.3rem;
  }

  .ctoon-row--browse {
    align-items: flex-start;
  }

  /* Narrow enough that single-line ellipsis eats most of a real cToon name
     ("1 Year Anniversary Miss Sara Bellum"). Wrapping costs a line; truncating
     costs the identity of the row. */
  .ctoon-name {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }

  /* Let the name claim the rest of the thumbnail's line so the price chips wrap
     underneath it. Otherwise the name is flex-shrinkable to nothing and three
     70px chips truncate it to an ellipsis. 46px = 36px thumb + 10px row gap. */
  .ctoon-row--browse .ctoon-name {
    flex: 1 1 calc(100% - 46px);
  }

  /* Right-aligned chips read as misaligned once they wrap onto their own line. */
  .ctoon-row--browse .ctoon-price-chip {
    align-items: flex-start;
    min-width: 64px;
  }
}
</style>
