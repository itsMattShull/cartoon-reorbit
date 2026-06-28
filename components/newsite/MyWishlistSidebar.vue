<template>
  <div class="mws">

    <!-- Search -->
    <div class="mws-search">
      <span class="mws-search-icon">&#9906;</span>
      <input type="text" v-model="filter.name" placeholder="Search name..." />
    </div>

    <hr class="mws-divider" />

    <!-- Tradable owners filter -->
    <label class="mws-checkbox-row">
      <input type="checkbox" v-model="filter.tradable" class="mws-checkbox" />
      <span class="mws-checkbox-label">Has Tradable Owner</span>
    </label>
    <p class="mws-hint">Only show cToons where at least one player who owns it has marked it as tradable.</p>

    <hr class="mws-divider" />

    <!-- Rarity -->
    <div>
      <div class="mws-label">Rarity</div>
      <div class="mws-rarity-grid">
        <button
          v-for="r in RARITIES"
          :key="r.value"
          class="mws-rarity-btn"
          :class="[r.cls, { active: filter.rarities.includes(r.value) }]"
          @click="toggleRarity(r.value)"
        >{{ r.label }}</button>
      </div>
    </div>

    <hr class="mws-divider" />

    <!-- Sort -->
    <div>
      <div class="mws-label">Sort By</div>
      <div class="mws-sort-row">
        <select class="mws-select" v-model="filter.sortField">
          <option value="name">Name (A→Z)</option>
          <option value="rarity">Rarity</option>
          <option value="releaseDate">Release Date</option>
        </select>
        <button class="mws-sort-dir" @click="filter.sortAsc = !filter.sortAsc">
          {{ filter.sortAsc ? '▲' : '▼' }}
        </button>
      </div>
    </div>

    <!-- Clear -->
    <button class="mws-clear" @click="clearFilters">Clear Filters</button>

  </div>
</template>

<script setup>
const filter = useMyWishlistFilter()

const RARITIES = [
  { value: 'common',       label: 'C',  cls: 'mws-rb-common'        },
  { value: 'uncommon',     label: 'U',  cls: 'mws-rb-uncommon'      },
  { value: 'rare',         label: 'R',  cls: 'mws-rb-rare'          },
  { value: 'very rare',    label: 'VR', cls: 'mws-rb-very-rare'     },
  { value: 'crazy rare',   label: 'CR', cls: 'mws-rb-crazy-rare'    },
  { value: 'prize only',   label: 'PO', cls: 'mws-rb-prize-only'    },
  { value: 'code only',    label: 'CO', cls: 'mws-rb-code-only'     },
  { value: 'auction only', label: 'AO', cls: 'mws-rb-auction-only'  },
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
    tradable:  false,
    sortField: 'name',
    sortAsc:   true,
  })
}
</script>

<style scoped>
.mws {
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

/* ── Label ── */
.mws-label {
  font-size: 0.6rem;
  font-weight: bold;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
}

/* ── Search ── */
.mws-search {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 3px 8px;
  gap: 4px;
}

.mws-search-icon { font-size: 0.7rem; color: rgba(255, 255, 255, 0.4); }

.mws-search input {
  background: none;
  border: none;
  outline: none;
  color: #fff;
  font-size: 0.75rem;
  width: 100%;
  padding: 0;
}

.mws-search input::placeholder { color: rgba(255, 255, 255, 0.35); }

/* ── Rarity ── */
.mws-rarity-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mws-rarity-btn {
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

.mws-rarity-btn.active { opacity: 1; }
.mws-rarity-btn:hover  { opacity: 0.85; }

.mws-rb-common       { background: #6b7280; color: #fff; }
.mws-rb-uncommon     { background: #e5e7eb; color: #111; }
.mws-rb-rare         { background: #16a34a; color: #fff; }
.mws-rb-very-rare    { background: #2563eb; color: #fff; }
.mws-rb-crazy-rare   { background: #7c3aed; color: #fff; }
.mws-rb-prize-only   { background: #111;    color: #e5e7eb; }
.mws-rb-code-only    { background: #ea580c; color: #fff; }
.mws-rb-auction-only { background: #eab308; color: #111; }

/* ── Sort ── */
.mws-sort-row {
  display: flex;
  gap: 4px;
}

.mws-select {
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

.mws-select option { background: #1a3a58; }

.mws-sort-dir {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 0.8rem;
  padding: 2px 7px;
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Tradable checkbox ── */
.mws-checkbox-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.mws-checkbox {
  accent-color: var(--OrbitLightBlue);
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  cursor: pointer;
}

.mws-checkbox-label {
  font-size: 0.72rem;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.75);
}

.mws-checkbox-row:hover .mws-checkbox-label { color: #fff; }

.mws-hint {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  line-height: 1.4;
}

/* ── Clear ── */
.mws-clear {
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

.mws-clear:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

/* ── Divider ── */
.mws-divider {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 0;
}
</style>
