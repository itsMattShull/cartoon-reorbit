<template>
  <Leaderboards />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Leaderboards',
  description: 'See the top players on Cartoon ReOrbit — points leaders, cToon collectors, and ReOrbit Match high scores.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()
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
