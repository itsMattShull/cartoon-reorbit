<template>
  <CtoonFilter :sort-options="myCollectionSortOptions" :source-ctoons="myCtoons" :show-exclude-second-editions="true" />
</template>

<script setup>
const myCtoons = useState('myCollectionCtoons', () => [])

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
