<template>
  <CtoonFilter :sort-options="myCollectionSortOptions" />
</template>

<script setup>
const myCollectionSortOptions = [
  { value: 'acquiredDate', label: 'Acquired Date' },
  { value: 'mintNumber',   label: 'Mint #'        },
  { value: 'name',         label: 'Name'          },
  { value: 'price',        label: 'Price'         },
  { value: 'rarity',       label: 'Rarity'        },
]

const filter = useNewSiteCtoonFilter()

// When switching to mint number sort, default to ascending
watch(() => filter.value.sortField, (newField) => {
  if (newField === 'mintNumber') {
    filter.value.sortAsc = true
  }
})
</script>
