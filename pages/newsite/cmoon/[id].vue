<template>
  <CMoonPage />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  title: () => 'cMoon',
  description: () => 'Browse this cMoon on Cartoon ReOrbit.',
  // Member/cToon lists can push this page's content past the fixed-chrome
  // main-content box, which clips by default (see mainContentScrollY in
  // layouts/newsite-template.vue).
  mainContentScrollY: true
})
</script>
