<template>
  <div class="cmart-sidebar-middle">
    <div class="cmart-tab-bar">
      <button
        class="cmart-tab"
        :class="{ active: cmartTab === 'ctoons' }"
        @click="cmartTab = 'ctoons'"
      >cToons</button>
      <button
        class="cmart-tab"
        :class="{ active: cmartTab === 'packs' }"
        @click="cmartTab = 'packs'"
      >Packs</button>
    </div>
    <CtoonFilter
      v-if="cmartTab === 'ctoons'"
      :show-hide-unavailable="true"
      :show-common-filters="true"
      :sort-options="cmartSortOptions"
    />
  </div>
</template>

<script setup>
const cmartTab = useState('newSiteCmartTab', () => 'ctoons')
const cmartSortOptions = [
  { value: 'releaseDate', label: 'Release Date' },
  { value: 'name',        label: 'Name'         },
  { value: 'price',       label: 'Price'        },
  { value: 'rarity',      label: 'Rarity'       },
]
</script>

<style scoped>
.cmart-sidebar-middle {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.cmart-tab-bar {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  width: 100%;
}

.cmart-tab {
  flex: 1;
  padding: 5px 4px;
  font-size: 0.75rem;
  font-weight: bold;
  font-family: inherit;
  color: rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.2);
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.cmart-tab:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.15);
}

.cmart-tab.active {
  color: #ffffff;
  background: rgba(0, 0, 0, 0.1);
  border-bottom-color: var(--OrbitLightBlue, #3399CC);
}
</style>
