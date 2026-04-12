<template>
  <AuctionHouse />
</template>

<script setup>
definePageMeta({ showAdbar: true, showNav: true })

const auctionSortOptions = [
  { value: 'endAsc',    label: 'Ending Soon'     },
  { value: 'endNewest', label: 'End: Latest'      },
  { value: 'nameAsc',   label: 'Name A→Z'         },
  { value: 'nameDesc',  label: 'Name Z→A'         },
  { value: 'mintAsc',   label: 'Mint # ↑'         },
  { value: 'mintDesc',  label: 'Mint # ↓'         },
  { value: 'rarity',    label: 'Rarity'            },
  { value: 'priceAsc',  label: 'Price: Low→High'  },
  { value: 'priceDesc', label: 'Price: High→Low'  },
]

const sidebar = useSidebar()
sidebar.value = { middle: 'CtoonFilter', middleProps: { sortOptions: auctionSortOptions, showSortDir: false }, bottom: null }
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}

body.page-auctionhouse .sidebar-bottom { display: none; }
body.page-auctionhouse .sidebar { --sidebar-middle-height: 384px; }
</style>
