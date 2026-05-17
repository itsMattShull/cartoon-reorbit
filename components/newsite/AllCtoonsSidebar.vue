<template>
  <CtoonFilter
    :sort-options="allCtoonsSortOptions"
    ctoons-state-key="allCtoonsCtoons"
  />
</template>

<script setup>
const allCtoonsSortOptions = [
  { value: 'name',        label: 'Name'         },
  { value: 'releaseDate', label: 'Release Date'  },
  { value: 'price',       label: 'Price'         },
  { value: 'rarity',      label: 'Rarity'        },
]
</script>
