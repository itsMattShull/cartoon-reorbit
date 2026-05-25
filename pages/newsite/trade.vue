<template>
  <Trade />
  <CtoonInfoModal />
</template>

<script setup>
definePageMeta({ layout: 'newsite-template', middleware: ['auth', 'newsite'], showAdbar: true, showNav: true })

const { setSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('TradeSidebarWrapper')
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

body.page-newsite-trade .sidebar {
  --sidebar-middle-height: 490px;
}
</style>
