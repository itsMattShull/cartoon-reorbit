<template>
  <GetcToons />
</template>

<script setup>
definePageMeta({ showAdbar: true, showNav: true })
const sidebar = useSidebar()
sidebar.value = { middle: null, middleProps: {}, bottom: 'SidebarBottom' }
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
</style>
