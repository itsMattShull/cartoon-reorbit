<template>
  <div v-if="cmartTab === 'ctoons'" class="cmart-sidebar-middle">
    <CtoonFilter
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
</style>
