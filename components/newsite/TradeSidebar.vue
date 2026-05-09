<template>
  <div class="tsb">
    <div class="tsb-head">
      <span class="tsb-title">{{ sidebarTitle }}</span>
    </div>

    <!-- Name filter -->
    <div class="tsb-field">
      <label class="tsb-label">Name</label>
      <div class="tsb-relative">
        <input
          :value="activeNameQuery"
          @input="onNameInput"
          @focus="showSuggest = true"
          @blur="onNameBlur"
          type="text"
          placeholder="Search…"
          class="tsb-input"
          autocomplete="off"
        />
        <div v-if="showSuggest && activeSuggestions.length" class="tsb-suggest">
          <button
            v-for="s in activeSuggestions"
            :key="s"
            class="tsb-suggest-item"
            @mousedown.prevent="applyNameSuggestion(s)"
          >{{ s }}</button>
        </div>
      </div>
    </div>

    <!-- Set -->
    <div class="tsb-field">
      <label class="tsb-label">Set</label>
      <select class="tsb-select" :value="activeFilters.set" @change="setFilter('set', $event.target.value)">
        <option v-for="opt in activeSetOptions" :key="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- Series -->
    <div class="tsb-field">
      <label class="tsb-label">Series</label>
      <select class="tsb-select" :value="activeFilters.series" @change="setFilter('series', $event.target.value)">
        <option v-for="opt in activeSeriesOptions" :key="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- Rarity -->
    <div class="tsb-field">
      <label class="tsb-label">Rarity</label>
      <select class="tsb-select" :value="activeFilters.rarity" @change="setFilter('rarity', $event.target.value)">
        <option v-for="opt in activeRarityOptions" :key="opt">{{ opt }}</option>
      </select>
    </div>

    <!-- Other Filters -->
    <div class="tsb-field">
      <label class="tsb-label">Other</label>
      <select class="tsb-select" :value="activeFilters.duplicates" @change="setFilter('duplicates', $event.target.value)">
        <option value="all">All</option>
        <option value="trade-list">On Trade List</option>
        <option value="dups">Only Duplicates</option>
      </select>
    </div>

    <!-- Owned -->
    <div class="tsb-field">
      <label class="tsb-label">{{ ownedLabel }}</label>
      <select class="tsb-select" :value="activeFilters.owned" @change="setFilter('owned', $event.target.value)">
        <option value="all">All</option>
        <option value="owned">Owned</option>
        <option value="unowned">Unowned</option>
      </select>
    </div>

    <!-- Wishlist toggle (step 2 only) -->
    <div v-if="isStep2" class="tsb-wishlist">
      <label class="tsb-wishlist-row">
        <input
          type="checkbox"
          v-model="tradeFiltersSelf.wishlistOnly"
          :disabled="tradeLoadingWishlist || tradeTargetWishlistCount === 0"
          class="tsb-cb"
        />
        <span class="tsb-wishlist-label">Their Wishlist</span>
      </label>
      <div v-if="tradeLoadingWishlist" class="tsb-dim">Loading…</div>
      <div v-else-if="tradeTargetWishlistCount === 0" class="tsb-dim">No wishlist items</div>
    </div>
  </div>
</template>

<script setup>
const {
  tradeCurrentStep,
  tradeTargetUser,
  tradeFiltersOther,
  tradeFiltersSelf,
  tradeSetOptionsOther,
  tradeSetOptionsSelf,
  tradeSeriesOptionsOther,
  tradeSeriesOptionsSelf,
  tradeRarityOptionsOther,
  tradeRarityOptionsSelf,
  tradeNameSuggestionsOther,
  tradeNameSuggestionsSelf,
  tradeLoadingWishlist,
  tradeTargetWishlistCount,
} = useTradePageFilters()

const showSuggest = ref(false)

const isStep2 = computed(() => tradeCurrentStep.value === 2)

const activeFilters = computed(() => isStep2.value ? tradeFiltersSelf.value : tradeFiltersOther.value)
const activeNameQuery = computed(() => activeFilters.value.nameQuery)
const activeSuggestions = computed(() =>
  isStep2.value ? tradeNameSuggestionsSelf.value : tradeNameSuggestionsOther.value
)
const activeSetOptions = computed(() =>
  isStep2.value ? tradeSetOptionsSelf.value : tradeSetOptionsOther.value
)
const activeSeriesOptions = computed(() =>
  isStep2.value ? tradeSeriesOptionsSelf.value : tradeSeriesOptionsOther.value
)
const activeRarityOptions = computed(() =>
  isStep2.value ? tradeRarityOptionsSelf.value : tradeRarityOptionsOther.value
)
const ownedLabel = computed(() => isStep2.value ? 'Owned by User' : 'Owned (by you)')
const sidebarTitle = computed(() =>
  isStep2.value
    ? 'Filter: Your cToons'
    : `Filter: ${tradeTargetUser.value?.username ?? 'User'}'s cToons`
)

function setFilter(key, val) {
  if (isStep2.value) {
    tradeFiltersSelf.value[key] = val
  } else {
    tradeFiltersOther.value[key] = val
  }
}

function onNameInput(e) {
  const val = e.target.value
  if (isStep2.value) {
    tradeFiltersSelf.value.nameQuery = val
  } else {
    tradeFiltersOther.value.nameQuery = val
  }
  showSuggest.value = true
}

function onNameBlur() {
  setTimeout(() => { showSuggest.value = false }, 120)
}

function applyNameSuggestion(s) {
  if (isStep2.value) {
    tradeFiltersSelf.value.nameQuery = s
  } else {
    tradeFiltersOther.value.nameQuery = s
  }
  showSuggest.value = false
}
</script>

<style scoped>
.tsb {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 6px;
  box-sizing: border-box;
  gap: 5px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
}

.tsb-head {
  padding: 2px 0 4px;
  border-bottom: 1px solid rgba(255,255,255,0.2);
  flex-shrink: 0;
}

.tsb-title {
  font-size: 0.65rem;
  font-weight: bold;
  color: var(--OrbitGreen);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tsb-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.tsb-label {
  font-size: 0.58rem;
  font-weight: bold;
  color: rgba(255,255,255,0.55);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tsb-relative {
  position: relative;
}

.tsb-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  color: white;
  font-size: 0.68rem;
  padding: 3px 6px;
  outline: none;
  font-family: inherit;
}
.tsb-input::placeholder { color: rgba(255,255,255,0.3); }
.tsb-input:focus { border-color: var(--OrbitLightBlue); }

.tsb-suggest {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 30;
  background: #002255;
  border: 1px solid var(--OrbitLightBlue);
  border-radius: 4px;
  max-height: 110px;
  overflow-y: auto;
  margin-top: 2px;
}

.tsb-suggest-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 3px 6px;
  font-size: 0.63rem;
  color: white;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.tsb-suggest-item:hover { background: rgba(255,255,255,0.1); }

.tsb-select {
  width: 100%;
  box-sizing: border-box;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  color: white;
  font-size: 0.66rem;
  padding: 3px 4px;
  outline: none;
  font-family: inherit;
  cursor: pointer;
}
.tsb-select:focus { border-color: var(--OrbitLightBlue); }
.tsb-select option { background: #002255; color: white; }

.tsb-wishlist {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.15);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tsb-wishlist-row {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

.tsb-wishlist-label {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.85);
}

.tsb-cb {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  cursor: pointer;
}

.tsb-dim {
  font-size: 0.6rem;
  color: rgba(255,255,255,0.4);
  font-style: italic;
}
</style>
