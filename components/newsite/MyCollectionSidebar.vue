<template>
  <CtoonFilter :sort-options="myCollectionSortOptions" />
</template>

<script setup>
const myCollectionSortOptions = [
  { value: 'acquiredDate', label: 'Acquired Date' },
  { value: 'name',         label: 'Name'          },
  { value: 'price',        label: 'Price'         },
  { value: 'rarity',       label: 'Rarity'        },
]
</script>
