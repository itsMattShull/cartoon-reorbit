<template>
  <CMoonNav />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  title: 'cMoons',
  description: 'Browse and visit any cMoon on Cartoon ReOrbit.',
  // The fixed-chrome `.main-content` box is `overflow: hidden` by default (layouts/newsite-template.vue)
  // — a variable number of cMoons can push this grid past that fixed height, same reasoning as
  // pages/newsite/cmoon/[id].vue.
  mainContentScrollY: true,
})
</script>
