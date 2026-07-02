<template>
  <div class="ctoon-filter">

    <!-- Search -->
    <div class="cf-search">
      <span class="cf-search-icon">&#9906;</span>
      <input type="text" v-model="filter.name" placeholder="Search name..." />
    </div>

    <hr class="cf-divider" />

    <!-- Rarity -->
    <div>
      <div class="cf-section-label">Rarity</div>
      <div class="cf-rarity-grid">
        <button
          v-for="r in RARITIES"
          :key="r.value"
          class="cf-rarity-btn"
          :class="[r.cls, { active: filter.rarities.includes(r.value) }]"
          @click="toggleRarity(r.value)"
        >{{ r.label }}</button>
      </div>
    </div>

    <hr class="cf-divider" />

    <!-- Series -->
    <div>
      <div class="cf-section-label">Series</div>
      <select class="cf-select" v-model="filter.series">
        <option value=""></option>
        <option v-for="s in seriesList" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <!-- Set -->
    <div>
      <div class="cf-section-label">Set</div>
      <select class="cf-select" v-model="filter.set">
        <option value=""></option>
        <option v-for="s in filteredSetList" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <hr class="cf-divider" />

    <!-- Price -->
    <div>
      <div class="cf-section-label">Price (PTS.)</div>
      <div class="cf-price-row">
        <input class="cf-price-input" type="number" v-model="filter.priceMin" placeholder="Min" min="0" />
        <span class="cf-price-sep">–</span>
        <input class="cf-price-input" type="number" v-model="filter.priceMax" placeholder="Max" min="0" />
      </div>
    </div>

    <hr class="cf-divider" />

    <!-- Sort -->
    <div>
      <div class="cf-section-label">Sort By</div>
      <div class="cf-sort-row">
        <select class="cf-select" v-model="filter.sortField">
          <option v-for="o in props.sortOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <button v-if="props.showSortDir" class="cf-sort-dir" @click="filter.sortAsc = !filter.sortAsc">
          {{ filter.sortAsc ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Auction-specific + common filters -->
    <template v-if="showAuctionFilters || showCommonFilters">
      <hr class="cf-divider" />
      <div>
        <div class="cf-section-label">Filters</div>
        <div class="cf-pill-row">
          <button v-if="showAuctionFilters" class="cf-pill" :class="{ active: aFilters.featuredOnly }" @click="aFilters.featuredOnly = !aFilters.featuredOnly">★ Feat.</button>
          <button v-if="showAuctionFilters" class="cf-pill" :class="{ active: aFilters.hasBidsOnly  }" @click="aFilters.hasBidsOnly  = !aFilters.hasBidsOnly" >Has Bids</button>
          <button v-if="showCommonFilters"  class="cf-pill" :class="{ active: aFilters.gtoonsOnly   }" @click="aFilters.gtoonsOnly   = !aFilters.gtoonsOnly"  >gToons</button>
          <button v-if="showCommonFilters"  class="cf-pill" :class="{ active: aFilters.wishlistOnly }" @click="aFilters.wishlistOnly = !aFilters.wishlistOnly">Wishlist</button>
        </div>
        <div v-if="showCommonFilters" class="cf-owned-row">
          <button class="cf-owned-btn" :class="{ active: aFilters.selectedOwned === 'all'     }" @click="aFilters.selectedOwned = 'all'"    >All</button>
          <button class="cf-owned-btn" :class="{ active: aFilters.selectedOwned === 'owned'   }" @click="aFilters.selectedOwned = 'owned'"  >Owned</button>
          <button class="cf-owned-btn" :class="{ active: aFilters.selectedOwned === 'unowned' }" @click="aFilters.selectedOwned = 'unowned'">Unowned</button>
        </div>
      </div>
    </template>

    <template v-if="showHideUnavailable || showExcludeSecondEditions">
      <hr class="cf-divider" />
      <div class="cf-page-filters">
        <label v-if="showHideUnavailable" class="cf-checkbox-row">
          <input type="checkbox" v-model="filter.hideUnavailable" />
          <span>Hide unavailable</span>
        </label>
        <label v-if="showExcludeSecondEditions" class="cf-checkbox-row">
          <input type="checkbox" v-model="filter.excludeSecondEditions" />
          <span>Exclude Second Editions</span>
        </label>
      </div>
    </template>

    <!-- Clear -->
    <button class="cf-clear" @click="clearFilters">Clear Filters</button>

  </div>
</template>

<script setup>
const props = defineProps({
  showHideUnavailable: { type: Boolean, default: false },
  showExcludeSecondEditions: { type: Boolean, default: false },
  showSortDir:         { type: Boolean, default: true  },
  showAuctionFilters:  { type: Boolean, default: false },
  showCommonFilters:   { type: Boolean, default: false },
  sortOptions: {
    type: Array,
    default: () => [
      { value: 'name',   label: 'Name'   },
      { value: 'price',  label: 'Price'  },
      { value: 'rarity', label: 'Rarity' },
    ],
  },
  sourceCtoons: { type: Array, default: null },
})

const filter   = useNewSiteCtoonFilter()
const aFilters = useAuctionHouseFilters()
const fallbackCtoons = useState('cmartCtoons', () => [])
const ctoons = computed(() => props.sourceCtoons !== null ? props.sourceCtoons : fallbackCtoons.value)

const RARITIES = [
  { value: 'common',       label: 'C',  cls: 'cf-rb-common'        },
  { value: 'uncommon',     label: 'U',  cls: 'cf-rb-uncommon'      },
  { value: 'rare',         label: 'R',  cls: 'cf-rb-rare'          },
  { value: 'very rare',    label: 'VR', cls: 'cf-rb-very-rare'     },
  { value: 'crazy rare',   label: 'CR', cls: 'cf-rb-crazy-rare'    },
  { value: 'prize only',   label: 'PO', cls: 'cf-rb-prize-only'    },
  { value: 'code only',    label: 'CO', cls: 'cf-rb-code-only'     },
  { value: 'auction only', label: 'AO', cls: 'cf-rb-auction-only'  },
]

const seriesList = computed(() =>
  [...new Set(ctoons.value.map(c => c.series).filter(Boolean))].sort()
)

const setList = computed(() =>
  [...new Set(ctoons.value.map(c => c.set).filter(Boolean))].sort()
)

const filteredSetList = computed(() => {
  const src = filter.value.series
    ? ctoons.value.filter(c => c.series === filter.value.series)
    : ctoons.value
  return [...new Set(src.map(c => c.set).filter(Boolean))].sort()
})

watch(() => filter.value.series, () => {
  if (filter.value.set && !filteredSetList.value.includes(filter.value.set)) {
    filter.value.set = ''
  }
})

function toggleRarity(val) {
  const idx = filter.value.rarities.indexOf(val)
  if (idx === -1) filter.value.rarities = [...filter.value.rarities, val]
  else            filter.value.rarities = filter.value.rarities.filter(r => r !== val)
}

function clearFilters() {
  Object.assign(filter.value, {
    name:            '',
    rarities:        [],
    series:          '',
    set:             '',
    priceMin:        '',
    priceMax:        '',
    sortField:       props.sortOptions[0]?.value ?? 'name',
    sortAsc:         true,
    hideUnavailable: false,
    excludeSecondEditions: false,
  })
  if (props.showAuctionFilters || props.showCommonFilters) {
    Object.assign(aFilters.value, {
      featuredOnly:  false,
      hasBidsOnly:   false,
      gtoonsOnly:    false,
      wishlistOnly:  false,
      selectedOwned: 'all',
    })
  }
}
</script>

<style scoped>
.ctoon-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow-y: auto;
  padding: 6px 4px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
}

.cf-section-label {
  font-size: 0.6rem;
  font-weight: bold;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
}

/* ── Search ── */
.cf-search {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 3px 8px;
  gap: 4px;
}

.cf-search-icon { font-size: 0.7rem; color: rgba(255, 255, 255, 0.4); }

.cf-search input {
  background: none;
  border: none;
  outline: none;
  color: #ffffff;
  font-size: 0.75rem;
  width: 100%;
  padding: 0;
}

.cf-search input::placeholder { color: rgba(255, 255, 255, 0.35); }

/* ── Rarity badges ── */
.cf-rarity-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cf-rarity-btn {
  border: none;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 0.6rem;
  font-weight: bold;
  cursor: pointer;
  opacity: 0.4;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.cf-rarity-btn.active { opacity: 1; }
.cf-rarity-btn:hover  { opacity: 0.85; }

.cf-rb-common       { background: #6b7280; color: #fff; }
.cf-rb-uncommon     { background: #e5e7eb; color: #111; }
.cf-rb-rare         { background: #16a34a; color: #fff; }
.cf-rb-very-rare    { background: #2563eb; color: #fff; }
.cf-rb-crazy-rare   { background: #7c3aed; color: #fff; }
.cf-rb-prize-only   { background: #111;    color: #e5e7eb; }
.cf-rb-code-only    { background: #ea580c; color: #fff; }
.cf-rb-auction-only { background: #eab308; color: #111; }

/* ── Dropdowns ── */
.cf-select {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ffffff;
  font-size: 0.72rem;
  padding: 3px 6px;
  outline: none;
  cursor: pointer;
}

.cf-select option { background: #1a3a58; }

/* ── Price range ── */
.cf-price-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cf-price-input {
  flex: 1;
  min-width: 0;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ffffff;
  font-size: 0.72rem;
  padding: 3px 5px;
  outline: none;
  width: 100%;
}

.cf-price-sep { color: rgba(255, 255, 255, 0.4); font-size: 0.7rem; }

/* ── Sort ── */
.cf-sort-row {
  display: flex;
  gap: 4px;
}

.cf-sort-dir {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ffffff;
  font-size: 0.8rem;
  padding: 2px 7px;
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Checkbox filters ── */
.cf-checkbox-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.cf-checkbox-row input[type="checkbox"] {
  accent-color: var(--OrbitLightBlue);
  width: 12px;
  height: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.cf-checkbox-row span {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.2;
}

/* ── Clear ── */
.cf-clear {
  width: 100%;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.7rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  margin-top: auto;
}

.cf-clear:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

/* ── Divider ── */
.cf-divider {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 0;
}

/* ── Auction filter pills ── */
.cf-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.cf-pill {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.58rem;
  font-weight: bold;
  padding: 2px 7px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.cf-pill.active                { background: var(--OrbitLightBlue); border-color: var(--OrbitLightBlue); color: #fff; }
.cf-pill:not(.active):hover    { color: rgba(255, 255, 255, 0.85); }

.cf-owned-row {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  overflow: hidden;
  width: 100%;
}

.cf-owned-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.58rem;
  font-weight: bold;
  padding: 2px 4px;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
  transition: background 0.15s, color 0.15s;
}
.cf-owned-btn.active { background: var(--OrbitLightBlue); color: #fff; }
</style>
