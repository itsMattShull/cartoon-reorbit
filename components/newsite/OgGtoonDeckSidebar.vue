<!-- components/newsite/OgGtoonDeckSidebar.vue -->
<!-- Sidebar-middle content on the Original gToons "Manage Deck" tab: search and filter the gToons you own.
     The filter state is shared with components/oggtoons/OgGtoonDecks.vue (which applies it) through
     composables/useOgGtoonDeckFilter. -->
<template>
  <div class="ogds" data-tut="deck-filters">
    <div>
      <div class="ogds-label">Search</div>
      <div class="ogds-search">
        <span class="ogds-search-icon">&#9906;</span>
        <input type="text" v-model="filter.search" placeholder="gToon or character name..." />
      </div>
    </div>

    <hr class="ogds-divider" />

    <div>
      <div class="ogds-label">Set</div>
      <select class="ogds-select" v-model="filter.set">
        <option value="">All Sets</option>
        <option v-for="s in meta.sets" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <div>
      <div class="ogds-label">Series</div>
      <select class="ogds-select" v-model="filter.series">
        <option value="">All Series</option>
        <option v-for="s in meta.series" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <hr class="ogds-divider" />

    <div>
      <div class="ogds-label">Types</div>
      <div class="ogds-chips">
        <button
          v-for="t in OG_CARD_TYPES"
          :key="t"
          type="button"
          class="ogds-chip"
          :class="{ active: filter.types.includes(t) }"
          :aria-pressed="filter.types.includes(t)"
          @click="toggleType(t)"
        >{{ ogTitleCase(t) }}</button>
      </div>
    </div>

    <hr class="ogds-divider" />

    <label class="ogds-checkbox-row">
      <input type="checkbox" v-model="filter.hasPowers" class="ogds-checkbox" />
      <span class="ogds-checkbox-label">Has Powers</span>
    </label>

    <hr class="ogds-divider" />

    <div>
      <div class="ogds-label">Number</div>
      <div class="ogds-range">
        <input type="number" inputmode="numeric" :min="meta.minNumber" :max="meta.maxNumber" v-model="filter.minNumber" :placeholder="`Min ${meta.minNumber}`" aria-label="Minimum number" />
        <span>–</span>
        <input type="number" inputmode="numeric" :min="meta.minNumber" :max="meta.maxNumber" v-model="filter.maxNumber" :placeholder="`Max ${meta.maxNumber}`" aria-label="Maximum number" />
      </div>
    </div>

    <button type="button" class="ogds-clear" :disabled="!active" @click="clearFilters">Clear Filters</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ogTitleCase } from '@/utils/ogGtoonLabels'
import { OG_CARD_TYPES, emptyDeckFilter, isDeckFilterActive } from '@/utils/ogGtoonDeckFilter'

const filter = useOgGtoonDeckFilter()
const meta = useOgGtoonDeckMeta()
const active = computed(() => isDeckFilterActive(filter.value))

function toggleType(t) {
  filter.value.types = filter.value.types.includes(t)
    ? filter.value.types.filter(x => x !== t)
    : [...filter.value.types, t]
}
function clearFilters() {
  Object.assign(filter.value, emptyDeckFilter())
}
</script>

<style scoped>
.ogds { display: flex; flex-direction: column; gap: 8px; height: 100%; overflow-y: auto; padding: 6px 4px; box-sizing: border-box; scrollbar-width: thin; scrollbar-color: var(--OrbitDarkBlue) transparent; }
.ogds-label { font-size: 0.6rem; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); margin-bottom: 2px; }
.ogds-divider { border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 0; }

.ogds-search { display: flex; align-items: center; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 20px; padding: 3px 8px; gap: 4px; }
.ogds-search-icon { font-size: 0.7rem; color: rgba(255, 255, 255, 0.4); }
.ogds-search input { background: none; border: none; outline: none; color: #fff; font-size: 0.75rem; width: 100%; padding: 0; }
.ogds-search input::placeholder { color: rgba(255, 255, 255, 0.35); }

.ogds-select { width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; color: #fff; font-size: 0.72rem; padding: 3px 6px; outline: none; cursor: pointer; }
.ogds-select option { background: #1a3a58; color: #fff; }

.ogds-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ogds-chip { border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; background: transparent; color: rgba(255, 255, 255, 0.55); font-size: 0.6rem; font-weight: bold; padding: 2px 6px; cursor: pointer; font-family: inherit; transition: background 0.15s, color 0.15s; }
.ogds-chip:hover { color: #fff; }
.ogds-chip.active { background: var(--OrbitLightBlue); border-color: var(--OrbitLightBlue); color: #fff; }

.ogds-checkbox-row { display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
.ogds-checkbox { accent-color: var(--OrbitLightBlue); width: 13px; height: 13px; flex-shrink: 0; cursor: pointer; }
.ogds-checkbox-label { font-size: 0.72rem; font-weight: bold; color: rgba(255, 255, 255, 0.75); }
.ogds-checkbox-row:hover .ogds-checkbox-label { color: #fff; }

.ogds-range { display: flex; align-items: center; gap: 4px; color: rgba(255, 255, 255, 0.5); }
.ogds-range input { flex: 1; min-width: 0; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; color: #fff; font-size: 0.72rem; padding: 3px 6px; outline: none; }
.ogds-range input::placeholder { color: rgba(255, 255, 255, 0.35); }

.ogds-clear { width: 100%; padding: 4px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.2); color: rgba(255, 255, 255, 0.6); font-size: 0.7rem; cursor: pointer; transition: background 0.15s, color 0.15s; margin-top: auto; font-family: inherit; }
.ogds-clear:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); color: #fff; }
.ogds-clear:disabled { opacity: 0.4; cursor: default; }
</style>
