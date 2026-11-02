<template>
  <p v-if="tab === 'packs'" class="mcs-note">
    Use the pack-type buttons above your packs to narrow the list. Tap a pack’s picture to see what’s inside and the odds.
  </p>
  <CtoonFilter
    v-else
    :sort-options="myCollectionSortOptions"
    :source-ctoons="myCtoons"
    :show-exclude-second-editions="true"
    :show-duplicates-only="true"
  />
</template>

<script setup>
const myCtoons = useState('myCollectionCtoons', () => [])
// Set by MyCollection.vue. The cToon filters mean nothing for sealed packs, so they are swapped for a hint.
const tab = useState('myCollectionTab', () => 'ctoons')

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

<style scoped>
.mcs-note { margin: 0; padding: 12px; font-size: 0.85rem; line-height: 1.45; color: #fff; }
</style>
