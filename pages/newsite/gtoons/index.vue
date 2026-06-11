<template>
  <GtoonsHub />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'gToons Clash',
  description: 'Play gToons Clash, the head-to-head card battle game on Cartoon ReOrbit. Build decks from your cToons and battle other players.'
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
