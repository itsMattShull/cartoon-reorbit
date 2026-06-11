<template>
  <AuctionHouse />
</template>

<script setup>
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
