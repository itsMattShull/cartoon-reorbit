<template>
  <div class="acs">

    <!-- Tabs -->
    <div class="acs-tabs">
      <button
        class="acs-tab"
        :class="{ active: activeTab === 'AllSets' }"
        @click="activeTab = 'AllSets'"
      >All Sets</button>
      <button
        class="acs-tab"
        :class="{ active: activeTab === 'AllSeries' }"
        @click="activeTab = 'AllSeries'"
      >All Series</button>
    </div>

    <hr class="acs-divider" />

    <!-- Search -->
    <div class="acs-search">
      <span class="acs-search-icon">&#9906;</span>
      <input type="text" v-model="filter.name" placeholder="Search name..." />
    </div>

    <hr class="acs-divider" />

    <!-- Rarity -->
    <div>
      <div class="acs-label">Rarity</div>
      <div class="acs-rarity-grid">
        <button
          v-for="r in RARITIES"
          :key="r.value"
          class="acs-rarity-btn"
          :class="[r.cls, { active: filter.rarities.includes(r.value) }]"
          @click="toggleRarity(r.value)"
        >{{ r.label }}</button>
      </div>
    </div>

    <hr class="acs-divider" />

    <!-- Owned filter -->
    <div>
      <div class="acs-label">Ownership</div>
      <div class="acs-owned-row">
        <button class="acs-owned-btn" :class="{ active: filter.owned === 'all' }"     @click="filter.owned = 'all'"    >All</button>
        <button class="acs-owned-btn" :class="{ active: filter.owned === 'owned' }"   @click="filter.owned = 'owned'"  >Owned</button>
        <button class="acs-owned-btn" :class="{ active: filter.owned === 'unowned' }" @click="filter.owned = 'unowned'">Unowned</button>
      </div>
    </div>

    <hr class="acs-divider" />

    <!-- Sort -->
    <div>
      <div class="acs-label">Sort By</div>
      <div class="acs-sort-row">
        <select class="acs-select" v-model="filter.sortField">
          <option value="name">Name (A→Z)</option>
          <option value="rarity">Rarity</option>
          <option value="releaseDate">Release Date</option>
        </select>
        <button class="acs-sort-dir" @click="filter.sortAsc = !filter.sortAsc">
          {{ filter.sortAsc ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Clear -->
    <button class="acs-clear" @click="clearFilters">Clear Filters</button>

  </div>
</template>

<script setup>
const activeTab = useAllCtoonsTab()
const filter    = useAllCtoonsFilter()

const RARITIES = [
  { value: 'common',       label: 'C',  cls: 'acs-rb-common'        },
  { value: 'uncommon',     label: 'U',  cls: 'acs-rb-uncommon'      },
  { value: 'rare',         label: 'R',  cls: 'acs-rb-rare'          },
  { value: 'very rare',    label: 'VR', cls: 'acs-rb-very-rare'     },
  { value: 'crazy rare',   label: 'CR', cls: 'acs-rb-crazy-rare'    },
  { value: 'prize only',   label: 'PO', cls: 'acs-rb-prize-only'    },
  { value: 'code only',    label: 'CO', cls: 'acs-rb-code-only'     },
  { value: 'auction only', label: 'AO', cls: 'acs-rb-auction-only'  },
]

function toggleRarity(val) {
  const idx = filter.value.rarities.indexOf(val)
  if (idx === -1) filter.value.rarities = [...filter.value.rarities, val]
  else            filter.value.rarities = filter.value.rarities.filter(r => r !== val)
}

function clearFilters() {
  Object.assign(filter.value, {
    name:      '',
    rarities:  [],
    owned:     'all',
    sortField: 'name',
    sortAsc:   true,
  })
}
</script>

<style scoped>
.acs {
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

/* ── Tabs ── */
.acs-tabs {
  display: flex;
  gap: 4px;
}

.acs-tab {
  flex: 1;
  padding: 5px 4px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.acs-tab.active {
  background: var(--OrbitLightBlue);
  border-color: var(--OrbitLightBlue);
  color: #fff;
}

.acs-tab:not(.active):hover {
  color: rgba(255, 255, 255, 0.85);
}

/* ── Label ── */
.acs-label {
  font-size: 0.6rem;
  font-weight: bold;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
}

/* ── Search ── */
.acs-search {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 3px 8px;
  gap: 4px;
}

.acs-search-icon { font-size: 0.7rem; color: rgba(255, 255, 255, 0.4); }

.acs-search input {
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 0.75rem;
  width: 100%;
  padding: 0;
}

.acs-search input::placeholder { color: rgba(255, 255, 255, 0.35); }

/* ── Rarity ── */
.acs-rarity-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.acs-rarity-btn {
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

.acs-rarity-btn.active { opacity: 1; }
.acs-rarity-btn:hover  { opacity: 0.85; }

.acs-rb-common       { background: #6b7280; color: #fff; }
.acs-rb-uncommon     { background: #e5e7eb; color: #111; }
.acs-rb-rare         { background: #16a34a; color: #fff; }
.acs-rb-very-rare    { background: #2563eb; color: #fff; }
.acs-rb-crazy-rare   { background: #7c3aed; color: #fff; }
.acs-rb-prize-only   { background: #111;    color: #e5e7eb; }
.acs-rb-code-only    { background: #ea580c; color: #fff; }
.acs-rb-auction-only { background: #eab308; color: #111; }

/* ── Owned filter ── */
.acs-owned-row {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  overflow: hidden;
  width: 100%;
}

.acs-owned-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.58rem;
  font-weight: bold;
  padding: 3px 4px;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
}

.acs-owned-btn.active { background: var(--OrbitLightBlue); color: #fff; }

/* ── Sort ── */
.acs-sort-row {
  display: flex;
  gap: 4px;
}

.acs-select {
  flex: 1;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 0.72rem;
  padding: 3px 6px;
  outline: none;
  cursor: pointer;
}

.acs-select option { background: #1a3a58; }

.acs-sort-dir {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 0.8rem;
  padding: 2px 7px;
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Clear ── */
.acs-clear {
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
  font-family: inherit;
}

.acs-clear:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

/* ── Divider ── */
.acs-divider {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 0;
}
</style>
