<template>
  <MyAchievements />
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'My Achievements',
  description: 'Track your Cartoon ReOrbit achievements and the rewards you have unlocked.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()
</script>
