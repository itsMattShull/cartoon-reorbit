<template>
  <CMoonPage />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  title: () => 'cMoon',
  description: () => 'Browse this cMoon on Cartoon ReOrbit.'
})
</script>
