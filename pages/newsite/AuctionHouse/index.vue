<template>
  <AuctionHouse />
</template>

<script setup>
import { newSiteCtoonFilterDefaults } from '@/composables/useNewSiteCtoonFilter'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Auction House',
  description: 'Bid on rare and exclusive cToons in the Cartoon ReOrbit Auction House, or put your own cToons up for auction.'
})

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('AuctionHouseSidebar')

// The shared newSiteCtoonFilter state (cMoon, series, set, sort, ...) is also used by My
// Collection and cMart — both of those reset it to their own defaults on entry (see
// useNewSiteCtoonFilter.js), but this page never did, so a cMoon filter or a sort field like
// 'acquiredAt'/'releaseDate' left over from one of those pages silently carried over here:
// auctions stayed stuck filtered to one cMoon, or sorted in raw API order instead of "Ending
// Soon" (sortItems() has no case for those other pages' sort keys). Skip the reset only when
// returning from our own auction detail page, so a filter set here survives that round trip —
// same distinction useAuctionHouseListState.js already makes for tab/page/scroll position.
const filter = useNewSiteCtoonFilter()
const returningFromDetail = useAuctionHouseReturningFromDetail()
if (returningFromDetail.value) {
  returningFromDetail.value = false
} else {
  Object.assign(filter.value, newSiteCtoonFilterDefaults(), {
    sortField: 'endAsc',
  })
}
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

body.page-auctionhouse .sidebar { --sidebar-middle-height: 495px; }
</style>
