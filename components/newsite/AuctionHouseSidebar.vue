<template>
  <CtoonFilter
    :sort-options="auctionSortOptions"
    :show-sort-dir="false"
    :show-auction-filters="true"
  />
</template>

<script setup>
const auctionSortOptions = [
  { value: 'endAsc',    label: 'Ending Soon'    },
  { value: 'endNewest', label: 'End: Latest'     },
  { value: 'nameAsc',   label: 'Name A→Z'        },
  { value: 'nameDesc',  label: 'Name Z→A'        },
  { value: 'mintAsc',   label: 'Mint # ↑'        },
  { value: 'mintDesc',  label: 'Mint # ↓'        },
  { value: 'rarity',    label: 'Rarity'           },
  { value: 'priceAsc',  label: 'Price: Low→High' },
  { value: 'priceDesc', label: 'Price: High→Low' },
]
</script>
