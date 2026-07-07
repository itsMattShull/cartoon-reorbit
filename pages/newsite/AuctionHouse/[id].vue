<template>
  <AuctionDetails :auction-id="auctionId" @back="goBack" />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Auction House',
  description: 'View this auction on Cartoon ReOrbit and place your bid before time runs out.'
})

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('AuctionHouseSidebar')

const route  = useRoute()
const router = useRouter()
const auctionId = computed(() => route.params.id)

function goBack() {
  router.push('/newsite/AuctionHouse')
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

body.page-newsite-auctionhouse-id .sidebar { --sidebar-middle-height: 495px; }
</style>
